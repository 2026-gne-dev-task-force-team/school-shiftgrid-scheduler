import type { Ctx, Hit, Rule } from './types.ts'

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => typeof v === 'string'
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

// shortcut: 필수 배열 8 은 migrateDoc 이 빈 배열로 채우는 앞쪽 8개로 잡았다(school-ops 원문 못 봄) — 원문 확인 시 교체
export const REQUIRED_ARRAYS = ['agents', 'activities', 'resources', 'specs', 'tracks', 'timetables', 'demands', 'assignments'] as const
// shortcut: 서버 한도 값을 몰라 임시 900KB — ③ 7절 확정되면 교체
export const PART_SIZE_WARN = 900_000
const DEFAULT_START = '2026-03-02'
const DEFAULT_END = '2027-02-28'

const hasDoc = (c: Ctx) => isObj(c.doc)

/** 칸 꼴: 칸 이름 → 값이 맞는 꼴이면 true. 어긋난 칸 id 마다 한 줄. */
const shapes: Record<string, (v: any) => string | null> = {
  rooms: (v) => !isObj(v) || !Array.isArray(v.rooms) || !Array.isArray(v.fixed) || !Array.isArray(v.blocks) ? '{rooms[], fixed[], blocks[]} 아님'
    : v.rooms.some((r: any) => !isObj(r) || !str(r.id)) ? '방에 id 없음'
    : v.fixed.some((f: any) => !isObj(f) || !str(f.roomId) || !num(f.dayIndex) || !num(f.startMin)) ? '고정 사용 줄에 roomId·dayIndex·startMin 필요' : null,
  calendar: (v) => !Array.isArray(v) || v.some((e) => !isObj(e) || !str(e.id) || !str(e.startDate) || !str(e.endDate) || !['all', 'grade', 'track'].includes(e.targetKind)) ? '학사 일정 배열 꼴 아님' : null,
  changes: (v) => !Array.isArray(v) || v.some((e) => !isObj(e) || !str(e.id) || !str(e.date) || !str(e.trackName) || !(e.period === null || num(e.period))) ? '시간표 변경 배열 꼴 아님' : null,
  fixed: (v) => !Array.isArray(v) || v.some((e) => !isObj(e) || !str(e.id) || !str(e.personRef) || !num(e.dayIndex) || !num(e.startMin) || !num(e.endMin)) ? '고정 일정 배열 꼴 아님' : null,
  classSubjects: (v) => !Array.isArray(v) || v.some((e) => !isObj(e) || !str(e.trackName) || !num(e.dayIndex) || !num(e.startMin) || !str(e.subject)) ? '담임 칸 과목 배열 꼴 아님' : null,
  aux: (v) => !isObj(v) ? '객체 아님' : null,
  settings: (v) => !isObj(v) || !str(v.schoolName) || !str(v.term) ? '{schoolName, term} 아님' : null,
}

const trackNames = (c: Ctx) => new Set<string>(arr(c.doc?.tracks).map((t) => t?.name))

