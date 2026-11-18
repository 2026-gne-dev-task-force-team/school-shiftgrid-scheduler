import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// 칸 너비에 맞춰 글자 단위로 줄바꿈(한글은 띄어쓰기가 없어도 된다)
function wrap(font, text, size, width) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    let cur = '';
    for (const ch of raw) {
      if (cur && font.widthOfTextAtSize(cur + ch, size) > width) { out.push(cur); cur = ch; } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

// sheets → PDF 바이트. A4 가로 · 시트마다 한 쪽. 창체 파랑 · 전담 빨강 · 음영은 설정 색.
export async function makePdf(sheets, st, docTitle) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'NanumGothic-Regular.ttf')), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(path.join(FONT_DIR, 'NanumGothic-Bold.ttf')), { subset: true });
  doc.setTitle(docTitle);
  const W = 841.89; const H = 595.28; const M = 36;
  const color = (k) => (k === 'changche' ? hex(st.changcheColor) : k === 'specialist' ? hex(st.specialistColor) : rgb(0, 0, 0));
  for (const sh of sheets.length ? sheets : [{ title: docTitle, header: [], rows: [] }]) {
    const page = doc.addPage([W, H]);
    page.drawText(`${sh.title}  -  ${docTitle}`.replace(' - ', ' · '), { x: M, y: H - M - 6, size: 16, font: bold });
    const cols = Math.max(1, sh.header.length);
    const labelW = 48;
    const cw = (W - 2 * M - labelW) / Math.max(1, cols - 1);
    const top = H - M - 28;
    const hh = 24;
    const rh = Math.min(80, (top - hh - M - 16) / Math.max(1, sh.rows.length));
    const xOf = (i) => (i === 0 ? M : M + labelW + (i - 1) * cw);
    const wOf = (i) => (i === 0 ? labelW : cw);
    sh.header.forEach((c, i) => {
      page.drawRectangle({ x: xOf(i), y: top - hh, width: wOf(i), height: hh, color: rgb(0.93, 0.93, 0.93), borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.6 });
      const w = bold.widthOfTextAtSize(c.text, 11);
      page.drawText(c.text, { x: xOf(i) + (wOf(i) - w) / 2, y: top - hh + 8, size: 11, font: bold });
    });
    sh.rows.forEach((row, r) => {
      const y0 = top - hh - (r + 1) * rh;
      row.forEach((c, i) => {
        page.drawRectangle({ x: xOf(i), y: y0, width: wOf(i), height: rh, color: c.shade ? hex(st.shadeColor) : undefined, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.6 });
        const size = i === 0 ? 10 : 10;
        const lines = wrap(reg, c.text, size, wOf(i) - 6).slice(0, Math.max(1, Math.floor((rh - 4) / (size + 2))));
        const block = lines.length * (size + 2);
        lines.forEach((ln, k) => {
          const w = reg.widthOfTextAtSize(ln, size);
          page.drawText(ln, { x: xOf(i) + (wOf(i) - w) / 2, y: y0 + rh / 2 + block / 2 - (k + 1) * (size + 2) + 3, size, font: reg, color: i === 0 ? rgb(0, 0, 0) : color(c.kind) });
        });
      });
    });
    page.drawText('파랑=창체 · 빨강=전담 · 회색 칸=과학실', { x: M, y: M - 8, size: 8, font: reg, color: rgb(0.4, 0.4, 0.4) });
  }
  return Buffer.from(await doc.save());
}
