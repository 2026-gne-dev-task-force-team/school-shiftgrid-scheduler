/** 배지에서 온 「배정 탭으로」 요청 — 열린 패널이 구독해 탭을 바꾼다. 일반 열기는 건드리지 않는다. */
const listeners = new Set<() => void>();
export const requestAssignTab = () => { listeners.forEach((l) => l()); };
export const onAssignTabRequest = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
