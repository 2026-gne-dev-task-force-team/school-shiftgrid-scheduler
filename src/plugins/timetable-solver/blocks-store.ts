/**
 * 편성 막힘 저장 — 「매주 이 요일 이 칸은 이 대상에게 안 된다」 자료를 편성 쪽에 둔다(F0 결정 ④: ops-days 를 넓히지 않는다).
 *   🔴 여기에 저장하는 것은 막힘 줄 하나뿐 — 교사·반·방 이름은 정본 id 로만 가리키고 복사해 두지 않는다.
 *   저장 자리: host.storage(작은 값 · 플러그인별 네임스페이스). 읽을 때마다 값을 걸러 낸다(깨진 줄은 조용히 뺀다).
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { SolverBlockRow, SolverBlockTarget } from './contracts/solver';

export const BLOCKS_KEY = 'blocks';

const KINDS = new Set(['agent', 'track', 'resource']);
const HHMM = /^\d{1,2}:\d{2}$/;

function cleanTarget(t: unknown): SolverBlockTarget | null {
    const o = t as { kind?: unknown; id?: unknown } | null;
    if (!o || typeof o.id !== 'string' || o.id === '' || typeof o.kind !== 'string' || !KINDS.has(o.kind)) return null;
    return { kind: o.kind as SolverBlockTarget['kind'], id: o.id };
}

/** 저장된 값(또는 입력) → 쓸 수 있는 막힘 줄만. id·이름·요일(1~7)·대상 하나 이상이 있어야 한다. */
export function normalizeBlocks(raw: unknown): SolverBlockRow[] {
    if (!Array.isArray(raw)) return [];
    const out: SolverBlockRow[] = [];
    const seen = new Set<string>();
    for (const r of raw) {
        const o = r as Record<string, unknown> | null;
        if (!o || typeof o.id !== 'string' || o.id === '' || seen.has(o.id)) continue;
        if (typeof o.weekday !== 'number' || !Number.isInteger(o.weekday) || o.weekday < 1 || o.weekday > 7) continue;
        const targets = (Array.isArray(o.targets) ? o.targets : []).map(cleanTarget).filter((t): t is SolverBlockTarget => t !== null);
        if (targets.length === 0) continue;
        const row: SolverBlockRow = { id: o.id, name: typeof o.name === 'string' ? o.name : '', weekday: o.weekday, targets };
        if (typeof o.slotIndex === 'number' && Number.isInteger(o.slotIndex) && o.slotIndex >= 0) row.slotIndex = o.slotIndex;
        if (typeof o.from === 'string' && HHMM.test(o.from)) row.from = o.from;
        if (typeof o.to === 'string' && HHMM.test(o.to)) row.to = o.to;
        if (o.soft === true) row.soft = true;
        if (o.temp === true) row.temp = true;
        seen.add(o.id);
        out.push(row);
    }
    return out;
}

export const loadBlocks = (host: Pick<PluginHost, 'storage'>): SolverBlockRow[] =>
    normalizeBlocks(host.storage.get<unknown>(BLOCKS_KEY, []));

export const saveBlocks = (host: Pick<PluginHost, 'storage'>, blocks: readonly SolverBlockRow[]): void =>
    host.storage.set(BLOCKS_KEY, normalizeBlocks(blocks));

/** 막힘 줄 하나 더하기·바꾸기(같은 id 면 바꿈) · 지우기 — 순수 함수, 저장은 saveBlocks 로. */
export const upsertBlock = (blocks: readonly SolverBlockRow[], row: SolverBlockRow): SolverBlockRow[] =>
    normalizeBlocks(blocks.some((b) => b.id === row.id) ? blocks.map((b) => (b.id === row.id ? row : b)) : [...blocks, row]);
export const removeBlock = (blocks: readonly SolverBlockRow[], id: string): SolverBlockRow[] => blocks.filter((b) => b.id !== id);
