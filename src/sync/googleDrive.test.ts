// client_id 정규화 — .env·CI secret 에 URL 형태로 잘못 넣은 값을 맨몸 id 로 되돌린다
import { describe, expect, it } from 'vitest'
import { normalizeClientId } from './googleDrive.ts'

const BARE = '291869999860-abcdef.apps.googleusercontent.com'

describe('normalizeClientId', () => {
  it('맨몸 값은 그대로', () => {
    expect(normalizeClientId(BARE)).toBe(BARE)
  })

  it('https:// 접두어를 벗긴다', () => {
    expect(normalizeClientId(`https://${BARE}`)).toBe(BARE)
  })

  it('끝 슬래시를 벗긴다', () => {
    expect(normalizeClientId(`${BARE}/`)).toBe(BARE)
    expect(normalizeClientId(`https://${BARE}/`)).toBe(BARE)
  })

  it('앞뒤 공백을 다듬는다', () => {
    expect(normalizeClientId(`  ${BARE}\n`)).toBe(BARE)
  })

  it('빈 값·undefined 는 undefined', () => {
    expect(normalizeClientId(undefined)).toBeUndefined()
    expect(normalizeClientId('')).toBeUndefined()
    expect(normalizeClientId('   ')).toBeUndefined()
  })
})
