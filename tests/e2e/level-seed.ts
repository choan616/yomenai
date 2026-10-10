// e2e 시드 — 수준 판정(채점 100회·서로 다른 표현 60개)을 넘기는 기록을 실제 사전 숙어로 만든다 (2026-10-10)
//
// 판정이 「최근 7일(모자라면 100회)」·오차 구간으로 바뀌면서(`level.ts`) 몇 개 심는 것으로는 안정·흔들림이
// 안 선다. 코스의 음독 숙어를 사전에서 뽑아 서로 다른 표현으로 채점 기록을 쌓는다.
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

interface DictRow {
  id: string
  band: number
  readingKind: string
}
const BASE = (JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: DictRow[] }).idioms

/** 코스 `band` 의 음독 숙어 id `n`개 (`skip` 에 든 것은 뺀다) */
export function idsOf(band: number, n: number, skip: readonly string[] = []): string[] {
  const out = BASE.filter((r) => r.band === band && r.readingKind === 'on' && !skip.includes(r.id))
    .slice(0, n)
    .map((r) => r.id)
  if (out.length < n) throw new Error(`코스 ${band} 의 음독 숙어가 ${n}개에 못 미친다`)
  return out
}

export interface Grading {
  idiomId: string
  daysAgo: number
  ok: boolean
  /** 오답이면 앱이 채점 때 적어 두는 유형. 소견이 이것을 다시 분류해 센다 */
  mistakeType?: string | null
  answer?: string
  expected?: string
}

/** 코스 `band` 의 서로 다른 표현 `n`개를 한 번씩 채점한다 — 앞의 `correct` 개가 정답, 나머지는 오답 */
export function gradings(
  band: number,
  n: number,
  correct: number,
  daysAgo: number,
  opts: { skip?: readonly string[] } = {},
): Grading[] {
  return idsOf(band, n, opts.skip).map((idiomId, i) => ({
    idiomId,
    daysAgo,
    ok: i < correct,
    mistakeType: i < correct ? null : 'ONYOMI_CHOICE',
    answer: i < correct ? 'x' : 'ぬぬぬ',
    expected: 'x',
  }))
}

/** IndexedDB 의 events 에 채점 기록을 넣는다. `prefix` 는 이벤트 id 가 안 겹치게 하는 접두사다 */
export async function putGradings(page: Page, rows: Grading[], prefix: string): Promise<void> {
  await page.evaluate(
    ([rows, prefix, day]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          rows.forEach((r, i) =>
            store.put({
              id: `${prefix}-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - r.daysAgo * day + i,
              idiomId: r.idiomId,
              cardType: 'reading',
              mistakeType: r.mistakeType ?? null,
              deletedAt: null,
              type: 'review',
              grade: r.ok ? 3 : 1,
              answer: r.answer ?? (r.ok ? 'x' : 'ぬぬぬ'),
              expected: r.expected ?? 'x',
              correct: r.ok,
              elapsedMs: 4000,
            }),
          )
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [rows, prefix, 86_400_000] as const,
  )
}
