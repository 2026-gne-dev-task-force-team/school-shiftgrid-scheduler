/** 판 배지 — 이 판이 무엇인지 한 줄. 문구는 site-config 의 EDITION.badge 한 곳(manifest·title 과 같은 정본). */
import { EDITION } from './site-config'

export function EditionBadge() {
  return (
    <div
      data-testid="edition-badge"
      style={{ position: 'fixed', bottom: 2, left: '50%', transform: 'translateX(-50%)', zIndex: 50, pointerEvents: 'none', fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', whiteSpace: 'nowrap', maxWidth: '96vw', overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {EDITION.badge}
    </div>
  )
}
