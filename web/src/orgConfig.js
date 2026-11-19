// 기관 설정 — 학교마다 다른 값(요일·학기·상한·보결·직무·역할명). 서버 GET/PUT {P}/org/config 가 병합본을 준다.
// 서버가 아직 없거나 실패(404 포함)해도 DEFAULTS 로 화면이 돈다.
import { useEffect, useState } from 'react';
import { api } from './api.js';

export const DEFAULTS = {
  weekdays: ['월', '화', '수', '목', '금'],
  semesterStarts: [3, 9],
  limits: { periods: 12, grades: 12, classNo: 60, students: 100, capacity: 500, loadPerWeek: 40, block: 3, cells: 5000, rosterRows: 1000 },
  substitute: { order: ['A', 'B', 'C', 'D'], assistants: 'warn', lunchDuty: 'warn' },
  duties: ['담임', '전담', '비교과'],
  roleLabels: {},
  attendanceMonthlyCap: null,
};

// 받은 값을 기본값 위에 얹는다(모르는 모양은 기본값으로 둔다)
export function mergeConfig(src) {
  const s = src && typeof src === 'object' ? src : {};
  const list = (v, d) => (Array.isArray(v) && v.length ? v : d);
  return {
    ...DEFAULTS,
    ...s,
    weekdays: list(s.weekdays, DEFAULTS.weekdays),
    semesterStarts: list(s.semesterStarts, DEFAULTS.semesterStarts),
    limits: { ...DEFAULTS.limits, ...(s.limits || {}) },
    substitute: { ...DEFAULTS.substitute, ...(s.substitute || {}), order: list(s.substitute?.order, DEFAULTS.substitute.order) },
    duties: list(s.duties, DEFAULTS.duties),
    roleLabels: s.roleLabels && typeof s.roleLabels === 'object' ? s.roleLabels : {},
  };
}

export const configPath = (P) => `${P}/org/config`;

// 화면 훅: 처음엔 기본값, 서버가 답하면 병합본
export function useOrgConfig(P) {
  const [cfg, setCfg] = useState({ ...DEFAULTS, loaded: false }); // loaded: 서버 답(또는 실패)을 받았나 — 메뉴 깜빡임 막기용
  useEffect(() => {
    if (!P) return undefined; // 기관 밖(시스템관리자 등)이면 받지 않는다
    let live = true;
    api('GET', configPath(P)).then((r) => { if (live) setCfg({ ...mergeConfig(r), loaded: true }); }).catch(() => { if (live) setCfg({ ...DEFAULTS, loaded: true }); });
    return () => { live = false; };
  }, [P]);
  return cfg;
}

// 역할 표시명(권한 키는 그대로, 보이는 글자만 바꾼다)
export const roleLabel = (cfg, key) => cfg?.roleLabels?.[key] || key;

// 담임/전담 고르기 목록 — 기관 설정 duties 하나(기본 담임·전담·비교과). 지금 값이 목록 밖이면 끝에 덧붙여 보인다.
export function dutyOptions(cfg, current) {
  const list = cfg?.duties ?? DEFAULTS.duties;
  return current && !list.includes(current) ? [...list, current] : list;
}
