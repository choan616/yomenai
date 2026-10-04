// 카드에 뜨는 한국어 뜻 한 줄의 표기 규칙. 여러 뜻은 쉼표로 가른다 (사용자 요청 2026-09-12)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 뜻이 여럿일 때 구분자를 `, ` 로 통일한다.
 *
 * 번역 파이프라인(`translate-gloss`)이 오래 `"; "` 를 쓰던 흔적을 걷어낸다. 프롬프트는
 * 쉼표로 바꿨지만 이미 만들어 둔 17,000여 건을 다시 돌릴 이유가 없어 반영 시점에 고친다.
 *
 * - `;` 앞뒤 공백은 하나의 `, ` 로 접는다 (`반면;얼굴의 반` 처럼 붙여 쓴 것도 잡는다)
 * - 구분자 뒤에 홀로 남은 마침표는 버린다 (`가느다람;.(몸매가)` 같은 번역 잡음)
 * - 끝에 매달린 구분자와 공백은 잘라낸다 (`의류;` → `의류`)
 */
/**
 * 번역기가 글자 하나를 UTF-8 바이트 토큰으로 흘린 것을 되살린다 (2026-10-04 사용자 「華奢 가<0xEB><0x83><0x98>픔」).
 *
 * 로컬 LLM 이 드문 한글(냘·닢·엾 …)을 못 내고 `<0xEB><0x83><0x98>` 처럼 바이트를 그대로 적는다. 바이트가 곧 UTF-8 이라
 * **붙은 토큰 묶음을 해독하면 원래 글자가 나온다** — 짐작이 아니라 복원이다. 해독이 안 되는 묶음(잘린 바이트 등)은 그대로 둔다.
 * 그 경우는 `build-korean-meaning-worklist` 의 `latin` 깃발이 계속 잡는다.
 */
export function repairByteTokens(text: string): string {
  return text
    .replace(/<0xEB><0xB3>(?=짚)/g, '볏') // 마지막 바이트가 빠진 것 — 볏(EB B3 8F)짚. 앞 두 바이트가 B3xx 대로 좁히고 뒤 글자가 단어를 정한다
    .replace(/(?:<0x[0-9A-Fa-f]{2}>)+/g, (run) => {
      const bytes = Uint8Array.from(run.match(/[0-9A-Fa-f]{2}(?=>)/g)!, (h) => parseInt(h, 16))
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return run
      }
    })
}

export function normalizeDefinition(definition: string): string {
  return repairByteTokens(definition)
    .replace(/\s*;\s*\.?\s*/g, ', ')
    .replace(/[,;\s]+$/, '')
    .trim()
}

/**
 * 바이트가 잘려 `repairByteTokens` 로도 못 살리는 뜻을 사람이 정해 둔 표 (id → 한국어 뜻).
 * 없는 파일이면 빈 표다. 사전 빌더가 번역본보다 먼저 본다 — `source: llm`·`verified: false` 로 실린다.
 */
export function loadTruncatedOverrides(dictDir: string): Record<string, string> {
  const path = join(dictDir, 'korean-meaning-truncated-overrides.json')
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { byId: Record<string, string> }).byId : {}
}
