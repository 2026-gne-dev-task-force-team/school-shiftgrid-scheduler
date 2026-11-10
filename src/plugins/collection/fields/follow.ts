/**
 * 관계 따라가기 위의 읽기 — 롤업 칸 · 관계 칸 칩의 「보일 대상 칸」이 같이 쓴다. 순수 함수(노드는 RelationLook 로 본다).
 *   🔴 대상 줄을 찾는 길은 resolveRelationTargets 하나뿐이다(그래서 반을 넣은 방 칸도 방의 값을 읽는다).
 *   shortcut: 값 글자는 글자·숫자·참거짓·id 배열(이름으로 풀기)만 — 날짜·상태 라벨 등은 안 푼다. 필요해지면 칸 타입의 toText 를 태운다.
 */
import type { RecordField } from '../contracts/collection';
import { kitOfType } from '../kits';
import { DB_TYPE } from '../schema';
import { resolveRelationTargets, type RelationLook } from './cast';

/** 「제목」 — 대상 줄의 이름 */
export const TITLE_KEY = '';
export type RollupHow = 'list' | 'count' | 'sum';
export interface RollupConfig { relationKey?: string; targetKey?: string; how: RollupHow }

export function rollupConfig(config: unknown): RollupConfig {
    const c = (config && typeof config === 'object' ? config : {}) as Partial<Record<keyof RollupConfig, unknown>>;
    return {
        relationKey: typeof c.relationKey === 'string' && c.relationKey ? c.relationKey : undefined,
        targetKey: typeof c.targetKey === 'string' ? c.targetKey : TITLE_KEY,
        how: c.how === 'count' || c.how === 'sum' ? c.how : 'list',
    };
}

/** 대상 목록에서 보일 수 있는 칸 — 제목 + 사용자 칸 + (꾸러미 목록이면) 기본 칸 */
export function targetFields(look: RelationLook | null, dbId: string): { key: string; label: string }[] {
    const n = look?.get(dbId);
    if (!look || !n) return [];
    const d = n.data as { fields?: RecordField[]; titleKey?: string } | undefined;
    const base = n.type === DB_TYPE ? [] : (kitOfType(n.type)?.config.baseFields ?? []).slice(1);
    const user = Array.isArray(d?.fields) ? d.fields : [];
    const seen = new Set<string>([TITLE_KEY, d?.titleKey ?? TITLE_KEY]);
    return [{ key: TITLE_KEY, label: '제목' }, ...[...base, ...user].filter((f) => !seen.has(f.key) && seen.add(f.key)).map((f) => ({ key: f.key, label: f.label }))];
}

/** 대상 줄 하나의 한 칸 값(날것) — 제목이면 이름 */
export function targetValue(look: RelationLook, id: string, key: string): unknown {
    const n = look.get(id);
    if (!n) return undefined;
    if (key === TITLE_KEY) return n.name;
    return (n.data as { values?: Record<string, unknown> } | undefined)?.values?.[key];
}

/** 값 → 글자 */
export function valueText(look: RelationLook, v: unknown): string {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? look.get(x)?.name ?? x : String(x))).join(', ');
    return typeof v === 'object' ? '' : String(v);
}

/** 이 줄의 관계 칸 하나를 따라가 대상 줄들의 한 칸을 모은다 — 그릴 때 계산(저장 안 함) */
export function rollupOf(look: RelationLook, fields: readonly RecordField[], row: unknown, config: unknown): { texts: string[]; count: number; sum: number } {
    const cfg = rollupConfig(config);
    const rel = fields.find((f) => f.key === cfg.relationKey && f.type === 'relation');
    const t = (rel?.config as { target?: { kind?: string; nodeId?: string } } | undefined)?.target;
    const empty = { texts: [] as string[], count: 0, sum: 0 };
    if (!rel || t?.kind !== 'db' || !t.nodeId) return empty;
    const ids = resolveRelationTargets(look, t.nodeId, (row as Record<string, unknown> | null)?.[rel.key]);
    const vals = ids.map((id) => targetValue(look, id, cfg.targetKey ?? TITLE_KEY));
    const sum = vals.reduce<number>((a, v) => a + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
    return { texts: vals.map((v) => valueText(look, v)).filter((s) => s !== ''), count: ids.length, sum };
}
