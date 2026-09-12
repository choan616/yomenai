// JMdict 영어 gloss 를 로컬 Ollama 로 간결한 한국어 뜻 한 줄로 옮긴다 (checklist 12-D 방향 변경).
// 모델은 30개 라벨링 표본 비교로 gemma4:latest 채택 (context-notes 2026-09-07).
export interface TranslateInput {
  headword: string
  reading: string
  glossEn: string[]
}

const HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

// 표본과 안 겹치는 예시 5개. "핵심 뜻 하나, 갈리면 2~3개" 규칙을 보인다.
const FEWSHOT = [
  '- 鉄道 (てつどう) / ["railroad","railway"] → {"ko": "철도"}',
  '- 大切 (たいせつ) / ["important","valuable","precious","careful"] → {"ko": "중요함, 소중함"}',
  '- 我慢 (がまん) / ["patience","endurance","perseverance","tolerance"] → {"ko": "참음, 인내"}',
  '- 石鹸 (せっけん) / ["soap"] → {"ko": "비누"}',
  '- 二日 (ふつか) / ["2nd day of the month","two days"] → {"ko": "이틀, 2일"}',
]

function buildPrompt(x: TranslateInput): string {
  return [
    '다음 일본어 한자어의 뜻을 한국어로 옮긴다. 아래 영어 뜻풀이가 원본이다.',
    '',
    '규칙:',
    '- 학습 카드에 뜨는 사전 뜻풀이다. 한 줄, 간결하게.',
    '- 핵심 뜻 하나. 뜻이 정말 갈리면 ", " 로 최대 2~3개.',
    '- 영어 동의어 나열을 그대로 옮기지 말 것. 영어를 남기지 말 것.',
    '- 물질명·전문용어·고유명사는 한국 표준 표기를 쓴다.',
    '- 괄호 보충은 꼭 필요할 때만 짧게.',
    '',
    '예시:',
    ...FEWSHOT,
    '',
    '이제 옮긴다.',
    `단어: ${x.headword} (${x.reading})`,
    `영어 뜻: ${JSON.stringify(x.glossEn)}`,
    '아래 JSON만 출력: {"ko": "한국어 뜻"}',
  ].join('\n')
}

/** Ollama /api/generate. think 끄고 JSON 강제. 파싱 실패 시 2회 재시도 후 예외 */
export async function translateGloss(model: string, x: TranslateInput): Promise<string> {
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
      const parsed = JSON.parse(data.response ?? '') as { ko?: unknown }
      const ko = String(parsed.ko ?? '').replace(/\s+/g, ' ').trim()
      if (ko) return ko
      lastErr = new Error(`ko 값이 비었다: ${JSON.stringify(parsed)}`)
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    `번역 실패 (${x.headword}, ${model}): ${lastErr instanceof Error ? lastErr.message : lastErr}`,
  )
}

/** 눈에 띄는 품질 이상을 태그로. 워크리스트가 이걸 앞으로 보낸다 */
export function qualityFlags(ko: string, glossEn: string[]): string[] {
  const f: string[] = []
  if (!ko) f.push('empty')
  if (/[A-Za-z]/.test(ko)) f.push('latin')
  if (/[Ѐ-ӿ]/.test(ko)) f.push('cyrillic')
  if (/[㐀-鿿豈-﫿]/.test(ko)) f.push('kanji')
  if (/[぀-ヿ]/.test(ko)) f.push('kana')
  if ([...ko].length > 40) f.push('long')
  if (ko.split(/[;,·]/).filter((s) => s.trim()).length > 3) f.push('many-senses')
  if (glossEn.some((g) => g.toLowerCase() === ko.toLowerCase())) f.push('untranslated')
  return f
}
