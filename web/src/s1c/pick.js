// 서버가 큰 정수 id 를 문자열로 줄 때가 있어, 고르기 값(문자열)과 === 로 비교하면 늘 못 찾는다.
export const sameId = (a, b) => a != null && b != null && String(a) === String(b);
// 목록에서 id 로 찾고, 없으면 첫 항목(또는 null)
export const findById = (list, id, key = 'id') => (list || []).find((x) => sameId(x[key], id)) || null;
export const pickOrFirst = (list, id, key = 'id') => findById(list, id, key) || (list || [])[0] || null;

// 격자에서 고른 시안·반을 새로고침 뒤에도 되살린다(localStorage). 저장소가 없거나 깨져도 조용히 빈 값.
const KEY = 's1c.pick';
export function parsePick(raw) {
  try {
    const o = JSON.parse(raw);
    return { tid: o?.tid != null ? String(o.tid) : null, classId: o?.classId != null ? String(o.classId) : null };
  } catch { return { tid: null, classId: null }; }
}
export const loadPick = (store = globalThis.localStorage) => { try { return parsePick(store?.getItem(KEY)); } catch { return parsePick(null); } };
export const savePick = (p, store = globalThis.localStorage) => { try { store?.setItem(KEY, JSON.stringify(p)); } catch { /* 저장 못 해도 화면은 동작 */ } };
