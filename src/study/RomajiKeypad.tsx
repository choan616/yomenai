// 앱이 직접 그리는 로마자 자판 (2026-09-19 사용자 요청 "키보드를 강제로 고정하고 싶다").
//
// 웹에는 키보드 **언어**를 지정하는 수단이 없다 — `inputMode` 는 종류만 고르고 `lang` 은
// 키보드 선택에 안 쓰인다. iOS 는 마지막에 쓴 키보드를 기억해서 세션에 들어가면 한글 자판이
// 먼저 뜬다. 네이티브도 언어 강제는 비공개 API라 못 하고, 대신 자체 키보드 뷰를 붙인다
// (파파고가 로마자 자판을 고정해 보이는 방식). 웹에서 복제할 수 있는 건 그쪽이다.
//
// 시스템 키보드를 안 띄우니 자동 완성 후보도, Safari 악세서리 바(44px)도, 지구본도 없다.
// 변환은 그대로 wanakana 가 한다 — 이 자판은 로마자를 넣어 줄 뿐이다.
import { useState } from 'react'
import { loadSettings } from '../app/settings.ts'
import { playKeyClick, vibrateKey } from './keyFeedback.ts'

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

export function RomajiKeypad({
  onKey,
  onBackspace,
  onSubmit,
  submitLabel = '확인',
}: {
  onKey: (ch: string) => void
  onBackspace: () => void
  onSubmit: () => void
  /** 마지막 줄 큰 키. 채점 화면은 「확인」, 찾기 화면은 「닫기」 */
  submitLabel?: string
}) {
  /**
   * 지금 손가락이 얹힌 글자 키. 손가락이 키를 덮어 무엇을 눌렀는지 안 보이는 건 34px 키나
   * 시스템 키보드나 같아서, 누른 글자를 키 위로 확대해 띄운다 (2026-09-19 사용자 요청).
   * CSS `:active` 가 아니라 상태로 드는 이유는 아래 `hold` 가 pointerdown 을 막기 때문이다 —
   * 기본 동작을 막으면 `:active` 가 붙는 시점을 브라우저마다 믿기 어렵다
   */
  const [pressed, setPressed] = useState<string | null>(null)
  /**
   * 입력음·진동. 설정은 자판이 뜰 때 한 번 읽는다 — 자판이 떠 있는 동안 설정 화면에 갈 수 없다.
   * 자판 안에 두는 이유는 쓰는 곳마다(채점·찾기) 같은 코드를 또 쓰지 않으려는 것이다
   */
  const [feedback] = useState(() => loadSettings().keyFeedback)
  const tick = () => {
    if (feedback === 'sound') playKeyClick()
    else if (feedback === 'haptic') vibrateKey()
  }

  /**
   * 버튼을 눌러도 입력창의 포커스를 뺏지 않는다. blur 되면 캐럿이 사라지고
   * `execCommand('insertText')` 가 어디에 넣을지 잃는다
   */
  const hold = (e: React.PointerEvent) => e.preventDefault()

  /**
   * 글자 키. **누르는 순간 넣는다** — click 은 손을 뗄 때 와서 한 박자 늦게 느껴진다
   * (사용자 실기기 지적 2026-09-19 "반응속도가 느리다"). 시스템 키보드도 눌림에 글자를 낸다.
   * 확대 표시는 글자 키에만 붙인다 — 시스템 키보드도 지우기·확인 같은 기능 키는 확대하지 않는다
   */
  const charKey = (ch: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      hold(e)
      setPressed(ch)
      tick()
      onKey(ch)
    },
    onPointerUp: () => setPressed(null),
    onPointerCancel: () => setPressed(null),
    onPointerLeave: () => setPressed(null),
  })

  const pop = (ch: string) =>
    pressed === ch ? (
      <span className="key-pop" aria-hidden="true">
        {ch}
      </span>
    ) : null

  return (
    <div className="keypad" role="group" aria-label="로마자 자판">
      {ROWS.map((row, i) => (
        <div className="keypad-row" key={i}>
          {/* 가운데 줄은 9키라 양끝에 반 칸씩 넣어 **키 폭을 모든 줄에서 같게** 만든다.
              iOS 와 Gboard 가 공통으로 쓰는 배치라 어느 쪽에서도 어색하지 않다 */}
          {i === 1 && <span className="key-half" aria-hidden="true" />}
          {/* 마지막 줄은 오른쪽에만 ⌫ 가 붙는다. 왼쪽 빈자리는 자리만 잡아 글자 키가
              윗줄과 어긋나지 않게 한다 — 시스템 키보드의 shift 자리다.
              장음(ー) 키는 안 둔다: 밴드 0~3 읽기 16,959개 중 ー 를 쓰는 것이 0건이고
              카타카나 읽기도 0건이다 (2026-09-19 사용자 지적, 실측) */}
          {i === 2 && <span className="key-spacer" aria-hidden="true" />}
          {[...row].map((ch) => (
            <button
              type="button"
              className="key"
              key={ch}
              {...charKey(ch)}
            >
              {ch}
              {pop(ch)}
            </button>
          ))}
          {i === 1 && <span className="key-half" aria-hidden="true" />}
          {i === 2 && (
            <button
              type="button"
              className="key key-wide"
              onPointerDown={(e) => {
                hold(e)
                tick()
                onBackspace()
              }}
              aria-label="지우기"
            >
              ⌫
            </button>
          )}
        </div>
      ))}
      <div className="keypad-row">
        <button
          type="button"
          className="key key-submit"
          onPointerDown={(e) => {
            hold(e)
            tick()
            onSubmit()
          }}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
