// 뜻 검수 — 화면에 뜨는 한국어 뜻이 맞는지 본다 (2026-09-24 사용자 요청 「검수를 원격으로」)
//
// 지금까지 검수는 로컬에서 TSV 로만 됐다. 「물리적으로 로컬에서만 검수를 하는게 쉽지는
// 않다」는 지적이 이 화면의 출발점이다.
//
// **새 전송 수단을 안 만든다.** 판정은 기존 `flag` 이벤트(`verdict` + 이번에 더한 `fix`)로
// 남고, Drive 동기화로 나가고, 도구가 `data/events/*.json` 에서 읽어 검수 TSV 로 옮긴다.
// `korean-class.json` 을 앱이 직접 고치지 않는다 — 사람이 한 번 보고 `apply` 를 돌린다
// (`build-event-worklist` 머리말이 세워 둔 원칙).
//
// **내가 만난 것만 낸다.** 앱은 품질 플래그를 모르고(빌드 자료다), 미검수가 10만 개라
// 늘어놓아 봐야 소용없다. 본 적 없는 뜻은 맞는지 판단할 수도 없다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { replay } from '../core/replay.ts'
import { recordMeaningVote } from '../core/session.ts'
import type { MeaningVerdict } from '../core/types.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBand4Idioms, loadBaseIdioms, type RuntimeIdiom } from '../dict/load.ts'

/** 한 화면에 내는 수. 검수는 몰아서 하는 일이라 넉넉히 두되 무한정은 아니다 */
const PAGE = 40

interface Row {
  it: RuntimeIdiom
  /** 이미 찍은 판정 */
  verdict: MeaningVerdict | null
  fix?: string
  /** 왜 목록에 올랐나 — 사람이 순서를 납득할 수 있어야 한다 */
  why: '담음' | '학습 중'
}

interface Loaded {
  rows: Row[]
  /** 미검수인데 아직 안 만난 것 수. 「여기까지가 내가 볼 수 있는 몫」을 알린다 */
  unseen: number
}

