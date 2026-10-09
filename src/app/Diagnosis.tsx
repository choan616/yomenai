// 진단 소견 시트 본문 — 문단 제목과 문장 줄 (문장은 `diagnosis.ts` 가 만든다)
import type { Paragraph } from './diagnosis.ts'
import { Mixed } from './RuleBody.tsx'

export function Diagnosis({ paragraphs }: { paragraphs: readonly Paragraph[] }) {
  return (
    <section className="opinion">
      {paragraphs.map((p) => (
        <div className="opinion-sec" key={p.key}>
          <h3 className="opinion-h">{p.title}</h3>
          {p.lines.map((line, i) => (
            <p className="opinion-line" key={i}>
              {/* 문장 속 일본어(표기·예시)에 lang="ja" — 안 붙이면 한국 자형으로 나간다 */}
              <Mixed text={line} />
            </p>
          ))}
        </div>
      ))}
      <p className="opinion-note">기록에서 숫자를 뽑아 쓴 소견이에요. 새로 풀면 달라져요.</p>
    </section>
  )
}
