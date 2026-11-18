import ExcelJS from 'exceljs';

const argb = (h) => `FF${h.slice(1).toUpperCase()}`;

// sheets → 엑셀 바이트. 시트 이름은 엑셀 규칙(31자 · 금지 문자)에 맞춘다.
export async function makeXlsx(sheets, st, docTitle) {
  const wb = new ExcelJS.Workbook();
  wb.title = docTitle;
  const used = new Set();
  for (const sh of sheets.length ? sheets : [{ title: docTitle, header: [], rows: [] }]) {
    let name = sh.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || '시트';
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.getColumn(1).width = 8;
    for (let c = 2; c <= Math.max(2, sh.header.length); c++) ws.getColumn(c).width = 16;
    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const put = (r, i, c, head) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = c.text;
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      const col = c.kind === 'changche' ? st.changcheColor : c.kind === 'specialist' ? st.specialistColor : null;
      cell.font = { name: '맑은 고딕', size: 10, bold: !!head, ...(col && !head ? { color: { argb: argb(col) } } : {}) };
      if (head) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
      else if (c.shade) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.shadeColor) } };
    };
    sh.header.forEach((c, i) => put(1, i, c, true));
    sh.rows.forEach((row, r) => { ws.getRow(r + 2).height = 42; row.forEach((c, i) => put(r + 2, i, c, false)); });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
