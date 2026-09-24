/**
 * build/icon.png (1024×1024) 을 만드는 1회용 스크립트 — 외부 패키지 없이 node 내장 zlib 만 쓴다.
 * 실행: node build/make-icon.cjs
 * 어두운 바탕(#10151c) 위에 격자(시간표) 무늬 + 강조 칸 둘 — 자작앱 디자인 가이드 2절의 뜻색을 따른다.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 1024;
const BG = [16, 21, 28];       // #10151c
const LINE = [58, 74, 94];     // 은은한 회색-파랑 격자선
const ACCENT = [43, 108, 176]; // #2b6cb0 강조

const buf = Buffer.alloc(SIZE * SIZE * 4);
function setPx(x, y, [r, g, b], a = 255) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) setPx(x, y, BG);

const margin = 128;
const inner = SIZE - margin * 2;
const cols = 6, rows = 6;
const cellW = inner / cols, cellH = inner / rows;

function line(x0, y0, x1, y1, color, thickness) {
    const half = Math.floor(thickness / 2);
    if (x0 === x1) {
        for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
            for (let t = -half; t <= half; t++) setPx(x0 + t, y, color);
    } else {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
            for (let t = -half; t <= half; t++) setPx(x, y0 + t, color);
    }
}

for (let c = 0; c <= cols; c++) {
    const x = Math.round(margin + c * cellW);
    line(x, margin, x, margin + inner, LINE, c === 0 || c === cols ? 10 : 5);
}
for (let r = 0; r <= rows; r++) {
    const y = Math.round(margin + r * cellH);
    line(margin, y, margin + inner, y, LINE, r === 0 || r === rows ? 10 : 5);
}

function fillCell(c, r, color) {
    const x0 = Math.round(margin + c * cellW), x1 = Math.round(margin + (c + 1) * cellW);
    const y0 = Math.round(margin + r * cellH), y1 = Math.round(margin + (r + 1) * cellH);
    for (let y = y0 + 8; y < y1 - 8; y++) for (let x = x0 + 8; x < x1 - 8; x++) setPx(x, y, color);
}
// 강조 칸 — 시간표에서 배정된 칸(연강처럼 두 칸 붙임) 느낌
fillCell(1, 2, ACCENT);
fillCell(2, 2, ACCENT);
fillCell(4, 4, ACCENT);

// ── PNG 인코딩 (IHDR + IDAT + IEND, 필터 0, RGBA 8bit) ──────────────────────
const CRC_TABLE = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(b) {
    let crc = 0xffffffff;
    for (let i = 0; i < b.length; i++) crc = CRC_TABLE[(crc ^ b[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type: RGBA
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // 필터 없음
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png = encodePNG(SIZE, SIZE, buf);
const out = path.join(__dirname, 'icon.png');
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
