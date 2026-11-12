import * as XLSX from 'xlsx'

export interface XlsxTable { rows: string[][]; sheet: string; sheets: string[]; warnings: string[] }

/** xlsx 읽기 — 시트 하나를 문자열 표로. 병합 칸은 왼쪽 위 값을 병합 범위 전체에 펼친다. 깨진 파일은 throw. */
export function readXlsx(bytes: Uint8Array, pick: string | number = 0): XlsxTable {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheets = wb.SheetNames
  const warnings: string[] = []
  if (sheets.length === 0) return { rows: [], sheet: '', sheets, warnings: ['시트가 없음'] }
  let name = typeof pick === 'number' ? sheets[pick] : sheets.find((s) => s === pick)
  if (name === undefined) {
    name = sheets[0]
    warnings.push(`시트 ${String(pick)} 를 찾지 못해 첫 시트(${name})를 읽음`)
  }
  const ws = wb.Sheets[name]
  if (!ws || !ws['!ref']) return { rows: [], sheet: name, sheets, warnings }
  const range = XLSX.utils.decode_range(ws['!ref'])
  const text = (r: number, c: number): string => {
    const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
    if (!cell || cell.v === undefined || cell.v === null) return ''
    return String(cell.w ?? cell.v)
  }
  const rows: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const line: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) line.push(text(r, c))
    rows.push(line)
  }
  for (const m of ws['!merges'] ?? []) {
    const v = text(m.s.r, m.s.c)
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const rr = r - range.s.r, cc = c - range.s.c
        if (rows[rr] && cc >= 0 && cc < rows[rr].length) rows[rr][cc] = v
      }
    }
  }
  return { rows, sheet: name, sheets, warnings }
}
