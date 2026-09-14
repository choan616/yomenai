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
import { classifyMistake } from '../core/mistakes.ts'
import { onyomiEcho, type OnyomiEcho } from '../core/echo.ts'
import { observeReading, type Observation } from '../core/observe.ts'
import { rubyOf, type RubySegment } from '../core/ruby.ts'
import { siblingFor } from './homograph.ts'
import { buildFocus, buildRematch } from '../core/session.ts'
import { surfaceOfPair } from '../core/surface.ts'
import type { Confidence } from '../core/scheduler.ts'
import type { LearningEvent, MistakeType } from '../core/types.ts'
import { appendEvent } from '../db/events.ts'
import { loadIntroduced, markIntroduced } from './introduced.ts'
import { INTRO_MAX_SHARE, planIntros } from './planIntros.ts'
import { getDeviceId } from '../db/device.ts'
import { db } from '../db/schema.ts'
import { LOCAL_USER_ID } from '../db/events.ts'
import { listEvents } from '../db/events.ts'
import { loadBaseIdioms, loadKanji, type RuntimeIdiom } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { loadSettings, OBSERVE_GATE, type ObserveLevel } from '../app/settings.ts'

/** 읽기 답안을 낸 직후의 판정 결과. 이벤트는 아직 안 쓴다 — 자신감 버튼을 기다린다 */
export interface ReadingFeedback {
  correct: boolean
  expected: string
  mistakeType: MistakeType | null
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
  /**
   * 이어 묻기를 거쳤고 다른 읽기는 맞혔을 때 그 읽기. 이 카드의 정오답과는 별개다 —
   * 「いちば 는 맞혔어요」 를 보여주려고 남긴다
   */
  alsoKnew: string | null
  /**
   * 오답 유형을 붙여도 되는 답인지. **이벤트에도 그대로 넘긴다** —
   * `recordReadingAnswer` 가 유형을 다시 계산하므로 화면에만 걸면 기록이 어긋난다
   */
  classify: boolean
}

/**
 * 동형이독 이어 묻기 (2026-09-14).
 *
 * 市場 에 いちば 라고 쓰면 맞는 답이다. 하지만 이 카드가 묻는 건 しじょう 다.
 * 그냥 정답 처리하고 넘어가면 **다른 쪽을 아는지는 끝내 모른 채** 지나간다.
 * 그래서 넘어가지 않고 「いちば 말고」 를 붙여 한 번 더 묻는다.
 *
 * 두 읽기는 이미 각각 별도의 숙어(별도 idiomId)이므로 새 카드 종류를 만들 필요가 없다.
 * 맞힌 읽기 쪽 숙어에도 정답 이벤트를 남기면 그 카드의 FSRS 도 같이 전진한다.
 */
export interface FollowUp {
  /** 방금 맞힌 *다른* 읽기 — 문제에 「이것 말고」 로 띄운다 */
  knownReading: string
  /** 그 읽기를 가진 숙어. 여기에도 정답 이벤트를 남긴다 */
  knownIdiomId: string
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
  /** 이어 묻기 중이면 채워진다 — 같은 카드에서 다른 읽기를 한 번 더 묻는 상태 */
  followUp?: FollowUp
  /** 카드 전환마다 1 증가. 화면이 전환 시간을 실측하는 트리거 (PLAN §7) */
  transitionSeq: number
}

