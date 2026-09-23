// 선 아이콘 (2026-09-23 사용자 요청) — 이모지를 쓰던 자리를 대신한다
//
// **왜 이모지를 걷었나.** 📷·🔊·👍·👎 는 컬러로 그려진다. PLAN §7 은 「무채색 기반,
// 색은 오답에만」인데 이 넷은 오답과 상관없이 앱에서 유일하게 색을 냈다. 엄지 둘에는
// 이미 `filter: grayscale(1)` 이 덧대어져 있었다 — 병을 알고 덮어 둔 자리였다.
//
// 그림이 기기마다 다른 것도 문제였다. 안드로이드의 👍 와 iOS 의 👍 는 다른 그림이라
// 화면이 어떻게 보일지 우리가 정할 수 없다.
//
// 전부 `currentColor` 로 그린다. 글자와 같은 색을 따라가므로 테마가 바뀌어도 손댈 게 없다.
// 크기는 `.icon` 한 자리에서 정한다 (`screens.css`).
import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** 카메라로 찾기 — 몸통과 그 위에 솟은 뷰파인더를 한 획으로 잇는다 */
export function CameraIcon() {
  return (
    <Icon>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2a1 1 0 0 0 .83-.45l.94-1.4A1 1 0 0 1 9.3 4.7h5.4a1 1 0 0 1 .83.45l.94 1.4a1 1 0 0 0 .83.45h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="13" r="3.4" />
    </Icon>
  )
}

/** 소리 듣기 — 나팔과 퍼지는 파동 둘 */
export function SoundIcon() {
  return (
    <Icon>
      <path d="M4 9.5h3.1L12 5.6v12.8L7.1 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" />
      <path d="M15.4 9.4a3.7 3.7 0 0 1 0 5.2" />
      <path d="M17.9 6.9a7.2 7.2 0 0 1 0 10.2" />
    </Icon>
  )
}

/**
 * 해석이 맞다 — 소매와 손.
 *
 * 아래를 가리키는 쪽은 **같은 그림을 위아래로 뒤집어** 쓴다. 두 개를 따로 그리면
 * 굵기나 비례가 언젠가 어긋난다.
 */
function Thumb({ down }: { down?: boolean }) {
  return (
    <Icon>
      <g transform={down ? 'translate(0 24) scale(1 -1)' : undefined}>
        {/* 소매 */}
        <path d="M3.2 11.6h3.4v8.2H3.2z" />
        {/* 손 — 엄지가 올라가고 주먹이 오른쪽에 붙는다 */}
        <path d="M6.6 11.8 10 4.5a1.9 1.9 0 0 1 3.3 1.3v3.5h4.9a2 2 0 0 1 1.97 2.35l-1.06 5.6a2 2 0 0 1-1.97 1.65H6.6" />
      </g>
    </Icon>
  )
}

export function ThumbUpIcon() {
  return <Thumb />
}

export function ThumbDownIcon() {
  return <Thumb down />
}
