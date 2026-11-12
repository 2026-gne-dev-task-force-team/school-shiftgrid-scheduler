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

describe('hwp 는 아직 못 읽음', () => {
  it('판별만 하고 경고', () => {
    const hwp = new Uint8Array(64); hwp.set([0xd0, 0xcf, 0x11, 0xe0])
    const r = readTable(hwp, { name: 'a.hwp' })
    expect(r.kind).toBe('hwp'); expect(r.rows).toEqual([]); expect(r.warnings[0]).toContain('P25c')
  })
})

// 최소 hwpx — mimetype 이 첫 항목인 zip
const P = (t: string) => `<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`
const TC = (col: number, row: number, body: string, cs = 1, rs = 1) =>
  `<hp:tc><hp:subList>${body}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/></hp:tc>`
const TBL = (trs: string[]) => `<hp:p><hp:run><hp:tbl>${trs.map((t) => `<hp:tr>${t}</hp:tr>`).join('')}</hp:tbl></hp:run></hp:p>`
const section = (inner: string) => `<?xml version="1.0"?><hs:sec xmlns:hs="a" xmlns:hp="b">${inner}</hs:sec>`
// 무압축(stored) zip 을 손으로 쓴다 — 항목 순서를 우리가 정해야 mimetype 이 첫 항목이 된다
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff
  for (const x of d) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const zipStored = (files: [string, Uint8Array][]): Uint8Array => {
  const parts: Uint8Array[] = [], central: Uint8Array[] = []
  let off = 0
  for (const [name, data] of files) {
    const nm = enc(name), crc = crc32(data)
    const lh = new DataView(new ArrayBuffer(30))
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true)
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true)
    lh.setUint16(26, nm.length, true)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true)
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true)
    ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true)
    parts.push(new Uint8Array(lh.buffer), nm, data)
    central.push(new Uint8Array(ch.buffer), nm)
    off += 30 + nm.length + data.length
  }
  const cdSize = central.reduce((n, x) => n + x.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, cdSize, true); end.setUint32(16, off, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0))
  let o = 0
  for (const x of all) { out.set(x, o); o += x.length }
  return out
}
const hwpxBytes = (sections: string[]): Uint8Array =>
  zipStored([['mimetype', enc('application/hwp+zip')], ...sections.map((x, i): [string, Uint8Array] => [`Contents/section${i}.xml`, enc(x)])])

describe('hwpx', () => {
  const t1 = TBL([
    TC(0, 0, P('과목')) + TC(1, 0, P('시수')) + TC(2, 0, P('비고')),
    TC(0, 1, P('국어')) + TC(1, 1, P('4')) + TC(2, 1, P('첫줄') + P('둘째 &amp; 줄')),
    TC(0, 2, P('합계 병합'), 2) + TC(2, 2, P('x')),
  ])
  it('2×3 표 · 병합 펼침 · 칸 안 두 문단은 줄바꿈', () => {
    const bytes = hwpxBytes([section(t1)])
    expect(detectKind(bytes, 'a.hwpx')).toBe('hwpx')
    const r = readTable(bytes, { name: 'a.hwpx' })
    expect(r.kind).toBe('hwpx')
    expect(r.rows).toEqual([
      ['과목', '시수', '비고'],
      ['국어', '4', '첫줄\n둘째 & 줄'],
      ['합계 병합', '합계 병합', 'x'],
    ])
    expect(r.sheets).toEqual(['표 1 (3×3)'])
    expect(r.warnings).toEqual([])
  })
  it('세로 병합(rowSpan)도 펼친다', () => {
    const t = TBL([TC(0, 0, P('A'), 1, 2) + TC(1, 0, P('b')), TC(1, 1, P('c'))])
    expect(readTable(hwpxBytes([section(t)])).rows).toEqual([['A', 'b'], ['A', 'c']])
  })
  it('표 둘(구역 둘)에서 번호·이름으로 고른다 · 없는 번호는 경고 후 첫 표', () => {
    const t2 = TBL([TC(0, 0, P('둘째표'))])
    const bytes = hwpxBytes([section(t1), section(t2)])
    const r = readTable(bytes, { sheet: 1 })
    expect(r.rows).toEqual([['둘째표']])
    expect(r.sheets?.length).toBe(2)
    expect(readTable(bytes, { sheet: r.sheets?.[1] }).rows).toEqual([['둘째표']])
    const miss = readTable(bytes, { sheet: 9 })
    expect(miss.rows[0][0]).toBe('과목')
    expect(miss.warnings.length).toBe(1)
  })
  it('표 없는 문서 → 경고 · 깨진 zip 은 던지지 않고 경고', () => {
    const r = readTable(hwpxBytes([section(P('본문뿐'))]))
    expect(r.rows).toEqual([])
    expect(r.warnings[0]).toContain('표가 없음')
    const x = new Uint8Array(60); x.set([0x50, 0x4b, 0x03, 0x04]); x.set(enc('mimetype'), 30)
    const bad = readTable(x)
    expect(bad.kind).toBe('hwpx'); expect(bad.rows).toEqual([]); expect(bad.warnings.length).toBe(1)
  })
  it('중첩 표는 바깥 칸 글자로 합친다', () => {
    const t = TBL([TC(0, 0, P('바깥') + TBL([TC(0, 0, P('안'))])) + TC(1, 0, P('옆'))])
    expect(readTable(hwpxBytes([section(t)])).rows).toEqual([['바깥\n안', '옆']])
  })
})
