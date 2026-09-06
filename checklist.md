# 체크리스트

각 항목은 검증 기준을 통과해야 체크한다. "만들었다"가 아니라 "확인했다"가 완료 조건이다.

---

## Phase 0 — 계획 확정

- [x] 배포 형태 확정 (로컬 우선 PWA + 클라우드 백업)
- [x] 학습 목적 확정 (읽기 교정 1차, 어휘 확장 2차)
- [x] 난이도 축 확정 (JMdict 우선순위 밴드)
- [x] 스키마 불변 조건 확정
- [x] UI·폰트 방향 확정
- [x] 문서 3종 작성

---

## Phase 1 — 스캐폴딩 + 데이터 파이프라인

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

## Phase 2 — 레벨링 + 음독 매핑

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

## Phase 3 — 한국어 대조 배치

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
- [ ] 검수 응답을 `korean-class.json`으로 되돌리는 도구 — 이벤트 로그(`meaningKnown`)
  → 검수 TSV 방향. 실사용 응답이 쌓인 뒤 만든다 (Phase 5 이후)

---

## Phase 4 — 학습 코어

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

## Phase 5 — UI

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

## Phase 6 — 예문·음성 (선택)

- [x] Tatoeba 예문 커버리지 실측 — `tools/measure-tatoeba.ts`, `npm run measure:tatoeba`.
  밴드 0~3 표기 매칭 66.6%(밴드 0 90.5% ~ 밴드 3 "주력" 50.4%), 밴드 4 12.5%.
  **한국어 번역 연결은 0.9%**(2,261/248,888) — PLAN §6 이 기각한 영어 gloss 경유 없이는
  번역 붙은 예문이 사실상 불가능. 상세 context-notes 2026-09-04 절
  → **판정: 무번역 예문만 채택 (사용자 확인)**. 아래 항목으로 구현
- [x] 무번역 예문 표시 — `tools/build-examples.ts`(`npm run build:examples`, 원본
  `data/raw/tatoeba/` 미커밋) 가 표제어 매칭 문장을 60자 이하·짧은 순 최대 3개씩 골라
  `data/dict/examples.json`. `build-runtime-dict.ts` 가 base/band4 에 실린 숙어로 걸러
  `public/dict/examples.json`(534 KB gzip, 숙어 11,377개). `loadExamples()`(`src/dict/load.ts`)
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

## Phase 7 — 클라우드 백업 (선택)

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

---

## 실사용 후속 (Phase 5 다듬기)

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

---

## 서비스화 판단 전 필수 (Phase 8)

- [ ] 3개월 이상 실사용
- [ ] EDRDG에 CC BY-SA 승계 범위 문의
- [ ] stdict API 이용약관 확인
- [ ] 미검수(`verified=false`) 항목 전수 검수
- [ ] 이용약관·개인정보처리방침

---

## Phase 9 — 재미·디자인 (실사용 후 착수)

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
- [ ] **9-E · 실기기 체감 확인 (사용자)** — 진단을 처음부터 끝까지. "벽" 느낌이
  줄었는지, 중간 관찰 한 줄이 소음인지 신호인지, 해요체가 과하지 않은지. AI 가 대신 못 함

9-A~9-D 완료(2026-09-06). 남은 건 9-E(실기기 체감, 사용자).

---

## 확장 후보 (미착수, 실사용 후 판단)

- [x] 오답 유형 enum 에 `OKURIGANA` 자리 예약 — 스키마 불변 조건이라 미리 넣음.
  분류기 로직은 안 건드림. `npm test` 180 통과 유지, `tsc -b`/`oxlint` 클린 (context-notes 2026-09-04 절)
- [ ] 동사·형용사형(오쿠리가나 포함) 한자 조합을 코퍼스에 추가 —
  코퍼스 필터 + `decompose` 가나 리터럴 처리 + 파이프라인 재실행. 스키마 변경 없음
- [ ] 훈독 숙어를 세션 모드/필터로 분리할지 결정 (별도 메뉴는 기각, 필터 방향)
- [ ] 진단 리포트에서 훈독-only 오답 버킷 분리 — 음독 교정 신호 정합성
