// 앱 셸 — 하단 탭 4개 + 탭 안 한 겹(sub) + 탭바를 덮는 전체화면 흐름(flow) (2026-09-17).
//
// 라우터는 여전히 안 쓴다. 대신 **탭이 자리를 기억한다** — 전에는 화면마다 「어디서 왔는지」
// 를 상태로 들고 다녔고(`browseFrom`·`rulesFrom`), 그게 셋이 되면서 상태 기반 전환이
// 한계에 왔다는 신호였다 (context-notes 2026-09-14 「지켜볼 신호」 2·3·4).
import { useState } from 'react'
import './study/study.css'
import './app/screens.css'
import { Diagnostic } from './app/Diagnostic.tsx'
import { Home } from './app/Home.tsx'
import { OnyomiMap } from './app/OnyomiMap.tsx'
import { Report } from './app/Report.tsx'
import { Settings } from './app/Settings.tsx'
import { Browse } from './app/Browse.tsx'
import { Search } from './app/Search.tsx'
import { Feedback } from './app/Feedback.tsx'
import { Rules } from './app/Rules.tsx'
import { TabBar } from './app/TabBar.tsx'
import type { RuleId } from './app/rules.ts'
import { Study } from './study/Study.tsx'
import { UpdateBanner } from './app/UpdateBanner.tsx'
import { QUICK_SESSION_LIMIT } from './app/settings.ts'
import type { VoicingKind } from './core/mistakes.ts'
import type { MistakeType } from './core/types.ts'

/** 하단 탭. 모든 화면이 이 넷 중 하나 아래에 있다 */
export type Tab = 'home' | 'report' | 'search' | 'settings'

/** 탭 안에서 한 겹 들어간 화면. 자기 탭 루트로 돌아간다 */
export type Sub = { kind: 'onyomi' } | { kind: 'rules'; focus: RuleId | null } | { kind: 'feedback' }

/**
 * 탭바를 덮는 전체화면 흐름. 끝나면 열었던 탭으로 돌아온다.
 * 세션은 키보드가 올라오는 화면이라 하단에 탭이 깔리면 안 된다
 */
export type Flow =
  | { kind: 'study' | 'quick' | 'rematch' | 'diagnostic' }
  /**
   * 훈독 숙어 세션. 浜辺(はまべ)·荒木(あらき) 처럼 음독 쌍이 없는 숙어만 낸다 —
   * 기본 세션에서 빼고 여기로 모았다 (2026-09-22). 근거는 `load.ts` 의 `StudyTrack`
   */
  | { kind: 'kun' }
  /**
   * `filter` 가 있으면 그 오답 유형(+탁음이면 갈래)만 다시본다 — 리포트의 분포 그래프
   * "N회 다시보기" 가 쓴다 (2026-09-18). 없으면 기존처럼 자주 틀린 것 전체를 섞어 낸다
   */
  | {
      kind: 'browse'
      filter?: { type: MistakeType | null; voicing: VoicingKind | null; label: string }
    }
  /**
   * 음독 집중 세션. 쌍이 여럿이면 **대조**다 — 한 한자가 음독 둘을 쓸 때
   * 처방이 그렇게 내민다 (2026-09-21)
   */
  | { kind: 'focus'; pairIds: string[] }

export default function App() {
  return (
    <>
      <Shell />
      <UpdateBanner />
    </>
  )
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home')
  const [sub, setSub] = useState<Sub | null>(null)
  const [flow, setFlow] = useState<Flow | null>(null)

  /** 탭을 바꾸면 그 탭의 루트에서 시작한다 — 한 겹 들어간 자리는 안 들고 다닌다 */
  const goTab = (next: Tab) => {
    setTab(next)
    setSub(null)
  }
  const closeFlow = () => setFlow(null)

  if (flow) return <FlowScreen flow={flow} onExit={closeFlow} onDone={goTab} />

  return (
    <>
      <div className="tabbed">{sub ? <SubScreen sub={sub} onBack={() => setSub(null)} /> : <TabRoot tab={tab} onSub={setSub} onFlow={setFlow} />}</div>
      <TabBar tab={tab} onSelect={goTab} />
    </>
  )
}

/** 탭바를 덮는 흐름. 여기서는 탭바를 그리지 않는다 */
function FlowScreen({
  flow,
  onExit,
  onDone,
}: {
  flow: Flow
  onExit: () => void
  onDone: (tab: Tab) => void
}) {
  switch (flow.kind) {
    case 'study':
      return <Study onExit={onExit} />
    case 'quick':
      // 의욕 없는 날의 진입로. 설정을 안 건드리므로 다음 세션은 원래 길이로 돌아온다 (Phase 11)
      return <Study limit={QUICK_SESSION_LIMIT} onExit={onExit} />
    case 'rematch':
      return <Study kind="rematch" onExit={onExit} />
    case 'kun':
      return <Study track="kun" onExit={onExit} />
    case 'focus':
      return <Study kind="focus" focusPairIds={flow.pairIds} onExit={onExit} />
    case 'browse':
      return <Browse onExit={onExit} filter={flow.filter} />
    case 'diagnostic':
      // 진단이 끝나면 결과를 보는 자리로 — 리포트 탭이 그 자리다
      return (
        <Diagnostic
          onDone={() => {
            onExit()
            onDone('report')
          }}
          onExit={onExit}
        />
      )
  }
}

function TabRoot({
  tab,
  onSub,
  onFlow,
}: {
  tab: Tab
  onSub: (s: Sub) => void
  onFlow: (f: Flow) => void
}) {
  switch (tab) {
    case 'home':
      return <Home onFlow={onFlow} />
    case 'report':
      return (
        <Report
          onBrowse={() => onFlow({ kind: 'browse' })}
          onBrowseMistake={(type, voicing, label) =>
            onFlow({ kind: 'browse', filter: { type, voicing, label } })
          }
          onFocus={(pairIds) => onFlow({ kind: 'focus', pairIds })}
          onRule={(focus) => onSub({ kind: 'rules', focus })}
          onOnyomi={() => onSub({ kind: 'onyomi' })}
        />
      )
    case 'search':
      return <Search />
    case 'settings':
      return <Settings onFeedback={() => onSub({ kind: 'feedback' })} />
  }
}

function SubScreen({ sub, onBack }: { sub: Sub; onBack: () => void }) {
  switch (sub.kind) {
    case 'onyomi':
      return <OnyomiMap onBack={onBack} />
    case 'rules':
      return <Rules onBack={onBack} focus={sub.focus} />
    case 'feedback':
      return <Feedback onBack={onBack} />
  }
}
