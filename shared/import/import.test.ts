import { deflateRawSync } from 'node:zlib'
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

// 최소 hwp — OLE(FileHeader + BodyText/Section0..n). 레코드는 규격대로 합성
const rec = (tag: number, level: number, data: Uint8Array): Uint8Array => {
  const big = data.length >= 0xfff
  const out = new Uint8Array((big ? 8 : 4) + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, (tag | (level << 10) | ((big ? 0xfff : data.length) << 20)) >>> 0, true)
  if (big) dv.setUint32(4, data.length, true)
  out.set(data, big ? 8 : 4)
  return out
}
const u16s = (...v: number[]) => { const o = new Uint8Array(v.length * 2); const dv = new DataView(o.buffer); v.forEach((x, i) => dv.setUint16(i * 2, x, true)); return o }
const text = (t: string) => u16s(...Array.from(t, (c) => c.charCodeAt(0)), 13)
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }
const para = (level: number, t: string) => cat(rec(0x42, level, new Uint8Array(22)), rec(0x43, level + 1, text(t)))
const cellRec = (level: number, col: number, row: number, cs: number, rs: number, paras: string[]) =>
  cat(rec(0x48, level, cat(u16s(paras.length, 0, 0, 0), u16s(col, row, cs, rs, 0, 0, 0, 0))), ...paras.map((p) => para(level, p)))
const tblCtrl = (level: number, rows: number, cols: number, ...cells: Uint8Array[]) => {
  const id = new Uint8Array(4); new DataView(id.buffer).setUint32(0, 0x74626c20, true)
  return cat(rec(0x47, level, id), rec(0x4d, level + 1, cat(new Uint8Array(4), u16s(rows, cols))), ...cells)
}
// 2×2 표 — 첫 줄은 가로 병합 한 칸, 둘째 줄 첫 칸은 문단 둘
const table2x2 = () => cat(para(0, '본문'), tblCtrl(1, 2, 2,
  cellRec(2, 0, 0, 2, 1, ['합계']), cellRec(2, 0, 1, 1, 1, ['가', '나']), cellRec(2, 1, 1, 1, 1, ['다'])), para(0, '끝'))
const hwpBytes = (sections: Uint8Array[], opts: { compress?: boolean; attrs?: number } = {}): Uint8Array => {
  const cfb = XLSX.CFB.utils.cfb_new()
  const fh = new Uint8Array(256); fh.set(enc('HWP Document File'))
  new DataView(fh.buffer).setUint32(36, opts.attrs ?? (opts.compress ? 1 : 0), true)
  XLSX.CFB.utils.cfb_add(cfb, 'FileHeader', fh)
  sections.forEach((sec, i) => XLSX.CFB.utils.cfb_add(cfb, `BodyText/Section${i}`, opts.compress ? new Uint8Array(deflateRawSync(sec)) : sec))
  return new Uint8Array(XLSX.CFB.write(cfb, { type: 'array' }) as ArrayBuffer)
}

describe('hwp', () => {
  it('판별 · 비압축 — 병합 펼침 + 칸 안 두 문단', () => {
    const bytes = hwpBytes([table2x2()])
    expect(detectKind(bytes, 'a.hwp')).toBe('hwp')
    const r = readTable(bytes, { name: 'a.hwp' })
    expect(r.kind).toBe('hwp'); expect(r.warnings).toEqual([])
    expect(r.rows).toEqual([['합계', '합계'], ['가\n나', '다']])
    expect(r.sheets).toEqual(['표 1 (2×2)'])
  })
  it('압축 판도 같은 값', () => {
    expect(readTable(hwpBytes([table2x2()], { compress: true })).rows).toEqual([['합계', '합계'], ['가\n나', '다']])
  })
  it('표 여럿(구역 둘) — sheet 로 고르기, 못 찾으면 첫 표 + 경고', () => {
    const t2 = cat(tblCtrl(1, 1, 1, cellRec(2, 0, 0, 1, 1, ['둘째'])))
    const bytes = hwpBytes([table2x2(), t2])
    expect(readTable(bytes, { sheet: 1 }).rows).toEqual([['둘째']])
    const r = readTable(bytes, { sheet: '없음' })
    expect(r.rows[0]).toEqual(['합계', '합계']); expect(r.warnings.length).toBe(1)
  })
  it('중첩 표는 바깥 칸 글자로 합침', () => {
    const inner = tblCtrl(4, 1, 1, cellRec(5, 0, 0, 1, 1, ['안']))
    const outer = tblCtrl(1, 1, 2, cat(cellRec(2, 0, 0, 1, 1, ['바깥']).subarray(0), rec(0x47, 3, new Uint8Array(4)), inner), cellRec(2, 1, 0, 1, 1, ['옆']))
    expect(readTable(hwpBytes([outer])).rows).toEqual([['바깥\n안', '옆']])
  })
  it('탭·확장 컨트롤은 8 WCHAR 건너뜀', () => {
    const t = u16s(65, 2, 120, 120, 120, 120, 120, 120, 2, 66, 9, 120, 120, 120, 120, 120, 120, 9, 67, 13)
    const bytes = hwpBytes([tblCtrl(1, 1, 1, cat(rec(0x48, 2, cat(u16s(1, 0, 0, 0), u16s(0, 0, 1, 1, 0, 0, 0, 0))), rec(0x42, 2, new Uint8Array(22)), rec(0x43, 3, t)))])
    expect(readTable(bytes).rows).toEqual([['AB\tC']])
  })
  it('표 없는 문서 · 암호 비트 · 깨진 파일은 경고', () => {
    const none = readTable(hwpBytes([para(0, '본문뿐')]))
    expect(none.rows).toEqual([]); expect(none.warnings[0]).toContain('표가 없음')
    const pw = readTable(hwpBytes([table2x2()], { attrs: 2 }))
    expect(pw.rows).toEqual([]); expect(pw.warnings[0]).toContain('암호')
    const hwp = new Uint8Array(64); hwp.set([0xd0, 0xcf, 0x11, 0xe0])
    const bad = readTable(hwp, { name: 'a.hwp' })
    expect(bad.kind).toBe('hwp'); expect(bad.rows).toEqual([]); expect(bad.warnings.length).toBe(1)
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