export const RULES: Rule[] = [
  // ── v1 문서 ──
  { id: 'doc.schema-version', severity: 'error', run: (c) => hasDoc(c) && c.doc.meta?.schemaVersion !== 3
    ? [{ where: 'doc/meta', message: `schemaVersion 이 3 이 아님(${String(c.doc.meta?.schemaVersion)})` }] : [] },
  { id: 'doc.array-missing', severity: 'error', run: (c) => !hasDoc(c) ? [] : REQUIRED_ARRAYS.filter((k) => !Array.isArray(c.doc[k]))
    .map((k) => ({ where: `doc/${k}`, message: `필수 배열 ${k} 없음` })) },
  { id: 'doc.spec-missing', severity: 'error', run: (c) => hasDoc(c) && Array.isArray(c.doc.specs) && c.doc.specs.length === 0
    ? [{ where: 'doc/specs', message: '시간 틀이 하나도 없음' }] : [] },
  { id: 'doc.track-missing', severity: 'error', run: (c) => hasDoc(c) && Array.isArray(c.doc.tracks) && c.doc.tracks.length === 0
    ? [{ where: 'doc/tracks', message: '반이 하나도 없음' }] : [] },
  { id: 'doc.track-spec', severity: 'error', run: (c) => {
    const ids = new Set(arr(c.doc?.specs).map((s) => s?.id))
    if (ids.size === 0) return [] // 틀이 통째로 없으면 doc.spec-missing 이 대신 말한다
    return arr(c.doc?.tracks).filter((t) => !t?.specId || !ids.has(t.specId))
      .map((t) => ({ where: `doc/tracks/${t?.name ?? '?'}`, message: 'specId 가 없거나 시간 틀에 없는 id' }))
  } },
  // ── 정규화(자동으로 안 고침) ──
  { id: 'norm.slot-name', severity: 'warn', run: (c) => arr(c.doc?.specs).flatMap((s) => arr(s?.slots)
    .filter((sl) => sl?.assignable && sl.kind !== 'lunch' && sl.kind !== 'break' && !/^\d+교시$/.test(sl.label))
    .map((sl) => ({ where: `doc/specs/${s.name}/${sl.index}`, message: `슬롯 이름 「${sl.label}」 — 「N교시」 꼴 아님` }))) },
  { id: 'norm.slot-kind', severity: 'info', run: (c) => arr(c.doc?.specs).flatMap((s) => arr(s?.slots)
    .filter((sl) => sl && sl.kind === undefined).map((sl) => ({ where: `doc/specs/${s.name}/${sl.index}`, message: 'kind 없음 — 이름으로 추정됨' }))) },
  // ── 열린 질문 ──
  { id: 'open.term-default', severity: 'warn', run: (c) => {
    const t = arr(c.doc?.timetables)
    return t.length > 0 && t.every((x) => x?.startDate === DEFAULT_START && x?.endDate === DEFAULT_END)
      ? [{ where: 'doc/timetables', message: '학기 날짜가 기본값 — 기간을 적으세요' }] : []
  } },
  { id: 'open.job-empty', severity: 'info', run: (c) => arr(c.doc?.agents).filter((a) => !a?.attr?.직무)
    .map((a) => ({ where: `doc/agents/${a?.name ?? '?'}`, message: 'attr.직무 비어 있음' })) },
  { id: 'open.lessons-per-day', severity: 'info', run: (c) => arr(c.doc?.specs).filter((s) => isObj(s?.lessonsPerDay))
    .map((s) => ({ where: `doc/specs/${s.name}`, message: 'lessonsPerDay — 요일별 수업 수는 앞에서 n개로 읽힘' })) },
  // ── id 꼴 ──
  { id: 'id.agent-colon', severity: 'error', run: (c) => arr(c.doc?.agents).filter((a) => str(a?.id) && a.id.includes(':'))
    .map((a) => ({ where: `doc/agents/${a.id}`, message: 'agent id 에 「:」 가 있음' })) },
  { id: 'id.track-name-dup', severity: 'error', run: (c) => {
    const seen = new Set<string>(); const out: Hit[] = []
    for (const t of arr(c.doc?.tracks)) {
      if (seen.has(t?.name)) out.push({ where: `doc/tracks/${t.name}`, message: '반 이름 겹침' })
      seen.add(t?.name)
    }
    return out
  } },
  // ── 칸 꼴 ──
  { id: 'part.shape', severity: 'error', run: (c) => Object.entries(shapes).flatMap(([k, f]) => {
    if (!(k in c.parts)) return []
    const m = f(c.parts[k]); return m ? [{ where: k, message: m }] : []
  }) },
  { id: 'part.room-fixed-overlap', severity: 'error', run: (c) => {
    const seen = new Set<string>(); const out: Hit[] = []
    arr(c.parts.rooms?.fixed).forEach((f, i) => {
      const k = `${f?.roomId}|${f?.dayIndex}|${f?.startMin}`
      if (seen.has(k)) out.push({ where: `rooms/fixed[${i}]`, message: '같은 (방,요일,시작) 고정 사용이 겹침' })
      seen.add(k)
    })
    return out
  } },
  // ── 참조 ── (doc 이 덩어리에 있을 때만)
  { id: 'ref.track-name', severity: 'error', run: (c) => {
    if (!hasDoc(c)) return []
    const names = trackNames(c)
    return (['changes', 'classSubjects'] as const).flatMap((k) => arr(c.parts[k])
      .map((e, i) => ({ e, i })).filter(({ e }) => str(e?.trackName) && !names.has(e.trackName))
      .map(({ e, i }) => ({ where: `${k}[${i}]`, message: `반 「${e.trackName}」 이 doc 에 없음` })))
  } },
  { id: 'ref.room-id', severity: 'error', run: (c) => {
    const ids = new Set(arr(c.parts.rooms?.rooms).map((r) => r?.id))
    return arr(c.parts.rooms?.fixed).map((f, i) => ({ f, i })).filter(({ f }) => !ids.has(f?.roomId))
      .map(({ f, i }) => ({ where: `rooms/fixed[${i}]`, message: `방 id 「${f?.roomId}」 이 rooms 에 없음` }))
  } },
  // ── 덩어리 ──
  { id: 'bundle.part-size', severity: 'warn', run: (c) => Object.entries(c.parts)
    .filter(([, v]) => JSON.stringify(v ?? null).length > PART_SIZE_WARN)
    .map(([k]) => ({ where: k, message: `칸이 큼(> ${PART_SIZE_WARN} 자) — 서버 한도 전에 경고` })) },
]
