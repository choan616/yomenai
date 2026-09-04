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

- [ ] Tatoeba 예문 커버리지 실측 → **부족하면 이 Phase 자체를 뺀다**
- [ ] TTS 인터페이스 분리 (Web Speech API 우선)

---

## Phase 7 — 클라우드 백업 (선택)

- [ ] mmtm `cloudStorage/` 이식
- [ ] 기기별 파일 분리 동기화 구현
- [ ] **검증: 두 브라우저 프로파일에서 각각 학습 후 병합 시 이벤트 손실 0**
- [ ] GitHub Pages 배포

---

## 서비스화 판단 전 필수 (Phase 8)

- [ ] 3개월 이상 실사용
- [ ] EDRDG에 CC BY-SA 승계 범위 문의
- [ ] stdict API 이용약관 확인
- [ ] 미검수(`verified=false`) 항목 전수 검수
- [ ] 이용약관·개인정보처리방침

---

## 확장 후보 (미착수, 실사용 후 판단)

- [x] 오답 유형 enum 에 `OKURIGANA` 자리 예약 — 스키마 불변 조건이라 미리 넣음.
  분류기 로직은 안 건드림. `npm test` 180 통과 유지, `tsc -b`/`oxlint` 클린 (context-notes 2026-09-04 절)
- [ ] 동사·형용사형(오쿠리가나 포함) 한자 조합을 코퍼스에 추가 —
  코퍼스 필터 + `decompose` 가나 리터럴 처리 + 파이프라인 재실행. 스키마 변경 없음
- [ ] 훈독 숙어를 세션 모드/필터로 분리할지 결정 (별도 메뉴는 기각, 필터 방향)
- [ ] 진단 리포트에서 훈독-only 오답 버킷 분리 — 음독 교정 신호 정합성