export interface StudyActions {
  /** 읽기 답안 제출 — 판정만 하고 피드백을 띄운다 */
  submitReading: (answer: string) => void
  /** 모르겠다고 넘긴다 — 빈 답으로 남아 오답 유형이 안 붙는다 (2026-09-14) */
  passReading: () => void
  /** 이어 묻기의 답 — 대체 읽기는 안 받는다 (「그것 말고」 라고 물었으니) */
  submitFollowUp: (answer: string) => void
  /** 이어 묻기를 모르겠다고 넘긴다 — 이 카드는 오답, 맞힌 쪽은 그대로 */
  passFollowUp: () => void
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
 * 정규 세션 / 예전에 틀린 것만 모은 재대결 / 한 음독만 모은 집중 세션.
 * `focus` 는 `focusPairId` 를 같이 받아야 한다 (리포트의 처방이 정한다, Phase 10).
 */
export type SessionKind = 'normal' | 'rematch' | 'focus'

export interface StudySessionOptions {
  kind?: SessionKind
  /** `kind='focus'` 일 때 집중할 (한자, 음독) 쌍 */
  focusPairId?: string
  /**
   * 세션 길이를 설정값 대신 이 값으로. "3장만" 진입로가 쓴다 (Phase 11).
   * 설정을 안 건드리므로 다음 세션은 다시 원래 길이로 돌아온다.
   */
  limit?: number
}

export function useStudySession({
  kind = 'normal',
  focusPairId,
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
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  /** 지연 검수 질문을 아직 안 지난 카드인지 */
  const [inClassReview, setInClassReview] = useState(false)
  const [feedback, setFeedback] = useState<ReadingFeedback | null>(null)
  // 이어 묻기 상태. settle 에서 지우지 않는다 — next 가 맞힌 쪽 숙어 id 를 여기서 읽는다
  const [followUp, setFollowUp] = useState<FollowUp | null>(null)
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

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [loaded, kanji, events] = await Promise.all([
          loadBaseIdioms(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        setPool(loaded)
        setPriorEvents(events)
        mistakes.current = mistakeContextFromKanji(kanji)
        const rubyLookup = mistakes.current.lookup
        setRubyOfIdiom(() => (i: RuntimeIdiom) => rubyOf(i.headword, i.reading, rubyLookup))
        const { sessionLimit, ratio, observeLevel: lvl } = loadSettings()
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
            : kind === 'focus' && focusPairId !== undefined
              ? buildFocus(loaded, events, {
                  pairId: focusPairId,
                  now,
                  limit: buildLimit,
                  // 대조 — 표면형이 갈리게 번갈아 낸다 (Phase 11). 分解 실패면 null 이라 정렬만 유지된다
                  surfaceOf: (id) => {
                    const it = loadedById.get(id)
                    return it ? surfaceOfPair(it.headword, it.reading, focusPairId, lookup) : null
                  },
                })
              : // seed 로 제시 순서를 매 세션 섞는다 — 순서를 예측해 모르는 한자를 찍는 걸 막는다 (2026-09-07)
                buildSession(loaded, events, { now, limit: buildLimit, ratio, seed: now })
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
        const plan = planIntros(
          built.cards,
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
  }, [kind, focusPairId, limitOverride])

  const card = session?.cards[idx]
  const idiom = card ? byId.get(card.idiomId) : undefined

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

  const advance = useCallback(
    (correct: boolean) => {
      performance.mark('yomenai:advance')
      cardsSinceObserve.current++
      setTransitionSeq((n) => n + 1)
      setResults((r) => [...r, correct])
      setKnewMeaning(false)
      setFeedback(null)
      setFollowUp(null)
      setMeaningDone(null)
      setIdx((i) => {
        const nextCard = session?.cards[i + 1]
        setInClassReview(nextCard?.needsClassReview ?? false)
        return i + 1
      })
      shownAt.current = performance.now()
    },
    [session],
  )

  /** 소개를 보고 넘어간다 — 채점도 이벤트도 없다 */
  const seenIntro = useCallback(() => {
    if (!card) return
    markIntroduced(card.idiomId)
    setKnewMeaning(false)
    performance.mark('yomenai:advance')
    setTransitionSeq((n) => n + 1)
    setIdx((i) => {
      const nextCard = session?.cards[i + 1]
      setInClassReview(nextCard?.needsClassReview ?? false)
      return i + 1
    })
    shownAt.current = performance.now()
  }, [card, session])

  /**
   * 판정이 끝난 뒤 피드백을 세운다. 첫 제출과 이어 묻기가 같이 쓴다 —
   * 메아리·관찰 게이트를 두 군데에 복사해 두면 한쪽만 고치는 사고가 난다
   */
  const settle = useCallback(
    (args: {
      answer: string
      correct: boolean
      alsoKnew: string | null
      viaAlt: boolean
      /** false 면 오답이어도 유형을 안 붙인다 — 「모르겠어요」 와 같은 이유 */
      classify?: boolean
    }) => {
      if (!idiom || !mistakes.current) return
      const { answer, correct, alsoKnew, viaAlt } = args
      const mistakeType =
        correct || args.classify === false
          ? null
          : classifyMistake(
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

      const ruby = rubyOf(idiom.headword, idiom.reading, mistakes.current.lookup)
      setFeedback({
        correct,
        expected: idiom.reading,
        mistakeType,
        answer,
        echo,
        ruby,
        observe,
        viaAlt,
        alsoKnew,
        classify: args.classify !== false,
      })
    },
    [idiom, session, sessionEvents, byId],
  )

  const submitReading = useCallback(
    (answer: string) => {
      if (!card || !idiom || !mistakes.current) return
      const correct = isCorrectReading(idiom.reading, answer, idiom.altReadings)
      // 정답이지만 이 카드의 읽기와는 다르다 = 동형이독의 다른 쪽을 쓴 것
      const viaAlt = correct && !isCorrectReading(idiom.reading, answer)

      // 이어 묻기 — 상대 숙어가 지금 풀에 있을 때만 할 수 있다. 없으면(밴드 4 만 가진
      // 읽기 등) 물어볼 카드가 없으니 한 줄 안내로 끝낸다
      if (viaAlt) {
        const sib = siblingFor(idiom, answer, byHeadword.get(idiom.headword))
        if (sib) {
          setFollowUp({ knownReading: sib.reading, knownIdiomId: sib.idiomId })
          return
        }
      }
      settle({ answer, correct, alsoKnew: null, viaAlt })
    },
    [card, idiom, byHeadword, settle],
  )

  /**
   * 이어 묻기의 답. 여기서는 **대체 읽기를 안 받는다** — 방금 「그것 말고」 라고
   * 물었으니 이 카드의 읽기만 정답이다.
   */
  const submitFollowUp = useCallback(
    (answer: string) => {
      if (!idiom || !followUp) return
      const correct = isCorrectReading(idiom.reading, answer)
      // 또 대체 읽기를 쓴 경우 — 오답이되 **유형은 안 붙인다.** 읽기를 잘못 고른 게
      // 아니라 다른 쪽을 못 꺼낸 것이라, 유형을 붙이면 오답 분포가 거짓이 된다
      // (「모르겠어요」 와 같은 이유, context-notes 2026-09-14)
      const repeated =
        !correct && isCorrectReading(idiom.reading, answer, idiom.altReadings)
      settle({
        answer,
        correct,
        alsoKnew: followUp.knownReading,
        viaAlt: false,
        classify: !repeated,
      })
    },
    [idiom, followUp, settle],
  )

  /** 이어 묻기에서 모르겠다고 넘긴다 — 이 카드는 오답, 맞힌 쪽은 그대로 남는다 */
  const passFollowUp = useCallback(() => {
    if (!followUp) return
    settle({ answer: '', correct: false, alsoKnew: followUp.knownReading, viaAlt: false })
  }, [followUp, settle])

  // 첫 제출의 「모르겠어요」 는 빈 답이라 분류기가 스스로 null 을 낸다 — classify 를
  // 따로 넘길 일이 없다 (src/core/mistakes.ts 의 빈 답 처리)

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
    settle({ answer: '', correct: false, alsoKnew: null, viaAlt: false })
  }, [settle])

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
      setKnewMeaning(known)
      setInClassReview(false)
      shownAt.current = performance.now()
    },
    [card, answerCtx, record],
  )

  const next = useCallback(
    (confidence?: Confidence) => {
      if (!card || !idiom) return
      if (feedback) {
        record(
          recordReadingAnswer({
            item: card,
            headword: idiom.headword,
            reading: idiom.reading,
            answer: feedback.answer,
            // 이어 묻기를 거쳤으면 대체 읽기를 다시 받아주면 안 된다 —
            // 방금 「그것 말고」 라고 물었다
            altReadings: feedback.alsoKnew === null ? idiom.altReadings : undefined,
            classify: feedback.classify,
            confidence,
            ctx: answerCtx(),
            mistakes: mistakes.current!,
          }),
        )
        // 이어 묻기에서 맞힌 다른 읽기는 **그 숙어의 카드**에도 남긴다.
        // 두 읽기는 처음부터 별도 숙어라 스키마를 건드릴 것이 없다 —
        // 그 카드의 FSRS 도 같이 전진한다 (2026-09-14)
        if (followUp) {
          record(
            recordReadingAnswer({
              item: { idiomId: followUp.knownIdiomId, cardType: 'reading', mode: card.mode, due: false },
              headword: idiom.headword,
              reading: followUp.knownReading,
              answer: followUp.knownReading,
              confidence,
              ctx: answerCtx(),
              mistakes: mistakes.current!,
            }),
          )
        }
        advance(feedback.correct)
      } else if (meaningDone !== null) {
        advance(meaningDone)
      }
    },
    [card, idiom, feedback, followUp, meaningDone, answerCtx, advance, record],
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
    if (card && !knewMeaning && introIds.has(card.idiomId)) return 'intro'
    if (card?.cardType === 'reading') return feedback ? 'reading-feedback' : 'reading'
    return meaningDone !== null ? 'meaning-feedback' : 'meaning'
  }, [error, session, idx, inClassReview, card, introIds, knewMeaning, feedback, meaningDone])

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
    followUp: followUp ?? undefined,
    transitionSeq,
  }

  return [
    state,
    {
      submitReading,
      passReading,
      submitFollowUp,
      passFollowUp,
      submitMeaning,
      answerClassReview,
      seenIntro,
      next,
    },
  ]
}
