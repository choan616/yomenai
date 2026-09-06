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
import { buildRematch } from '../core/session.ts'
import type { Confidence } from '../core/scheduler.ts'
import type { LearningEvent, MistakeType } from '../core/types.ts'
import { appendEvent } from '../db/events.ts'
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
}

export type StudyStatus =
  | 'loading'
  | 'error'
  | 'classReview'
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
  progress: { index: number; total: number }
  summary: { total: number; correct: number }
  /** 종료 요약이 쓰는 이벤트 — 세션 이전 로그와 이번 세션에 쌓은 로그 */
  events: { prior: LearningEvent[]; session: LearningEvent[] }
  /** 요약이 숙어 이름과 음독 쌍을 찾는 데 쓴다 */
  pool: RuntimeIdiom[]
  /** 카드 전환마다 1 증가. 화면이 전환 시간을 실측하는 트리거 (PLAN §7) */
  transitionSeq: number
}

export interface StudyActions {
  /** 읽기 답안 제출 — 판정만 하고 피드백을 띄운다 */
  submitReading: (answer: string) => void
  /** 뜻 카드 자기 채점 — 뜻을 확인한 뒤 안다/모른다 */
  submitMeaning: (known: boolean) => void
  /** "뜻은 알고 계셨나요" 지연 검수 응답 */
  answerClassReview: (known: boolean) => void
  /** 피드백을 닫고 다음 카드로. 정답이면 자신감 보정을 함께 넘긴다 */
  next: (confidence?: Confidence) => void
}

/** 정규 세션인지, 예전에 틀린 것만 모은 재대결인지 */
export type SessionKind = 'normal' | 'rematch'

export function useStudySession(kind: SessionKind = 'normal'): [StudyState, StudyActions] {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  /** 지연 검수 질문을 아직 안 지난 카드인지 */
  const [inClassReview, setInClassReview] = useState(false)
  const [feedback, setFeedback] = useState<ReadingFeedback | null>(null)
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
        const { sessionLimit, ratio, observeLevel: lvl } = loadSettings()
        observeLevel.current = lvl
        const now = Date.now()
        const built =
          kind === 'rematch'
            ? buildRematch(loaded, events, { now, limit: sessionLimit })
            : buildSession(loaded, events, { now, limit: sessionLimit, ratio })
        setSession(built)
        setInClassReview(built.cards[0]?.needsClassReview ?? false)
        shownAt.current = performance.now()
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [kind])

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
      setFeedback(null)
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

  const submitReading = useCallback(
    (answer: string) => {
      if (!card || !idiom || !mistakes.current) return
      const correct = isCorrectReading(idiom.reading, answer)
      const mistakeType = correct
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
      setFeedback({ correct, expected: idiom.reading, mistakeType, answer, echo, ruby, observe })
    },
    [card, idiom, session, sessionEvents, byId],
  )

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
    if (card?.cardType === 'reading') return feedback ? 'reading-feedback' : 'reading'
    return meaningDone !== null ? 'meaning-feedback' : 'meaning'
  }, [error, session, idx, inClassReview, card, feedback, meaningDone])

  const state: StudyState = {
    status,
    error: error ?? undefined,
    card,
    idiom,
    feedback: feedback ?? undefined,
    progress: { index: Math.min(idx, session?.cards.length ?? 0), total: session?.cards.length ?? 0 },
    summary: { total: results.length, correct: results.filter(Boolean).length },
    events,
    pool: poolOut,
    transitionSeq,
  }

  return [state, { submitReading, submitMeaning, answerClassReview, next }]
}
