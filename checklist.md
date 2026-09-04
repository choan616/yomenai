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
  - 連濁·促音便·半濁音·連声·促音添加·연용형 흡수 규칙 구현 (`tools/lib/readings.ts`)
  - 최소 비용 분해 (`tools/lib/onyomi.ts`). 고유 쌍 4,001개
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
- [~] 초벌 배치 실행 중 — scope `band01+sound` 8,700건, 백그라운드. 끝나면 `apply:korean-review -- --trust-llm` → `korean-class.json`
- [ ] **검수 큐 verdict 세션 간 채우기 (음만 일치 2,301 + 밴드 0 교정 시드 우선) → `korean-class.json` 확정**
  착수점은 context-notes 2026-09-03 Phase 3 "다음 세션 착수점" 절.
  현재 `korean-class.json`은 미검수 전량 잠정 2번 상태 (배치 완료 후 초벌 8,700건 반영 예정)

---

## Phase 4 — 학습 코어

- [ ] IndexedDB 스키마 v1 정의 → **CLAUDE.md의 스키마 불변 조건 전부 반영**
- [ ] 이벤트 로그 append 함수
- [ ] 이벤트 → FSRS 카드 상태 재생(replay) 함수
- [ ] **검증: 동일 이벤트 시퀀스를 두 번 재생하면 동일 상태**
- [ ] `ts-fsrs` 연동, 카드 타입별 개별 스케줄
- [ ] 오답 유형 자동 판정 함수 (6종)
- [ ] **검증: 유형별 대표 케이스 각 3개씩 정확히 분류**
- [ ] 출제 선택 로직 (밴드 + 미숙 음독 가중)
- [ ] 모드 자동 배정 3단계
- [ ] **검증: 세션 100회 시뮬레이션 테스트 통과, 예외 없음**

---

## Phase 5 — UI

- [ ] 폰트 서브셋 파이프라인 → **검증: 학습 대상 문자 100% 커버, 폴백 발생 0**
- [ ] `lang` 속성 적용 → **검증: 骨, 直, 令 등이 일본 자형으로 렌더링됨**
- [ ] `wanakana.bind()` 입력 필드 (`autocapitalize="none"` 필수)
- [ ] 학습 카드 화면
- [ ] **검증: 카드 전환 150ms 이하 (실측)**
- [ ] 오답 상세
- [ ] 진입 진단 플로우
- [ ] 진단 리포트
- [ ] 음독 맵
- [ ] 홈 / 설정
- [ ] 다크 모드
- [ ] **검증: 진입 진단 → 세션 → 리포트 전체 흐름 완주**

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
