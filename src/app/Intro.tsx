// 시작 인트로 — 「読めない？」가 「読める！」로 바뀌었다가 홈 제목 자리로 내려앉는다 (2026-10-05 사용자 시안 승인)
//
// 읽을 수 없던 글자가 읽히는 순간을 한 글자 단위로 보여 주고, 앱 이름 「読めない」로 돌아와 홈으로 이어진다.
// 하루 첫 실행에만 뜨고(`introState.ts`) 탭하면 바로 넘어간다. 모션을 줄인 기기에서는 뜨지 않는다.
// 장식이라 낭독에서 숨긴다. 홈 제목은 도착할 때까지 가려 둔다(`html[data-intro]`) — 움직이는 로고와 겹쳐 보이지 않게.
//
// 「？」「！」는 일본어 서브셋(Noto Sans JP)에 없어서 한국어 서체(Pretendard Bold)의 ASCII 로 그린다. 문장부호라 자형 학습 문제가 아니다.
import { useEffect, useLayoutEffect, useRef } from 'react'

/** 시안의 1.6초를 느리게 본 쪽이 좋다고 해서(사용자 「로고 이동 느리게가 좋아 보인다」) 늘린 배율 */
export const INTRO_SLOW = 1.6

export function Intro({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const word = useRef<HTMLDivElement>(null)
  const k = useRef<HTMLSpanElement>(null)
  const rt = useRef<HTMLSpanElement>(null)
  const nai = useRef<HTMLSpanElement>(null)
  const ru = useRef<HTMLSpanElement>(null)
  const mark = useRef<HTMLSpanElement>(null)
  const q = useRef<HTMLSpanElement>(null)
  const e = useRef<HTMLSpanElement>(null)
  const finish = useRef<() => void>(() => {})

  // 첫 그림 전에 홈 제목을 가린다 — 인트로가 뜨기 전 한 프레임 제목이 보이는 깜빡임을 막는다
  useLayoutEffect(() => {
    document.documentElement.dataset.intro = '1'
    return () => {
      delete document.documentElement.dataset.intro
    }
  }, [])

  useEffect(() => {
    const els = { word, k, rt, nai, ru, mark, q, e }
    if (Object.values(els).some((r) => !r.current) || !root.current) {
      onDone()
      return
    }
    const W = word.current!
    const t = (ms: number) => ms * INTRO_SLOW
    const anims: Animation[] = []
    const timers: number[] = []
    let ended = false
    const A = (el: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      const a = el.animate(kf, { fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)', ...o })
      anims.push(a)
      return a
    }
    const cs = getComputedStyle(document.documentElement)
    const FAINT = cs.getPropertyValue('--text-faint').trim() || '#9a938a'
    const INK = cs.getPropertyValue('--text').trim() || '#1a1714'

    const end = () => {
      if (ended) return
      ended = true
      timers.forEach((id) => window.clearTimeout(id))
      anims.forEach((a) => a.cancel())
      delete document.documentElement.dataset.intro
      onDone()
    }
    finish.current = () => {
      if (ended) return
      // 건너뛰기 — 짧게 사라진다
      timers.forEach((id) => window.clearTimeout(id))
      delete document.documentElement.dataset.intro
      const f = root.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' })
      f.onfinish = end
    }

    // 0~600ms: 흐릿하게 등장, ？ 만 흔들린다
    A(W, [{ opacity: 0, filter: 'blur(6px)', color: FAINT }, { opacity: 1, filter: 'blur(2px)', color: FAINT }], { duration: t(450) })
    A(q.current!, [{ transform: 'rotate(0)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(8deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }], { duration: t(560), delay: t(150), easing: 'ease-in-out' })
    // ない 접힘 / る 펼침, ？ 가라앉고 ！ 튀어 오름, 색이 진해짐
    A(nai.current!, [{ maxWidth: '2.2em', opacity: 1 }, { maxWidth: '0em', opacity: 0 }], { duration: t(380), delay: t(560) })
    A(ru.current!, [{ maxWidth: '0em', opacity: 0 }, { maxWidth: '1.2em', opacity: 1 }], { duration: t(420), delay: t(620) })
    A(q.current!, [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(.35em)', opacity: 0 }], { duration: t(260), delay: t(560) })
    A(e.current!, [{ opacity: 0, transform: 'translateY(-.5em) scale(.5)' }, { opacity: 1, transform: 'translateY(.06em) scale(1.2)', offset: 0.6 }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: t(420), delay: t(700) })
    A(W, [{ filter: 'blur(2px)', color: FAINT }, { filter: 'blur(0px)', color: INK }], { duration: t(420), delay: t(620) })
    // 후리가나 よ
    A(rt.current!, [{ opacity: 0, transform: 'translateY(.3em)' }, { opacity: 1, transform: 'none' }], { duration: t(320), delay: t(1080) })

    // 읽힌 뒤 잠시 두었다가 홈 제목 자리로 — 도착 위치는 그 순간에 잰다(홈 배치가 그 사이 바뀌었을 수 있다)
    const T = t(1650)
    timers.push(
      window.setTimeout(() => {
        const title = document.querySelector<HTMLElement>('.home h1')
        const tn = title?.firstChild
        const visible = title && tn && title.getClientRects().length > 0
        if (!visible || !tn) {
          // 홈 제목이 없으면(첫 화면이 홈이 아니거나 아직 그려지지 않음) 조용히 사라진다
          const f = root.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t(300), fill: 'forwards' })
          f.onfinish = end
          return
        }
        const range = document.createRange()
        range.setStart(tn, 0)
        range.setEnd(tn, 1)
        const target = range.getBoundingClientRect()
        const kr = k.current!.getBoundingClientRect()
        const wr = W.getBoundingClientRect()
        const scale = parseFloat(getComputedStyle(title).fontSize) / parseFloat(getComputedStyle(W).fontSize)
        // 변형 기준점을 読 글자 왼쪽 위로 잡으면 그 점이 그대로 목표 점으로 간다
        W.style.transformOrigin = `${kr.left - wr.left}px ${kr.top - wr.top}px`
        const dx = target.left - kr.left
        const dy = target.top - kr.top
        const moveDur = t(560)
        A(ru.current!, [{ maxWidth: '1.2em', opacity: 1 }, { maxWidth: '0em', opacity: 0 }], { duration: t(300) })
        A(nai.current!, [{ maxWidth: '0em', opacity: 0 }, { maxWidth: '2.2em', opacity: 1 }], { duration: t(320), delay: t(40) })
        A(mark.current!, [{ maxWidth: '1em', opacity: 1 }, { maxWidth: '0em', opacity: 0 }], { duration: t(260) })
        A(rt.current!, [{ opacity: 1 }, { opacity: 0 }], { duration: t(200) })
        const move = A(W, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], {
          duration: moveDur,
          delay: t(120),
          easing: 'cubic-bezier(.4,0,.2,1)',
        })
        // 도착하는 순간 무대를 지우고 홈 제목을 켠다 — 두 글자가 함께 보이는 틈이 없다
        move.onfinish = () => {
          delete document.documentElement.dataset.intro
          end()
        }
      }, T),
    )

    return () => {
      ended = true
      timers.forEach((id) => window.clearTimeout(id))
      anims.forEach((a) => a.cancel())
      delete document.documentElement.dataset.intro
    }
  }, [onDone])

  // 탭하거나 키를 누르면 건너뛴다
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' || ev.key === 'Enter' || ev.key === ' ') finish.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="intro" ref={root} aria-hidden="true" onPointerDown={() => finish.current()}>
      <div className="intro-word" ref={word} lang="ja">
        <span className="intro-rubywrap">
          <span ref={k}>読</span>
          <span className="intro-rt" ref={rt} style={{ opacity: 0 }}>
            よ
          </span>
        </span>
        <span>め</span>
        <span className="intro-clip" ref={nai}>
          ない
        </span>
        <span className="intro-clip" ref={ru} style={{ maxWidth: 0, opacity: 0 }}>
          る
        </span>
        <span className="intro-mark" ref={mark} lang="ko">
          <span ref={q}>?</span>
          <span ref={e} style={{ opacity: 0 }}>
            !
          </span>
        </span>
      </div>
    </div>
  )
}
