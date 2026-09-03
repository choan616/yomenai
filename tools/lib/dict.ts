// 빌드 스크립트 공용 유틸 — 경로, 한자 판별, 사전 DB 레코드 타입
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

export const RAW_DIR = join(import.meta.dirname, '..', '..', 'data', 'raw')
export const DICT_DIR = join(import.meta.dirname, '..', '..', 'data', 'dict')

// data/raw 안에서 접두사로 원본 파일을 찾는다 (버전 문자열 변동 대응)
export function findRawFile(prefix: string, ext: string): string {
  const hit = readdirSync(RAW_DIR).find((f) => f.startsWith(prefix) && f.endsWith(ext))
  if (!hit) throw new Error(`${RAW_DIR} 에서 ${prefix}*${ext} 를 찾지 못했다. 다운로드 먼저.`)
  return join(RAW_DIR, hit)
}

// CJK 통합 한자(U+4E00-9FFF) + 확장 A(U+3400-4DBF) + 호환 한자(U+F900-FAFF) + 반복 기호(U+3005 々)
const KANJI_ONLY = /^[々㐀-䶿一-鿿豈-﫿]+$/u
export function isKanjiOnly(s: string): boolean {
  return KANJI_ONLY.test(s)
}

// 숙어 1개의 구성 한자 배열 (U+3005 々 는 실제 한자가 아니므로 제외)
export function componentKanji(headword: string): string[] {
  return [...headword].filter((c) => c !== '々')
}

// 사전 DB에 저장할 숙어 레코드
export interface IdiomRecord {
  id: string // JMdict ent_seq
  headword: string // 한자 표기 (표제어)
  reading: string // 히라가나 읽기
  pos: string[] // 품사 코드 (n, adj-no, vs, ...)
  priority: string[] // ke_pri + re_pri 합집합 (nf01~nf48, news1/2, ichi1/2, spec1/2, gai1/2)
  common: boolean // 우선순위 태그가 하나라도 있으면 true
  glossEn: string[] // 영어 뜻 (DB 보관, 화면 비표시)
  length: number // 구성 한자 수
}
