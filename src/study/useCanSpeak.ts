// 읽기 소리 버튼을 낼지 — 지금 고른 음성으로 그 읽기를 들려줄 수 있을 때만 true (2026-10-04, tts.ts 의 canSpeak)
import { useEffect, useState } from 'react'
import { tts } from './tts.ts'

export function useCanSpeak(text: string): boolean {
  const now = tts.canSpeak(text)
  // 비동기로 답이 오는 동안(목록을 처음 읽는 중)은 숨긴다 — 소리 안 나는 버튼이 잠깐 보이는 것보다 낫다
  const [late, setLate] = useState<{ text: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (typeof now === 'boolean') return
    let alive = true
    void now.then((ok) => alive && setLate({ text, ok }))
    return () => {
      alive = false
    }
    // `now` 는 렌더마다 새 Promise 라서 의존성에 못 둔다 — 읽기가 바뀔 때만 다시 묻는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  if (typeof now === 'boolean') return now
  return late !== null && late.text === text ? late.ok : false
}
