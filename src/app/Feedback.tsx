// 피드백 화면 — 테스터가 앱 안에서 바로 답한다 (2026-09-13).
//
// **학습 데이터는 한 줄도 자동으로 안 나간다.** 오답 유형은 화면에 보여만 주고,
// 테스터가 고른 값만 전송된다. 무엇이 나가는지 보내기 전에 그대로 보여준다.
import { useEffect, useState } from 'react'
import { mistakeTotals, replay } from '../core/replay.ts'
import type { MistakeType } from '../core/types.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { MISTAKE_LABEL } from '../study/mistakeLabels.ts'
import { FEEDBACK_ENDPOINT, sendFeedback } from './feedbackEndpoint.ts'

/** 분류기가 실제로 내는 6종. OKURIGANA 는 예약 슬롯이라 뺀다 */
const ASKED: MistakeType[] = [
  'KO_INTERFERENCE',
  'ONYOMI_CHOICE',
  'RENDAKU',
  'SOKUON',
  'CHOON',
  'MIXED_READING',
]

const LADDER = ['체감과 맞아요', '쉬운데 흔들림으로 떠요', '어려운데 안정으로 떠요', '잘 모르겠어요']

interface Answers {
  usage: string
  topMistake: string
  ladder: string
  firstThirty: string
  intro: string
  keep: string
  issues: string
}

const EMPTY: Answers = {
  usage: '',
  topMistake: '',
  ladder: '',
  firstThirty: '',
  intro: '',
  keep: '',
  issues: '',
}

/** 엄지로 평가해 둔 뜻. 사전 없이 이벤트만으로 읽힌다 */
export type VoteList = { verdict: 'ok' | 'bad'; headword: string; definition: string }[]

function composeAnswers(a: Answers): string {
  return [
    `[얼마나 썼나] ${a.usage || '-'}`,
    `[가장 큰 오답 유형] ${a.topMistake || '-'}`,
    `[밴드 사다리] ${a.ladder || '-'}`,
    `[처음 30문항] ${a.firstThirty || '-'}`,
    `[알아 두기 카드] ${a.intro || '-'}`,
    `[계속 쓰고 싶은지] ${a.keep || '-'}`,
    `[이상했던 곳] ${a.issues || '-'}`,
  ].join('\n')
}

/** 판정별로 가른 절. 받는 쪽에서 하는 일이 다르다 — 「맞다」는 워크리스트에 o, 「이상하다」는 고칠 목록 */
const VOTE_SECTIONS = [
  ['이상하다고 본 뜻', 'bad'],
  ['맞다고 본 뜻', 'ok'],
] as const

/**
 * 평가해 둔 뜻 — **보내는 내용에만 붙는다** (2026-10-02 사용자 지시 「노출하지 않아도 될 것 같다.
 * 숨겨놓고 보내기만」). 목록이 길어 미리보기를 다 먹었고, 테스터가 답을 적는 화면에서 읽을 글도
 * 아니다. 대신 몇 건이 함께 가는지는 `voteSummary` 가 말한다 — 안 보인다고 안 보내는 건 아니다.
 *
 * 빈 절은 안 붙인다: 「0건」과 「기능을 안 씀」이 구분되지 않는다
 */
function composeVotes(votes: VoteList): string {
  const lines: string[] = []
  for (const [label, verdict] of VOTE_SECTIONS) {
    const list = votes.filter((v) => v.verdict === verdict)
    if (list.length === 0) continue
    lines.push('', `[${label} ${list.length}건]`)
    for (const v of list) lines.push(`- ${v.headword} — ${v.definition}`)
  }
  return lines.join('\n')
}

/** 미리보기에 목록 대신 들어가는 한 줄. 평가가 없으면 빈 문자열 */
function voteSummary(votes: VoteList): string {
  const parts = VOTE_SECTIONS.map(([label, verdict]) => {
    const n = votes.filter((v) => v.verdict === verdict).length
    return n > 0 ? `${label} ${n}건` : null
  }).filter((s): s is string => s !== null)
  return parts.length === 0 ? '' : `[뜻 평가] ${parts.join(' · ')} — 목록은 함께 보내요`
}

