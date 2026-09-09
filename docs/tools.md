<!-- 터미널 명령어 레퍼런스. 파이프라인 단계별 정리 + 자주 쓰는 절차 -->
# 명령어

`npm run <name>`. 사전 원본은 `data/raw/`, 산출물은 `data/dict/`(대부분 gitignore),
배포본은 `public/dict/`(커밋). 자세한 배경은 `PLAN.md` §3, `context-notes.md`.

## 개발 · 검증

| 명령 | 하는 일 |
|---|---|
| `dev` | Vite 개발 서버 (`http://localhost:5173`) |
| `build` | `tsc -b && vite build` — 배포 산출물 `dist/` |
| `preview` | 빌드본 로컬 서빙 (서비스 워커·오프라인 확인용) |
| `test` / `test:watch` | Vitest |
| `lint` | oxlint |
| `e2e` | Playwright (설치된 Chrome 채널) |

## 데이터 파이프라인

원본 다운로드가 `data/raw/`에 먼저 있어야 한다.

```
import:kanjidic        KANJIDIC2 → data/dict/kanji.json
import:jmdict          JMdict_e.gz → data/dict/idioms.json
build:bands            nf 빈도 → 밴드 0~4 → data/dict/bands.json
build:decomp-overrides JmdictFurigana 대조 → 熟字訓 거부 목록 (data/raw/JmdictFurigana.json 필요)
build:onyomi           숙어 → (한자, 음독) 분해 → data/dict/onyomi-map.json
build:examples         Tatoeba → 무번역 예문 (data/raw/tatoeba/ 필요)
build:fonts            data/raw/fonts/ → public/fonts/ 서브셋 (Regular·Bold)
build:runtime-dict     위 산출물 → public/dict/{base,band4,pairs,kanji,examples}.json
```

일회성 실측(산출물 안 남김): `measure:tatoeba`, `measure:furigana`.

## 한국어 뜻 — 검수 절차

`koMeaning`은 JMdict 영어 gloss 를 gemma4 로 옮긴 것. 전부 `verified: false` 로 시작하고,
사람이 검수한 것만 `true` 가 된다. 배경은 `context-notes.md` 2026-09-07~08.

### 1. 검수 목록 만들기

```
npm run build:korean-meaning-worklist -- --sample=50   # 층(T1~T6)마다 50개, ~300행
npm run build:korean-meaning-worklist -- --flagged     # 깨진 번역 등 플래그 붙은 것 전량
npm run build:korean-meaning-worklist -- --all         # 우선순위 순 전체 (~13,000행)
npm run build:korean-meaning-worklist -- --batch --category=3         # category3을 배치파일로 추가 (40행씩)
```

→ `data/dict/korean-meaning-worklist.tsv` (또는 `-flagged.tsv`).
이미 채운 `verdict` 는 다시 만들어도 유지된다.

### 2. 검수 — 전용 화면 (권장)

```
npm run review          # → http://localhost:5178
```

한 건씩 카드로 보고 판정. 그 자리에서 TSV 에 UTF-8 로 저장.

- 단축키: `O` 맞음 · `E` 뜻 고치기(입력칸) · `K` 애매 · `S` 국어사전 정의 채택 · `X` 틀림·보류 · `←→` 이동
- 뜻이 틀리면 입력칸을 고치고 `맞음` — `apply` 가 "고쳐서 맞음(manual)"으로 처리
- 파일 선택(sample/flagged), 층 필터, 미검수만/전체, 분류(cat) 교정

TSV 를 직접 편집할 거면 **VS Code** 나 **LibreOffice Calc** 로. Excel 은 저장 시 EUC-KR 로
바꿔 한글을 깨뜨린다(도구가 EUC-KR·UTF-16 을 읽긴 하지만 "유니코드 텍스트"로 저장할 것).

`verdict` — `o` 맞음 / `x` 틀림(고친 뜻 필요) / `~` 애매 / `s` 국어사전 정의 채택 / `?` 미기입.
`cat` 칸에 `1`/`2`/`3` 을 넣으면 분류도 교정된다.

### 3. 반영

```
npm run apply:korean-review -- --trust-llm   # korean-class.json 재생성 (분류 + koMeaning 원본)
npm run apply:korean-meaning -- --validate    # 층별 "손댄 비율" 미리보기
npm run apply:korean-meaning                  # verdict → korean-class.json
npm run build:runtime-dict                    # → public/dict
```

그다음 `public/dict/` 변경분을 커밋·푸시하면 GitHub Actions 가 배포한다.

## 분류(category) 파이프라인 — Phase 3, 보통 다시 안 돌림

```
match:korean          한자별 한국 한자음 → stdict 조회 → korean-match.json / korean-review.tsv
draft:korean-review   Ollama 초벌 분류 → korean-llm-draft.tsv
build:review-worklist  수동 검수 큐 → korean-worklist*.tsv
apply:korean-review    사람 verdict + 초벌 → korean-class.json
```
