// 검수 TSV 를 인코딩 무관하게 읽는다. Excel "유니코드 텍스트" 저장(UTF-16LE)·CSV UTF-8(BOM)·
// 그냥 UTF-8 를 모두 받는다. 출력엔 UTF-8 BOM 을 붙여 Excel 이 더블클릭으로 열 때 UTF-8 로 인식하게 한다.
import { readFileSync, writeFileSync } from 'node:fs'

/** BOM 을 보고 UTF-8 / UTF-16LE / UTF-16BE 를 판별해 문자열로 디코드한다 */
export function readTextAuto(path: string): string {
  const buf = readFileSync(path)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le')
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE — 바이트 스왑 후 LE 로 읽는다
    const swapped = Buffer.allocUnsafe(buf.length - 2)
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1]
      swapped[i - 1] = buf[i]
    }
    return swapped.toString('utf16le')
  }
  // BOM 없음 — UTF-8 로 시도하고, 구조가 안 맞으면 EUC-KR/CP949 (Excel 이 ANSI 로 저장한 경우)
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
  } catch {
    return new TextDecoder('euc-kr').decode(buf)
  }
}

/** 인코딩 자동 판별 + 행/열 분해 (CRLF·LF 모두, 탭 구분). 빈 줄은 버린다 */
export function readTsv(path: string): string[][] {
  return readTextAuto(path)
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => l.split('\t'))
}

/** UTF-8 BOM 을 붙여 쓴다. Excel 더블클릭 시 UTF-8 로 열린다 */
export function writeTsvBom(path: string, text: string): void {
  writeFileSync(path, '﻿' + text)
}
