/**
 * 시험 전용 — 표 한 장(문자열 2차원)을 hwpx·hwp·xlsx·csv 바이트로 합성한다. 실물 파일은 레포에 두지 않는다(fixtures ⛔).
 * 규격 합성 방식은 `shared/import/import.test.ts` 와 같다.
 */
import * as XLSX from 'xlsx';

const enc = (s: string) => new TextEncoder().encode(s);
export const csvBytes = (rows: string[][]): Uint8Array =>
    enc(rows.map((r) => r.map((v) => (/[,"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)).join(',')).join('\r\n'));
export const xlsxBytes = (tables: string[][][]): Uint8Array => {
    const wb = XLSX.utils.book_new();
    tables.forEach((t, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t), '시트' + (i + 1)));
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
};

// ── hwpx: mimetype 이 첫 항목인 무압축 zip
const P = (t: string) => `<hp:p><hp:run><hp:t>${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</hp:t></hp:run></hp:p>`;
const TC = (col: number, row: number, t: string) =>
    `<hp:tc><hp:subList>${t.split('\n').map(P).join('')}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>`;
const TBL = (t: string[][]) => `<hp:p><hp:run><hp:tbl>${t.map((r, ri) => `<hp:tr>${r.map((v, ci) => TC(ci, ri, v)).join('')}</hp:tr>`).join('')}</hp:tbl></hp:run></hp:p>`;
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (const x of d) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const zipStored = (files: [string, Uint8Array][]): Uint8Array => {
    const parts: Uint8Array[] = [], central: Uint8Array[] = [];
    let off = 0;
    for (const [name, data] of files) {
        const nm = enc(name), crc = crc32(data);
        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
        lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nm.length, true);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
        ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
        ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
        parts.push(new Uint8Array(lh.buffer), nm, data); central.push(new Uint8Array(ch.buffer), nm);
        off += 30 + nm.length + data.length;
    }
    const cdSize = central.reduce((n, x) => n + x.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of all) { out.set(x, o); o += x.length; }
    return out;
};
/** 표마다 구역 하나 */
export const hwpxBytes = (tables: string[][][]): Uint8Array =>
    zipStored([['mimetype', enc('application/hwp+zip')], ...tables.map((t, i): [string, Uint8Array] => [`Contents/section${i}.xml`, enc(`<?xml version="1.0"?><hs:sec xmlns:hs="a" xmlns:hp="b">${TBL(t)}</hs:sec>`)])]);

// ── hwp: OLE(FileHeader + BodyText/SectionN), 레코드는 규격대로
const rec = (tag: number, level: number, data: Uint8Array): Uint8Array => {
    const big = data.length >= 0xfff;
    const out = new Uint8Array((big ? 8 : 4) + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, (tag | (level << 10) | ((big ? 0xfff : data.length) << 20)) >>> 0, true);
    if (big) dv.setUint32(4, data.length, true);
    out.set(data, big ? 8 : 4);
    return out;
};
const u16s = (...v: number[]) => { const o = new Uint8Array(v.length * 2); const dv = new DataView(o.buffer); v.forEach((x, i) => dv.setUint16(i * 2, x, true)); return o; };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const para = (level: number, t: string) => cat(rec(0x42, level, new Uint8Array(22)), rec(0x43, level + 1, u16s(...Array.from(t, (c) => c.charCodeAt(0)), 13)));
const cellRec = (level: number, col: number, row: number, t: string) => {
    const paras = t.split('\n');
    return cat(rec(0x48, level, cat(u16s(paras.length, 0, 0, 0), u16s(col, row, 1, 1, 0, 0, 0, 0))), ...paras.map((p) => para(level, p)));
};
const tblCtrl = (t: string[][]) => {
    const id = new Uint8Array(4); new DataView(id.buffer).setUint32(0, 0x74626c20, true);
    const w = t.reduce((m, r) => Math.max(m, r.length), 0);
    return cat(rec(0x47, 1, id), rec(0x4d, 2, cat(new Uint8Array(4), u16s(t.length, w))), ...t.flatMap((r, ri) => r.map((v, ci) => cellRec(2, ci, ri, v))));
};
export const hwpBytes = (tables: string[][][]): Uint8Array => {
    const cfb = XLSX.CFB.utils.cfb_new();
    const fh = new Uint8Array(256); fh.set(enc('HWP Document File'));
    new DataView(fh.buffer).setUint32(36, 0, true); // 비압축(압축 판은 shared/import 시험이 본다)
    XLSX.CFB.utils.cfb_add(cfb, 'FileHeader', fh);
    tables.forEach((t, i) => XLSX.CFB.utils.cfb_add(cfb, `BodyText/Section${i}`, cat(para(0, '본문'), tblCtrl(t))));
    return new Uint8Array(XLSX.CFB.write(cfb, { type: 'array' }) as ArrayBuffer);
};
