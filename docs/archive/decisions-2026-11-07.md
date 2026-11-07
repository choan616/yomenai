# 보관본 — decisions.md 긴 줄의 압축 전 전문 (2026-11-07)

`decisions.md` 가 한도(30KB, `tools/docs-size.test.ts`)에 닿아 수준 사슬 결정을 넣을 자리를 만들려고 아래 줄을 압축했다.

키워드로 찾는다: 키 경계 · `romajiPrefix` · 연타 · 거리로 같은 키 합치기

- [유효] **앱 자판은 키 경계 근처의 탭을 「말이 되는 로마자」로 고른다**(2026-10-11) — 가장자리 10px 안의 터치는 일본어 음절이 되는 쪽(`romajiPrefix.ts`), 둘 다 되면 300ms 안 같은 키 연타. ~~[폐기 → 이것] 거리로 같은 키 합치기(2026-10-09)~~. **기각**: 거리만으로 합치기, 눌림 영역만 넓히기, 손 뗀 키 입력. 전문은 `docs/archive/decisions-2026-10-24.md`·`decisions-2026-10-31.md`. (테스트: `romajiPrefix.test.ts`, `keypad-repeat.spec.ts`, `keypad-click-retarget.spec.ts`)
