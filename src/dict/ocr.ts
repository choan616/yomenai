// 카메라 한자 인식 — tesseract.js 를 감싼다. 판정 로직은 `core/ocrMatch.ts` 에 따로 있다
//
// **npm 의존을 안 늘린다.** 1단계에서 `public/ocr/` 에 담아 둔 정적 자산을 동적 import
// 한다. 본 번들에 안 들어가고 프리캐시에도 안 걸린다 — 카메라를 안 쓰는 사람은 7.4MB 를
// 한 바이트도 안 받는다 (PLAN §3 배포 자산).
//
// 측정 근거는 context-notes 2026-09-23 절에 있다. 요약하면 셋이다.
// ① 쓰기 방향을 틀리면 **0점**이다. 반쯤 맞는 게 아니라 통째로 무너진다
// ② 조각이 크면 못 읽는다. 줄이기만 해도 6/40 → 37/40
// ③ 전처리는 축소가 전부다. 흑백·대비·선명화는 차이가 ±1(잡음)이라 안 한다
import type { OcrAttempt } from '../core/ocrMatch.ts'

export type Direction = 'vertical' | 'horizontal'

/**
 * 넣어 볼 조각 크기(가로지르는 축, px). 측정에서 44~56 이 가장 좋았고 72 부터 떨어진다.
 *
 * **하나로 안 정한다.** 최적점이 네모를 얼마나 꽉 채웠는지에 따라 달라진다 —
 * 실측에서 같은 장면인데 44px 는 `飲料缶`, 56px 는 `飲料向` 으로 읽었다.
 */
const SCALES = [56, 44] as const
/** 이 아래면 이미 알맞다. 더 줄이면 손해다 — 34px 은 없는 글자를 만들어냈다 (`『爆弾は和`) */
const ALREADY_FINE = 80

/** tesseract.js 의 쓰는 부분만. 정적 자산을 동적 import 하므로 타입이 따라오지 않는다 */
interface TesseractWorker {
  setParameters(p: Record<string, string>): Promise<unknown>
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>
  terminate(): Promise<unknown>
}
interface TesseractModule {
  createWorker(
    lang: string,
    oem: number,
    opts: Record<string, unknown>,
  ): Promise<TesseractWorker>
}

const asset = (name: string): string => `${import.meta.env.BASE_URL}ocr/${name}`

let modulePromise: Promise<TesseractModule> | null = null
function loadModule(): Promise<TesseractModule> {
  // ESM 번들은 **기본 내보내기 하나**다. `{ createWorker }` 로 꺼내면
  // "does not provide an export named 'createWorker'" 로 죽는다 (2026-09-23 실측)
  modulePromise ??= import(/* @vite-ignore */ asset('tesseract.esm.min.js')).then(
    (m: { default: TesseractModule }) => m.default,
  )
  return modulePromise
}

const workers = new Map<Direction, Promise<TesseractWorker>>()

/**
 * 방향별 일꾼. 만드는 값이 비싸다(모델 내려받기) — 한 번 만들고 계속 쓴다.
 *
 * `cacheMethod: 'none'` — tesseract 기본값은 traineddata 를 **IndexedDB 에 쓴다.**
 * 사용자 DB 는 백업 대상이고 사전류는 거기 안 들어간다는 게 이 프로젝트 규칙이라
 * (CLAUDE.md), 캐시는 서비스워커에 맡긴다.
 */
function worker(dir: Direction): Promise<TesseractWorker> {
  let w = workers.get(dir)
  if (w === undefined) {
    w = loadModule().then(async (T) => {
      const it = await T.createWorker(dir === 'vertical' ? 'jpn_vert' : 'jpn', 1, {
        langPath: asset('').replace(/\/$/, ''),
        workerPath: asset('worker.min.js'),
        corePath: asset('tesseract-core-simd-lstm.wasm.js'),
        cacheMethod: 'none',
        logger: () => {},
      })
      await it.setParameters({
        // 7 = 한 줄, 5 = 세로 한 블록. 실측에서 이 조합이 가장 나았다
        tessedit_pageseg_mode: dir === 'vertical' ? '5' : '7',
        // 안 주면 터서랙트가 dpi 를 추정하다 흔들린다
        user_defined_dpi: '300',
      })
      return it
    })
    workers.set(dir, w)
  }
  return w
}

/** 모델을 미리 받아 둔다. 화면을 열 때 불러 두면 첫 인식이 빨라진다 */
export function warmUp(dir: Direction): void {
  void worker(dir).catch(() => {
    /* 실패는 실제 인식에서 드러난다. 여기서 시끄럽게 하지 않는다 */
  })
}

/** 켜 둔 일꾼을 모두 끈다. 화면을 나갈 때 부른다 */
export async function shutdown(): Promise<void> {
  const all = [...workers.values()]
  workers.clear()
  await Promise.all(all.map((w) => w.then((it) => it.terminate()).catch(() => {})))
}

/**
 * 가로지르는 축을 `target` 에 맞춰 줄인다. **키우지는 않는다** — 없는 정보를 만들어
 * 봐야 소용없다.
 *
 * 가로글은 높이, 세로글은 폭이다. 세로 글줄은 아래로 길어서 높이로 줄이면 한 줄이
 * 통째로 뭉개진다. 재야 하는 건 글줄 길이가 아니라 **글자 크기**다.
 */
function shrink(src: HTMLCanvasElement, dir: Direction, target: number): HTMLCanvasElement {
  const axis = dir === 'vertical' ? src.width : src.height
  if (axis <= target) return src
  const r = target / axis
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(src.width * r))
  c.height = Math.max(1, Math.round(src.height * r))
  const ctx = c.getContext('2d')
  if (ctx === null) return src
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** 이 조각에 실제로 넣어 볼 크기들. 이미 알맞으면 원본도 한 번 넣는다 */
function planFor(src: HTMLCanvasElement, dir: Direction): number[] {
  const axis = dir === 'vertical' ? src.width : src.height
  const plan = axis <= ALREADY_FINE ? [axis, ...SCALES] : [...SCALES]
  return [...new Set(plan.filter((n) => n > 0))]
}

/**
 * 조각 하나를 여러 크기로 넣어 읽는다. 어느 것을 믿을지는 `pickBest` 가 정한다.
 * 한 번에 50ms 남짓이라(폰 실측 141~155ms / 4번) 몇 번 돌려도 싸다.
 */
export async function recognize(
  canvas: HTMLCanvasElement,
  dir: Direction,
): Promise<OcrAttempt[]> {
  const w = await worker(dir)
  const out: OcrAttempt[] = []
  for (const target of planFor(canvas, dir)) {
    const small = shrink(canvas, dir, target)
    const { data } = await w.recognize(small)
    out.push({ size: dir === 'vertical' ? small.width : small.height, text: data.text })
  }
  return out
}

/** 반대 방향. 사전이 못 알아봤을 때 한 번 더 보는 쪽이다 (context-notes 결정 2) */
export function flip(dir: Direction): Direction {
  return dir === 'vertical' ? 'horizontal' : 'vertical'
}
