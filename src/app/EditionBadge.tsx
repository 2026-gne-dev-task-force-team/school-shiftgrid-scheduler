/** 판 배지 — 이 판이 무엇인지 한 줄. 문구는 site-config 의 EDITION.badge 한 곳(manifest·title 과 같은 정본).
 *  자리: 하단 상태바 왼쪽 칸(Workbench 의 frameStatus) — 상태바가 이미 맨 아래 한 줄을 차지하니
 *  떠 있는 알약(fixed)은 상태바·좁은 화면 하단 바와 겹칠 수 있어, 흐름 안 한 칸으로 넣는다. */
import { EDITION } from './site-config'

export function EditionBadge() {
  return (
    <span data-testid="edition-badge" className="truncate rounded-ctl bg-panel px-1 text-muted">
      {EDITION.badge}
    </span>
  )
}
