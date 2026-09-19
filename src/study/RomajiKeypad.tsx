// 앱이 직접 그리는 로마자 자판 (2026-09-19 사용자 요청 "키보드를 강제로 고정하고 싶다").
//
// 웹에는 키보드 **언어**를 지정하는 수단이 없다 — `inputMode` 는 종류만 고르고 `lang` 은
// 키보드 선택에 안 쓰인다. iOS 는 마지막에 쓴 키보드를 기억해서 세션에 들어가면 한글 자판이
// 먼저 뜬다. 네이티브도 언어 강제는 비공개 API라 못 하고, 대신 자체 키보드 뷰를 붙인다
// (파파고가 로마자 자판을 고정해 보이는 방식). 웹에서 복제할 수 있는 건 그쪽이다.
//
// 시스템 키보드를 안 띄우니 자동 완성 후보도, Safari 악세서리 바(44px)도, 지구본도 없다.
// 변환은 그대로 wanakana 가 한다 — 이 자판은 로마자를 넣어 줄 뿐이다.
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

/** 길게 누르지 않고도 닿아야 하는 특수 키 — 장음은 로마자로 못 적는다 */
const LONG_VOWEL = 'ー'

export function RomajiKeypad({
  onKey,
  onBackspace,
  onSubmit,
  disabled,
}: {
  onKey: (ch: string) => void
  onBackspace: () => void
  onSubmit: () => void
  disabled?: boolean
}) {
  /**
   * 버튼을 눌러도 입력창의 포커스를 뺏지 않는다. blur 되면 캐럿이 사라지고
   * `execCommand('insertText')` 가 어디에 넣을지 잃는다
   */
  const hold = (e: React.PointerEvent) => e.preventDefault()

  return (
    <div className="keypad" role="group" aria-label="로마자 자판">
      {ROWS.map((row, i) => (
        <div className="keypad-row" key={i}>
          {/* 마지막 줄만 양끝에 특수 키가 붙어 7키 + 2키가 된다 */}
          {i === 2 && (
            <button
              type="button"
              className="key key-wide"
              onPointerDown={hold}
              onClick={() => onKey(LONG_VOWEL)}
              disabled={disabled}
            >
              {LONG_VOWEL}
            </button>
          )}
          {[...row].map((ch) => (
            <button
              type="button"
              className="key"
              key={ch}
              onPointerDown={hold}
              onClick={() => onKey(ch)}
              disabled={disabled}
            >
              {ch}
            </button>
          ))}
          {i === 2 && (
            <button
              type="button"
              className="key key-wide"
              onPointerDown={hold}
              onClick={onBackspace}
              disabled={disabled}
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
          onPointerDown={hold}
          onClick={onSubmit}
          disabled={disabled}
        >
          확인
        </button>
      </div>
    </div>
  )
}
