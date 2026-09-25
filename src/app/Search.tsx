// 읽기로 찾기 — 히라가나(또는 로마자)로 한자 표기를 찾는다 (2026-09-16).
//
// **채점은 여전히 여기서 안 한다.** 답을 본 직후에 그 숙어를 바로 문제로 내면 정답이
// 잡음으로 쌓여 리포트 정답률이 흔들린다 — 「지금 풀어보기」는 계속 기각 상태다
// (context-notes 2026-09-16).
//
// 대신 **담아 두기**가 있다 (2026-09-21 사용자 요청). 담은 표현은 다음 세션에 소개로
// 먼저 나온다 — 시험이 아니라 보여주는 자리라 위 문제를 안 만든다. `star` 이벤트 하나만
// 남고 FSRS 는 그대로다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CameraIcon } from './icons.tsx'
import { toKana } from 'wanakana'
import { RomajiKeypad } from '../study/RomajiKeypad.tsx'
import { useCoarsePointer } from '../study/useCoarsePointer.ts'
import { dataVersion } from '../core/dataVersion.ts'
import { replay } from '../core/replay.ts'
import { recordStar } from '../core/session.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import {
  loadBand4Idioms,
  loadBaseIdioms,
  loadKanji,
  type KanjiInfo,
  type RuntimeIdiom,
} from '../dict/load.ts'
import type { CameraFound } from './CameraFind.tsx'
import {
  loadReadingIndex,
  loadBand4ReadingIndex,
  looksLikeHeadword,
  searchByHeadword,
  searchByReading,
  type ReadingGroup,
  type ReadingIndex,
} from '../dict/readingIndex.ts'
import { adopt, loadWideDict, type WideDict, type WideIdiom } from '../dict/wide.ts'
import { loadCurrentList } from './currentList.ts'

/** 한 화면에 낼 묶음 수. 앞부분 일치는 금방 불어난다 (`こう` 로만 쳐도 수백 개) */
const GROUP_LIMIT = 20

/**
 * 학습 사전 밖까지 찾기로 한 적이 있나 (2026-09-25). 기기별이라 동기화 안 한다 —
 * 한 번 받으면 캐시에 남으므로 같은 기기에서 다시 물을 이유가 없다
 */
