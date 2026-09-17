// 진단 리포트 화면 — 수준, 다음에 볼 것, 다시보기 진입, 오답 유형 분포, 한국음 간섭, 취약 음독. 이 앱의 얼굴이다 (PLAN §7)
import { useEffect, useState } from 'react'
import {
  buildLevel,
  LEVEL_MIN_SEEN,
  LEVEL_SOLID_RATE,
  LEVEL_WINDOW,
  type BandRow,
  type LevelProfile,
} from '../core/level.ts'
import { prescribe, type Prescription } from '../core/prescription.ts'
import { replay } from '../core/replay.ts'
import type { VoicingKind } from '../core/mistakes.ts'
import {
  classifiedMistakes,
  dominantVoicing,
  reclassifier,
  voicingCounts,
} from '../core/ruleRecord.ts'
import { BROWSE_N, buildReport, type MistakeSlice, type Report as ReportData } from '../core/report.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji, loadPairs } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { BAND_NOTE } from '../lib/bands.ts'
import { MISTAKE_LABEL, mistakeHint, mistakeLabel, VOICING_LABEL } from '../study/mistakeLabels.ts'
import { Mixed } from './RuleBody.tsx'
import { ruleForMistake } from './rules.ts'
import { RULE_OF_MISTAKE, type RuleId } from './rules.ts'

interface Loaded {
  report: ReportData
  level: LevelProfile
  prescriptions: Prescription[]
  /**
   * 탁음 바구니 안의 갈래별 횟수 (2026-09-17).
   * 분포는 이걸로 나눠 보여주고, 처방이 뜨는 문턱은 묶은 채로 둔다 — 축이 다르다.
   */
  voicing: Record<VoicingKind, number>
}

