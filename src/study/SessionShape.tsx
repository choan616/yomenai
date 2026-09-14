// 세션의 형태 (Phase 9-D) — 균질한 스트림에 시작·중반·마무리를 준다. "끝이 보인다"는 감각.
// progress 로만 파생하고 새 상태는 useStudySession 에 안 만든다. 모션은 셸 급(느리게).
import { useEffect, useState } from 'react'

/**
 * 세션 첫 카드 앞에 잠깐 뜨는 챕터 타이틀. 1.2초 뒤 사라진다.
 *
 * 소개는 문제 수에 안 드니 **갈라서 말한다** (2026-09-14). 「20장」 이 설정값인데
 * 화면에 25가 뜨면 설정이 거짓말한 것처럼 보인다.
 *
 * "먼저 알려 드릴게요" 라고 쓰지 않는다 — 소개는 앞에 모이지 않고 **그 숙어가 나올 자리에**
 * 문제 대신 끼어든다(`planIntros` 가 첫 등장 자리를 지킨다). 안 지킬 약속을 문구로 하지 않는다.
 */
export function ChapterTitle({ total, intros }: { total: number; intros: number }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1200)
    return () => clearTimeout(t)
  }, [])
  if (gone) return null
  return (
    <div className="chapter-title">
      <p>
        이번 세션, 문제 <b>{total - intros}장</b>이에요
      </p>
      {intros > 0 && (
        <p className="dim">
          처음 보는 <b>{intros}개</b>는 문제 대신 설명으로 나와요
        </p>
      )}
      <p className="dim">시작할게요</p>
    </div>
  )
}

/**
 * 절반 지점 한 줄. 부모가 절반 카드일 때만 렌더하고, 이 컴포넌트는 1.8초 뒤 스스로 사라진다.
 * 부모가 `key={index}` 없이 조건 렌더만 하면 절반 카드에 머무는 동안 한 번만 마운트된다.
 */
export function MidNote({ index, total, correct }: { index: number; total: number; correct: number }) {
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 1800)
    return () => clearTimeout(t)
  }, [])
  if (gone) return null
  return (
    <p className="mid-note">
      절반 왔어요 · {index} / {total} · 정답 {correct}
    </p>
  )
}
