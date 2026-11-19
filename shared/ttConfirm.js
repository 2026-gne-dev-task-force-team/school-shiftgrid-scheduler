// 확정 전 재확인 문구 — 막지 않고 개수만 알린다. 빈칸 = 반별 (하루 교시 수 x 5) - 채운 칸.
export function emptyCount(classrooms, periods, cells) {
  const total = classrooms.reduce((a, c) => a + (periods?.grades?.[c.grade]?.periods ?? 5) * 5, 0);
  return Math.max(0, total - cells.filter((c) => c.subject_id).length);
}
export function confirmText(name, date, violations, empty) {
  const bits = [];
  if (violations) bits.push(`겹침·알림 ${violations}곳`);
  if (empty) bits.push(`빈칸 ${empty}칸`);
  return `「${name}」을 ${date}부터 확정합니다.${bits.length ? ` ${bits.join(' · ')}이 남아 있습니다. 그래도 확정할까요?` : ' 확정하면 교직원 화면에 뜹니다.'}`;
}
