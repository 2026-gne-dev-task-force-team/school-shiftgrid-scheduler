import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// 담임 과목 취합본 읽기 — 엑셀(.xlsx) · 한글(.hwpx). 못 읽은 줄은 버리지 않고 ok:false 로 돌려 화면이 빨강으로 보인다.
export const TEMPLATE_HEADER = ['학년', '반', '교과', '주당 시수'];

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v.text ?? v.result ?? (v.richText ? v.richText.map((x) => x.text).join('') : '')).trim();
  return String(v).trim();
};

export async function readXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  const rows = [];
  ws?.eachRow({ includeEmpty: false }, (row) => rows.push(row.values.slice(1).map(text)));
  return rows;
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// hwpx: zip 안 Contents/section*.xml 의 표(<hp:tr>/<hp:tc>)에서 글자만 뽑는다
export async function readHwpx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort();
  if (!names.length) throw Object.assign(new Error('hwpx 가 아닙니다'), { status: 400 });
  const rows = [];
  for (const n of names) {
    const xml = await zip.files[n].async('string');
    for (const tr of xml.match(/<hp:tr[\s>][\s\S]*?<\/hp:tr>/g) ?? []) {
      rows.push((tr.match(/<hp:tc[\s>][\s\S]*?<\/hp:tc>/g) ?? []).map((tc) => unesc((tc.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) ?? []).map((t) => t.replace(/<\/?hp:t>/g, '')).join(' ').trim())));
    }
  }
  return rows;
}

export async function readTable(buf) {
  // zip 시그니처(PK)만 확인한다 — xlsx 와 hwpx 둘 다 zip 이라 안의 파일로 가른다
  if (!(buf?.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b)) throw Object.assign(new Error('엑셀(.xlsx)이나 한글(.hwpx) 파일이 아닙니다'), { status: 400 });
  const zip = await JSZip.loadAsync(buf);
  if (zip.file('mimetype') || Object.keys(zip.files).some((n) => n.startsWith('Contents/section'))) return readHwpx(buf);
  return readXlsx(buf);
}

// 표 → 줄. 머리 줄에서 열을 찾고(이름이 달라도 학년·반·교과·시수가 든 낱말), 없으면 앞 네 열 순서로 본다.
export function parseRows(table, { classrooms, subjects }) {
  const hi = table.findIndex((r) => r.some((c) => /학년/.test(c)) && r.some((c) => /교과|과목/.test(c)));
  const head = hi >= 0 ? table[hi] : null;
  const col = (re, dflt) => { const i = head ? head.findIndex((c) => re.test(c)) : -1; return i >= 0 ? i : dflt; };
  const ci = { grade: col(/학년/, 0), cls: col(/^반|반$/, 1), sub: col(/교과|과목/, 2), hours: col(/시수|시간/, 3) };
  const bySub = new Map(subjects.map((s) => [s.name, s]).concat(subjects.filter((s) => s.short_name).map((s) => [s.short_name, s])));
  const out = [];
  table.forEach((r, i) => {
    if (i === hi || !r.some((c) => c)) return;
    if (hi < 0 && i === 0 && !/\d/.test(r[ci.grade] ?? '')) return; // 머리 없는 파일의 제목 줄
    const num = (v) => { const m = /\d+/.exec(v ?? ''); return m ? Number(m[0]) : null; };
    const grade = num(r[ci.grade]); const cls = num(r[ci.cls]); const hours = num(r[ci.hours]);
    const subName = (r[ci.sub] ?? '').trim();
    const cl = classrooms.find((c) => c.grade === grade && c.class_no === cls);
    const sb = bySub.get(subName);
    const why = [];
    if (!cl) why.push('반을 찾지 못함');
    if (!sb) why.push('교과를 찾지 못함');
    if (!(hours > 0)) why.push('시수를 읽지 못함');
    out.push({ line: i + 1, grade, class_no: cls, subject: subName, hours, classroom_id: cl?.id ?? null, subject_id: sb?.id ?? null, ok: !why.length, reason: why.join(' · ') });
  });
  return out;
}

export async function makeTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('담임 과목');
  ws.addRow(TEMPLATE_HEADER).font = { bold: true };
  ws.addRow([3, 1, '체육', 3]);
  ws.columns.forEach((c) => { c.width = 12; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
