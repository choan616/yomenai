// 카메라로 찾기 — 종이에 인쇄된 한자어를 겨눠 찍어 사전으로 잇는다 (PLAN §7)
//
// **출발점이 그대로 기능이 된 자리다.** 소설을 읽다 낯선 한자어에서 막히는 순간이 이 앱의
// 시작인데, 그때 읽는 법을 모르니 「읽기로 찾기」로는 못 찾는다. 표기를 눈으로 옮겨 적을
// 수도 없다 — 모르는 한자라서 막힌 것이다.
//
// 측정과 결정은 context-notes 2026-09-23 절에 있다. 화면에 직접 걸리는 것만 옮기면
// ① 겨눠서 한 단어. 문장을 통째로 안 읽는다 ② 쓰기 방향 단추는 안 둔다 — 기본 세로로
// 보고 사전이 못 알아보면 반대로 한 번 더 ③ 결과는 찾기 화면이 받는다
import { useCallback, useEffect, useRef, useState } from 'react'
import { nearMisses, normalize, pickBest, type DictHit } from '../core/ocrMatch.ts'
import { flip, recognize, shutdown, warmUp, type Direction } from '../dict/ocr.ts'
import { loadBand4Idioms, loadBaseIdioms, studyPool } from '../dict/load.ts'
import { loadSettings } from './settings.ts'

/** 카메라를 못 켠 이유. 무엇을 하면 되는지가 사유마다 다르다 */
type Trouble = 'denied' | 'nodevice' | 'insecure' | 'failed'

const TROUBLE_TEXT: Record<Trouble, { head: string; body: string }> = {
  denied: {
    head: '카메라를 쓸 수 없어요',
    body: '브라우저가 카메라 권한을 막고 있어요. 주소창 왼쪽의 자물쇠(또는 ⓘ)를 눌러 카메라를 허용하신 뒤 다시 열어 주세요.',
  },
  nodevice: {
    head: '카메라를 찾지 못했어요',
    body: '이 기기에서 쓸 수 있는 카메라가 없어요. 폰이나 태블릿에서 열면 돼요.',
  },
  insecure: {
    head: '카메라를 쓸 수 없는 주소예요',
    body: '카메라는 보안 연결(https)에서만 열려요. 앱 주소로 다시 들어와 주세요.',
  },
  failed: {
    head: '카메라를 켜지 못했어요',
    body: '다른 앱이 카메라를 쓰고 있으면 이런 일이 있어요. 그 앱을 닫고 다시 열어 주세요.',
  },
}

/**
 * 네모는 **정사각형 하나**다 (2026-09-23 사용자 제안, 실측으로 확인).
 *
 * 방향마다 길쭉한 네모를 따로 두려 했는데 재 보니 정사각형이 못지않다 — 세로 본문에서
 * 75×75(글자 세 개쯤)가 「爆弾」을 깨끗이 읽었고 가로에서도 같은 크기가 잡았다.
 * 길쭉한 쪽은 오히려 같은 자리에서 흔들렸다.
 *
 * 그래서 얻는 게 크다. **방향을 뒤집을 때 다시 자를 필요가 없고**(같은 조각을 두 모델에
 * 넣으면 된다), 네모가 모양을 안 바꿔 화면도 안 튄다.
 *
 * 크기는 글자 세 개쯤. 작으면 글자가 잘리고(47×47 → 「畑弾」), 크면 이웃 줄이 딸려
 * 온다(120×120 → 「0下っ爆弾はっ子り絢胡」). 4글자 이상(전체의 4.5%)은 이웃이 조금
 * 섞이는데 사전이 걷어내는 몫으로 둔다.
 *
 * 값은 **보이는 띠 기준**이고 잘라낼 원본 영역은 `getBoundingClientRect` 로 환산한다 —
 * 띠 높이·배율이 어떻게 바뀌어도 초록 네모 안과 자르는 곳이 어긋날 수 없다.
 */
const BOX_HEIGHT = 0.72

/** 화면에서 겨누기 힘들다는 지적에 붙였다 — 1080 폭이 폰에서 360px 라 네모가 너무 작았다 */
const ZOOMS = [1, 2, 3] as const

export interface CameraFound {
  /** 정확히 하나 걸렸을 때 찾기 입력란에 채울 읽기. 아니면 `null` */
  fill: string | null
  /** 확실치 않을 때 보여 줄 후보. 고르는 것은 사용자다 */
  candidates: string[]
  /** 인식한 원문과 그중 걸린 구간 — 무엇을 찾았는지 화면이 말해야 한다 */
  raw: string
}

