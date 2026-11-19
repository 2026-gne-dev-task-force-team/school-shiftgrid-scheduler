// F-13: 특별실 주간 표 + 끌어 옮기기 미리보기 — 순수 함수. 막지 않고 보여 주기만 한다.
import { findOverlaps } from './overlap.js';

// 방 하나의 주간 표: Map "요일:교시" → 그 칸에 든 cells. 서로 다른 반이 둘 이상이면 겹침.
export function roomWeek(cells, roomId) {
  const m = new Map();
  for (const c of cells) {
    if (String(c.special_room_id) !== String(roomId)) continue;
    const k = `${c.weekday}:${c.period}`;
    (m.get(k) ?? m.set(k, []).get(k)).push(c);
  }
  return m;
}
export const isClash = (list) => !!list && new Set(list.map((c) => String(c.classroom_id))).size > 1;

// 칸 from → to(같은 반)로 옮기면? 놓을 자리에 생기는 겹침 문구와, 보내는 쪽이 비는지.
// 놓을 자리에 이미 칸이 있으면 맞바꿈으로 본다(보내는 쪽이 비지 않는다).
export function movePreview(cells, from, to, ctx = {}) {
  const at = (x) => (c) => String(c.classroom_id) === String(x.classroom_id) && c.weekday === x.weekday && c.period === x.period;
  const src = cells.find(at(from));
  if (!src || at(from)(to)) return null;
  const dst = cells.find(at(to));
  const rest = cells.filter((c) => c !== src && c !== dst);
  const after = [...rest, { ...src, weekday: to.weekday, period: to.period }, ...(dst ? [{ ...dst, weekday: from.weekday, period: from.period }] : [])];
  const mine = (c) => at(to)(c) || (dst && at(from)(c));
  const key = (o) => `${o.rule}:${o.weekday}:${o.period}:${o.membership_id ?? o.special_room_id ?? ''}`;
  const before = new Set(findOverlaps(cells, ctx).map(key));
  const fresh = findOverlaps(after, ctx).filter((o) => o.cells.some(mine) && !before.has(key(o)));
  return { overlaps: fresh.map((o) => o.detail), vacates: !dst, swap: !!dst };
}
