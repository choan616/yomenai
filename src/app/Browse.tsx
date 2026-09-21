// 다시보기 화면 — 자주 틀린 숙어를 채점 없이 한 장씩 넘겨 본다 (사용자 요청 2026-09-12).
// 세션과 같은 카드 셸을 쓰되 입력·채점·이벤트가 없다. FSRS 도 안 건드린다.
//
// 넘김은 **CSS scroll-snap 캐러셀**이다 (사용자 요청). 손가락을 따라 오는 움직임·관성·
// 스냅을 브라우저가 하고, 이 파일은 스크롤 위치에서 지금 장을 읽어 머리말에 반영하는 것과
// 버튼이 트랙을 스크롤하게 하는 것만 한다.
import { useEffect, useRef, useState } from 'react'
import { frequentIdioms, pickBrowse, pickBrowseMore } from '../core/report.ts'
import { replay } from '../core/replay.ts'
import {
  classifiedMistakes,
  frequentIdiomsByMistake,
  frequentIdiomsUnnamed,
  mistakeOfIdiom,
  verdictByEvent,
  type IdiomMistake,
} from '../core/ruleRecord.ts'
import type { VoicingKind } from '../core/mistakes.ts'
import type { MistakeType } from '../core/types.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadExamples, loadKanji } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import { rubyOf, type RubySegment } from '../core/ruby.ts'
import { mistakeLabel } from '../study/mistakeLabels.ts'
import { Mixed, RuleBody } from './RuleBody.tsx'
import { ruleForMistake, ruleSection, type RuleSection } from './rules.ts'
import { loadSettings } from './settings.ts'
import { tts } from '../study/tts.ts'
import { useViewportLock } from '../study/useViewportLock.ts'

interface BrowseItem {
  id: string
  headword: string
  reading: string
  meaning: string
  wrong: number
  sentences: string[]
  /** 한자 위에 얹을 읽기 — 목록을 만들 때 같이 계산한다 */
  ruby: RubySegment[]
  /** 이 숙어에서 제일 자주 난 오답의 규칙 절. 유형이 붙은 오답이 없으면 null */
  rule: { section: RuleSection; label: string } | null
}

/** 대표 오답을 그 오답이 속한 절로 옮긴다. 규칙이 없는 유형이면 배지를 안 단다 */
function ruleOf(m: IdiomMistake | undefined): BrowseItem['rule'] {
  if (m === undefined) return null
  const id = ruleForMistake(m.type, m.voicing)
  const section = id === null ? undefined : ruleSection(id)
  return section === undefined ? null : { section, label: mistakeLabel(m.type, m.voicing) }
}

export function Browse({
  onExit,
  filter,
}: {
  onExit: () => void
  /**
   * 있으면 이 오답 유형(+탁음이면 갈래)만 걸러 다시본다 (2026-09-18, 리포트 분포 그래프).
   * `type` 이 `null` 이면 **이름이 안 붙은 오답**(「잘못 읽기」)을 모은다
   */
  filter?: { type: MistakeType | null; voicing: VoicingKind | null; label: string }
}) {
  useViewportLock()
  /**
   * 후보 **전량**. 화면에 낼 한 벌은 여기서 뽑는다 — 「다른 N개」가 DB 를 다시 읽지 않게
   * 들고 있는다 (2026-09-21). 들어올 때 한 번만 만든다
   */
  const [all, setAll] = useState<BrowseItem[] | null>(null)
  const [items, setItems] = useState<BrowseItem[] | null>(null)
  /** 이번 방문에서 이미 낸 숙어. 한 벌 더 뽑을 때 안 본 것부터 채우는 기준이다 */
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set())
  /**
   * 몇 번째 한 벌인가. **트랙의 key 다** (2026-09-21).
   *
   * 스냅 컨테이너(`scroll-snap-type: x mandatory`)는 내용이 바뀌면 직전에 스냅돼 있던
   * **요소**를 다시 찾아간다. 두 벌째가 이미 본 것으로 메워지면 그 요소가 새 목록 어딘가에
   * 살아 있어서, 마지막 장에서 한 벌 더 부르면 12번째 장 같은 자리로 끌려갔다.
   * 트랙째 새로 다는 쪽이 `scrollTo(0)` 로 밀어내는 것보다 확실하다
   */
  const [round, setRound] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  /** 캐러셀 트랙. 버튼은 여기를 스크롤하고, 손가락 넘김은 브라우저가 한다 */
  const track = useRef<HTMLElement | null>(null)
