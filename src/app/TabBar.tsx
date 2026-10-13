// 하단 탭바 — 앱의 내비게이션 셸 (2026-09-17). 아이콘 위에 글자를 둔다 (2026-10-11 사용자 요청).
//
// **세션·진단·다시보기에서는 안 뜬다.** 키보드가 올라오는 화면이라 하단에 탭이 깔리면
// 답 버튼과 겹치고, 카드 전환 150ms 예산에도 불리하다 (PLAN §7). 그래서 탭바는
// "머무는 화면"(탭 루트와 그 하위)에만 붙고 "흐름"은 전체화면으로 덮는다.
import type { ReactNode } from 'react'
import type { Tab } from '../App.tsx'
import { BookmarkIcon, HomeIcon, ReportIcon, SearchIcon, SettingsIcon } from './icons.tsx'

/**
 * 라벨은 짧게. 아이콘은 `icons.tsx` 의 선 아이콘 세트다 — 처음엔 세트가 없어 글자만 썼다(2026-09-17).
 * 아이콘은 장식이다(`aria-hidden`) — 버튼 이름은 글자가 맡아 스크린리더·테스트가 그대로 「리포트」를 찾는다
 */
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: '홈', icon: <HomeIcon /> },
  { id: 'wordlist', label: '단어장', icon: <BookmarkIcon /> },
  { id: 'report', label: '리포트', icon: <ReportIcon /> },
  { id: 'search', label: '찾기', icon: <SearchIcon /> },
  { id: 'settings', label: '설정', icon: <SettingsIcon /> },
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
          {t.icon}
          <span className="tabbar-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
