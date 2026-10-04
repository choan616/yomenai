// 한자 끝말잇기 화면 — 앞 말의 끝 한자로 시작하는 말의 읽기를 쳐서 잇는다 (2026-10-04, context-notes 같은 날 절)
//
// 학습 기록은 남기지 않는다(놀이 결과가 밴드 사다리·복습 주기에 섞이지 않게). 쓰는 말은 기본 사전이다.
import { useEffect, useRef, useState } from 'react'
import { loadBaseIdioms } from '../dict/load.ts'
import { KanaInput } from '../study/KanaInput.tsx'
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

        {over ? (
          <div className="shiritori-over" role="status">
            {over.reason === 'win' ? (
              <p>이을 말이 없어요. {mine}개를 이었어요.</p>
            ) : (
              <>
                <p>{mine}개를 이었어요.</p>
                {over.examples.length > 0 && (
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
              </>
            )}
            {result && result.best > 0 && (
              <p className="shiritori-record">
                {result.isNewBest ? '새 기록이에요! ' : ''}최고 {result.best}개 · {result.plays}판
              </p>
            )}
            <div className="shiritori-actions">
              <button type="button" className="btn" onClick={again}>
                다시 하기
              </button>
              <button type="button" className="btn" onClick={leave}>
                나가기
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </main>
    </div>
  )
}
