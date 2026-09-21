// 캐시 무효화 키 — 쓰기마다 오르고 읽기로는 안 오른다
import { describe, expect, it } from 'vitest'
import { bumpDataVersion, dataVersion } from './dataVersion.ts'

describe('dataVersion', () => {
  it('읽기만으로는 안 오른다', () => {
    const v = dataVersion()
    expect(dataVersion()).toBe(v)
  })

  it('bump 할 때마다 오른다', () => {
    const v = dataVersion()
    bumpDataVersion()
    expect(dataVersion()).toBe(v + 1)
    bumpDataVersion()
    expect(dataVersion()).toBe(v + 2)
  })
})
