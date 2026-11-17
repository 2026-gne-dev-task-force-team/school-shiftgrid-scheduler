/** 쓰는 사람용 소식 — 좋아진 것 · 새로 쓸 수 있는 것 · 눌러 볼 것 세 칸(R125). 숨은 key 는 그리지 않는다. */
import type { ReleaseNote } from './changelog'

const 칸: { id: 'improved' | 'added' | 'tryIt'; label: string }[] = [
  { id: 'improved', label: '좋아진 것' },
  { id: 'added', label: '새로 쓸 수 있는 것' },
  { id: 'tryIt', label: '눌러 볼 것' },
]

export function ReleaseNotes({ notes }: { notes: ReleaseNote[] }) {
  return (
    <div data-testid="release-notes" className="space-y-2">
      {notes.map((n) => (
        <section key={n.key} data-note={n.key}>
          <div className="font-semibold">{n.title}</div>
          {칸.map((c) => n[c.id].length > 0 && (
            <div key={c.id} data-testid={`notes-${c.id}`} className="mt-1">
              <div className="text-muted">{c.label}</div>
              <ul className="list-disc space-y-0.5 pl-4">{n[c.id].map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
