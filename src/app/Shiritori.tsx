// 한자 끝말잇기 화면 — 앞 말의 끝 한자로 시작하는 말의 읽기를 쳐서 잇는다 (2026-10-04, context-notes 같은 날 절)
//
// 학습 기록은 남기지 않는다(놀이 결과가 밴드 사다리·복습 주기에 섞이지 않게). 쓰는 말은 기본 사전이다.
//
// 판이 끝나면 **별도 결과 화면**이고(세션 완료와 같은 틀), 거기서 「나온 말 보기」로 들어가면
// 이어진 말을 다시보기와 같은 카드로 넘겨 본다 (2026-10-06 사용자 지시).
import { useEffect, useRef, useState } from 'react'
import { replay } from '../core/replay.ts'
import { rubyOf } from '../core/ruby.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadExamples, loadKanji } from '../dict/load.ts'
import { KanaInput } from '../study/KanaInput.tsx'
import { appendStar } from './star.ts'
import { WordCards, type WordCard } from './WordCards.tsx'
import { recordGame, type GameResult } from './shiritoriRecord.ts'
import {
  buildIndex,
  hintWords,
  judge,
  pickReply,
  startWord,
  tailKanji,
  type Index,
  type Word,
} from './shiritori.ts'

interface Link {
  word: Word
  by: 'me' | 'app'
}

type Over = { reason: 'win' } | { reason: 'giveup'; examples: Word[] }

const HINT_COUNT = 2

export function Shiritori({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState<Index | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chain, setChain] = useState<Link[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [hint, setHint] = useState<Word[] | null>(null)
  const [over, setOver] = useState<Over | null>(null)
  /** 판이 바뀔 때마다 올려 입력 값을 비운다 */
  const [round, setRound] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)
  /** 이번 판을 기록했나 — 끝난 판과 나가는 판이 겹쳐도 한 번만 센다 */
  const recorded = useRef(false)
  const [result, setResult] = useState<GameResult | null>(null)
  /** 나온 말 카드를 열었나 (2026-10-06). 결과 화면 위가 아니라 결과 화면 대신 뜬다 */
  const [deck, setDeck] = useState(false)
  /**
   * id → 한국어 뜻. 사전을 읽을 때 같이 챙겨 둔다 — 카드를 열 때 사전을 다시 읽지 않는다.
   * 놀이 중에는 안 쓰여서 상태가 아니라 ref 다 (렌더를 부를 이유가 없다)
   */
  const meanings = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let alive = true
    loadBaseIdioms()
      .then((all) => {
        if (!alive) return
        const idx = buildIndex(
          all.map((r) => ({
            id: r.idiomId,
            headword: r.headword,
            reading: r.reading,
            altReadings: r.altReadings,
            band: r.band,
          })),
        )
        meanings.current = new Map(
          all.map((r) => [r.idiomId, r.koMeaning?.definition?.trim() ?? '']),
        )
        setIndex(idx)
        setChain([{ word: startWord(idx), by: 'app' }])
      })
      .catch(() => alive && setError('사전을 불러오지 못했어요.'))
    return () => {
      alive = false
    }
  }, [])

  // 새 말이 붙으면 맨 아래로
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chain])

  const used = new Set(chain.map((l) => l.word.headword))
  const last = chain[chain.length - 1]?.word
  const need = last ? tailKanji(last.headword) : ''
  const mine = chain.filter((l) => l.by === 'me').length

  /** 한 판을 끝낸다 — 기록은 판당 한 번이다 */
  const finish = (count: number) => {
    if (recorded.current) return
    recorded.current = true
    setResult(recordGame(count))
  }

  const leave = () => {
    if (!over) finish(mine)
    onExit()
  }

  const submit = (value: string) => {
    if (!index || !last || over) return
    const v = judge(index, need, value, used)
    if (v.kind === 'none') {
      setMessage(`「${need}」로 시작하는 말 중에 그 읽기가 없어요.`)
      return
    }
    if (v.kind === 'used') {
      setMessage('이미 나온 말이에요.')
      return
    }
    const next: Link[] = [...chain, { word: v.word, by: 'me' }]
    const taken = new Set(next.map((l) => l.word.headword))
    const reply = pickReply(index, v.word, taken)
    if (reply) next.push({ word: reply, by: 'app' })
    setChain(next)
    setMessage(null)
    setHint(null)
    setRound((r) => r + 1)
    if (!reply) {
      setOver({ reason: 'win' })
      finish(next.filter((l) => l.by === 'me').length)
    }
  }

  const giveUp = () => {
    if (!index) return
    setOver({ reason: 'giveup', examples: hintWords(index, need, used, 3) })
    finish(mine)
  }

  const again = () => {
    if (!index) return
    setChain([{ word: startWord(index), by: 'app' }])
    setMessage(null)
    setHint(null)
    setOver(null)
    setDeck(false)
    recorded.current = false
    setResult(null)
    setRound((r) => r + 1)
  }

  if (error) {
    return (
      <div className="diag">
        <main className="study-main">
          <p>{error}</p>
          <button type="button" className="btn" onClick={onExit}>
            나가기
          </button>
        </main>
      </div>
    )
  }

  // 판이 끝나면 놀이 화면을 접고 결과(또는 나온 말 카드)를 낸다 — 「세션 완료처럼」 (사용자 지시)
  if (over !== null) {
    if (deck) {
      return (
        <ShiritoriDeck
          chain={chain}
          meaningOf={(id) => meanings.current.get(id) ?? ''}
          onClose={() => setDeck(false)}
        />
      )
    }
    return (
      <div className="diag shiritori">
        <div className="centered summary-screen shiritori-over" role="status">
          <h2>끝말잇기 완료</h2>
          <div className="summary-hero">
            <p className="summary-num">{mine}</p>
            <p className="shiritori-why">
              {over.reason === 'win' ? '개를 이었어요. 앱이 더 이을 말이 없어요' : '개를 이었어요'}
            </p>
          </div>
          {over.reason === 'giveup' && over.examples.length > 0 && (
            <p className="shiritori-examples">
              이런 말이 있어요{' '}
              {over.examples.map((w, i) => (
                <span key={w.id} lang="ja">
                  {i > 0 && ' · '}
                  {w.headword}({w.reading})
                </span>
              ))}
            </p>
          )}
          {result && result.best > 0 && (
            <p className="shiritori-record">
              {result.isNewBest ? '새 기록이에요! ' : ''}최고 {result.best}개 · {result.plays}판
            </p>
          )}
          <button type="button" className="btn-primary" onClick={() => setDeck(true)}>
            나온 말 {chain.length}개 보기
          </button>
          <div className="shiritori-actions">
            <button type="button" className="btn" onClick={again}>
              다시 하기
            </button>
            <button type="button" className="btn" onClick={leave}>
              나가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="diag shiritori">
      <header className="study-bar">
        <button type="button" className="link" onClick={leave} aria-label="끝말잇기 나가기">
          ✕
        </button>
        <span className="shiritori-title">한자 끝말잇기</span>
        <span className="count">{mine}개</span>
      </header>

      <main className="study-main">
        <ol className="chain" ref={listRef} aria-label="이어진 말">
          {chain.map((l, i) => (
            <li key={`${i}-${l.word.id}`} className={`chain-item ${l.by}`}>
              <span className="chain-word" lang="ja">
                {l.word.headword}
              </span>
              <span className="chain-reading" lang="ja">
                {l.word.reading}
              </span>
            </li>
          ))}
        </ol>

        <div className="shiritori-ask">
          <p className="shiritori-need">
            <span className="need-kanji" lang="ja">
              {need}
            </span>
            <span className="need-note">로 시작하는 말의 읽기</span>
          </p>
          {message && (
            <p className="shiritori-msg" role="status">
              {message}
            </p>
          )}
          {hint && (
            <p className="shiritori-hint" lang="ja">
              {hint.length > 0 ? hint.map((w) => w.headword).join(' · ') : '더 보여 줄 말이 없어요'}
            </p>
          )}
          <div className="shiritori-actions">
            <button
              type="button"
              className="btn"
              onClick={() => index && setHint(hintWords(index, need, used, HINT_COUNT))}
            >
              힌트
            </button>
            <button type="button" className="btn" onClick={giveUp}>
              그만하기
            </button>
          </div>
          <KanaInput resetKey={round} onSubmit={submit} />
        </div>
      </main>
    </div>
  )
}

