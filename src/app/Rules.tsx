// 읽기 규칙 화면 — 음운 변화의 지도 + 내가 그 규칙으로 틀린 기록 (2026-09-17).
//
// 읽을거리가 아니라 **색인**이다. 절마다 내 오답 기록이 붙어서 갈 때마다 내용이 달라진다.
// 세션 중에는 여기로 안 온다 — 나가면 세션 큐가 초기화되므로, 카드 옆에서는 오답 상세가
// 같은 절을 인라인으로 펼친다 (context-notes 2026-09-17).
import { useEffect, useRef, useState } from 'react'
import {
  classifiedMistakes,
  ruleRecord,
  effectiveMistake,
  verdictByEvent,
  type RuleRecord,
} from '../core/ruleRecord.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { MISTAKE_LABEL, VOICING_LABEL } from '../study/mistakeLabels.ts'
import { Mixed, RuleBody } from './RuleBody.tsx'
import { RULE_SECTIONS, type RuleId, type RuleSection } from './rules.ts'

interface Props {
  onBack: () => void
  /** 열린 채로 뜰 절. 리포트 처방에서 들어올 때 쓴다 */
  focus?: RuleId | null
}

export function Rules({ onBack, focus = null }: Props) {
  const [open, setOpen] = useState<RuleId | null>(focus)
  const [records, setRecords] = useState<Map<RuleId, RuleRecord> | null>(null)
  const focused = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, kanji, events] = await Promise.all([
          loadBaseIdioms(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        const nameOf = (id: string) => {
          const p = byId.get(id)
          return p && { headword: p.headword, reading: p.reading }
        }

        // 유형·갈래는 한 번만 다시 매기고 절마다 재사용한다 (절 8개 × 이벤트 N 을 피한다).
        // 다시보기 배지도 같은 함수를 쓴다 — 갈라지면 배지와 절이 다른 규칙을 가리킨다
        const ctx = mistakeContextFromKanji(kanji)
        const wrong = classifiedMistakes(events)
        const verdictOf = verdictByEvent(wrong, ctx, (id) => byId.get(id)?.headword)

        setRecords(
          new Map(
            RULE_SECTIONS.map((s) => [
              s.id,
              ruleRecord(
                wrong,
                (e) => {
                  const now = effectiveMistake(e, verdictOf)
                  if (now === null) return false
                  return (
                    s.mistakes.includes(now.type) &&
                    (s.voicing === undefined || now.voicing === s.voicing)
                  )
                },
                nameOf,
              ),
            ]),
          ),
        )
      } catch {
        // 기록을 못 읽어도 본문은 읽을 수 있어야 한다 — 빈 기록으로 둔다
        if (alive) setRecords(new Map())
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 처방에서 들어오면 그 절이 화면 안에 들어와 있어야 한다
  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'start' })
  }, [])

  return (
    <section className="screen rules">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ←
        </button>
        <h2>읽기 규칙</h2>
      </div>

      <div className="screen-body">
        <p className="rules-lead">
          한국 한자음이 음독의 꼬리를 정하고, 그 꼬리에서 촉음·반탁·연성·장음이 갈려요. 연탁은
          훈독 쪽 갈래예요. 위에서부터 읽으면 한 줄기로 이어져요.
        </p>

        {RULE_SECTIONS.map((s) => (
          <RuleBlock
            key={s.id}
            section={s}
            record={records?.get(s.id) ?? null}
            open={open === s.id}
            onToggle={() => setOpen((cur) => (cur === s.id ? null : s.id))}
            ref={s.id === focus ? focused : null}
          />
        ))}
      </div>
    </section>
  )
}

function RuleBlock({
  section,
  record,
  open,
  onToggle,
  ref,
}: {
  section: RuleSection
  record: RuleRecord | null
  open: boolean
  onToggle: () => void
  ref: React.Ref<HTMLDivElement> | null
}) {
  const count = record?.count ?? 0
  return (
    <div className="rule-block" ref={ref}>
      <button type="button" className="rule-head" onClick={onToggle} aria-expanded={open}>
        <span className="rule-title">{section.title}</span>
        <span className="rule-mark" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
        <span className="rule-summary">
          <Mixed text={section.summary} />
        </span>
        {count > 0 && <span className="rule-count">이 규칙으로 {count}번</span>}
      </button>

      {open && (
        <div className="rule-open">
          <RuleBody section={section} />
          <RuleRecordView section={section} record={record} />
        </div>
      )}
    </div>
  )
}

function RuleRecordView({ section, record }: { section: RuleSection; record: RuleRecord | null }) {
  // 탁음 세 절은 같은 유형(RENDAKU)을 나눠 가지므로 절의 갈래 이름을 쓴다 — 셋 다
  // 「연탁」으로 뜨면 숫자가 왜 다른지 설명이 안 된다
  const labels =
    section.voicing !== undefined
      ? VOICING_LABEL[section.voicing]
      : section.mistakes.map((m) => MISTAKE_LABEL[m]).join(' · ')
  if (record === null) return <p className="dim rule-record">기록을 불러오고 있어요…</p>
  if (record.count === 0) {
    return (
      <p className="dim rule-record">
        아직 이 규칙(<span className="tag">{labels}</span>)으로 틀린 기록이 없어요.
      </p>
    )
  }
  return (
    <div className="rule-record">
      <p className="section-title">
        내가 이 규칙으로 틀린 것 — {record.count}번
        <span className="tag">{labels}</span>
      </p>
      <ul className="rows">
        {record.idioms.map((i) => (
          <li key={i.id}>
            <span className="r-main" lang="ja">
              {i.headword}
            </span>
            <span className="r-sub r-ja" lang="ja">
              {i.reading}
            </span>
            <span className="r-tail">{i.wrong}번</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
