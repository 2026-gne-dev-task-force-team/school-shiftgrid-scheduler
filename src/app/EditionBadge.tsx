/** 판 배지 — 이 판이 무엇인지 한 줄. 문구는 site-config 의 EDITION.badge 한 곳(manifest·title 과 같은 정본).
 *  자리: 하단 상태바 왼쪽 칸(Workbench 의 frameStatus) — 상태바가 이미 맨 아래 한 줄을 차지하니
 *  떠 있는 알약(fixed)은 상태바·좁은 화면 하단 바와 겹칠 수 있어, 흐름 안 한 칸으로 넣는다.
 *  누르면 「업데이트 이력」 — 빌드 때 만든 changelog.json(판 번호·시각·바뀐 것)을 펼친다(R79). */
import { useState } from 'react'
import { Button } from '../pane-ui-system'
import { EDITION } from './site-config'
import { RELEASE_NOTES, type ChangelogEntry } from './changelog'
import { ReleaseNotes } from './ReleaseNotes'

interface Changelog { build: string; at: string; entries: ChangelogEntry[] }

export function EditionBadge() {
  const [open, setOpen] = useState(false)
  const [log, setLog] = useState<Changelog | null | 'err'>(null)
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && log === null) {
      fetch('./changelog.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: Changelog) => setLog(j)).catch(() => setLog('err'))
    }
  }
  return (
    <span className="relative inline-flex min-w-0">
      <Button variant="ghost" size="sm" data-testid="edition-badge" aria-expanded={open} title="업데이트 이력 보기" onClick={toggle}
        className="!h-auto truncate bg-panel !px-1 !py-0 text-muted">
        {EDITION.badge}
      </Button>
      {open && (
        <div role="dialog" aria-label="업데이트 이력" data-testid="changelog-panel"
          className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-80 max-w-[90vw] overflow-auto rounded-ctl border border-line bg-panel p-2 text-xs text-text shadow-lg">
          <div className="mb-1 font-semibold">새 소식</div>
          <ReleaseNotes notes={RELEASE_NOTES} />
          <details className="mt-2" data-testid="changelog-dev">
            <summary className="cursor-pointer text-muted">개발 기록 펼치기</summary>
          <div className="mb-1 font-semibold">업데이트 이력{log && log !== 'err' ? ` · 판 ${log.build} · ${log.at.slice(0, 16).replace('T', ' ')}` : ''}</div>
          {log === null && <div className="text-muted">불러오는 중…</div>}
          {log === 'err' && <div className="text-muted">이력을 못 읽었다(개발 서버에는 없다).</div>}
          {log && log !== 'err' && (log.entries.length === 0
            ? <div className="text-muted">기록이 없다.</div>
            : <ul className="space-y-1">{log.entries.map((e) => (
              <li key={e.build + e.task}>
                <span aria-label={e.kind === 'fix' ? '고침' : '기능'}>{e.kind === 'fix' ? '🐞' : '🔨'}</span>{' '}
                <span className="text-muted">{e.task}{e.req ? `(${e.req})` : ''} · {e.at.slice(5, 10)}</span> {e.text}
              </li>))}</ul>)}
          </details>
        </div>
      )}
    </span>
  )
}