export function Report({
  onBrowse,
  onFocus,
  onRule,
  onOnyomi,
}: {
  /** 자주 틀린 숙어를 채점 없이 넘겨 보는 화면으로 (2026-09-12) */
  onBrowse: () => void
  /** 처방의 음독을 그 자리에서 집중 세션으로 (Phase 10) */
  onFocus: (pairId: string) => void
  /** 규칙 처방에서 그 절로 (2026-09-17). 세션이 없는 자리라 화면을 옮겨도 잃을 게 없다 */
  onRule: (id: RuleId | null) => void
  /** 음독 맵으로 (2026-09-17). 홈 메뉴가 탭으로 내려가면서 이 탭 아래로 옮겨왔다 */
  onOnyomi: () => void
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, pairs, index, kanji, events] = await Promise.all([
          loadBaseIdioms(),
          loadPairs(),
          loadPairIndex(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        // 저장된 유형을 그대로 세면 규칙 화면에서 빠진 오답이 여기서는 남는다 (2026-09-17).
        // 규칙 화면·다시보기와 **같은 함수**로 다시 매긴다
        const again = reclassifier(mistakeContextFromKanji(kanji), (id) => byId.get(id)?.headword)
        const state = replay(events, {
          pairsOf: (id) => byId.get(id)?.pairIds ?? [],
          mistakeOf: (e) => again(e).type,
        })
        const report = buildReport(state, pairs, (id) => {
          const it = byId.get(id)
          return it ? { headword: it.headword, reading: it.reading } : undefined
        })
        const level = buildLevel(events, (id) => byId.get(id)?.band)
        setData({
          report,
          level,
          voicing: voicingCounts(classifiedMistakes(events), again),
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
        ) : null}

        {/* 도구 둘은 **기록이 없어도** 보인다 (2026-09-17). 규칙은 처방에서만 닿게 두면
            읽기 30회를 채우기 전에는 아예 못 여는데, 규칙은 처음 틀린 날 가장 필요하다 */}
        <ToolsSection onOnyomi={onOnyomi} onRules={() => onRule(null)} />

        {data && data.report.totalReviews > 0 && (
          <ReportBody
            data={data}
            onBrowse={onBrowse}
            onFocus={onFocus}
            onRule={onRule}
          />
        )}
      </div>
    </section>
  )
}

function ReportBody({
  data,
  onBrowse,
  onFocus,
  onRule,
}: {
  data: Loaded
  onBrowse: () => void
  onFocus: (pairId: string) => void
  onRule: (id: RuleId | null) => void
}) {
  const { report, level, prescriptions, voicing } = data
  // 정답률은 *실제* 오답으로 센다. 분류된 오답만 쓰면 미분류분이 정답으로 둔갑한다
  const accuracy =
    report.totalReviews > 0
      ? Math.round(((report.totalReviews - report.totalWrong) / report.totalReviews) * 100)
      : 100
  const rows = mistakeRows(report.mistakes, voicing)
  const maxCount = Math.max(1, ...rows.map((m) => m.count))
  const topVoicing = dominantVoicing(voicing)
  /** 탁음 바구니에 갈래가 둘 이상 섞여 있나 — 처방의 숫자가 묶인 값임을 밝혀야 한다 */
  const voicingMixed = Object.values(voicing).filter((n) => n > 0).length > 1

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
                  <RxItem
                    p={p}
                    voicing={topVoicing}
                    mixed={voicingMixed}
                    onFocus={onFocus}
                    onRule={onRule}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {report.frequent.length > 0 && (
        <section className="browse-entry">
          <p className="section-title">다시보기</p>
          <p className="browse-lead">자주 틀린 것들을 채점 없이 한 장씩 넘겨 봐요. 들어갈 때마다 섞여요.</p>
          <button type="button" className="btn-primary" onClick={onBrowse}>
            다시보기 {Math.min(report.frequent.length, BROWSE_N)}장 ›
          </button>
        </section>
      )}

      <section>
        <p className="section-title">오답 유형 분포</p>
        {report.mistakes.length === 0 ? (
          <p className="empty">
            {report.totalWrong === 0 ? '오답이 없어요.' : '유형이 붙은 오답이 없어요.'}
          </p>
        ) : (
          <div className="bars">
            {rows.map((m, i) => (
              <div className="bar-row" key={m.key} style={{ '--i': i } as React.CSSProperties}>
                <span>{m.label}</span>
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
        읽기 {reviews}회 · 전체 정답률 {accuracy}%
      </p>
      {/* 한 화면에 정답률이 두 개다 — 위는 누적 전체, 아래 막대는 밴드별 최근 창.
          제목으로 무엇을 재는지 밝히고, 판정 기준은 표 끝에 캡션으로 붙인다 */}
      <p className="ladder-title">밴드 정답률</p>

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
      <p className="ladder-caption">
        최근 {LEVEL_WINDOW}회 기준 · {Math.round(LEVEL_SOLID_RATE * 100)}% 이상 안정 ·
        {Math.round(LEVEL_SOLID_RATE * 100)}% 미만 흔들림 · {LEVEL_MIN_SEEN}회 미만 표본 부족
      </p>
    </section>
  )
}

/* ── 처방 ───────────────────────────────────────────────────────── */

function rxKey(p: Prescription): string {
  return p.kind === 'ONYOMI' ? `ONYOMI:${p.pairId}` : p.kind === 'BAND' ? `BAND:${p.band}` : p.kind
}

function RxItem({
  p,
  voicing,
  mixed,
  onFocus,
  onRule,
}: {
  p: Prescription
  /** 탁음 처방일 때 제일 많이 틀린 갈래 (2026-09-17). 읽으라고 내밀 절을 정한다 */
  voicing: VoicingKind | null
  /** 그 바구니에 갈래가 둘 이상 섞였나 — 숫자가 묶인 값임을 밝힌다 */
  mixed: boolean
  onFocus: (pairId: string) => void
  onRule: (id: RuleId | null) => void
}) {
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
    case 'MISTAKE_RULE': {
      // 규칙 처방은 세션으로 못 만든다 (prescription.ts). 대신 **읽을 곳**은 생겼다 (2026-09-17)
      //
      // 문턱은 탁음 셋을 묶어 넘지만(쪼개면 반탁 처방이 영원히 안 뜬다), **읽으라고 내미는
      // 절은 제일 많이 틀린 갈래의 것**이어야 한다. 반탁만 틀리는 사람에게 연탁 절을
      // 읽히던 자리다 (2026-09-17 노출 경로 점검).
      const kind = p.type === 'RENDAKU' ? voicing : null
      const rule = ruleForMistake(p.type, kind) ?? RULE_OF_MISTAKE[p.type]
      return (
        <>
          <p className="rx-title">
            {mistakeLabel(p.type, kind)}
            <span className="dim"> · 오답의 {Math.round(p.share * 100)}%</span>
          </p>
          <p className="rx-why">
            <Mixed text={mistakeHint(p.type, kind)} />
          </p>
          {mixed && (
            <p className="rx-note">연탁·반탁·연성을 한 칸으로 묶어 센 값이에요.</p>
          )}
          {rule && (
            <button type="button" className="btn rx-run" onClick={() => onRule(rule)}>
              이 규칙 읽기 <span className="chev">›</span>
            </button>
          )}
        </>
      )
    }
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

/**
 * 도구 둘 — 음독 맵과 읽기 규칙 (2026-09-17).
 *
 * 홈 메뉴가 탭으로 내려가면서 이 탭 아래로 옮겨왔다. 리포트가 「내가 어디쯤인가」 라면
 * 이 둘은 그 답을 들고 가는 자리다 — 음독 맵은 전체에서 어디까지 왔나, 규칙은 왜 틀리나.
 * **기록이 없어도 보인다** — 처음 틀린 날 규칙이 가장 필요하다.
 */
function ToolsSection({ onOnyomi, onRules }: { onOnyomi: () => void; onRules: () => void }) {
  return (
    <section className="tools">
      <p className="section-title">도구</p>
      <button type="button" className="tool-row" onClick={onRules}>
        <span className="tool-name">읽기 규칙</span>
        <span className="tool-note">음운 변화의 지도 · 내가 틀린 기록</span>
        <span className="chev">›</span>
      </button>
      <button type="button" className="tool-row" onClick={onOnyomi}>
        <span className="tool-name">음독 맵</span>
        <span className="tool-note">(한자, 음독) 쌍 숙달 현황</span>
        <span className="chev">›</span>
      </button>
    </section>
  )
}

/**
 * 오답 분포의 행들. **탁음 한 칸을 갈래 칸들로 편다** (2026-09-17).
 *
 * 카드는 「반탁」이라 말하는데 리포트는 같은 오답을 「연탁」이라 부르고 있었다 — 탁음 오답의
 * 26%가 반탁이라 넷 중 하나에서 이름이 틀렸다. 갈래는 저장돼 있지 않고 답에서 다시 매기므로
 * `voicingCounts` 가 따로 준다. 합계가 어긋나면(다시 매기기가 실패한 이벤트) 남는 만큼을
 * 「탁음」 한 칸으로 남겨 **숫자를 잃지 않는다.**
 */
function mistakeRows(
  mistakes: readonly MistakeSlice[],
  voicing: Record<VoicingKind, number>,
): { key: string; label: string; count: number }[] {
  const out: { key: string; label: string; count: number }[] = []
  for (const m of mistakes) {
    if (m.type !== 'RENDAKU') {
      out.push({ key: m.type, label: MISTAKE_LABEL[m.type], count: m.count })
      continue
    }
    const split = (Object.entries(voicing) as [VoicingKind, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
    const counted = split.reduce((sum, [, n]) => sum + n, 0)
    for (const [kind, n] of split) out.push({ key: kind, label: VOICING_LABEL[kind], count: n })
    const rest = m.count - counted
    if (rest > 0) out.push({ key: 'RENDAKU', label: MISTAKE_LABEL.RENDAKU, count: rest })
  }
  return out.sort((a, b) => b.count - a.count)
}
