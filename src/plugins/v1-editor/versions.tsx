// P10e — 판 보관 칸(`doc@<n>`)·적용 기간(설계 ① 3절 「시간표 판본」 · 15절 `?archive=1`).
// 저장 자리는 아래 VersionStore 한 곳뿐이다(서버 전엔 메모리 가짜 — bundle-platform.ts 의 DocStore 와 같은 꼴).
import { useState, useSyncExternalStore } from 'react'
import type { Doc } from './legacy/types/doc'
import { DateField } from '../../pane-ui-system'
import { TimetableGrid } from './grid'

export interface DocPart {
  doc: Doc
  /** 이 판이 쓰이는 기간(YYYY-MM-DD, 없으면 null = 제한 없음) */
  validFrom: string | null
  validTo: string | null
}
export interface ArchivePart extends DocPart {
  /** 보관 번호 — 칸 이름은 `doc@<n>` */
  n: number
}

export const archiveKey = (n: number) => `doc@${n}`

export class ArchiveReadOnlyError extends Error {
  constructor(n: number) {
    super(`보관 칸 ${archiveKey(n)} 은 읽기 전용입니다`)
  }
}

/** 꾸러미 쪽 판 칸 어댑터. 진짜 서버(doc PUT · 교체 PUT 은 `?archive=1`)가 붙을 자리는 이 인터페이스 하나다. */
export interface VersionStore {
  readonly current: DocPart | null
  readonly archives: readonly ArchivePart[]
  /** 지금 판의 기간만 고친다 */
  setPeriod(validFrom: string | null, validTo: string | null): void
  /** 새 판을 올린다 — 옛 판은 보관 칸 `doc@<n>` 으로 남는다(`?archive=1` 과 같다). 만든 보관 번호(없으면 null) */
  replace(next: DocPart): number | null
  /** 보관 칸 쓰기 — 항상 거부(읽기 전용) */
  putArchive(n: number, part: DocPart): never
  /** 날짜에 쓸 판 — 기간이 맞는 것 중 최신, 없으면 최신(운영 앱 versionFor 규칙) */
  pick(date: string): DocPart | null
  subscribe(fn: () => void): () => void
}

const inPeriod = (p: DocPart, date: string) => (p.validFrom == null || p.validFrom <= date) && (p.validTo == null || date <= p.validTo)

export function createMemoryVersionStore(initial?: DocPart): VersionStore {
  let current: DocPart | null = initial ?? null
  let archives: ArchivePart[] = []
  let nextN = 1
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())
  return {
    get current() {
      return current
    },
    get archives() {
      return archives
    },
    setPeriod(validFrom, validTo) {
      if (!current) return
      // TODO(서버 연결): doc 칸 PUT(관리자). 지금은 메모리만.
      current = { ...current, validFrom, validTo }
      emit()
    },
    replace(next) {
      let made: number | null = null
      if (current) {
        // TODO(서버 연결): doc 교체 PUT 에 ?archive=1 — 서버가 옛 판을 doc@<n> 으로 잠가 보관한다.
        made = nextN++
        archives = [...archives, { ...current, n: made }]
      }
      current = next
      emit()
      return made
    },
    putArchive(n) {
      throw new ArchiveReadOnlyError(n)
    },
    pick(date) {
      // 최신 = 지금 판 > 보관 번호 큰 쪽. 기간이 맞는 것 중 첫째, 없으면 최신.
      const newestFirst: DocPart[] = [...(current ? [current] : []), ...[...archives].reverse()]
      return newestFirst.find((p) => inPeriod(p, date)) ?? newestFirst[0] ?? null
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

/** 화면 쪽 공용 가짜 어댑터 — 서버 전엔 비어 있다(진짜 붙일 자리: server-link 가 만들 VersionStore). */
export const versionStore: VersionStore = createMemoryVersionStore()

function useStore(store: VersionStore) {
  useSyncExternalStore(store.subscribe, () => store.archives, () => store.archives)
  useSyncExternalStore(store.subscribe, () => store.current, () => store.current)
}

const period = (p: DocPart) => `${p.validFrom ?? '처음'} ~ ${p.validTo ?? '끝'}`

/** 지금 판·보관 칸 목록과 지금 판의 기간 고치기 */
export function VersionsPanel({ store = versionStore }: { store?: VersionStore }) {
  useStore(store)
  const cur = store.current
  if (!cur) return <p role="status">불러온 시간표가 없습니다</p>
  return (
    <section aria-label="시간표 판">
      <h3>지금 판 — {cur.doc.meta.name}</h3>
      <div>
        시작 <DateField ariaLabel="시작" value={cur.validFrom ?? ''} onChange={(v) => store.setPeriod(v || null, cur.validTo)} />
        {' ~ '}끝 <DateField ariaLabel="끝" value={cur.validTo ?? ''} openAt={cur.validFrom} onChange={(v) => store.setPeriod(cur.validFrom, v || null)} />
      </div>
      <h3>보관된 판</h3>
      {store.archives.length === 0 ? (
        <p>없습니다</p>
      ) : (
        <ul>
          {store.archives.map((a) => (
            <li key={a.n} data-key={archiveKey(a.n)}>
              {archiveKey(a.n)} · {a.doc.meta.name} · {period(a)} (읽기 전용)
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 꾸러미 컴포넌트 `v1-editor.grid` — 날짜를 고르면 그날 쓸 판의 읽기 격자를 그린다. 자료는 VersionStore 에서. */
export function VersionedGrid({ store = versionStore, initialDate }: { store?: VersionStore; initialDate?: string }) {
  useStore(store)
  const [date, setDate] = useState(initialDate ?? // 서울 오늘
     new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10))
  const part = store.pick(date)
  return (
    <div>
      <DateField ariaLabel="날짜" value={date} onChange={(v) => v && setDate(v)} />
      {part ? <TimetableGrid doc={part.doc} date={date} /> : <p role="status">불러온 시간표가 없습니다</p>}
    </div>
  )
}
