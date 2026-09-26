// 단어장 — 담아 둔 표현을 모아 두고 묶음·메모로 정리한다 (2026-09-25 사용자 요청)
//
// 「학습앱이 주는 것만 공부하는 것이 아니라 별도로 공부하는 것까지 끌어올 수 있다면
// 좋겠다」에서 나온 화면이다.
//
// **찾기의 「담아 둔 표현」과 다른 물건이다.** 저쪽은 대기열이라 세션에 한 번 나온 순간
// 목록에서 사라진다(`!started` 로 거른다). 책에서 모은 말을 쌓아 두려면 그러면 안 된다 —
// 여기서는 학습을 시작한 것도 상태를 달고 남는다.
//
// **새 저장소를 안 만든다.** 묶음과 메모는 `star` 이벤트의 선택 필드다. 옮기기·고치기도
// 새 `star` 이벤트고 마지막 것이 이긴다 — append-only 그대로다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { replay } from '../core/replay.ts'
import { recordStar } from '../core/session.ts'
import { DEFAULT_LIST } from '../core/types.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadCurrentList, saveCurrentList } from './currentList.ts'
import { adopt, loadWideDict, withWideKanji } from '../dict/wide.ts'
import { loadBand4Idioms, loadBaseIdioms, loadKanji, type KanjiInfo, type RuntimeIdiom } from '../dict/load.ts'

interface Row {
  it: RuntimeIdiom
  list: string
  memo?: string
  at: number
  /** 이미 카드가 생겼나. 담기의 소개 우선권은 여기서 끝나지만 단어장에는 남는다 */
  started: boolean
  wrong: number
}

