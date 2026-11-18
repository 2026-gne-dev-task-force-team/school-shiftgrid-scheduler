// 순수: 생성 설정의 「세부값」(params·options·avoid) ↔ 저장 형식. 서버 soft-weights.js 의 zod 와 같은 범위다.
// 저장은 기관 설정 통째 교체라 가중(bands…)과 같은 PUT 에 같이 실어야 안 지워진다.
export const PARAM_SPEC = {
  maxConsec: { label: '연속수업 한도(교시)', def: 6, min: 1, max: 12, hint: '교사가 쉬지 않고 이어서 가르치는 교시 수가 이를 넘으면 감점' },
  dailySubjectCap: { label: '반 하루 과목 수 상한', def: 6, min: 1, max: 12, hint: '한 반이 하루에 듣는 서로 다른 과목 수가 이를 넘으면 감점' },
  amTolerance: { label: '오전·오후 쏠림 허용', def: 3, min: 0, max: 40, hint: '오전과 오후 수업 수 차이가 이만큼까지는 감점하지 않음' },
  maxPerDay: { label: '교사 하루 수업 상한', def: 6, min: 1, max: 12, hint: '「교사 요일 배치」에서 하루에 이보다 많이 몰리면 감점' },
};
export const OPTION_SPEC = {
  roomClassSplit: { label: '하루 한 장소', hint: '한 반이 하루에 한 특별실에서만 수업하도록 맞춘다(기본 꺼짐)' },
  oneSubjectDay: { label: '하루 한 학년·과목', hint: '교사가 하루에 한 학년·한 과목만 가르치도록 맞춘다(기본 꺼짐)' },
};
export const avoidKey = (a) => `${a.weekday}-${a.period}`;
export const avoidParse = (s) => { const [weekday, period] = s.split('-').map(Number); return { weekday, period }; };

// 저장된 weights → 화면 상태
export function extraFrom(weights) {
  const w = weights && typeof weights === 'object' ? weights : {};
  return { params: { ...(w.params || {}) }, options: { ...(w.options || {}) }, avoid: { ...(w.avoid || {}) } };
}
// 화면 상태 → 저장할 조각(비어 있는 것·기본값 칸은 뺀다)
export function extraToWeights(x) {
  const out = {};
  const params = {};
  for (const [k, v] of Object.entries(x.params || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (k === 'roundSubjects') { if (Array.isArray(v) && v.length) params.roundSubjects = v.map(Number); continue; }
    params[k] = v;
  }
  if (Object.keys(params).length) out.params = params;
  const options = Object.fromEntries(Object.entries(x.options || {}).filter(([, v]) => v === true));
  if (Object.keys(options).length) out.options = options;
  const avoid = Object.fromEntries(Object.entries(x.avoid || {}).filter(([, l]) => Array.isArray(l) && l.length));
  if (Object.keys(avoid).length) out.avoid = avoid;
  return out;
}
