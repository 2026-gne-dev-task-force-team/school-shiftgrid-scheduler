/**
 * 사람 읽기 — 🔴 보결 줄의 사람 참조(`absentRef`·`takerRef`)를 교직원 명단(staff 약속)으로 푼다.
 *   `homeroom:<반>` 은 사람 id 가 아니라 반 이름이라 그대로 둔다. staff 가 꺼져 있거나 사람이 없으면 줄에 얼려 둔 이름을 쓴다.
 *   ⛔ 남의 조각은 약속 타입으로만.
 */
import type { Staff } from '../staff/contracts/staff';
import { absentLabel } from './list/visibility';

let staffGetter: () => Staff | null = () => null;
/** 활성(index.ts)이 건넨다 — 부를 때마다 읽어 staff 가 늦게 켜져도 따라잡는다. */
export function setStaffGetter(g: () => Staff | null): void { staffGetter = g; }

const HOMEROOM = 'homeroom:';
const memberOf = (ref: string) => (ref.startsWith(HOMEROOM) || ref === '' ? undefined : staffGetter()?.member(ref));

/** 결근자 보여 줄 이름 — 명단에 있으면 명단 이름, 아니면 얼려 둔 이름. */
export const absentShown = (b: { absentName: string; absentRef: string }): string => memberOf(b.absentRef)?.name || absentLabel(b);
/** 맡은 이 보여 줄 이름. */
export const takerShown = (t: { takerName: string; takerRef: string }): string => memberOf(t.takerRef)?.name || t.takerName || '알 수 없음';
/** 결근자가 담임인가 — 반 참조이거나 명단 구분이 담임(homeroom)이면. */
export const isHomeroomRef = (ref: string): boolean => ref.startsWith(HOMEROOM) || memberOf(ref)?.kind === 'homeroom';
