import * as XLSX from 'xlsx'

export interface HwpxTable { rows: string[][]; sheet: string; sheets: string[]; warnings: string[] }

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescapeXml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return ENT[e.toLowerCase()] ?? m
  })

const attr = (a: string, name: string): number | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"(\\d+)"`).exec(a)
  return m ? Number(m[1]) : undefined
}

interface Cell { row?: number; col?: number; rowSpan: number; colSpan: number; paras: string[] }
interface Tbl { cells: Cell[][] }

/** section XML 한 장에서 표 목록 — 정규식 토크나이저(DOMParser 는 node 시험 환경에 없다). 중첩 표는 바깥 칸 글자로 합친다. */
export function parseSectionTables(xml: string): string[][][] {
  const out: string[][][] = []
  const tokens = /<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:\s[^>]*?)?)(\/?)>|([^<]+)/g
  let tbl: Tbl | undefined
  let nested = 0 // 바깥 표 칸 안에서 만난 중첩 표 깊이
  let cell: Cell | undefined
  let row: Cell[] | undefined
  let inT = false
  const newPara = () => { if (cell) cell.paras.push('') }
  let m: RegExpExecArray | null
  while ((m = tokens.exec(xml))) {
    if (m[5] !== undefined) {
      if (inT && cell) {
        if (cell.paras.length === 0) cell.paras.push('')
        cell.paras[cell.paras.length - 1] += unescapeXml(m[5])
      }
      continue
    }
    const close = m[1] === '/', name = m[2], a = m[3] ?? '', self = m[4] === '/'
    switch (name) {
      case 'tbl':
        if (!close) { if (tbl) nested++; else tbl = { cells: [] } }
        else if (nested > 0) nested--
        else if (tbl) { out.push(finishTable(tbl)); tbl = undefined; cell = undefined; row = undefined }
        break
      case 'tr':
        if (tbl && nested === 0) { if (!close) { row = []; tbl.cells.push(row) } else row = undefined }
        break
      case 'tc':
        if (tbl && nested === 0) {
          if (!close) { cell = { rowSpan: 1, colSpan: 1, paras: [] }; row?.push(cell) } else cell = undefined
        }
        break
      case 'cellAddr':
        if (cell && nested === 0) { cell.col = attr(a, 'colAddr'); cell.row = attr(a, 'rowAddr') }
        break
      case 'cellSpan':
        if (cell && nested === 0) {
          cell.colSpan = Math.max(1, attr(a, 'colSpan') ?? 1)
          cell.rowSpan = Math.max(1, attr(a, 'rowSpan') ?? 1)
        }
        break
      case 'p':
        if (cell && !close && !self) newPara()
        break
      case 't':
        if (self) break
        inT = !close
        break
      case 'lineBreak':
        if (cell && cell.paras.length > 0) cell.paras[cell.paras.length - 1] += '\n'
        break
      case 'tab':
        if (inT && cell && cell.paras.length > 0) cell.paras[cell.paras.length - 1] += '\t'
        break
    }
  }
  return out
}

/** 칸 배치 — cellAddr 가 있으면 그 자리, 없으면 앞 칸 다음 빈 자리. 병합은 왼쪽 위 값을 범위 전체에 펼친다. */
function finishTable(t: Tbl): string[][] {
  const grid: string[][] = []
  const taken = new Set<string>()
  t.cells.forEach((cells, ri) => {
    let nextCol = 0
    for (const c of cells) {
      const r0 = c.row ?? ri
      let c0 = c.col ?? nextCol
      if (c.col === undefined) while (taken.has(`${r0},${c0}`)) c0++
      const text = c.paras.map((p) => p.trim()).filter((p) => p !== '').join('\n').trim()
      for (let r = r0; r < r0 + c.rowSpan; r++) {
        for (let cc = c0; cc < c0 + c.colSpan; cc++) {
          taken.add(`${r},${cc}`)
          while (grid.length <= r) grid.push([])
          while (grid[r].length <= cc) grid[r].push('')
          grid[r][cc] = text
        }
      }
      nextCol = c0 + c.colSpan
    }
  })
  return grid
}

/** hwpx 읽기 — zip 안 `Contents/section*.xml` 의 표를 문자열 표로. 기본은 첫 표
 *  (문서 첫 표가 보통 본 표이고, 「가장 큰 표」는 서식 틀이 이기기 쉬워 예측이 어렵다 — 다른 표는 sheets 로 고른다). 깨진 파일은 throw. */
export function readHwpx(bytes: Uint8Array, pick: string | number = 0): HwpxTable {
  const zip = XLSX.CFB.read(bytes, { type: 'array' })
  const paths: string[] = zip.FullPaths
  const secNo = (p: string) => Number(/(\d+)\.xml$/i.exec(p)?.[1] ?? 0)
  const secs = paths
    .map((p: string, i: number) => ({ p, i }))
    .filter(({ p }: { p: string }) => /(?:^|\/)Contents\/section\d+\.xml$/i.test(p))
    .sort((x: { p: string }, y: { p: string }) => secNo(x.p) - secNo(y.p))
  if (secs.length === 0) throw new Error('Contents/section*.xml 이 없음')
  const tables: string[][][] = []
  for (const { i } of secs) {
    const content = zip.FileIndex[i].content as Uint8Array | undefined
    if (content) tables.push(...parseSectionTables(new TextDecoder('utf-8').decode(content)))
  }
  if (tables.length === 0) return { rows: [], sheet: '', sheets: [], warnings: ['문서에 표가 없음'] }
  const sheets = tables.map((t, i) => `표 ${i + 1} (${t.length}×${t.reduce((w, r) => Math.max(w, r.length), 0)})`)
  const warnings: string[] = []
  let idx = typeof pick === 'number' ? pick : sheets.indexOf(pick)
  if (!Number.isInteger(idx) || idx < 0 || idx >= tables.length) {
    idx = 0
    warnings.push(`표 ${String(pick)} 를 찾지 못해 첫 표(${sheets[0]})를 읽음`)
  }
  return { rows: tables[idx], sheet: sheets[idx], sheets, warnings }
}
