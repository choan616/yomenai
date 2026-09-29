// 앱 검수 반영 4단계를 순서 고정으로 이어 돌린다 (2026-09-29)
//
// 「순서를 지켜야 하는 과정을 한 번의 명령어로 실행하는 건 위험한가」라는 물음에서
// 나왔다. **체이닝 자체는 위험하지 않다** — 오히려 방금 문서(`docs/tools.md`)에서
// 실제로 있었던 실수(순서가 뒤바뀌어 적혀 있던 것)를 원천 차단한다. 위험한 건 둘뿐이다.
//
//   1. 중간 단계가 실패했는데 다음 단계로 넘어가는 것 — 여기서는 한 단계라도 비정상
//      종료하면 그 자리에서 멈춘다 (`execFileSync` 가 실패 시 그대로 던진다)
//   2. `--force` 를 기본으로 끼워 넣는 것 — 이건 안 한다. `--force` 는 「이미 사람이
//      찍은 판정도 이번 앱 값이 다르면 덮어써라」는 뜻이라, 자동화에 기본 포함시키면
//      사람이 앱보다 나중에 더 신중하게 고친 TSV 판정까지 조용히 덮어쓸 수 있다.
//      이 스크립트는 `--force` 를 그대로 **전달만** 한다 — 켜고 끄는 결정은 부르는 쪽에 남는다
//
// 순서 — `docs/tools.md` 「2-b. 앱에서 검수한 것 반영」과 같다.
//   build:korean-meaning-worklist --batch   (새 id 에 워크리스트 줄을 만든다)
//   apply:app-review [--force]              (그 줄의 verdict·fix 칸을 채운다)
//   apply:korean-meaning                    (verdict → korean-class.json)
//   build:runtime-dict                      (→ public/dict)
//
// 각 단계 출력은 그대로 흘려보낸다(`stdio: 'inherit'`) — 이상 신호를 못 보고 지나치지
// 않으려면 중간 단계 로그가 가려지면 안 된다.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
// `npx tsx` 를 shell 로 부르지 않는다 — Windows 에서 `npx` 가 `.cmd` 라 shell 없인 못 찾고,
// shell 로 부르면 인자가 이스케이프 없이 이어붙는다는 경고가 뜬다(Node DEP0190). tsx 의
// CLI 진입점을 직접 resolve 해 node 로 실행하면 npx 도 shell 도 필요 없다
const TSX_CLI = createRequire(import.meta.url).resolve('tsx/cli')
const FORCE = process.argv.includes('--force')

/** 전달할 만한 옵션만 그대로 넘긴다. `--force` 는 apply-app-review 에만 의미가 있다 */
const passthrough = process.argv.slice(2).filter((a) => a !== '--force')

const steps: { label: string; file: string; args?: string[] }[] = [
  { label: '1. 워크리스트에 새 id 줄 만들기', file: 'build-korean-meaning-worklist.ts', args: ['--batch'] },
  {
    label: '2. 앱 판정을 워크리스트에 채우기',
    file: 'apply-app-review.ts',
    args: [...passthrough, ...(FORCE ? ['--force'] : [])],
  },
  { label: '3. 워크리스트 → korean-class.json', file: 'apply-korean-meaning.ts' },
  { label: '4. korean-class.json → public/dict', file: 'build-runtime-dict.ts' },
]

for (const step of steps) {
  console.log(`\n=== ${step.label} ===`)
  try {
    // 한 단계라도 비정상 종료하면 여기서 멈춘다 — 다음 단계로 넘어가
    // 반쪽짜리 상태를 배포하는 일이 없게 한다
    execFileSync(process.execPath, [TSX_CLI, join(ROOT, 'tools', step.file), ...(step.args ?? [])], {
      stdio: 'inherit',
      cwd: ROOT,
    })
  } catch {
    // 실제 에러는 stdio: 'inherit' 로 이미 화면에 그려졌다 — Node 스택트레이스를
    // 덧붙이지 않고 어느 단계에서 멈췄는지만 짧게 남긴다
    console.error(`\n✗ "${step.label}" 에서 멈췄다. 뒤 단계는 안 돌았다.`)
    process.exit(1)
  }
}

console.log('\n=== 4단계 전부 끝났다 ===')
console.log('  이어서: npx tsc -b && npm run lint && npm test && npm run build')
