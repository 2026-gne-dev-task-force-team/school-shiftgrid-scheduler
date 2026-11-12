// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { emptyDoc, migrateDoc } from './legacy/types/doc'
import { buildGrid } from './grid'
import { ArchiveReadOnlyError, VersionedGrid, VersionsPanel, archiveKey, createMemoryVersionStore, type DocPart } from './versions'

const mk = (name: string, validFrom: string | null, validTo: string | null): DocPart => ({ doc: emptyDoc(name, '2026-2'), validFrom, validTo })

describe('P10e 보관 칸·기간', () => {
  it('새 판을 올리면 옛 판이 doc@1 로 남고 번호는 이어진다', () => {
    const s = createMemoryVersionStore(mk('A', '2026-03-02', '2026-08-31'))
    expect(s.replace(mk('B', '2026-09-01', null))).toBe(1)
    expect(s.replace(mk('C', '2026-11-01', null))).toBe(2)
    expect(s.archives.map((a) => [archiveKey(a.n), a.doc.meta.name])).toEqual([['doc@1', 'A'], ['doc@2', 'B']])
    expect(s.current?.doc.meta.name).toBe('C')
  })
  it('처음 올릴 때는 보관이 생기지 않는다', () => {
    const s = createMemoryVersionStore()
    expect(s.replace(mk('A', null, null))).toBeNull()
    expect(s.archives).toEqual([])
  })
  it('보관 칸 쓰기는 거부', () => {
    const s = createMemoryVersionStore(mk('A', null, null))
    s.replace(mk('B', null, null))
    expect(() => s.putArchive(1, mk('X', null, null))).toThrow(ArchiveReadOnlyError)
    expect(s.archives[0].doc.meta.name).toBe('A')
  })
  it('날짜 고르기 — 기간이 맞는 것 중 최신, 없으면 최신', () => {
    const s = createMemoryVersionStore(mk('A', '2026-03-02', '2026-08-31'))
    s.replace(mk('B', '2026-09-01', '2026-12-31'))
    expect(s.pick('2026-05-01')?.doc.meta.name).toBe('A')
    expect(s.pick('2026-10-01')?.doc.meta.name).toBe('B')
    expect(s.pick('2027-01-15')?.doc.meta.name).toBe('B') // 어느 기간도 아님 → 최신
    s.setPeriod('2026-04-01', null) // 지금 판 B 기간을 넓힘 → 겹치면 최신(B)
    expect(s.pick('2026-05-01')?.doc.meta.name).toBe('B')
    expect(createMemoryVersionStore().pick('2026-05-01')).toBeNull()
  })
  it('기간 고치기는 구독자에게 알린다', () => {
    const s = createMemoryVersionStore(mk('A', null, null))
    let n = 0
    s.subscribe(() => n++)
    s.setPeriod('2026-03-02', '2026-12-31')
    expect(n).toBe(1)
    expect(s.current).toMatchObject({ validFrom: '2026-03-02', validTo: '2026-12-31' })
  })
  it('화면 — 목록·빈 상태·격자(판 없음/있음)', () => {
    const s = createMemoryVersionStore(mk('A', '2026-03-02', '2026-08-31'))
    expect(renderToStaticMarkup(<VersionsPanel store={createMemoryVersionStore()} />)).toContain('불러온 시간표가 없습니다')
    s.replace(mk('B', '2026-09-01', null))
    const html = renderToStaticMarkup(<VersionsPanel store={s} />)
    expect(html).toContain('doc@1')
    expect(html).toContain('읽기 전용')
    expect(renderToStaticMarkup(<VersionedGrid store={createMemoryVersionStore()} initialDate="2026-05-01" />)).toContain('불러온 시간표가 없습니다')
    expect(renderToStaticMarkup(<VersionedGrid store={s} initialDate="2026-10-07" />)).toContain('이 날짜에 적용되는 시간표가 없습니다')
  })
})

describe('실측 #1 (설계 ① 14절) — 이 시험이 지키는 몫', () => {
  // 브라우저 실측(크롬·엣지·사파리에서 편성→자동 편성→인쇄 쪽수)은 시험으로 못 잰다. 코드 쪽 전제만 못박는다.
  const root = join(__dirname, '..', '..', '..')
  it('솔버 Worker 주소는 모듈 상대(new URL(…, import.meta.url)) — 빌드 base 가 ./ 이라 /1_2/ 아래서도 같은 자리', () => {
    const src = readFileSync(join(__dirname, 'legacy', 'engine', 'solver.ts'), 'utf8')
    expect(src).toMatch(/new Worker\(new URL\('\.\/worker\.ts', import\.meta\.url\)/)
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toMatch(/base:\s*'\.\/'/)
    expect(existsSync(join(__dirname, 'legacy', 'engine', 'worker.ts'))).toBe(true)
  })
  const fx = process.env.V1_FIXTURE_51
  it.skipIf(!fx)('51반 fixture(레포 밖, V1_FIXTURE_51 경로) — 읽혀서 평일마다 격자가 선다', () => {
    const doc = migrateDoc(JSON.parse(readFileSync(fx!, 'utf8')))
    expect(doc.tracks.length).toBe(51)
    const t = doc.timetables[0]
    const g = buildGrid(doc, t.startDate)
    expect(g.ok || g.reason !== 'no-timetable').toBe(true)
  })
})
