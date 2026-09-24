// 검수 판정만 추려 내보낸다 — 공개 저장소에 커밋할 수 있는 모양으로 (2026-09-24)
//
// 지금까지 앱 판정이 사전까지 가려면 Drive 의 동기화 파일을 통째로 내려받아
// `data/events/` 에 넣어야 했다. 그 파일에는 학습 기록이 그대로 들어 있어
// (무엇을 언제 틀렸는지, 어떤 답을 썼는지) 저장소가 PUBLIC 인 이상 커밋할 수 없다.
//
// **문제는 손이 가는 칸이 아니라 비대칭이었다.** TSV 로 찍은 판정은 저장소에 추적되는데
// (`.gitignore` 의 `*-review.tsv` 예외 — 「사람이 만든 판정은 재생성이 안 된다」)
// 앱에서 찍은 같은 성격의 판정은 내 Drive 에만 남았다. 이 파일이 내는 것은 판정뿐이라
// 검수 TSV 옆에 같은 자격으로 추적된다 — 되짚고 되돌릴 수 있는 원본이 된다.
//
// **걸러내는 게 아니라 좁게 만든다.** 이벤트에서 뺄 것을 빼는 식이면 다음에 필드가 늘 때
// 조용히 같이 나간다. 여기서 네 칸을 직접 쓴다. `deviceId`·`at`·`definition` 은 들어갈
// 자리가 없다.
//
// 판정 글자는 **검수 TSV 의 어휘**다. 이벤트 어휘(`ok`/`bad`+`fix`)를 여기서 한 번만
// 옮기고, 도구는 그대로 받아 적는다.
//   o  맞다 · x  고쳤다(fix 칸) · ~  애매 · -  취소
//
// `-` 는 판정이 아니라 **봤다는 표시**다. 취소한 줄도 작업 파일에는 실어야 다시 볼 수 있다
// (context-notes 2026-09-24). 도구는 `-` 로 검수 TSV 를 덮지 않는다.
import type { LearningEvent, MeaningVoteEvent } from './types.ts'
import { compareEvents, voteOf } from './types.ts'

/** 내려받을 때 붙는 이름. `data/dict/` 에 그대로 넣으면 되게 목적지 이름과 맞춘다 */
export const REVIEW_EXPORT_FILENAME = 'korean-meaning-app-review.tsv'

const HEADER = ['id', 'headword', 'verdict', 'fix']

/** 탭·줄바꿈이 섞이면 TSV 가 깨진다. 사람이 입력칸에 친 뜻이라 실제로 섞일 수 있다 */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * 마지막 `flag` 이벤트가 이긴다 — `replay` 와 같은 규칙.
 * 다만 취소를 버리지 않는다: `replay` 는 화면에 띄울 판정만 들고 있으면 되지만,
 * 여기서는 「한 번이라도 본 줄」이 작업 파일에 실려야 한다
 */
export function buildReviewExport(events: LearningEvent[]): string {
  const last = new Map<string, MeaningVoteEvent>()
  for (const e of events) {
    if (e.type !== 'flag' || e.deletedAt !== null) continue
    const prev = last.get(e.idiomId)
    if (prev !== undefined && compareEvents(prev, e) > 0) continue
    last.set(e.idiomId, e)
  }

  const rows = [...last.values()]
    .map((e): [string, string, string, string] => {
      const verdict = voteOf(e)
      const fix = oneLine(e.fix ?? '')
      const mark = verdict === null ? '-' : verdict === 'ok' ? 'o' : fix ? 'x' : '~'
      return [e.idiomId, oneLine(e.headword), mark, mark === 'x' ? fix : '']
    })
    // 표기순 고정 — 다시 내보내도 줄 순서가 안 흔들려야 git diff 가 판정 변화만 보여 준다
    .sort((a, b) => a[1].localeCompare(b[1], 'ja') || a[0].localeCompare(b[0]))

  return [HEADER, ...rows].map((r) => r.join('\t')).join('\n') + '\n'
}