export function MeaningReview({ onBack }: { onBack: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  /** 화면에서 방금 찍은 것. 이벤트를 다시 재생하지 않고 여기서 갈아 끼운다 */
  const [local, setLocal] = useState<Map<string, { verdict: MeaningVerdict | null; fix?: string }>>(
    new Map(),
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [base, events] = await Promise.all([
          loadBaseIdioms(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const state = replay(events)

        // 담은 것 중 기본 사전 밖(밴드 4)이 있으면 그때만 20MB 를 받는다 — 세션 풀과 같은 관례
        const byId = new Map(base.map((it) => [it.idiomId, it]))
        const missing = [...state.starred].filter((id) => !byId.has(id))
        if (missing.length > 0) {
          const want = new Set(missing)
          for (const it of await loadBand4Idioms()) if (want.has(it.idiomId)) byId.set(it.idiomId, it)
          if (!alive) return
        }

        const seen = new Set<string>()
        for (const c of state.cards.values()) seen.add(c.idiomId)

        const rows: Row[] = []
        let unseen = 0
        for (const [id, it] of byId) {
          const def = it.koMeaning?.definition?.trim()
          // 뜻이 없으면 검수할 것이 없다. 검수가 끝난 것도 뺀다
          if (!def || it.koMeaning?.verified) continue
          const starred = state.starred.has(id)
          if (!starred && !seen.has(id)) {
            unseen++
            continue
          }
          const vote = state.meaningVotes.get(id)
          rows.push({
            it,
            verdict: vote?.verdict ?? null,
            ...(vote?.fix ? { fix: vote.fix } : {}),
            why: starred ? '담음' : '학습 중',
          })
        }
        // 아직 안 본 것 먼저, 그다음 담은 것, 그다음 표기순 — 할 일이 위로 온다
        rows.sort(
          (a, b) =>
            Number(a.verdict !== null) - Number(b.verdict !== null) ||
            Number(a.why === '학습 중') - Number(b.why === '학습 중') ||
            a.it.headword.localeCompare(b.it.headword),
        )
        setLoaded({ rows, unseen })
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // `useCallback` 으로 감싼다 — 안 그러면 린터가 `Date.now()` 를 렌더 중 호출로 본다
  const vote = useCallback((it: RuntimeIdiom, verdict: MeaningVerdict | null, fix?: string) => {
    setLocal((prev) => new Map(prev).set(it.idiomId, { verdict, ...(fix ? { fix } : {}) }))
    void appendEvent(
      db(),
      recordMeaningVote({
        idiomId: it.idiomId,
        verdict,
        definition: it.koMeaning?.definition ?? '',
        headword: it.headword,
        ...(fix ? { fix } : {}),
        ctx: { userId: LOCAL_USER_ID, deviceId: getDeviceId(), at: Date.now() },
      }),
    )
  }, [])

  const done = useMemo(() => {
    if (loaded === null) return 0
    return loaded.rows.filter((r) => (local.get(r.it.idiomId)?.verdict ?? r.verdict) !== null).length
  }, [loaded, local])

  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ←
        </button>
        <h2>뜻 검수</h2>
      </div>

      <div className="screen-body">
        {error !== null ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : loaded === null ? (
          <p className="empty">불러오고 있어요…</p>
        ) : loaded.rows.length === 0 ? (
          <p className="empty">
            아직 볼 게 없어요. 세션에서 만나거나 찾기에서 담은 표현의 뜻만 여기 올라와요.
          </p>
        ) : (
          <>
            <p className="stat-line">
              {done}/{loaded.rows.length}개 봄
              {loaded.unseen > 0 && (
                <span className="dim"> · 아직 안 만난 미검수 {loaded.unseen.toLocaleString('ko')}</span>
              )}
            </p>
            {/* 무엇을 남기는지 먼저 말한다 — 이 화면이 사전을 직접 고치는 것으로 보이면 안 된다 */}
            <p className="review-note">
              판정은 백업에 실려 나가고, 사전 빌드에서 반영돼요. 여기서 바로 사전이 바뀌지는
              않아요.
            </p>
            <ul className="review-list">
              {loaded.rows.slice(0, shown).map((r) => (
                <ReviewRow
                  key={r.it.idiomId}
                  row={r}
                  live={local.get(r.it.idiomId)}
                  onVote={(v, fix) => vote(r.it, v, fix)}
                />
              ))}
            </ul>
            {shown < loaded.rows.length && (
              <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
                더 보기 ({loaded.rows.length - shown}개 남음)
              </button>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ReviewRow({
  row,
  live,
  onVote,
}: {
  row: Row
  live?: { verdict: MeaningVerdict | null; fix?: string }
  onVote: (verdict: MeaningVerdict | null, fix?: string) => void
}) {
  const verdict = live?.verdict ?? row.verdict
  const savedFix = live?.fix ?? row.fix
  /** 고칠 것이 있으면 입력칸으로 받는다 (2026-09-24 사용자 제안) */
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(savedFix ?? row.it.koMeaning?.definition ?? '')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  return (
    <li className={`review-row${verdict !== null ? ' done' : ''}`}>
      <div className="review-head">
        <span className="r-main" lang="ja">
          {row.it.headword}
        </span>
        <span className="r-sub" lang="ja">
          {row.it.reading}
        </span>
        <span className="review-why dim">
          {row.why} · 밴드 {row.it.band}
        </span>
      </div>
      <p className="review-def">{row.it.koMeaning?.definition}</p>
      {savedFix && <p className="review-fix">고침: {savedFix}</p>}

      {editing ? (
        <div className="review-edit">
          <input
            ref={ref}
            className="search-input"
            value={draft}
            aria-label={`${row.it.headword} 고친 뜻`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="row">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onVote('bad', draft)
                setEditing(false)
              }}
            >
              고침 저장
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="review-acts">
          {/* 같은 판정을 다시 누르면 취소다 — 엄지와 같은 규칙 (마지막 이벤트가 이긴다) */}
          <button
            type="button"
            aria-pressed={verdict === 'ok'}
            onClick={() => onVote(verdict === 'ok' ? null : 'ok')}
          >
            맞아요
          </button>
          <button
            type="button"
            aria-pressed={verdict === 'bad' && !savedFix}
            onClick={() => onVote(verdict === 'bad' && !savedFix ? null : 'bad')}
          >
            애매해요
          </button>
          <button type="button" onClick={() => setEditing(true)}>
            고치기
          </button>
        </div>
      )}
    </li>
  )
}
