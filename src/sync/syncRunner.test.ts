// 동기화 러너 — 화면과 무관한 실행, 중복 시작 방지, 숨은 사이 끊긴 실행의 한 번 이어 하기를 검증한다
import { describe, expect, it } from 'vitest'
import { createSyncRunner, INTERRUPTED_MESSAGE, type SyncRunnerDeps } from './syncRunner.ts'
import type { SyncResult } from './sync.ts'

const RESULT: SyncResult = { uploaded: 3, downloaded: 0, restored: 0, folded: 0, backupTotal: 7 }

/** 호출마다 대기 중인 약속을 만들어 테스트가 직접 끝낸다 */
function harness(opts: { authed?: boolean } = {}) {
  const calls: Array<{ resolve: (r: SyncResult) => void; reject: (e: Error) => void; progress: (p: never) => void }> = []
  const saved: number[] = []
  let authed = opts.authed ?? true
  const deps: SyncRunnerDeps = {
    run: (onProgress) =>
      new Promise<SyncResult>((resolve, reject) => {
        calls.push({ resolve, reject, progress: onProgress as (p: never) => void })
      }),
    isAuthenticated: () => authed,
    now: () => 1000 + calls.length,
    saveLastSyncAt: (at) => saved.push(at),
    initialLastSyncAt: null,
  }
  return { runner: createSyncRunner(deps), calls, saved, setAuthed: (a: boolean) => (authed = a) }
}

describe('syncRunner', () => {
  it('실행 중에 다시 시작해도 한 번만 돈다', async () => {
    const { runner, calls } = harness()
    const a = runner.start()
    const b = runner.start()
    expect(calls).toHaveLength(1)
    expect(a).toBe(b)
    calls[0].resolve(RESULT)
    await a
  })

  it('구독자가 없어도 끝까지 가서 시작 시각을 기록한다', async () => {
    const { runner, calls, saved } = harness()
    const done = runner.start()
    calls[0].resolve({ ...RESULT, restored: 2 })
    await done
    const s = runner.getState()
    expect(s.running).toBe(false)
    expect(saved).toEqual([1000]) // 끝 시각이 아니라 시작 시각
    expect(s.lastSyncAt).toBe(1000)
    expect(s.message).toContain('2건')
  })

  it('숨은 사이 실패하면 끊김으로 표시하고, 돌아오면 한 번 이어 한다', async () => {
    const { runner, calls } = harness()
    const first = runner.start()
    runner.noteHidden()
    calls[0].reject(new Error('Load failed'))
    await first
    expect(runner.getState().error).toBe(INTERRUPTED_MESSAGE)

    runner.resumeIfInterrupted()
    expect(calls).toHaveLength(2)
    expect(runner.getState().error).toBeNull()
    expect(runner.getState().running).toBe(true)
    calls[1].resolve(RESULT)
    await Promise.resolve()
    await Promise.resolve()
    runner.resumeIfInterrupted() // 이어 한 뒤 또 부르면 더 돌지 않는다
    expect(calls).toHaveLength(2)
  })

  it('토큰이 없으면 돌아와도 이어 하지 않는다 (구글 창을 띄우지 않는다)', async () => {
    const { runner, calls, setAuthed } = harness()
    const first = runner.start()
    runner.noteHidden()
    calls[0].reject(new Error('Load failed'))
    await first
    setAuthed(false)
    runner.resumeIfInterrupted()
    expect(calls).toHaveLength(1)
    expect(runner.getState().error).toBe(INTERRUPTED_MESSAGE)
  })

  it('숨지 않은 채 실패하면 이어 하지 않고 원래 오류를 보인다', async () => {
    const { runner, calls } = harness()
    const first = runner.start()
    calls[0].reject(new Error('권한 없음'))
    await first
    runner.resumeIfInterrupted()
    expect(calls).toHaveLength(1)
    expect(runner.getState().error).toBe('권한 없음')
  })

  it('실행 중이 아닐 때 숨어도 다음 실행의 끊김으로 세지 않는다', async () => {
    const { runner, calls } = harness()
    runner.noteHidden()
    const first = runner.start()
    calls[0].reject(new Error('권한 없음'))
    await first
    expect(runner.getState().error).toBe('권한 없음')
  })
})
