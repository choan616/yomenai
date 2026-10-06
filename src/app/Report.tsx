// 진단 리포트 화면 — 수준, 다음에 볼 것, 오답 유형 분포(+다시보기), 학습 달력, 도구, 취약 음독. 이 앱의 얼굴이다 (PLAN §7)
import { Fragment, useEffect, useState } from 'react'
import { dataVersion } from '../core/dataVersion.ts'
import { onyomiSiblings } from '../core/contrast.ts'
import {
  buildAttendance,
  dateKey,
  monthGrid,
  monthSummary,
  type DayRecord,
} from '../core/attendance.ts'
import { buildStreak, milestoneLabel, type Milestone, type StreakRecord } from '../core/streak.ts'
import {
  buildLevel,
  LEVEL_MIN_SEEN,
  LEVEL_MAX_BAND,
  LEVEL_SOLID_RATE,
  LEVEL_WINDOW,
  READING_STABLE_DAYS,
  solidReachDays,
  type BandRow,
  type LevelProfile,
} from '../core/level.ts'
import { DOMINANT_SHARE, prescribe, type Prescription } from '../core/prescription.ts'
import { replay } from '../core/replay.ts'
import type { VoicingKind } from '../core/mistakes.ts'
import {
  classifiedMistakes,
  dominantVoicing,
  passedCount,
  reclassifier,
  voicingCounts,
} from '../core/ruleRecord.ts'
import type { MistakeType } from '../core/types.ts'
import { BROWSE_N, buildReport, type MistakeSlice, type Report as ReportData } from '../core/report.ts'
import { pairRows, summarize, type OnyomiMasterySummary } from '../core/onyomiMap.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadKanji, loadPairs } from '../dict/load.ts'
import { loadStudyPool, withRuntimePairs } from '../dict/pool.ts'
import { loadSettings, QUICK_SESSION_LIMIT } from './settings.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { homeLine } from './weekLine.tsx'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { BAND_NOTE, type Band } from '../lib/bands.ts'
import {
  MISTAKE_LABEL,
  mistakeHint,
  mistakeLabel,
  PASSED_LABEL,
  UNNAMED_LABEL,
  VOICING_LABEL,
} from '../study/mistakeLabels.ts'
import { Mixed } from './RuleBody.tsx'
import { BottomSheet } from './BottomSheet.tsx'
import { RxRail } from './RxRail.tsx'
import { summaryTiles, type SheetKind } from './reportSummary.ts'
import { loadShiritoriRecord } from './shiritoriRecord.ts'
import { isUnlocked } from './unlocks.ts'
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
  /**
   * 오답 분포의 행들 (탁음은 갈래별로 펴서, 이름 없는 오답은 「잘못 읽기」로).
   * 많은 순이라 `rows[0]` 이 1등 오답이다
   */
  rows: MistakeRow[]
  /** 「모르겠어요」로 넘긴 오답. 이름이 아니라 **답이 없는** 것이라 분포 맨 아래에 따로 둔다 */
  passed: number
  /**
   * 음독 맵의 수치 (2026-09-23 사용자 보고 「음독맵의 숫자와 밴드의 숫자가 다르다」).
   * 두 화면이 서로의 자를 밝히기로 했다 — 여기서는 음독 맵으로 들어가는 행이 그 수를 든다
   */
  onyomi: OnyomiMasterySummary
  /** 매일 학습 달력의 하루 단위 참여 등급 (2026-09-29) */
  attendance: Map<string, DayRecord>
  /** 「많이 한 날」의 기준선 — 사용자 설정의 세션 길이 */
  sessionLimit: number
  /** 연속 기록 — 현재·최장·이정표 (2026-09-30) */
  streak: StreakRecord
  /** 밴드 안정이 새 높이에 닿은 날 → 그 밴드 (2026-09-30) */
  reach: Map<string, Band>
  /** 계산한 날. 자정을 넘기면 캐시를 버린다 (Home 과 같은 이유) */
  day: string
}

/**
 * 마지막으로 만든 리포트 (2026-09-21). 이 화면은 replay + 오답 재분류 + `buildReport` +
 * `buildLevel` + `prescribe` 를 한 번에 도는데, 탭을 옮기면 언마운트되어 들어올 때마다
 * 처음부터 다시 돌았다. 그 사이 「불러오고 있어요」가 그려졌다 사라지며 화면이 튄다.
 * `dataVersion` 이 같으면 기록도 설정도 그대로라 다시 돌 이유가 없다 (`Home` 과 같은 관례).
 */
let cache: { version: number; data: Loaded } | null = null

function cacheValid(): boolean {
  return cache?.version === dataVersion() && cache.data.day === dateKey(Date.now())
}