export function Feedback({ onBack }: { onBack: () => void }) {
  const [a, setA] = useState<Answers>(EMPTY)
  /** 내 리포트의 가장 큰 오답 유형 — 화면에 보여만 준다. 고르는 건 테스터다 */
  const [hint, setHint] = useState<string | null>(null)
  const [state, setState] = useState<'writing' | 'sending' | 'sent'>('writing')
  const [copied, setCopied] = useState(false)
  /** 엄지로 평가해 둔 뜻 — 답변과 함께 나간다. 아래 미리보기에 그대로 보인다 */
  const [votes, setVotes] = useState<VoteList>([])

  useEffect(() => {
    let alive = true
    void listEvents(db(), LOCAL_USER_ID).then((events) => {
      if (!alive) return
      // 사전을 안 읽는다 — 오답 유형 집계도 평가 목록도 이벤트만으로 난다
      const state = replay(events)
      setVotes([...state.meaningVotes.values()])
      const totals = mistakeTotals(state)
      const top = ASKED.map((t) => [t, totals[t] ?? 0] as const)
        .filter(([, n]) => n > 0)
        .sort((x, y) => y[1] - x[1])[0]
      setHint(top ? MISTAKE_LABEL[top[0]] : null)
    })
    return () => {
      alive = false
    }
  }, [])

  /** 실제로 나가는 내용 — 답변 + 평가 목록 */
  const body = composeAnswers(a) + composeVotes(votes)
  /** 화면에 보이는 내용 — 평가는 목록 대신 건수만 (2026-10-02 사용자 지시) */
  const summary = voteSummary(votes)
  const preview = summary === '' ? composeAnswers(a) : `${composeAnswers(a)}\n\n${summary}`
  const set = (k: keyof Answers) => (v: string) => setA((prev) => ({ ...prev, [k]: v }))

  const handleSend = () => {
    setState('sending')
    void sendFeedback(body).finally(() => setState('sent'))
  }

  const handleCopy = () => {
    void navigator.clipboard?.writeText(body).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  }

  return (
    <section className="screen feedback">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ‹
        </button>
        <h2>피드백 보내기</h2>
      </div>

      <div className="screen-body">
        <p className="fb-lead">
          이 앱이 도움이 되는지, 다른 사람에게도 맞을지를 보려고 여쭙습니다.
          <strong> 채점 기록은 보내지 않아요.</strong> 아래에 적으신 답과,
          뜻에 엄지로 남기신 평가{votes.length > 0 && ` ${votes.length}건`}이 갑니다 —
          평가는 목록이 길어서 미리보기에 <strong>건수만</strong> 적고, 보낼 때는 목록째로 갑니다.
        </p>

        {state === 'sent' ? (
          <div className="fb-done">
            <p>보냈어요. 고맙습니다.</p>
            <p className="hint">
              전송이 됐는지는 이 화면에서 확인할 수 없어요. 확실히 하시려면 아래 내용을 복사해
              따로 보내 주셔도 됩니다 — 복사에는 뜻 평가 목록까지 들어갑니다.
            </p>
            <pre className="fb-preview">{preview}</pre>
            <button type="button" onClick={handleCopy}>
              {copied ? '복사했어요' : '내용 복사'}
            </button>
            <button type="button" className="btn-primary" onClick={onBack}>
              돌아가기
            </button>
          </div>
        ) : (
          <>
            <div className="setting">
              <label htmlFor="fb-usage">며칠 동안 세션을 몇 번쯤 하셨나요</label>
              <input
                id="fb-usage"
                type="text"
                value={a.usage}
                onChange={(e) => set('usage')(e.target.value)}
                placeholder="예: 사흘 동안 다섯 번쯤"
              />
              <span className="hint">답을 읽으려면 이것만은 필요해요. 20문항 뒤의 소감과 500문항 뒤의 소감은 뜻이 다르니까요.</span>
            </div>

            <div className="setting">
              <label>가장 큰 오답 유형은 무엇이었나요</label>
              <div className="fb-choices">
                {ASKED.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={a.topMistake === MISTAKE_LABEL[t] ? 'chosen' : ''}
                    onClick={() => set('topMistake')(MISTAKE_LABEL[t])}
                  >
                    {MISTAKE_LABEL[t]}
                  </button>
                ))}
                <button
                  type="button"
                  className={a.topMistake === '모르겠어요' ? 'chosen' : ''}
                  onClick={() => set('topMistake')('모르겠어요')}
                >
                  모르겠어요
                </button>
              </div>
              <span className="hint">
                {hint === null
                  ? '진단 리포트의 「오답 유형 분포」에서 확인하실 수 있어요.'
                  : `참고 — 이 기기 기록으로는 「${hint}」가 가장 많아요. 이 값은 안 보내니 직접 골라 주세요.`}
              </span>
            </div>

            <div className="setting">
              <label>리포트의 밴드 사다리가 체감과 맞나요</label>
              <div className="fb-choices">
                {LADDER.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={a.ladder === v ? 'chosen' : ''}
                    onClick={() => set('ladder')(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting">
              <label htmlFor="fb-first">처음 30문항 구간이 어땠나요</label>
              <textarea
                id="fb-first"
                rows={3}
                value={a.firstThirty}
                onChange={(e) => set('firstThirty')(e.target.value)}
                placeholder="설명 없이 모르는 단어를 계속 만나는 구간이에요. 레벨 테스트로 읽히던가요, 막막하던가요."
              />
            </div>

            <div className="setting">
              <label htmlFor="fb-intro">「알아 두기」로 본 단어가 다음에 기억나던가요</label>
              <textarea
                id="fb-intro"
                rows={3}
                value={a.intro}
                onChange={(e) => set('intro')(e.target.value)}
                placeholder="뜻 한 줄과 예문 한 줄로 충분한지, 무엇이 더 필요한지."
              />
            </div>

            <div className="setting">
              <label htmlFor="fb-keep">계속 쓰고 싶으신가요, 그 이유는</label>
              <textarea
                id="fb-keep"
                rows={3}
                value={a.keep}
                onChange={(e) => set('keep')(e.target.value)}
              />
            </div>

            <div className="setting">
              <label htmlFor="fb-issues">이상하거나 막혔던 곳</label>
              <textarea
                id="fb-issues"
                rows={3}
                value={a.issues}
                onChange={(e) => set('issues')(e.target.value)}
              />
            </div>

            <div className="setting">
              <label>보낼 내용</label>
              <pre className="fb-preview">{preview}</pre>
              <span className="hint">
                개발자의 Google 스프레드시트로 갑니다.
                {summary !== '' && ' 뜻 평가는 목록 대신 건수만 적었지만 목록째로 나가요.'}
              </span>
            </div>

            <div className="setting">
              {FEEDBACK_ENDPOINT === '' ? (
                <>
                  <button type="button" className="btn-primary" onClick={handleCopy}>
                    {copied ? '복사했어요' : '내용 복사'}
                  </button>
                  <span className="hint">아직 전송 주소가 연결되지 않았어요. 복사해서 보내 주세요.</span>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={state === 'sending'}
                  >
                    {state === 'sending' ? '보내는 중…' : '보내기'}
                  </button>
                  <span className="hint">이름도 연락처도 받지 않아요. 익명이라 되물을 수는 없어요.</span>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
