// 급식 3교대 벽시계 — 학년별 점심 시작 시각을 교대로 묶는다(순수 함수).
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const toStr = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

export function lunchShifts(periodConfig, minutes = 40) {
  const by = new Map();
  const noLunch = [];
  for (const [g, v] of Object.entries(periodConfig?.grades ?? {})) {
    if (!v?.lunch) { noLunch.push(Number(g)); continue; }
    const s = toMin(v.lunch);
    if (!by.has(s)) by.set(s, []);
    by.get(s).push(Number(g));
  }
  const shifts = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([s, grades], i) => ({
    shift: i + 1, start: toStr(s), end: toStr(s + minutes), grades: grades.sort((a, b) => a - b),
  }));
  // 알림만 — 거부하지 않는다: 교대가 3이 아니거나 시각이 겹치는 교대
  const notes = [];
  if (shifts.length && shifts.length !== 3) notes.push(`급식 교대가 ${shifts.length}개입니다(3교대가 아님)`);
  for (let i = 1; i < shifts.length; i++) {
    if (toMin(shifts[i].start) < toMin(shifts[i - 1].end)) notes.push(`${shifts[i - 1].shift}교대와 ${shifts[i].shift}교대 시각이 겹칩니다`);
  }
  return { minutes, shifts, noLunch: noLunch.sort((a, b) => a - b), notes };
}
