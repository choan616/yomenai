// 읽기로 찾기 — 히라가나(또는 로마자)로 한자 표기를 찾는다. 보기만 하는 화면이다 (2026-09-16).
//
// **이벤트도 FSRS 도 안 건드린다.** 답을 본 직후에 그 숙어를 바로 문제로 내면 정답이
// 잡음으로 쌓여 리포트 정답률이 흔들린다 — 사용자 판단으로 「지금 풀어보기」·「찜하기」를
// 기각했다 (context-notes 2026-09-16). 무게는 다시보기(`Browse`)와 같다.
import { useEffect, useMemo, useState } from 'react'
import { toKana } from 'wanakana'
import { replay } from '../core/replay.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji, type KanjiInfo } from '../dict/load.ts'
import {
  loadReadingIndex,
  searchByReading,
  type ReadingGroup,
  type ReadingIndex,
} from '../dict/readingIndex.ts'

/** 한 화면에 낼 묶음 수. 앞부분 일치는 금방 불어난다 (`こう` 로만 쳐도 수백 개) */
const GROUP_LIMIT = 20

interface Loaded {
  index: ReadingIndex
  kanji: Map<string, KanjiInfo>
  poolSize: number
  /** idiomId → 읽기 카드 오답 수. 0 인 숙어는 안 담는다 */
  wrong: Map<string, number>
}

/**
 * 표기의 한국 한자음. 한자마다 대표음 하나씩 이어 붙인다.
 * 자료에 음이 없는 글자(々, 일부 신자체)는 `—` 로 둔다 — 오답 상세와 같은 표기다.
 */
function koreanOf(headword: string, kanji: Map<string, KanjiInfo>): string {
  return [...headword].map((c) => kanji.get(c)?.kr[0] ?? '—').join('')
}

export function Search({ onBack }: { onBack: () => void }) {
  const [raw, setRaw] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [index, kanji, pool, events] = await Promise.all([
          loadReadingIndex(),
          loadKanji(),
          loadBaseIdioms(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const state = replay(events)
        const wrong = new Map<string, number>()
        for (const c of state.cards.values()) {
          if (c.cardType === 'reading' && c.wrong > 0) wrong.set(c.idiomId, c.wrong)
        }
        setLoaded({ index, kanji, poolSize: pool.length, wrong })
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const groups = useMemo(
    () => (loaded === null ? [] : searchByReading(loaded.index, raw, GROUP_LIMIT)),
    [loaded, raw],
  )

  const typed = raw.trim() !== ''

  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <h2>읽기로 찾기</h2>
      </div>

      <div className="screen-body">
        <input
          className="search-input"
          type="text"
          /* KanaInput 과 같은 처방 — 일본어 IME 후보 바를 막고 ASCII 키보드를 띄운다.
             그쪽은 채점 제출용이라 재사용하지 않는다. 변환도 bind 가 아니라 toKana 다 —
             입력마다 결과를 다시 그려야 해서 값이 React state 에 있어야 한다 (context-notes) */
          lang="en"
          name="reading-search"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="읽는 법 (히라가나 · 로마자)"
          aria-label="읽기 검색"
          value={raw}
          onChange={(e) => setRaw(toKana(e.target.value, { IMEMode: 'toHiragana' }))}
        />

        {error !== null ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : loaded === null ? (
          <p className="empty">불러오고 있어요…</p>
        ) : !typed ? (
          <Scope poolSize={loaded.poolSize} />
        ) : groups.length === 0 ? (
          <>
            <p className="empty">
              <b lang="ja">{raw}</b> 로 읽히는 숙어가 없어요.
            </p>
            <Scope poolSize={loaded.poolSize} />
          </>
        ) : (
          groups.map((g) => (
            <Group key={g.reading} group={g} loaded={loaded} />
          ))
        )}
      </div>
    </section>
  )
}

/** 찾을 수 있는 범위. 검색창은 "아무거나 찾아도 된다"고 약속하는 물건이라 경계를 적어 둔다 */
function Scope({ poolSize }: { poolSize: number }) {
  return (
    <p className="search-scope">
      한자 숙어 <b>{poolSize.toLocaleString('ko')}</b>개에서 찾아요.
      <br />
      동사·형용사와 가나로 쓰는 말은 이 앱이 다루지 않아 나오지 않아요.
    </p>
  )
}

function Group({ group, loaded }: { group: ReadingGroup; loaded: Loaded }) {
  const { reading, items } = group
  const ko = items.map((it) => koreanOf(it.headword, loaded.kanji))
  // 한국 한자음까지 겹치는 줄 — 한국어 지식으로는 못 가르는 구간이라 그 자체가 정보다
  const dup = new Set(ko.filter((k, i) => ko.indexOf(k) !== i))

  return (
    <div className="hit-group">
      {/* 친 것과 정확히 같은 읽기는 진하게 — 앞부분 일치가 길게 붙으면 가나가 서로 닮아 묻힌다 */}
      <p className={group.exact ? 'section-title exact' : 'section-title'}>
        <span lang="ja">{reading}</span>
        <span className="dim"> · {items.length}</span>
      </p>
      <ul className="rows">
        {items.map((it, i) => (
          <li key={it.idiomId}>
            <span className="r-main" lang="ja">
              {it.headword}
            </span>
            <span className="r-sub">
              {ko[i]}
              {dup.has(ko[i]!) && (
                <span className="kr-dup" title="한국 한자음이 같아요">
                  {' '}
                  ⚠
                </span>
              )}
            </span>
            <span className="r-sub r-meaning">{it.koMeaning?.definition ?? ''}</span>
            {loaded.wrong.has(it.idiomId) && (
              <span className="r-tail">✗ {loaded.wrong.get(it.idiomId)}회</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
