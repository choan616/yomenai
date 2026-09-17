// 하단 탭바 — 앱의 내비게이션 셸 (2026-09-17).
//
// **세션·진단·다시보기에서는 안 뜬다.** 키보드가 올라오는 화면이라 하단에 탭이 깔리면
// 답 버튼과 겹치고, 카드 전환 150ms 예산에도 불리하다 (PLAN §7). 그래서 탭바는
// "머무는 화면"(탭 루트와 그 하위)에만 붙고 "흐름"은 전체화면으로 덮는다.
import type { Tab } from '../App.tsx'

/** 라벨은 짧게. 아이콘은 안 쓴다 — 이 앱의 첫 SVG 아이콘이 9/16 에야 들어왔고 세트가 없다 */
const TABS: { id: Tab; label: string }[] = [
  { id: 'learn', label: '학습' },
  { id: 'report', label: '리포트' },
  { id: 'search', label: '찾기' },
  { id: 'settings', label: '설정' },
]

export function TabBar({ tab, onSelect }: { tab: Tab; onSelect: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="주 메뉴">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tabbar-item${t.id === tab ? ' on' : ''}`}
          aria-current={t.id === tab ? 'page' : undefined}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
