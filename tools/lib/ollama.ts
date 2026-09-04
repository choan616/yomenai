// 로컬 Ollama로 (일본어 숙어, 한국어 표제어) 관계를 동형동의(1)/동형이의(2)/무관(3)으로 판정하는 클라이언트
export interface JudgeInput {
  headword: string
  reading: string
  glossEn: string
  koWord: string
  koOrigin: string
  koDef: string
  /** stdict 原語 한자가 일본어 표제어와 같은 글자인가 (match-korean 이 계산해 둔 값) */
  originMatch: boolean
}
export interface JudgeResult {
  verdict: 1 | 2 | 3
  reason: string
}

const HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

function buildPrompt(x: JudgeInput): string {
  const common = [
    `일본어 한자 숙어: ${x.headword} (${x.reading}) — 영어 뜻: ${x.glossEn}`,
    `한국 표준국어대사전 표제어: ${x.koWord} — 원어 한자: ${x.koOrigin || '(없음)'} — 뜻: ${x.koDef}`,
    '',
  ]
  const rule = 'reason 은 반드시 고른 verdict 와 일치하는 근거여야 한다.'
  if (x.originMatch) {
    // 한자가 확실히 일치. 3은 사실상 없음 — 1 vs 2만 가른다
    return [
      '아래 두 항목은 한자 표기가 서로 같다(신자체/정자 차이만 있을 수 있음).',
      ...common,
      '두 뜻이 실질적으로 같은가?',
      '- verdict 1 (동형동의): 뜻이 실질적으로 같다. 한국 한자음 지식이 일본어 뜻 이해에 그대로 통한다.',
      '- verdict 2 (동형이의): 한자는 같은데 핵심 뜻이나 주된 쓰임이 갈린다. 예: 工夫(궁리↔공부), 汽車(증기기관차↔열차 일반), 大丈夫(괜찮다↔대장부), 放心(넋 놓음↔방심), 愛人(불륜상대↔연인).',
      rule,
      '아래 JSON만 출력한다: {"verdict": 1 또는 2, "reason": "한 줄 근거(한국어)"}',
    ].join('\n')
  }
  return [
    '아래 일본어 숙어를 한국 한자음으로 읽어 사전을 찾았더니 이 표제어가 나왔는데, 원어 한자가 일본어 표기와 달라 보인다.',
    ...common,
    '이 한국어 표제어는 일본어 숙어와 어떤 관계인가?',
    '- verdict 3 (무관): 서로 다른 단어인데 한국 한자음만 우연히 겹친다. 예: 手紙(편지)↔收支(수입지출).',
    '- verdict 1 또는 2: 사실은 같은 단어이고 한자 자형(신자체↔정자, 부수 단순화) 차이일 뿐이다. 그 경우 뜻이 같으면 1, 갈리면 2.',
    rule,
    '아래 JSON만 출력한다: {"verdict": 1 또는 2 또는 3, "reason": "한 줄 근거(한국어)"}',
  ].join('\n')
}

/** Ollama /api/generate 호출. think 끄고 JSON 강제. 파싱 실패 시 2회 재시도 후 예외 */
export async function judge(model: string, x: JudgeInput): Promise<JudgeResult> {
  const prompt = buildPrompt(x)
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${HOST}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0 },
        }),
      })
      if (!res.ok) {
        lastErr = new Error(`Ollama HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as { response?: string }
      const parsed = JSON.parse(data.response ?? '') as { verdict?: unknown; reason?: unknown }
      const v = Number(parsed.verdict)
      if (v === 1 || v === 2 || v === 3) {
        return { verdict: v as 1 | 2 | 3, reason: String(parsed.reason ?? '').replace(/\s+/g, ' ').trim() }
      }
      lastErr = new Error(`verdict 값이 이상함: ${JSON.stringify(parsed.verdict)}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    `Ollama 판정 실패 (${x.headword}, ${model}): ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  )
}
