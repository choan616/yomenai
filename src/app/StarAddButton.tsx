// 카드 맨 아래의 「+ 단어장」 — 다시보기와 끝말잇기 말 카드가 같이 쓴다 (2026-10-06, 사용자 지시)
//
// 자리를 두 번 옮겼다. 아래 넘김 줄은 마지막 장에서 버튼이 넷이 되어 375px 폭을 넘었고(실측),
// 머리말 바 우측은 **눈에 안 띄었다**(사용자). 지금은 뜻·예문을 읽고 난 자리, 예문 버튼 오른쪽이다.
//
// 담은 말이면 눌러서 뺀다 (찾기의 `+`/`−` 와 같은 동작). 넘기다 잘못 눌러도 되돌릴 수 있어야
// 하고, 담긴 상태를 말해 주지 않으면 같은 말을 또 담으려 든다.
export function StarAddButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`wl-add${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={on ? '단어장에서 빼기' : '단어장에 담기'}
      onClick={onToggle}
    >
      {on ? '담았어요' : '+ 단어장'}
    </button>
  )
}
