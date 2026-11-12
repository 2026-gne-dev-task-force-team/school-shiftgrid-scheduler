/** 목록에서 고른 보결 한 줄 — 목록 화면이 쓰고 상세 화면이 읽는다(화면 사이 손잡이). */
import { useSyncExternalStore } from 'react';

export interface Selection { date: string; rowId: string }
let current: Selection | null = null;
const subs = new Set<() => void>();

export function setSelection(s: Selection | null): void { current = s; subs.forEach((f) => f()); }
export function getSelection(): Selection | null { return current; }
export function useSelection(): Selection | null {
    return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getSelection);
}
