// 학습 세션의 런타임 상태 — 풀·이벤트 로드 → buildSession → 카드 순회 → 답안 기록
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MistakeContext } from '../core/mistakes.ts'
import {
  buildSession,
  isCorrectReading,
  recordMeaningAnswer,
  recordMeaningKnown,
  recordReadingAnswer,
  type AnswerContext,
  type Session,
  type SessionCard,
} from '../core/session.ts'
import { explainMistake, type VoicingKind } from '../core/mistakes.ts'
import { onyomiEcho, type OnyomiEcho } from '../core/echo.ts'
import { observeReading, type Observation } from '../core/observe.ts'
import { rubyOf, type RubySegment } from '../core/ruby.ts'
import { foldHomographs, pairOf } from './homograph.ts'
import { buildFocus, buildRematch } from '../core/session.ts'
import { surfaceOfPairs } from '../core/surface.ts'
import type { Confidence } from '../core/scheduler.ts'
import type { LearningEvent, MistakeType } from '../core/types.ts'
import { appendEvent } from '../db/events.ts'
import { loadIntroduced, markIntroduced } from './introduced.ts'
import { INTRO_MAX_SHARE, planIntros } from './planIntros.ts'
import { getDeviceId } from '../db/device.ts'
import { db } from '../db/schema.ts'
import { LOCAL_USER_ID } from '../db/events.ts'
import { listEvents } from '../db/events.ts'
import { loadBaseIdioms, loadKanji, studyPool, type RuntimeIdiom } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { loadSettings, OBSERVE_GATE, type ObserveLevel } from '../app/settings.ts'

/** 읽기 답안을 낸 직후의 판정 결과. 이벤트는 아직 안 쓴다 — 자신감 버튼을 기다린다 */
export interface ReadingFeedback {
  correct: boolean
  expected: string
  mistakeType: MistakeType | null
  /**
   * RENDAKU 안에서 어느 갈래였나 (2026-09-17). 이벤트에는 안 들어간다 —
   * 화면이 맞는 규칙 절을 고르고 이름을 정확히 붙이는 데만 쓴다
   */
  voicing: VoicingKind | null
  answer: string
  /** 정답일 때만. 방금 쓴 음독과 그걸 만난 횟수 (PLAN §6 "음독은 진단 도구") */
  echo: OnyomiEcho[]
  /** 정답 읽기를 한자 위에 얹기 위한 조각 */
  ruby: RubySegment[]
  /** 루프 안 관찰 한 줄 (Phase 9-C). 빈도 게이트를 통과했을 때만 채워진다 */
  observe: Observation | null
  /**
   * 동형이독의 다른 읽기로 맞혔는데 **이어 묻기를 못 한 경우**.
   * 상대 숙어가 지금 풀에 없으면(밴드 4 만 가진 읽기 등) 물어볼 카드가 없다.
   * 정답으로 치되 이 카드가 묻는 읽기는 한 줄로 알려준다
   */
  viaAlt: boolean
  /** 「읽기 둘」 카드였다면 그 결과. 보통 카드면 null */
  dual: DualOutcome | null
  /**
   * 오답 유형을 붙여도 되는 답인지. **이벤트에도 그대로 넘긴다** —
   * `recordReadingAnswer` 가 유형을 다시 계산하므로 화면에만 걸면 기록이 어긋난다
   */
  classify: boolean
}

/**
 * 「읽기 둘」 카드의 결과 (2026-09-14).
 *
 * 한 표기에 읽기가 둘인 말(市場 いちば/しじょう)은 답이 하나인 카드 모델에 안 맞는다.
 * 그래서 정규 읽기 카드로 내지 않고 **한 장으로 접어 처음부터 둘 다 묻는다.**
 * 두 읽기는 이미 각각 별도의 숙어라 스키마에 더할 것은 없다 — 이벤트는 그대로
 * 각 숙어의 reading 이벤트이고, 「읽기 둘」인지는 사전과 풀에서 파생된다.
 *
 * 기록 규칙은 한 줄이다.
 * **쓴 읽기의 카드에만 정답을 남기고, 못 쓴 쪽에는 아무것도 안 남긴다.**
 * 오답은 어느 읽기로도 못 읽었을 때만 생긴다 — 못 쓴 쪽은 "틀린 것" 이 아니라
 * "아직 안 배운 것" 이라 정규 세션에서 다시 나온다.
 */
