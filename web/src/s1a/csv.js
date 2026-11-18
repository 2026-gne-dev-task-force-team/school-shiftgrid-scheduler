// 「ID · 임시 비밀번호」 목록 CSV — 서버는 임시 비밀번호를 저장하지 않으므로 화면에서 만든다(엑셀이 한글을 읽도록 BOM)
const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export function tempCsv(results) {
  const lines = ['이름,ID,임시 비밀번호', ...results.filter((r) => r.ok !== false && r.temp).map((r) => [r.name, r.loginId, r.temp].map(q).join(','))];
  return '﻿' + lines.join('\r\n');
}
export function downloadTemp(name, results) {
  const url = URL.createObjectURL(new Blob([tempCsv(results)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
