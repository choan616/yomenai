# 체크리스트

각 항목은 검증 기준을 통과해야 체크한다. "만들었다"가 아니라 "확인했다"가 완료 조건이다.

---

## 지금 여기 (2026-09-19 마지막 갱신)

이어받는 세션이 먼저 읽는 자리. **끝난 일은 아래 절에, 근거는 `context-notes.md` 에 있다.**
여기에는 *다음에 손댈 것* 만 적는다. 다 끝나면 이 절을 지우지 말고 내용을 갈아끼운다.

**절 헤더의 표시** — `✅` 는 그 절의 항목이 다 끝났다는 뜻, `⏳ 열린 항목 N` 은 N 개가
남았다는 뜻이다. 아래 색인이 그 N 개를 한자리에 모은 것이다.

**상태** — `main` 깨끗함, 전부 푸시됨. 단위 **557** · e2e **30** 통과. 상용 배포 확인됨.
사용자 본인이 유일한 사용자다 (테스터 1명 = 본인, iOS 실기기).

**이 앱이 왜 있는지** — 사용자는 일본어 소설을 읽는 수준이고, 읽다 낯선 한자어를 만나면
읽기·뜻이 정확하지 않아 거기서 끊긴다. 그 빈도를 줄이려고 한자어만 따로 학습한다
(`context-notes.md` 2026-09-17 절). **문구 축은 「당황 → 대처」다** — 초급자를 달래는
말투("겁내지 마세요")도, 수동적인 「막힌다」도 쓰지 않는다 (사용자가 둘 다 물렸다).

---

### 열린 항목 색인 (23건, 2026-09-18 기준)

나머지 **268건은 완료**다. 절 헤더의 `✅`(다 끝남) / `⏳ 열린 항목 N` 으로 구분된다.
아래는 그 N 들을 성격별로 모은 것이다 — **어느 절에 있는지**까지 적었다.

**A. 지금 손댈 수 있는 것 (4)**

| 무엇 | 어느 절 |
| --- | --- |
| `ONYOMI_CHOICE`·`MIXED_READING` 감사 — 구조 판정 중 미검증인 둘. 도구는 이미 있다 | 축 A′ |
| `ONYOMI_CHOICE` 1,219 를 청탁 미구분으로 — **위 감사가 선행 조건** | 청탁 미구분 |
| 복합 오답에서 한 축만 말하는 게 맞나 (원형+촉음 둘 다 틀린 579건) | 갈래가 답의 모양을 |
| 첫 안내를 모달 + 캐러셀로 — **내비게이션 모델이 정해져 이제 열렸다** | UI 개편 |

**B. 결정이 있어야 움직이는 것 (3)**

| 무엇 | 왜 멈춰 있나 | 어느 절 |
| --- | --- | --- |
| `KO_INTERFERENCE` 2,596 을 끌어올지 | 이름이 안 틀렸다. 실사용 빈도가 근거 | 청탁 미구분 |
| 홈 레이아웃 본편 | 지금 홈은 "테스트하기 편하게" 정리한 상태 | UI 개편 |
| 이 설계가 다른 사람에게도 맞는지 | 한 사람 로그 1,719건으로 만든 앱 | 첫 만남을 소개로 |

**C. 사용자 몫 — 실기기·외부 (10)**

- **실기기 확인 5건** — 9-E 진단 체감 · 10-D 처방이 「다음에 뭘 할지」로 읽히는지 ·
  11-F 예고가 궁금증인지 소음인지 · iOS 키보드 올린 채 카드 3~4장 · 배포판 정리 후
  Drive 파일 11개 (각각 Phase 9·10·11 · 실사용 후속 · Drive 동기화 정리 절)
- **서비스화 전 필수 5건** — 3개월 실사용 · EDRDG CC BY-SA 승계 범위 문의 · stdict 약관 ·
  `verified=false` 전수 검수 · 이용약관·개인정보처리방침 (전부 Phase 8 절)

**D. 조건이 차야 움직이는 것 (5)**

- 지연 검수 16,858건 — Phase 4 카드 풀 진입 시 (Phase 3 절)
- 205자 검수 — `korean-reading-review.tsv` (오답 상세 다듬기 절)
- 동기화 P3 묘비 도입 · 정리 후 남는 내 파일 (동기화 유실 절)
- 훑어보기 채점 버튼 — 채점 없는 화면이라는 정체와 부딪혀 보류 (테스터 피드백 1차)

**E. 기획 밖 (1)** — 수준별 진단(N5·N4), 2026-09-14 사용자 판단 (테스터 피드백 1차 절).

---
**2026-09-19 에 한 일**

1. **뜻 검수 모델 오탐률 관문** (`3e910f2` 앞) — 사람이 `o` 로 판정한 1,282건에
   `qwen3.5:latest` 를 돌려 「틀렸다」 지목 43건(3.4%). **지목분에 진짜 오류가 섞여 있다**
   (引導 「이끌어 지도함」 ← *requiem*, 公庫 「공공의 창고」 ← *finance corporation*) —
   순수 오탐률은 사용자 눈 검수로만 확정된다. `data/dict/meaning-judge-qwen3.5-latest.tsv`
2. **수준 사다리 측정** (`3e910f2`) — 시뮬레이터 안에 정답지를 만들어 비교. 지금 사다리는
   정답률로는 정확한데(±1.4%p) **수준으로 읽으면 10~20%p 과대평가**하고, 익힌 숙어가
   줄지 않았는데 **300세션에 37번 뒤집힌다**(재고 사다리는 0번). 가설 둘은 기각됐다 —
   잔여물 편향 아님(창 30에 서로 다른 숙어 27~29개), 오타 주범 아님(오타 0%에서도 39번).
   원인은 30회 표본의 분산이다. `npm run sim:level`
3. **사다리 숫자를 개수로** — 「밴드 정답률 82%」 → 「밴드별 붙은 숙어 84개」.
   정답률은 상태 줄로 내리고 경계선은 그대로 정답률이 긋는다. 새 화면은 안 만들었다
   **검증: `npm test` 557 · `playwright` 30 스펙 · tsc/oxlint/build 클린**

---
**2026-09-18 에 한 일 (전부 배포됨)**

1. **청탁 미구분 도입 3단계** — 한국 한자음은 청탁을 안 가른다(化 カ ↔ 画 ガ). 절을 만들고
   (`voicing-unmarked`), 갈래를 내고, 미분류 3,521 까지 끌어왔다. 저장 스키마는 안 건드렸다
2. **구조 판정 감사** — `KO_INTERFERENCE` 는 진짜 간섭의 **96.7%** 를 제 유형으로 보낸다.
   종성→꼬리 대응표를 코퍼스에서 귀납해 절 서술 여섯 줄을 테스트로 고정했다
3. **갈래가 답의 모양을 따라가던 것** — 寸法 すんぽう ← すんぼう 가 연탁으로 갔다.
   갈래는 정답 쪽 규칙이 정한다. 307건이 연탁→반탁으로 옮겼고 유형은 안 움직였다
4. **오답 피드백 잠금 중 입력창에 글자가 찍히던 버그 수정** (`69c616b`) — `readonly`/
   `disabled` 대신(iOS 포커스 유지 때문) `onBeforeInput` 으로 값 변경 자체를 막았다
5. **오답 카드에 내가 쓴 답 대조** (`348f028`, `080042b0`) — 정답과 LCS 로 대조해 틀린
   글자만 빨간 밑줄로(`src/core/answerDiff.ts`). 자리별 비교가 아니라 LCS 라, 촉음
   하나가 빠지거나 늘어도 그 뒤 전부가 오답으로 안 밀린다. **표시 자리는 새 줄이
   아니라 입력창 안** — 사용자가 첫 시도("내가 쓴 답" 새 줄)를 "복잡하다"고 지적해
   `KanaInput` 안에 오버레이로 겹쳐 그리는 쪽으로 고쳤다. 그 과정에서 이름이 같은
   두 `.feedback`(오답 카드 vs 설정의 피드백 폼) 특정도 충돌도 잡았다. 근거는
   context-notes 같은 날 절 두 곳(도입 · 자리 수정)
   **검증: `answerDiff.test.ts` 6 · `npm test` 517 · `playwright` 29 스펙 · tsc/oxlint 클린**
6. **오답 유형 분포에서 1등만 걸러 다시보기** (`7575686`) — 사용자가 그래프 아래
   "한국음 간섭"이 그래프 1등을 보여주는 줄 알았는데 실은 항상 고정이었다. 그 섹션은
   그대로 두고, 그래프 바로 아래에 진짜 1등(탁음이면 갈래까지)을 거른 "N회 다시보기"
   버튼을 새로 뒀다. `ruleRecord.ts` `frequentIdiomsByMistake` 신규, `Flow['browse']`
   가 선택적 `filter` 를 받는다. **주차장에 있던 "규칙 절 → 다시보기" 항목과 방향만
   반대라 규모가 거의 같았다.** 근거는 context-notes 같은 날 절
   **검증: `ruleRecord.test.ts` +5 · `npm test` 522 · `playwright` 29 스펙 · tsc/oxlint
   클린 · IndexedDB 에 SOKUON 5건·CHOON 2건 심어 실측(버튼 "촉음 5회 다시보기", 진입
   시 1/1장만 · 御金(CHOON) 안 섞임 확인)**

7. **고정 「한국음 간섭」 칸 → 1등 오답 칸** (사용자 지시) — 6번 결과를 보고 "장황하다"는
   판정이 왔다. 같은 정보가 세 번(분포 1등 막대 · 1등 다시보기 버튼 · 등수와 무관한 고정
   칸) 나오고 있었다. 고정 칸의 골격을 그대로 써서 **지금 1등 유형**을 싣고(제목=유형
   이름, 큰 숫자=횟수, 목록=그 유형으로 틀린 숙어 8개), 6번에서 그래프 아래 달았던 버튼을
   **그 칸 맨 위로 옮겼다**("모아서 다시보기"). `Report` 타입의 `koInterferenceCount`·
   `koInterferenceIdioms` 제거, `.ko-callout` → `.top-mistake`. PLAN §7 화면 표도 같이
   고쳤다 — 같은 날 오전에 기각했던 안을 되살린 건이다. **기록이 적을 때는 한국음 간섭이
   다른 유형을 압도해 고정 칸과 1등 칸이 같은 칸이었는데, 기록이 쌓이며 갈렸다**(사용자
   설명). 근거는 context-notes 같은 날 절
   **검증: `npm test` 521 · tsc(app/e2e) 클린 · `report-voicing.spec.ts` 에 실측 추가
   (반탁 2·연탁 1 심어 칸 제목 「반탁」·큰 숫자 2·목록 心配, 버튼 누르면 心配만 나오고
   三日月 안 섞임) · 420px 실캡처로 배치 확인**

8. **리포트 다시보기 정리 · 미분류를 「기타」로** (사용자 지시) — 7번 뒤에도 장황함이
   남았다. 1등 유형이 막대·큰 숫자·숙어 목록·버튼으로 네 번 나오고 있었다. **1등 유형에
   내주던 칸을 통째로 없애고**, 진입로만 분포 **아래** 다시보기 영역으로 모았다. 한 줄에
   양쪽으로 「무작위 다시보기 / N장」·「오답 유형별 다시보기 / 반탁 2회」 두 버튼
   (`.browse-pair`). 분포 아래 각주였던 미분류는 분포 안 「기타」 막대가 됐다 —
   **등수와 무관하게 맨 아래 고정**이다. 정렬에 끼우면 미분류가 제일 많을 때 1등 유형을
   밀어내고, 그러면 유형별 버튼이 가리킬 게 없어진다. 근거는 context-notes 같은 날 절
   **검증: `npm test` 521 · `tsc -b`/`oxlint` 클린 · `playwright` 29 스펙 ·
   `report-voicing.spec.ts` 에 미분류 이벤트 1건 추가(분포 반탁 2 / 연탁 1 / 기타 1,
   기타가 마지막 행, 유형별 버튼 누르면 心配만) · 420px·360px 실캡처로 버튼 줄 확인**

9. **기타 190건(18%)의 정체 · 청탁 관문 버그 · 「잘못 읽기」** (사용자 지시) — 실사용
   기록으로 쟀다. 기타의 96%는 분류기 결함이 아니라 **6종의 정의 범위 밖**이었다
   (답이 그 한자의 실재 읽기가 아니거나 다른 단어를 떠올린 것: 129건 + 48건).
   넘김은 5건뿐 — 「빈 답이 기타를 채운다」는 첫 가설은 **틀렸다**.
   버그 하나를 찾았다: `UNVOICE` 표가 `じ→ち`·`ず→つ` 로만 돌려 **し↔じ·す↔ず 오답이
   탁음 관문을 아예 못 탔다**(실사용 8건). `unvoiceAll` 대신 **관문**을 고쳤다 —
   `sameExceptVoicing` 이 되돌리기를 함수가 아니라 관계로 본다(`unvoiceAll` 은 음독 쌍
   ID 생성에도 쓰여 손대면 사전 산출물이 움직인다). 남은 96%에는 **읽을 때만** 붙는
   표시 이름 「잘못 읽기」를 줬다 — `MistakeType` 은 안 늘렸다(스키마 불변 조건).
   그 행은 정렬에 들고 「오답 유형별 다시보기」로 이어진다. 이름은 「다른 읽기」로
   달았다가 **「잘못 읽기」로 고쳤다** — 이 앱은 「다른 읽기」를 동형이독의 *정답* 쪽에
   이미 쓴다(사용자 지적). 넘김은 답이 없는 것이라
   분리해 맨 아래 고정. 근거·전수 대조 수치는 context-notes 같은 날 절
   **검증: `npm test` 529(+8) · `tsc -b`/`oxlint` 클린 · `playwright` 30 스펙(+1) ·
   전수 대조 43,698건에서 2,565건 이동(미분류→탁음 1,412 · KO→탁음 1,153, 나머지 유형
   전부 불변) · 실사용 185건 중 7건이 이름을 얻음 · 420px 실캡처**
10. **분포 막대를 비중 3단 색으로** (`b36d4aa`, 사용자 요청) — "오답률 낮으면 안심,
    높으면 주의"를 새 색 없이 표현했다. `count / totalWrong`(처방의 "오답의 N%"와
    같은 잣대)로 옅음(0.4)/보통(0.7)/진함(1, 기본값) 3단, `--ng` 하나의 불투명도만
    바꾼다(PLAN §7 "무채색 기반, 색은 오답에만"). 높은 쪽 문턱은 처방 문턱
    `DOMINANT_SHARE`(0.3)를 그대로 가져와 "그래프가 진하게 보여주는 유형 = 처방이
    짚는 유형"이 어긋나지 않게 했다. 근거는 context-notes 같은 날 절
    **검증: `npm test` 529 · tsc/oxlint 클린 · `playwright` 30 스펙 · IndexedDB 에
    50%/25%/15%(경계)/10% 비중으로 심어 실측(sev-high 1개 · sev-mid 2개(25%·15%
    경계 둘 다) · sev-low 1개로 정확히 갈림) · 스크린샷으로 짙기 그라데이션 확인**

11. **예문이 다른 단어를 보여주던 것** (사용자 지적 「日照 예문에 日照り가 나온다」) —
    예문 매칭이 문자열 포함이라 읽기를 검증하지 않았다. JMdict 대조로 재니 **416문장
    (1.5%)**, 예문 셋이 전부 틀린 숙어가 **95개**였다(本人 ← 日本人, 家主 ← 国家主義).
    빌드 시점에 **kuromoji(IPADIC)** 로 읽기를 검증하게 고쳤다 — 걸치는 형태소들의 읽기를
    이어 붙여 표제어 읽기를 품는지로 본다(`readingHolds`). 경계 정렬을 요구하면 弁護士·
    論文中 처럼 읽기가 보존되는 7,348문장이 같이 날아가서 기준을 읽기로 뒀다. 예외 셋 —
    음운 변형(促音便 一/回 → いっかい) 무시, 형태소 하나와 표기가 통째로 맞으면 통과
    (IPADIC 이 日本人 을 ニッポンジン 으로 주는 부류), 양쪽 끝이 다 형태소 중간이면 탈락
    (万一|戦争 안의 一戦). 근거는 context-notes 같은 날 절
    **검증: 같은 JMdict 감사 재실행 — 의심 문장 416 → 154(1.5% → 0.6%), 전부 의심인
    숙어 95 → 36. 예문 보유 숙어 11,377 → 11,130, 문장 27,517 → 26,891.
    `npm test` 529 → 544(`build-examples.test.ts` 5 → 20) · `playwright` 30 스펙 ·
    tsc/oxlint/build 클린 · 日照 예문 사라짐, 本人 은 「彼本人がやってきた」로 바뀜**

**주차장** — 커스텀 키패드(`inputMode="none"`)는 IME 후보 바가 실제로 방해된다는 피드백이 오면.
`justify-content: safe center` 앞에 `center` 폴백 한 줄 (`.card-body`·`.summary-screen`) —
`safe` 를 모르는 브라우저는 선언째 버려 중앙 정렬이 사라진다. 잘림은 안 생겨 급하진 않다.
탭 순서 — 「읽기로 찾기」가 제일 자주 여는 화면이 될 수 있다. 며칠 쓴 뒤 조정한다.
**자주 쓰는 것**

- 검수 반영: `npm run apply:korean-meaning` → `npm run build:runtime-dict` (순서 중요)
- 배포 확인: 아래 「배포 확인 방법 (함정)」 절을 반드시 읽는다. 같은 함정에 두 번 빠졌다.
  **이번 변경에만 있는 문자열**로 확인한다 — 기존 문구에 걸려 옛 번들을 성공으로 오판한 적이 있다
- 배포 상태: `& "C:\Program Files\GitHub CLI\gh.exe" run list --limit 1` — **PATH 에 안 잡힌다.
  경로를 통째로 부른다** (bash·PowerShell 둘 다 `gh` 는 not found. gh 2.101, choan616 계정 keyring)
- e2e: `npx playwright test` — 설치된 Chrome 채널을 쓴다(브라우저 다운로드 불필요).
  **돌리는 중에 소스를 고치지 않는다** — 이번 세션에서 두 번 실행을 버렸다
- 홈 길이: `tab-shell.spec.ts` 가 넘침 0 을 지킨다. 홈에 뭘 더하면 여기서 걸린다

---

## Phase 0 — 계획 확정 ✅

- [x] 배포 형태 확정 (로컬 우선 PWA + 클라우드 백업)
- [x] 학습 목적 확정 (읽기 교정 1차, 어휘 확장 2차)
- [x] 난이도 축 확정 (JMdict 우선순위 밴드)
- [x] 스키마 불변 조건 확정
- [x] UI·폰트 방향 확정
- [x] 문서 3종 작성

---

## Phase 1 — 스캐폴딩 + 데이터 파이프라인 ✅

### 1-1. 프로젝트 셋업

- [x] Vite + React + TS 스캐폴딩 (임시 폴더 경유, Vite 8 / React 19 / TS 6)
- [x] 의존성 설치 — dexie, dexie-react-hooks, ts-fsrs, wanakana / -D vitest, vite-plugin-pwa, tsx, fast-xml-parser
- [x] `npm run dev` 정상 기동 확인 → HTTP 200, index.html 서빙, 콘솔 에러 없음
- [x] `npm run test` 스크립트 추가, 더미 테스트 1개 통과 → vitest 3.2 실행 확인
- [x] `.gitignore`에 `data/raw/` (+ `data/dict/`) 추가

### 1-2. 원본 데이터 확보

- [x] KANJIDIC2 다운로드 → `data/raw/kanjidic2-all-3.6.2.json` (jmdict-simplified 변환본)
- [x] JMdict 다운로드 → `data/raw/jmdict-eng-3.6.2.json` + `data/raw/JMdict_e.gz` (원본 XML)
- [x] 파일 버전·다운로드 일자를 `context-notes.md`에 기록 (2026-09-03 절)

### 1-3. 임포트 스크립트

- [x] `tools/import-kanjidic.ts` — 한자별 `grade`, `freq`, 음훈독, `korean_h` 추출 → `data/dict/kanji.json` (13,108자)
- [x] `tools/import-jmdict.ts` — JMdict_e.gz 원본 XML 파싱, 한자 표기 표제어 필터, 우선순위 태그 파싱 → `data/dict/idioms.json`
- [x] 표외자(비상용 한자) 포함 숙어 제외 필터 — 15,360개 제외
- [x] 사전 DB 산출 (분할 JSON, 형식은 context-notes 2026-09-03 절에서 권고안 확정)
- [x] **검증: 임의 숙어 20개의 읽기·품사·구성 한자가 원본과 일치** — `tools/import-jmdict.verify.test.ts` 7 테스트 통과

### 1-4. 실측 (결과를 context-notes에 기록)

- [x] 대상 숙어 총 개수 — 107,532 (우선순위 태그 보유 18,472)
- [x] 글자수별 분포 — 2자 45,138 / 3자 28,034 / 4자 22,371 / 5+자 11,989
- [x] 밴드별 분포 — 잠정 규칙으로 산출, 밴드 3 편입 결함을 Phase 2 입력으로 기록
- [x] 사전 DB 용량 — 전체 21 MB, 밴드 0~3만 ~5.7 MB → **분할 JSON 권고**
- [x] 일본 고유 숙어 예상 비율 — **Phase 3로 이월** (한국어 대조 없이는 정밀 측정 불가)

---

## Phase 2 — 레벨링 + 음독 매핑 ✅

- [x] nf/news 상관 실측 → 밴드 경계 확정 (news1 = nf01~24, news2 = nf25~48)
- [x] `tools/build-bands.ts` — nf 빈도 순위 → 밴드 0~4 산정, `data/dict/bands.json` 산출
- [x] **검증: 밴드별 분포 스냅샷 테스트** — `tools/build-bands.test.ts` 9 테스트 통과.
  분포 4,033 / 3,945 / 1,509 / 7,889 / 90,156. Phase 1의 "밴드 3 = 53개" 결함 해소
- [x] 밴드별 무작위 30개 추출해 육안 검수 → **검증: 명백한 오분류 없음**
  (`tools/review-bands.ts`, 시드 20260903. 검수 소견은 context-notes 2026-09-03 Phase 2 절)
- [x] 밴드 경계(nf20/nf21 부근) 집중 검수 — nf20/21/24/25 각 20개. 경계 불연속 없음
- [x] `tools/build-onyomi-map.ts` — 숙어 → (한자, 음독) 쌍 분해
  - 連濁·促音便·半濁音·連声·促音添加·연용형 흡수 규칙 구현 (`src/lib/readings.ts`, Phase 4에서 tools/lib 에서 이동)
  - 최소 비용 분해 (`src/lib/onyomi.ts`, Phase 4에서 이동). 고유 쌍 4,001개
- [x] **검증: 매핑 실패 숙어 목록 출력, 실패율 기록**
  성공 103,172 / 107,532 (95.95%). 밴드 0~3 실패율 1.02% / 1.67% / 1.06% / 1.69%.
  실패 목록 `data/dict/onyomi-failures.tsv` — 대부분 熟字訓이라 거부가 정상 동작
- [x] **검증: 음독 그래프에 순환 참조 없음** — 이분 그래프(위상 정렬) + 변형 파생
  그래프(색칠 DFS) 둘 다 순환 없음. `tools/build-onyomi-map.test.ts` 19 테스트 통과

---

## Phase 3 — 한국어 대조 배치 ⏳ 열린 항목 1

- [x] stdict 오픈 API 인증 키 발급 — 사용자 발급 완료 (2026-09-03)
- [x] 키를 `.env`로 분리 → **코드에 하드코딩 금지** — `.env.example` 추가, `process.loadEnvFile()`로 읽음. `.env`는 `.gitignore`됨
- [x] `tools/match-korean.ts` — 한자별 `korean_h` 조합 → 한국어 후보 생성 → stdict 조회
  (`tools/lib/korean.ts` 후보 생성·原語 대조·분류, `tools/lib/kanji-variants.ts` 신자체↔정자)
- [x] 호출 한도 대응 (스로틀링 50ms, `.korean-cache.json` 디스크 캐시로 중단 지점 재개, `StdictApiError` 시 flush 후 exit 2)
- [x] 3분류 저장 — 동형동의(1) / 동형이의(2) / 일본 고유(3). 배치는 JP_UNIQUE vs NEEDS_REVIEW만 자동, 1/2는 수동 검수 큐(`korean-review.tsv`) → `apply-korean-review.ts`
- [x] 모든 뜻 필드에 `source` + `verified` 기록 — `korean-class.json`의 `koMeaning` = `{source:'stdict', verified:false}`
- [x] 동형이의 그룹은 `verified=false` 기본값 — 전 항목 `verified=false` (표시 뜻 검수는 별도 단계)
- [x] **분류 로직 검증** — `tools/match-korean.test.ts` 23 테스트 통과. 알려진 동형이의어 10개가 fixture로 NEEDS_REVIEW(잠정 2번) 큐 진입 확인
- [x] **실측 검증: `npm run match:korean` 실행 완료 (밴드 0~3, 17,376개, ~36분).**
  알려진 동형이의어 10개 전부 NEEDS_REVIEW(잠정 2번, 原語 일치). JP_UNIQUE 1,916 (11.0%) /
  NEEDS_REVIEW 15,456 (89.0%). 규모·소견 context-notes 2026-09-03 Phase 3 절
- [x] Ollama 초벌 파이프라인 — `tools/lib/ollama.ts` + `draft-korean-review.ts` + `apply-korean-review.ts --trust-llm`.
  모델 qwen3.5 실측 채택(gemma4:26b는 출력 붕괴로 제외). 12건 스모크 정상. 층화 표본 200건 생성됨
- [x] 표본 150건 라벨링 + `--validate` → qwen3.5 일치율 90.7% (실질 95%+, 라벨 노이즈 감안). 프롬프트 확정
- [x] 초벌 배치 완료 (8,700건, 1(동형동의) 6,107 / 2 732 / 3 1,861) → `apply:korean-review -- --trust-llm` 반영.
  `korean-class.json` — 동형동의 6,107 / 동형이의 7,488 / 일본고유 3,777. 스팟 검토 품질 양호
