// Jev(TypeSafe System One) HTTP 계약 확인용 프로브 (2026-09-22).
// 문서에 raw 요청·응답 예시가 없어서 **추측 대신 한 번 쏴 보고** 인증 헤더와 응답 모양을 고정한다.
// 키는 .env 에만 둔다 — 값을 찍지 않는다.
if (!process.env.TYPESAFE_API_KEY) process.loadEnvFile()
const KEY = process.env.TYPESAFE_API_KEY
if (!KEY) throw new Error('.env 에 TYPESAFE_API_KEY 가 없다')

const URL = 'https://api.typesafe.ai/v1/systemone'
const body = {
  model: 'jev-latest',
  state: [
    '일본어 한자 숙어: 引導 (いんどう)',
    '영어 뜻: last words recited to the newly departed; requiem',
    '한국어 뜻 한 줄: 이끌어 지도함.',
  ].join('\n'),
  questions: {
    ok: {
      type: 'noul',
      instructions:
        '이 한국어 한 줄이 위 영어 뜻을 맞게 옮겼는가? 뜻이 통하면 참, 뜻이 틀렸거나 지어냈으면 거짓.',
    },
  },
}

/** 인증 헤더 방식이 문서에 없다 — 흔한 둘을 차례로 시도해 되는 쪽을 보고한다 */
/** 인증은 Bearer 로 확정됐다 (x-api-key 는 403, Bearer 는 본문 검증까지 갔다 — 2026-09-22 프로브) */
const SCHEMES: { name: string; headers: Record<string, string> }[] = [
  { name: 'Authorization: Bearer', headers: { Authorization: `Bearer ${KEY}` } },
]

for (const s of SCHEMES) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...s.headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`\n== ${s.name} → HTTP ${res.status} ==`)
  console.log(text.slice(0, 1200))
  if (res.ok) {
    console.log('\n이 방식으로 확정한다:', s.name)
    break
  }
}
