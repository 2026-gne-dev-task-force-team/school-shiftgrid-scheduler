import { decodeText, parseCsv } from './csv.ts'
import { detectKind } from './kind.ts'
import type { ReadOptions, TableResult } from './types.ts'
import { readHwp } from './hwp.ts'
import { readHwpx } from './hwpx.ts'
import { readXlsx } from './xlsx.ts'

export { detectKind } from './kind.ts'
export type { ReadOptions, TableKind, TableResult } from './types.ts'

/** 빈 줄 제거 · 앞뒤 공백 제거 · 가로 길이 맞춤(뒤쪽 빈 칸 열은 잘라냄). */
export function tidyRows(raw: string[][]): string[][] {
  const rows = raw.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
  const width = rows.reduce((w, r) => {
    let n = r.length
    while (n > 0 && r[n - 1] === '') n--
    return Math.max(w, n)
  }, 0)
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
}

/** 표 읽기 공통 입구 — 종류를 판별해 같은 꼴로 돌려준다. 못 읽는 것은 rows 빈 채 경고. 깨진 xlsx·hwpx·hwp 도 던지지 않고 경고. */
export function readTable(bytes: Uint8Array, opts: ReadOptions = {}): TableResult {
  const kind = detectKind(bytes, opts.name)
  switch (kind) {
    case 'csv': {
      const { text, encoding } = decodeText(bytes)
      return { kind, rows: tidyRows(parseCsv(text)), encoding, warnings: [] }
    }
    case 'xlsx': {
      try {
        const t = readXlsx(bytes, opts.sheet)
        return { kind, rows: tidyRows(t.rows), sheet: t.sheet, sheets: t.sheets, warnings: t.warnings }
      } catch (e) {
        return { kind, rows: [], warnings: [`xlsx 를 읽지 못함(깨진 파일?): ${e instanceof Error ? e.message : String(e)}`] }
      }
    }
    case 'hwpx': {
      try {
        const t = readHwpx(bytes, opts.sheet)
        return { kind, rows: tidyRows(t.rows), sheet: t.sheet, sheets: t.sheets, warnings: t.warnings }
      } catch (e) {
        return { kind, rows: [], warnings: [`hwpx 를 읽지 못함(깨진 파일?): ${e instanceof Error ? e.message : String(e)}`] }
      }
    }
    case 'hwp': {
      try {
        const t = readHwp(bytes, opts.sheet)
        return { kind, rows: tidyRows(t.rows), sheet: t.sheet, sheets: t.sheets, warnings: t.warnings }
      } catch (e) {
        return { kind, rows: [], warnings: [`hwp 를 읽지 못함(깨진 파일?): ${e instanceof Error ? e.message : String(e)}`] }
      }
    }
    default:
      return { kind, rows: [], warnings: ['알 수 없는 파일 꼴(비었거나 바이너리)'] }
  }
}
