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

/** 단어장 리스트 보기 — 점 셋과 줄 셋 */
export function ListIcon() {
  return (
    <Icon>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01" />
    </Icon>
  )
}

/** 단어장 카드 보기 — 앞 카드와 뒤에 겹쳐 보이는 한 장 */
export function CardIcon() {
  return (
    <Icon>
      <rect x="4.5" y="7" width="15" height="12" rx="1.8" />
      <path d="M7.5 4h9" />
    </Icon>
  )
}

/** 바로 가기 — 오른쪽 화살표. 토스트의 원형 버튼 안에 들어간다 (2026-10-02) */
export function ArrowRightIcon() {
  return (
    <Icon>
      <path d="M4.5 12h14" />
      <path d="m12.5 6 6 6-6 6" />
    </Icon>
  )
}

/** 닫기 — ✕. 토스트 모서리에 걸치는 작은 버튼이 쓴다 (2026-10-02) */
export function CloseIcon() {
  return (
    <Icon>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </Icon>
  )
}

/** 재도전 — 한 바퀴 도는 화살표. 「틀렸던 것을 다시 푼다」 (2026-10-02) */
export function RetryIcon() {
  return (
    <Icon>
      <path d="M20 11.5a8 8 0 1 1-2.6-5.4" />
      <path d="M20.5 4v4.2h-4.2" />
    </Icon>
  )
}

/** 다시보기 — 넘겨 보는 카드 두 장. 채점이 없다는 걸 눈 대신 카드로 말한다 (2026-10-02) */
export function StackIcon() {
  return (
    <Icon>
      <rect x="7.5" y="4.5" width="12" height="15" rx="2.2" />
      <path d="M15.5 21.5h-7a3 3 0 0 1-3-3V8" />
    </Icon>
  )
}

/** 단어장 — 책갈피를 꽂은 쪽 (2026-10-02) */
export function BookmarkIcon() {
  return (
    <Icon>
      <path d="M6.5 4.5h11a1 1 0 0 1 1 1V20l-6.5-3.6L5.5 20V5.5a1 1 0 0 1 1-1z" />
    </Icon>
  )
}

/**
 * 코스 아이콘 (2026-10-06 사용자 「라인 일러스트로 아이콘을 배치」) — 밴드 0~4 가 새싹 → 언덕 → 산 → 능선 → 깃발 꽂은 봉우리로 오른다.
 * 이름이 자연(산책로~정상)이라 그림이 이름과 같은 말을 하고, 색은 안 쓴다 — 글자색(먹 농도 단계)을 그대로 따른다.
 * 번호가 범위 밖이면 아무것도 그리지 않는다
 */
const COURSE_PATHS: Record<number, string> = {
  0: 'M4 19h16 M12 19v-6 M12 15c-3 0-4.5-2-4.5-4.5 3 0 4.5 1.5 4.5 4.5 M12 13c0-3 1.5-4.5 4.5-4.5 0 3-1.5 4.5-4.5 4.5',
  1: 'M3 19h18 M3 19c2.5-5.5 5.5-8.5 9-8.5S18.5 13.5 21 19 M17.5 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  2: 'M3 19h18 M4 19l5.5-9 4 6 2.2-3L20 19',
  3: 'M2 19h20 M2 19l3.5-5 3 3 4-9 3 5 2-2 4.5 8',
  4: 'M3 20h18 M5 20l7-13 7 13 M12 7V3.5 M12 3.5l4 1.5-4 1.5 M9.2 12l2.8 1.8 2.8-1.8',
}

export function CourseIcon({ band }: { band: number }) {
  const d = COURSE_PATHS[band]
  if (!d) return null
  return (
    <Icon>
      <path d={d} />
    </Icon>
  )
}
