import * as XLSX from 'xlsx'
import { finishTable, pickTable, type Cell, type HwpxTable, type Tbl } from './hwpx.ts'

const TAG_PARA_HEADER = 0x42
const TAG_PARA_TEXT = 0x43
const TAG_CTRL_HEADER = 0x47
const TAG_LIST_HEADER = 0x48
const TAG_TABLE = 0x4d
const CTRL_TBL = 0x74626c20 // 'tbl ' — 파일엔 역순(' lbt') 저장이라 LE 로 읽으면 이 값

interface Rec { tag: number; level: number; data: Uint8Array }

/** 레코드 열 — 헤더 32비트 LE(Tag 10 · Level 10 · Size 12, 0xFFF 면 다음 4바이트가 크기). 잘린 끝은 버린다. */
export function parseRecords(buf: Uint8Array): Rec[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Rec[] = []
  let p = 0
  while (p + 4 <= buf.length) {
    const h = dv.getUint32(p, true); p += 4
    let size = h >>> 20
    if (size === 0xfff) { if (p + 4 > buf.length) break; size = dv.getUint32(p, true); p += 4 }
    if (p + size > buf.length) break
    out.push({ tag: h & 0x3ff, level: (h >>> 10) & 0x3ff, data: buf.subarray(p, p + size) })
    p += size
  }
  return out
}

/** PARA_TEXT → 글자. 확장·인라인 컨트롤(1~9·11·12·14~23)은 8 WCHAR 를 차지해 건너뛴다. */
export function decodeParaText(d: Uint8Array): string {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  let s = ''
  for (let i = 0; i + 2 <= d.length; i += 2) {
    const c = dv.getUint16(i, true)
    if (c >= 32) { s += String.fromCharCode(c); continue }
    if (c === 9) { s += '\t'; i += 14 } // 탭은 인라인(8 WCHAR)
    else if (c === 10) s += '\n'
    else if (c === 24) s += '-'
    else if (c === 30 || c === 31) s += ' '
    else if ((c >= 1 && c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 23)) i += 14
  }
  return s
}

interface Ctx { level: number; tbl: Tbl; cells: Cell[]; cur?: Cell; seenTable: boolean }

/** 구역 하나의 표 목록. 중첩 표는 바깥 칸 문단으로 합친다(hwpx 와 같게). */
export function parseSectionTables(buf: Uint8Array): string[][][] {
  const out: string[][][] = []
  const stack: Ctx[] = []
  const close = () => {
    const c = stack.pop()!
    const grid = finishTable({ cells: [c.cells] })
    const outer = stack[stack.length - 1]
    if (outer?.cur) {
      for (const r of grid) {
        const t = r.filter((x, i) => x !== '' && r[i - 1] !== x).join(' ')
        if (t) outer.cur.paras.push(t)
      }
    } else if (!outer) out.push(grid)
  }
  for (const r of parseRecords(buf)) {
    while (stack.length && r.level <= stack[stack.length - 1].level) close()
    const top = stack[stack.length - 1]
    const dv = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength)
    switch (r.tag) {
      case TAG_CTRL_HEADER:
        if (r.data.length >= 4 && dv.getUint32(0, true) === CTRL_TBL) {
          const tbl: Tbl = { cells: [] }
          stack.push({ level: r.level, tbl, cells: [], seenTable: false })
        }
        break
      case TAG_TABLE:
        if (top && r.level === top.level + 1) top.seenTable = true
        break
      case TAG_LIST_HEADER:
        // 문단 수(2)·(2)·속성(4) 다음에 열 주소·행 주소·열 병합·행 병합 UINT16 — 칸 시작
        if (top && top.seenTable && r.level === top.level + 1 && r.data.length >= 16) {
          const cell: Cell = {
            col: dv.getUint16(8, true), row: dv.getUint16(10, true),
            colSpan: Math.max(1, dv.getUint16(12, true)), rowSpan: Math.max(1, dv.getUint16(14, true)), paras: [],
          }
          top.cells.push(cell); top.cur = cell
        }
        break
      case TAG_PARA_HEADER:
        if (top?.cur) top.cur.paras.push('')
        break
      case TAG_PARA_TEXT:
        if (top?.cur) {
          if (top.cur.paras.length === 0) top.cur.paras.push('')
          top.cur.paras[top.cur.paras.length - 1] += decodeParaText(r.data)
        }
        break
    }
  }
  while (stack.length) close()
  return out
}

/** hwp(5.x 바이너리) 읽기 — OLE `BodyText/Section*` 의 표. 암호 걸린 문서는 경고만. 깨진 파일은 throw. */
export function readHwp(bytes: Uint8Array, pick: string | number = 0): HwpxTable {
  const cfb = XLSX.CFB.read(bytes, { type: 'array' })
  const paths: string[] = cfb.FullPaths
  const find = (re: RegExp) => paths.map((p: string, i: number) => ({ p, i })).filter(({ p }: { p: string }) => re.test(p))
  const head = find(/(?:^|\/)FileHeader$/)[0]
  const hc = head ? (cfb.FileIndex[head.i].content as Uint8Array | undefined) : undefined
  if (!hc || hc.length < 40) throw new Error('FileHeader 가 없음')
  const attrs = new DataView(Uint8Array.from(hc).buffer).getUint32(36, true)
  if (attrs & 2) return { rows: [], sheet: '', sheets: [], warnings: ['암호가 걸린 hwp 라 읽지 못함'] }
  const compressed = (attrs & 1) !== 0
  const secNo = (p: string) => Number(/(\d+)$/.exec(p)?.[1] ?? 0)
  const secs = find(/(?:^|\/)BodyText\/Section\d+$/).sort((x: { p: string }, y: { p: string }) => secNo(x.p) - secNo(y.p))
  if (secs.length === 0) throw new Error('BodyText/Section* 이 없음')
  const tables: string[][][] = []
  for (const { i } of secs) {
    const content = cfb.FileIndex[i].content as Uint8Array | undefined
    if (!content) continue
    let raw: Uint8Array = Uint8Array.from(content)
    if (compressed) {
      const payload = Object.assign(raw, { l: 0 })
      raw = Uint8Array.from(XLSX.CFB.utils._inflateRaw(payload) as ArrayLike<number>)
    }
    tables.push(...parseSectionTables(raw))
  }
  if (tables.length === 0) return { rows: [], sheet: '', sheets: [], warnings: ['문서에 표가 없음'] }
  return pickTable(tables, pick)
}
