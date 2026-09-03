# yomenai (読めない)

**뜻은 아는데 못 읽는 사람을 위한 일본어 앱.**

한자 문화권 화자는 일본어 한자 숙어의 뜻을 한자어 지식으로 짐작한다. 그래서 뜻 학습
중심인 기존 일본어 앱이 맞지 않고, 정작 병목인 읽기는 방치된다. 이 앱은 그 구간만 다룬다.

- **1차 — 읽기 교정.** 뜻은 아는데 읽기가 불안한 숙어를 찾아내 교정한다
- **2차 — 어휘 확장.** 뜻 자체를 모르는 숙어를 늘린다

단순 암기 앱이 아니라 **진단 도구**를 지향한다. "몇 개 외웠다"가 아니라 "促音에서 무너진다",
"한국 한자음에 끌려간다" 같은 오답 패턴을 보여주는 것이 이 앱의 결과물이다.

## 문서

| 파일 | 내용 |
|---|---|
| `PLAN.md` | 계획서 — 목적, 확정 결정, 아키텍처, Phase 로드맵 |
| `checklist.md` | Phase별 작업 체크리스트와 검증 기준 |
| `context-notes.md` | 결정 이력과 근거, 미확정 사항 |
| `CLAUDE.md` | 이 프로젝트 전용 규칙 (전역 CLAUDE.md에 추가 적용) |

## 현재 상태

Phase 1 완료 — 스캐폴딩(Vite + React 19 + TS) + 데이터 파이프라인.
`tools/import-kanjidic.ts` → 한자 13,108자, `tools/import-jmdict.ts` → 숙어 107,532개.
실측 결과와 미확정 결정은 `context-notes.md` 2026-09-03 절 참조.
다음 작업은 `checklist.md`의 Phase 2 (레벨링 + 음독 매핑)다.

사전 원본(`data/raw/`)과 산출물(`data/dict/`)은 커밋하지 않는다.
`npm i` 후 `npm run import:kanjidic && npm run import:jmdict` 로 재생성한다.
단 `data/raw/`에 `kanjidic2-all-*.json` 과 `JMdict_e.gz` 가 먼저 있어야 한다.

## Claude Code에서 시작하기

```
PLAN.md, checklist.md, context-notes.md, CLAUDE.md를 읽고 Phase 1부터 진행해줘.
```

스캐폴딩 명령은 `checklist.md` Phase 1의 첫 항목에 적어뒀다.
