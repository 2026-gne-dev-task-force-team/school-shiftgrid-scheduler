// 순수: 교시 시작·끝 시각 칸 → 서버 period_config.times 형식([{start,end}], 1교시부터 차례로).
// rows: [{start,end}] 화면 칸(빈 문자열 가능). 마지막 입력 칸까지 저장하고 빈 교시는 null 로 둔다. 틀린 칸이 있으면 ok:false.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function buildTimes(rows) {
  const times = [];
  let last = -1;
  for (let i = 0; i < rows.length; i++) {
    const s = (rows[i]?.start ?? '').trim();
    const e = (rows[i]?.end ?? '').trim();
    if (!s && !e) { times.push(null); continue; }
    if (!HHMM.test(s) || !HHMM.test(e)) return { ok: false, msg: `${i + 1}교시는 09:00 꼴로 적어 주세요`, pending: true };
    if (s >= e) return { ok: false, msg: `${i + 1}교시 끝이 시작보다 늦어야 합니다` };
    times.push({ start: s, end: e });
    last = i;
  }
  return { ok: true, times: times.slice(0, last + 1) }; // 빈 교시는 null 자리, 뒤쪽 빈 칸은 자른다
}
export const rowsOf = (times, n) => Array.from({ length: n }, (_, i) => ({ start: times?.[i]?.start ?? '', end: times?.[i]?.end ?? '' }));
