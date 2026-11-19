// 자동 생성 중간 결과 저장 — 브라우저 IndexedDB 를 얇게 직접 쓴다. 키 만들기·직렬화는 순수 함수(node 시험 가능).
const DB = 's2-gen-partial';
const ST = 'partial';

// 기관·학기·시간표 id 로 갈라 다른 기관 것이 섞이지 않게. 아직 저장 전인 생성 중 시안은 tid 가 없어 'new'
export const genKey = (orgId, termId, tid = 'new') => {
  if (orgId == null || termId == null) throw new Error('기관·학기가 필요합니다');
  return `org${orgId}:term${termId}:tt${tid}`;
};
export const packPartial = (key, { done, k, candidates }) => JSON.stringify({ v: 1, key, at: new Date().toISOString(), done, k, candidates });
// 키가 다르거나 깨졌으면 null — 남의 것·낡은 꼴을 이어 쓰지 않는다
export const unpackPartial = (key, s) => {
  try { const p = JSON.parse(s); return p?.v === 1 && p.key === key && Array.isArray(p.candidates) && p.candidates.length ? p : null; } catch { return null; }
};

const open = () => new Promise((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST);
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((ok, no) => {
    const t = db.transaction(ST, mode);
    const rq = fn(t.objectStore(ST));
    t.oncomplete = () => { db.close(); ok(rq?.result); };
    t.onerror = t.onabort = () => { db.close(); no(t.error); };
  });
};
// 저장·지움이 안 돼도(사생활 보호 모드 등) 생성 자체는 막지 않는다
export const savePartial = (key, p) => tx('readwrite', (s) => s.put(packPartial(key, p), key)).catch(() => {});
export const loadPartial = (key) => tx('readonly', (s) => s.get(key)).then((s) => unpackPartial(key, s)).catch(() => null);
export const dropPartial = (key) => tx('readwrite', (s) => s.delete(key)).catch(() => {});
// 로그아웃 때: 이 브라우저의 중간 결과를 전부 지운다
export const clearAllPartial = () => tx('readwrite', (s) => s.clear()).catch(() => {});
