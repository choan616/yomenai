// 읽기로 찾기 — 히라가나(또는 로마자)로 한자 표기를 찾는다 (2026-09-16).
//
// **채점은 여전히 여기서 안 한다.** 답을 본 직후에 그 숙어를 바로 문제로 내면 정답이
// 잡음으로 쌓여 리포트 정답률이 흔들린다 — 「지금 풀어보기」는 계속 기각 상태다
// (context-notes 2026-09-16).
//
// 대신 **담아 두기**가 있다 (2026-09-21 사용자 요청). 담은 표현은 다음 세션에 소개로
// 먼저 나온다 — 시험이 아니라 보여주는 자리라 위 문제를 안 만든다. `star` 이벤트 하나만
// 남고 FSRS 는 그대로다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { toKana } from 'wanakana'
import { RomajiKeypad } from '../study/RomajiKeypad.tsx'
import { useCoarsePointer } from '../study/useCoarsePointer.ts'
import { dataVersion } from '../core/dataVersion.ts'
import { replay } from '../core/replay.ts'
import { recordStar } from '../core/session.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji, type KanjiInfo, type RuntimeIdiom } from '../dict/load.ts'
import type { CameraFound } from './CameraFind.tsx'
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
  /** 담아 둔 목록을 그리려면 id 만으로 표기·읽기를 찾을 수 있어야 한다 */
  byId: Map<string, RuntimeIdiom>
  /** 표기 → id. 카메라 후보는 표기로 오므로 되짚을 길이 있어야 한다 (2026-09-23) */
  idOfHead: Map<string, string>
  /** 이미 카드가 생긴 숙어 — 담겨 있어도 별이 할 일이 끝난 것들이다 (`select.ts` 와 같은 기준) */
  started: Set<string>
}

/**
 * 표기의 한국 한자음. 한자마다 대표음 하나씩 이어 붙인다.
 * 자료에 음이 없는 글자(々, 일부 신자체)는 `—` 로 둔다 — 오답 상세와 같은 표기다.
 */
function koreanOf(headword: string, kanji: Map<string, KanjiInfo>): string {
  return [...headword].map((c) => kanji.get(c)?.kr[0] ?? '—').join('')
}

/**
 * 마지막으로 만든 인덱스·집계 (2026-09-21). 탭을 옮기면 언마운트되는데, 다시 들어올 때마다
 * `listEvents` → `replay` 를 처음부터 돌면 검색창 아래 글자가 한 박자 늦게 뜬다
 * (사용자 지적). `Home`·`Report` 와 같은 관례다 — 담기/빼기도 이벤트라 버전이 올라
 * 자동으로 버려진다.
 */
let cache: { version: number; loaded: Loaded; starred: Set<string> } | null = null