const WIDE_KEY = 'yomenai:wideDict'
function wideAllowed(): boolean {
  try {
    return localStorage.getItem(WIDE_KEY) === '1'
  } catch {
    return false
  }
}
function allowWide(): void {
  try {
    localStorage.setItem(WIDE_KEY, '1')
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
}

interface Loaded {
  index: ReadingIndex
  kanji: Map<string, KanjiInfo>
  poolSize: number
  /** idiomId → 읽기 카드 오답 수. 0 인 숙어는 안 담는다 */
  wrong: Map<string, number>
  /** 담아 둔 목록을 그리려면 id 만으로 표기·읽기를 찾을 수 있어야 한다 */
  byId: Map<string, RuntimeIdiom>
  /** 표기 → id. 카메라 후보는 표기로 오므로 되짚을 길이 있어야 한다 (2026-09-23) */
  idOfHead: Map<string, string>
  /** 이미 카드가 생긴 숙어 — 담겨 있어도 별이 할 일이 끝난 것들이다 (`select.ts` 와 같은 기준) */
  started: Set<string>
}

/**
 * 표기의 한국 한자음. 한자마다 대표음 하나씩 이어 붙인다.
 * 자료에 음이 없는 글자(々, 일부 신자체)는 `—` 로 둔다 — 오답 상세와 같은 표기다.
 */
function koreanOf(headword: string, kanji: Map<string, KanjiInfo>): string {
  return [...headword].map((c) => kanji.get(c)?.kr[0] ?? '—').join('')
}

/**
 * 마지막으로 만든 인덱스·집계 (2026-09-21). 탭을 옮기면 언마운트되는데, 다시 들어올 때마다
 * `listEvents` → `replay` 를 처음부터 돌면 검색창 아래 글자가 한 박자 늦게 뜬다
 * (사용자 지적). `Home`·`Report` 와 같은 관례다 — 담기/빼기도 이벤트라 버전이 올라
 * 자동으로 버려진다.
 */
let cache: { version: number; loaded: Loaded; starred: Set<string> } | null = null

export function Search({
  onCamera,
  onWordlist,
  found,
  onUsedFound,
}: {
  /** 카메라로 찾기로 한 겹 들어간다 (2026-09-23) */
  onCamera: () => void
  /** 단어장으로 한 겹 들어간다 (2026-09-25) */
  onWordlist: () => void
  /** 카메라가 찾아낸 것. 없으면 `null` */
  found: CameraFound | null
  /** 받아서 썼다고 알린다 — 다시 들어올 때 옛 결과가 남아 있으면 안 된다 */
  onUsedFound: () => void
}) {
  const [raw, setRaw] = useState('')
  const [loaded, setLoaded] = useState<Loaded | null>(
    () => (cache?.version === dataVersion() ? cache.loaded : null),
  )
  const [error, setError] = useState<string | null>(null)
  /**
   * 담아 둔 숙어. 이벤트를 다시 재생하지 않고 화면에서 바로 갈아 끼운다 —
   * 로그는 append-only 라 한 건 덧붙인 결과가 곧 이 집합의 한 칸 변화다
   */
  const [starred, setStarred] = useState<Set<string>>(
    () => (cache?.version === dataVersion() ? cache.starred : new Set()),
  )

  const toggleStar = (idiomId: string) => {
    const on = !starred.has(idiomId)
    setStarred((prev) => {
      const next = new Set(prev)
      if (on) next.add(idiomId)
      else next.delete(idiomId)
      return next
    })
    void appendEvent(
      db(),
      recordStar({
        idiomId,
        on,
        // 담을 때마다 묶음을 묻지 않는다 — 한 번 누를 일이 두 번이 된다.
        // 어느 묶음인지는 단어장 화면에서 미리 정해 둔다 (2026-09-25)
        ...(on ? { list: loadCurrentList() } : {}),
        ctx: { userId: LOCAL_USER_ID, deviceId: getDeviceId(), at: Date.now() },
      }),
    )
  }

  useEffect(() => {
    if (cache?.version === dataVersion()) return
    let alive = true
    ;(async () => {
      try {
        const [index, kanji, pool, events] = await Promise.all([
          loadReadingIndex(),
          loadKanji(),
          loadBaseIdioms(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const state = replay(events)
        const wrong = new Map<string, number>()
        const started = new Set<string>()
        for (const c of state.cards.values()) {
          if (c.cardType === 'reading' && c.wrong > 0) wrong.set(c.idiomId, c.wrong)
          started.add(c.idiomId)
        }
        const next: Loaded = {
          index, kanji, poolSize: pool.length, wrong, started,
          byId: new Map(pool.map((it) => [it.idiomId, it])),
          idOfHead: new Map(pool.map((it): [string, string] => [it.headword, it.idiomId]).reverse()),
        }
        cache = { version: dataVersion(), loaded: next, starred: state.starred }
        setLoaded(next)
        setStarred(state.starred)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  /**
   * 카메라가 찾아낸 것을 받는다 (결정 9). **정확히 걸렸으면 입력란을 대신 채운다** —
   * 그러면 기존 검색이 그대로 돌아 결과가 뜬다. 카메라는 키보드를 대신하는 입력
   * 수단이지 새 화면 계통이 아니다. 확실치 않으면 후보를 아래에 나열한다.
   *
   * 효과가 아니라 **렌더 중에 맞춘다.** 효과로 두면 한 번 그린 뒤 다시 그려서 빈 칸이
   * 한 박자 비친다 — prop 이 바뀔 때 상태를 맞추는 React 권장 형태다
   */
  const [seen, setSeen] = useState<CameraFound | null>(null)
  if (found !== null && found !== seen) {
    setSeen(found)
    setRaw(found.fill ?? '')
  }

  /**
   * 밴드 4까지 넓힌 자료 (2026-09-23 사용자 판정). **찾기는 학습이 아니라 조회라**
   * 출제 범위와 찾을 수 있는 범위가 같을 이유가 없다 — 소설에서 막히는 말일수록
   * 빈도표 밖이다 (`陰鬱`·`憂鬱` 이 밴드 4다).
   *
   * 20MB 라 화면을 열 때가 아니라 **실제로 찾기 시작할 때** 부른다. 한 번 받으면
   * 서비스워커 런타임 캐시에 남는다
   */
  const [wide, setWide] = useState<Pick<Loaded, 'index' | 'byId' | 'idOfHead' | 'poolSize'> | null>(
    null,
  )
  const [widening, setWidening] = useState(false)
  const asked = useRef(false)
  const wants = raw.trim() !== '' || found !== null

  useEffect(() => {
    if (!wants || asked.current) return
    asked.current = true
    let alive = true
    setWidening(true)
    ;(async () => {
      try {
        const [index, band4, base] = await Promise.all([
          loadBand4ReadingIndex(),
          loadBand4Idioms(),
          loadBaseIdioms(),
        ])
        if (!alive) return
        const all = [...base, ...band4]
        setWide({
          index,
          byId: new Map(all.map((it) => [it.idiomId, it])),
          idOfHead: new Map(all.map((it): [string, string] => [it.headword, it.idiomId]).reverse()),
          poolSize: all.length,
        })
      } catch {
        /* 못 받으면 좁은 자료로 그대로 간다. 찾기가 멈추지는 않는다 */
      } finally {
        if (alive) setWidening(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [wants])

  /** 넓힌 게 오면 그걸 쓰고, 아니면 기본 자료로 */
  const view = useMemo(
    () => (loaded === null ? null : wide === null ? loaded : { ...loaded, ...wide }),
    [loaded, wide],
  )

  /** 한자가 섞였으면 표기로, 아니면 읽기로 찾는다 (2026-09-24) */
  const byHead = looksLikeHeadword(raw)
  const groups = useMemo(
    () =>
      view === null
        ? []
        : byHead
          ? searchByHeadword(view.index, raw, GROUP_LIMIT)
          : searchByReading(view.index, raw, GROUP_LIMIT),
    [view, raw, byHead],
  )

  /**
   * 학습 사전 밖 (2026-09-25 사용자 제안 「학습용 사전 외의 범위에서 찾겠냐고 묻는 건 어떤가」).
   *
   * **0건일 때만 쓴다.** 학습 사전에서 나왔으면 그게 답이고, 밖엣것까지 섞으면 소음이다.
   * 한 번 받겠다고 한 기기에서는 다시 안 묻는다 — 이미 캐시에 있다
   */
  const [outside, setOutside] = useState<WideDict | null>(null)
  const [outsideFailed, setOutsideFailed] = useState(false)
  /** 이번 화면에서 눌렀나. 전에 받아 둔 기기라면 안 물어도 켠 것으로 본다 */
  const [askedOutside, setAskedOutside] = useState(false)
  const getOutside = useCallback(() => {
    allowWide()
    setOutsideFailed(false)
    setAskedOutside(true)
  }, [])

  const typed = raw.trim() !== ''
  const noHit = typed && !widening && groups.length === 0
  const wantOutside = askedOutside || (noHit && wideAllowed())

  // **효과 안에서 동기로 setState 하지 않는다** — 받아 온 뒤에만 상태가 바뀐다.
  // 켤지 말지는 렌더 중에 파생되고(`wantOutside`), 누른 것은 이벤트가 기록한다
  useEffect(() => {
    if (!wantOutside || outside !== null || outsideFailed) return
    let alive = true
    loadWideDict().then(
      (d) => {
        if (alive) setOutside(d)
      },
      () => {
        if (alive) setOutsideFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [wantOutside, outside, outsideFailed])

  const outsideGroups = useMemo(
    () =>
      outside === null || !typed
        ? []
        : byHead
          ? searchByHeadword(outside.index, raw, GROUP_LIMIT)
          : searchByReading(outside.index, raw, GROUP_LIMIT),
    [outside, raw, byHead, typed],
  )

  /** 한국 한자음은 두 자료를 합쳐 본다 — `轟` 은 넓힌 사전 쪽에만 있다 */
  const outsideKanji = useMemo(
    () => (outside === null || loaded === null ? null : new Map([...loaded.kanji, ...outside.kanji])),
    [outside, loaded],
  )

  /** 자판을 띄울지 — 입력창을 누른 뒤에만 뜬다 */
  const [typing, setTyping] = useState(false)
  const keypad = useCoarsePointer()
  const ref = useRef<HTMLInputElement>(null)

  return (
    <section className="screen">
      <div className="screen-bar">
        <h2>읽기로 찾기</h2>
      </div>

      <div className={`screen-body${keypad && typing ? ' with-keypad' : ''}`}>
        <div className="search-row">
        <input
          className="search-input"
          type="text"
          /* KanaInput 과 같은 처방 — 일본어 IME 후보 바를 막고 ASCII 키보드를 띄운다.
             그쪽은 채점 제출용이라 재사용하지 않는다. 변환도 bind 가 아니라 toKana 다 —
             입력마다 결과를 다시 그려야 해서 값이 React state 에 있어야 한다 (context-notes) */
          ref={ref}
          lang="en"
          name="reading-search"
          /* 자체 자판을 띄우는 기기에서는 시스템 키보드를 막는다 — 세션 화면과 같은 이유다
             (iOS 가 마지막에 쓴 키보드를 기억해 한글 자판이 먼저 뜬다, 2026-09-19) */
          inputMode={keypad ? 'none' : 'url'}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="읽는 법 · 한자 (붙여넣기)"
          aria-label="읽기 또는 한자 검색"
          value={raw}
          onChange={(e) => setRaw(toKana(e.target.value, { IMEMode: 'toHiragana' }))}
          onFocus={() => setTyping(true)}
        />
        {/* 읽는 법을 모를 때 쓰는 입력 수단이다. 검색창 **옆**에 두는 이유가 그것이다 —
            둘 다 같은 질문("이 단어가 뭐냐")에 답하는 길이다 */}
        <button type="button" className="cam-open" onClick={onCamera} aria-label="카메라로 찾기">
          <CameraIcon />
        </button>
        </div>
        {/* 자판은 **입력창을 눌렀을 때만** 뜬다. 찾기는 결과 목록이 주인공이라
            자판이 늘 떠 있으면 화면을 절반 먹는다 (2026-09-19) */}
        {keypad && typing && (
          <RomajiKeypad
            onKey={(ch) => setRaw((v) => toKana(v + ch, { IMEMode: 'toHiragana' }))}
            onBackspace={() => setRaw((v) => [...v].slice(0, -1).join(''))}
            onSubmit={() => {
              setTyping(false)
              ref.current?.blur()
            }}
            submitLabel="닫기"
            docked
          />
        )}

        {error !== null ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : view === null ? (
          <p className="empty">불러오고 있어요…</p>
        ) : !typed ? (
          <>
            {found !== null && found.fill === null && (
              <CameraCandidates
                found={found}
                loaded={view}
                starred={starred}
                onToggle={toggleStar}
                onClose={onUsedFound}
              />
            )}
            <Basket loaded={view} starred={starred} onToggle={toggleStar} />
            {/* 담기 대기열(Basket)과 다른 물건이다 — 저쪽은 세션에 나오면 사라지고
                단어장은 남는다. 담은 게 없어도 진입로는 늘 보인다 (2026-09-25) */}
            <button type="button" className="btn wl-open" onClick={onWordlist}>
              단어장{starred.size > 0 && ` · ${starred.size.toLocaleString('ko')}`}
            </button>
            <Scope poolSize={view.poolSize} widening={widening} />
          </>
        ) : groups.length === 0 ? (
          <>
            <p className="empty">
              {widening ? (
                <>
                  <b lang="ja">{raw}</b> 로 찾는 중이에요. 더 넓은 사전을 받고 있어요…
                </>
              ) : byHead ? (
                <>
                  <b lang="ja">{raw}</b> 라는 표기가 학습 사전에 없어요.
                </>
              ) : (
                <>
                  <b lang="ja">{raw}</b> 로 읽히는 숙어가 학습 사전에 없어요.
                </>
              )}
            </p>
            {noHit && (
              <Outside
                dict={outside}
                state={outsideFailed ? 'failed' : wantOutside ? 'loading' : 'idle'}
                groups={outsideGroups}
                kanji={outsideKanji ?? view.kanji}
                starred={starred}
                onToggle={toggleStar}
                onAsk={getOutside}
              />
            )}
            <Scope poolSize={view.poolSize} widening={widening} />
          </>
        ) : (
          groups.map((g) => (
            <Group
              key={g.reading}
              group={g}
              loaded={view}
              starred={starred}
              onToggle={toggleStar}
            />
          ))
        )}
      </div>
    </section>
  )
}

/**
 * 담아 둔 표현 (2026-09-21). 안 쳤을 때만 보인다 — 찾는 중에는 결과가 주인공이다.
 * **이미 카드가 생긴 것은 빼고 보여준다.** 별이 하는 일은 신규 도입 우선권까지라
 * 한 번 나온 뒤로는 목록에 남아 있어도 아무 일도 안 한다 (`select.ts` 와 같은 기준).
 */
function Basket({
  loaded,
  starred,
  onToggle,
}: {
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  const waiting = [...starred].filter((id) => !loaded.started.has(id) && loaded.byId.has(id))
  if (waiting.length === 0) return null

  return (
    <div className="basket">
      <p className="section-title">
        담아 둔 표현<span className="dim"> · {waiting.length}</span>
      </p>
      <IdiomRows ids={waiting} loaded={loaded} starred={starred} onToggle={onToggle} />
      {/* 밴드 4(출제 범위 밖)도 **담으면 나온다** (2026-09-23). 자동 출제는 안 하고
          담은 것만 들인다 — 「내가 만난 말을 담는다」는 담기의 뜻 그대로다 */}
      <p className="basket-note">다음 세션에 소개로 먼저 나와요.</p>
    </div>
  )
}

/**
 * 담기·빼기 한 버튼 (2026-09-21 사용자 요청으로 ☆ → +).
 * 색만으로 구분하지 않는다 (PLAN §7) — 기호 자체가 + 와 − 로 바뀐다.
 */
/**
 * 표기·읽기·뜻·담기 한 줄씩. **담아 둔 목록과 카메라 후보가 같은 모양을 쓴다** —
 * 카메라는 입력 수단이 하나 느는 것이지 새 카드 계통이 아니다 (2026-09-23 결정 9).
 *
 * 읽기를 같이 내는 게 핵심이다. 검색 결과(`Group`)는 읽기로 찾은 것이라 한국 한자음을
 * 내는데, 여기 오는 사람은 **읽는 법을 몰라서** 왔다
 */
function IdiomRows({
  ids,
  loaded,
  starred,
  onToggle,
}: {
  ids: readonly string[]
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  return (
    <ul className="rows">
      {ids.map((id) => {
        const it = loaded.byId.get(id)
        if (it === undefined) return null
        return (
          <li key={id}>
            <span className="r-main" lang="ja">
              {it.headword}
            </span>
            <span className="r-sub" lang="ja">
              {it.reading}
            </span>
            <span className="r-sub r-meaning">{it.koMeaning?.definition ?? ''}</span>
            {loaded.started.has(id) ? (
              <span className="star-slot dim">학습 중</span>
            ) : (
              <StarButton
                headword={it.headword}
                on={starred.has(id)}
                onToggle={() => onToggle(id)}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 카메라가 확실치 않을 때 내는 후보 (2026-09-23 결정 6·9).
 *
 * **단정하지 않는다.** 오답이 `軍艦→軍朋` 처럼 한 자만 틀리는 꼴이라 되살릴 여지가
 * 큰데, 읽기를 배우는 앱에서 틀린 단어를 맞다고 하면 그게 곧 오학습이다. 무엇으로
 * 읽혔는지를 같이 보여 주고 고르는 것은 사용자에게 맡긴다
 */
function CameraCandidates({
  found,
  loaded,
  starred,
  onToggle,
  onClose,
}: {
  found: CameraFound
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
  onClose: () => void
}) {
  const ids = found.candidates
    .map((head) => loaded.idOfHead.get(head))
    .filter((id): id is string => id !== undefined)
  if (ids.length === 0) return null

  return (
    <div className="cam-candidates">
      <p className="section-title">
        카메라로 찾은 후보<span className="dim"> · {ids.length}</span>
      </p>
      <p className="cam-raw">
        <span lang="ja">{found.raw}</span> 로 읽혔어요. 아래 중에 있으면 골라 주세요.
      </p>
      <IdiomRows ids={ids} loaded={loaded} starred={starred} onToggle={onToggle} />
      <button type="button" className="link cam-close" onClick={onClose}>
        닫기
      </button>
    </div>
  )
}

function StarButton({
  headword,
  on,
  onToggle,
}: {
  headword: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`star-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={`${headword} ${on ? '빼기' : '담기'}`}
      onClick={onToggle}
    >
      {on ? '−' : '+'}
    </button>
  )
}

/** 찾을 수 있는 범위. 검색창은 "아무거나 찾아도 된다"고 약속하는 물건이라 경계를 적어 둔다 */
function Scope({ poolSize, widening }: { poolSize: number; widening: boolean }) {
  return (
    <p className="search-scope">
      한자 숙어 <b>{poolSize.toLocaleString('ko')}</b>개에서 찾아요
      {widening && <span className="dim"> · 더 넓은 사전을 받는 중…</span>}
      <br />
      동사·형용사와 가나로 쓰는 말은 이 앱이 다루지 않아 나오지 않아요.
    </p>
  )
}

function Group({
  group,
  loaded,
  starred,
  onToggle,
}: {
  group: ReadingGroup
  loaded: Loaded
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  const { reading, items } = group
  const ko = items.map((it) => koreanOf(it.headword, loaded.kanji))
  // 한국 한자음까지 겹치는 줄 — 한국어 지식으로는 못 가르는 구간이라 그 자체가 정보다
  const dup = new Set(ko.filter((k, i) => ko.indexOf(k) !== i))

  return (
    <div className="hit-group">
      {/* 친 것과 정확히 같은 읽기는 진하게 — 앞부분 일치가 길게 붙으면 가나가 서로 닮아 묻힌다 */}
      <p className={group.exact ? 'section-title exact' : 'section-title'}>
        <span lang="ja">{reading}</span>
        <span className="dim"> · {items.length}</span>
      </p>
      <ul className="rows">
        {items.map((it, i) => (
          <li key={it.idiomId}>
            <span className="r-main" lang="ja">
              {it.headword}
            </span>
            <span className="r-sub">
              {ko[i]}
              {dup.has(ko[i]!) && (
                <span className="kr-dup" title="한국 한자음이 같아요">
                  {' '}
                  ⚠
                </span>
              )}
            </span>
            <span className="r-sub r-meaning">{it.koMeaning?.definition ?? ''}</span>
            {loaded.wrong.has(it.idiomId) && (
              <span className="r-tail">✗ {loaded.wrong.get(it.idiomId)}회</span>
            )}
            {/* 이미 카드가 생긴 숙어에는 담기를 안 낸다 — 담아도 아무 일이 안 일어난다.
                빈칸으로 두면 "왜 이 줄만 없지"가 되므로 그 자리에 이유를 적는다 */}
            {loaded.started.has(it.idiomId) ? (
              <span className="star-slot dim">학습 중</span>
            ) : (
              <StarButton
                headword={it.headword}
                on={starred.has(it.idiomId)}
                onToggle={() => onToggle(it.idiomId)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 학습 사전 밖 결과 (2026-09-25 사용자 제안).
 *
 * **담을 수 있는 줄에만 담기를 낸다.** 가르는 기준은 상용한자가 아니라 읽기를 한자
 * 단위로 가를 수 있느냐다 — 못 가르면 음독 맵도 형제 대조도 오답 분류도 안 붙어서
 * 담아 봐야 학습이 안 된다. 누른 뒤에 안 된다고 하면 늦으니 그릴 때 미리 가른다.
 *
 * 뜻은 한국어 번역이 있으면 그것을, 없으면 영어 gloss 를 그대로 낸다.
 */
function Outside({
  dict,
  state,
  groups,
  kanji,
  starred,
  onToggle,
  onAsk,
}: {
  dict: WideDict | null
  state: 'idle' | 'loading' | 'failed'
  groups: ReadingGroup<WideIdiom>[]
  kanji: Map<string, KanjiInfo>
  starred: Set<string>
  onToggle: (idiomId: string) => void
  onAsk: () => void
}) {
  // 받는 중과 다 받은 뒤를 `dict` 로 가른다 — `state` 는 「켰나」까지만 말한다
  if (state === 'loading' && dict === null) {
    return <p className="empty">학습 사전 밖에서 찾고 있어요…</p>
  }
  if (state === 'failed') {
    return (
      <div className="outside-ask">
        <button type="button" className="btn" onClick={onAsk}>
          다시 시도
        </button>
        <span className="dim">사전을 못 받았어요.</span>
      </div>
    )
  }
  if (dict === null) {
    return (
      <div className="outside-ask">
        <button type="button" className="btn" onClick={onAsk}>
          학습 사전 밖에서 찾기
        </button>
        <span className="dim">
          상용한자 밖 글자가 섞인 표현까지 찾아요. 사전과 전용 글꼴을 처음 한 번 받아요 (약 3.6MB).
        </span>
      </div>
    )
  }
  if (groups.length === 0) return <p className="empty">학습 사전 밖에서도 못 찾았어요.</p>

  return (
    <>
      <p className="outside-note">
        학습 사전 밖이에요. 담으면 세션에 들어와요 — 뜻이 없어 읽기만 물어요.
        「읽기만」은 읽기를 한자 단위로 못 갈라 담을 수 없는 거예요.
      </p>
      {groups.map((g) => (
        <OutsideGroup key={g.reading} group={g} kanji={kanji} starred={starred} onToggle={onToggle} />
      ))}
    </>
  )
}

function OutsideGroup({
  group,
  kanji,
  starred,
  onToggle,
}: {
  group: ReadingGroup<WideIdiom>
  kanji: Map<string, KanjiInfo>
  starred: Set<string>
  onToggle: (idiomId: string) => void
}) {
  const { reading, items } = group
  // 담을 수 있는지는 **그릴 때 한 번** 본다 — 누른 뒤에 안 된다고 하면 늦다.
  // 가르는 기준은 상용한자가 아니라 읽기를 한자 단위로 가를 수 있느냐다
  const look = (k: string) => {
    const r = kanji.get(k)
    return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
  }
  const canAdopt = new Set(items.filter((it) => adopt(it, look) !== null).map((it) => it.id))
  return (
    <div className="hit-group outside">
      <p className={group.exact ? 'section-title exact' : 'section-title'}>
        <span lang="ja">{reading}</span>
        <span className="dim"> · {items.length}</span>
      </p>
      <ul className="rows">
        {items.map((it) => (
          <li key={it.id}>
            <span className="r-main" lang="ja">
              {it.headword}
            </span>
            <span className="r-sub">{koreanOf(it.headword, kanji)}</span>
            {/* 한국어 번역이 있으면 그것을, 없으면 영어 gloss 를 그대로 —
                없는 것을 있는 척하지 않는다 */}
            <span className="r-sub r-meaning">
              {it.koMeaning?.definition ?? it.glossEn.slice(0, 3).join('; ')}
            </span>
            {canAdopt.has(it.id) ? (
              <StarButton
                headword={it.headword}
                on={starred.has(it.id)}
                onToggle={() => onToggle(it.id)}
              />
            ) : (
              <span className="star-slot dim" title="읽기를 한자 단위로 못 갈라요">
                읽기만
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