/**
 * 나온 말 카드 — 이어진 순서 그대로, 뜻과 예문을 붙여 넘겨 본다 (2026-10-06 사용자 지시).
 *
 * 카드 셸은 다시보기(`BrowseSlide`)를 쓰는 `WordCards` 그대로다 — 가림막을 새로 짜면
 * 2026-09-21 의 WebKit 문제를 다시 만난다. 예문·요미가나는 **여기서** 받는다. 놀이에
 * 들어올 때 예문(1.4MB)까지 미리 받을 이유가 없다.
 */
function ShiritoriDeck({
  chain,
  meaningOf,
  onClose,
}: {
  chain: readonly Link[]
  meaningOf: (id: string) => string
  onClose: () => void
}) {
  const [cards, setCards] = useState<WordCard[] | null>(null)
  const [error, setError] = useState(false)
  /** 이미 단어장에 있는 말 — 담긴 것을 또 담으라고 하지 않는다 */
  const [starred, setStarred] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let alive = true
    void Promise.all([loadExamples(), loadKanji(), listEvents(db(), LOCAL_USER_ID)])
      .then(([examples, kanji, events]) => {
        if (!alive) return
        const lookup = (k: string) => {
          const r = kanji.get(k)
          return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
        }
        setCards(
          chain.map((l, i) => ({
            item: {
              id: l.word.id,
              headword: l.word.headword,
              reading: l.word.reading,
              meaning: meaningOf(l.word.id),
              wrong: 0,
              sentences: examples.get(l.word.id) ?? [],
              ruby: rubyOf(l.word.headword, l.word.reading, lookup),
              rule: null,
            },
            tag: l.by === 'me' ? '내가 이은 말' : '앱이 낸 말',
            note: `${i + 1}번째`,
          })),
        )
        setStarred(replay(events).starred)
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [chain, meaningOf])

  /** 지금 장을 담거나 뺀다 — 화면은 기다리지 않는다 (다시보기와 같은 규칙) */
  const toggleStar = (id: string) => {
    const on = !starred.has(id)
    setStarred((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    void appendStar(id, on)
  }

  if (error) {
    return (
      <div className="diag">
        <div className="centered">
          <p>말을 불러오지 못했어요.</p>
          <button type="button" className="btn-primary" onClick={onClose}>
            돌아가기
          </button>
        </div>
      </div>
    )
  }
  if (cards === null) {
    return (
      <div className="diag">
        <div className="centered">불러오고 있어요…</div>
      </div>
    )
  }
  return (
    <div className="diag shiritori-cards">
      <WordCards
        cards={cards}
        star={{ has: (id) => starred.has(id), toggle: toggleStar }}
        onClose={onClose}
      />
    </div>
  )
}
