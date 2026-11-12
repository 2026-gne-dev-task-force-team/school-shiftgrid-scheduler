import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { detectKind, readTable } from './index.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const xlsxBytes = (ws: XLSX.WorkSheet, extra?: Record<string, XLSX.WorkSheet>): Uint8Array => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'A시트')
  for (const [n, s] of Object.entries(extra ?? {})) XLSX.utils.book_append_sheet(wb, s, n)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}
// cp949(EUC-KR) 로 「과목,국어」 — 가나다 대신 확실한 한글 바이트
const EUC_KR_GWAMOK = [0xb0, 0xfa, 0xb8, 0xf1] // 과목
const EUC_KR_KOREAN = [0xb1, 0xb9, 0xbe, 0xee] // 국어

describe('판별 넷', () => {
  it('xlsx = zip PK · hwpx = zip + mimetype · hwp = OLE · 텍스트 = csv', () => {
    expect(detectKind(xlsxBytes(XLSX.utils.aoa_to_sheet([['a']])), 'x.xlsx')).toBe('xlsx')
    const hwpx = new Uint8Array(60)
    hwpx.set([0x50, 0x4b, 0x03, 0x04]); hwpx.set(enc('mimetype'), 30)
    expect(detectKind(hwpx, 'a.hwpx')).toBe('hwpx')
    const hwp = new Uint8Array(512); hwp.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(detectKind(hwp, 'a.hwp')).toBe('hwp')
    expect(detectKind(enc('a,b\n1,2'), 'a.csv')).toBe('csv')
  })
  it('확장자가 거짓이어도 바이트가 이긴다 · 빈 것·바이너리는 unknown', () => {
    expect(detectKind(enc('a,b'), 'x.xlsx')).toBe('csv')
    expect(detectKind(new Uint8Array(0))).toBe('unknown')
    expect(detectKind(new Uint8Array([1, 0, 2, 3]))).toBe('unknown')
  })
})

describe('CSV', () => {
  it('UTF-8 BOM · 빈 줄·공백 정리', () => {
    const r = readTable(enc('﻿ 과목 , 시수 \n\n국어, 4 \n,\n'), { name: 'a.csv' })
    expect(r.encoding).toBe('utf-8')
    expect(r.rows).toEqual([['과목', '시수'], ['국어', '4']])
  })
  it('cp949(EUC-KR)', () => {
    const r = readTable(new Uint8Array([...EUC_KR_GWAMOK, 0x2c, ...EUC_KR_KOREAN, 0x0d, 0x0a]), { name: 'a.csv' })
    expect(r.encoding).toBe('euc-kr')
    expect(r.rows).toEqual([['과목', '국어']])
  })
  it('따옴표 속 쉼표·줄바꿈·이중 따옴표', () => {
    const r = readTable(enc('a,"x,y","줄\n바꿈","say ""hi"""\r\n1,2,3,4'))
    expect(r.rows).toEqual([['a', 'x,y', '줄\n바꿈', 'say "hi"'], ['1', '2', '3', '4']])
  })
  it('탭 구분 · 들쭉날쭉한 줄은 가로 길이를 맞춘다', () => {
    const r = readTable(enc('a\tb\tc\n1\n'))
    expect(r.rows).toEqual([['a', 'b', 'c'], ['1', '', '']])
  })
})

describe('xlsx', () => {
  it('첫 시트 기본 · 병합 칸 펼침 · 숫자는 문자열', () => {
    const ws = XLSX.utils.aoa_to_sheet([['학년', '과목', ''], ['1', '국어', 4], ['', '', '']])
    ws['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }]
    const r = readTable(xlsxBytes(ws), { name: 'a.xlsx' })
    expect(r.kind).toBe('xlsx')
    expect(r.sheet).toBe('A시트')
    expect(r.rows).toEqual([['학년', '과목', '과목'], ['1', '국어', '4']])
  })
  it('시트 고르기(이름·번호) · 없는 시트는 경고 후 첫 시트', () => {
    const bytes = xlsxBytes(XLSX.utils.aoa_to_sheet([['첫']]), { B시트: XLSX.utils.aoa_to_sheet([['둘']]) })
    expect(readTable(bytes, { sheet: 'B시트' }).rows).toEqual([['둘']])
    expect(readTable(bytes, { sheet: 1 }).sheets).toEqual(['A시트', 'B시트'])
    const miss = readTable(bytes, { sheet: '없음' })
    expect(miss.rows).toEqual([['첫']])
    expect(miss.warnings.length).toBe(1)
  })
  it('표가 B2 에서 시작해도 병합 위치가 맞다(앞 빈 칸 열은 자리 유지)', () => {
    const ws = XLSX.utils.sheet_add_aoa({}, [['x', 'y'], ['z', 'w']], { origin: 'B2' })
    ws['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 1, c: 2 } }]
    expect(readTable(xlsxBytes(ws)).rows).toEqual([['', 'x', 'x'], ['', 'z', 'w']])
  })
  it('깨진 zip 은 던지지 않고 경고', () => {
    const r = readTable(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]), { name: 'a.xlsx' })
    expect(r.rows).toEqual([])
    expect(r.warnings.length).toBe(1)
  })
})

describe('hwp·hwpx 는 아직 못 읽음', () => {
  it('판별만 하고 경고', () => {
    const hwp = new Uint8Array(64); hwp.set([0xd0, 0xcf, 0x11, 0xe0])
    const r = readTable(hwp, { name: 'a.hwp' })
    expect(r.kind).toBe('hwp'); expect(r.rows).toEqual([]); expect(r.warnings[0]).toContain('P25c')
    const x = new Uint8Array(60); x.set([0x50, 0x4b, 0x03, 0x04]); x.set(enc('mimetype'), 30)
    expect(readTable(x).warnings[0]).toContain('P25b')
  })
})