export interface DualOutcome {
  /** 맞힌 읽기들. 각각 그 숙어의 카드에 정답 이벤트가 된다 */
  got: { idiomId: string; reading: string }[]
  /**
   * 어느 읽기로도 못 읽었을 때의 답. 이때만 서빙된 카드에 오답 이벤트를 남긴다.
   * 하나라도 맞혔으면 null — 맞는 읽기를 쓰고 정답률이 깎이면 안 된다
   */
  missedAnswer: string | null
}

export type StudyStatus =
  | 'loading'
  | 'error'
  | 'classReview'
  /** 처음 만나는 숙어 — 시험 대신 보여준다 (2026-09-13) */
  | 'intro'
  | 'reading'
  | 'reading-feedback'
  | 'meaning'
  | 'meaning-feedback'
  | 'done'

export interface StudyState {
  status: StudyStatus
  error?: string
  /** 현재 카드와 숙어 (loading/done/error 면 없음) */
  card?: SessionCard
  idiom?: RuntimeIdiom
  feedback?: ReadingFeedback
  /** `total` 은 소개까지 포함한 전체 장수. `intros` 는 그중 소개 수 — 화면이 갈라 보여준다 */
  progress: { index: number; total: number; intros: number }
  summary: { total: number; correct: number }
  /** 종료 요약이 쓰는 이벤트 — 세션 이전 로그와 이번 세션에 쌓은 로그 */
  events: { prior: LearningEvent[]; session: LearningEvent[] }
  /** 요약이 숙어 이름과 음독 쌍을 찾는 데 쓴다 */
  pool: RuntimeIdiom[]
  /**
   * 지금 카드의 요미가나. **읽기 문제에는 안 준다** — 답을 그대로 보여주는 꼴이다.
   * 소개·뜻 카드처럼 읽기를 이미 보여주는 자리에서만 쓴다 (2026-09-14).
   */
  idiomRuby?: RubySegment[]
  /**
   * 「읽기 둘」 카드면 채워진다. `given` 은 여태 맞힌 읽기 — 화면이 「그것 말고」 로
   * 제외 조건을 띄우는 데 쓴다
   */
  dualAsk?: { total: number; given: string[] }
  /** 카드 전환마다 1 증가. 화면이 전환 시간을 실측하는 트리거 (PLAN §7) */
  transitionSeq: number
}

export interface StudyActions {
  /** 읽기 답안 제출 — 판정만 하고 피드백을 띄운다 */
  submitReading: (answer: string) => void
  /** 모르겠다고 넘긴다 — 빈 답으로 남아 오답 유형이 안 붙는다 (2026-09-14) */
  passReading: () => void
  /** 뜻 카드 자기 채점 — 뜻을 확인한 뒤 안다/모른다 */
  submitMeaning: (known: boolean) => void
  /** "뜻은 알고 계셨나요" 지연 검수 응답 */
  answerClassReview: (known: boolean) => void
  /** 소개를 봤다 — 채점도 이벤트도 없이 다음으로 */
  seenIntro: () => void
  /** 피드백을 닫고 다음 카드로. 정답이면 자신감 보정을 함께 넘긴다 */
  next: (confidence?: Confidence) => void
}

/**
 * 정규 세션 / 예전에 틀린 것만 모은 재대결 / 음독을 모은 집중 세션.
 * `focus` 는 `focusPairIds` 를 같이 받아야 한다 (리포트의 처방이 정한다, Phase 10).
 * 쌍이 여럿이면 그것들을 갈라 내는 대조 세션이다 (2026-09-21).
 */
export type SessionKind = 'normal' | 'rematch' | 'focus'