/**
   * 지금 보는 카드에서 몇 번째 예문을 펼쳐 뒀는지. **카드를 떠나면 0 으로 되돌린다** —
   * 트랙이 모든 장을 띄워 두는 구조라 안 그러면 몇 장 전에 넘겨 둔 자리가 그대로 남는다.
   */
  const [exIndex, setExIndex] = useState(0)
  /** 지금 카드에서 규칙을 펼쳐 뒀는지. 예문 자리와 같은 이유로 카드를 떠나면 접는다 */
  const [ruleOpen, setRuleOpen] = useState(false)
  /**
   * 지금 카드의 요미가나를 벗겼는지 (2026-09-21). 예문·규칙과 같이 **카드를 떠나면 도로
   * 가린다** — 다시 만났을 때 또 스스로 떠올려 보는 게 이 화면의 값이다
   */
  const [revealed, setRevealed] = useState(false)
  /** 가림을 쓸지. 들어올 때 한 번 읽어 고정한다 — 넘기는 도중에 규칙이 바뀌면 안 된다 */
  const [mask] = useState(() => loadSettings().browseMask)
  // 장이 바뀌면 렌더 중에 자리를 되돌린다. effect 로 하면 한 번 그린 뒤 다시 그리게 된다
  const [exCard, setExCard] = useState(0)
  if (exCard !== at) {
    setExCard(at)
    setExIndex(0)
    setRuleOpen(false)
    setRevealed(false)
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 예문은 목록과 같이 받는다 — 카드를 넘길 때마다 기다리면 넘기는 맛이 죽는다
        const [pool, examples, kanji, events] = await Promise.all([
          loadBaseIdioms(),
          loadExamples(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        const nameOf = (id: string) => {
          const it = byId.get(id)
          return it ? { headword: it.headword, reading: it.reading } : undefined
        }
        // 배지에 실을 규칙 — 규칙 화면과 **같은 함수**로 갈래를 매긴다 (2026-09-17).
        // `filter` 가 있으면 대상 숙어를 거르는 데도 같은 갈래 판정(verdictOf)을 쓴다 —
        // 분포 그래프가 센 것과 다시보기 대상이 어긋나면 안 된다
        const ctx = mistakeContextFromKanji(kanji)
        const wrong = classifiedMistakes(events)
        const verdictOf = verdictByEvent(wrong, ctx, (id) => byId.get(id)?.headword)
        const worst = mistakeOfIdiom(wrong, verdictOf)
        // 후보는 전량을 만들어 두고 뽑기만 여기서 한다 — 넘기는 도중에 목록이 바뀌면 안 된다
        const rows = (
          filter
            ? filter.type === null
              ? frequentIdiomsUnnamed(events, verdictOf, nameOf)
              : frequentIdiomsByMistake(wrong, verdictOf, filter.type, filter.voicing, nameOf)
            : frequentIdioms(
                replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] }),
                nameOf,
              )
        )
        const lookup = ctx.lookup
        const enriched: BrowseItem[] = rows.map((r) => ({
          ...r,
          meaning: byId.get(r.id)?.koMeaning?.definition?.trim() ?? '',
          sentences: examples.get(r.id) ?? [],
          ruby: rubyOf(r.headword, r.reading, lookup),
          rule: ruleOf(worst.get(r.id)),
        }))
        const first = pickBrowse(enriched)
        setAll(enriched)
        setItems(first)
        setShown(new Set(first.map((it) => it.id)))
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
    // filter 는 이 화면이 열릴 때 한 번 정해지고 안 바뀐다(App.tsx 가 새 Flow 로만 갱신)
  }, [filter])

  if (error !== null) {
    return <Centered message="불러오지 못했어요." detail={error} onExit={onExit} />
  }
  if (items === null || all === null) {
    return <div className="centered">불러오고 있어요…</div>
  }
  if (items.length === 0) {
    return (
      <Centered
        message="아직 다시 볼 게 없어요."
        detail="틀린 숙어가 쌓이면 여기 모여요."
        onExit={onExit}
      />
    )
  }

  /** 후보가 화면에 낸 수보다 많나 — 「다른 N개」라고 말해도 되는지가 여기서 갈린다 */
  const hasOthers = all.length > items.length
  /** 마지막 장에서만 「돌아가기」가 는다 */
  const last = at === items.length - 1

  const reroll = () => {
    const next = pickBrowseMore(all, shown)
    setItems(next)
    setShown((prev) => new Set([...prev, ...next.map((it) => it.id)]))
    // 트랙을 새로 달아 첫 장에서 시작한다 (round 주석 참조)
    setRound((n) => n + 1)
    setAt(0)
  }

  const move = (d: -1 | 1) => {
    const el = track.current
    if (el === null) return
    const next = Math.min(items.length - 1, Math.max(0, at + d))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="study browse-screen">
      <header className="study-bar">
        <button type="button" className="link" onClick={onExit} aria-label="다시보기 나가기">
          ✕
        </button>
        <progress value={at + 1} max={items.length} />
        <span className="count">
          {at + 1} / {items.length}
        </span>
      </header>

      <main
        className="study-main browse-track"
        key={round}
        ref={track}
        onScroll={(e) => {
          // 한 장 폭으로 스냅되므로 반올림이 곧 지금 장이다. 값이 바뀔 때만 리렌더한다
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
          setAt((prev) => (prev === i ? prev : Math.min(items.length - 1, Math.max(0, i))))
        }}
      >
        {items.map((item, index) => (
          <BrowseSlide
            item={item}
            filterLabel={filter?.label}
            mask={mask}
            masked={mask && !(index === at && revealed)}
            onToggleMask={() => setRevealed((v) => !v)}
            exAt={index === at ? exIndex : 0}
            onNextEx={() => setExIndex((n) => (n + 1) % item.sentences.length)}
            ruleOpen={index === at && ruleOpen}
            onToggleRule={() => setRuleOpen((v) => !v)}
            key={item.id}
          />
        ))}
      </main>

      {/* 넘김 버튼은 트랙 밖에 한 벌만 둔다 — 카드를 따라 흘러가면 누르려던 자리가 움직인다.
          마지막 장에만 「돌아가기」가 는다. 빈 슬롯으로 자리를 잡아 두면 그 장 아닌 곳이
          오른쪽으로 빈 채 남아 쏠려 보여서(2026-09-21 사용자 지적), 열을 글자 폭으로 두고
          가운데가 남는 자리를 먹게 했다 — 이전 버튼은 어느 장에서도 같은 자리다 */}
      <div className="card-bottom browse-nav">
        <div className={`answer-row${last ? ' last' : ''}`}>
          <button type="button" className="btn" disabled={at === 0} onClick={() => move(-1)}>
            ‹ 이전
          </button>
          {last ? (
            <button type="button" className="btn-primary" onClick={reroll}>
              {hasOthers ? `다른 ${items.length}개` : '한 바퀴 더'} ›
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => move(1)}>
              다음 ›
            </button>
          )}
          {last && (
            <button type="button" className="btn" onClick={onExit}>
              돌아가기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 카드 한 장. 예문은 **한 줄씩** 보여주고 여러 개일 때만 넘길 수 있게 한다
 * (사용자 요청 2026-09-12). 넘기는 건 이 카드의 예문뿐이고 카드는 안 움직인다.
 *
 * 예문 자리(`exAt`)는 부모가 준다 — 카드를 떠나면 0 으로 파생돼 첫 예문으로 돌아간다.
 */
function BrowseSlide({
  item,
  filterLabel,
  mask,
  masked,
  onToggleMask,
  exAt,
  onNextEx,
  ruleOpen,
  onToggleRule,
}: {
  item: BrowseItem
  /** 유형별 다시보기면 그 유형 이름 — "다시보기" 태그 옆에 왜 이 목록인지 밝힌다 */
  filterLabel?: string
  /** 가림 기능을 쓰는가 (설정). 버튼을 낼지가 여기서 갈린다 */
  mask: boolean
  /** 지금 덮여 있나 */
  masked: boolean
  onToggleMask: () => void
  exAt: number
  onNextEx: () => void
  ruleOpen: boolean
  onToggleRule: () => void
}) {
  const sentence = item.sentences[exAt]

  return (
    <div className="browse-slide">
      <div className="card">
        <div className="card-head">
          <span className="tag">다시보기{filterLabel ? ` · ${filterLabel}` : ''}</span>
          <span className="tag muted">{item.wrong}회 틀림</span>
          {/* 이 숙어를 왜 틀렸나 — 같은 줄에 규칙 이름으로 (사용자 요청 2026-09-17).
              누르면 그 절이 카드 안에서 펼쳐진다. 규칙 화면으로 나가면 넘기던 자리를 잃는다 */}
          {item.rule !== null && (
            <button
              type="button"
              className="tag rule-tag"
              aria-expanded={ruleOpen}
              onClick={onToggleRule}
            >
              {item.rule.label} 규칙
            </button>
          )}
        </div>
        <div className="card-body">
          {/* 설명 카드는 한자 위에 읽기를 얹는다 (2026-09-14) */}
          <p className={`headword has-ruby${masked ? ' masked' : ''}`} lang="ja">
            {item.ruby.map((r, i) => (
              <ruby key={i}>
                {r.text}
                <rt>{r.rt}</rt>
              </ruby>
            ))}
          </p>
          {/* 벗긴 뒤에도 버튼을 **치우지 않는다** — 카드 본문이 세로 가운데 정렬이라
              한 줄이 빠지면 한자가 19px 내려앉는다 (2026-09-21 실측). 도로 가리는 쪽이
              자리를 지키면서 쓸모도 있다 */}
          {mask && (
            <button
              type="button"
              className="browse-reveal"
              aria-pressed={!masked}
              onClick={onToggleMask}
            >
              {masked ? '읽기 보기' : '다시 가리기'}
            </button>
          )}
          {item.meaning && <p className="meaning">{item.meaning}</p>}
          {tts.available && (
            <button type="button" className="tts-btn" onClick={() => tts.speak(item.reading)}>
              <span aria-hidden="true">🔊</span> 소리 듣기
            </button>
          )}
          {sentence !== undefined && (
            <p className="browse-ex" lang="ja">
              {sentence}
            </p>
          )}
          {item.sentences.length > 1 && (
            <button
              type="button"
              className="browse-ex-more"
              onClick={onNextEx}
            >
              다음 예문 <span className="dim">{exAt + 1}/{item.sentences.length}</span>
            </button>
          )}
          {item.rule !== null && ruleOpen && (
            <div className="browse-rule">
              <p className="browse-rule-title">
                <Mixed text={item.rule.section.title} />
              </p>
              <RuleBody section={item.rule.section} short />
              <p className="browse-rule-tail dim">
                규칙 전체는 리포트의 「읽기 규칙」에서 볼 수 있어요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Centered({
  message,
  detail,
  onExit,
}: {
  message: string
  detail: string
  onExit: () => void
}) {
  return (
    <div className="centered">
      <p>{message}</p>
      <p className="dim">{detail}</p>
      <button type="button" className="btn-primary" onClick={onExit}>
        돌아가기
      </button>
    </div>
  )
}
