// 진단 리포트 화면 — 수준, 다음에 볼 것, 훑어보기, 오답 유형 분포, 한국음 간섭, 취약 음독. 이 앱의 얼굴이다 (PLAN §7)
import { useEffect, useState } from 'react'
import { buildLevel, type BandRow, type LevelProfile } from '../core/level.ts'
import { prescribe, type Prescription } from '../core/prescription.ts'
import { replay } from '../core/replay.ts'
import { buildReport, type FrequentIdiom, type Report as ReportData } from '../core/report.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadExamples, loadPairs } from '../dict/load.ts'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { BAND_NOTE } from '../lib/bands.ts'
import { MISTAKE_ADVICE, MISTAKE_LABEL } from '../study/mistakeLabels.ts'
import { tts } from '../study/tts.ts'

interface Loaded {
  report: ReportData
  level: LevelProfile
  prescriptions: Prescription[]
  /** 훑어보기가 쓰는 숙어별 한국어 뜻. 없는 숙어도 있다 */
  meanings: Map<string, string>
}

export function Report({
  onBack,
  onFocus,
}: {
  onBack: () => void
  /** 처방의 음독을 그 자리에서 집중 세션으로 (Phase 10) */
  onFocus: (pairId: string) => void
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, pairs, index, events] = await Promise.all([
          loadBaseIdioms(),
          loadPairs(),
          loadPairIndex(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
        const report = buildReport(state, pairs, (id) => {
          const it = byId.get(id)
          return it ? { headword: it.headword, reading: it.reading } : undefined
        })
        const level = buildLevel(events, (id) => byId.get(id)?.band)
        const meanings = new Map<string, string>()
        for (const f of report.frequent) {
          const def = byId.get(f.id)?.koMeaning?.definition?.trim()
          if (def) meanings.set(f.id, def)
        }
        setData({
          report,
          level,
          meanings,
          prescriptions: prescribe({
            report,
            level,
            unlocksOf: (pairId) => index.get(pairId)?.length ?? 0,
          }),
        })
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="screen report">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <h2>진단 리포트</h2>
      </div>

      <div className="screen-body">
        {error ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : !data ? (
          <p className="empty">불러오고 있어요…</p>
        ) : data.report.totalReviews === 0 ? (
          <p className="empty">
            아직 볼 기록이 없어요.
            <br />
            세션을 마치면 오답 패턴이 여기 쌓여요.
          </p>
        ) : (
          <ReportBody data={data} onFocus={onFocus} />
        )}
      </div>
    </section>
  )
}

/**
 * 훑어보기 — 자주 틀린 숙어를 채점 없이 다시 본다 (사용자 요청 2026-09-12).
 * 세션이 전부 출제·채점 루프라 쉬어 가는 자리가 없었다. 여기선 이벤트를 쓰지 않는다.
 */
function BrowseSection({ rows, meanings }: { rows: FrequentIdiom[]; meanings: Map<string, string> }) {
  const [open, setOpen] = useState<string | null>(null)
  const [examples, setExamples] = useState<Map<string, string[]> | null>(null)

  // 예문은 큰 번들이라 처음 펼칠 때 부른다 — 리포트 첫 그림을 늦추지 않는다
  useEffect(() => {
    if (open === null || examples !== null) return
    let alive = true
    void loadExamples().then((m) => {
      if (alive) setExamples(m)
    })
    return () => {
      alive = false
    }
  }, [open, examples])

  if (rows.length === 0) return null

  return (
    <section className="browse">
      <p className="section-title">훑어보기</p>
      <p className="browse-lead">자주 틀린 것들이에요. 문제는 안 나와요 — 눌러서 보기만 하세요.</p>
      <ul className="rows">
        {rows.map((r) => {
          const isOpen = open === r.id
          const sentences = examples?.get(r.id) ?? []
          return (
            <li key={r.id} className={isOpen ? 'browse-row is-open' : 'browse-row'}>
              <button
                type="button"
                className="browse-head"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.id)}
              >
                <span className="r-main" lang="ja">
                  {r.headword}
                </span>
                <span className="r-tail dim">{r.wrong}회 틀림</span>
              </button>
              {isOpen && (
                <div className="browse-body">
                  <p className="browse-reading" lang="ja">
                    {r.reading}
                  </p>
                  {meanings.get(r.id) && <p className="browse-meaning">{meanings.get(r.id)}</p>}
                  {tts.available && (
                    <button type="button" className="tts-btn" onClick={() => tts.speak(r.reading)}>
                      <span aria-hidden="true">🔊</span> 소리 듣기
                    </button>
                  )}
                  {sentences.slice(0, 2).map((sentence) => (
                    <p className="browse-ex" lang="ja" key={sentence}>
                      {sentence}
                    </p>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ReportBody({ data, onFocus }: { data: Loaded; onFocus: (pairId: string) => void }) {
  const { report, level, prescriptions } = data
  // 정답률은 *실제* 오답으로 센다. 분류된 오답만 쓰면 미분류분이 정답으로 둔갑한다
  const accuracy =
    report.totalReviews > 0
      ? Math.round(((report.totalReviews - report.totalWrong) / report.totalReviews) * 100)
      : 100
  const maxCount = Math.max(1, ...report.mistakes.map((m) => m.count))

  return (
    <>
      <LevelSection level={level} reviews={report.totalReviews} accuracy={accuracy} />

      <section className="rx">
        <p className="section-title">다음에 볼 것</p>
        {prescriptions.length === 0 ? (
          <p className="empty">지금은 특별히 짚을 게 없어요. 하던 대로 가면 돼요.</p>
        ) : (
          <ol className="rx-list">
            {prescriptions.map((p, i) => (
              <li key={rxKey(p)} style={{ '--i': i } as React.CSSProperties}>
                <span className="rx-num" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="rx-body">
                  <RxItem p={p} onFocus={onFocus} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <BrowseSection rows={report.frequent} meanings={data.meanings} />

      <section>
        <p className="section-title">오답 유형 분포</p>
        {report.mistakes.length === 0 ? (
          <p className="empty">
            {report.totalWrong === 0 ? '오답이 없어요.' : '유형이 붙은 오답이 없어요.'}
          </p>
        ) : (
          <div className="bars">
            {report.mistakes.map((m, i) => (
              <div className="bar-row" key={m.type} style={{ '--i': i } as React.CSSProperties}>
                <span>{MISTAKE_LABEL[m.type]}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(m.count / maxCount) * 100}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="bar-num">{m.count}</span>
              </div>
            ))}
          </div>
        )}
        {report.unclassified > 0 && (
          <p className="unclassified">
            유형을 못 붙인 오답 <b>{report.unclassified}</b>회
            <span className="dim"> · 6종 어디에도 안 맞아 분포에서 빠졌어요</span>
          </p>
        )}
      </section>

      <section className="ko-callout">
        <p className="section-title">한국음 간섭</p>
        <p className="ko-big">
          <b>{report.koInterferenceCount}</b>
          <span className="dim"> 회 — 한국 한자음에 이끌린 오답</span>
        </p>
        {report.koInterferenceIdioms.length === 0 ? (
          <p className="dim">해당 숙어가 아직 없어요.</p>
        ) : (
          <ul className="rows">
            {report.koInterferenceIdioms.map((it, i) => (
              <li key={it.id} style={{ '--i': i } as React.CSSProperties}>
                <span className="r-main" lang="ja">
                  {it.headword}
                </span>
                <span className="r-sub r-ja" lang="ja">
                  {it.reading}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="section-title">취약 음독</p>
        {report.weakOnyomi.length === 0 ? (
          <p className="empty">오답률이 높은 음독이 아직 없어요.</p>
        ) : (
          <ul className="rows">
            {report.weakOnyomi.map((w, i) => (
              <li key={w.pairId} style={{ '--i': i } as React.CSSProperties}>
                <span className="st learning" aria-hidden="true">
                  ◐
                </span>
                <span className="r-main" lang="ja">
                  {w.kanji}
                </span>
                <span className="r-sub r-ja" lang="ja">
                  {w.base}
                </span>
                <span className="r-sub">{w.kind === 'on' ? '음' : '훈'}</span>
                <span className="r-tail">
                  {Math.round(w.rate * 100)}% · {w.wrong}/{w.seen}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/* ── 수준 ─────────────────────────────────────────────────────────
   "내가 어디쯤인가"를 밴드 사다리 하나로 답한다. 경계선이 이 화면의 핵심 도형이다. */

const BAND_STATUS_LABEL: Record<BandRow['status'], string> = {
  solid: '안정',
  shaky: '흔들림',
  thin: '표본 부족',
  unseen: '미학습',
}

function levelHeadline(level: LevelProfile): string {
  const { solidThrough, edge } = level
  if (edge !== null && solidThrough !== null) {
    return `밴드 ${solidThrough}까지 안정, 밴드 ${edge}가 경계예요`
  }
  if (edge !== null) return `밴드 ${edge}부터 흔들려요`
  if (solidThrough !== null) return `밴드 ${solidThrough}까지 안정이에요. 아직 벽을 안 만났어요`
  return '아직 수준을 말할 만큼 안 풀었어요'
}

function LevelSection({
  level,
  reviews,
  accuracy,
}: {
  level: LevelProfile
  reviews: number
  accuracy: number
}) {
  return (
    <section className="level">
      <p className="section-title">지금 수준</p>
      <p className="report-lead">{levelHeadline(level)}</p>
      <p className="stat-line">
        읽기 {reviews}회 · 정답률 {accuracy}%
      </p>

      <div className="ladder">
        {level.bands.map((b, i) => (
          <div className="ladder-item" key={b.band}>
            {/* 경계선 — 안정 구간과 흔들리는 구간 사이에 실제로 선을 긋는다 */}
            {level.edge === b.band && level.solidThrough !== null && (
              <p className="edge-line">
                <span>경계선</span>
              </p>
            )}
            <div className={`bar-row band-${b.status}`} style={{ '--i': i } as React.CSSProperties}>
              <span>
                밴드 {b.band}
                <span className="dim"> {BAND_NOTE[b.band]}</span>
              </span>
              <span className="bar-track">
                {b.seen > 0 && (
                  <span
                    className={`bar-fill${b.status === 'shaky' ? '' : ' ok'}`}
                    style={{ width: `${Math.round(b.rate * 100)}%` }}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="bar-num">{b.seen > 0 ? `${Math.round(b.rate * 100)}%` : '—'}</span>
            </div>
            <p className="band-note">
              {BAND_STATUS_LABEL[b.status]}
              {b.seen > 0 && (
                <span className="dim">
                  {' '}
                  · {b.correct}/{b.seen}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── 처방 ───────────────────────────────────────────────────────── */

function rxKey(p: Prescription): string {
  return p.kind === 'ONYOMI' ? `ONYOMI:${p.pairId}` : p.kind === 'BAND' ? `BAND:${p.band}` : p.kind
}

function RxItem({ p, onFocus }: { p: Prescription; onFocus: (pairId: string) => void }) {
  switch (p.kind) {
    case 'MORE_DATA':
      return (
        <>
          <p className="rx-title">조금 더 봐야 해요</p>
          <p className="rx-why">
            지금까지 읽기 {p.seen}회예요. {p.need}회쯤 더 쌓이면 어디를 짚어야 할지 말할 수 있어요.
          </p>
        </>
      )
    case 'MISTAKE_RULE':
      return (
        <>
          <p className="rx-title">
            {MISTAKE_LABEL[p.type]}
            <span className="dim"> · 오답의 {Math.round(p.share * 100)}%</span>
          </p>
          <p className="rx-why">{MISTAKE_ADVICE[p.type]}</p>
        </>
      )
    case 'ONYOMI':
      return (
        <>
          <p className="rx-title">
            <span lang="ja">{p.kanji}</span>{' '}
            <span className="r-ja" lang="ja">
              {p.base}
            </span>
            <span className="dim"> · {p.onKind === 'on' ? '음독' : '훈독'}</span>
          </p>
          <p className="rx-why">
            {p.seen}번 중 {p.wrong}번 틀렸어요. 이 음독을 쓰는 숙어가{' '}
            <b>{p.unlocks}개</b>라 여기 하나가 그만큼 걸려 있어요.
          </p>
          <button type="button" className="btn rx-run" onClick={() => onFocus(p.pairId)}>
            이 음독만 모아 풀기 <span className="chev">›</span>
          </button>
        </>
      )
    case 'BAND':
      return (
        <>
          <p className="rx-title">
            밴드 {p.band}
            <span className="dim"> {BAND_NOTE[p.band]}</span>
          </p>
          <p className="rx-why">
            {p.seen}회 중 {Math.round(p.rate * 100)}%. 여기가 지금 경계라 시간을 쓰면 가장 많이
            움직여요.
          </p>
        </>
      )
  }
}