export interface StudySessionOptions {
  kind?: SessionKind
  /** `kind='focus'` 일 때 집중할 (한자, 음독) 쌍. 여럿이면 대조 세션이다 */
  focusPairIds?: string[]
  /**
   * 세션 길이를 설정값 대신 이 값으로. "3장만" 진입로가 쓴다 (Phase 11).
   * 설정을 안 건드리므로 다음 세션은 다시 원래 길이로 돌아온다.
   */
  limit?: number
}

export function useStudySession({
  kind = 'normal',
  focusPairIds,
  limit: limitOverride,
}: StudySessionOptions = {}): [StudyState, StudyActions] {
  const [session, setSession] = useState<Session | null>(null)
  /**
   * 이번 세션에서 소개로 낼 숙어. 세션을 짤 때 한 번 정해지고 안 바뀐다 —
   * `planIntros` 가 그 숙어의 다른 카드를 이미 걷어서 다시 나올 일이 없다
   */
  const [introIds, setIntroIds] = useState<Set<string>>(new Set())
  /**
   * 「뜻은 알고 있었어요?」에 **안다고 답하면 소개를 건너뛴다.** 아는 단어를 가르칠 이유가
   * 없고, 그 사람에게 필요한 건 읽기 확인뿐이다 (`assignMode` 도 교정으로 넘긴다).
   * 카드가 넘어갈 때 풀린다
   */
  const [knewMeaning, setKnewMeaning] = useState(false)
  /**
   * 이번 세션에서 「뜻을 몰랐다」로 답한 숙어 (2026-09-20 사용자 보고 "몰랐다를 골랐는데
   * 문제로 간다"). `planIntros` 는 빌드 시점에 소개를 고르는데, 상한(1/3)을 넘었거나
   * 이미 푼 적 있는 숙어면 안 고른다. 그런데 **사용자가 직접 모른다고 말한 것은 그 어떤
   * 추정보다 강한 신호**라, 계획을 뒤집고 소개로 돌린다 — 모른다고 답한 직후에 그 표현을
   * 시험하는 건 「첫 만남을 시험이 아니라 소개로」(2026-09-13) 를 정면으로 깬다
   */
  const [unknownMeaning, setUnknownMeaning] = useState<ReadonlySet<string>>(new Set())
  /** 소개로 돌린 숙어의 남은 카드는 이번 세션에서 건너뛴다 — planIntros 가 빌드 때 하는 일과 같다 */
  const skipIds = useRef<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  /** 지연 검수 질문을 아직 안 지난 카드인지 */
  const [inClassReview, setInClassReview] = useState(false)
  const [feedback, setFeedback] = useState<ReadingFeedback | null>(null)
  /** 「읽기 둘」 카드에서 여태 맞힌 읽기. 카드가 바뀌면 비운다 */
  const [dualGot, setDualGot] = useState<{ idiomId: string; reading: string }[]>([])
  /** 뜻 카드에서 자기 채점을 마쳤는지 (피드백 표시용) */
  const [meaningDone, setMeaningDone] = useState<boolean | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  const [pool, setPool] = useState<RuntimeIdiom[] | null>(null)
  /** 세션에서 쓴 이벤트. DB 를 다시 읽지 않고 종료 요약에 그대로 넘긴다 */
  const [sessionEvents, setSessionEvents] = useState<LearningEvent[]>([])
  /** 세션 시작 시점의 로그. 종료 요약이 "이번에 처음 맞힌 음독"을 가리는 기준선이다 */
  const [priorEvents, setPriorEvents] = useState<LearningEvent[]>([])
  const [transitionSeq, setTransitionSeq] = useState(0)

  const mistakes = useRef<MistakeContext | null>(null)
  /**
   * 소개 카드의 요미가나를 렌더 중에 만들려면 사전이 필요한데, `mistakes` 는 ref 라
   * 렌더에서 읽으면 갱신이 안 보일 수 있다. 그래서 사전이 오면 상태로도 한 번 남긴다.
   * 채점 경로(이벤트 핸들러)는 ref 를 그대로 쓴다 — 거기선 ref 가 맞다.
   */
  const [rubyOfIdiom, setRubyOfIdiom] = useState<((i: RuntimeIdiom) => RubySegment[]) | null>(
    null,
  )
  const shownAt = useRef(0)
  const ctxBase = useRef({ userId: LOCAL_USER_ID, deviceId: getDeviceId() })
  // 관찰 문구 빈도 게이트 (Phase 9-C) — 세션 시작 시 설정을 한 번 읽어 고정한다
  const observeLevel = useRef<ObserveLevel>('normal')
  const observeShown = useRef(0)
  const cardsSinceObserve = useRef(0)


  const byId = useMemo(
    () => new Map((pool ?? []).map((p) => [p.idiomId, p])),
    [pool],
  )

  // 표기 → 그 표기를 쓰는 숙어들. 동형이독 이어 묻기가 상대 숙어를 여기서 찾는다.
  // 겹치는 표기는 풀의 0.14% 뿐이라 전부 담아도 쓸모없이 큰 맵은 아니다
  const byHeadword = useMemo(() => {
    const m = new Map<string, RuntimeIdiom[]>()
    for (const p of pool ?? []) {
      const cur = m.get(p.headword)
      if (cur) cur.push(p)
      else m.set(p.headword, [p])
    }
    return m
  }, [pool])

  /**
   * 세션을 다시 짜는 기준. 배열은 렌더마다 새 객체라 의존성에 그대로 못 넣는다 —
   * 내용을 문자열로 접었다 도로 편다. 같은 쌍을 받으면 같은 배열이라 세션을 두 번
   * 만들지 않는다 (2026-09-21). 쌍 식별자는 kanji:kind:base 라 구분자와 안 겹친다
   */
  const focusKey = focusPairIds?.join('|') ?? ''
  const focusPairs = useMemo(() => (focusKey === '' ? [] : focusKey.split('|')), [focusKey])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [all, kanji, events] = await Promise.all([
          loadBaseIdioms(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        // 범위는 **풀에서** 가른다. 세션을 짜는 쪽(정규·재대결·집중)을 하나도 안 건드리고
        // 훈독을 넣고 뺄 수 있는 자리가 여기뿐이다
        const { sessionLimit, ratio, observeLevel: lvl, kunPercent } = loadSettings()
        const loaded = studyPool(all, kunPercent > 0)
        setPool(loaded)
        setPriorEvents(events)
        mistakes.current = mistakeContextFromKanji(kanji)
        const rubyLookup = mistakes.current.lookup
        setRubyOfIdiom(() => (i: RuntimeIdiom) => rubyOf(i.headword, i.reading, rubyLookup))
        observeLevel.current = lvl
        const now = Date.now()
        const limit = limitOverride ?? sessionLimit
        // 소개는 문제 수에 안 드니(planIntros) 그만큼 더 만들어 둔다. 소개 숙어 하나가
        // 문제 자리를 최대 두 장(읽기·뜻) 먹으므로 상한의 두 배면 충분하다
        const introCap = Math.max(1, Math.floor(limit * INTRO_MAX_SHARE))
        const buildLimit = limit + introCap * 2
        // byId(useMemo) 는 pool 상태가 반영된 다음 렌더에서야 채워지므로 여기선 직접 만든다
        const loadedById = new Map(loaded.map((p) => [p.idiomId, p]))
        const lookup = mistakes.current.lookup
        const built =
          kind === 'rematch'
            ? buildRematch(loaded, events, { now, limit: buildLimit })
            : kind === 'focus' && focusPairs.length > 0
              ? buildFocus(loaded, events, {
                  pairIds: focusPairs,
                  now,
                  limit: buildLimit,
                  // 대조 — 표면형이 갈리게 번갈아 낸다 (Phase 11). 分解 실패면 null 이라 정렬만 유지된다
                  surfaceOf: (id) => {
                    const it = loadedById.get(id)
                    return it ? surfaceOfPairs(it.headword, it.reading, focusPairs, lookup) : null
                  },
                })
              : // seed 로 제시 순서를 매 세션 섞는다 — 순서를 예측해 모르는 한자를 찍는 걸 막는다 (2026-09-07)
                buildSession(loaded, events, {
                  now,
                  limit: buildLimit,
                  // 담은 것 상한은 **여유분을 뺀 실제 문제 수**로 센다 (2026-09-21)
                  questionLimit: limit,
                  ratio,
                  // 훈독 몫. 풀에 섞는 것으로는 이 비율이 안 나온다 (select.ts 의 kunShare 주석)
                  kunShare: kunPercent / 100,
                  seed: now,
                })
        // 처음 만나는 숙어는 시험 대신 소개로. 그 숙어의 나머지 카드는 이번 세션에서 걷는다.
        // 단, 기록이 얕으면 소개를 안 낸다 — 먼저 풀게 해서 이 사람을 알아야 한다
        const introduced = loadIntroduced()
        const readings = events.filter(
          (e) => e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null,
        ).length
        // 한 번이라도 푼 숙어는 소개 대상이 아니다. 카드 종류를 가리지 않고 숙어 단위로 본다 —
        // 읽기로 푼 숙어의 뜻 카드가 처음 나오는 경우가 있어서다 (2026-09-14)
        const seen = new Set<string>()
        for (const e of events) {
          if (e.type === 'review' && e.deletedAt === null) seen.add(e.idiomId)
        }
        // 같은 표기의 읽기 카드는 한 장으로 접는다 — 「읽기 둘」 카드가 한 번에 다
        // 물으므로, 안 접으면 방금 물어본 표기가 세션 뒤에 또 나온다 (2026-09-14).
        // 소개 배치보다 먼저 해야 한다 — 접힌 카드 자리로 소개 간격이 어긋나지 않게
        const byIdLoaded = new Map(loaded.map((x) => [x.idiomId, x.headword]))
        const folded = foldHomographs(built.cards, (id) => byIdLoaded.get(id))
        const plan = planIntros(
          folded,
          (id) => introduced.has(id),
          (id) => seen.has(id),
          readings,
          limit,
        )
        setIntroIds(plan.introIds)
        const built2 = { ...built, cards: plan.cards }
        setSession(built2)
        setInClassReview(built2.cards[0]?.needsClassReview ?? false)
        shownAt.current = performance.now()
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [kind, focusPairs, limitOverride])

  const card = session?.cards[idx]
  const idiom = card ? byId.get(card.idiomId) : undefined

  /**
   * 같은 표기를 쓰는 다른 숙어가 풀에 있으면 이 카드는 「읽기 둘」 카드다.
   * 답을 안 보고 표기만으로 정한다 — 순서에 따라 다르게 처리되면 안 된다.
   * 상대가 풀에 없으면(밴드 4 만 가진 읽기) 물어볼 카드가 없으니 보통 카드로 둔다.
   */
  const dualPair = useMemo(
    () => (idiom && card?.cardType === 'reading'
      ? pairOf(idiom, byHeadword.get(idiom.headword))
      : undefined),
    [idiom, card, byHeadword],
  )

  const answerCtx = useCallback(
    (): AnswerContext => ({
      ...ctxBase.current,
      at: Date.now(),
      elapsedMs: Math.round(performance.now() - shownAt.current),
    }),
    [],
  )

  /** 이벤트를 DB 에 덧붙이면서 세션 요약용으로도 모아 둔다 */
  const record = useCallback((e: LearningEvent) => {
    void appendEvent(db(), e)
    setSessionEvents((prev) => [...prev, e])
  }, [])

  /** 건너뛸 숙어를 지나 다음 카드 자리를 찾는다 */
  const nextIndexFrom = useCallback(
    (i: number) => {
      let j = i + 1
      while (session && j < session.cards.length && skipIds.current.has(session.cards[j].idiomId)) {
        j++
      }
      return j
    },
    [session],
  )

  const advance = useCallback(
    (correct: boolean) => {
      performance.mark('yomenai:advance')
      cardsSinceObserve.current++
      setTransitionSeq((n) => n + 1)
      setResults((r) => [...r, correct])
      setKnewMeaning(false)
      setFeedback(null)
      setDualGot([])
      setMeaningDone(null)
      setIdx((i) => {
        const j = nextIndexFrom(i)
        setInClassReview(session?.cards[j]?.needsClassReview ?? false)
        return j
      })
      shownAt.current = performance.now()
    },
    [session, nextIndexFrom],
  )

  /** 소개를 보고 넘어간다 — 채점도 이벤트도 없다 */
  const seenIntro = useCallback(() => {
    if (!card) return
    markIntroduced(card.idiomId)
    // 소개에서 읽기·뜻을 다 보여줬으니 같은 숙어를 이번 세션에서 또 묻지 않는다
    skipIds.current.add(card.idiomId)
    setKnewMeaning(false)
    performance.mark('yomenai:advance')
    setTransitionSeq((n) => n + 1)
    setIdx((i) => {
      const j = nextIndexFrom(i)
      setInClassReview(session?.cards[j]?.needsClassReview ?? false)
      return j
    })
    shownAt.current = performance.now()
  }, [card, session, nextIndexFrom])

  /**
   * 판정이 끝난 뒤 피드백을 세운다. 첫 제출과 이어 묻기가 같이 쓴다 —
   * 메아리·관찰 게이트를 두 군데에 복사해 두면 한쪽만 고치는 사고가 난다
   */
  /**
   * 판정이 끝난 뒤 피드백을 세운다. 보통 카드와 「읽기 둘」 카드가 같이 쓴다 —
   * 메아리·관찰 게이트를 두 군데에 복사해 두면 한쪽만 고치는 사고가 난다
   */
  const settle = useCallback(
    (args: {
      answer: string
      correct: boolean
      viaAlt: boolean
      dual: DualOutcome | null
      /** false 면 오답이어도 유형을 안 붙인다 — 「모르겠어요」 와 같은 이유 */
      classify?: boolean
    }) => {
      if (!idiom || !mistakes.current) return
      const { answer, correct, viaAlt, dual } = args
      const { type: mistakeType, voicing } =
        correct || args.classify === false
          ? { type: null, voicing: null }
          : explainMistake(
              { headword: idiom.headword, expected: idiom.reading, answer },
              mistakes.current,
            )
      const pairsOf = (id: string) => byId.get(id)?.pairIds ?? []
      const echo =
        correct && session
          ? onyomiEcho({ pairIds: idiom.pairIds, before: session.state.onyomi, sessionEvents, pairsOf })
          : []

      // 루프 안 관찰 — 정답일 때만, 빈도 게이트를 통과했을 때만
      let observe: Observation | null = null
      if (correct && session) {
        const { gap, cap } = OBSERVE_GATE[observeLevel.current]
        if (cardsSinceObserve.current >= gap && observeShown.current < cap) {
          observe = observeReading({ pairIds: idiom.pairIds, before: session.state.onyomi, sessionEvents, pairsOf })
          if (observe) {
            observeShown.current++
            cardsSinceObserve.current = 0
          }
        }
      }

      setFeedback({
        correct,
        expected: idiom.reading,
        mistakeType,
        voicing,
        answer,
        echo,
        ruby: rubyOf(idiom.headword, idiom.reading, mistakes.current.lookup),
        observe,
        viaAlt,
        dual,
        classify: args.classify !== false,
      })
    },
    [idiom, session, sessionEvents, byId],
  )

  /**
   * 「읽기 둘」 카드의 답을 받는다.
   *
   * 규칙은 한 줄이다 — **쓴 읽기의 카드에만 정답을 남기고, 못 쓴 쪽에는 아무것도 안
   * 남긴다.** 오답은 어느 읽기로도 못 읽었을 때만 생긴다. 그래서 한쪽만 아는 사람이
   * 맞는 읽기를 쓰고도 정답률이 깎이는 일이 없다 (사용자 지적 2026-09-14).
   */
  const answerDual = useCallback(
    (answer: string) => {
      if (!idiom || !dualPair) return
      const all = [
        { idiomId: idiom.idiomId, reading: idiom.reading },
        { idiomId: dualPair.idiomId, reading: dualPair.reading },
      ]
      const left = all.filter((r) => !dualGot.some((g) => g.idiomId === r.idiomId))
      const hit = left.find((r) => isCorrectReading(r.reading, answer))

      if (!hit) {
        // 남은 읽기를 못 썼다. 하나라도 맞힌 게 있으면 오답을 남기지 않는다 —
        // 못 쓴 쪽은 "아직 안 배운 것" 이지 "틀린 것" 이 아니다
        settle({
          answer,
          correct: dualGot.length > 0,
          viaAlt: false,
          dual: { got: dualGot, missedAnswer: dualGot.length > 0 ? null : answer },
        })
        return
      }

      const got = [...dualGot, hit]
      setDualGot(got)
      // 아직 남았으면 이어서 묻는다. 화면은 방금 쓴 읽기를 제외 조건으로 보여준다
      if (got.length < all.length) return
      settle({ answer, correct: true, viaAlt: false, dual: { got, missedAnswer: null } })
    },
    [idiom, dualPair, dualGot, settle],
  )

  const submitReading = useCallback(
    (answer: string) => {
      if (!card || !idiom || !mistakes.current) return
      if (dualPair) {
        answerDual(answer)
        return
      }
      const correct = isCorrectReading(idiom.reading, answer, idiom.altReadings)
      // 상대 숙어가 풀에 없어 물어볼 수 없는 읽기로 맞힌 경우 — 정답으로 치고
      // 이 카드가 묻는 읽기를 한 줄로 알려준다
      const viaAlt = correct && !isCorrectReading(idiom.reading, answer)
      settle({ answer, correct, viaAlt, dual: null })
    },
    [card, idiom, dualPair, answerDual, settle],
  )

  /**
   * 모르겠다고 넘긴다 (테스터 피드백 2026-09-14).
   *
   * 전에는 넘길 길이 없어 **아무 글자나 쳐야 했다.** 그 입력이 오답 유형 분류기를 거쳐
   * 밴드 판정과 처방까지 오염시켰다. 넘기기는 빈 답으로 남는다 —
   * 못 읽은 건 사실이니 오답으로 세되(`isCorrectReading` 이 false),
   * **오답 유형은 안 붙는다** (`classifyMistake` 가 빈 답에 null 을 돌려준다).
   * 무엇을 잘못 골랐는지가 없는데 유형을 붙이면 분포가 거짓이 된다.
   */
  const passReading = useCallback(() => {
    if (dualPair) {
      // 「읽기 둘」 에서 넘기면 여태 맞힌 것만 남는다. 하나라도 맞혔으면 오답은 없다
      settle({
        answer: '',
        correct: dualGot.length > 0,
        viaAlt: false,
        dual: { got: dualGot, missedAnswer: dualGot.length > 0 ? null : '' },
      })
      return
    }
    settle({ answer: '', correct: false, viaAlt: false, dual: null })
  }, [dualPair, dualGot, settle])

  const submitMeaning = useCallback(
    (known: boolean) => {
      if (!card) return
      record(recordMeaningAnswer({ item: card, correct: known, ctx: answerCtx() }))
      // 정답(알고 있었다)이면 멈추지 않고 넘어간다. 오답일 때만 뜻을 다시 보여준다 (PLAN §7)
      if (known) advance(true)
      else setMeaningDone(false)
    },
    [card, answerCtx, advance, record],
  )

  const answerClassReview = useCallback(
    (known: boolean) => {
      if (!card) return
      performance.mark('yomenai:advance')
      setTransitionSeq((n) => n + 1)
      record(recordMeaningKnown({ idiomId: card.idiomId, known, ctx: answerCtx() }))
      if (!known) setUnknownMeaning((prev) => new Set(prev).add(card.idiomId))
      setKnewMeaning(known)
      setInClassReview(false)
      shownAt.current = performance.now()
    },
    [card, answerCtx, record],
  )

  const next = useCallback(
    (confidence?: Confidence) => {
      if (!card || !idiom) return
      if (feedback?.dual) {
        // 「읽기 둘」 — 쓴 읽기의 카드에만 정답을 남긴다. 두 읽기는 처음부터 별도
        // 숙어라 평범한 reading 이벤트 두 개로 끝난다
        for (const g of feedback.dual.got) {
          record(
            recordReadingAnswer({
              item: { idiomId: g.idiomId, cardType: 'reading', mode: card.mode, due: false },
              headword: idiom.headword,
              reading: g.reading,
              answer: g.reading,
              confidence,
              ctx: answerCtx(),
              mistakes: mistakes.current!,
            }),
          )
        }
        // 오답은 어느 읽기로도 못 읽었을 때만. 못 쓴 쪽은 무기록으로 두어
        // 「아직 안 배운 카드」 로 남긴다
        if (feedback.dual.missedAnswer !== null) {
          record(
            recordReadingAnswer({
              item: card,
              headword: idiom.headword,
              reading: idiom.reading,
              answer: feedback.dual.missedAnswer,
              confidence,
              ctx: answerCtx(),
              mistakes: mistakes.current!,
            }),
          )
        }
        advance(feedback.correct)
      } else if (feedback) {
        record(
          recordReadingAnswer({
            item: card,
            headword: idiom.headword,
            reading: idiom.reading,
            answer: feedback.answer,
            altReadings: idiom.altReadings,
            confidence,
            ctx: answerCtx(),
            mistakes: mistakes.current!,
          }),
        )
        advance(feedback.correct)
      } else if (meaningDone !== null) {
        advance(meaningDone)
      }
    },
    [card, idiom, feedback, meaningDone, answerCtx, advance, record],
  )

  const events = useMemo(
    () => ({ prior: priorEvents, session: sessionEvents }),
    [priorEvents, sessionEvents],
  )
  const poolOut = useMemo(() => pool ?? [], [pool])

  const status: StudyStatus = useMemo(() => {
    if (error) return 'error'
    if (!session) return 'loading'
    if (idx >= session.cards.length) return 'done'
    if (inClassReview) return 'classReview'
    if (card && !knewMeaning && (introIds.has(card.idiomId) || unknownMeaning.has(card.idiomId)))
      return 'intro'
    if (card?.cardType === 'reading') return feedback ? 'reading-feedback' : 'reading'
    return meaningDone !== null ? 'meaning-feedback' : 'meaning'
  }, [
    error,
    session,
    idx,
    inClassReview,
    card,
    introIds,
    unknownMeaning,
    knewMeaning,
    feedback,
    meaningDone,
  ])

  const state: StudyState = {
    status,
    error: error ?? undefined,
    card,
    idiom,
    feedback: feedback ?? undefined,
    progress: {
      index: Math.min(idx, session?.cards.length ?? 0),
      total: session?.cards.length ?? 0,
      intros: introIds.size,
    },
    summary: { total: results.length, correct: results.filter(Boolean).length },
    // 사전이 아직 안 왔으면 루비 없이 — 카드가 한자와 읽기를 따로 보여준다
    idiomRuby:
      (status === 'intro' || status === 'meaning' || status === 'meaning-feedback') &&
      idiom !== undefined &&
      rubyOfIdiom !== null
        ? rubyOfIdiom(idiom)
        : undefined,
    events,
    pool: poolOut,
    dualAsk: dualPair
      ? { total: 2, given: dualGot.map((g) => g.reading) }
      : undefined,
    transitionSeq,
  }

  return [
    state,
    {
      submitReading,
      passReading,
      submitMeaning,
      answerClassReview,
      seenIntro,
      next,
    },
  ]
}