- [x] **완료 기준 — 알려진 동형이의어 10개 중 9개 category 2.** `主人`만 초벌 1 (경계 사례, 수동 검수로 확정)
- [x] tier 2 필수 검수 완료 (355건, 1:117 / 2:237 / 3:1). tier 1 (439건)은 초벌 신뢰
- [x] Phase 1 임포트 버그 수정 — sK/iK/oK 표기 표제어 제외 (`魚信`↔`当たり` 발견). 코퍼스 106,803, 파이프라인 재실행, 스냅샷 테스트 갱신, 127 통과
- [ ] 지연 검수 (Phase 4 카드 풀 진입 시) — 미확정 분류 **16,858건** 전량.
  `主人`(id 1579780, 초벌 1, 경계) 포함. 재집계 내역은 context-notes 2026-09-04 절
  - 검수 큐 잔여 **15,001** = 15,356 − tier 2 완료 355
    (tier 1 **439** / 3 1,785 / 4 2,977 / 5 361 / 6 2,698 / 9 **6,741**)
  - JP_UNIQUE **1,857** — 큐에 안 들어간 자동 분류(`classSource=default`)도 같은 경로로 확인된다
  - `korean-worklist-t1.tsv`(439행) 생성됨, verdict 전량 `?` — tier 1도 지연 대상
  - 런타임 준비 완료 — `buildSession`이 `needsClassReview`를 실어 주고 `meaningKnown`
    응답이 모드를 즉시 바로잡는다 (Phase 4 절). 카드가 실제로 풀에 들어올 때만 묻으므로
    16,858건을 미리 다 볼 일은 없다. 남은 건 **묻는 화면(Phase 5)**이다
- [x] **검수 응답을 `korean-class.json`으로 되돌리는 도구** (2026-09-12) —
  `tools/build-event-worklist.ts` (`npm run build:event-worklist`). `data/events/` 에 넣은
  Drive 동기화 파일(`reviews-*.json`)에서 `meaningKnown` 만 걸러 숙어별로 접고,
  **현재 분류와 어긋나는 응답만** `korean-worklist-events.tsv` 로 낸다
  - 이벤트 합집합 — 같은 이벤트 id 가 여러 기기 파일에 있어도 한 번만 센다.
    숙어별로 마지막 응답을 남기고 뒤집힌 이력은 `flip` 열로 표시 (정렬 기준은 `compareEvents` 와 같다)
  - **`korean-class.json` 을 직접 안 고친다** — "뜻은 알고 있었어요?" 는 동형동의 신호지 사전
    판정이 아니다 (일본어로 따로 익힌 일본고유어도 「알았다」가 나온다). context-notes 같은 날 절
  - 이미 사람 verdict 가 있는 숙어는 파일에서 빼고 콘솔로만 보고 — 같은 id 가 두 worklist 에
    있으면 `apply:korean-review` 의 파일명 순 병합에서 어느 쪽이 이겼는지 조용히 갈린다
  - `data/events/` 는 개인 학습 기록이라 gitignore. 산출 TSV 는 사람 판정이라 추적
  - **검증: `tools/build-event-worklist.test.ts` 9 테스트 (접기·중복·뒤집힘·같은 시각 id 정렬·
    어긋남 판정·제안 분류). 기기 2개 픽스처로 실행 — 일치 2 / 어긋남 1 / 사람 verdict 보유 1(架空)
    분류 확인. `npm test` 342 · `tsc -b`/tools tsc/`oxlint` 클린**

---

## Phase 4 — 학습 코어 ✅

- [x] IndexedDB 스키마 v1 정의 → `src/db/schema.ts`. 단일 `events` 테이블,
  PK `[userId+id]`, 색인 `[userId+at]` / `[userId+idiomId+cardType]` / `[userId+deviceId+at]` / `deletedAt`.
  **검증: `src/db/schema.test.ts` 6 테스트 통과** — PK 에 userId, deletedAt 색인, 전 이벤트의 cardType·mistakeType
- [x] 이벤트 로그 append 함수 — `src/db/events.ts` (`newEventId` 시간순 정렬 id, `appendEvent`, `listEvents`, `listCardEvents`)
- [x] 이벤트 → FSRS 카드 상태 재생(replay) 함수 — `src/core/replay.ts`. 카드 상태 + 진단 응답 + 음독 집계를 한 번에 접는다
- [x] **검증: 동일 이벤트 시퀀스를 두 번 재생하면 동일 상태** — `src/core/replay.test.ts` 12 테스트 통과.
  순서를 뒤집거나 회전시켜도 같은 상태가 나온다(기기별 파일 합집합 병합의 전제). 삭제 이벤트 제외도 확인
- [x] `ts-fsrs` 연동, 카드 타입별 개별 스케줄 — `src/core/scheduler.ts`.
  `enable_fuzz: false` 로 재생 결정론 확보. 자동 채점(`gradeFor`)은 오답 Again / 정답 Good + 쉬웠다·헷갈렸다 2버튼
- [x] 오답 유형 자동 판정 함수 (6종) — `src/core/mistakes.ts`. 답이 파싱되면 자리별 비교, 아니면 문자열 관계 → KO 간섭 순
- [x] **검증: 유형별 대표 케이스 각 3개씩 정확히 분류** — `src/core/mistakes.test.ts` 15 테스트 통과.
  축약 고정본(`mistakes.fixture.ts`, 51자)과 전체 KANJIDIC2 양쪽에서 동일 판정
- [x] 출제 선택 로직 (밴드 + 미숙 음독 가중) — `src/core/select.ts`. 기한 초과 우선 → 신규는 밴드 오름차순 · 미숙 음독 내림차순. 무작위 없음
- [x] 모드 자동 배정 3단계 — `src/core/mode.ts`. 한국어 대조 → 진단 응답 → 학습 중 재배치 순으로 덮어쓴다
- [x] **검증: 세션 100회 시뮬레이션 테스트 통과, 예외 없음** — `src/core/session.sim.test.ts` 7 테스트 통과.
  고정본 24개 풀과 **실제 사전 DB 400개 풀** 양쪽. 중복 출제 0, reps ↔ 이벤트 수 일치, 재생 결정론, 같은 시드 → 같은 로그
- [x] Dexie 실제 open/read/write 경로 검증 — `src/db/events.test.ts` 10 테스트 통과.
  fake-indexeddb 위에서 실제 스토어가 열리고 선언한 복합 PK·색인 4개가 그대로 붙는 것을 확인.
  append-only 보호(같은 id 재삽입 거부), 묘비 제외, userId 격리, 저장→조회→재생 왕복
- [x] `tsconfig.app.json`에 `strict` 켬 — 기존 코드 수정 없이 통과
- [x] 조립 지점 `src/core/session.ts` — `buildSession`(재생 → 모드 배정 → 선택) +
  `recordReadingAnswer`/`recordMeaningAnswer`/`recordMeaningKnown`(채점 → 오답 판정 → 이벤트).
  100회 시뮬레이션이 이 함수들을 쓰도록 바꿔, 검증하는 조립 순서와 화면이 쓸 조립 순서를 일치시켰다.
  **검증: `src/core/session.test.ts` 16 테스트 통과**
- [x] 지연 검수 신호 — `SessionCard.needsClassReview`. `classSource !== 'manual'` 인 숙어가
  카드 풀에 처음 들어올 때만, 숙어당 한 번. 응답은 기존 `meaningKnown` 이벤트로 남고
  모드 배정 2단계가 미확정 분류를 덮는다 (새 이벤트 타입 불필요)

---

## Phase 5 — UI ✅