export function CameraFind({
  onBack,
  onFound,
}: {
  onBack: () => void
  onFound: (found: CameraFound) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const busy = useRef(false)

  const [trouble, setTrouble] = useState<Trouble | null>(null)
  const [live, setLive] = useState(false)
  const [zoom, setZoom] = useState<number>(1)
  const [reading, setReading] = useState(false)
  const [flash, setFlash] = useState(0)
  const [miss, setMiss] = useState<string | null>(null)
  /**
   * 마지막으로 통한 방향을 기억한다. 기본은 세로 — 소설이 그렇다 (결정 2·10).
   *
   * **ref 가 아니라 state 다.** 방향이 뒤집히면 초록 네모 모양도 같이 바뀌어야 한다 —
   * ref 로 두면 다시 그리지 않아 겨눈 것과 자르는 곳이 어긋난다
   */
  const [dir, setDir] = useState<Direction>('vertical')

  /**
   * 사전 — 표기로 찾는다. **밴드 4까지 본다** (2026-09-23).
   *
   * 여기가 밴드 4가 가장 필요한 자리다 — **모르는 말이라서 찍는 것**이고, 모르는 말일수록
   * 빈도표 밖이다. 찍었는데 「사전에 없음」이 나오면 기능이 성립하지 않는다.
   *
   * 기본 사전을 먼저 세우고 넓은 쪽은 뒤따라 받는다(20MB). 그 사이에 찍어도 기본 사전으로
   * 답하고, 거기서 못 찾으면 `shoot` 이 넓은 쪽을 기다린다 — **실패할 때만 기다린다.**
   */
  const dict = useRef<Map<string, DictHit> | null>(null)
  const wide = useRef<Promise<Map<string, DictHit>> | null>(null)

  useEffect(() => {
    let alive = true
    const toMap = (pool: { idiomId: string; headword: string; reading: string }[]) => {
      const map = new Map<string, DictHit>()
      for (const it of pool) {
        if (!map.has(it.headword)) {
          map.set(it.headword, { idiomId: it.idiomId, headword: it.headword, reading: it.reading })
        }
      }
      return map
    }
    void (async () => {
      const pool = await loadBaseIdioms()
      if (!alive) return
      // 훈독을 꺼 놨으면 훈독 숙어는 뺀다 — 찾기·출제와 같은 범위다
      const kun = loadSettings().kunPercent > 0
      dict.current = toMap(studyPool(pool, kun))
      wide.current = Promise.all([loadBaseIdioms(), loadBand4Idioms()]).then(([base, band4]) =>
        toMap([...studyPool(base, kun), ...studyPool(band4, kun)]),
      )
      void wide.current.then((m) => {
        if (alive) dict.current = m
      })
    })()
    return () => {
      alive = false
    }
  }, [])

  // ── 카메라 수명 ──
  // **화면을 나가면 반드시 끈다.** 안 끄면 배터리를 먹고 상태표시줄 표시등이 계속 켜져
  // 있다. 시험 페이지에는 없던 부분이다 (탭을 닫으면 끝나는 물건이라 몰랐다)
  useEffect(() => {
    let alive = true
    void (async () => {
      if (!window.isSecureContext) {
        setTrouble('insecure')
        return
      }
      if (navigator.mediaDevices?.getUserMedia === undefined) {
        setTrouble('nodevice')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        })
        if (!alive) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = s
        if (video.current) video.current.srcObject = s
        setLive(true)
        warmUp('vertical')
      } catch (e) {
        if (!alive) return
        const name = e instanceof Error ? e.name : ''
        setTrouble(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'nodevice'
              : 'failed',
        )
      }
    })()
    return () => {
      alive = false
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
      void shutdown()
    }
  }, [])

  /**
   * 초록 네모를 **원본 좌표로 되돌려** 잘라 온다.
   *
   * `getBoundingClientRect` 는 CSS 변형(배율)까지 반영한 실제 화면 상자라, 거기서 나온
   * 비율 하나로 환산하면 보이는 그대로 잘린다. 양쪽을 따로 계산하면 언젠가 어긋난다
   * (배율을 넣으며 한 번 어긋날 뻔했다).
   */
  const crop = useCallback((): HTMLCanvasElement | null => {
    const v = video.current
    const f = frame.current
    if (!v || !f || v.videoWidth === 0) return null
    const vr = v.getBoundingClientRect()
    const fr = f.getBoundingClientRect()
    const k = v.videoWidth / vr.width
    const x = Math.max(0, Math.min((fr.left - vr.left) * k, v.videoWidth))
    const y = Math.max(0, Math.min((fr.top - vr.top) * k, v.videoHeight))
    const w = Math.max(1, Math.min(fr.width * k, v.videoWidth - x))
    const h = Math.max(1, Math.min(fr.height * k, v.videoHeight - y))
    const c = document.createElement('canvas')
    c.width = Math.round(w)
    c.height = Math.round(h)
    const ctx = c.getContext('2d')
    if (ctx === null) return null
    ctx.drawImage(v, x, y, w, h, 0, 0, c.width, c.height)
    return c
  }, [])

  const shoot = useCallback(async () => {
    if (busy.current || !live) return
    const canvas = crop()
    if (canvas === null) return
    busy.current = true
    setFlash((n) => n + 1)
    setReading(true)
    setMiss(null)
    try {
      const narrow = (h: string) => dict.current?.get(h)
      // 읽어 둔 것을 **모아 둔다.** 사전이 넓어지면 OCR 을 다시 돌리지 않고 다시 맞추기만
      // 하면 된다 — 글자는 그대로고 찾을 자리만 넓어진 것이다
      const attempts = [...(await recognize(canvas, dir))]
      let best = pickBest(attempts, narrow)

      if (best?.hit === undefined) {
        // **같은 조각을 그대로 반대 모델에 넣는다.** 네모가 정사각형이라 모양을 다시
        // 맞출 일이 없다 — 길쭉했다면 여기서 다시 잘라야 했다 (결정 2)
        const other = flip(dir)
        const more = await recognize(canvas, other)
        attempts.push(...more)
        const again = pickBest(more, narrow)
        if (again?.hit !== undefined) {
          setDir(other)
          best = again
        } else if ((again?.attempt.text.length ?? 0) > (best?.attempt.text.length ?? 0)) {
          best = again
        }
      }

      // 여기까지 못 찾았으면 **그때** 넓은 사전(밴드 4)을 기다린다. 맞혔으면 기다릴 일이 없다
      let words = dict.current
      if (best?.hit === undefined && wide.current !== null) {
        words = await wide.current
        const wider = words
        const retry = pickBest(attempts, (h) => wider.get(h))
        if (retry?.hit !== undefined) best = retry
      }

      const raw = normalize(best?.attempt.text ?? '')
      if (best?.hit !== undefined) {
        onFound({ fill: best.hit.reading, candidates: [best.hit.headword], raw })
        return
      }
      // 못 맞혔다. **단정하지 않고** 한 자 어긋난 것들을 후보로 낸다 (결정 6)
      const near = words === null ? [] : nearMisses(raw, words.keys())
      if (near.length > 0) {
        onFound({ fill: null, candidates: near, raw })
        return
      }
      setMiss(raw)
    } finally {
      busy.current = false
      setReading(false)
    }
  }, [crop, dir, live, onFound])

  return (
    <section className="screen camera-find">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ←
        </button>
        <h2>카메라로 찾기</h2>
      </div>

      <div className="screen-body">
        {trouble !== null ? (
          <div className="cam-trouble">
            <p className="cam-trouble-head">{TROUBLE_TEXT[trouble].head}</p>
            <p className="cam-trouble-body">{TROUBLE_TEXT[trouble].body}</p>
            <button type="button" className="btn" onClick={onBack}>
              읽기로 찾기로 돌아가기
            </button>
          </div>
        ) : (
          <>
            {/* 띠는 **짧다** — 세로 프레임을 폭에 맞추면 화면을 다 먹는다.
                겨눌 때 필요한 건 단어 둘레뿐이다 */}
            <div
              className="cam-stage"
              role="button"
              tabIndex={0}
              aria-label="네모 안을 읽기"
              onClick={() => void shoot()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void shoot()
                }
              }}
            >
              <video
                ref={video}
                playsInline
                muted
                autoPlay
                style={{ transform: `scale(${zoom})` }}
              />
              {/* 정사각형이라 폭을 안 적는다 — aspect-ratio 가 높이를 따라간다 */}
              <div ref={frame} className="cam-frame" style={{ height: `${BOX_HEIGHT * 100}%` }} />
              {/* 누르면 한 번 밝아진다 — 150ms 만에 끝나서 안 그러면 아무 일도 안 난 것처럼
                  보인다. key 를 바꿔 애니메이션을 다시 태운다 */}
              <span key={flash} className={flash > 0 ? 'cam-flash on' : 'cam-flash'} />
              {reading && <p className="cam-reading">읽는 중…</p>}
            </div>

            <div className="cam-zoom">
              <span className="dim">배율</span>
              {ZOOMS.map((z) => (
                <button
                  key={z}
                  type="button"
                  aria-pressed={zoom === z}
                  onClick={() => setZoom(z)}
                >
                  {z}×
                </button>
              ))}
            </div>

            <p className="cam-hint">
              {miss === null ? (
                <>초록 네모를 단어로 꽉 채우고 화면을 누르세요.</>
              ) : (
                <>
                  <b lang="ja">{miss || '아무 글자도'}</b> 로 읽혔는데 사전에 없어요. 네모를
                  단어에 더 맞추거나 배율을 올려 다시 해 보세요.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