export function Report({
  onBrowse,
  onBrowseMistake,
  onFocus,
  onRule,
  onOnyomi,
  onShiritori,
  onQuick,
}: {
  /** 자주 틀린 숙어를 채점 없이 넘겨 보는 화면으로 (2026-09-12) */
  onBrowse: () => void
  /** 오답 유형 분포에서 가장 많은 유형만 걸러 다시보기로 (2026-09-18) */
  onBrowseMistake: (type: MistakeType | null, voicing: VoicingKind | null, label: string) => void
  /** 처방의 음독을 그 자리에서 집중 세션으로 (Phase 10) */
  onFocus: (pairIds: string[]) => void
  /** 규칙 처방에서 그 절로 (2026-09-17). 세션이 없는 자리라 화면을 옮겨도 잃을 게 없다 */
  onRule: (id: RuleId | null) => void
  /** 음독 맵으로 (2026-09-17). 홈 메뉴가 탭으로 내려가면서 이 탭 아래로 옮겨왔다 */
  onOnyomi: () => void
  /** 한자 끝말잇기로 (2026-10-04). 탭바를 덮는 흐름이다 */
  onShiritori: () => void
  /** 짧은 세션으로 (2026-10-02). 홈에서 걷어낸 「3장만」이 달력의 오늘 칸으로 옮겨왔다 */
  onQuick: () => void
}) {
  // 초기화 함수에서 캐시를 꺼낸다 — effect 로 넣으면 「불러오고 있어요」가 한 번 그려진다
  const [data, setData] = useState<Loaded | null>(() => (cacheValid() ? cache!.data : null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cacheValid()) return
    let alive = true
    ;(async () => {
      try {
        const [basePairs, index, baseKanji, events] = await Promise.all([
          loadPairs(),
          loadPairIndex(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const settings = loadSettings()
        // **세션·음독맵과 같은 풀을 쓴다** (2026-09-26). 전에는 `base.json` 만 봐서
        // 담아 둔 밴드 4 와 들인 말이 사다리·음독 집계에서 통째로 빠져 있었다
        const { pool: learn, kanji } = await loadStudyPool({
          starred: replay(events).starred,
          includeKun: settings.kunPercent > 0,
          kanji: baseKanji,
        })
        if (!alive) return
        const pairs = withRuntimePairs(basePairs, learn)
        const byId = new Map(learn.map((p) => [p.idiomId, p]))
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
        // 사다리는 **출제 범위와 같은 것**을 센다. 훈독을 빼 놓은 설정이면 예전에 푼
        // 훈독 기록도 빠진다 — `bandOf` 가 undefined 를 주면 `buildLevel` 이 그 이벤트도
        // 카드도 건너뛴다. level.ts 는 안 건드린다
        const inPool = new Set(learn.map((p) => p.idiomId))
        const bandInPool = (id: string) => (inPool.has(id) ? byId.get(id)?.band : undefined)
        const level = buildLevel(events, bandInPool, state.cards)
        const voicing = voicingCounts(classifiedMistakes(events), again)
        // 미분류 중 답이 있는 몫만 「잘못 읽기」다. 넘김(빈 답)은 이름 이전에 답이 없다
        const passed = passedCount(events)
        // 음독 맵과 **같은 함수·같은 분모**로 센다. 따로 세면 두 화면이 또 갈라진다
        const onyomi = summarize(pairRows(learn.flatMap((p) => p.pairIds), pairs, state))
        const attendance = buildAttendance(events, {
          quick: QUICK_SESSION_LIMIT,
          full: settings.sessionLimit,
        })
        const day = dateKey(Date.now())
        const next: Loaded = {
          report,
          onyomi,
          level,
          voicing,
          passed,
          attendance,
          sessionLimit: settings.sessionLimit,
          streak: buildStreak(attendance, day),
          // 사다리와 같은 자로 잰다 — 같은 bandOf
          reach: solidReachDays(events, bandInPool),
          day,
          rows: mistakeRows(report.mistakes, voicing, Math.max(0, report.unclassified - passed)),
          prescriptions: prescribe({
            report,
            level,
            unlocksOf: (pairId) => index.get(pairId)?.length ?? 0,
            // 역인덱스의 키가 곧 **코퍼스에서 실제로 실현된 쌍**이라 사전을 더 안 읽는다
            siblingsOf: (pairId) =>
              onyomiSiblings(pairId, index.keys(), (id) => index.get(id)?.length ?? 0),
          }),
        }
        cache = { version: dataVersion(), data: next }
        setData(next)
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
        {/* 알림 자리를 본문이 그대로 이어받는다 — 보이던 것이 움직이지 않는다 (2026-09-21) */}
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

        {/* 도구는 **맨 아래로** 내렸다 (2026-10-01 사용자 판단 「맨 위에 노출할 정도 비중은
            아니다」). 기록이 없어도 보인다는 원칙은 그대로다(2026-09-17 — 규칙은 처음 틀린 날
            가장 필요하다) — 빈 상태에서도 알림 바로 아래에 선다.
            **계산 중에는 안 그린다.** 본문 아래에 있으니 계산 중에 그려 두면 본문이 들어오며
            통째로 밀려 내려간다 — 2026-09-21 절이 잡은 "보이던 것이 움직이는" 덜컥거림이다 */}
        {data && data.report.totalReviews > 0 ? (
          <ReportBody
            data={data}
            onBrowse={onBrowse}
            onBrowseMistake={onBrowseMistake}
            onFocus={onFocus}
            onRule={onRule}
            onOnyomi={onOnyomi}
            onShiritori={onShiritori}
            onQuick={onQuick}
          />
        ) : (
          (error || data) && (
            <ToolsSection
              onyomi={data?.onyomi ?? null}
              onOnyomi={onOnyomi}
              onShiritori={onShiritori}
              streak={data?.streak ?? null}
              onRules={() => onRule(null)}
            />
          )
        )}
      </div>
    </section>
  )
}

function ReportBody({
  data,
  onBrowse,
  onBrowseMistake,
  onFocus,
  onRule,
  onOnyomi,
  onShiritori,
  onQuick,
}: {
  data: Loaded
  onBrowse: () => void
  onBrowseMistake: (type: MistakeType | null, voicing: VoicingKind | null, label: string) => void
  onFocus: (pairIds: string[]) => void
  onRule: (id: RuleId | null) => void
  onOnyomi: () => void
  /** 한자 끝말잇기로 (2026-10-04). 탭바를 덮는 흐름이다 */
  onShiritori: () => void
  onQuick: () => void
}) {
  const {
    report,
    level,
    prescriptions,
    voicing,
    rows,
    passed,
    attendance,
    sessionLimit,
    streak,
    reach,
    onyomi,
  } = data
  // 정답률은 *실제* 오답으로 센다. 분류된 오답만 쓰면 미분류분이 정답으로 둔갑한다
  const accuracy =
    report.totalReviews > 0
      ? Math.round(((report.totalReviews - report.totalWrong) / report.totalReviews) * 100)
      : 100
  // 「넘김」 막대도 같은 자로 잰다 — 빼고 재면 넘김이 제일 많아도 막대가 꽉 찬다
  const maxCount = Math.max(1, passed, ...rows.map((m) => m.count))
  /** 1등 오답 — rows 는 count 내림차순이라 맨 앞이다. 분류된 오답이 없으면 없다 */
  const top = rows[0] as MistakeRow | undefined
  const topVoicing = dominantVoicing(voicing)
  /** 탁음 바구니에 갈래가 둘 이상 섞여 있나 — 처방의 숫자가 묶인 값임을 밝혀야 한다 */
  const voicingMixed = Object.values(voicing).filter((n) => n > 0).length > 1

  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const thisMonth = monthSummary(new Date().getFullYear(), new Date().getMonth() + 1, attendance)
  const tiles = summaryTiles({
    level,
    streak,
    month: { days: thisMonth.days, cards: thisMonth.cards },
    top: top ? { label: top.label, count: top.count } : null,
    totalWrong: report.totalWrong,
    weak:
      report.weakOnyomi.length > 0
        ? { count: report.weakOnyomi.length, topRate: Math.max(...report.weakOnyomi.map((w) => w.rate)) }
        : null,
  })
  const sheets: Record<SheetKind, { title: string; content: React.ReactNode }> = {
    level: { title: '수준', content: <LevelSection level={level} reviews={report.totalReviews} accuracy={accuracy} /> },
    days: { title: '학습한 날', content: <CalendarSection
            attendance={attendance}
            sessionLimit={sessionLimit}
            streak={streak}
            reach={reach}
            onQuick={onQuick}
          /> },
    mist: { title: '오답 유형', content: <section>
            <p className="section-title">오답 유형 분포</p>
            {rows.length === 0 && passed === 0 ? (
              <p className="empty">오답이 없어요.</p>
            ) : (
              <div className="bars">
                {rows.map((m, i) => (
                  <div className="bar-row" key={m.key} style={{ '--i': i } as React.CSSProperties}>
                    <span>{m.label}</span>
                    <span className="bar-track">
                      <span
                        className={`bar-fill ${mistakeSeverity(m.count / report.totalWrong)}`}
                        style={{ width: `${(m.count / maxCount) * 100}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="bar-num">{m.count}</span>
                  </div>
                ))}
                {/* 넘김은 **등수와 무관하게 맨 아래** (2026-09-18). 이름이 없는 게 아니라 답이
                    없는 것이라 다시 볼 것도 없다 — 정렬에 끼우면 다시보기가 못 가리킬 행이 1등이 된다.
                    색도 오답 계통(--ng)이 아니라 무채로 — severity 클래스가 없으면 기본값(불투명
                    --ng)이 돼 아무 것도 안 틀렸는데 제일 진하게 보이는 문제가 있었다(사용자 지적) */}
                {passed > 0 && (
                  <div className="bar-row" style={{ '--i': rows.length } as React.CSSProperties}>
                    <span>{PASSED_LABEL}</span>
                    <span className="bar-track">
                      <span
                        className="bar-fill passed"
                        style={{ width: `${(passed / maxCount) * 100}%` }}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="bar-num">{passed}</span>
                  </div>
                )}
              </div>
            )}
            {/* 막대 색 3단 (2026-09-18, 사용자 요청) — 오답의 몇 %를 차지하는 유형인지로 나눈다.
                같은 --ng 계통 안에서 옅음(안심) → 진함(주의)만 바뀐다. 새 색상을 안 들인다(PLAN §7) */}
            {rows.length > 0 && (
              <p className="mistake-severity-caption">
                옅음 · 오답의 {Math.round(MISTAKE_SHARE_MID * 100)}% 미만
                <span className="dim"> · </span>
                진함 · {Math.round(DOMINANT_SHARE * 100)}% 이상
              </p>
            )}
          </section> },
    browse: { title: '다시보기', content: <section>
              <p className="section-title">다시보기</p>
            {report.frequent.length > 0 ? (
              <div className="browse-entry">
                <p className="browse-lead">채점 없이 한 장씩 넘겨 봐요. 들어갈 때마다 섞여요.</p>
                <div className="browse-pair">
                  <button type="button" className="btn" onClick={onBrowse}>
                    무작위 다시보기
                    <span className="sub">{Math.min(report.frequent.length, BROWSE_N)}장</span>
                  </button>
                  {top !== undefined && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onBrowseMistake(top.type, top.voicing, top.label)}
                    >
                      오답 유형별 다시보기
                      <span className="sub">
                        {top.label}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="empty">다시 볼 것이 아직 없어요.</p>
            )}
            </section> },
    weak: { title: '취약 음독', content: <section className="weak-onyomi">
              <details open>
                <summary className="section-title">
                  취약 음독 <span className="weak-count">{report.weakOnyomi.length}</span>
                </summary>
                {report.weakOnyomi.length === 0 && <p className="empty">아직 약한 음독이 없어요.</p>}
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
              </details>
            </section> },
  }

  return (
    <>
      {/* 요약 먼저, 상세는 시트로 (2026-10-05 사용자 「리포트는 정보가 너무 많아서 정리가 필요」 → 시안 승인).
          타일 넷이 첫 화면에 한눈에 들어오고, 누르면 표·달력·분포가 하단 시트로 올라온다.
          「다음에 볼 것」은 같은 모양의 순위 카드라 옆으로 미는 줄이고, 나머지는 「더 보기」 한 묶음이다 */}
      <section className="summary" aria-label="요약">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            type="button"
            className="tile"
            onClick={() => setSheet(tile.sheet)}
            aria-haspopup="dialog"
          >
            <span className="tile-k">
              {tile.label}
              <span className="tile-chev" aria-hidden="true">
                ›
              </span>
            </span>
            <span className={'tile-v' + (tile.warn ? ' warn' : '')}>{tile.value}</span>
            <span className="tile-s">{tile.sub}</span>
          </button>
        ))}
      </section>

      <section className="rx rx-rail">
          <p className="section-title">다음에 볼 것</p>
          {prescriptions.length === 0 ? (
            <p className="empty">지금은 특별히 짚을 게 없어요. 하던 대로 가면 돼요.</p>
          ) : (
            <RxRail count={prescriptions.length}>
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
            </RxRail>
          )}
        </section>

      <ToolsSection
        title="더 보기"
        onyomi={onyomi}
        onOnyomi={onOnyomi}
        onShiritori={onShiritori}
        streak={streak}
        onRules={() => onRule(null)}
      >
        {/* 취약 음독 줄은 요약 타일로 올라갔다 (2026-10-06) — 같은 시트를 여는 입구가 둘이면 같은 내용이 두 번 나온다 */}
        {report.frequent.length > 0 && (
          <button type="button" className="tool-row" onClick={() => setSheet('browse')}>
            <span className="tool-name">다시보기</span>
            <span className="tool-note">무작위 {Math.min(report.frequent.length, BROWSE_N)}장 · 유형별</span>
            <span className="chev">›</span>
          </button>
        )}
      </ToolsSection>

      {sheet && (
        <BottomSheet title={sheets[sheet].title} onClose={() => setSheet(null)}>
          <div className="report sheet-report">{sheets[sheet].content}</div>
        </BottomSheet>
      )}
    </>
  )
}

/* ── 수준 ─────────────────────────────────────────────────────────
   "내가 어디쯤인가"를 밴드 사다리 하나로 답한다. 경계선이 이 화면의 핵심 도형이다. */

/** 아직 잴 것이 없는 칸. 0 으로 적으면 「0개를 숙지했다」로 읽혀 안 푼 것과 못 외운 것이 섞인다 */
const NO_DATA = '—'

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
  /**
   * **수준 지표는 밴드 0~3 만 센다** (2026-09-26 사용자 판단). 밴드 4 는 출제 범위 밖이라
   * 담은 것만 들어온다 — 곁가지를 진도에 더하면 총계가 무엇의 총계인지 흐려진다.
   * 아래 표에는 그대로 둔다. 출제·정답률은 볼 값이 있다
   */
  const scored = level.bands.filter((b) => b.band <= LEVEL_MAX_BAND)
  const totalStable = scored.reduce((s, b) => s + b.stable, 0)
  return (
    <section className="level">
      <p className="section-title">지금 수준</p>
      <p className="report-lead">{levelHeadline(level)}</p>
      <p className="stat-line">
        읽기 {reviews}회 · 전체 정답률 {accuracy}%
      </p>
      {/* 큰 숫자는 정답률이 아니라 **붙은 숙어 개수**다 (2026-09-19). 정답률은 순간
          상태라 표본이 흔들면 같이 뒤집히는데, 수준은 쌓인 것이라 그러면 안 된다.
          정답률은 표의 한 열로 내려 경계선을 긋는 데만 쓴다 */}
      <div className="ladder-head">
        <p className="ladder-title">밴드별 숙지한 표현</p>
        <p className="ladder-total">{totalStable}개</p>
      </div>

      <StableMix bands={scored} total={totalStable} />

      {/* 표다 (2026-09-23 사용자 요청 "이 영역을 정리하고 싶다"). 한 밴드가 두 줄을 쓰고
          알약 배지가 밴드마다 같은 말을 되풀이해 여덟 줄을 먹고 있었다. 무엇보다 수치가
          오른쪽 정렬이라 150·462·77·250 의 자리가 제각각이어서 **밴드끼리 비교가 안 됐다** */}
      <table className="ladder">
        <thead>
          <tr>
            <th scope="col">밴드</th>
            {/* 앞의 둘은 **표현 개수**, 마지막은 **채점 횟수의 비율**이다. 제목이 그걸
                안 말하면 「출제 3 · 정답률 71%」 같은 줄이 산수가 틀린 것처럼 보인다
                (2026-09-26 사용자 지적) */}
            <th scope="col">출제</th>
            <th scope="col">숙지</th>
            <th scope="col">최근 정답률</th>
          </tr>
        </thead>
        <tbody>
          {level.bands.map((b) => (
            <Fragment key={b.band}>
              {/* 경계선 — 안정 구간과 흔들리는 구간 사이에 실제로 선을 긋는다 */}
              {level.edge === b.band && level.solidThrough !== null && (
                <tr className="edge-row">
                  <td colSpan={4}>
                    <p className="edge-line">
                      <span>경계선</span>
                    </p>
                  </td>
                </tr>
              )}
              <tr className={`band-${b.status}`}>
                <th scope="row">
                  밴드 {b.band}
                  <span className="dim"> {BAND_NOTE[b.band]}</span>
                  {/* 판정은 왼쪽 줄로만 보인다 (2026-09-23 사용자 선택). 도형은 읽어 주지
                      못하므로 이름은 글자로 남긴다 */}
                  <span className="sr-only"> · {BAND_STATUS_LABEL[b.status]}</span>
                </th>
                <td>{b.met > 0 ? b.met : NO_DATA}</td>
                {/* 밴드 4 의 숙지도 **값을 낸다** (2026-10-01 사용자 판단 — 사전 밖에서 담은 표현까지 뜻을
                    검수하게 됐다). 다만 **총계·그래프·경계 판정에는 안 넣는다**: 2026-09-26 판단 그대로다.
                    합계와 안 맞는 숫자라 흐리게 두고 아래 설명이 말한다 */}
                <td className={b.band > LEVEL_MAX_BAND ? 'dim' : undefined}>
                  {b.met > 0 ? b.stable : NO_DATA}
                </td>
                <td className="rate">{b.seen > 0 ? `${Math.round(b.rate * 100)}%` : NO_DATA}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {/* 한 문단에 일곱 가지를 이어 붙이면 어느 말이 어느 열 얘기인지 안 보인다 (2026-10-01
          사용자 지적). 항목마다 한 줄로 가른다 */}
      <ul className="ladder-caption">
        <li>숙지: {READING_STABLE_DAYS}일 이상 안 잊는 상태</li>
        <li>출제: 틀린 것·넘긴 것도 포함, 소개만 본 건 제외</li>
        <li>정답률: 표현 개수가 아니라 최근 {LEVEL_WINDOW}회 채점 기준</li>
        <li>
          붉은 줄 = 흔들림(정답률 {Math.round(LEVEL_SOLID_RATE * 100)}% 미만) · 점선 = 표본
          부족({LEVEL_MIN_SEEN}회 미만)
        </li>
        <li>
          수준은 밴드 0~{LEVEL_MAX_BAND}만 재요. 밴드 4는 담은 것만 들어와서 표에만 나오고(흐린 숫자) 합계·
          그래프에는 안 넣어요
        </li>
      </ul>
    </section>
  )
}

/**
 * 숙지한 표현이 어느 밴드에 쌓였나 — **한 막대의 분할** (2026-09-22, 사용자 제안).
 *
 * 밴드마다 막대를 주고 `stable / met` 을 그리던 자리다. 그 분모는 새 표현을 만날 때마다
 * 늘어서, **숙지가 그대로여도 출제가 늘면 막대가 내려갔다** (사용자 지적). 실력이 오르는데
 * 그래프가 내려가는 지표였다.
 *
 * 분모를 **내가 숙지한 전체 개수**로 바꾼다. 세그먼트 합이 늘 100%라 막대는 안 짧아지고,
 * 늘어난 총량은 막대 위 `ladder-total` 이 맡는다 — 성장은 숫자가, 구성은 도형이 말한다.
 *
 * 밴드 전체 표현 수를 분모로 두는 안은 실측으로 기각했다 — 풀이 밴드당 1,485~85,418개라
 * 숙지 40개면 막대가 1%다 (context-notes 같은 날 절에 기각안 넷을 남겼다).
 *
 * 밴드마다 색을 준다 (2026-09-22 사용자 지시). PLAN §7 의 "색은 오답에만" 에 대한 예외라
 * 오답의 朱 근처는 안 쓰고, 범례가 밴드 이름과 %를 글자로 같이 준다 — 색만으로 구분하지
 * 않는다는 쪽은 지킨다. 흔들리는 밴드는 세그먼트에 朱 테두리가 둘린다.
 */
function StableMix({ bands, total }: { bands: readonly BandRow[]; total: number }) {
  // 숙지가 0이면 그릴 도형이 없다. 빈 막대는 "아직 없다"를 말해 주지 않는다
  if (total === 0) return null
  /**
   * 숙지가 0인 밴드는 **범례에도 안 낸다** (2026-09-26).
   *
   * 한 번 0% 로 내 봤다가 되돌렸다 — 범례는 막대를 해독하는 물건인데 조각이 없는 항목은
   * 해독할 게 없다. 게다가 바로 아래 표가 같은 밴드를 「출제 10 · 숙지 0」으로, 비율이
   * 아니라 **개수로** 말한다. 0% 는 덜 정확한 중복이다 (사용자 판단).
   *
   * 「그래프에 그 밴드가 빠졌다」로 읽히는 건 맞지만, 숙지 막대에 숙지 0 인 밴드가 안
   * 나오는 것은 결함이 아니라 사실 그대로다.
   */
  const parts = bands.filter((b) => b.stable > 0)
  return (
    <div className="mix">
      <div className="mix-bar" aria-hidden="true">
        {parts.map((b) => (
          <span
            key={b.band}
            className={`mix-seg band-${b.status}`}
            data-band={b.band}
            style={{ width: `${(b.stable / total) * 100}%` } as React.CSSProperties}
          />
        ))}
      </div>
      {/* 범례가 막대의 값을 **글자로** 준다 — 막대는 aria-hidden 이라 읽어 주는 건 이 줄이다.
          개수는 아래 밴드 행에 이미 있으므로 여기선 비율만 말한다 */}
      <p className="mix-legend">
        {parts.map((b) => (
          <span key={b.band} className={`mix-key band-${b.status}`}>
            <span className="mix-dot" aria-hidden="true" data-band={b.band} />
            밴드 {b.band} {Math.round((b.stable / total) * 100)}%
          </span>
        ))}
      </p>
    </div>
  )
}

/* ── 매일 학습 달력 (2026-09-29, 사용자 제안) ──
   "내가 어디쯤인가" 다음은 "얼마나 꾸준히 왔나"다. 포인트·배지·스트릭은 기각했지만
   (2026-09-06/07 절 — 손실 회피가 의욕 없는 날 죄책감으로 번져 완전 이탈로 간다) 빈 칸이
   "쉰 날"로 보이는 것 자체는 남긴다(사용자 판단). 대신 문턱을 낮춰 무디게 만든다 —
   "3장만"(QUICK_SESSION_LIMIT)만 채워도 구멍이 안 생기고, 기준 세션(sessionLimit)을
   넘긴 날은 따로 표시해 처벌 한 축에 보상 한 축을 더한다.

   레이아웃은 두 번 바뀌었다 — 처음엔 롤링 4주(요일 열 4행)였는데 사용자가 참고 이미지로
   진짜 월 달력(1일 시작, 이전/다음 탐색)을 보여주며 "자극이 더 클 것 같다"고 했다.
   표시도 처음엔 명도 3단(회색조)이었는데, 그 참고 이미지가 초록 점으로 표시하는 걸 보고
   사용자가 "했다/안했다/좀 많이 했다 만 색으로 구분하면 된다"고 명시적으로 정했다 —
   `--attend`(index.css)는 그 지시를 반영한 새 색 토큰이고, "정답에 색을 주면 정답도
   이벤트가 된다"는 PLAN §7 원칙에 대한 의도적 예외다.

   2026-09-30 — 달력에 의미를 붙였다. 달 요약(학습일·장수), 연속 기록 문구, 이정표
   달성일(점 둘레 고리)과 밴드 안정 도달일(↑) 표식, 날짜를 누르면 그날 상세. 연속 기록은
   스트릭 기각의 부분 번복이라 **끊김을 말하지 않는다** — 현재 연속은 2일 이상일 때만,
   최장·달성 횟수는 줄지 않는 값만 보여준다 (streak.ts 머리 주석). */
const CALENDAR_DOW = ['일', '월', '화', '수', '목', '금', '토']

function CalendarSection({
  attendance,
  sessionLimit,
  streak,
  reach,
  onQuick,
}: {
  attendance: Map<string, DayRecord>
  sessionLimit: number
  streak: StreakRecord
  reach: Map<string, Band>
  onQuick: () => void
}) {
  const now = new Date()
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 })
  const todayKey = dateKey(now.getTime())
  // 처음엔 오늘을 펼쳐 둔다 — 오늘 기록이 없으면 아무것도 안 펼친다
  const [picked, setPicked] = useState<string | null>(() =>
    attendance.has(todayKey) ? todayKey : null,
  )
  // 이번 달을 넘어서는 못 간다 — 텅 빈 미래 달을 보여줄 이유가 없다(attendance.ts 주석)
  const atCurrentMonth = view.y === now.getFullYear() && view.m === now.getMonth() + 1

  const shiftMonth = (delta: number) => {
    setPicked(null)
    setView(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() + 1 }
    })
  }

  const weeks = monthGrid(view.y, view.m, attendance)
  const month = monthSummary(view.y, view.m, attendance)
  const milestoneOn = new Map(streak.milestones.map((m) => [m.date, m]))
  const records = streakRecords(streak)
  // 연속 기록이 아직 없으면(2일 미만·이정표 없음) 이번 달 학습일로 대신 말한다
  const thisMonth = monthSummary(now.getFullYear(), now.getMonth() + 1, attendance)
  const lead =
    records ?? (thisMonth.cards > 0 ? `이번 달 ${thisMonth.days}일 · ${thisMonth.cards}장` : null)

  return (
    <section className="attendance">
      {/* 달력은 시트 안에서 늘 펼쳐져 있다 (2026-10-05). 전에는 접어 두고 연속 기록 문구만 먼저 보였지만,
          요약은 이제 리포트 맨 위 타일이 말한다 — 접힘과 그 기억(calendarOpen.ts)은 쓸모가 없어져 걷었다 */}
      <p className="section-title">학습한 날</p>
      {lead && <p className="cal-records">{lead}</p>}
        <div id="cal-body">
        <div className="cal-header">
          <p className="report-lead cal-title">
            {view.y}년 {view.m}월
            {month.cards > 0 && (
              <span className="cal-month-sum">
                {' '}
                {month.days}일 · {month.cards}장
              </span>
            )}
          </p>
          <div className="cal-nav">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달">
              ‹
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={atCurrentMonth}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        </div>
        <div className="cal-dow" aria-hidden="true">
          {CALENDAR_DOW.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid">
          {weeks.flatMap((week, wi) =>
            week.map((cell, di) => {
              if (cell === null) {
                return (
                  <span key={`pad-${wi}-${di}`} className="cal-cell cal-cell-pad" aria-hidden="true" />
                )
              }
              const props = {
                className: 'cal-cell',
                'data-tier': cell.tier,
                'data-today': cell.date === todayKey || undefined,
                'data-milestone': milestoneOn.has(cell.date) || undefined,
                'data-reach': reach.has(cell.date) || undefined,
                title: cell.date,
              }
              const body = (
                <>
                  <span className="cal-num">{cell.day}</span>
                  <span className="cal-dot" aria-hidden="true" />
                  {reach.has(cell.date) && (
                    <span className="cal-reach" aria-hidden="true">
                      ↑
                    </span>
                  )}
                </>
              )
              // 채점이 하나라도 있는 날만 누를 수 있다. 지난 빈 날에는 할 말이 없다 —
              // 「기록 없음」도 안 띄운다(네거티브 표시 금지).
              // **오늘 칸만 비어도 누를 수 있다** (2026-10-02) — 아직 지나지 않은 날이라
              // 할 말이 있다. 누르면 짧은 세션으로 가는 길이 열린다(`.cal-nudge`)
              return attendance.has(cell.date) || cell.date === todayKey ? (
                <button
                  key={cell.date}
                  type="button"
                  {...props}
                  aria-pressed={picked === cell.date}
                  onClick={() => setPicked((p) => (p === cell.date ? null : cell.date))}
                >
                  {body}
                </button>
              ) : (
                <span key={cell.date} {...props}>
                  {body}
                </span>
              )
            }),
          )}
        </div>
        {picked && attendance.has(picked) && (
          <DayDetail
            record={attendance.get(picked)!}
            milestone={milestoneOn.get(picked)}
            band={reach.get(picked)}
          />
        )}
        {/* 오늘 칸을 눌렀고 아직 그 칸을 못 채웠으면 짧은 세션을 권한다 (2026-10-02 사용자 지시).
            홈에 매일 띄우던 「3장만」을 **필요한 순간에만** 내는 자리다. 지난 날에는 안 나온다 —
            소급해 채울 수 없는 날에 할 말이 없다. 문구는 긍정형만(weekLine.tsx) */}
        {picked === todayKey && !streak.todayDone && (
          <div className="cal-nudge" aria-live="polite">
            <p>{homeLine(streak, todayKey, attendance.get(todayKey)?.count ?? 0)}</p>
            <button type="button" className="btn quick" onClick={onQuick}>
              <b>{QUICK_SESSION_LIMIT}장</b>만<span className="dim"> · 오늘은 짧게</span>
            </button>
          </div>
        )}
        <p className="cal-caption">
          <span>
            <span className="cal-key" data-tier="touched" /> {QUICK_SESSION_LIMIT}장 이상
          </span>
          <span>
            <span className="cal-key" data-tier="full" /> {sessionLimit}장 이상
          </span>
          <span>
            <span className="cal-key" data-milestone /> 연속 달성
          </span>
          <span>
            <span className="cal-key-reach">↑</span> 밴드 안정 도달
          </span>
        </p>
        </div>
    </section>
  )
}

/**
 * 연속 기록 한 줄. 줄지 않는 값만 — 현재 연속은 2일 이상일 때만 말하고, 끊긴 뒤엔
 * 최장과 달성 횟수만 남는다. 말할 게 없으면 null
 */
function streakRecords(streak: StreakRecord): string | null {
  const parts: string[] = []
  if (streak.current >= 2) parts.push(`지금 ${streak.current}일째`)
  if (streak.longest >= 2 && streak.longest > streak.current) parts.push(`최장 ${streak.longest}일`)
  const byDays = new Map<number, number>()
  for (const m of streak.milestones) byDays.set(m.days, (byDays.get(m.days) ?? 0) + 1)
  for (const [days, n] of byDays) parts.push(`${milestoneLabel(days)} ${n}번`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** 누른 날의 상세 — 장수·정답률, 그날 달성한 것 */
function DayDetail({
  record,
  milestone,
  band,
}: {
  record: DayRecord
  milestone: Milestone | undefined
  band: Band | undefined
}) {
  const [y, m, d] = record.date.split('-').map(Number)
  const dow = CALENDAR_DOW[new Date(y, m - 1, d).getDay()]
  return (
    <div className="cal-detail" aria-live="polite">
      <p className="cal-detail-head">
        {m}월 {d}일 ({dow}) · <b>{record.count}장</b> · 정답률{' '}
        {Math.round((record.correct / record.count) * 100)}%
      </p>
      {(milestone || band !== undefined) && (
        <p className="cal-detail-tags">
          {milestone && <span>{milestoneLabel(milestone.days)} 달성</span>}
          {band !== undefined && <span>밴드 {band} 안정 도달</span>}
        </p>
      )}
    </div>
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
  onFocus: (pairIds: string[]) => void
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
    case 'ONYOMI': {
      // 형제 음독이 있으면 **집중을 대조로 갈아끼운다** (2026-09-21). 이 경우 한 음독만
      // 반복해 푸는 것은 「人 은 じん」이라는 과잉일반화를 그 세션이 직접 가르치는 꼴이다
      const siblings = p.contrast ?? []
      const all = [p.pairId, ...siblings.map((s) => s.pairId)]
      return (
        <>
          <p className="rx-title">
            <span lang="ja">{p.kanji}</span>{' '}
            <span className="r-ja" lang="ja">
              {p.base}
            </span>
            <span className="dim"> · {p.onKind === 'on' ? '음독' : '훈독'}</span>
          </p>
          {siblings.length > 0 ? (
            <p className="rx-why">
              {p.seen}번 중 {p.wrong}번 틀렸어요. 이 한자는 음독이 둘이에요 —{' '}
              <span className="r-ja" lang="ja">
                {p.base}
              </span>
              ({p.unlocks}개)
              {siblings.map((s) => (
                <span key={s.pairId}>
                  {' · '}
                  <span className="r-ja" lang="ja">
                    {s.base}
                  </span>
                  ({s.idioms}개)
                </span>
              ))}
              . 갈라서 나란히 내요.
            </p>
          ) : (
            <p className="rx-why">
              {p.seen}번 중 {p.wrong}번 틀렸어요. 이 음독을 쓰는 숙어가{' '}
              <b>{p.unlocks}개</b>라 여기 하나가 그만큼 걸려 있어요.
            </p>
          )}
          <button type="button" className="btn rx-run" onClick={() => onFocus(all)}>
            {siblings.length > 0 ? '두 음독을 갈라 풀기' : '이 음독만 모아 풀기'}{' '}
            <span className="chev">›</span>
          </button>
        </>
      )
    }
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
function ToolsSection({
  onyomi,
  onOnyomi,
  onShiritori,
  streak,
  onRules,
  title = '도구',
  children,
}: {
  /** 제목 — 리포트 본문에서는 「더 보기」다 (2026-10-05) */
  title?: string
  /** 도구 줄 뒤에 붙는 줄 (취약 음독·다시보기 — 시트를 연다) */
  children?: React.ReactNode
  /** 계산 전에는 `null` 이다 — 이 묶음은 기록이 없어도, 재생이 끝나기 전에도 보인다 */
  onyomi: OnyomiMasterySummary | null
  onOnyomi: () => void
  /** 한자 끝말잇기로 (2026-10-04). 탭바를 덮는 흐름이다 */
  onShiritori: () => void
  /** 연속 기록 — 끝말잇기가 열리는 조건이다 (unlocks.ts). 계산 전이면 null */
  streak: { longest: number } | null
  onRules: () => void
}) {
  // 도구 줄이 그려질 때마다 읽는다 — 끝말잇기에서 돌아오면 Report 가 다시 그려져 새 기록이 보인다
  const record = loadShiritoriRecord()
  return (
    <section className="tools">
      <p className="section-title">{title}</p>
      <div className="tool-list">
      <button type="button" className="tool-row" onClick={onRules}>
        <span className="tool-name">읽기 규칙</span>
        <span className="tool-note">음운 변화의 지도</span>
        <span className="chev">›</span>
      </button>
      <button type="button" className="tool-row" onClick={onOnyomi}>
        <span className="tool-name">음독 맵</span>
        {/* 표현이 아니라 **쌍**을 센다고 행이 직접 말한다 (2026-09-23) — 위 사다리의
            「숙지한 표현 N개」와 다른 자라는 걸 들어가기 전에 알아야 한다.
            **두 문구 다 한 줄이다** — 수치가 채워질 때 줄이 늘면 도구 묶음이 덜컥인다
            (`screen-cache.spec.ts` 가 그걸 못 박는다) */}
        <span className="tool-note">
          {onyomi === null
            ? '쌍 숙달 현황'
            : `${onyomi.mastered}/${onyomi.total}쌍 숙달`}
        </span>
        <span className="chev">›</span>
      </button>
      {/* 연속 기록이 4주(28일)에 닿은 적이 있으면 열린다 (2026-10-04). unlocks.ts */}
      {isUnlocked('shiritori', streak) && (
        <button type="button" className="tool-row" onClick={onShiritori}>
          <span className="tool-name">한자 끝말잇기</span>
          <span className="tool-note">
            {record.plays > 0 ? `최고 ${record.best}개 · ${record.plays}판` : '끝 한자로 이어 읽기'}
          </span>
          <span className="chev">›</span>
        </button>
      )}
      {children}
      </div>
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
/**
 * 분포 막대 색 3단 기준 (2026-09-18, 사용자 요청).
 *
 * "오답률이 미미하면 안심, 높으면 주의"를 색으로 준다. 퍼센티지는 `RxItem` 의
 * "오답의 N%"·처방 문턱(`DOMINANT_SHARE`)과 같은 잣대 — `count / totalWrong`.
 * **색상은 새로 안 들인다.** `--ng` 하나의 짙기만 3단으로 바꾼다(PLAN §7 "무채색
 * 기반, 색은 오답에만"). 높은 쪽 문턱은 처방이 뜨는 문턱(`DOMINANT_SHARE`)과 같다 —
 * "리포트가 진하게 보여주는 유형 = 처방이 짚는 유형" 이 같은 기준이어야 한다.
 */
const MISTAKE_SHARE_MID = DOMINANT_SHARE / 2

function mistakeSeverity(share: number): 'sev-low' | 'sev-mid' | 'sev-high' {
  if (share >= DOMINANT_SHARE) return 'sev-high'
  if (share >= MISTAKE_SHARE_MID) return 'sev-mid'
  return 'sev-low'
}

interface MistakeRow {
  key: string
  label: string
  count: number
  /** 다시보기 필터에 그대로 넘길 값. `null` 은 이름이 안 붙은 오답(「잘못 읽기」)이다 */
  type: MistakeType | null
  voicing: VoicingKind | null
}

function mistakeRows(
  mistakes: readonly MistakeSlice[],
  voicing: Record<VoicingKind, number>,
  /** 답은 썼는데 6종 어디에도 안 맞은 오답 수 (2026-09-18) */
  unnamed: number,
): MistakeRow[] {
  const out: MistakeRow[] = []
  // 이름이 없을 뿐 **다시 볼 수 있는** 오답이라 다른 행들과 같이 정렬에 든다.
  // 1등이 되면 「오답 유형별 다시보기」가 이걸 가리킨다 — 그 단어들을 모아 보는 게 맞는 처방이다
  if (unnamed > 0) {
    out.push({ key: 'UNNAMED', label: UNNAMED_LABEL, count: unnamed, type: null, voicing: null })
  }
  for (const m of mistakes) {
    if (m.type !== 'RENDAKU') {
      out.push({ key: m.type, label: MISTAKE_LABEL[m.type], count: m.count, type: m.type, voicing: null })
      continue
    }
    const split = (Object.entries(voicing) as [VoicingKind, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
    const counted = split.reduce((sum, [, n]) => sum + n, 0)
    for (const [kind, n] of split) {
      out.push({ key: kind, label: VOICING_LABEL[kind], count: n, type: 'RENDAKU', voicing: kind })
    }
    // 합계가 어긋난 나머지(위 mistakeRows 주석 참조) — 특정 갈래로 못 좁혀 `rendaku` 로 둔다
    const rest = m.count - counted
    if (rest > 0) {
      out.push({ key: 'RENDAKU', label: MISTAKE_LABEL.RENDAKU, count: rest, type: 'RENDAKU', voicing: 'rendaku' })
    }
  }
  return out.sort((a, b) => b.count - a.count)
}