export function Wordlist({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [kanji, setKanji] = useState<Map<string, KanjiInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(loadCurrentList)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [base, kj, events] = await Promise.all([
          loadBaseIdioms(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const state = replay(events)
        const byId = new Map(base.map((it) => [it.idiomId, it]))

        // 담은 것 중 기본 사전 밖(밴드 4)이 있으면 그때만 20MB 를 받는다 — 검수 화면과 같은 관례
        const missing = [...state.wordlist.keys()].filter((id) => !byId.has(id))
        let kanjiAll = kj
        if (missing.length > 0) {
          const want = new Set(missing)
          for (const it of await loadBand4Idioms()) if (want.has(it.idiomId)) byId.set(it.idiomId, it)
          if (!alive) return
          for (const id of [...want]) if (byId.has(id)) want.delete(id)

          // 밴드 4에도 없으면 넓힌 사전에서 들인 것이다 (2026-09-25).
          // 여기서 안 찾으면 담아 둔 줄이 단어장에서 **조용히 사라진다**
          if (want.size > 0) {
            const dict = await loadWideDict().catch(() => null)
            if (!alive) return
            if (dict !== null) {
              kanjiAll = withWideKanji(kj, dict)
              const look = (k: string) => {
                const r = kanjiAll.get(k)
                return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
              }
              for (const id of want) {
                const raw = dict.byId.get(id)
                const it = raw ? adopt(raw, look) : null
                if (it) byId.set(id, it)
              }
            }
          }
        }

        const out: Row[] = []
        for (const [id, meta] of state.wordlist) {
          const it = byId.get(id)
          if (!it) continue
          const card = state.cards.get(`${id}:reading`)
          out.push({
            it,
            list: meta.list,
            ...(meta.memo ? { memo: meta.memo } : {}),
            at: meta.at,
            started: card !== undefined,
            wrong: card?.wrong ?? 0,
          })
        }
        // 묶음 안에서는 담은 순서 그대로 — 책을 읽어 내려간 순서다
        out.sort((a, b) => a.list.localeCompare(b.list, 'ko') || a.at - b.at)
        setKanji(kanjiAll)
        setRows(out)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /** 담기 이벤트를 하나 더 쌓는다. 화면은 재생을 다시 안 돌리고 그 줄만 갈아 끼운다 */
  const write = useCallback(
    (row: Row, next: { on: boolean; list?: string; memo?: string }) => {
      setRows((prev) =>
        prev === null
          ? prev
          : next.on
            ? prev.map((r) =>
                r.it.idiomId === row.it.idiomId
                  ? {
                      ...r,
                      list: next.list ?? r.list,
                      ...(next.memo?.trim() ? { memo: next.memo.trim() } : { memo: undefined }),
                    }
                  : r,
              )
            : prev.filter((r) => r.it.idiomId !== row.it.idiomId),
      )
      void appendEvent(
        db(),
        recordStar({
          idiomId: row.it.idiomId,
          on: next.on,
          ...(next.list ?? row.list ? { list: next.list ?? row.list } : {}),
          ...(next.memo !== undefined ? { memo: next.memo } : row.memo ? { memo: row.memo } : {}),
          ctx: { userId: LOCAL_USER_ID, deviceId: getDeviceId(), at: Date.now() },
        }),
      )
    },
    [],
  )

  /** 묶음 이름 목록 — 지금 쓰는 것 + 기본. 비어 있어도 기본은 늘 있다 */
  const lists = useMemo(() => {
    const names = new Set<string>([DEFAULT_LIST, current])
    for (const r of rows ?? []) names.add(r.list)
    return [...names].sort((a, b) =>
      a === DEFAULT_LIST ? -1 : b === DEFAULT_LIST ? 1 : a.localeCompare(b, 'ko'),
    )
  }, [rows, current])

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows ?? []) {
      let list = map.get(r.list)
      if (list === undefined) map.set(r.list, (list = []))
      list.push(r)
    }
    return [...map].sort(([a], [b]) =>
      a === DEFAULT_LIST ? -1 : b === DEFAULT_LIST ? 1 : a.localeCompare(b, 'ko'),
    )
  }, [rows])

  const pickList = (name: string) => {
    setCurrent(name)
    saveCurrentList(name)
  }

  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ←
        </button>
        <h2>단어장</h2>
      </div>

      <div className="screen-body">
        {error !== null ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : rows === null ? (
          <p className="empty">불러오고 있어요…</p>
        ) : (
          <>
            {/* 담을 때마다 묶음을 고르게 하면 한 번 누를 일이 두 번이 된다.
                지금 담는 묶음을 여기서 정해 두고, 찾기의 + 는 그대로 한 번이다 */}
            <CurrentPicker lists={lists} current={current} onPick={pickList} />

            {rows.length === 0 ? (
              <p className="empty">아직 담은 표현이 없어요. 찾기에서 + 를 누르면 여기 쌓여요.</p>
            ) : (
              grouped.map(([name, items]) => (
                <div key={name} className="wl-group">
                  <p className="section-title">
                    {name}
                    <span className="dim"> · {items.length}</span>
                  </p>
                  <ul className="review-list">
                    {items.map((r) => (
                      <WordRow
                        key={r.it.idiomId}
                        row={r}
                        kanji={kanji}
                        lists={lists}
                        onWrite={(next) => write(r, next)}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** 지금 담는 묶음 고르기 + 새로 만들기 */
function CurrentPicker({
  lists,
  current,
  onPick,
}: {
  lists: string[]
  current: string
  onPick: (name: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  if (adding) {
    return (
      <div className="wl-current wl-new">
        <input
          className="search-input"
          value={draft}
          autoFocus
          aria-label="새 묶음 이름"
          placeholder="묶음 이름 (예: 소설 제목)"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row">
          <button
            type="button"
            className="btn-primary"
            disabled={draft.trim() === ''}
            onClick={() => {
              onPick(draft.trim())
              setDraft('')
              setAdding(false)
            }}
          >
            만들기
          </button>
          <button type="button" className="btn" onClick={() => setAdding(false)}>
            취소
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="wl-current">
      <span className="dim">지금 담는 묶음</span>
      <div className="wl-chips">
        {lists.map((name) => (
          <button
            key={name}
            type="button"
            className={`chip${name === current ? ' on' : ''}`}
            aria-pressed={name === current}
            onClick={() => onPick(name)}
          >
            {name}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setAdding(true)}>
          + 새 묶음
        </button>
      </div>
    </div>
  )
}

function WordRow({
  row,
  kanji,
  lists,
  onWrite,
}: {
  row: Row
  kanji: Map<string, KanjiInfo>
  lists: string[]
  onWrite: (next: { on: boolean; list?: string; memo?: string }) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.memo ?? '')
  const ko = [...row.it.headword].map((c) => kanji.get(c)?.kr[0] ?? '—').join('')

  return (
    <li className="review-row">
      <div className="review-head">
        <span className="r-main" lang="ja">
          {row.it.headword}
        </span>
        <span className="r-sub" lang="ja">
          {row.it.reading}
        </span>
        <span className="dim"> {ko}</span>
        {/* 학습 중인 것도 남는다 — 여기가 대기열이 아니라는 표시이기도 하다 */}
        <span className="wl-state dim">
          {row.started ? (row.wrong > 0 ? `학습 중 · ✗ ${row.wrong}회` : '학습 중') : '아직 안 나옴'}
        </span>
      </div>
      {row.it.koMeaning?.definition && <p className="review-def">{row.it.koMeaning.definition}</p>}
      {row.memo && !editing && <p className="wl-memo">메모: {row.memo}</p>}

      {editing ? (
        <div className="review-edit">
          <input
            className="search-input"
            value={draft}
            autoFocus
            aria-label={`${row.it.headword} 메모`}
            placeholder="왜 담았는지 (예: 3장 첫 문단)"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onWrite({ on: true, memo: draft })
                setEditing(false)
              }}
            >
              저장
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="review-acts">
          <button type="button" onClick={() => setEditing(true)}>
            {row.memo ? '메모 고치기' : '메모'}
          </button>
          <label className="wl-move">
            <span className="sr-only">{row.it.headword} 묶음 옮기기</span>
            <select
              value={row.list}
              onChange={(e) => onWrite({ on: true, list: e.target.value })}
            >
              {lists.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => onWrite({ on: false })}>
            빼기
          </button>
        </div>
      )}
    </li>
  )
}