- [x] 런타임 사전 번들 (분할 JSON, context-notes 미확정 #1 확정) — `tools/build-runtime-dict.ts`
  → `public/dict/{base,band4,pairs,kanji}.json`, 로더 `src/dict/load.ts`.
  **검증: `src/dict/load.test.ts` 5 테스트 통과** — `_meta.count` ↔ 레코드 수 일치(base 16,970),
  전 레코드 pairIds·category·classSource 유효, `buildSession(pool, [], …)` 가 풀을 그대로 받음
- [x] 폰트 서브셋 파이프라인 — `tools/build-fonts.ts` (subset-font/hb-subset + fontkit 검증).
  원본 `data/raw/fonts/` (Noto Sans JP 지역판 OTF + Pretendard woff2, 커밋 안 함) →
  `public/fonts/NotoSansJP-subset.woff2` (496 KB) + Pretendard 복사.
  당초 Noto Serif JP 였으나 산스로 변경 (사용자 요청, context-notes 2026-09-04 절).
  **검증: 커버리지 100.00% (2,228자), 폴백 0** — 빌드가 fontkit 로 원본·산출 cmap 대조,
  미달 시 exit 1. `src/styles/fonts.test.ts` 3 테스트로 고정 (骨直次令 + 가나 전 구간 + base 전량)
- [x] `lang` 속성 — `src/styles/fonts.css`: `@font-face` 2종 + `:lang(ja)`→`--font-ja`
  (일본 명조 스택, generic serif 최후) / `:lang(ko)`→`--font-ko`. 숙어·읽기 요소에 `lang="ja"`.
  **검증: 忠実 등이 일본 자형(実, 實 아님)으로 렌더링됨** — 스크린샷 확인 (라이트/다크)
- [x] `wanakana.bind()` 입력 필드 — `src/study/KanaInput.tsx`. `autocapitalize="none"` +
  `autocomplete/autocorrect=off`, `spellcheck=false`, `lang="ja"`, Enter 제출(조합 중 무시).
  **검증: e2e 에서 "chuujitsu" → ちゅうじつ 변환·정답 판정 확인**
- [x] 학습 카드 화면 — 읽기 카드(`ReadingCard`) + 뜻 카드(`MeaningCard`) + 지연 검수
  프롬프트(`ClassReviewPrompt`), 조립은 `useStudySession` + `Study`. 숙어 중앙 상단, 입력·버튼
  하단. 자동 채점(오답 Again / 정답 Good + 쉬웠다·헷갈렸다), 피드백은 색+아이콘+위치.
  최소 홈(`src/app/Home.tsx`) + 상태 기반 셸(`src/App.tsx`). 이벤트는 IndexedDB 에 append.
- [x] **검증: 카드 전환 150ms 이하 (실측)** — Playwright `tests/e2e/card-transition.spec.ts`,
  설치된 Chrome 채널. 세션 완주하며 `performance.measure` 로 전환 36회 수집,
  **p95 10.4ms / 최대 10.7ms**. `npm run e2e`
- [x] 오답 상세 — `src/study/MistakeDetail.tsx` + 뷰모델 `src/study/mistakeDetail.ts` +
  역인덱스 `src/dict/pairIndex.ts`. 읽기 오답 피드백의 "자세히" 로 진입. `loadPairs()`+`loadKanji()`
  로 (한자, 음독) 분해 + 한국 한자음(`kr`) 병기, `buildPairIndex(base)` 로 같은 pairId 를 쓰는
  다른 숙어 4개. 일본어 요소 전부 `lang="ja"`.
  **검증: `src/study/mistakeDetail.test.ts` 6 테스트 통과. 스크린샷 `scratchpad/01-mistake-detail.png`
  로 忠実 분해(忠 ちゅう / 実 じつ, 実 이 일본 자형) 레이아웃 확인**
- [x] 진입 진단 플로우 — `src/app/Diagnostic.tsx` + `src/core/diagnostic.ts`.
  `pickDiagnostic(pool, 30, DIAGNOSTIC_SEED=20260904)` 로 밴드 1~3 각 30개 시드 고정 무작위 출제.
  읽기 오답 문항에만 "뜻은 알고 계셨나요"(`recordMeaningKnown`). 결과는 이벤트 로그로만
  남고 완료 플래그는 `localStorage['yomenai:diagnosticDone']`(`src/app/diagnostic-state.ts`),
  완료 시 홈에서 진입점이 사라진다. 결과 화면은 `diagnosticSummary` 로 밴드별 정답률.
  **검증: `src/core/diagnostic.test.ts` 6 테스트 통과. 스크린샷 `scratchpad/02-diagnostic-{ask,known,result}.png`
  로 90문항 완주·`lang="ja"`·결과 차트 확인**
- [x] 진단 리포트 — `src/app/Report.tsx` + 파생 `src/core/report.ts`. `mistakeTotals` 유형 분포
  (인라인 CSS 막대, 차트에만 `--ng`), `replay().onyomi` 취약 음독(오답률순, seen≥3), `KO_INTERFERENCE`
  집계 + 해당 숙어. 무채색 기반, 상태는 아이콘+위치 병행. 데이터 없으면 빈 상태 안내.
  **검증: `src/core/report.test.ts` 5 테스트 통과. 시드 이벤트로 스크린샷 `scratchpad/03-report.png`
  (분포 막대·간섭 콜아웃·취약 음독), `03-report-empty.png` (빈 상태) 확인**
- [x] 음독 맵 — `src/app/OnyomiMap.tsx` + 파생 `src/core/onyomiMap.ts`. `loadPairs()` +
  `replay().onyomi`. 분모는 base 풀이 참조하는 쌍(3,000). 숙달 기준 `seen≥3 && wrong/seen≤0.2`.
  "음독 3000개 중 N개 숙달" + 무채색 진행 바 + 학습 중(오답률순) 목록, 상태는 아이콘+텍스트 병행.
  **검증: `src/core/onyomiMap.test.ts` 4 테스트 통과. 스크린샷 `scratchpad/04-onyomi-map.png`,
  `04-onyomi-map-all.png` 로 요약·목록·`lang="ja"` 확인**
- [x] 홈 / 설정 — 홈(`src/app/Home.tsx`)에 오늘 복습 수 + 세션 시작 + 진입 진단(미완료 시)·
  리포트·음독 맵·설정 진입점. 설정(`src/app/Settings.tsx`): 세션 길이 스테퍼(5~40),
  모드 비율 프리셋(7:3 / 5:5 / 읽기만), 백업 자리표시자(비활성). 값은 `src/app/settings.ts`
  로 localStorage 즉시 저장, `useStudySession`/`Home` 이 `buildSession` 에 `limit`·`ratio` 전달.
  **검증: `src/app/settings.test.ts` 5 테스트(클램프·검증·불변). 스크린샷 `scratchpad/05-home.png`,
  `05-settings.png`**
- [x] 다크 모드 — `src/app/theme.ts` (`system`|`light`|`dark`), root `data-theme` + localStorage
  `yomenai:theme`. `main.tsx` 가 첫 페인트 전에 `applyTheme(loadTheme())`. `src/index.css` 에
  `:root[data-theme='dark']` / `[data-theme='light']` 오버라이드(속성 선택자라 `prefers-color-scheme`
  블록을 이김), 기존 OS 블록 유지. 설정 화면에 시스템/라이트/다크 토글.
  **검증: `src/app/theme.test.ts` 2 테스트. 스크린샷 `scratchpad/06-{home,settings}-dark.png`,
  `06-settings-light.png`. reload 후 `data-theme` 유지 확인**
- [x] **검증: 진입 진단 → 세션 → 리포트 전체 흐름 완주** — `tests/e2e/full-flow.spec.ts`.
  테스트 시작 시 `indexedDB.deleteDatabase` + `localStorage.clear` 로 초기화 → 진입 진단
  90문항 완주 → 결과 화면(밴드 1~3 막대 3개) → 리포트(리드에 "읽기 90", 오답 분포·간섭
  콜아웃·취약 음독 렌더) → 홈(진단 진입점 사라짐) → 세션 완주 → 리포트 재진입.
  `playwright.config.ts` `workers: 1` (두 스펙이 같은 오리진 IndexedDB 공유).
  **검증: `npm run e2e` 2 스펙 통과 (full-flow 12.4s, card-transition p95 14.3ms)**

---

## Phase 6 — 예문·음성 (선택) ✅

- [x] Tatoeba 예문 커버리지 실측 — `tools/measure-tatoeba.ts`, `npm run measure:tatoeba`.
  밴드 0~3 표기 매칭 66.6%(밴드 0 90.5% ~ 밴드 3 "주력" 50.4%), 밴드 4 12.5%.
  **한국어 번역 연결은 0.9%**(2,261/248,888) — PLAN §6 이 기각한 영어 gloss 경유 없이는
  번역 붙은 예문이 사실상 불가능. 상세 context-notes 2026-09-04 절
  → **판정: 무번역 예문만 채택 (사용자 확인)**. 아래 항목으로 구현
- [x] 무번역 예문 표시 — `tools/build-examples.ts`(`npm run build:examples`, 원본
  `data/raw/tatoeba/` 미커밋) 가 표제어 매칭 문장을 60자 이하·짧은 순 최대 3개씩 골라
  `data/dict/examples.json`. **표기만 맞으면 日照 예문에 日照り가 실려서, kuromoji 로
  읽기까지 검증한다** (2026-09-18, 「지금 여기」 11번). `build-runtime-dict.ts` 가 base/band4 에
  실린 숙어로 걸러 `public/dict/examples.json`(숙어 10,984개). `loadExamples()`(`src/dict/load.ts`)
  는 세션 시작을 안 막고 **읽기 카드 피드백이 처음 뜰 때만** fetch — TTS 와 같은 확인 단계
  전용 위치. 산출물 없으면 조용히 빈 기능(에러 없음)
  **검증: `tools/build-examples.test.ts` 5 테스트(선별 순수함수) + `src/dict/examples.test.ts`
  3 테스트(base.json 참조 무결성·60자 이하·중복 없음) + `tests/e2e/examples.spec.ts`
  (문제 풀이 화면 0개 / 확인 단계에서 `lang="ja"` 로 등장, 20장 세션 중 1회 이상 확인)
- [x] TTS 인터페이스 분리 (Web Speech API 우선) — `src/study/tts.ts` `Tts` 인터페이스 뒤에
  `createWebSpeechTts()`. 정답 읽기(히라가나)를 `ja-JP` 로 발화, 헤드워드가 아니라 읽기를
  읽혀 발음이 모호하지 않다. **문제 풀이 화면엔 없고 확인(피드백) 단계에만** — 읽기 카드는
  정오답 피드백에, 뜻 카드는 뜻 확인 후에만 (사용자 요청). 자동재생 아님, 버튼 탭
  **검증: `src/study/tts.test.ts` 4 테스트**(가짜 엔진 주입, ja-JP·이전 발화 취소·빈 입력
  무시 확인) + `tests/e2e/tts.spec.ts`(실브라우저, 문제 풀이 화면 소리버튼 0개 /
  확인 단계에서만 등장 / `speechSynthesis.speak` 가 `ja-JP`로 호출됨)

---

## Phase 7 — 클라우드 백업 (선택) ✅

- [x] Google Drive 클라이언트 (`src/sync/googleDrive.ts`) — mmtm `GoogleDriveService` 를
  그대로 이식하지 않고 GIS(로그인 토큰) + `fetch` 로만 재작성(context-notes 2026-09-05
  절 "gapi 안 씀"). `drive.file` 스코프, 암호화·Dropbox·버전 관리(`MAX_BACKUPS_TO_KEEP`)는
  스킵(같은 절 "encryption 스킵"). `DriveClient` 인터페이스로 sync.ts 가 가짜 구현을
  주입할 수 있게 분리
- [x] 기기별 파일 분리 동기화 구현 — `src/sync/sync.ts` `syncNow(db, deviceId, drive?)`.
  각 기기가 `reviews-{deviceId}.json` 에 자기 이벤트 전량을 덮어쓰고, 남의 파일은
  `bulkPut` 으로만 병합(PLAN §5 원칙 3, 스키마의 `deviceId` 필드는 Phase 1부터 이미
  있었음). `src/db/events.ts` 에 `listDeviceEvents`/`importEvents` 추가
- [x] **검증: 두 브라우저 프로파일에서 각각 학습 후 병합 시 이벤트 손실 0** —
  `src/sync/sync.test.ts` "두 브라우저 프로파일에서 각각 학습 후 병합해도 이벤트
  손실이 없다": fake-indexeddb 두 인스턴스 + 메모리 Map 가짜 Drive 로 기기 2대를
  흉내 내 A→B→A 순으로 동기화, 재동기화 멱등까지 확인. **`npm test` 24파일 200테스트
  통과, `tsc -b`/`oxlint` 클린**
- [x] 설정 화면 배선 — `src/app/Settings.tsx` 백업 섹션(로그인/로그아웃/지금 동기화,
  마지막 동기화 시각). 세션 로딩 중 자동 동기화는 안 함(수동 트리거만 — 카드 전환
  150ms 예산과 무관하게 하려고, context-notes 참조)
- [x] **실기기 검증 완료 (2026-09-06)** — `.env` + GitHub Actions secret 에
  `VITE_GOOGLE_CLIENT_ID` 등록, Google Cloud OAuth 클라이언트(`yomenai`, DIARY 와
  같은 프로젝트) 발급·동의 화면 구성. 배포판 `choan616.github.io/yomenai/` 에서
  Google 로그인 → "지금 동기화" → 본인 Drive 에 `YomenaiSync/reviews-<deviceId>.json`
  생성 확인. 삽질 기록은 context-notes 2026-09-05·06 절 참조
  (invalid_client = secret 에 `https://…/` 붙음 → `normalizeClientId` 로 방어,
  이후 "액세스 차단됨" 잔상은 mmtm 서비스 워커/브라우저 캐시 → 사이트 데이터 삭제로 해결)
- [x] GitHub Pages 배포 — 사용자가 "public/dict·fonts 만 커밋" 안 선택(context-notes
  2026-09-05 절). `.gitignore` 에서 `public/dict/`·`public/fonts/` 제외, `data/dict/`
  는 계속 제외(Phase 3 검수 결과라 원본만으론 재생성 불가). `vite.config.ts` base 를
  `command==='build'||isPreview` 일 때만 `/yomenai/` 로(project page 서브패스,
  `npm run dev` 는 영향 없음). `.github/workflows/deploy.yml` — `npm ci && npm run
  build` 후 `actions/deploy-pages`. CI 는 사전 파이프라인을 안 돌리고 커밋된
  `public/dict`·`public/fonts` 를 그대로 씀
- [x] 저장소 Settings → Pages → Source "GitHub Actions" 설정 완료 (2026-09-06).
  main 푸시마다 자동 배포, `choan616.github.io/yomenai/` 접속 확인
- [x] **서비스 워커 + 오프라인** (2026-09-07) — mmtm(choan616.github.io 루트) SW 가 스코프 `/`
  로 `/yomenai/` 진입을 가로채 mmtm 셸이 뜨는 버그. `vite-plugin-pwa`(이미 devDep)를
  `vite.config.ts` 에 연결 — `registerType: 'autoUpdate'`, `injectRegister: 'script'`,
  `scope`·`start_url` `/yomenai/`. `/yomenai/sw.js` 가 더 좁은 스코프라 그 경로에선 이긴다.
  - 프리캐시 15개 9.4MB — 앱 셸 + 폰트 3종 + 핵심 사전(base 5.5MB·pairs·kanji·examples).
    `band4.json`(19MB, 밴드 4 = 선택)만 런타임 캐시(StaleWhileRevalidate). `maximumFileSizeToCacheInBytes` 6MB
  - `devOptions.enabled: false` — `npm run dev`·e2e 에는 SW 안 붙는다. CI 는 `dist/` 통째 배포라 워크플로 변경 없음
  - **검증: `vite preview` + Playwright — SW 스코프 `/yomenai/` 확인, 오프라인 리로드에서
    `読めない` 렌더 + "이번 세션 20장" + 세션 시작(安価)까지 콘솔 에러 0.
    `npm test` 325 · `npm run e2e` 7스펙 · `tsc -b`/`oxlint`/`vite build` 클린**

---

## 실사용 후속 (Phase 5 다듬기) ⏳ 열린 항목 1

- [x] 학습 기록 초기화 (2026-09-06) — 설정 화면 "학습 기록 초기화". 로컬 이벤트
  로그(`events.clear`) + Drive 백업 파일(`deleteSyncFiles`)을 한 동작으로 삭제.
  2단계 확인 후 실행, 완료 시 새로고침. 세션 중도 종료는 study-bar `✕` 로 이미 가능.
  **검증: `src/sync/sync.test.ts` +2 (resetLearning), `npm test` 28파일 254 통과, tsc/oxlint/build 클린**
- [x] 일본어 자간 축소 (2026-09-06) — `:lang(ja)` -0.02em, `.headword` -0.04em.
  Pretendard(한국어)는 현행 유지. 커밋 `7828112`
- [x] **학습 카드 UI 레이아웃 재구성** (2026-09-06) — 검사표(캡처 8장 + 결함 6건 +
  제안)를 만들어 승인받고 제안대로 구현. 커밋 `c4c0483`
  - 결정 3건: 자동 포커스 **유지** / 가운데 넘치면 **스크롤**(글자 축소는 자형 학습에
    해로움) / 예문은 **숙어 아래**
  - 골격 — `.study` 를 `100dvh`+`overflow:hidden` 으로 묶어 페이지 스크롤 제거,
    viewport 에 `interactive-widget=resizes-content`, `.card` 를
    head(고정)/body(가변·중앙·스크롤)/bottom(고정) 3단으로. 카드 4종 전부 적용
  - 죽은 공간(≈400px) 제거, 예문을 숙어 블록 안으로, `env(safe-area-inset-bottom)`
  - `answer-row` 를 `[보조][주][보조]` 3슬롯으로 통일 → '다음' 위치 불변.
    이지선다는 `.choice` 2등분
  - 피드백 색을 카드 전면 → 상단 띠, 밴드 태그를 확인 단계에도 유지
  - **검증: `npm test` 28파일 254 통과 · `npm run e2e` 4스펙 통과(카드 전환
    p95 15.1ms, 예산 150ms) · tsc/oxlint/build 클린 · 카드 8종 실화면 캡처 대조**
- [x] e2e `tts.spec.ts` 수정 — 읽기 피드백에서 `.reading-shown`(뜻 카드 전용)을
  기다려 **재구성 이전부터 실패하고 있던** 테스트. 루비(`.headword.has-ruby rt`)를
  보도록 고침. 체크리스트의 이전 "e2e 4스펙 통과" 기록은 낡은 것이었다
- [ ] **실기기 확인 필요(사용자)** — iOS Safari 에서 키보드를 올린 채 카드 3~4장
  연속 진행. 숙어·진행률 바 위치가 카드 간 변하지 않는지 육안 확인
- [x] **설정에 글자 크기** (2026-09-18) — 탭바·리포트·설정·찾기 등 셸 화면 텍스트
  3단(작게 0.9 / 기본 1 / 크게 1.2). `src/app/textScale.ts`(테마와 같은 패턴) +
  `src/index.css` `--ui-scale`(`data-text-scale` 로 override) + `screens.css` 의
  `font-size` 67곳을 `calc(원래값 * var(--ui-scale))` 로 감쌈. `study.css`(학습 카드)는
  손대지 않아 자동으로 대상에서 빠진다. 근거는 context-notes 같은 날 절
  (`rem` 통일 대신 `calc()` 개별 감싸기를 고른 이유 포함)
  **검증: `npm run build`(tsc+vite) 클린 · `oxlint` 클린 · `npm test` 508 통과 ·
  Playwright 실측 — tabbar 글자 13px→11.7px(작게)/15.6px(크게) 정확히 비례,
  학습 카드 `.headword` 는 크게 상태에서도 clamp 값(62.4px) 그대로 유지되어 경계 확인**

---

## 서비스화 판단 전 필수 (Phase 8) ⏳ 열린 항목 5

- [ ] 3개월 이상 실사용
- [ ] EDRDG에 CC BY-SA 승계 범위 문의
- [ ] stdict API 이용약관 확인
- [ ] 미검수(`verified=false`) 항목 전수 검수
- [ ] 이용약관·개인정보처리방침

---

## Phase 9 — 재미·디자인 (실사용 후 착수) ⏳ 열린 항목 1

실사용 소감이 "재미가 없다"였다. 원인 진단과 제안은 context-notes 2026-09-06 절.

- [x] 세션 종료를 리포트의 축소판으로 — `src/core/sessionSummary.ts` + `src/study/SessionSummary.tsx`.
  정답률·새 음독·주 오답 3칸 + 최근 세션 추이 막대 + "오늘의 발견" 한 줄.
  **검증: `sessionSummary.test.ts` 18 테스트 통과** + 실제 브라우저에서 20장 세션 완주
- [x] 리포트·요약 모션 + `prefers-reduced-motion` — PLAN §7 이 요구한 "셸·리포트는 느린 모션"이
  통째로 미구현이었다(앱 전체 `animation` 0개). `.report` 와 `.summary-screen` 에만 건다.
  **검증: 계산된 스타일 실측 — 기본 `fade-up` 0.46s, `reduce` 에서 0.01ms 로 접히고 최종 상태 유지**
- [x] 색 재정의 — 정답은 무채, 오답만 朱 하나. 배경은 회색-청 → 먹색.
  정답에 색을 주면 정답도 이벤트가 되어 "오답일 때만 멈춘다"(PLAN §7)가 무너진다.
  **검증: 실측 `--bg #141210` / `--ng #e8563c` / `--ok #a8a29b`**
- [x] 정답 직후 음독 메아리 — `src/core/echo.ts`. 정답 카드 아래 `圧 あつ 7번째 · 迫 はく 3번째`.
  전체 재생 없이 세션 시작 집계 + 이번 세션 누적으로 센다(150ms 예산). 탭 불필요.
  **검증: `echo.test.ts` 9 테스트 + 브라우저 실측 `圧 あつ 7번째 迫 はく 3번째`**
- [x] 재대결 세션 — `buildRematch`/`rematchCount`. 기한을 무시하고 예전에 틀린 읽기 카드만,
  오답 많은 순 → 최근 순. 홈에 건수와 함께 진입 버튼.
  **검증: `session.test.ts` 재대결 10 테스트 + 브라우저에서 17건 세션 완주**
- [x] 校正紙 루비 — `src/core/ruby.ts`. 정답 읽기를 한자 *위에* 얹는다(`<ruby>`).
  Phase 2 `decompose` 로 자리별 표면형을 뽑고, 분해 실패 시 숙어 전체에 하나.
  오답이면 루비가 朱, 정답이면 무채. **검증: `ruby.test.ts` 5 테스트 + 브라우저 `忠ちゅう実じつ`**
- [x] 検査票 마감(부분) — 리포트 구획 제목에 규칙선, 수치 `tabular-nums`
- [x] 리포트 정답률 결함 수정 — `totalWrong`(실제) / `totalMistakes`(분류됨) 분리,
  차이를 "유형을 못 붙인 오답 N회"로 화면에 노출. 정답률은 `totalWrong` 으로 계산.
  **검증: `report.test.ts` 10 테스트 + 브라우저 실측 — 같은 시나리오가
  "오답 0회 · 정답률 100%" → "오답 17회 · 정답률 0%"로 바로잡힘**

### Phase 9 2차 — 진단·세션 지루함 (제안서: scratchpad `tedium-proposal.html`, 2026-09-06)

실사용 소감: "한 번 할 때부터 지루함. 목적의식 없으면 금방 포기할 것 같음." 게임화는
안 함(앱 정체성 충돌 + 3개월 데이터 없이 설계하면 헛다리). 대신 관찰을 앞당기고 말투를
편한 해요체로. 마찰 5건·레버 4개는 제안서 참조. **결정 5건 답을 받은 뒤 착수.**

- [x] **9-A · 홈 갈림길 + 해요체 말투** (2026-09-06, 커밋 `7b4b489`)
  - 홈: 진단 전 "진입 진단 시작"이 큰 주 버튼, "세션 시작 · 진단 건너뛰기"가 보조.
    진단 후 "세션 시작"이 주. "진입 진단" 메뉴 줄은 제거(주 버튼으로 승격)
  - 해요체 전환 — 진단 프롬프트·결과, 세션 요약, "오늘의 발견" 5종, **리포트 전체**
    (사용자 결정: 리포트도 딱딱할 필요 없음), 빈/오답 안내, 설정 힌트.
    버튼 라벨·`mistakeLabels` 분류 라벨·`lang="ja"`·화면 제목("진단 완료" 등)은 유지.
    e2e 참조 문자열 보존
  - **검증: `npm test` 254 · `npm run e2e` 5스펙 통과(카드 전환 p95 14.9ms) · tsc/oxlint/build 클린**
- [x] **9-B · 적응형 진단** (2026-09-06, 커밋 `aeb067f`) — 90 → 3~24문항
  - `DIAGNOSTIC_PER_BAND` 30 → 12(상한만). `bandVerdict(seen, wrong)` 추가 —
    오답 3 → 진단 종료 / 8개+정답률 80% → 다음 밴드 / 12개 상한 → 다음 밴드
  - **결정 반영**: "뜻 알았나요?"(known) 단계 제거. 진단은 순수 읽기 검사, 뜻 질문은
    지연 검수로 미룸. 임계값은 초안대로(로그 보고 조정)
  - `advance(correct)` 가 밴드 누적으로 판정. 진행률을 "0 / 90" → "밴드 N · M번째"
  - `diagnosticSummary`/`firstShaky` 그대로 (seen 수만 작아짐)
  - **검증: `diagnostic.test.ts` +6(bandVerdict), `npm test` 260 · e2e 5스펙 통과
    (full-flow 13.3s → 3.8s) · 실측 — 전패 3문항 / 전부 안정 24문항 / 전형 ~13문항**
- [x] **9-C · 루프 안 관찰 + 설정 조절** (2026-09-06, 커밋 `4b6a9a0`)
  - `src/core/observe.ts` `observeReading(pairIds, before, sessionEvents, pairsOf)` —
    정답 직후, 이력 나빴던(오답 ≥ 2, 오답 > 정답) 음독 중 최악 하나.
    지금은 한 종류: `WEAK_ONYOMI_RECOVERED` "지난번엔 틀렸는데 이번엔 맞혔어요".
    echo 와 같은 계산 경로(재생 없음, 150ms 예산 무관)
  - 빈도 게이트 — `settings.observeLevel` 별 [최소 카드 간격, 세션당 상한]:
    off ∞/0 · **normal 6/4(기본)** · often 3/8. `useStudySession` 이 세션 시작 시 읽어 고정
  - **결정 반영**: 권장 기본값 + Settings 화면 "관찰 문구" 끔/보통/자주 (사용자 요청)
  - **검증: `observe.test.ts` 6 + `settings.test.ts` +1, `npm test` 267 · e2e 5스펙 통과
    (카드 전환 p95 15.0ms) · tsc/oxlint/build 클린 · 설정 화면 캡처**
- [x] **9-D · 세션의 형태** (2026-09-06, 커밋 `a1737cd`)
  - `src/study/SessionShape.tsx` — `ChapterTitle`(첫 카드 앞 1.2초 "이번 세션, N장이에요")
    + `MidNote`(절반 지점 1.8초 "절반 왔어요 · N/M · 정답 K")
  - `Study.tsx` — 마지막 3장(`total - index ≤ 3`)에 `.near-end`: count 에 "곧 끝 ·",
    진행률 accent 를 무채로 낮춤(색은 오답에만)
  - `progress.index` 로만 파생, `useStudySession` 에 새 상태 없음. 모션 셸 급(`fade-up`),
    `prefers-reduced-motion` 은 index.css 전역 규칙이 접음
  - **검증: `npm test` 267 · e2e 5스펙 통과(카드 전환 p95 15.4ms) · tsc/oxlint/build 클린 ·
    챕터/중반/마무리 3화면 실측 캡처**
- [x] **iOS 스탠드얼론 웹앱 대응** (2026-09-06, 커밋 `ac8166d`) — 홈 화면 웹앱에서
  나온 3건. context-notes 2026-09-06 절
  - 키보드 상단 밀림 — `interactive-widget=resizes-content` 는 iOS 미지원.
    `src/study/useViewportLock.ts`(visualViewport → `--vvh`, scrollTo(0,0), body overflow hidden).
    `.study`/`.diag` 가 `height: var(--vvh, 100dvh)`
  - 자동 포커스 무시 — standalone 은 제스처 밖 `focus()` 무시. `KanaInput` 을
    리마운트 안 하고(`key` 제거) `resetKey` 로 값만 비워 포커스 유지. `ReadingCard`
    재구성 — 피드백 중에도 KanaInput 마운트 유지(`readOnly`)
  - 일본어 IME 한자 변환 억제 — 입력창 `lang="ja"` → `"en"`, `inputMode="text"`.
    표시 가나는 `.kana-input { font-family: var(--font-ja) }`
  - **검증: e2e 세션 루프 입력 체크 `isVisible → (isVisible && isEditable)`,
    5스펙 통과(카드 전환 p95 15.7ms). `npm test` 267. iPhone 에뮬레이션 캡처**
- [ ] **9-E · 실기기 체감 확인 (사용자)** — 진단을 처음부터 끝까지. "벽" 느낌이
  줄었는지, 중간 관찰 한 줄이 소음인지 신호인지, 해요체가 과하지 않은지.
  iOS 스탠드얼론에서 키보드·포커스·IME 3건이 실제로 해결됐는지도. AI 가 대신 못 함

9-A~9-D + iOS 대응 완료(2026-09-06). 남은 건 9-E(실기기 체감, 사용자).

---

## Phase 10 — 수준과 처방 (2026-09-07) ⏳ 열린 항목 1

사용자 요청 3건. (1) 진단 리포트에서 내 수준이 시각적으로 드러날 것 (2) 앞으로 뭘
공부해야 하는지 알려줄 것 (3) 여전히 재미가 없음. 게임화는 계속 기각(Phase 9 절),
축은 "발견 → 행동"이다. context-notes 2026-09-07 「수준과 처방」 절 참조.

- [x] **10-A · 수준 사다리** — `src/core/level.ts` `buildLevel`
  - 전체 이벤트 로그의 밴드별 읽기 정답률. `diagnosticSummary` 를 그대로 재사용한다
    (그 함수는 진단 전용이 아니라 "밴드별 읽기 성적 접기"다)
  - `LEVEL_MIN_SEEN` 5 미만은 `thin`, `LEVEL_SOLID_RATE` 0.8 이상은 `solid`, 나머지 `shaky`.
    0.8 은 `bandVerdict` 의 `OK_RATE` 와 같은 값이어야 한다 — 다르면 진단이 통과시킨 밴드가
    리포트에서 흔들림으로 나온다
  - `solidThrough`(끊기지 않은 안정 구간의 끝) / `edge`(첫 흔들림 밴드)
  - 화면 — `Report.tsx` `LevelSection`. 밴드 사다리 + **경계선**(`.edge-line`) + `BAND_NOTE`
    로 JLPT 근사 병기 (PLAN §4: 라벨은 자체 밴드명, JLPT 는 설명에만)
  - **검증: `level.test.ts` 6 · 브라우저 실측 캡처에서 "밴드 1까지 안정, 밴드 2가 경계예요"
    + 경계선 1개 렌더 (밴드1 86% 무채 / 밴드2 57% 朱)**
- [x] **10-B · 처방 ("다음에 볼 것")** — `src/core/prescription.ts` `prescribe`
  - 우선순위 — 표본 부족(읽기 < 30회) → 지배적 오답 유형(전체 오답의 30% 이상) →
    파급력 큰 취약 음독 2개 → 경계 밴드. 최대 3개
  - 취약 음독 후보는 `report.weakOnyomi`(오답률 상위 8)를 쓰고 그 안에서 `unlocksOf`
    (그 음독을 쓰는 숙어 수)로 다시 세운다. 파급력만으로 전수 정렬하면 흔한 음독이
    오답률과 무관하게 늘 1등이 된다
  - `MISTAKE_ADVICE` (`src/study/mistakeLabels.ts`) — 오답 유형별 규칙 한 줄
    (촉음: ツ·チ·ク·キ 뒤 カ·サ·タ·ハ행 / 연탁: 라이먼의 법칙 / 혼독: 重箱·湯桶)
  - **검증: `prescription.test.ts` 7 · 캡처에서 公 こう(103개) → 文 ぶん(100개) → 밴드 2 순**
- [x] **10-C · 집중 세션** — `src/core/session.ts` `buildFocus`
  - 한 (한자, 음독) 쌍을 쓰는 숙어의 읽기 카드만. 재대결처럼 기한을 무시하고
    `selectSession` 을 안 탄다
  - 재대결과 다른 점 — **아직 안 본 숙어도 넣는다.** 처방이 "뚫으면 N개가 열린다"고
    말했으니 그 N 을 실제로 열어야 말이 맞는다
  - 정렬 — 틀린 적 있음 → 안 봄 → 맞히기만 함
  - 배선 — `SessionKind` 에 `'focus'` + `focusPairId`, `App` 에 `focus` 화면과 `focusPair` 상태,
    리포트 처방의 "이 음독만 모아 풀기" 버튼
  - **검증: `session.test.ts` +7 · `tests/e2e/focus-session.spec.ts` — 세션 3회로 취약 음독을
    쌓은 뒤 처방 버튼 클릭 → 뜨는 카드의 표제어가 전부 그 한자를 품는지 확인, 통과**
- [x] **총 검증** — `npm test` 267 → **290** (level 6 + prescription 7 + focus 7 + 기존 유지),
  `npm run e2e` 5 → **6스펙 통과**(카드 전환 p95 10.6ms, 예산 150), `tsc -b`/`oxlint`/`build` 클린
- [ ] **10-D · 실기기 체감 (사용자)** — 처방이 실제로 "다음에 이걸 하면 되겠다"로 읽히는지,
  집중 세션이 한 음독만 반복해서 지루하지 않은지, 경계선이 과장돼 보이지 않는지. AI 가 대신 못 함

---

## Phase 11 — 지속의 유인 + 대조 (2026-09-07) ⏳ 열린 항목 1

두 갈래를 사용자가 정한 순서대로 진행했다. **동기부여(예고 → 3장만 → 읽히는 문장)**는
"포기하지 않고 계속하게 하는 법"에 대한 답이고, **대조(오답 상세 → 집중 세션)**는
"반복만이 답이냐"에 대한 답이다. 게임화는 계속 안 한다.
context-notes 2026-09-07 「지속의 유인」·「대조」 절 참조.

- [x] **11-A · 예고 한 줄** — `src/core/nextUp.ts` + `SessionSummary`
  - 다음 세션을 실제로 한 번 짜서(`buildSession`) 가장 자주 나올 (한자, 음독) 쌍을 센다.
    짐작이 아니라 사실이라 예고가 빗나가지 않는다 — 제시 순서만 시드로 섞이고 *어떤*
    카드가 뽑히는지는 안 바뀌기 때문
  - 2회 미만이면 예고 안 함(`NEXTUP_MIN_COUNT`). 한 번 나오는 걸 예고하면 그냥 카드 목록이다
  - **검증: `nextUp.test.ts` 5 · 브라우저 캡처 "意 い 음독 — 다음 세션에 6번 나와요"**
- [x] **11-B · "3장만" 진입로** — `QUICK_SESSION_LIMIT` 3 + 홈 버튼 + `Study limit`
  - `LIMIT_MIN`(5) 아래라 설정으로는 못 만드는 값이고 그게 의도다. 설정을 안 건드리므로
    다음 세션은 원래 길이로 돌아온다
  - `useStudySession` 시그니처를 옵션 객체로 (`{kind, focusPairId, limit}`) —
    위치 인자 3개는 `useStudySession('normal', undefined, 3)` 이 된다
  - **검증: `full-flow.spec.ts` 에 3장 세션 완주 구간 추가 — 진행률이 `/ 3` 인지,
    끝난 뒤 홈이 원래 상태로 돌아오는지**
- [x] **11-C · 읽히는 문장** — `src/core/readable.ts` + `SessionSummary`
  - 오늘 읽기를 맞힌 숙어의 Tatoeba 예문 중 **가장 짧은 것** 하나. 짧을수록 "읽혔다"가
    분명하고 끝까지 읽기 전에 포기하지 않는다. 문장 안의 그 숙어만 굵게
  - 보상을 점수가 아니라 **실제로 읽히는 경험**으로 준다 (PLAN §0 포지셔닝)
  - **검증: `readable.test.ts` 6 · 캡처 "犬は忠実です。" (忠実 강조)**
- [x] **11-D · 대조 쌍 (오답 상세)** — `src/core/surface.ts` + `contrastGroups` + `MistakeDetail`
  - `surfaceOfPair` — 그 쌍이 이 숙어에서 실제로 낸 소리. `decompose`(Phase 2) 재사용
  - 같은 음독을 쓰는 숙어를 **표면형별로 갈라** 최대 2군. 지금 틀린 숙어가 속한 군이 먼저
  - `MISTAKE_ADVICE` 해설을 대조 **바로 위**에 놓되 `RULE_MISTAKES`(촉음·연탁·장음·혼독)
    에만. 음독 선택·한국음 간섭은 규칙이 없어 해설이 글만 늘린다
  - 훑는 숙어는 `CONTRAST_SCAN_LIMIT` 40 으로 상한 — 흔한 음독은 100개가 넘어 분해 비용이 커진다
  - **검증: `mistakeDetail.test.ts` +6 · 캡처(圧迫) — 圧 あっ(圧迫·圧巻·圧殺) ↔ あつ(圧延·圧力),
    迫 ぱく(圧迫·緊迫·切迫) ↔ はく(気迫·脅迫·迫害)**
- [x] **11-E · 대조 세션** — `buildFocus` 에 `surfaceOf` + `interleaveBySurface`
  - 표면형 그룹 사이를 번갈아 낸다. **자르기 전에** 섞으므로 짧은 세션에도 양쪽이 들어온다
  - 그룹이 하나뿐이면 순서를 안 흔든다 — 대조할 게 없는데 정렬만 깨지 않는다
  - **검증: `session.test.ts` +4**
- [x] **버그 — 짧은 화면에서 요약 통계 값이 잘렸다.** 요약이 길어져 flex 항목이 줄면서
  `.summary-stats` 의 `overflow:hidden` 이 `dd` 를 잘라 라벨만 남았다. `.summary-screen` 에
  `overflow-y:auto` + `justify-content: safe center` + 자식 `flex-shrink: 0`.
  **검증: 390×620 캡처에서 100% / 27 / 없음 정상 표시, 제목 안 잘림, 홈으로 도달 가능**
- [x] **총 검증** — `npm test` 290 → **316**, `npm run e2e` 6스펙 통과(카드 전환 p95 10.3ms),
  `tsc -b`/`oxlint`/`build` 클린
- [x] **진단 진입점이 동기화를 못 따라갔다** (2026-09-07, 사용자 보고) —
  `yomenai:diagnosticDone` 이 localStorage 라 기기를 안 넘어간다. context-notes 같은 날 절
  - `shouldOfferDiagnostic(done, level)` — 플래그가 없어도 `buildLevel` 판정이 섰으면 안 권한다
  - 반대 방향도 같이 — `resetLearning` 이 플래그를 안 지워 초기화 뒤 진단이 영영 안 떴다.
    `clearDiagnosticDone()` 추가
  - 딸려 온 변화 — 진단을 건너뛰고 세션만 해도 진입점이 사라진다 (의도한 결과, 감시 대상)
  - **검증: `diagnostic-state.test.ts` 5 · `tests/e2e/diagnostic-flag.spec.ts` —
    처음엔 뜨고 → 세션 뒤엔 안 뜨고 → localStorage 를 비워도 안 뜨고 → 초기화 뒤엔 다시 뜬다.
    `npm test` 316 → 321, `npm run e2e` 6 → 7스펙 통과**
- [ ] **11-F · 실기기 체감 (사용자)** — 예고가 궁금증인지 소음인지, "3장만"을 실제로 누르게
  되는지, 읽히는 문장이 보상으로 느껴지는지, 요약 3블록이 대시보드로 읽히지 않는지.
  대조가 규칙을 눈에 들어오게 하는지. AI 가 대신 못 함

---

## Phase 12 — 사전 파생물 검증 (미착수, 2026-09-07 기록) ✅

**착수 전에 context-notes 2026-09-07 「신뢰도는 층마다 다르다」 절을 먼저 읽는다.**
감수 범위를 한 번 좁힌 이력이 있어서, 그 근거를 모르면 도로 넓히게 된다.

**감수 대상이 아닌 것 (사전 그대로라 사람이 볼 필요 없음)** — 표제어·읽기·품사·빈도
(JMdict), 한자별 음훈독·한국 한자음(KANJIDIC2). 밴드도 제외 — nf 빈도 순위라 객관적이고,
체감 난이도 교정은 감수보다 실사용 로그가 낫다.

- [x] **12-A · 사람이 만든 판정을 추적한다 (gitignore 예외)** (2026-09-07, 커밋 `0fcccb8`)
  - `data/dict/` 통째 무시 → `data/dict/*` + 예외. 디렉터리 무시로는 `!` 예외가 안 먹는다
  - `!*-review.tsv` `!*-review-sample.tsv` `!*-worklist*.tsv` `!*-overrides.json`
  - LLM 초벌(`korean-llm-draft.tsv`)은 재생성 가능이라 스코프 밖 (context-notes 같은 날 절)
  - **검증 통과: `git ls-files data/dict` = 검수 4파일. `build:bands`·`build:onyomi` 재실행 후
    `git status` 에 산출물 안 뜸**
- [x] **12-B · JmdictFurigana 대조 (사람 0명)** (2026-09-07)
  - `data/raw/JmdictFurigana.json` (release 2.3.1+2026-08-25, 236,255개, UTF-8 BOM).
    `tools/measure-furigana.ts` — 내부 경계 오프셋 집합 대조, 산출물 안 남김
  - **조인 98.16%** (JF 전체 75.7%보다 높다 — 상용한자 한자-only) · 경계 비교 가능 102,410 ·
    **완전 일치 99.45%** · 우리가 더 촘촘 0.55% · **충돌 0** · JF 는 풀고 우리는 실패 2,430
  - 육안 — `our_fail` 밴드 0~3 185건 전량 全部 熟字訓·当て字·특수독(버그 0). `our_finer` 밴드 0~3
    16건은 連声 정답 or 熟字訓 과분할. **경계 위치가 어긋난 사례 0건** — 「신뢰도는 층마다 다르다」의
    걱정이 반증됨. context-notes 같은 날 절에 수치 기록
- [x] **12-C · 熟字訓 과분할 거부 (범위 변경)** (2026-09-07) — 충돌 0건이라 원안(불일치 검수
  워크리스트)은 폐기하고, "우리가 JF 보다 잘게 자른 562건" 중 **JF 가 묶은 다자 구간에 음운 변형이
  하나도 없는" 것**을 熟字訓·当て字 로 거부하도록 바꿨다
  - `tools/build-decomp-overrides.ts` → `data/dict/decomp-overrides.json` (커밋, 12-A 예외).
    규칙 — JF 가 rt 로 2자+ 를 묶었고 그 구간 세그먼트에 `variants`(連濁·連声·促音·半濁) 가 없으면 거부.
    天皇 てん\|皇のう(連声) 처럼 음운 파생 분해는 태그가 있어 살아남고, 部屋→べ\|や·如雨露(当て字) 는 거부됨
  - **거부 103건 — 밴드 0:2 1:3 2:0 3:6 4:92.** 밴드 0~3 은 11건뿐 (一人·二人·上手·波止場·早乙女·
    相部屋·大部屋·一人{娘,言,子,一人}). 밴드 4 는 一人〜/二人〜/〜部屋/〜上手 잡음
  - `build-onyomi-map.ts` — `buildMap(idioms, kanji, rejectIds?)`, 실패 사유 `JUKUJIKUN` 추가.
    파일 없으면(CI·JF 미다운로드) 빈 집합. `--validate` 로 드리프트 검사
  - 파생 — `ok` 102,549 → 102,446, 고유 쌍 4,001 → 3,936 (人:kun:り 등 65쌍이 그 103건에만 있었음).
    `build:runtime-dict` 재실행 → base 16,970 → 16,959, band4 −92, pairs.json 갱신
  - **검증: `build-onyomi-map.test.ts` +1 (거부 103·밴드0~3 11), 스냅샷 갱신. `npm test` 325 ·
    `npm run e2e` 7스펙(카드 전환 p95 10.6ms) · `tsc -b`/`oxlint`/`vite build` 클린 · `--validate` 통과**
- [x] **12-B 부수** — `package.json` 에 `measure:furigana`·`build:decomp-overrides` 스크립트 등록
  - `tools/build-decomp-worklist.ts` → `data/dict/decomp-worklist.tsv`.
    Phase 3 의 `build-review-worklist.ts` → `apply-korean-review.ts` 골격을 그대로 쓴다
  - 열 — `id headword reading band segmentation cost margin alt verdict note`.
    `segmentation` 은 `発=はっ(はつ,음) 達=たつ(たつ,음)` 처럼 사람이 읽을 수 있게 펼친다
  - **`verdict` 는 경계만 적게 한다** (`はっ|たつ`). 자유 서술은 파싱이 안 되고,
    원형은 경계에서 도구가 역산할 수 있다
  - 표본 — 불일치분 전량 + **일치분에서 무작위 대조군 60**. 대조군이 없으면 "불일치 층
    오류율 12%"가 전체 오류율인지 최악 구간인지 해석할 수 없다
  - `tools/apply-decomp-review.ts` → 층별 오류율 리포트 + `data/dict/decomp-overrides.json`.
    `build-onyomi-map.ts` 가 override 를 알고리즘보다 우선 적용 (Phase 3 의
    "사람 verdict > 초벌 > 잠정값" 과 같은 규칙)
  - `--validate` 모드 — 채워진 verdict 로 알고리즘 정확도를 재측정. 비용 함수를 손볼 때마다
    회귀 확인이 된다
  - **검증: override 반영 후 `build:onyomi` 재실행 → `build-onyomi-map.test.ts` 통과
    (순환 없음·표면형 복원), `--validate` 정확도 수치 기록**
- [~] **12-D · 한국어 뜻 — stdict 대조에서 영어 gloss 번역으로 전환 (2026-09-07 방향 변경)**
  - **왜 바꾸나** — 애초에 stdict(한국어 사전)를 거친 건 "일한사전 데이터셋이 없어서"였다.
    그런데 stdict 는 *한국어 단어* 를 정의한 거라 (1) 동형이의에서 틀린 뜻을 보여주고
    (大丈夫→"건장한 사내", 経済→"세상을 다스림", 架空→"공중에 가설") (2) 백과사전식이라
    카드에 안 맞고 (亜鉛 100단어) (3) 일본고유(category 3) ~3,600건엔 아예 없다.
    → **JMdict 영어 gloss 를 한국어로 옮겨 `koMeaning` 을 다시 만든다.** 분류 파이프라인
    (`match-korean`·category·classSource·Phase 3 수동 355건)은 안 건드린다 — 뜻 텍스트만 교체
  - **모델 선정** (30개 라벨링 표본 비교) — `gemma4:latest` 채택. 깔끔 ~26/30, 건당 584ms
    (17k → ~3h). qwen3.5 정확하나 12s/건(57h, 탈락), qwen3:8b 출력 붕괴(цин크·서브스피시즈, 탈락).
    Phase 3 에서 gemma4:26b 가 *분류* 로 붕괴했던 것과 달리 작은 gemma4:latest 는 *번역* 에선 절제됨
  - **[x] `tools/build-korean-meaning.ts`** (`build:korean-meaning`, 커밋 `48bfe36`) — `gemma4:latest`
    + few-shot 5 → `data/dict/korean-meaning.json`. `.korean-meaning-cache.json` 재개, 품질 플래그
  - **[x] 전량 번역 실행** (2026-09-07, ~110분) — 17,217개. **플래그 131개(0.76%)만** —
    kanji 86(대개 괄호 병기라 良性: "영한(英和)") / latin 37(인코딩 깨짐 `<0x..>`: "완벽히 <0xEC>..앎") /
    many-senses 6 / kana 2 / error 1(浮遊). 전부 워크리스트 T2 로 감
  - **[x] `koMeaning` 스키마** (커밋 `48bfe36`) — `word`/`origin` 제거, `{definition, glossEn?, source, verified}`,
    `source: 'stdict'|'llm'|'manual'`. `load.ts`·`MeaningCard.tsx`·`build-runtime-dict.ts`·`apply-korean-review.ts`
  - **[x] 재적용·재배포** (커밋 `f35cdc2`) — `apply:korean-review --trust-llm` → `build:runtime-dict`.
    base.json koMeaning ~13,448 → **16,955/16,959** (source=llm). **category 3(일본고유) 3,510개에 처음으로 뜻**.
    大丈夫→"괜찮음; 문제없음", 経済→"경제; 재정" 등 stdict 오류 해소
  - **[x] 워크리스트 v2** (`48bfe36` 도구, `f35cdc2` 데이터) — glossEn + llm_ko + stdict_def +
    Phase 3 manual_verdict/reason 병기. 180행(tier별 30). T1 수동·동형이의 298 / T2 깨진번역 125 /
    T3 수동 252 / T4 동형이의 7,014 / T5 일본고유 3,499 / T6 동형동의 6,025.
    verdict `o`/`x`/`~`/`s`(stdict 채택), `cat` 교정, `manual≠category` 플래그
  - **[x] `tools/apply-korean-meaning.ts`** (`48bfe36`) — 워크리스트 verdict → `korean-class.json` 반영, `--validate`.
    `korean-meaning-worklist*.tsv` 여러 파일에서 verdict 병합
  - **[x] 검수 목록 노출** (2026-09-07) — 깨진 번역을 앱에서 안 가린다(수정 확인용, 사용자 요청).
    대신 `build:korean-meaning-worklist -- --flagged` → `korean-meaning-worklist-flagged.tsv`
    (플래그 붙은 행 191 = 번역 품질 131 + 분류 불일치 60, 표본 없이 전량). 도구가 플래그별
    분해도 출력. 앱은 `미검수` 뱃지 그대로 (`verified:false` 는 텍스트를 가리지 않는다)
  - **[~] 실제 검수** (사람) — 표본(tier별 50, 300행) 완료. `apply:korean-meaning --validate`
    손댄 비율 T1 12/T3 7/T4 13/T5·T6 20%. tier 4~6(~16,500건)은 PLAN대로 보류, 세션마다 조금씩
  - **검수 진행** — 배치 20 까지 반영 (2026-09-14, 커밋 `6151e72`). 배치 19·20 은 80건 전부 `o`,
    그중 16건이 인라인 수정(裏腹·立憲·離陸·留守番 등). **`koMeaning.verified` 누계 1,228**.
    순서는 `apply:korean-meaning` → `build:runtime-dict` 다 — apply 를 빼먹으면 사전을 다시 빌드해도
    검수가 안 들어간다 (2026-09-14 실제로 빠뜨렸다)
  - **인라인 수정은 `fix` 칸이 아니라 `llm_ko` 칸에서도 온다** — 워크리스트의 `llm_ko` 를 직접 고치고
    `verdict` 만 찍으면 그것이 수정으로 잡힌다 (`apply-korean-meaning.ts` 의 `inlineFix`).
    `fix` 칸만 보고 "문구 변화 없음" 이라 판단하면 틀린다
  - (이전) 배치 18 반영 (2026-09-11, 커밋 `761a2c4`). 배치 18은 40건 중 인라인 수정 1(力投).
    모수 정정 (2026-09-12) — **일본고유 826/3,510, 배포되는 verified 1,123**.
    이전 수치(847/3,643 · 1,148)는 런타임에 안 나가는 숙어를 포함한 값이었다
  - **[x] 검수 목록을 배포 코퍼스로 거른다** (2026-09-12) — `build-korean-meaning-worklist` 가
    `onyomi-map.json` 에 없는 숙어를 뺀다. `build-runtime-dict` 가 안 싣는 숙어(熟字訓 거부 103 ·
    카타카나 읽기 · 파싱 실패)라 검수해도 앱에 안 보인다
  - 이미 새어 나간 25건 — 河童·部屋·二人·風邪·弥生 등 12-C 가 거부한 熟字訓. 판정은 남겨 둔다
    (12-C 판정이 뒤집히면 그대로 살아난다). 앞으로 배치에 섞였을 233건을 막았다
  - 이미 verdict 를 채운 행은 코퍼스 밖이어도 파일에 남긴다 — 파일을 다시 쓸 때 사람 판정이 날아가면 안 된다
  - 배치 진행률의 모수에도 같은 필터를 건다. 안 그러면 "남은 건수"가 영원히 안 줄어드는 꼬리를 단다
  - **검증: `--sample=50` 재생성 시 249건 제외, 기존 300행 파일은 바이트 동일(`git diff` 없음).
    `--batch --category=3` 40행 전부 onyomi-map 안(0건 밖), 모수 3,643→3,510 · 검수 847→826.
    `npm test` 342 · tools tsc/`oxlint` 클린**
  - **[x] 조금씩 검수 도구** (2026-09-08) — `build:korean-meaning-worklist --batch [--category=1|2|3]`
    아직 verdict 없는 다음 N건(기본 40)만 `korean-meaning-worklist-batch-NN.tsv` 로. 배치 간 중복 0,
    `apply:korean-meaning` 이 batch 파일 자동 병합. `npm run view:jp-unique` → 일본고유 확인용 HTML
  - **[구버전 폐기]** stdict 기반 `koMeaning` + 워크리스트 v1. `korean-meaning.json`·
    `.korean-meaning-cache.json` 은 gitignore(재생성 가능, `korean-llm-draft.tsv` 와 같은 취급)
- [x] **12-E · `MISTAKE_ADVICE` 문헌 대조** (2026-09-07) — `RULE_MISTAKES` 4종 대상
  (ONYOMI_CHOICE·KO_INTERFERENCE 는 규칙 주장이 아님, OKURIGANA 미사용)
  - **RENDAKU** — 연탁 + 라이먼의 법칙, 정확. 예시 三日月 코퍼스 존재, `decompose` 도 `rendaku` 태그. 수정 없음
  - **SOKUON** — C1(ツチクキ)은 맞으나 C2 목록이 과했다. -k/-t 운미 비대칭 (ク·キ+サ행은 대개
    촉음 안 붙음: 国際·学生). → `mistakeLabels.ts` 수정 — C2 를 カ·タ·ハ행으로 좁히고 ク·キ+サ행 예외 명시.
    예시 発達·学校·国際 코퍼스 확인
  - **CHOON** — 규칙 서술 정확(장모음은 어휘 고정, 한국어에 음소적 길이 없음). 2026-09-08:
    분류기가 장음 누락·첨가를 다 CHOON 으로 내므로 안내도 양방향으로 고치고("빠뜨리거나 特徴 /
    없어야 할 자리에 붙이는 健保") 미검증 빈도 주장("가장 잦아요")은 제거. 예시 特徴·健保 코퍼스 존재
  - **MIXED_READING** — 重箱読み/湯桶読み 용어 자체가 실례라 정확. 단 湯桶은 桶이 표외자라
    코퍼스 밖(重箱은 있음). 텍스트 유지, context-notes 에 기록
  - **검증 통과: 근거 문헌 context-notes 2026-09-07 「Phase 12-E」 절, 예시 6개 전부 코퍼스 대조
    (湯桶만 부재, 이유 기록). `tsc -b`/`oxlint` 클린, `npm test` 325 유지**

## 확장 후보 → 별도 앱으로 분리 (사용자 결정 2026-09-07) ✅

**뿌리는 같지만 다른 학습 내용이라 yomenai 스코프 밖으로 뺀다.** yomenai 는 음독 교정
(뜻은 아는데 못 읽는 한자어)에 집중하고, 아래는 각각 별도 앱으로 만든다. 인프라는 공유
(사전 파이프라인·FSRS 코어·로컬 우선 PWA·동기화·진단 리포트 디자인·CJK 폰트 처리).
context-notes 2026-09-07 「별도 앱으로 분리」 절, PLAN §0 참조.

- **앱 B — 오쿠리가나 학습** (동사·형용사 활용형). 코퍼스 = 한자+가나 표제어,
  학습 축 = 어느 훈독 + 오쿠리가나 경계. 검증은 JmdictFurigana 로 (12-B 방식)
- **앱 C — 의성어·의태어 + 형용사·부사 학습**. 가나 표기 어휘 중심, 뜻·뉘앙스 축
- yomenai 에 남는 것 — `OKURIGANA` enum 슬롯은 그대로 둔다(append-only 로그, 제거가 더 churn).
  yomenai 안에서 쓸 일은 거의 없어졌지만 비용 0

기존 후보 항목(코퍼스 필터 완화 / 훈독 모드 분리 / 훈독 오답 버킷)은 앱 B 로 이관.

---

## 오답 상세 다듬기 (2026-09-09, 실사용 지적) ⏳ 열린 항목 1

- [x] **닫기 바가 내용을 가림 / 둘째 한자부터 잘림** — `.mistake-detail` 이 `.card` 3분할을
  물려받아 좁은 화면에서 스크롤 창이 ~310px 였다. 오버레이 전체를 한 덩어리로 스크롤,
  헤더·닫기 바를 불투명 sticky 로 고정. `src/study/study.css` 만 수정. 커밋 `22336e0`.
  **검증: `npm test` 325 · `npm run e2e` 8스펙(카드 전환 p95 11.2ms) · 폰/짧은창 캡처 대조**
- [x] **한국음(kr)이 옛 음·오염 음을 그대로 노출** (大→대·다·태, 医→예·의) — KANJIDIC
  `korean_h` 무가공 통과. context-notes 2026-09-09 절
  - `tools/audit-korean-readings.ts` (`npm run audit:korean-readings`) — Phase 3
    `.korean-cache.json` stdict 표제어를 위치 정렬해 "현대 어휘에 쓰이는 음" 을 가려냄.
    두음법칙 정규화 + jis208 결손 이체자 보충. 코퍼스 한자 263자(kr 2+) 중 old 후보 205자
  - **"삭제" 아님** (사용자 지적 — 안 쓰인다 ≠ 틀렸다). `now`(지금 쓰는 음) / `old`(옛·드문 음)
    으로 갈라 화면에서 old 를 "옛 음" 으로 접는다. 정보 손실 0
  - 배선 완료 (커밋 `bb62da0`) — `apply-korean-readings.ts`(review TSV → `korean-reading-overrides.json`),
    `build-runtime-dict.ts`(override 있으면 `kr:now`/`krOld:old`, 없으면 현행), `KanjiInfo.krOld`,
    `BreakdownPart.krOld`, `MistakeDetail.tsx` "옛 음" 흐리게, `.md-kr-old` 스타일
  - **override 파일 없으면 앱 동작 그대로** — `public/dict/kanji.json` 전 한자 `kr` 불변, `krOld:[]`
  - **검증: `npm test` 325 · `tsc -b`/tools tsc/oxlint/build 클린 · 임시 override 로 e2e 캡처
    (圧縮 → "한국음 압 · 옛 음 엽" 흐리게 렌더) 확인 후 임시본 제거**
  - [ ] **미완 — 205자 검수** (`data/dict/korean-reading-review.tsv` now/old 열). 亀 균(龜裂),
    斉 제(一斉) 같은 예외 있음. 검수 후 `apply:korean-readings` + `build:runtime-dict`

---

## Drive 동기화 파일 정리 (2026-09-11, 사용자 관찰) ⏳ 열린 항목 1

- [x] **원인 확인** — 동기화마다 쌓이는 게 아니라 개발 기간 deviceId 잔해 9개가 안 지워진
  것. 오늘 갱신된 파일은 하나뿐. context-notes 같은 날 절
- [x] **`consolidateSyncFiles(db, deviceId, drive?)`** — 내 파일을 뺀 `reviews-*.json` 을
  `reviews-archive.json` 하나로 합치고 원본 삭제. 업로드 후 삭제 순서 고정.
  `DriveClient.deleteFile(fileId)` 추가
  **검증: `npm test` 329(`sync.test.ts` 6→10) · `tsc -b`/`oxlint` 클린**
- [x] **설정 > 백업 "옛 기기 파일 정리"** — 2단 확인, 결과를 hint 로 표시
- [x] **동기화 진행 막대** (2026-09-11) — `syncNow` 4번째 인자 `onProgress`.
  단계 = 업로드 1 + 목록 1 + 파일 n, 파일 수는 목록을 받아야 알아서 그전 `total` 은 잠정 2.
  설정 > 백업에서 `<progress>` + "백업 내려받는 중 1/2" 표시
  **검증: `npm test` 331(`sync.test.ts` 10→12) · `tsc -b`/`lint`/`build` 클린**
- [x] **재대결 선별 — 가중 무작위 + 극복 카드 제외** (2026-09-11, 사용자 지적)
  결정적 정렬 + 상위 N 절단이라 매번 같은 문제가 나왔다. 오답 수를 가중치로 둔 무작위
  추출(`pickWeighted`, `rand` 주입)로 바꾸고, `CardState.streak` 을 추가해 마지막 오답
  이후 2연속 정답이면 후보에서 뺀다. `rematchCount` 도 같은 술어
  **검증: `npm test` 333(`session.test.ts` 36→39, 가중치 3:2:1 · 조합 변화 · 극복/재발) ·
  `tsc -b`/`lint`/`build` 클린**
- [ ] **실기기 확인 필요(사용자)** — 배포판에서 정리 실행 → Drive 파일 11개가
  `reviews-b1dc6cae….json` + `reviews-archive.json` 2개로 줄고, 이후 동기화에서
  기록 수가 그대로인지

---

## 훑어보기 — 리포트에서 자주 틀린 숙어 다시 보기 (2026-09-12, 사용자 요청) ✅

**"계속 퀴즈처럼 문제만 풀다보니 피로하다."** 화면이 전부 출제·채점 루프였다
(진단·세션·3장만·재대결·집중). 채점 없이 보기만 하는 자리를 리포트 안에 만든다.

- [x] **`frequentIdioms`** — **한 번이라도 틀린 읽기 카드**(`wrong > 0`), 상한 `BROWSE_N`.
  순서는 오답 많은 순 → 최근에 본 순 → id
  - **재대결과 달리 극복한 카드(`streak`)를 안 뺀다** — 출제가 아니라 노출이라
    최근에 맞힌 것도 다시 보는 게 이득이다. context-notes 같은 날 절
  - **상한 12 → 30** (2026-09-12, 사용자 요청 "카드를 좀 늘려줘").
    틀린 적 없는 카드를 넣는 안은 사용자가 기각 — 넘길 카드는 상한으로 늘리지
    기준을 흐려서 늘리지 않는다
  - [x] **`pickBrowse` — 오답 수 가중 무작위** (2026-09-12, 사용자 요청 "섞여서 노출").
    결정적 정렬 + 앞에서 자르기면 들어갈 때마다 같은 카드가 같은 순서로 나온다.
    자주 틀린 것이 더 자주·앞쪽에 나오되 조합과 순서가 매번 달라진다.
    9/11 재대결(`buildRematch`)과 같은 처방이라 `pickWeighted` 를 `src/core/pick.ts` 로
    빼서 둘이 같이 쓴다
  - `frequentIdioms` 는 상한 없이 **후보 전량**을 id 순으로 낸다. 자르는 건 `pickBrowse` 몫.
    뽑기 전 입력 순서를 고정해야 기기 간 이벤트 병합 순서에 결과가 안 휘둘린다
- [x] **카드 화면 `src/app/Browse.tsx`** (2026-09-12, 사용자 결정 — 목록 아님) — 세션과 같은
  `.card` 셸에 한 장씩. 한자어 · 읽기 · 뜻 · 소리 듣기(TTS) · Tatoeba 예문 2개 + ‹이전/다음›.
  진행 막대는 `n / 12`
  - **이벤트를 안 쓴다. FSRS 도 안 건드린다** — 보기만 하는 화면이다
  - 리포트엔 진입 버튼 하나만 (`.browse-entry`). 처음 만든 아코디언 목록은 걷어냈다
  - 나가면 홈이 아니라 **리포트로** 돌아간다. 리포트에서만 들어오는 화면이다
  - 목록 계산은 `frequentIdioms` 로 빼서 리포트와 카드 화면이 같은 기준을 쓴다
  - 예문은 목록과 같이 받는다 — 카드를 넘길 때마다 기다리면 넘기는 맛이 죽는다
  - 뜻은 뜻 카드의 `.meaning` 을 그대로 쓴다 (새 클래스를 안 만든다)
  - **리포트 섹션이 6개가 되면서 stagger 지연 규칙에 `nth-of-type(6)` 을 보탰다** —
    안 보태면 마지막 섹션이 지연 0 으로 4·5번보다 먼저 뜬다
- [x] **검증: `report.test.ts` 10→16 (정렬·뜻 카드 제외·이름 없는 숙어 제외·극복 카드 포함·
  동점 id 순·`BROWSE_N` 절단). `tests/e2e/report-browse.spec.ts` —
  진입 버튼 → 카드 화면 → 첫 장 이전 잠김 · 넘기면 표제어·카운트 변경 · 되돌아오면 첫 장 ·
  예문 존재 · 출제 요소(`.kana-input`·채점 버튼) 부재 · 나가면 리포트.
  `npm test` 348 · `npm run e2e` 9스펙 · `tsc -b`/`oxlint`/`vite build` 클린 · 캡처 대조**

---

## 한국어 뜻 구분자 — 세미콜론을 쉼표로 (2026-09-12, 사용자 요청) ✅

- [x] **`tools/lib/meaning.ts` `normalizeDefinition`** — `;` 를 `, ` 로 통일.
  붙여 쓴 `;`, 구분자 뒤 홀로 남은 마침표, 끝에 매달린 구분자까지 정리
- [x] **반영 시점에 고친다** — `apply-korean-review`(llm·stdict 정의)와
  `apply-korean-meaning`(사람이 고친 정의·stdict 채택)에서 통과시킨다.
  원본 `korean-meaning.json` 은 안 건드린다 (재생성 가능한 중간 산출물)
- [x] **`translate-gloss` 프롬프트도 쉼표로** — 앞으로 번역하는 것부터 맞는다.
  이미 만든 17,000여 건을 다시 돌리지 않는다 (~110분)
- [x] **`sameText` 비교** — 워크리스트의 `llm_ko` 는 옛 `;` 표기라, 구분자를 맞춰
  비교하지 않으면 *사람이 고친 값* 으로 오인돼 검수분이 통째로 `source: manual` 로 뒤집힌다
- **검증: `meaning.test.ts` 7 테스트. 파이프라인 재실행
  (`apply:korean-review --trust-llm` → `apply:korean-meaning` → `build:runtime-dict`) 후
  이전 `korean-class.json` 과 전량 대조 — **구분자 말고 달라진 뜻 0건**, verified 1,148 유지,
  분류 분포 동일. `base.json` `;` 0건 / 쉼표 9,110건. band4·kanji·pairs·examples 는
  `_meta` 외 동일. 앱 캡처로 "저렴함, 값싼" 렌더 확인. `npm test` 360**

---

## 동기화 파일 자동 정리 (2026-09-12, 사용자 요청) ✅

새 브라우저·프로파일마다 `deviceId` 가 새로 생기는 건 막을 수 없다 — `localStorage` 는
브라우저 경계를 못 넘는다. 생기는 걸 막는 대신 **쌓인 걸 자동으로 접는다.**

- [x] **`DriveFileMeta.modifiedTime`** — Drive 목록 쿼리에 `modifiedTime` 을 실었다.
  죽은 파일과 살아 있는 기기를 가르는 유일한 신호다
- [x] **`STALE_DAYS`(30) · `staleBefore` · `isStale`** — 30일 넘게 안 갱신된 기기 파일만
  죽은 것으로 본다. 살아 있는 파일까지 접으면 그 기기가 다음 동기화에서 자기 파일을
  다시 만들어 **지웠다 올렸다를 반복**한다
- [x] **`syncNow` 가 내려받기 뒤에 자동 정리** — 죽은 파일이 있을 때만 한 단계를 더 돈다.
  진행 막대에 `consolidate` 단계 추가, `SyncResult.consolidated` 로 결과 반환
- [x] **`consolidateSyncFiles(..., { olderThan })`** — 옵션이 있으면 그보다 오래된 것만,
  없으면 내 것 말고 전부. 설정 화면의 수동 버튼은 기존 동작 그대로
- [x] **보관 파일은 오래돼도 안 지운다.** `modifiedTime` 을 못 읽으면 죽지 않은 것으로 본다 —
  판단이 안 서면 지우지 않는 쪽이 안전하다
- [x] 정리가 돌면 설정 화면에 알린다 — Drive 파일이 줄어든 이유를 조용히 넘기지 않는다
- **검증: `sync.test.ts` 12 → 18 (죽은 것만 접음 · 기록은 보관 파일과 로컬에 남음 ·
  죽은 게 없으면 안 돎(churn 없음) · 보관 파일 보호 · 진행 보고 단계 · 수동 정리는 시각 무시).
  `npm test` 366 · `tsc -b`/`oxlint` 클린**

- [x] **캐러셀로 넘기기** (2026-09-12, 사용자 요청 — 손수 짠 스와이프에서 갈아탐)
  - 모든 장을 한 트랙에 깔고 `scroll-snap-type: x mandatory` + `scroll-snap-align: center`.
    손가락을 따라 오는 움직임·관성·스냅을 브라우저가 한다
  - `Browse.tsx` 가 하는 일은 둘 — `onScroll` 에서 `scrollLeft / clientWidth` 를 반올림해
    머리말(`n / 총`)에 반영하고, ‹이전/다음› 버튼이 `scrollTo({ behavior: 'smooth' })` 로
    트랙을 미는 것
  - **`src/study/swipe.ts` 와 `swipe.test.ts` 는 지웠다.** 브라우저가 하는 일을
    손으로 다시 짜고 있었다. 세로 스크롤과 축을 가르는 것도 브라우저 몫이 됐다
  - `scroll-snap-stop: always` — 세게 밀어도 한 장씩 선다. 훑어보는 화면이라
    여러 장을 건너뛰면 뭘 봤는지 놓친다
  - **예문은 한 줄씩** (2026-09-12, 사용자 요청) — 여러 개일 때만 「다음 예문 n/N」 이 붙고,
    누르면 **그 카드의 예문만** 바뀐다 (카드는 안 움직인다). 한 바퀴 돌면 첫 예문으로
  - **카드를 떠나면 첫 예문으로 되돌린다** — 트랙이 모든 장을 띄워 두는 구조라
    안 그러면 몇 장 전에 넘겨 둔 자리가 그대로 남는다. `at` 이 바뀌면 렌더 중에 되돌린다
    (effect 로 하면 한 번 그린 뒤 다시 그리게 되고, `set-state-in-effect` 린트가 잡는다)
  - **‹이전/다음› 은 트랙 밖에 한 벌만** (2026-09-12, 사용자 요청). 슬라이드마다 두면
    카드를 따라 흘러가서 누르려던 자리가 움직인다. `.card-bottom` 을 같이 걸어
    safe-area 여백을 그대로 쓴다
  - **검증: `tests/e2e/browse-carousel.spec.ts` (`hasTouch`) — 모든 장이 한 트랙에 있고,
    `scrollSnapType`/`scrollSnapAlign` 이 걸려 있고, 트랙을 스크롤하면 머리말이 따라오고,
    버튼도 트랙을 움직이고, 첫 장 이전이 잠겨 있고, 출제 요소가 없다.
    `npm test` 366 · `npm run e2e` 9스펙 · `tsc -b`/`oxlint`/`vite build` 클린 · 폰 폭(390px) 캡처 대조.
    옛 `report-browse.spec.ts` 는 이 스펙에 합쳤다 — 한 화면을 두 스펙이 나눠 보고 있었다**

---

## 동기화 유실 — 자기 파일을 읽지도 않고 덮어썼다 (2026-09-13, 사용자 신고) ⏳ 열린 항목 2

"동기화를 하면서 학습 단어 숫자가 누락" → 소스를 뒤져 원인을 찾고 재현했다.
**P0~P4 우선순위는 context-notes 같은 날 절에 있다.**

- [x] **P0 · 순서를 `목록 → 내 파일 되받기 → 업로드 → 남의 파일` 로** — 기존 순서는
  업로드가 먼저라 **자기 파일을 한 번도 안 읽었다.** 로컬이 비면 Drive 사본도 비웠다
  - `importMissingEvents` — 내 파일은 **로컬에 없는 id만** 받는다. 되받는 건 내가 지난번에
    올린 것이라, 그 뒤 로컬에서 생긴 변화(묘비)를 옛 값으로 되돌리면 안 된다
  - **못 읽은 파일은 덮어쓰지 않는다** — 내 파일 다운로드가 실패하면 업로드를 건너뛰고
    오류로 끝낸다. 이번 버그가 "읽지도 않고 덮어썼다" 라서 반대로 틀리는 게 안전하다
  - `SyncResult.restored` 추가 — 되살린 건수를 설정 화면이 알린다
  - 진행 막대에 `restore` 단계 추가
- [x] **P1 · 「초기화」 문구를 사실대로** — "되돌릴 수 없어요" 만으로는 거짓이다.
  기기가 둘이면 다른 기기가 동기화할 때 기록이 돌아온다. 문구에 그걸 적었다
- [x] **실제 동기화 점검 도구** (`npm run audit:sync`) — 앱은 동기화 로그를 안 남긴다.
  남은 증거는 Drive 의 `reviews-*.json` 뿐이라 그걸 직접 읽어 기기별 건수·기간·빈 파일을
  센다. **기록이 있던 기기의 파일이 비어 있으면** 이 버그에 당한 것이다
- **검증: `sync.test.ts` 18 → 23. 새 5건 — 로컬 0 + 같은 deviceId 로 동기화해도 Drive 3건
  유지·로컬 3건 복구 / 로컬 신규분과 백업이 합집합 / 되받기가 묘비를 안 되살림 /
  내 파일을 못 읽으면 업로드 안 함 / 진행 보고 순서. 기존 5건은 새 순서에 맞춰 갱신.
  `npm test` 371 · `tsc -b`/tools tsc/`oxlint` 클린. 점검 도구는 픽스처로 실행 확인**
- [x] **신고된 증상 해결** (2026-09-13) — 원인은 P0 버그가 아니라 **Drive 수동 삭제**였다.
  9/12 16:54 에 기기 파일 7개가 휴지통으로. 휴지통 복원 + 각 기기 동기화로 숫자가 같아졌다.
  `deleteFile` 은 영구 삭제라 휴지통에 있다는 것 자체가 앱이 안 지웠다는 증거 (context-notes)
- [ ] **정리 후 남는 내 파일이 수동 삭제를 부른다** — 보관 파일이 전체 백업이 아니라서
  손으로 지우면 깨진다. 「이 기기 기록 전부를 보관 파일에 올리기」 여부는 사용자 결정 대기
- [x] **P2 · 가짜 오답 규모 측정 — 결과 0건. 지울 게 없다** (2026-09-13)
  - `tools/audit-empty-answers.ts` (`npm run audit:empty-answers`) — `data/events/` 의
    `backup.json` 을 읽어 `type:'review' + cardType:'reading' + answer:'' + correct:false` 를 센다
  - **세기만 한다. 아무것도 안 지운다** — 규모를 알아야 지울 값어치를 판단한다
  - 뜻 카드는 `answer` 가 늘 빈 문자열이라(자기 채점) 반드시 읽기 카드로 좁힌다.
    안 좁히면 멀쩡한 뜻 카드 오답이 전부 가짜로 잡힌다
  - 보고 — 건수·기간·숙어 수·**전체 오답 대비 비율**·날짜별 분포, 그리고 **빼면 정답률이
    얼마나 오르는지**. 마지막 값이 곧 지울 값어치의 크기다
  - 수정 시각 이후에도 잡히면 다른 경로가 있다는 뜻이라 경고를 낸다
  - **검증: 픽스처(빈 답 오답 12 · 진짜 오답 8 · 정답 80 · 뜻 카드 빈 답 오답 5)로 실행 —
    뜻 카드 5건을 안 세고, 전체 오답의 60.0%, 정답률 80.0% → 90.9% 로 보고**
  - **실제 측정 결과** — 전체 1,856건(9/05~9/13, 기기 9대) 중 **빈 답 오답 0건**.
    수정 이전 읽기 채점이 154건 실제로 있고 그중 오답 83건인데 빈 답은 0 — "기록이 없어서
    0" 이 아니라 **그 버그를 안 겪었다.** 1자 이하 답도 0건
- [x] **P3 · 묘비 — 접는다** (2026-09-13) — 「구간 삭제」는 지울 대상이 없어 필요가 사라졌고,
  남는 「초기화 전파」 하나를 위해 수만 건 갱신이나 새 이벤트 타입을 들일 값어치가 없다.
  초기화 문구가 사실을 알리는 것으로 충분하다 (P1). 필요해지면 그때 다시 연다
- [ ] **P3 · 묘비 도입** — 「초기화 전파」와 「구간 삭제」가 여기 걸린다.
  설계 갈림이 있어 사용자 결정을 먼저 받는다 (context-notes)

---

## 백업과 동기화를 가른다 (2026-09-13, 사용자 결정) ✅

**"파일이 계속 늘어나는 게 싫다"** 가 요구사항이었고, mmtm 교훈이 방향을 줬다 —
mmtm 은 백업(버전 zip)과 동기화를 갈라 뒀는데 yomenai 는 한 파일에 두 역할을 겹쳐 놨다.

- [x] **`backup.json` + `sync-<기기>.json`** — 전체 로그를 담는 백업 하나와, 짧게 사는
  기기별 전송 파일. 전송은 백업에 접히면 바로 지운다. **평상시 폴더에 파일 하나**
- [x] **매 동기화마다 접는다** — 30일 기준 자동 정리(`STALE_DAYS`)와 수동 「옛 기기 파일
  정리」 버튼을 없앴다. 접는 게 상시라 따로 돌릴 일이 없다
- [x] **줄어드는 백업 쓰기를 거부한다** (`assertBackupGrows`) — append-only 로그라
  작아지는 정상적인 경우가 없다. 병합을 빼먹는 류의 결함을 쓰기 직전에 잡는 방어선
- [x] **백업 쓰기가 성공한 뒤에만 지운다** — 실패하면 전송 파일이 남아 다음 동기화가 메운다
- [x] **옛 이름 이관** — `reviews-*.json`·`reviews-archive.json` 을 읽어 백업에 접고 지운다.
  일회성 스크립트 없이 동기화 한 번이면 끝난다
- [x] **폴더 전체를 본다** — `name contains 'reviews-'` 필터를 걷었다. 이름 규칙이 바뀌면
  깨지는 필터였고, `drive.file` 스코프라 이 앱 파일만 보인다
- [x] `audit:sync` 가 파일마다 역할을 찍는다 — 지워도 되는 것과 아닌 것을 구분해 보여 준다
- **검증: `sync.test.ts` 16 — 폴더에 backup.json 하나만 남음 / 두 기기 손실 0 /
  로컬이 비어도 되살림 / 로컬 이벤트를 안 지움 / 묘비를 안 되살림 / 백업 실패 시 전송 파일
  보존 / 옛 이름 이관과 재실행 동일 / 축소 거부 규칙 / 진행 보고 순서.
  `npm test` 364 · `tsc -b`/tools tsc/`oxlint` 클린**

---

## 리포트의 밴드별 정답률이 실력을 과소평가한다 (2026-09-13, P2 측정 중 발견) ✅

- [x] **밴드별 정답률에 최근 구간 가중** (2026-09-13) — `LEVEL_WINDOW`(30) 회.
  `buildLevel` 이 밴드별 채점 이력을 시간순으로 모아 뒤에서 30 개만 판정에 쓴다
  - 실측 (1,719건 / 9일) — 밴드 1 전 기간 70.3% vs 최근 3일 **81.3%**,
    밴드 2 62.1% vs **76.5%**, 밴드 3 59.5% vs 68.1%. 전체는 9/05 40.2% → 9/13 77.5%
  - **`LEVEL_SOLID_RATE` 0.8 을 이미 넘긴 밴드 1 이 화면에는 「흔들림」으로 뜬다.**
    실력이 늘어도 사다리가 안 올라가면 계속할 이유가 깎인다 —
    「성취도는 깎이지 않는다」(PLAN §5 원칙 3)의 다른 얼굴이다
  - **최근 N회** 안을 권함 (최근 N일은 며칠 쉬면 표본이 비어 「표본 부족」으로 떨어진다).
    `LEVEL_MIN_SEEN`(5)이 이미 표본 부족을 다루고 있어 그 위에 얹기 자연스럽다
  - **진단과 같이 봐야 한다** — `bandVerdict` 의 `OK_RATE` 도 0.8 이고,
    `level.ts` 주석이 "두 화면이 서로 다른 말을 하면 안 된다" 고 그 연결을 명시해 뒀다.
    한쪽만 고치면 진단이 넘긴 밴드를 리포트가 흔들린다고 말한다

  - **누적 `totalReadings` 는 안 건드린다** — 쌓아 온 양이라 줄이면 그게 곧 성취도를 깎는
    것이고, 처방의 표본 문턱(`PRESCRIPTION_MIN_READINGS`)도 이 값을 본다.
    밴드 행의 `seen` 합과 다른 값이 됐다
  - **회수 기준** — 날짜 기준은 며칠 쉬면 표본이 비어 「표본 부족」으로 떨어진다.
    회수는 쉬어도 유지되고 FSRS 복습 주기와도 맞는다
  - **진단과 어긋나지 않는다** — `bandVerdict` 는 원래 *그 진단 회차 안*의 성적으로 판정한다.
    리포트가 전 기간을 접던 쪽이 어긋나는 원인이었고, 창을 씌우면 오히려 두 화면이 가까워진다
  - 화면에 「밴드 판정은 최근 30회 기준이에요」를 밝혔다 — 숫자가 30 에서 멈추는 이유가
    안 보이면 오해를 부른다
  - `diagnosticSummary` 는 그대로 뒀다. 진단 결과 화면이 *그 회차* 요약에 쓰는 함수라
    창을 씌울 자리가 아니다
  - **검증: `level.test.ts` 6 → 12 (창 밖 옛 기록 제외 · 최근에 무너지면 바로 흔들림 ·
    누적은 안 잘림 · 창보다 적으면 전부 · 밴드마다 따로 · 시각이 뒤섞여 와도 시간순).
    실제 백업 1,719건으로 확인 — 밴드 0·1 이 「흔들림」에서 「안정」으로 바뀌고
    (71.4%→86.7%, 70.3%→90.0%) 경계가 밴드 2 에 선다. 누적 1,719 유지.
    `npm test` 370 · `tsc -b`/`oxlint` 클린**

---

## 첫 만남을 시험이 아니라 소개로 (2026-09-13, 사용자 결정) ⏳ 열린 항목 1

**"아는 것을 확인하기는 하는데 모르는 걸 배우는 것은 한계가 있다."** 앱 전제가
「뜻은 아는데 못 읽는」이라 시험-피드백 구조였는데, 코퍼스에 일본고유 3,643개가 들어오며
전제를 넘어섰다. PLAN 범위를 「교정 + 습득」으로 넓혔다.

- [x] **`introduced.ts`** — 소개한 숙어 id 를 `localStorage` 에 적는다.
  **이벤트 로그가 아니다** — 학습 기록이 아니라 화면 진행 상태라 스키마를 안 건드린다.
  기기 간 동기화가 안 되는 건 알고 받는 값 (새 단어를 한 번 더 보는 건 손해가 아니다)
- [x] **`planIntros`** — `due === false` 이고 아직 소개 안 한 숙어를 소개 대상으로 잡고,
  **그 숙어의 나머지 카드를 이번 세션에서 걷는다**
  - 걷는 이유 — 확장 숙어는 읽기·뜻 두 장이 같이 나온다. 소개에서 둘 다 보여준 뒤 같은
    세션에서 물으면 첫 채점이 부풀고, 밴드 사다리가 최근 30회를 보므로 수준 판정이 바로 흔들린다
  - 첫 등장 자리를 지킨다 — 순서를 안 흔든다. 세션은 그만큼 짧아지고 진행 막대는
    처음부터 맞는 수를 쓴다 (중간에 건너뛰면 막대가 튄다)
- [x] **`IntroCard`** — 「처음 만나요」 태그 + 한자어·읽기·뜻·소리·예문 한 줄 + 「봤어요」.
  **채점도 이벤트도 없다.** FSRS 도 밴드 통계도 안 건드린다
- [x] **확인 질문이 먼저** — 새 숙어는 「뜻은 알고 있었어요?」(지연 검수) → 소개 순서다.
  보여주기 전에 물어야 답이 의미가 있다
- [x] **초기화가 소개 이력도 비운다** — 기록을 지웠는데 「처음 만나요」 가 안 뜨면 앞뒤가 안 맞는다
- **세션 상한은 안 뒀다** — 지금은 기한 카드가 대부분이라 소개는 몇 장뿐이다.
  소개로 가득 차면 그때 넣는다
- **검증: `planIntros.test.ts` 8 (소개 대상 판정 · 기한 카드 제외 · 이미 소개한 것 제외 ·
  한 장만 남김 · 첫 등장 자리 유지 · 기한 카드도 같이 걷음 · 여러 숙어 · 빈 경우).
  `tests/e2e/intro-new-card.spec.ts` 신규 — 확인 질문 뒤 소개가 뜨고, 입력창이 없고,
  **「봤어요」 전후 IndexedDB 이벤트 건수가 같고**, 같은 숙어가 그 세션에 다시 안 나온다.
  `npm test` 378 · `tsc -b`/`oxlint` 클린 · 390px 캡처 대조**

  - **기존 e2e 10스펙 중 6개가 깨졌다** — 세션을 도는 루프가 「봤어요」를 몰라 멈췄다.
    전부 소개 처리를 넣고, 기록이 없으면 첫 세션이 전부 소개라 채점 기록이 안 쌓이므로
    한 번 더 돌게 했다
  - 재시작 셀렉터가 `exact: true` 라 안 걸렸다 — **소개만 한 세션은 기록을 안 남겨**
    홈이 "진단 안 함" 상태로 돌아가고 버튼 이름이 `세션 시작  · 진단 건너뛰기` 가 된다
- [x] **소개가 성취로 안 잡히는 건 문제가 아니다** (사용자 판단 2026-09-13) —
  **아무것도 안 푼 건 애초에 진단 범주가 아니다.** 수준을 추정할 근거가 없으니
  홈이 "진단 안 함" 으로 남는 것도 맞다
- [x] **안다고 답하면 소개를 건너뛴다** (2026-09-13) — 「뜻은 알고 있었어요?」에
  `known: true` 면 `assignMode` 가 교정으로 넘기고 읽기 카드만 낸다. 아는 단어를
  가르칠 이유가 없고, 그 경로는 그 자리에서 채점되니 **기록도 남는다**
  - `knewMeaning` 상태로 그 카드에서만 소개를 막는다. 카드가 넘어갈 때 풀린다
- [x] **「처음 만나요」 태그를 뺐다** — 앱이 모르는 걸 사용자에 대해 단정하는 말이었다.
  기록에 없을 뿐 사용자가 처음 보는 단어라는 뜻이 아니다 (사용자 지적).
  「알아 두기」로 바꿨다 — 사용자가 아니라 하는 일을 가리킨다
  - 남는 경우 — **뜻은 모르는데 읽기는 아는 사람**은 소개를 보고 읽기 시험이 다음으로
    밀린다. 한 슬롯 손해지만 뜻을 새로 아는 값이 있고, 여기까지 나눠 물으면 카드가 복잡해진다
- [ ] **이 설계가 다른 사람에게도 맞는지 모른다** (사용자 의문 2026-09-13) —
  한 사람의 로그 1,719건으로 만든 앱이다. 지금 판단할 근거가 없다
  - **언어에 근거한 부분은 일반화된다** — 한자어 겹침 구조(동형동의 6,219 / 동형이의 7,351 /
    일본고유 3,643), 한국음 간섭·렌다쿠·촉음·장음은 한국어 화자에게 구조적으로 생기는 오류다
  - **한 로그에 맞춘 상수는 아니다** — `LEVEL_WINDOW` 30, `LEVEL_SOLID_RATE` 0.8,
    세션 20장, 비율 7:3, `BROWSE_N` 30. 전부 상수 하나씩이라 안 맞으면 설정으로 빼거나
    그 사람 로그에서 다시 뽑으면 된다. 구조를 뜯을 일이 아니다
  - **확인 방법** — 비슷한 실력의 한국어 화자 한 명이 일주일 쓰고, 오답 유형 분포와
    밴드 사다리 모양을 대조한다. 닮으면 전제가 맞고, 다르면 이 앱은 한 사람용으로
    잘 만든 도구다. 둘 다 나쁜 결과가 아니다

- [x] **처음부터 설명하지 않는다** (2026-09-13, 사용자 결정) — `INTRO_MIN_READINGS`(30).
  읽기 채점이 그만큼 쌓이기 전에는 소개를 아예 안 낸다. **레벨 테스트처럼 먼저 풀게 한다**
  - 기록이 없으면 앱은 이 사람이 뭘 아는지 모른다. 그 상태에서 설명부터 내미는 건
    아는 단어까지 가르치겠다는 뜻이다
  - 값은 `PRESCRIPTION_MIN_READINGS` 와 같다 — "이만큼은 풀어야 신호로 읽는다" 는 같은 논리.
    독립된 판단이라 상수는 따로 두되 이유를 코드에 적었다
  - 문턱 미만에서는 **카드를 걷지도 않는다** — 소개를 안 내니 세션이 짧아질 이유가 없다
  - **검증: `planIntros.test.ts` 8 → 12 (문턱 미만 소개 없음 · 기록 0 · 문턱에 닿으면 시작 ·
    문턱 미만에선 카드도 안 걷음). e2e 4번째 케이스 「기록이 없으면 소개 없이 바로 문제부터」.
    소개 케이스 셋은 채점 기록 30건을 IndexedDB 에 직접 심어 그 구간을 건너뛴다 —
    세션을 세 번 돌리는 것보다 빠르고, 코퍼스 밖 id 라 카드 선택에 안 끼어든다.
    `npm test` 382 · `npm run e2e` 13스펙 · `tsc -b`/`oxlint`/`vite build` 클린**
- [x] **테스터 사용설명서** (2026-09-13) — 아티팩트로 게시.
  전제(한자어 겹침 분류)·시작 순서·카드 4종·오답 유형 6종·리포트 읽는 법·백업 주의·
  테스터에게 묻는 6가지·알려진 한계. 校正紙 정체성(원고지 藍 괘선 + 朱 주석)을 그대로 쓰고
  일본어는 `lang="ja"` + 일본 폰트로 조판했다

---

## 테스터 피드백 폼 — 자체 제작 (2026-09-13, 사용자 결정) ✅

- [x] **앱 안에 피드백 화면** (`src/app/Feedback.tsx`, 설정 > 피드백) — Google Form 대신
  자체 제작. 응답은 본인 Google Apps Script → 스프레드시트로 간다
- [x] **자동 수집 0** — 학습 기록을 보내는 경로를 코드에 안 만들었다.
  「가장 큰 오답 유형」은 이 기기 기록으로 계산해 **화면에 보여만 주고**, 고른 값만 나간다.
  힌트에도 "이 값은 안 보내니 직접 골라 주세요" 를 적었다
  - 사전을 안 읽는다 — 오답 유형 집계는 `replay` + `mistakeTotals` 로 이벤트만으로 난다
- [x] **보낼 내용을 그대로 보여준다** — 요약이 아니라 전송될 텍스트 자체. 읽고 누른다
- [x] **이름도 연락처도 안 받는다** — 익명이라 되물을 수 없다는 것도 화면에 적었다
- [x] **전송 확인 불가를 숨기지 않는다** — Apps Script 웹 앱은 리다이렉트로 응답하고 그쪽에
  CORS 헤더가 없어 `no-cors` 로 보낸다. 보낸 뒤에도 「내용 복사」 경로를 남긴다
- [x] **주소가 비면 전송 버튼 대신 복사만** — 설정이 덜 됐다고 화면이 깨지면 안 된다
- [x] `docs/feedback-endpoint.md` — Apps Script 코드와 배포 절차
- [x] **표식(`FEEDBACK_TOKEN`)** — 앱이 약속된 문자열을 같이 보내고 `doPost` 가 아니면 버린다.
  비밀이 아니다 (정적 번들이라 감출 수 없다). 막는 건 아무 데나 POST 하는 자동 요청뿐
- [x] **스프레드시트 + Apps Script 배포, `FEEDBACK_ENDPOINT` 입력** — 2026-09-13.
  독립 스크립트라 시트를 `openById` 로 찾는다 (모바일에는 「확장 프로그램 → Apps Script」 가 없다)
- [x] **끝까지 검증** — 배포된 앱에서 실제로 보내 스프레드시트에 줄이 쌓이는 것을 사용자가 확인.
  `no-cors` 라 화면은 실패해도 "보냈어요" 라고 하므로 **판정은 시트로만 난다**

## 테스터 안내서 (2026-09-13) ✅

- [x] **`public/guide.html`** — 아티팩트로 쓴 안내서를 Pages 에 같이 올린다.
  조각이라 doctype/head/body 로 감싸고, 아티팩트 래퍼가 넣어 주던 `body { margin: 0 }` 을 직접 넣었다
- [x] **SW 내비게이션 폴백에서 제외** — `navigateFallbackDenylist` 에 `guide.html`.
  안 하면 SW 가 설치된 기기에서 안내서 주소로 들어가도 앱 셸이 대신 뜬다
- [x] **홈과 설정에서 「사용 안내서」** — 여는 코드는 `src/app/guide.ts` 한 곳.
  `BASE_URL` 로 붙인다 (dev 는 `/`, 배포는 `/yomenai/`)
- [x] **안내서 안에 「앱으로 돌아가기」** (`.backbar` 고정 바 + 꼬리말).
  `_blank` 로 열어도 **홈 화면에 설치한 앱에서는 브라우저로 안 빠지고 그 자리에서 열린다.**
  주소창도 뒤로가기도 없어 앱을 껐다 켜야 했다. 창 동작에 기대지 않고 문서가 길을 들고 있어야 한다
- [x] **mmtm 의 SW 가 `/yomenai`(끝 슬래시 없음)를 가로챘다** (2026-09-13 해결) — mmtm 이 루트(`/`)에 배포돼
  있고 `navigateFallbackDenylist` 가 없어서 자기 `index.html` 을 내준다. 서버는 301 로 정상.
  **yomenai 쪽에서는 못 고친다** (SW 스코프를 디렉터리 위로 넓히려면 `Service-Worker-Allowed`
  헤더가 필요한데 Pages 는 헤더를 못 단다). 고칠 자리는 mmtm `vite.config.js` 의 `workbox` 였다.
  배포된 루트 `sw.js` 에 `denylist:[/^\/yomenai/,/^\/youdid/]` 가 들어간 것을 확인했다.
  **옛 SW 를 물고 있는 기기는 mmtm 을 한 번 더 열어야** 교체된다 (`registerType: autoUpdate`)

## 새 버전 반영 (2026-09-13) ✅

- [x] **`registerType: 'prompt'` + `skipWaiting` 제거** — 새 서비스워커를 대기시킨다.
  `autoUpdate` 는 반영 시점을 고를 수 없어 **카드 푸는 중에 페이지가 갈릴 수 있었다**
- [x] **`UpdateBanner`** — 아래에 「새 버전이 준비됐어요 · 지금 적용」. 누를 때만 새로고침한다.
  빌드된 `sw.js` 에서 `skipWaiting()` 이 `SKIP_WAITING` 메시지 핸들러 안에만 남은 것을 확인
- [x] **한 시간마다 `registration.update()`** — 브라우저는 재방문 때만 확인하는데,
  홈 화면 앱을 켜 둔 채 며칠 쓰면 그 재방문이 안 일어난다
- [x] **실기기 확인** — 배포(#88) 뒤 실제로 띠가 뜨는 것을 사용자가 확인

## 배포 확인 방법 (2026-09-13, 함정) ✅

- **번들 해시로 로컬 ↔ 배포를 비교하면 안 된다.** CI 가 `VITE_GOOGLE_CLIENT_ID` 를
  시크릿에서 주입하고 `VITE_` 변수는 빌드 시점에 번들에 박히므로, 같은 커밋이어도
  로컬과 CI 의 해시가 다르다
- 내용으로 확인하되 **이번 변경에만 있는 문자열**을 골라야 한다. 「사용 안내서」로 걸었다가
  설정 화면의 기존 문구에 걸려 옛 번들을 성공으로 오판한 적이 있다 (등장 횟수 1 → 2 로 해결)
- **문구를 고치는 변경은 새 문구가 아니라 없어진 문구로 확인한다.** 새 문구가 옛 문구의
  부분 문자열이면 옛 번들에 그대로 걸린다 — 「…바로 갑니다」를 「…바로 가요」로 고치고
  「정답과 해설로 바로」로 감시해 또 오판했다 (2026-09-14). **사라진 것은 부분 일치가 없다**
- **사전(`public/dict/*.json`)은 해시 없는 고정 경로다** — `/yomenai/dict/base.json` 을 직접
  받아서 확인한다. 번들과 달리 파일 이름이 안 바뀌므로 내용 말고는 볼 것이 없다.
  여기서도 없어진 문구로 본다 (2026-09-14, 검수 배치 20 반영 확인).
  **기기에서는 바로 안 보인다** — 서비스 워커가 미리 캐시하므로 「새 버전」 배너로 갱신해야 반영된다

## 테스터 피드백 1차 반영 (2026-09-14) ⏳ 열린 항목 2

첫 테스터(자칭 N2 미만)의 카톡 피드백. 원문은 `context-notes.md` 같은 날 절 참조.
**내용이 아니라 조작·진입을 지적했다** — 「자세히」를 최고로 꼽았으므로 전제는 통했다.

### P0 — 데이터 품질이 걸린 것

- [x] **모를 때 넘기는 길** — 지금은 빈 답 제출이 무시되고(`KanaInput.tsx`) 오답 전에는
  「다음」도 없다. 테스터가 "아무 자판을 누르게 되어서요" 라고 했다.
  **모르는 답이 오답 유형 분류기를 거쳐 밴드 판정·처방까지 오염시킨다**
  - 채택 — 오답으로는 세되(못 읽은 건 사실이다) **오답 유형은 안 붙인다.**
    `classifyMistake` 가 빈 답에 이미 `null` 을 돌려줘서 코어는 안 고쳤다
  - 검증 통과 — `tests/e2e/pass-reading.spec.ts` (correct=false, answer='', mistakeType=null)
- [x] **읽기 입력에 무엇을 쓰는지 표시** — 지금은 `aria-label` 만 있고 보이는 안내가 없다.
  직전이 「뜻은 알고 있었어요?」 라서 뜻을 쓰라는 줄 안다
  - `placeholder="읽는 법 (히라가나)"`. 검증 통과 — 같은 e2e 가 placeholder 를 확인한다

### P2 (먼저 진행) — 이름과 자리

- [x] **첫 실행 안내** — 안내서가 있지만 눌러야 나온다. 테스터가 "제가 무언가를 다
  수행하지 못해서 안 뜨는 부분도 있는 것 같다" 고 했다
- [x] **안내서에 다루는 난이도를 명시** — 밴드 0(N3 이하)은 기본 도입에서 빠져 있어
  첫 화면부터 N2 대가 나온다. 기획을 안 바꾸더라도 놀라지 않게 적는다

### P1 (뒤로 미룸) — 첫 진입

- [x] **이름을 「다시보기」로** (사용자 결정 2026-09-14) — 대상을 안 말해준다. **「복습하기」는 안 된다** — 앱에서 복습은
  기한이 찬 카드를 다시 푸는 것(FSRS)이고 훑어보기는 채점이 없는 자리다.
  **「미리보기」도 안 된다** — 틀린 적 있는 숙어만 담기므로(`frequentIdioms`) 미리 보는 게 아니다
- [x] **홈에도 진입점** — 「틀렸던 것」 줄에 재대결과 나란히 — 지금은 리포트 안에만 있다

### 보류 — 성격이 바뀌는 것

- [ ] 훑어보기에 「이해했어요 / 잘 모르겠어요」 — 채점을 빼려고 만든 자리다.
  다만 **"모르겠다고 한 카드를 그 세션 안에서 다시 보여주기"** 는 기록을 안 남기므로 가능
- [ ] 수준별 진단(N5·N4) — 기획 밖 (사용자 판단 2026-09-14)

### P2 수행 기록 (2026-09-14)

- [x] **홈 정리 A + B** — 액션과 참조를 가르고 설정을 헤더 톱니로 올렸다
  - A: 재대결과 다시보기는 **대상이 같다**(틀렸던 숙어). 한 줄에 세워 "채점할래, 그냥 볼래"
    의 선택으로 읽히게 했다. 옆에 선 재대결이 다시보기가 뭔지 설명해 준다
  - B: 설정을 하단 메뉴에서 빼 헤더 ⚙ 로. 메뉴가 3개로 줄고 **첫 화면에서도 닿는다**
    (Google 로그인이 설정에 있다)
  - **첫 진입 확인** — 기록이 없으면 `rematch`·`browse` 가 0 이라 「틀렸던 것」 줄이
    통째로 안 뜬다. 진단 안내와 세션 시작만 남는다
  - 다시보기 복귀 경로 — `browseFrom` 으로 들어온 자리를 기억한다. 고정해 두면 홈에서
    들어간 사람이 나가면서 리포트에 떨어진다
  - 안내서의 위치 문구도 같이 고쳤다 (설정 = 오른쪽 위 ⚙, 다시보기 = 홈과 리포트 두 군데)

### P1 수행 기록 (2026-09-14)

- **모달이 아니라 홈 위의 패널**로 만들었다
  - 화면을 가로막으면 첫 동작(「진입 진단 시작」)이 가려진다. 이 앱은 어디에도 모달을 안 쓴다
  - **실용적 이유도 컸다** — 별도 화면이면 e2e 14개가 전부 「세션 시작」을 못 찾는다.
    패널로 하니 기존 스펙이 하나도 안 깨졌다
- 내용은 테스터가 몰라서 막혔던 셋 + 난이도 — 읽기만 다룸 / 모르면 넘기기 / 처음 30문항은
  레벨 테스트 / N2 이상
- 검증 통과 — `tests/e2e/welcome.spec.ts` (한 번만 뜬다, 뜬 동안에도 시작 버튼에 닿는다)
- 학습 기록 초기화가 `clearWelcomeSeen()` 도 부른다 — 기록이 비었으면 처음 쓰는 상태다

## 동형이독 — 「읽기 둘」 카드 (2026-09-14) ✅

한 표기에 읽기가 둘인 말(市場 いちば/しじょう)을 답이 하나인 카드 모델에 끼워 넣으려다
판정이 두 번 어긋났다. 경위와 기각한 대안은 `context-notes.md` 같은 날 두 절에 있다.

- [x] **표기+읽기가 같은 중복 69개 제거** — `build-runtime-dict.ts` 가 하나만 남긴다
  (밴드 낮은 쪽 → common → 작은 id). 밴드 0~3 은 원래 0, 전부 밴드 4 안에 있었다
  - 검증 통과 — base 의 표기+읽기 중복 0, base+band4 69 → 0
- [x] **동형이독은 「읽기 둘」 카드로 접어 처음부터 둘 다 묻는다** — `foldHomographs`,
  `pairOf` (`src/study/homograph.ts`). 세션에서 짝을 안 접으면 방금 다 물어본 표기가 뒤에 또 나온다
  - 기록 규칙 — **쓴 읽기의 카드에만 정답. 못 쓴 쪽은 무기록. 어느 읽기로도 못 읽었을 때만 오답**
  - 그래서 오답은 언제나 「이 표기를 어떤 읽기로도 못 읽었다」 만 뜻한다. 정확도 그래프에 특례가 없다
  - 검증 통과 — `tests/e2e/homograph-dual.spec.ts` 2건. 둘째가 핵심이다:
    한쪽만 쓰고 넘기면 이벤트가 **정확히 1개**(쓴 쪽 정답)이고 못 쓴 쪽에 오답이 안 생긴다
  - 검증 통과 — `src/study/homograph.test.ts` 5건 (짝 찾기·세션 접기)
- [x] **스키마는 안 건드렸다** — 이벤트는 그대로 각 숙어의 `reading` 이벤트.
  「읽기 둘」인지는 사전(`altReadings`)과 풀에서 파생한다 (소개 카드의 `introIds` 와 같은 방식)

### 남은 구멍 — 규칙형 오답 12건 (보류)

`altReadings` 쌍 387개 중 12개는 분류기가 규칙형으로 판정하는 차이다 —
RENDAKU 7(安心 あんしん/あんじん, 境界 きょうかい/きょうがい …), CHOON 4, SOKUON 1.
이 12개는 상대 숙어가 **밴드 4 에만** 있어 「읽기 둘」 카드가 안 되고, 보통 카드에서
`altReadings` 특례로 조용히 정답 처리된다 → **진단 기회가 사라진다.**
막으려면 빌드에서 규칙형으로 판정되는 대체 읽기만 `altReadings` 에서 빼면 된다.
連濁·促音·長音은 이 앱이 가르치는 핵심이라 그쪽이 맞다고 보지만, 「맞는 읽기를 오답으로
만들지 않는다」 와 맞바꾸는 일이라 사용자 판단이 필요하다. **다음 세션에서 정한다.**

## UI 개편 세션으로 미룬 것 (2026-09-14) ⏳ 열린 항목 2

지금은 내용이 먼저다. 아래는 UI 전용 세션에서 한 번에 다룬다.

- [ ] **첫 안내를 모달 + 캐러셀로** — 지금은 홈 위의 패널이고 **두 줄만** 적었다.
  홈은 자체 스크롤이 없어(`.home` 은 flex 중앙 정렬) 길어지면 내용이 넘치기 때문이다.
  모달로 띄우면 길이 제약이 풀리고, 캐러셀로 넘기면 한 장에 한 가지만 말할 수 있다.
  「다시 보지 않기」 선택지도 그때 붙인다
- [x] **내비게이션 모델 (하단 탭)** — **2026-09-17 완료** (아래 「하단 탭 — 셸 전환」 절).
  지켜볼 신호 다섯 중 셋이 걸려서 앞당겼다. 이게 위였으므로 아래 둘이 이제 열린다
- [ ] **홈 레이아웃 본편** — 지금 홈은 "테스트하기 편하게" 정리한 상태다 (사용자 판단)
- [x] **사용 안내서를 설정과 같은 층으로** — **2026-09-17 완료.** 하단 탭 전환 때
  `home-nav` 가 통째로 사라지면서 안내서가 설정(⚙) 안으로 들어갔다 (`Settings.tsx`).
  「⚙ 안으로 넣을지」가 당시 두 안 중 하나였고 그쪽으로 정해진 셈이다.
  홈에 남은 「안내서 보기」는 **첫 방문 안내 패널**(`showWelcome`) 안이라 별개다

---

## 읽기로 찾기 — 히라가나 검색 (2026-09-16, 사용자 요청) ✅

**A안 확정 — 보기만 한다.** 이벤트·FSRS 를 안 건드린다. B(지금 풀어보기)·C(찜하기)는
사용자가 기각 (`context-notes.md` 같은 날 절).

- [x] **`src/dict/readingIndex.ts`** — 읽기 → 숙어 역인덱스. `pairIndex.ts` 와 같은 모양
  (`loadBaseIdioms` → Map, 캐시된 Promise)
  - 키는 **단어 전체 읽기**. `altReadings`(368건)도 키로 넣는다
  - 정렬된 키 배열 + 이진 탐색으로 **앞부분 일치** 구간을 잡는다. 입력마다 전량 순회 금지
  - 쿼리 정규화는 `src/lib/readings.ts` 의 `toHiragana` (카타카나·장음부)
  - 밴드 0~3 고정. `loadBand4Idioms` 를 안 부른다
  - 검증: 단위 테스트 — 정확 일치 그룹이 맨 앞 · 앞부분 일치가 뒤 · `altReadings` 로 조회 ·
    카타카나 입력 정규화 · 없는 읽기는 빈 결과 · 상한 절단
- [x] **`src/app/Search.tsx`** — 검색 화면. `.screen` / `.screen-bar` / `.screen-body` 셸과
  `.rows` 목록을 그대로 쓴다 (새 레이아웃을 안 만든다)
  - 입력은 `wanakana` `toKana(IMEMode)` 로 매 입력마다 변환한다 (`bind` 아님 — 아래 주석 참조).
    `KanaInput` 과 같은 `inputMode="url"` 처방으로 IME 후보 바를 막되, 그 컴포넌트는
    채점 제출용이라 재사용하지 않고 별도 필드를 둔다
  - 결과 줄 — 표기(`lang="ja"`) · 한국 한자음 · 뜻 · 내 오답 표식
  - 읽기는 묶음 머리에 한 번만. 묶음 크기를 같이 적는다
  - 한국 한자음까지 겹치는 줄은 표식을 달아 구분이 안 된다는 것 자체를 보여준다
  - 빈 결과는 실패가 아니라 답이다 — "그 음으로 읽히는 숙어가 없어요" + 검색 범위 안내
  - 검증: e2e — 진입 · 로마자 입력이 가나로 · 결과 묶음 렌더 · 한국 한자음 표시 ·
    없는 읽기의 빈 상태 · 채점 요소(`.kana-input` 제출 버튼) 부재 · 나가면 홈
- [x] **진입점** — `App.tsx` `Screen` 에 `'search'` 추가.
  처음엔 홈 `home-nav` 넷째 칸이었는데 **상단 좌측 알약으로 옮겼다** (사용자 요청
  2026-09-16). 리포트·음독 맵은 세션 뒤에 의미가 생기는 자리고 이건 언제든 여는 자리다.
  `.home-top` 이 `space-between` 이 되고 알약 스타일을 `.home-gear` 와 공유한다
- [x] **검증 실행 (2026-09-16)** — `npm test` **415** (readingIndex 10 신규) ·
  `npm run e2e` **18 스펙** (reading-search 신규) · `tsc -b`/`oxlint`/`vite build` 클린.
  캡처 대조 — 1280px·390px 둘 다. `こうき` 11줄에 한국음이 붙고 後期/後記(후기),
  好機/好奇(호기)에 ⚠ 가 뜬다. 정확 일치 묶음 머리가 앞부분 일치보다 진하다

---

## 읽기 규칙 — 음운 변화의 지도 (2026-09-17, 사용자 요청) ✅

**확정 — 앱 안 화면 + 오답 상세 심화.** 안내서 단독과 카드 한 줄 확장은 기각
(`context-notes.md` 같은 날 절). 주 진입로는 오답 상세, 홈은 부차.

- [x] **`src/app/rules.ts`** — 규칙 본문을 구조화 데이터로. 화면이 기록을 얹을 수 있게
  마크다운 문자열이 아니라 절·항목 배열로 둔다
  - 8절 — 종성 대응 / 촉음 / 반탁 / 연성 / 장음 / 연탁 / 음독 층위 / 혼독·숙자훈
  - 절마다 `id` · 제목 · 한 줄 요약 · 본문 문단 · 예시(표기·읽기·무엇을 보이는지) ·
    대조 쌍(걸린 것 ↔ 안 걸린 것)
  - `MistakeType` → 절 매핑. `RULE_MISTAKES` 4종에 **`KO_INTERFERENCE` 를 더한다** —
    종성 대응은 규칙이 있다 (2026-09-13 「아직 안 한 것」의 그 후보다).
    `ONYOMI_CHOICE` 는 절(음독 층위)은 있지만 "규칙이 아니라 내력" 이라고 명시한다
  - 검증: 단위 테스트 — 절 id 유일 · 매핑이 가리키는 절이 존재 · **예시로 쓴 숙어와 읽기가
    `public/dict/base.json` 에 실재**(없는 예시를 싣지 않는다) · 모든 예시에 `lang="ja"`
- [x] **문헌 대조** — Phase 12-E 와 같은 기준(Vance 2008 · Frellesvig 2010 · 窪薗晴夫).
  확신이 없는 서술은 싣지 않고, 빈도 주장("가장 잦다")은 쓰지 않는다
  - 검증: 절마다 근거를 `context-notes.md` 에 남긴다. 근거 없는 절은 빼고 간다
- [x] **`src/app/Rules.tsx`** — `.screen` / `.screen-bar` / `.screen-body` 셸 재사용.
  절 목록에서 펼치고, `?` 로 들어오면 그 절이 열린 채로 뜬다
  - 검증: e2e — 오답 상세에서 진입해 해당 절이 열려 있다 · 홈에서 진입 · 나가면 온 자리
- [x] **기록 색인** — 절마다 "이 규칙으로 틀린 횟수 · 그 숙어들". `replay` 파생만 쓰고
  새 이벤트·새 저장은 없다
  - 검증: 단위 테스트 — 오답 이벤트가 유형별로 절에 모인다 · 기록 0 이면 문구가 바뀐다
- [x] **진입점** — 오답 상세의 규칙 줄에서(주), 홈 `home-nav` 에서(부).
  안내서 옆이라 "언제든 꺼내 보는 것" 무게가 맞다
  - **내비게이션 신호로 적어 둔다** — `home-nav` 가 네 칸이 된다. 하단 탭 결정의 재료다
    (2026-09-14 「지켜볼 신호」)
- [x] **검증 실행** — `npm test` · `npm run e2e` · `tsc -b` · `oxlint` · `vite build` ·
  1280px/390px 캡처 대조. 결과 수치를 이 항목에 적는다

**검증 실행 결과 (2026-09-17)** — `npm test` **436** (rules 9 · ruleRecord 6 · ja 6 신규) ·
`npx playwright test` **19 스펙** (reading-rules 신규, detail-preserves-input 에 심화 블록 확인 추가) ·
`tsc -b` / `oxlint` / `vite build` 클린. 캡처 대조 1280px·390px — 가로 스크롤 0.
예시 숙어는 전부 `base.json` 에 실재함을 테스트가 확인한다 (없는 예시를 싣지 않는다).

**진입로가 계획과 달라진 곳** — 「오답 상세에서 규칙 화면으로 이동」은 안 만들었다.
세션 중에 화면을 옮기면 `useStudySession` 이 언마운트돼 **세션 큐가 초기화**된다
(답한 카드는 이벤트로 남지만 남은 문제가 다시 뽑힌다). 그래서 세션 중에는 오답 상세가
그 절을 **인라인으로** 펼치고, 화면 진입은 세션이 없는 자리(홈 `home-nav`, 리포트 처방)에만 둔다.

**같이 고친 것** — `MISTAKE_ADVICE` 의 일본어(三日月·発達 등 35조각)가 `lang="ja"` 없이
렌더돼 **한국 자형으로 나가고 있었다**. 카드 아래 한 줄과 오답 상세 둘 다. `Mixed` 로 감쌌다.

### 탁음 갈래를 가른다 (2026-09-17, 사용자 지적 「정확도의 구멍이 크다」)

분류기가 연탁·반탁·연성을 `RENDAKU` 하나로 묶는다. 진단 축으로는 맞지만 **보여줄 규칙은
셋이 다르다** — 出発을 しゅっはつ 로 쓴 사람에게 연탁 설명을 내밀면 틀린 규칙을 가르친다.

- [x] **`explainMistake`** — `classifyMistake` 와 같은 판정에 `voicing`(rendaku/renjo/handaku)을
  얹어 돌려준다. 분해 경로는 어느 `variants` 가 달랐는지로, 문자열 경로는 は행↔ぱ행으로 가른다
  - **이벤트 스키마는 안 건드린다** (`mistakeType` 은 불변 조건). 저장된 `answer`·`expected`
    로 언제든 다시 매긴다 — 지난 기록에도 소급된다
  - 검증: 단위 — 연탁/반탁/연성 각 1건 · 분해 실패 경로의 반탁 · 비탁음 유형은 갈래 null ·
    **판정 자체가 `classifyMistake` 와 언제나 같다**(기존 케이스 전수 대조)
- [x] **`ruleForMistake(type, voicing)`** — 갈래가 있으면 그 절로, 없으면 대표 절로
- [x] **이름과 한 줄 해설** — `mistakeLabel` / `mistakeHint`. 반탁·연성일 때만 해당 절의
  요약으로 바꾼다. `MISTAKE_ADVICE`(문헌 대조본)는 그대로 둔다
- [x] **기록 색인** — `ruleRecord` 를 이벤트 기반으로 다시 씀. 세 절이 같은 숫자를 보이던
  것이 갈래별로 갈린다. 라벨도 절의 갈래 이름으로
- [x] **검증 실행 (2026-09-17)** — `npm test` **446** (mistakes +6 · ruleRecord 재작성 6 ·
  rules +4) · `npx playwright test` **20 스펙**(reading-rules 에 반탁 이름 확인 추가) ·
  `tsc -b`/`oxlint`/`vite build` 클린

**안 바꾼 것** — 리포트의 오답 유형 분포와 처방은 `RENDAKU` 한 칸 그대로다. 이벤트에서
직접 세는 축이라 여기까지 가르려면 replay 가 사전을 알아야 한다. 진단 축은 묶인 채로 두는
게 맞다는 판단도 있다 (표본이 쪼개지면 처방이 늦게 뜬다). 규칙 본문에 그렇게 적었다.

---

## 하단 탭 — 셸 전환 (2026-09-17, 사용자 결정) ✅

**신호 셋이 걸려서 앞당겼다** (2026-09-14 「지켜볼 신호」). 신호 2 「어디서 왔는지 기억하는
화면이 셋째」(`browseFrom`·피드백·`rulesFrom`), 신호 3 「뒤로가기 2단계」(홈→리포트→규칙),
신호 4 「같은 화면을 두 자리에서」(다시보기·규칙). 신호 1(화면 13개 초과)은 정확히 경계다.

**실측 (390px)** — 첫 진입 894px / 화면 844px 로 **50px 넘침**(홈은 스크롤이 없어 잘린다).
돌아온 사용자는 844px 로 여유 0. `home-nav` 가 232px(27%)인데 본업인 「세션 시작」은 56px.

**확정 구성 — 탭 4개**

| 탭 | 루트 | 그 아래 |
|---|---|---|
| 학습 | 홈 | 세션·빠른·재대결·집중·다시보기·진단 (전체화면 흐름) |
| 리포트 | 진단 리포트 | 음독 맵 · 읽기 규칙 · 다시보기 |
| 찾기 | 읽기로 찾기 | — |
| 설정 | 설정 | 피드백 · 안내서(외부) |

- [x] **`src/app/TabBar.tsx` + CSS** — `--tap` 52px 이상, safe-area 하단 여백.
  **세션·진단·다시보기에서는 안 뜬다** — 키보드가 올라오는 화면이라 답 버튼과 겹치고
  카드 전환 150ms 예산에도 불리하다
  - 검증: e2e — 홈에 탭바가 있고 세션 화면에는 없다
- [x] **`App.tsx` 재작성** — `tab` + `sub`(탭 안 한 겹) + `flow`(전체화면). `browseFrom`·
  `rulesFrom` 같은 복귀 기억 상태를 **지운다** (탭이 그 자리를 기억한다)
  - 검증: 단위 — 없음(상태 전환은 e2e 로). e2e — 탭 이동 후 돌아오면 같은 자리
- [x] **화면별 뒤로가기 배선** — 탭 루트 넷(홈·리포트·찾기·설정)은 「‹」 를 없애고,
  하위 화면(음독 맵·규칙·피드백)은 자기 탭 루트로 간다
- [x] **홈 정리** — `home-nav` 와 상단 알약 둘을 걷어낸다. 남는 것은 세션 시작·3장만·
  틀렸던 것·첫 안내
  - 검증: 390px 실측으로 **첫 진입도 안 넘치는지**. 목표 660px 이하
- [x] **리포트에 음독 맵 진입** — `home-nav` 에서 사라지므로 취약 음독 절 아래로 옮긴다
- [x] **e2e 스펙 갱신** — 홈을 경유하는 이동 경로가 바뀐다
- [x] **검증 실행** — `npm test` · `npx playwright test` · `tsc -b` · `oxlint` ·
  `vite build` · 390px/1280px 캡처와 홈 높이 재실측

**검증 실행 결과 (2026-09-17)** — `npm test` **446** · `npx playwright test` **22 스펙**
(tab-shell 2건 신규 · reading-rules/reading-search/full-flow/browse-carousel/focus-session 경로 갱신) ·
`tsc -b`/`oxlint`/`vite build` 클린.

**홈 높이 (390px)** — 첫 진입 894 → **791px**, 돌아온 사용자 844 → **791px**. 둘 다 넘침 0.
탭바 53px 를 쓰고도 100px 이 줄었다. `home-nav` 232px + 상단 알약 44px 가 빠진 자리다.
넘침 0 은 `tab-shell.spec.ts` 가 계속 지킨다 — 길이는 취향이 아니라 기능이다.

**구현하며 막은 구멍** — 규칙 화면을 리포트 탭 아래로 옮기니 처방(읽기 30회)에서만 닿아
**처음 틀린 날 규칙을 못 여는** 상태가 됐다. 리포트 하단 「도구」 절(읽기 규칙·음독 맵)을
기록이 없어도 보이게 뒀다.

**같이 고친 것** — 음독 맵의 뒤로가기 라벨이 「홈으로」였는데 이제 홈이 아니라 자기 탭으로
가므로 「돌아가기」로 바꿨다 (규칙·피드백과 같은 말).

---

## 탁음 오답의 두 번째 구멍 — 「정답에 변형이 안 걸린 자리」 (2026-09-17, 사용자 지적) ✅

사용자 지적 「月額의 額는 연탁 규칙이 아니지 않나」. **맞다.** 額의 음독은 `ガク` 하나뿐이라
연탁이 일어날 청음 원형(かく)이 없다. 그런데 げつかく 오답이 「연탁」 배지를 받고 있었다.

원인은 `fromStrings` 첫 줄이다 — `unvoiceAll(정답) === unvoiceAll(오답)` 이면 바로 `RENDAKU`.
**정답 쪽에 변형이 실제로 걸렸는지를 안 봤다.** 탁음 하나만 어긋나면 전부 연탁으로 갔다.

- [x] **`voicedAt`** — 어긋난 표면 자리를 덮는 **정답 조각**에 `rendaku`·`renjo`·`handaku`
  변형이 붙어 있는지 본다. 안 붙어 있으면 `stringVoicing` 이 `null` 을 내고 `RENDAKU` 를 안 낸다
  - 정답 쪽이 분해 실패면(드묾) 가릴 근거가 없으니 기존 판정을 남긴다 — `expSegments === null`
  - 분해 경로(`fromSegments`)는 안 건드렸다. 거기는 이미 `variants` 로 판정한다
  - 검증: 단위 3건 — 月額 げつがく←げつかく · 金額 きんがく←きんかく 는 연탁 아님,
    **近所 きんじょ←きんちょ(답이 분해 안 되는 진짜 연탁)는 그대로 연탁**
- [x] **코퍼스 전수 대조** — 분해 성공 숙어 전부에 대해 각 조각을 청음으로 바꾼 오답을 만들어
  고치기 전/후를 비교했다
  - **거짓 연탁 6,562건 → 0건**
  - **진짜 연탁 1,198건 유지, 잃음 0건** (고치기 전에도 잃던 1건 `身勝手 みがって←みかって` 는
    분해 경로에서 `ONYOMI_CHOICE` 로 가는 별개 건이라 이번 변경과 무관 — 전후 동일)
- [x] **검증 실행 (2026-09-17)** — `npm test` **463** (mistakes +3, fixture 에 近·金·額 추가) ·
  `npx playwright test tests/e2e/browse-rule.spec.ts tests/e2e/reading-rules.spec.ts` **3 스펙 통과** ·
  `tsc -b`/`oxlint` 클린

**이벤트 스키마는 안 건드렸다.** 저장된 `answer`·`expected` 로 다시 매기므로 **지난 기록의
배지와 규칙 색인도 소급해서 고쳐진다.** 마이그레이션 없음.

### 뒤따라 고침 — 게이트가 과잉 적용까지 잘랐다 (2026-09-17, 사용자 지적 「愛好도 연탁이 맞나」)

`voicedAt` 이 방향을 안 보고 두 방향을 같이 잘랐다. **정답이 청음인데 답이 탁음인 자리**는
정답에 변형이 없다는 것이 곧 오답의 내용이라, 같은 잣대를 대면 과잉 적용이 통째로 죽는다.

- [x] **게이트를 놓친 방향에만** — 어긋난 자리에서 「정답이 탁음 · 답이 청음」일 때만
  `voicedAt` 을 따진다 (`missed`)
- [x] **전수 재측정 — 이번엔 두 방향** — 놓친 방향 진짜 1,198 유지·거짓 0 / 과잉 방향 8,381
  유지(**고치기 전과 정확히 같은 수치**). 3ef2a53 은 과잉 방향에서 706건을 잃고 있었다
- [x] **검증 실행 (2026-09-17)** — `npm test` **465** (mistakes +2, fixture 에 化·好·悪·愛 추가) ·
  `playwright` browse-rule/reading-rules **3 스펙** · `tsc -b`/`oxlint` 클린

**측정에서 배운 것** — 3ef2a53 은 청음화 오답만 만들어 돌렸다. **한 축을 고치면 그 축의
양끝을 다 생성해서 재야 한다.** 한쪽만 보면 전수 대조를 해도 반쪽이다.

### 세 번째 — 읽는 쪽이 저장된 유형을 쓰고 있었다 (2026-09-17, 사용자 지적 「絶好는 촉음 아닌가」)

분류기를 고쳐도 **지난 이벤트의 배지·절 색인은 그대로 연탁이었다.** `voicingByEvent` 가
갈래만 다시 매기고 유형은 저장값을 썼다. 3ef2a53 에서 「소급된다」고 한 보고가 틀렸다.

- [x] **`verdictByEvent`** — `RENDAKU` 로 저장된 이벤트를 지금 분류기로 다시 돌려 판정을
  통째로 돌려준다. 사전을 못 읽으면 항목을 안 넣어 저장값이 남는다
- [x] **`effectiveMistake`** — 규칙 화면 절 색인과 다시보기 배지가 **둘 다 이걸로만** 유형을
  본다. 한 곳만 고치면 배지와 절이 갈라진다
- [x] **검증 실행 (2026-09-17)** — `npm test` **470** (ruleRecord +5) ·
  `npx playwright test` **23 스펙 전량 통과** · `tsc -b`/`oxlint` 클린
  - 검증: 月額 げつがく←げつかく 를 `RENDAKU` 로 저장한 지난 이벤트가 배지에서도 절
    색인에서도 빠진다 · 三日月 みかづき←みかつき 는 그대로 남는다 · `SOKUON` 은 저장값 사용

**배운 것** — 고친 함수가 아니라 **사용자가 보는 화면까지** 따라가서 확인해야 한다.
분류기 단위 테스트가 통과하는 것과 배지가 바뀌는 것은 다른 일이다.

## 문법 노출 점검 — 축 A · 분류 정확도 전수 (2026-09-17, 사용자 지시) ✅

사용자가 축 넷 중 **「분류 정확도만 먼저」**를 골랐다. 나머지(본문 사실 · 노출 경로 일관성 ·
렌더링)는 다음 턴.

- [x] **`tools/audit-mistake-rules.ts` + `npm run audit:mistake-rules`** — 코퍼스 전수로 축별
  오답을 합성해 「그 축의 변형이 정답에 걸려 있었나」와 분류 결과를 대조한다
  - 탐침은 **축을 하나만** 흔든다 (`切 ぎっ` 의 base `きり` 는 연탁까지 벗긴다 — 그렇게 나온
    거짓 후보 3건은 탐침 문제였다)
- [x] **결과 — `月額` 모양(규칙이 안 걸린 자리인데 그 규칙) 세 축 모두 0건**
  - 촉음 뺌 961/961 `SOKUON` · 촉음 덧댐 2,753 `SOKUON` · 탁음 뺌 걸린 자리 1,195 전부
    `RENDAKU`·안 걸린 자리 0 · 탁음 덧댐 10,534 `RENDAKU` · 장음 흘림 9,839 `CHOON`
- [x] **장음 34건은 안 고쳤다** — 결함이 아니라 분해 모호성. 답이 다른 실재 읽기로도 분해된다
  (栄 훈독 `え` 25건 / 宮 `ク`+연탁 9건). 가드를 느슨하게 하면 神 シン↔ジン 같은 진짜
  음독 선택까지 장음으로 본다. 근거는 `context-notes.md` 같은 날 절
- [x] **검증 실행 (2026-09-17)** — `npm run audit:mistake-rules` 표 확인 ·
  `npm test` **470** · `tsc -b`/`oxlint` 클린

**점검 전에 나온 별건 (축 C 로 이월)** — 리포트는 `replay.ts` 가 **저장된** `mistakeType` 을
센다. 규칙 화면·배지는 다시 매긴다. 月額이 규칙 화면에서는 빠졌는데 리포트에서는 연탁으로
남아 있다.

## 문법 노출 점검 — 축 B · 본문 사실 검증 (2026-09-17) ✅

- [x] **예시가 그 절의 규칙을 실제로 갖고 있는지 검사** (`rules.test.ts` 4건) — 변형 절
  (촉음·반탁·연성·연탁)의 예시를 분해 결과와 대조. `offRule` 표시와 **양방향**으로 맞춘다.
  **앱이 그 절로 보내는 예시가 요약본(앞 3개) 안에 하나는 있는지**도 본다
- [x] **연성 절 — 예시 다섯 중 셋이 연성으로 분해 안 됨** (反応·観音·因縁). KANJIDIC 이
  `-ノウ`·`-ノン`·`-ネン` 을 읽기로 이미 실어 앱은 `ONYOMI_CHOICE` 로 본다.
  본문에 사실을 적고 天皇·安穏 을 앞으로 올렸다
- [x] **연성 단위 테스트가 사전을 조작하고 있었다** — `renjoCtx` 가 応에서 `-ノウ` 를 뺐다.
  실제 읽기로 바꾸고 天皇 으로 검증, 反応 이 `ONYOMI_CHOICE` 임을 테스트로 박았다
- [x] **연탁 절 「음독 한자어는 거의 안 걸리고」 수정** — 실제로는 연탁 자리 889 중 음독 288
  (32%). 음독 연탁의 76%가 ん·장음 뒤라는 패턴으로 바꿨다
- [x] **서술의 숫자를 테스트로 고정** (`rules.test.ts` 3건) — 훈독 비율 60~75% · 음독 연탁
  100건 초과 · ん/장음 앞 70% 초과
- [x] **확인만 하고 안 고침** — 라이먼의 법칙 위반 0건 · ㅇ받침↔장음 371/375(98.9%) ·
  半分 은 의도된 반례라 `offRule` 표시만
- [x] **검증 실행 (2026-09-17)** — `npm test` **478** (rules +7, mistakes +1) ·
  `playwright` reading-rules/browse-rule **3 스펙** · `tsc -b`/`oxlint` 클린

**기각 — `-ノウ` 류를 분해에서 연성으로 태그.** 음독 쌍 식별자(`応:on:のう`)가 바뀌어
**지난 학습 기록이 다른 쌍을 가리키게 된다.** 스키마에 준하는 변경이라 범위 밖.

## 문법 노출 점검 — 축 C · 노출 경로 일관성 (2026-09-17) ✅

- [x] **리포트가 저장된 유형을 세던 것** — `ReplayOptions.mistakeOf` 를 달아 다시 매긴다
  (`pairsOf` 와 같은 관례, replay 는 여전히 순수 접기)
- [x] **다시 매기는 자리를 하나로** — `reclassifier`. 규칙 화면·다시보기(`verdictByEvent`)와
  리포트(`mistakeOf`)가 둘 다 이 함수를 지난다
- [x] **분포를 갈래로 나눈다** (사용자 지적 「각각을 나눌 수가 없나」) — `voicingCounts` +
  `mistakeRows`. 「연탁 3 · 반탁 2」로 카드와 같은 이름이 된다.
  갈래 합계가 모자라면 남는 만큼 「연탁」 한 칸으로 남겨 **숫자를 잃지 않는다**
- [x] **처방은 문턱을 묶은 채, 내미는 절만 dominant 갈래로** — `dominantVoicing`.
  갈래가 섞였으면 「한 칸으로 묶어 센 값」 한 줄을 붙인다
- [x] **버킷 이름 바꾸기는 안 한다** — 축을 가르니 필요가 없어졌다. 근거는 `context-notes.md`
- [x] **검증 실행 (2026-09-17)** — `npm test` **489** (replay +3 · ruleRecord +8) ·
  `npx playwright test` **24 스펙** (report-voicing 신규) · `tsc -b`/`oxlint` 클린
  - 검증: 반탁 2 · 연탁 1 을 `RENDAKU` 로 심고 리포트 분포에 「반탁 2 / 연탁 1」이 뜨는지

## 문법 노출 점검 — 축 D · 렌더링 (2026-09-17) ✅

- [x] **실행 중인 화면을 훑는 검사** (`tests/e2e/ja-lang.spec.ts`, 3 스펙) — 텍스트 노드를
  순회해 일본어가 `lang="ja"` 밖에 있는 자리와 화면에 그대로 찍힌 마크다운을 모은다.
  판정 범위는 앱 자신의 `JA_RUN` 과 같다
- [x] **찾은 것 — 절 제목 세 자리가 `Mixed` 를 안 지났다**
  `Rules.tsx`(절 머리) · `Browse.tsx`(다시보기 규칙 제목) · `MistakeDetail.tsx`(왜 그런가).
  본문·요약·예시 주석은 처음부터 지나는데 제목만 빠져 있었다
- [x] **검사의 자기검사** — 화면마다 일본어를 몇 개 봤는지 같이 세고 0이면 실패시킨다.
  이동이 실패해 빈 화면을 훑어도 통과하는 것을 막는다.
  이동 확인도 그 화면 고유 요소로 한다 (`.section-title` 은 리포트에도 있어 헐겁다)
- [x] **음성 대조 둘 다** — `lang` 누락은 실제 2건을 잡았고, 마크다운은 `MISTAKE_LABEL` 에
  `**` 를 넣어 잡히는 것을 확인했다 (`summary` 로 시험한 첫 대조는 `Mixed` 가 별표를
  `<strong>` 으로 바꿔서 안 걸렸다 — **대조를 잘못 세우면 결론도 틀린다**)
- [x] **검증 실행 (2026-09-17)** — `npm test` **489** · `npx playwright test` **27 스펙** ·
  `tsc -b`/`oxlint` 클린

**훑은 범위** — 홈 · 리포트 · 읽기 규칙(8절 펼침) · 다시보기 · 음독 맵 · 세션 읽기 카드 ·
오답 피드백 · 오답 상세 · 사용 안내서.
**안 훑음** — 진단 흐름 · 설정 · 피드백 보내기 · 세션 요약 (일본어가 없거나 같은 컴포넌트).

## 문법 노출 점검 — 축 A' · 구조 판정 유형 (2026-09-17, 착수) ⏳ 열린 항목 1

축 A 는 **변형 기반 축**(촉음·탁음·장음)만 「근거가 있나」를 물었다. 구조 판정 셋
(`KO_INTERFERENCE`·`ONYOMI_CHOICE`·`MIXED_READING`)은 변형 태그가 없어 같은 잣대를 못 댔고,
**다른 잣대를 세우지도 않아 미검증으로 남았다.**

`KO_INTERFERENCE` 부터 본다 — 제일 크고(탁음 뺌 오답에서 2,553건), **月額 수정이 만들어낸
표면**이다. 고치기 전엔 전부 「연탁」이던 자리가 지금 여기로 온다.

- [x] **1. 잣대 — 한국음 → 일본 음독 대응표를 코퍼스에서 귀납한다**
  - `base.json` 의 실재 숙어에서 (한국 한자음, 일본 음독) 쌍과 빈도를 뽑는다
  - **분류기 코드가 자기를 채점하지 않게** 한다. `koInterference` 가 쓰는 기준
    (「형제 한자의 음독이면서 자기 읽기가 아님」)으로 재면 같은 논리를 되읽는 것뿐이다
  - 검증: 표가 `korean-coda` 절의 서술(ㄱ→く·き, ㄹ→つ·ち, ㅇ→う·い)과 맞는지.
    **여기서 축 B 의 미검증분(라이먼·ㅇ받침↔장음)도 같이 걸린다**
- [x] **2. 대조 — `KO_INTERFERENCE` 판정 전수를 그 표로 채점한다**
  - 검증: 「이 오답이 한국음에서 끌려온 것인가」가 표로 설명되는 비율. 표본 출력
- [x] **3. 판정 — 거짓 양성이 나오면 규모와 표본을 들고 **먼저 보고한다**
  - 축 A 의 장음 34건처럼 「모호성이라 안 고침」으로 끝날 수도 있다
  - **고치는 쪽으로 가면 파장이 오늘보다 크다** — `KO_INTERFERENCE` 는 `fromStrings` 의
    마지막 검사라, 손대면 `DECOMPOSED_PRIORITY` 까지 건드리게 되고 그건 리포트 진단 축과
    처방에 그대로 이어진다. 오늘 고친 것들은 「잘못 붙은 이름을 떼는」 쪽이라 파장이 좁았다
- [ ] **4. 이어서 `ONYOMI_CHOICE`·`MIXED_READING`** — 잣대가 서면 같은 도구로

**안 하는 것** — 대응표를 파일로 남기지 않는다. 감사 스크립트 안에서만 계산한다.
사전 DB 에 산출물을 더하면 빌드·배포·갱신이 딸려온다 (CLAUDE.md 「사전 DB와 사용자 DB 분리」).

**중단 대비 (2026-09-17 사용자 우려)** — 단계마다 커밋하고, 끊긴 지점을 `context-notes.md` 에
남긴다. 최악이어도 잃는 건 마지막 한 단계다.

**축 A′ 결과 (2026-09-17)**
- **잣대** — 종성→꼬리 대응을 귀납했고 절 서술 여섯 줄이 다 맞다 (ㄱ 85% · ㄹ 83% ·
  ㅁ 95% · ㄴ 96% · ㅂ 73% · ㅇ 90%). `rules.test.ts` 가 고정한다.
  **축 B 에서 안 박고 넘겼던 것들이 여기서 같이 박혔다**
- **분류기는 제 일을 한다** — 진짜 간섭 96,433건 중 96.7%가 `KO_INTERFERENCE` 로 간다
- **탐침이 또 한쪽만 만들었다** — 청탁 변화만 만들어 놓고 결론 낼 뻔했다. 진짜 간섭 오답을
  같이 만들어 다시 쟀다 (축 A 와 같은 함정)
- **드러난 구멍 — 청탁에는 절이 없다.** 경계 문단을 `korean-coda` 절 **뒤쪽**에 넣었다
  (이 절 오답의 96.7%가 꼬리라 앞자리를 안 내준다)
- **「받침 없는데 장음도 있어요」가 41%를 「있어요」로 말했다** — 「열에 넷」으로 고치고 고정
- [~] **새 오답 유형 `VOICING_UNMARKED` — 보류.** 2026-09-18 에 사용자가 **「표시」**를 골라
  `VoicingKind` 에 `'unmarked'` 갈래를 넣는 쪽으로 갔고 그건 구현·배포됐다(42cba16).
  **새 유형은 실사용 기록이 쌓인 뒤 판단한다** — 독립 처방이 값을 할 만큼 이 갈래가
  자주 나오는지 지금은 못 잰다(합성 숫자라 실사용 분포가 아니다). 아래는 그때 볼 근거다.
  청탁 오답이 네 유형으로 흩어진다
  (`RENDAKU` 11,732 · 미분류 4,139 · `KO_INTERFERENCE` 2,596 · `ONYOMI_CHOICE` 1,269).
  **`mistakeType` 은 스키마 불변 조건이라 사용자 결정 필요.** `fromStrings` 마지막 검사를
  손대면 `DECOMPOSED_PRIORITY` → 리포트 진단 축 → 처방까지 번진다

## 청탁 미구분 — 「표시」 방식 (2026-09-18, 사용자 결정) ⏳ 열린 항목 2

세 안 중 **표시**(탁음 바구니 안의 갈래 추가)로 정해졌다. 새 유형은 실사용 기록이 쌓인 뒤
판단한다. 단계로 쪼개 되돌리기 지점을 만든다.

- [x] **1단계 · 청탁 절을 만든다** (`voicing-unmarked`) — 순수 추가, 판정은 아직 안 온다
  (`mistakes: []`). 자리는 연탁 절 바로 뒤 — 「변한 것」 다음에 「원래 그런 것」
  - [x] 어제 `korean-coda` 에 넣은 예가 틀렸던 것 수정 — 一画 いっかく 의 画는 カク 라
    ガ 의 예가 아니다. 사전으로 확인한 「호」 짝(愛護 ↔ 愛好)으로 교체
  - [x] **note 검증 테스트** — (한자, 한국음, 읽기) 셋이 다 사전·숙어와 맞는지.
    음성 대조 통과(一画 을 도로 넣으면 걸린다). **축 B 검사는 「코퍼스에 실재하는가」까지만
    봐서 一画 을 통과시켰다 — 실재하는 것과 논지를 보여주는 것은 다르다**
  - [x] 절 개수 8 → 9 로 바뀐 자리 갱신 (e2e · `screens.css` 주석 · `PLAN.md`)
  - [x] 검증: `npm test` **499** · `tsc -b`/`oxlint` 클린 · 규칙 e2e 6 스펙
- [x] **2단계 · 갈래 `unmarked` 를 내고 이 절로 보낸다**
  - 조건: **정답 조각에 탁음 변형 없음 + 음독**. 훈독(453건)은 진짜 연탁 과잉 적용이라 제외
  - 검증: 움직인 건수가 **7,928과 정확히 같은지**. 하나라도 더 움직이면 경계가 틀린 것
  - 우선순위(`DECOMPOSED_PRIORITY`)는 안 건드린다
- [x] **3단계 · 미분류 3,521 을 청탁 미구분으로** (2026-09-18). 결과는 아래 블록
- [ ] **`ONYOMI_CHOICE` 1,219 — `ONYOMI_CHOICE` 감사가 선행 조건.** 그 글자에 청음 음독이
  따로 실재하면 「다른 음독을 골랐다」가 맞는 판정이라, 갈라보기 전엔 얼마를 끌어올지 모른다
- [ ] **`KO_INTERFERENCE` 2,596 — 급하지 않다.** 이름이 안 틀렸고 절 내용도 맞다(청탁 문단).
  절을 바꾸는 이득이 분포를 흔드는 대가보다 큰지는 실사용 빈도를 봐야 안다

**2단계 결과 (2026-09-18)**
- **움직인 건수 7,928 — 착수 전에 정한 기준과 정확히 일치.** 경계 위반 0건
- 훈독 453건은 `rendaku` 로 남았다 (진짜 과잉 적용, 92e7381 보존)
- 변형이 걸린 1,198건도 그대로. 합계 9,579 = 어제 잰 탁음 판정 총합
- **다른 유형에서 아무것도 안 끌어왔고 `DECOMPOSED_PRIORITY` 도 안 건드렸다**
- `Record<VoicingKind, …>` 가 exhaustive 라 빠진 자리를 컴파일러가 다 짚었다 —
  **갈래를 늘리는 쪽이 유형을 늘리는 쪽보다 안전한 실질적 이유**
- 92e7391 의 테스트는 `type` 만 보게 고쳤다 (지키려던 건 유형이 안 죽는 것)
- 검증: `npm test` **503** · `voicing-unmarked.spec.ts` 2건 신규(분포·배지·절 색인) ·
  `tsc -b`/`oxlint` 클린

**3단계 결과 (2026-09-18)**
- **「3단계」로 묶어 부른 게 판단을 흐렸다.** 흩어진 7,336 을 한 덩어리로 보고 「우선순위를
  건드려야 하니 위험하다」고 미뤄 왔는데, 셋의 성격이 달라 **미분류만 떼면 안 건드린다**
- `stringVoicing` 이 `defer` 를 내고 `fromStrings` 가 촉음·장음·한국음 간섭을 다 거친 뒤
  **마지막 `null` 자리에서만** 쓴다 — 이름이 **없는** 것만 받는다
- 전후 대조: `unmarked` 7,928→11,449(+3,521) · 미분류 3,966→445(−3,521) ·
  `KO_INTERFERENCE`·`ONYOMI_CHOICE`·`rendaku`·`handaku`·`MIXED_READING` **전부 불변**
- 남은 445 는 훈독 자리의 청탁(右手 みぎて ← みきて). 한국음은 훈독과 무관하므로 미분류가
  맞다 — 테스트로 박았다
- 깨진 테스트 다섯은 **논지를 살려** 고쳤다. 그 테스트들의 논지는 「분류가 안 된다」가 아니라
  **「연탁이 아니다」**였다 (3ef2a53 때는 이름이 없는 게 최선이었을 뿐)
- 검증: `npm test` **508** · `npx playwright test` **29 스펙** · `tsc -b`/`oxlint` 클린

---

## 갈래가 답의 모양을 따라가던 것 (2026-09-18, 사용자 지적) ⏳ 열린 항목 1

- [x] **`voicingOfExpected`** — 갈래는 답이 아니라 **정답 조각이 든 변형**이 정한다.
  寸法 すんぽう 의 法는 `handaku` 자리라 すんぼう 로 쓰든 すんほう 로 쓰든 반탁이다.
  전에는 답이 ぼう 면 `differs('rendaku')` 가 먼저 걸려 연탁 절로 보냈다
- [x] **분해 경로 둘 + 문자열 경로**에 다 걸었다. `voicedAt`·`unmarkedVoicing` 은 이미 정답
  쪽을 보고 있었고 **갈래 이름을 고르는 한 줄만** 답을 보고 있었다
- [x] **전수 확인** — 「판정된 갈래 = 정답 쪽 변형」 불일치 **0**.
  `rendaku` 2,528→2,221(−307) · `handaku` 310→**617**(+307) · **나머지 전부 동일**.
  유형은 하나도 안 움직였다 (탁음 바구니 안에서만 재배분)
- [x] **감사 탐침에 ぱ행 탁음화를 넣었다** — `VOICE` 표에 ぱ→ば 가 없어서 반탁 자리에 탁음을
  쓰는 오답을 **생성조차 안 했다.** 탐침이 못 만드는 오답은 감사에도 안 보인다
- [x] 검증: `npm test` **511** (寸法 회귀 3건) · `playwright` **29 스펙** · `tsc -b`/`oxlint` 클린
- [x] **범위는 寸法만이 아니었다 — 307건 / 306개 숙어** (圧迫·安否·一杯 …). 반탁 자리를
  탁음으로 쓴 오답이 전부 연탁으로 갔다. 한국음 받침에서 유추하기 쉬운 쪽이라 더 흔할 수 있다
- [x] **殺生 확인 — 버그 아님.** 실제 기록의 답이 `さっしょう`·`さつじょう` 로 **촉음은
  제대로 썼고** 원형만 틀렸다. 촉음만 놓친 오답은 전수 **961 / 961 이 `SOKUON`**
- [ ] **복합 오답에서 한 축만 말하는 게 맞나** — 원형과 촉음이 둘 다 틀린 579건에서 촉음은
  아무 말도 안 듣는다. 설계된 동작이고 근거도 있지만(「`セツ` 를 모르면 촉음을 물어봐야
  소용없다」) 검토한 적은 없다

---

## 다음 세션에서 이어갈 것 (2026-09-18 갱신)

**바로 집을 수 있는 것**
1. **`ONYOMI_CHOICE`·`MIXED_READING` 감사** — 구조 판정 중 아직 미검증인 둘. 잣대와 도구가
   이미 있다 (`npm run audit:ko-interference` 의 귀납 표, `npm run audit:mistake-rules`).
   **`ONYOMI_CHOICE` 감사는 그 자체로도 값이 있고, 위 「1,219 끌어오기」의 선행 조건이다**

**결정이 있어야 움직이는 것**
2. `KO_INTERFERENCE` 2,596 을 청탁 미구분으로 끌어올지 — 이름이 안 틀렸으니 급하지 않다.
   실사용 빈도가 근거가 된다
3. 새 `MistakeType` 으로 올릴지 — 지금은 `VoicingKind` 갈래로 두고 있다.
   독립 처방이 값을 할 만큼 자주 나오는지 실사용 기록으로 판단한다

**사용자 몫**
4. 실기기 확인 다섯 건 (진단 체감 · 처방이 「다음에 뭘 할지」로 읽히는지 · iOS 키보드 올린 채
   카드 3~4장 · 배포판 정리 후 Drive 파일 · 예고가 궁금증인지 소음인지)

**손대면 안 되는 경계 (2026-09-17~18 작업에서 확인한 것)**
- **훈독 자리의 탁음은 건드리지 않는다** — 과잉은 진짜 연탁 과잉 적용이고(92e7381),
  놓친 쪽은 한국음과 무관해 미분류가 맞다. `unmarked` 는 **음독 전용**이다
- **`-ノウ` 류를 연성으로 태그하지 않는다** — 음독 쌍 식별자가 바뀌어 지난 학습 기록이
  다른 쌍을 가리킨다
- **검증 장치를 먼저 의심한다** — 이틀간 네 번 다 탐침·픽스처·음성 대조가 틀려서 결론이
  틀렸다. 테스트는 초록이었다
- **여러 건을 한 이름으로 묶어 부르지 않는다** — 「3단계」가 그래서 며칠 미뤄졌다.
  갈라보면 위험도가 다르다

---

## 찾기에서 담아 두기 — 학습 대상 추가 (2026-09-21, 사용자 요청) ✅

**2026-09-16 에 기각했던 C안(찜하기)을 사용자가 뒤집었다.** 근거는 `context-notes.md`
같은 날 절. 당시 기각 사유 둘 중 하나(스키마 증가)는 이벤트 **한 종류**로 줄었고,
다른 하나(효용 불확실)는 밴드 0 3,976개가 정규 세션에 안 나온다는 사실이 답한다.

**B안(지금 풀어보기)은 여전히 안 한다.** 담은 것은 다음 세션에 **소개**로 먼저 나온다.

- [x] **`src/core/types.ts`** — `StarEvent` 추가. 담기·빼기를 `on: boolean` 한 종류로 접는다
  - 스토어도 PK 도 `DB_VERSION` 도 안 건드린다. `events` 스토어가 그대로 받는다
  - `cardType: 'reading'` 고정 (`MeaningKnownEvent` 가 `'meaning'` 을 고정한 것과 같은 관례)
  - 검증: `tsc -b` 가 union 을 안 다룬 소비처를 전부 짚는다
- [x] **`src/core/replay.ts`** — `starred: Set<string>` 파생. 마지막 이벤트가 이긴다
  - 검증: 단위 — 담기 / 빼기 / 다시 담기 · 입력 순서를 섞어도 같은 결과 · 묘비 제외
- [x] **`src/core/select.ts`** — 담은 것을 **due 보다 먼저**, 정원의 1/3 까지
  - 밴드 제한(`minBand`·`maxBand`)을 면제한다 — 안 그러면 밴드 0 을 담아도 안 나온다
  - **이미 카드가 있으면 별은 아무 일도 안 한다** — FSRS 가 이어받는다
  - 검증: 단위 — 밴드 0 을 담으면 나온다 · due 보다 앞선다 · 1/3 상한 ·
    카드가 있으면 무효 · 안 담았을 때 기존 결과가 그대로다
- [x] **`src/core/session.ts`** — `recordStar` 팩토리. `base()` 가 `elapsedMs` 를 안 쓰므로
  컨텍스트 타입만 좁힌다
- [x] **`src/app/Search.tsx`** — 결과 줄에 담기 토글, 안 쳤을 때 담아 둔 목록 + 빼기
  - 새 화면을 안 만든다. 목록은 `Scope` 위에 붙인다
  - 검증: e2e — 담으면 표시가 남고 · 다시 누르면 빠지고 · 새로고침해도 유지된다
- [x] **끝에서 끝까지** — 찾기에서 담고 세션을 시작하면 그 표현이 나온다
  - 검증: e2e — **밴드 0 숙어를 담아** 세션 첫 장에서 만난다 (밴드 면제가 실제로 먹는지)
- [x] **검증 실행** — `npm test` · `npm run e2e` · `tsc -b`/`oxlint`/`vite build`
  - 실행 결과 (2026-09-21) — `npm test` **577** · `playwright` **44 스펙** ·
    tsc·oxlint·build 클린. **대조군도 돌렸다** — 담기만 빼면 明白 이 세션에 안 나온다

---

## 홈·리포트가 덜컥거리는 것 (2026-09-21, 사용자 지적) ✅

사용자 실기기 영상: 홈과 진단 리포트가 뜰 때 화면이 튄다. **React 탓이 아니다** —
실측에서 CLS 0, 롱태스크 105ms 한 건. 기전은 둘이다.

1. **2단계 렌더 + 세로 중앙 정렬.** `.home` 이 `justify-content: center` 인데 데이터가
   늦게 와서 `10장만`·`틀렸던 것` 묶음이 그때 생긴다. 아래에 150px 이 붙으면 제목까지
   75px 위로 밀린다
2. **탭을 옮길 때마다 다시 계산한다.** 화면이 언마운트되므로 `listEvents` → `replay` →
   `buildSession`(후보 16,959개)을, 리포트는 거기에 재분류·`buildReport`·`buildLevel`·
   `prescribe` 까지 매번 다시 돈다

**스켈레톤은 안 쓴다.** 스켈레톤은 「기다리는 중」을 알리는 장치고 지금 문제는 다 그려진 뒤에
내용이 **움직이는 것**이다. 높이가 안 맞는 스켈레톤은 교체될 때 똑같이 덜컥한다.
이 앱엔 이미 맞는 관례가 있다 — `.answer-row` 3슬롯 고정(`.slot` 으로 빈자리를 지켜
「엄지가 한 자리에 머문다」). 홈이 자기 규칙을 안 지키고 있었다.

- [x] **`src/core/dataVersion.ts`** — 사용자 데이터가 바뀐 횟수. 화면 캐시의 무효화 키
  - 이벤트 쓰기(`appendEvent`·`importEvents`·`importMissingEvents`·동기화 초기화)와
    설정 저장(`saveSettings`)에서 올린다. 설정도 세는 이유는 `sessionLimit`·`ratio` 가
    홈 미리보기를 바꾸기 때문이다
  - 검증: 단위 — 쓰기마다 오르고, 읽기로는 안 오른다
- [x] **홈·리포트 모듈 캐시** — 버전이 같으면 다시 계산하지 않는다
  - `useState` 초기화에서 캐시를 꺼내 **첫 렌더부터 완성된 화면**을 그린다 (로딩 단계 없음)
  - 검증: e2e — 탭을 오갔다 와도 「불러오는 중」이 안 뜬다
- [x] **홈 자리 예약** — 로딩 중에 `10장만`·`틀렸던 것` 자리를 미리 잡는다
  - 진단 전 분기에는 안 넣는다 — 그 분기엔 그 버튼들이 없다
  - 검증: e2e — 로딩 중과 로딩 후에 제목·주 버튼의 y 좌표가 같다
- [x] **검증 실행** — `npm test` · `npm run e2e` · tsc/oxlint/build
  - 실행 결과 (2026-09-21) — `npm test` **592** · `playwright` **46 스펙** · tsc·oxlint·build 클린.
    **테스트가 헛돌던 것을 잡았다** — 로딩 상태를 고정(page.route)하고 진짜 숙어 id 로 오답을 심는다

---

## 한 한자의 음독 대조 세션 (2026-09-21, 사용자 요청) ✅

오음·한음 층위 라벨은 안 만든다 (출처 없음 + 예측력 없음, `context-notes.md` 같은 날).
대신 **한 한자에 음독이 둘이라는 사실**만 쓴다 — 임계 3개로 114자다.

- [x] **`src/core/contrast.ts`** — 형제 음독 찾기. `pairId` 와 pairId→숙어 수를 받아
      같은 한자의 다른 `on` 쌍을 숙어 수 순으로 낸다
  - `CONTRAST_MIN_IDIOMS = 3`. 그 아래는 번갈아 낼 것이 없어 대조가 안 선다
  - 검증: 단위 — 人 이 형제를 찾고 · 임계 미만은 빠지고 · 훈독과 자기 자신은 안 섞인다
- [x] **`buildFocus` 가 쌍 집합을 받는다** — `pairId` → `pairIds`
  - 검증: 단위 — 두 음독이 번갈아 나오고 · 쌍 하나면 기존 결과와 같다
- [x] **`prescribe` 가 대조를 싣는다** — `siblingsOf` 콜백(`unlocksOf` 와 같은 관례),
      `ONYOMI` 처방에 `contrast` 필드
  - 검증: 단위 — 형제가 있으면 실리고 · 없으면 `undefined` 라 기존 처방 그대로다
- [x] **리포트 버튼 + 흐름** — `Flow.focus` 가 `pairIds` 를 나른다, 문구를 음독 둘을
      나란히 적는 쪽으로
  - 검증: e2e — 처방에서 눌러 세션에 들어가면 두 음독의 숙어가 섞여 나온다
- [x] **검증 실행** — `npm test` · `npm run e2e` · tsc/oxlint/build
  - 실행 결과 (2026-09-21) — `npm test` 592 → **608** · `playwright` 48 → **49 스펙** ·
    tsc·oxlint·build 클린
  - **대조군도 돌렸다** — 처방이 형제 쌍을 안 넘기게 되돌리면 e2e 가 실패한다.
    처음엔 요미가나 때문에 표기 추출이 헛돌아 통과 직전까지 갔다 (rt 를 걷어내 고쳤다)

---

## 다시보기 마지막 장에서 한 벌 더 (2026-09-21, 사용자 요청) ✅

「맨 마지막에 돌아가기로 빠져 나가거나 다른 표현 30개를 보던가」.

- [x] **`pickBrowse` 를 제네릭으로 + `pickBrowseMore`** — 이번 방문에서 안 낸 것부터
      채우고 모자라면 이미 낸 것에서 메운다. 늘 30장을 채운다
  - 검증: 단위 — 안 본 것이 먼저 · 모자라면 메워서 수를 채우고 · 후보가 적으면 있는 만큼만
- [x] **`Browse` 가 후보 전량을 들고 있는다** — 새로고침이 DB 를 다시 안 읽게
  - 검증: 단위(코어) + e2e 로 갈음
- [x] **마지막 장 버튼 3슬롯** — 이전 · 다른 30개 · 돌아가기. 그 전 장에서는 오른쪽이
      빈 `.slot` 이라 **이전·다음 자리가 안 움직인다**
  - 후보가 화면 수보다 많으면 「다른 N개」, 아니면 「한 바퀴 더」 — 문구가 거짓말하면 안 된다
  - 2026-09-21 수정 — 빈 슬롯이 남아 왼쪽으로 쏠렸다. 양 끝을 글자 폭, 가운데를 `1fr` 로
    (`context-notes.md` 같은 날). 검증: e2e 가 375px 에서 줄 오른쪽 빈 자리를 잰다
  - 검증: e2e — 마지막 장에서 눌러 1/N 로 돌아오고 · 목록이 바뀌고 · 돌아가기도 그대로 산다
- [x] **검증 실행** — `npm test` · `npm run e2e` · tsc/oxlint/build
  - 실행 결과 (2026-09-21) — `npm test` 608 → **612** · `playwright` 49 → **51 스펙** ·
    tsc·oxlint·build 클린
  - **후보가 적을 때를 따로 잡았다** — 겹치는 목록으로 한 벌 더 부르면 12번째 장으로
    끌려갔다. 스냅 컨테이너가 직전에 스냅된 **요소**를 다시 찾아가는 것이었다
    (`context-notes.md` 같은 날)

---

## 다시보기 요미가나 가리기 (2026-09-21, 사용자 요청) ✅

「스크래치 카드처럼 가렸다가 버튼을 클릭하면 보였으면 한다. 가릴 것인지 오프해 둘 것인지
설정에서 조정.」

- [x] **`settings.ts`** — `browseMask: boolean`, 기본 가림
  - 검증: 단위 — 기본값·깨진 값이 가림으로 오고, 끔이 그대로 산다
- [x] **가림막 CSS** — `rt` 를 덮되 **자리는 그대로**. 펼칠 때 카드가 안 움직인다
  - 검증: e2e — 가렸을 때와 펼쳤을 때 `.headword` 박스가 같다
- [x] **`Browse`** — 카드마다 가림/펼침. 넘겼다 오면 다시 가려진다 (예문·규칙과 같은 관례)
  - 검증: e2e — 눌러야 읽기가 보이고 · 옆 카드는 그대로 가려져 있고 · 떠났다 오면 다시 가려진다
- [x] **`Settings`** — 「다시보기 요미가나」 가림/안 가림
  - 검증: e2e — 끄면 버튼 없이 처음부터 보인다
- [x] **검증 실행** — `npm test` · `npm run e2e` · tsc/oxlint/build
  - 실행 결과 (2026-09-21) — `npm test` 612 → **613** · `playwright` 51 → **53 스펙** ·
    tsc·oxlint·build 클린. 375px 실캡처로 가림·벗김 확인
  - 2026-09-21 수정 — 막대 길이가 읽기 길이였다. 고정 폭으로 (`context-notes.md` 같은 날).
    검증: e2e 가 30장 전부의 **그려진** 막대 폭을 잰다
  - 2026-09-21 재수정 — `rt::after` 절대 배치가 **iOS Safari 에서 깨졌다**(막대 넷이 카드
    한가운데 기둥으로). 위치 지정을 빼고 배경 + `min-width` 로. 크롬 e2e 는 다 통과했던 건이라
    **브라우저 하나로만 보는 구멍이 있었다**
- [x] **e2e 에 WebKit 프로젝트** (2026-09-21 사용자 지시) — 그려진 결과를 재는 스펙만
      (`browse-mask`·`browse-reroll`·`ja-lang`). 흐름·로직은 크롬 한 번으로 족하다
  - 검증: `rt` 의 computed position 이 크롬 `relative` / WebKit `static` 임을 엔진에서 확인
  - 올리자마자 `ja-lang` 의 DB 심기가 WebKit 에서 멈추는 걸 잡았다 (`context-notes.md`)
  - **버튼을 치우니 한자가 19px 내려앉았다** — 본문이 세로 가운데 정렬이라 한 줄이 빠진 탓이다.
    「다시 가리기」로 뒤집어 자리를 지킨다 (`context-notes.md` 같은 날)


---

## 밴드 사다리 배지 + 한 줄 (2026-09-22, 사용자 요청) ✅

- [x] **알약 배지** — 안정/흔들림/표본 부족/미학습. 색은 흔들릴 때만
  - 검증: e2e — `border-radius: 999px` 이고 라벨이 넷 중 하나다
- [x] **막대 우측 텍스트 제거** — 그리드 3열 → 2열
  - 검증: e2e — `.ladder .bar-num` 이 0개다
- [x] **수치를 아래 한 줄로** — 「출제된 표현 N개 / 숙지한 표현 N개 (최근 N회 N%)」
  - 사용자 문구의 「맞춘 표현」은 **데이터에 없는 수**라 「숙지한 표현」으로 냈다
    (`context-notes.md` 같은 날)
  - 검증: e2e — 문구가 맞고, 기본 글자에서 **한 줄**이다 (실측 261px / 가용 286px)
- [x] **검증 실행** — `npm test` 613 · `playwright` 60 · tsc·oxlint·build 클린

---

## 훈독 숙어를 별도 트랙으로 (2026-09-22, 사용자 요청 "훈독만 카테고리로 따로 빼서 학습") ✅

발단은 뜻 검수 관문의 부산물이다. 큐레이션에 모델을 쓰려고 표본을 짜다가, 사용자가
어색하다고 지적한 것들(`荒木`·`滝川`·`稲田`·`浜辺`·`生糸`·`山奥`·`北風`)이 **전부
음독 쌍이 없는 숙어**임을 확인했다. 모델이 판정할 게 없다 — `pairIds` 가 이미 답이다.
고유명사 갈래는 애초에 없었다: `base.json` 의 `pos` 에 `n-pr` 이 0건이다 (JMdict 본체에
인명이 없다).

- [x] **빌드가 갈래를 매긴다** — `readingKind: 'on' | 'mix' | 'kun'` (`build-runtime-dict.ts`)
  - 검증: `base.json` on 14,721 · mix 736 · kun 1,502 / `band4.json` on 70,549 · mix 8,807 · kun 6,062
- [x] **로더에 트랙 분리** — `StudyTrack` · `inTrack()` (`src/dict/load.ts`)
  - 혼독(重箱·湯桶読み)은 **음독 트랙에 남긴다** — 음독 쌍이 있어 대조·처방이 그대로 걸린다
  - 검증: `src/dict/track.test.ts` 15건
- [x] **기본 세션·홈 미리보기·진입 진단에서 훈독 제외**
  - 검증: e2e `kun-track.spec.ts` — 기본 세션에 그려진 훈독 카드 0장
- [x] **홈에 「훈독 숙어」 진입로** — `Flow` 에 `kind: 'kun'`, 배지는 무채(오답 수가 아니다)
  - 검증: e2e — 그 세션에 그려진 카드가 전부 훈독
- [x] **음독 수준 판정에서 훈독 기록 제외** — `bandOf` 가 `undefined` 를 준다.
      `level.ts` 는 안 건드렸다 (이미 `undefined` 를 건너뛴다)
- [x] **검증 실행** — `npm test` 628 · `playwright` 55 스펙 · tsc·oxlint·build 클린
  - 회귀 하나를 검사가 잡았다: 훈독 버튼을 자리잡기(slot) 없이 붙였더니 `.home` 의
    세로 중앙 정렬 때문에 제목이 **42px 밀렸다**. `screen-cache` 가 잡았고 slot 을 넣어 고쳤다

---

## 뜻 신고 「이 뜻 이상해요」 (2026-09-22, 사용자 요청)

미검수 15,640건을 표로 훑는 대신 **쓰다가 걸리는 것을 잡는다.** 근거는 `context-notes.md`
같은 날 — stdict 건에서 표 검수가 9건을 틀린 방향으로 판정했고, 그걸 바로잡은 건
앱을 쓰며 얻은 감각이었다.

- [x] **①단계 — 재생에 모르는 이벤트 타입 가드** (선행 조건, 배포 `c5cdf76`)
  - 검증: 가드를 빼면 `replay.test.ts` 3건이 `FSRSValidationError` 로 실패한다
- [x] **②단계 — 기기 업데이트** (사용자 확인 필요)
- [x] **③단계 — `FlagEvent` + 버튼 + 피드백 전송**
  - `StarEvent` 와 같은 모양(`on` 토글). `definition`·`headword` 를 같이 남긴다 —
    재빌드로 뜻이 바뀌어도 무엇을 보고 눌렀는지 남고, 피드백 화면이 사전 없이 읽는다
  - 뜻이 드러난 뒤에만 뜨고, 눌러도 **카드를 안 넘긴다**
  - 「맞다」는 안 받는다. 검수가 끝나도 안 없앤다 (사용자 판단)
  - 검증: `replay.test.ts` 7건 + e2e `meaning-vote.spec.ts` 5건
- [x] **전송은 기존 피드백 경로** — `sendFeedback`. 새 전송 수단을 안 만든다
  - 「학습 기록은 보내지 않아요」 문구를 **「채점 기록은…」** 으로 고쳤다. 신고는 나가므로
    그 약속을 정확히 해야 한다. 나가는 내용은 `fb-preview` 에 그대로 보인다
- [x] **검증 실행** — `npm test` 646 · `playwright` 60 스펙 · tsc·oxlint·build 클린
- [x] **엄지 둘로 교체** (2026-09-22, 사용자 지적 "선뜻 신고하기로 보이지 않는다")
  - 「이상해요」 글자 버튼 → 👍 / 👎. 「맞다」를 다시 넣은 근거는 `context-notes.md` 같은 날
  - 엄지 위를 누르면 화면의 「미검수」 꼬리표가 걷힌다. **진짜 `verified` 는 재빌드 몫이다**
  - 옛 이벤트(`on: boolean`) 호환 — `voteOf()`. `type: 'flag'` 문자열은 안 바꿨다
  - 검증: `npm test` 649 · `playwright` 62 스펙 · tsc·oxlint·build 클린
- [x] **모양·문구·노출 창 확정** (2026-09-22, 실물 스크린샷 3회 반복)
  - 원형 46×46 · 테두리 세움 · 색만 뺌(`grayscale`). 근거는 `context-notes.md` 같은 날
  - 문구 「뜻을 잘 옮겼나요?」 — 기각한 후보 셋과 이유가 노트에 있다
  - **뜻을 연 뒤 ~ 채점 전에만** 뜬다. 「알았어요」는 즉시 넘어가므로 그 뒤에 못 붙인다
  - 검증: e2e 6건 (「몰랐어요 뒤 `.vote-row` 0개」 포함) · `npm test` 649 · `playwright` 63

---

## 동기화 전송 파일을 백업 차분만 담게 (2026-09-22, 사용자 문의 "백업이 느리다")

- [x] **원인 측정** — 이벤트 1건 279B × 5,054건 = 1.35MB. 한 동기화에 약 4MB 오간다
      (백업 받기 + 전송 올리기 + 백업 올리기). 전송 파일이 백업과 거의 같은 내용이었다
- [x] **전송 파일 = 백업 차분** — `mine.filter(e => !inBackup.has(e.id))`. 없으면 안 쓴다
  - 파일 구조·형식 그대로. 기기당 하나, 백업 성공 후 삭제도 그대로
  - 검증: `sync.test.ts` 3건. **되돌리면 3건 다 실패**하는 것을 확인했다
  - 그중 하나는 안전 조건 — 백업 쓰기 실패 시 다른 기기가 이어받아 복구되는지
- [x] **검증 실행** — `npm test` 652 · tsc·oxlint·build 클린
- [ ] **gzip 압축** — 남은 2.7MB → 약 400KB. 읽기 호환 분기가 붙는다
- [ ] **`uploadOrReplace` 의 중복 `listSyncFiles()`** — 동기화당 왕복 2회. `DriveClient` 서명 변경

---

## 업데이트 배너 검증 (2026-09-22, 사용자 지시 "버전 체크가 제대로 되는지 확인하라")

- [x] **실측** — 배너는 뜨는데 **처음 깐 탭에서는 「지금 적용」이 화면을 안 바꿨다**.
      새 SW 는 활성화되는데 새로고침이 안 걸린다. 근거는 `context-notes.md` 같은 날
- [x] **고침** — 「지금 적용」이 직접 `controllerchange` 에 새로고침을 건다.
      workbox 의 `isUpdate` 가 등록 시점 컨트롤러 유무로 정해지는 게 원인이다
- [x] **검사 도구** — `npm run check:update`. build → preview → v2 → 배너 → 적용까지 실제로 돈다
  - `npm run e2e` 에는 못 넣는다: dev 서버에 서비스워커가 안 붙는다(`devOptions.enabled: false`)
  - 고친 것을 되돌리면 **실패하는 것을 확인**하고 넣었다
- [x] **검증 실행** — `check:update` 두 경우 다 통과 · `npm test` 652 · tsc·oxlint 클린

---

## 프리캐시 상한 (2026-09-22)

- [x] **상한 6MB → 12MB** — `base.json` 5.63MB, 여유 0.37 → 6.37MB
- [x] **위험 판단 정정** — 「조용히 빠지고 빌드는 성공」이 틀렸다. 넘으면 `vite build` 가
      `PLUGIN_ERROR` 로 죽는다(실측 종료코드 1). 실제 위험은 배포가 막히는 것이었다
- [x] **`npm run build` 끝에 `tools/check-precache.mjs`** — 크기가 아닌 이유로 목록에서
      빠지는 경우를 막는다. `globPatterns` 에서 한 줄을 빼면 **vite 는 통과하고 체커가 깬다**(실측)
- [x] **검증 실행** — 두 실패 경로를 다 재현해 확인 · `npm test` 652 · tsc·oxlint·build 클린

---

## 설정 화면 정리 (2026-09-22, 사용자 요청 "산만하다")

- [x] **① 백업·초기화를 하위 화면으로** — `src/app/Backup.tsx`, `Sub` 에 `{kind:'backup'}`
  - 본문의 절반을 먹던 덩치 + 되돌릴 수 없는 초기화를 한 겹 안으로
- [x] **② 넷으로 묶고 순서 고침** — 학습 / 세션 중 / 입력 / 보기
  - 제목만으로는 항목 라벨과 안 갈려서(실제 화면 확인) **묶음 위에 가는 선**을 넣었다
- [x] **링크 행 정리** — `.setting-link`. 라벨 중복 제거(「백업과 기록」을 두 번 말했다)
- [x] **맨 버튼이 브라우저 기본 통바였다** — `.setting > button` 에 표면을 줬다
- [x] **검증 실행** — `npm test` 652 · `playwright` 63 · tsc·oxlint·build 클린
  - `diagnostic-flag` 가 초기화 위치 이동으로 깨져 검사를 따라가게 고쳤다
- [x] **③ 설정 수 줄이기** — 사용자 판정: 자판 배열·입력 피드백은 남기고 **관찰 문구만 뺀다**
  - 기능은 남기고 선택지만 없앴다 — `OBSERVE_GATE` 를 옛 「보통」 값으로 고정
  - 묶음 「세션 중」 → 「다시보기」 (남은 항목이 세션이 아니라 다시보기 설정이었다)
  - 검증: `npm test` 651 · `playwright` 63 · tsc·oxlint·build 클린

---

## 사다리 막대 분모 고치기 (2026-09-22, 사용자 문제 제기)

- [x] **① 요약 스택 막대** — 분모를 「내가 숙지한 전체 개수」로. 세그먼트 = 밴드별 숙지 개수
  - 기각안 넷을 `context-notes.md` 에 남겼다. 밴드 전체 표현 수를 분모로 두는 안은
    풀이 1,485~85,418개라 막대가 1% 라서 실측으로 죽었다
- [x] **② 밴드 행에서 막대 제거** — 행은 남기고 `bar-track` 만 걷었다. 수치·배지·경계선 유지
  - 기존 e2e 의 「배지와 수치가 같은 오른쪽 선」 단언이 그대로 통과한다
- [x] **③ 밴드 색** (사용자 지시 "색상으로 밴드구역을 구분하라") — PLAN §7 의 명시적 예외
  - 오답의 朱 근처를 안 쓰고, 흔들림은 면이 아니라 **테두리**로 준다
  - 막대 10px → 14px — 10px 에서는 테두리가 밴드 색을 다 먹었다(실측)
- [x] **④ e2e** — `report-stable-mix.spec.ts` 신설. **출제만 늘려도 막대가 안 짧아지는 것**이 핵심 단언
  - 분모를 옛 `stable/met` 으로 되돌려 **실패하는 것을 확인**했다 (0.75 → 0.5)
  - 밝은·어두운 테마 실화면을 캡처해 색과 朱 테두리를 눈으로 확인했다
- [x] **검증 실행** — `npm test` 651 · `playwright` 71 · tsc·oxlint·build 클린
