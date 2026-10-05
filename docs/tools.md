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
build:examples         Tatoeba → 무번역 예문 (data/raw/tatoeba/ 필요, 아래 「예문」 절)
build:extra-readings   JMdict_e.gz → 임포트가 떨어뜨린 읽기 → data/dict/extra-readings.json (아래 「다른 읽기」 절)
build:fonts            data/raw/fonts/ → public/fonts/ 서브셋 (Regular·Bold)
build:audio            기본 사전 읽기 → 로컬 VOICEVOX 합성 → data/audio/<voice>/*.mp3 (엔진·ffmpeg 필요, 커밋 안 함. --speaker --voice [--limit])
build:runtime-dict     위 산출물 → public/dict/{base,band4,pairs,kanji,examples}.json
```

일회성 실측(산출물 안 남김): `measure:tatoeba`, `measure:furigana`.

## 다른 읽기 — 읽기 둘 항목 (2026-10-02)

`import:jmdict` 는 JMdict 한 항목에서 읽기를 **하나만** 고른다. 逆手 의 `ぎゃくて`(foul trick) 같은 둘째 읽기가
사전에 없어서, 그 읽기로 답하면 일본어로는 맞는데 오답이 됐다. 임포트를 다시 돌리면 밴드·한국어 분류·음독 분해가
전부 그 id 를 키로 쌓여 있어 파이프라인 전체가 흔들리므로, **빠진 읽기만 따로 뽑아 `build:runtime-dict` 에서 얹는다.**

```
npm run build:extra-readings      # JMdict_e.gz → data/dict/extra-readings.json (원본에서 재생성, 추적 안 함)
npm run build:runtime-dict        # 위 파일이 있으면 형제 항목과 altReadings 를 얹는다. 없으면 건너뛴다
```

| 갈래 | 기준 | 하는 일 |
|---|---|---|
| plain | 뜻이 같은 읽기 | 채점만 받는다 (`altReadings`) |
| split | 그 읽기 **자신에게 걸린 뜻**(`stagr`)이 있는 읽기 | 별도 항목(형제)으로 올린다 |

- 형제 id 는 `{JMdict id}-{romaji}` (예 `1693370-gyakute`). 학습 기록이 이 id 를 영구히 참조하므로 **한 번 정하면 못 바꾼다.**
- **밴드는 그 읽기 자신의 `re_pri` 로만** 정한다. 표기의 `nf` 를 합치면 모든 읽기가 그 순위를 공짜로 물려받는다.
  없으면 밴드 4(선택 범위)다.
- 뺀다: 읽기 표시(`re_inf`)가 붙은 읽기, 가타카나 읽기, 한자 없는 읽기, 다른 표기 전용 읽기, ぢ/づ 만 다른 읽기,
  그리고 전용 뜻이 전부 고어·폐어(`arch`·`obs`)인 읽기(→ 채점만).
- 분해(`decompose`)가 안 되는 읽기는 항목이 못 되고 채점만으로 내려간다.
- **한국어 뜻은 사람이 쓴 `data/dict/korean-meaning-sibling-overrides.json`**(추적함, 재생성 불가)이 온다.
  전부 초안(`llm`, `verified: false`)이라 앱 뜻 검수를 거친다.
- JMdict 를 갱신해 새 형제가 생기면 뜻이 없는 형제가 된다 — 산출물 불변조건 테스트(`src/dict/siblings.test.ts`)가
  막으니 위 overrides 파일에 뜻을 먼저 더한다.

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

### 2-b. 앱에서 검수한 것 반영 (원격)

로컬 화면 대신 앱의 **뜻 검수** 화면(설정 → 뜻 검수)에서 판정했을 때. 「판정 복사」나
「내보내기」로 받은 내용을 `data/dict/korean-meaning-app-review.tsv` 에 저장한 뒤:

```
npm run apply:app-review-full            # 5단계(워크리스트→반영→사전→사전 밖 판정)를 순서대로 잇는다
npm run apply:app-review-full -- --force # 이미 값이 찍힌 칸도 앱 값이 다르면 덮어쓴다
```

`tools/apply-app-review-full.ts` 가 `build:korean-meaning-worklist --batch` →
`apply:app-review` → `apply:korean-meaning` → `build:runtime-dict` 를 순서 고정으로 돈다.
**한 단계라도 실패하면 그 자리에서 멈춘다** — 뒤 단계로 안 넘어간다.

**사전 밖(넓힌 사전) 표현의 판정은 5단계가 따로 맡는다** (2026-10-01). 그 표현은 `korean-class.json`
에 없어서(거기 넣으면 15,114개가 학습 사전의 분류·밴드에 섞인다) 1~4단계는 그 id 를 「작업 파일에
없는 판정」으로 흘려보낸다. 5단계 `apply-wide-review.ts` 가 내보내기에서 넓힌 사전 id 만 골라
`data/dict/korean-meaning-wide-overrides.json` 에 쌓고(o → 초안 그대로 검증, x+고친 뜻 → `manual`),
그 파일이 **바뀌었을 때만** `build:wide-dict` 로 `public/dict/wide.json` 을 다시 만든다(원본
JMdict 가 필요해서). 이미 기록된 항목은 안 덮고 `--force` 면 값이 다른 것만 덮는다. `--dry` 로
집계만 볼 수 있다. 덮어쓰기 파일은 `*-overrides.json` 이라 `.gitignore` 예외로 커밋된다.

네 단계를 나눠 돌리고 싶으면(각 단계 출력을 하나씩 보며 확인하고 싶을 때):

```
npm run build:korean-meaning-worklist -- --batch   # 새로 담거나 판정한 id 에 워크리스트 줄을 만든다
npm run apply:app-review                            # 그 줄의 verdict·fix 칸을 채운다
```

**순서가 고정이다.** `apply:app-review` 는 워크리스트 TSV 만 고치고 `korean-class.json` 은
안 건드린다 — 뒤이어 아래 「3. 반영」의 `apply:korean-meaning` 을 돌려야 사전에 닿는다.
`build:korean-meaning-worklist -- --batch` 를 앞에 안 두면 이번에 새로 담거나 판정한 id 는
워크리스트에 줄 자체가 없어 `apply:app-review` 가 「작업 파일에 없는 판정」으로 건너뛴다.

`--force` — 기본(옵션 없음)은 **이미 찍힌 칸을 안 건드린다**. 같은 표제어를 앱에서 다시
고쳐 또 내보낸 경우(오타를 고쳤다든가)는 그 칸이 이미 옛 값으로 채워져 있어 그냥 돌리면
무시된다 — `--force` 를 붙이면 이번 앱 값이 다른 칸만 덮어쓴다(같으면 그대로 둔다).
**취소(앱에서 판정을 되돌린 것)는 force 여도 안 건드린다** — 판정을 지우는 것은 최신
판정이 이기는 것과는 다른 행동이다. 자동화(`apply:app-review-full`)에도 기본으로 안 낀다
— 켜려면 매번 명시해야 한다.

### 3. 반영

```
npm run apply:korean-review -- --trust-llm   # korean-class.json 재생성 (분류 + koMeaning 원본)
npm run apply:korean-meaning -- --validate    # 층별 "손댄 비율" 미리보기
npm run apply:korean-meaning                  # verdict → korean-class.json
npm run build:runtime-dict                    # → public/dict
npm run build:fonts                           # 새 뜻에 새 한글이 있으면 폰트도 다시
```

`apply:korean-review -- --trust-llm` 은 **분류(korean-worklist*.tsv)를 건드렸을 때만** 필요하다.
뜻만 검수했으면 빼도 된다 — 이 줄은 `korean-class.json` 을 원본에서 다시 만들며 모든
`koMeaning.verified` 를 `false` 로 되돌린다. 바로 뒤 `apply:korean-meaning` 이 TSV 에서
복원하지만, 중간에 멈추면 여태 검수한 게 날아간다. `--validate` 는 통계만 찍고 쓰기 전에
빠지는 미리보기다.

**`build:fonts` 를 빼먹지 않는다.** 한국어 폰트는 **사전이 실제로 쓰는 한글만** 담은
서브셋이라(748KB → 96KB), 새 뜻에 없던 글자가 들어오면 그 글자만 시스템 폰트로 떨어져
한 줄 안에서 글꼴이 갈린다. 자세한 건 아래 「폰트」 절.

그다음 `public/dict/`(과 폰트가 바뀌었으면 `public/fonts/`) 변경분을 커밋·푸시하면
GitHub Actions 가 배포한다.

## 폰트

```
npm run build:fonts    # data/raw/fonts/ → public/fonts/
```

원본 넷(`NotoSansJP-Regular.otf`·`NotoSansJP-Bold.otf`·`Pretendard-Regular.woff2`·`Pretendard-Bold.woff2`)이
`data/raw/fonts/` 에 있어야 한다. (주아체는 2026-10-04 에 걷었다 — 한국어는 정보용 한 서체다.)

| 파일 | 크기 | 담는 것 |
|---|---|---|
| `NotoSansJP-subset` | 496KB | 숙어·읽기에 나오는 문자 + 가나 전 구간 |
| `NotoSansJP-Bold-subset` | 508KB | 같은 문자 집합 (합성 볼드는 자형을 왜곡한다) |
| `PrdSansKO-Regular` | 97KB | **사전의 뜻·한국 한자음 + 소스·안내서의 UI 문구** + 라틴/기호 |
| `PrdSansKO-Bold` | 98KB | 같은 문자 집합 — 600 이상 굵기가 가짜 볼드가 되지 않게 (2026-10-05). 원본은 `https://github.com/orioncactus/pretendard` 의 `packages/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2` |

**`PrdSansKO-Regular`·`PrdSansKO-Bold` 는 Pretendard 서브셋이다.** Pretendard 는 OFL 예약 폰트 이름을 선언했고
OFL 은 서브셋을 수정본으로 보므로, 사용자에게 보이는 이름(웹에서는 `font-family`)에 원본 이름을
쓸 수 없다. 근거와 남은 한계(파일 안 이름 테이블은 원본 그대로)는 `public/fonts/LICENSES.txt`
에 적어 뒀다.

### 위험의 크기가 언어마다 다르다

**일본어는 100% 커버가 빌드 실패 조건이다.** 한 글자라도 빠지면 그 한자가 한국 자형으로
나가서 사용자가 틀린 글자 모양을 학습한다 (CLAUDE.md 「일본어 렌더링」).

**한국어는 시스템 한글 폰트로 떨어질 뿐이다.** 그래서 서브셋을 공격적으로 잡았다.
대신 **한글이 늘어나는 작업 뒤에는 다시 돌려야 한다** — 뜻 검수 반영, UI 문구 추가.
소스(`src/**/*.{ts,tsx,css}`)·`public/guide.html`·`index.html` 은 빌드가 알아서 긁는다.

### 프리로드는 한국어만

`index.html` 이 한국어 서체(`PrdSansKO-Regular`)만 `rel="preload"` 한다. 일본어 Bold(509KB)까지 얹었더니
JS 번들과 대역폭을 나눠 가져 **FCP 가 1,500ms → 2,584ms 로 되레 나빠졌다**(1.6Mbps 실측).
한국어만 남기니 1,892ms 에 한글 폰트가 1.3초에 끝난다 — 전에는 11.4초였다.

일본어에는 `font-display: optional` 을 쓰지 않는다. 폰트가 늦으면 폴백으로 굳는데,
그게 곧 한국 자형이다.

## 예문 — 이상한 이름 빼기

예문은 뜻을 잡으라고 두는 자리다. 표제어가 **고유명사 이름 안에 파묻힌** 예문은 그 자리에
못 선다 — 和歌山 의 和歌, 協和銀行 의 協和 처럼 읽기는 맞지만 뜻이 다르다.
배경은 `context-notes.md` 2026-09-21 절.

`build:examples` 가 자동으로 거르는 규칙은 한 줄이다. **이름이 표기 뒤로 더 이어지면 뺀다.**

| 자리 | 판정 | 예 |
|---|---|---|
| 이름 앞부분 | 뺀다 | `和歌`山 · `協和`銀行 · `太平`洋 |
| 이름 가운데 | 뺀다 | 東`京都`庁 |
| 이름 뒷부분 | **살린다** | アルプス`山脈` · 赤`十字` · 協和`銀行` |
| 표제어 = 이름 전체 | 살린다 | `東京` |

뒷부분을 살리는 건 이름이 「고유한 앞부분 + 종류를 가리키는 뒷부분」으로 짜이기 때문이다.
協和銀行 의 銀行 은 은행이 맞다.

### 손으로 적어야 하는 두 가지

자동 규칙이 못 잡는 자리는 `data/dict/propn-overrides.json` 에 **이름과 막을 표기**를 적는다.
문장이 아니라 이름을 적는 이유는, 타토에바가 갱신돼도 규칙이 살아남고 같은 이름에 걸린
다른 표제어까지 같이 잡히기 때문이다.

1. **형태소 분석이 이름을 안 잡는 것** — IPADIC 이 協和銀行 을 協和+銀行 으로 갈라
   고유명사 표시가 아예 안 붙는다
2. **뒷부분인데 뜻이 다른 것** — 最高裁 의 高裁 는 고등법원이고 大西洋 의 西洋 은 서양이 아니다

```json
{
  "blocked": {
    "協和銀行": ["協和"],
    "最高裁": ["高裁"]
  }
}
```

이름 하나에 막을 표기가 여럿이면 배열에 나란히 적는다. 그 이름 안의 **적지 않은 표기는
그대로 나온다** — 協和銀行 에 `協和` 만 적으면 `銀行` 예문은 살아 있다.

### 고치고 다시 돌리기

```
npm run build:examples        # → data/dict/examples.json
npm run build:runtime-dict    # → public/dict
```

로그의 `고유명사 매몰 N개` 로 몇 개가 걸렸는지 본다. 그다음 `public/dict/` 변경분과
`propn-overrides.json` 을 같이 커밋·푸시하면 GitHub Actions 가 배포한다
(`propn-overrides.json` 은 `data/dict/*` gitignore 의 `*-overrides.json` 예외라 커밋된다).

**규칙을 넓혔으면 넓어진 쪽을 전수로 훑는다.** 뒷부분을 살리기로 바꿨을 때 東海道線 이
海道 예문으로 새로 들어왔다 — 한 자리를 풀면 다른 이름으로 같은 문제가 생긴다.

## 분류(category) 파이프라인 — Phase 3, 보통 다시 안 돌림

```
match:korean          한자별 한국 한자음 → stdict 조회 → korean-match.json / korean-review.tsv
draft:korean-review   Ollama 초벌 분류 → korean-llm-draft.tsv
build:review-worklist  수동 검수 큐 → korean-worklist*.tsv
build:event-worklist   앱 지연 검수 응답(meaningKnown) → korean-worklist-events.tsv
apply:korean-review    사람 verdict + 초벌 → korean-class.json
```

`build:event-worklist` 는 `data/events/` 에 둔 Drive 백업(`reviews-*.json`)을 읽는다.
현재 분류와 **어긋난 응답만** 담으므로 보통 몇 행 안 나온다.

```
npm run build:event-worklist                 # data/events/ 를 읽는다
npm run build:event-worklist -- --dir=<경로>  # 다른 폴더에서 읽기
```

verdict 를 채운 뒤 `apply:korean-review -- --trust-llm` → `apply:korean-meaning` →
`build:runtime-dict` 순으로 돌린다. 가운데를 빼면 검수한 `koMeaning.verified` 가 전부 날아간다.