export function Search({
  onCamera,
  found,
  onUsedFound,
}: {
  /** 카메라로 찾기로 한 겹 들어간다 (2026-09-23) */
  onCamera: () => void
  /** 카메라가 찾아낸 것. 없으면 `null` */
  found: CameraFound | null
  /** 받아서 썼다고 알린다 — 다시 들어올 때 옛 결과가 남아 있으면 안 된다 */
  onUsedFound: () => void
}) {
  const [raw, setRaw] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(
    () => (cache?.version === dataVersion() ? cache.loaded : null),
  )
  const [error, setError] = useState<string | null>(null)
  /**
   * 담아 둔 숙어. 이벤트를 다시 재생하지 않고 화면에서 바로 갈아 끼운다 —
   * 로그는 append-only 라 한 건 덧붙인 결과가 곧 이 집합의 한 칸 변화다
   */
  const [starred, setStarred] = useState<Set<string>>(
    () => (cache?.version === dataVersion() ? cache.starred : new Set()),
  )

  const toggleStar = (idiomId: string) => {
    const on = !starred.has(idiomId)
    setStarred((prev) => {
      const next = new Set(prev)
      if (on) next.add(idiomId)
      else next.delete(idiomId)
      return next
    })
    void appendEvent(
      db(),
      recordStar({
        idiomId,
        on,
        ctx: { userId: LOCAL_USER_ID, deviceId: getDeviceId(), at: Date.now() },
      }),
    )
  }

  useEffect(() => {
    if (cache?.version === dataVersion()) return
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
        const started = new Set<string>()
        for (const c of state.cards.values()) {
          if (c.cardType === 'reading' && c.wrong > 0) wrong.set(c.idiomId, c.wrong)
          started.add(c.idiomId)
        }
        const next: Loaded = {
          index, kanji, poolSize: pool.length, wrong, started,
          byId: new Map(pool.map((it) => [it.idiomId, it])),
          idOfHead: new Map(pool.map((it): [string, string] => [it.headword, it.idiomId]).reverse()),
        }
        cache = { version: dataVersion(), loaded: next, starred: state.starred }
        setLoaded(next)
        setStarred(state.starred)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /**
   * 카메라가 찾아낸 것을 받는다 (결정 9). **정확히 걸렸으면 입력란을 대신 채운다** —
   * 그러면 기존 검색이 그대로 돌아 결과가 뜬다. 카메라는 키보드를 대신하는 입력
   * 수단이지 새 화면 계통이 아니다. 확실치 않으면 후보를 아래에 나열한다.
   *
   * 효과가 아니라 **렌더 중에 맞춘다.** 효과로 두면 한 번 그린 뒤 다시 그려서 빈 칸이
   * 한 박자 비친다 — prop 이 바뀔 때 상태를 맞추는 React 권장 형태다
   */
  const [seen, setSeen] = useState<CameraFound | null>(null)
  if (found !== null && found !== seen) {
    setSeen(found)
    setRaw(found.fill ?? '')
  }

  const groups = useMemo(
    () => (loaded === null ? [] : searchByReading(loaded.index, raw, GROUP_LIMIT)),
    [loaded, raw],
  )

  const typed = raw.trim() !== ''
  /** 자판을 띄울지 — 입력창을 누른 뒤에만 뜬다 */
  const [typing, setTyping] = useState(false)
  const keypad = useCoarsePointer()
  const ref = useRef<HTMLInputElement>(null)

  return (
    <section className="screen">
      <div className="screen-bar">
        <h2>읽기로 찾기</h2>
      </div>

      <div className={`screen-body${keypad && typing ? ' with-keypad' : ''}`}>
        <div className="search-row">
        <input
          className="search-input"
          type="text"
          /* KanaInput 과 같은 처방 — 일본어 IME 후보 바를 막고 ASCII 키보드를 띄운다.
             그쪽은 채점 제출용이라 재사용하지 않는다. 변환도 bind 가 아니라 toKana 다 —
             입력마다 결과를 다시 그려야 해서 값이 React state 에 있어야 한다 (context-notes) */
          ref={ref}
          lang="en"
          name="reading-search"
          /* 자체 자판을 띄우는 기기에서는 시스템 키보드를 막는다 — 세션 화면과 같은 이유다
             (iOS 가 마지막에 쓴 키보드를 기억해 한글 자판이 먼저 뜬다, 2026-09-19) */
          inputMode={keypad ? 'none' : 'url'}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="읽는 법 (히라가나 · 로마자)"
          aria-label="읽기 검색"
          value={raw}
          onChange={(e) => setRaw(toKana(e.target.value, { IMEMode: 'toHiragana' }))}
          onFocus={() => setTyping(true)}
        />
        {/* 읽는 법을 모를 때 쓰는 입력 수단이다. 검색창 **옆**에 두는 이유가 그것이다 —
            둘 다 같은 질문("이 단어가 뭐냐")에 답하는 길이다 */}
        <button type="button" className="cam-open" onClick={onCamera} aria-label="카메라로 찾기">
          <span aria-hidden="true">📷</span>
        </button>
        </div>
        {/* 자판은 **입력창을 눌렀을 때만** 뜬다. 찾기는 결과 목록이 주인공이라
            자판이 늘 떠 있으면 화면을 절반 먹는다 (2026-09-19) */}
        {keypad && typing && (
          <RomajiKeypad
            onKey={(ch) => setRaw((v) => toKana(v + ch, { IMEMode: 'toHiragana' }))}
            onBackspace={() => setRaw((v) => [...v].slice(0, -1).join(''))}
            onSubmit={() => {
              setTyping(false)
              ref.current?.blur()
            }}
            submitLabel="닫기"
            docked
          />
        )}

        {error !== null ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : loaded === null ? (
          <p className="empty">불러오고 있어요…</p>
        ) : !typed ? (
          <>
            {found !== null && found.fill === null && (
              <CameraCandidates
                found={found}
                loaded={loaded}
                starred={starred}
                onToggle={toggleStar}
                onClose={onUsedFound}
              />
            )}
            <Basket loaded={loaded} starred={starred} onToggle={toggleStar} />
            <Scope poolSize={loaded.poolSize} />
          </>
        ) : groups.length === 0 ? (
          <>
            <p className="empty">
              <b lang="ja">{raw}</b> 로 읽히는 숙어가 없어요.
            </p>
            <Scope poolSize={loaded.poolSize} />
          </>
        ) : (
          groups.map((g) => (
            <Group
              key={g.reading}
              group={g}
              loaded={loaded}
              starred={starred}
              onToggle={toggleStar}
            />
          ))
        )}
      </div>
    </section>
  )
}

/**
 * 담아 둔 표현 (2026-09-21). 안 쳤을 때만 보인다 — 찾는 중에는 결과가 주인공이다.
 * **이미 카드가 생긴 것은 빼고 보여준다.** 별이 하는 일은 신규 도입 우선권까지라
 * 한 번 나온 뒤로는 목록에 남아 있어도 아무 일도 안 한다 (`select.ts` 와 같은 기준).
 */
function Basket({
  loaded,
  starred,
  onToggle,
}: {
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  const waiting = [...starred].filter((id) => !loaded.started.has(id) && loaded.byId.has(id))
  if (waiting.length === 0) return null

  return (
    <div className="basket">
      <p className="section-title">
        담아 둔 표현<span className="dim"> · {waiting.length}</span>
      </p>
      <IdiomRows ids={waiting} loaded={loaded} starred={starred} onToggle={onToggle} />
      <p className="basket-note">다음 세션에 소개로 먼저 나와요.</p>
    </div>
  )
}

/**
 * 담기·빼기 한 버튼 (2026-09-21 사용자 요청으로 ☆ → +).
 * 색만으로 구분하지 않는다 (PLAN §7) — 기호 자체가 + 와 − 로 바뀐다.
 */
/**
 * 표기·읽기·뜻·담기 한 줄씩. **담아 둔 목록과 카메라 후보가 같은 모양을 쓴다** —
 * 카메라는 입력 수단이 하나 느는 것이지 새 카드 계통이 아니다 (2026-09-23 결정 9).
 *
 * 읽기를 같이 내는 게 핵심이다. 검색 결과(`Group`)는 읽기로 찾은 것이라 한국 한자음을
 * 내는데, 여기 오는 사람은 **읽는 법을 몰라서** 왔다
 */
function IdiomRows({
  ids,
  loaded,
  starred,
  onToggle,
}: {
  ids: readonly string[]
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  return (
    <ul className="rows">
      {ids.map((id) => {
        const it = loaded.byId.get(id)
        if (it === undefined) return null
        return (
          <li key={id}>
            <span className="r-main" lang="ja">
              {it.headword}
            </span>
            <span className="r-sub" lang="ja">
              {it.reading}
            </span>
            <span className="r-sub r-meaning">{it.koMeaning?.definition ?? ''}</span>
            {loaded.started.has(id) ? (
              <span className="star-slot dim">학습 중</span>
            ) : (
              <StarButton
                headword={it.headword}
                on={starred.has(id)}
                onToggle={() => onToggle(id)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 카메라가 확실치 않을 때 내는 후보 (2026-09-23 결정 6·9).
 *
 * **단정하지 않는다.** 오답이 `軍艦→軍朋` 처럼 한 자만 틀리는 꼴이라 되살릴 여지가
 * 큰데, 읽기를 배우는 앱에서 틀린 단어를 맞다고 하면 그게 곧 오학습이다. 무엇으로
 * 읽혔는지를 같이 보여 주고 고르는 것은 사용자에게 맡긴다
 */
function CameraCandidates({
  found,
  loaded,
  starred,
  onToggle,
  onClose,
}: {
  found: CameraFound
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
  onClose: () => void
}) {
  const ids = found.candidates
    .map((head) => loaded.idOfHead.get(head))
    .filter((id): id is string => id !== undefined)
  if (ids.length === 0) return null

  return (
    <div className="cam-candidates">
      <p className="section-title">
        카메라로 찾은 후보<span className="dim"> · {ids.length}</span>
      </p>
      <p className="cam-raw">
        <span lang="ja">{found.raw}</span> 로 읽혔어요. 아래 중에 있으면 골라 주세요.
      </p>
      <IdiomRows ids={ids} loaded={loaded} starred={starred} onToggle={onToggle} />
      <button type="button" className="link cam-close" onClick={onClose}>
        닫기
      </button>
    </div>
  )
}

function StarButton({
  headword,
  on,
  onToggle,
}: {
  headword: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`star-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={`${headword} ${on ? '빼기' : '담기'}`}
      onClick={onToggle}
    >
      {on ? '−' : '+'}
    </button>
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

function Group({
  group,
  loaded,
  starred,
  onToggle,
}: {
  group: ReadingGroup
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
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
            {/* 이미 카드가 생긴 숙어에는 담기를 안 낸다 — 담아도 아무 일이 안 일어난다.
                빈칸으로 두면 "왜 이 줄만 없지"가 되므로 그 자리에 이유를 적는다 */}
            {loaded.started.has(it.idiomId) ? (
              <span className="star-slot dim">학습 중</span>
            ) : (
              <StarButton
                headword={it.headword}
                on={starred.has(it.idiomId)}
                onToggle={() => onToggle(it.idiomId)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
