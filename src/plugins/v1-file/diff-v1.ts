/**
 * v1 Doc 두 벌의 다른 칸 목록 — 왕복 시험용. 순서·배치 id 는 정규화한다(id 로 짝짓고 · 배치는 반|요일|칸으로 짝지음).
 *   돌려주는 것: 다른 칸의 경로 목록(`demands[dm2].count (…)` 꼴). 같으면 빈 배열.
 */
import type { SolverInput } from '../timetable-solver/contracts/solver';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function keyOf(v: unknown): string | null {
    if (!isObj(v)) return null;
    if (typeof v.trackId === 'string' && typeof v.dayIndex === 'number' && typeof v.slotIndex === 'number') return `${v.trackId}|${v.dayIndex}|${v.slotIndex}`;
    return typeof v.id === 'string' ? v.id : null;
}

function walk(a: unknown, b: unknown, path: string, out: string[]): void {
    if (Array.isArray(a) && Array.isArray(b)) {
        const all = [...a, ...b];
        if (all.length > 0 && all.every((x) => keyOf(x) !== null)) {
            const ma = new Map(a.map((x) => [keyOf(x) as string, x])), mb = new Map(b.map((x) => [keyOf(x) as string, x]));
            for (const k of new Set([...ma.keys(), ...mb.keys()])) {
                if (!ma.has(k)) out.push(`${path}[${k}] (처음엔 없음)`);
                else if (!mb.has(k)) out.push(`${path}[${k}] (돌아온 쪽에 없음)`);
                else walk(ma.get(k), mb.get(k), `${path}[${k}]`, out);
            }
            return;
        }
        if (a.length !== b.length) { out.push(`${path} (길이 ${a.length} → ${b.length})`); return; }
        a.forEach((x, i) => walk(x, b[i], `${path}[${i}]`, out));
        return;
    }
    if (isObj(a) && isObj(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (a[k] === undefined && b[k] === undefined) continue;
            walk(a[k], b[k], path ? `${path}.${k}` : k, out);
        }
        return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path} (${JSON.stringify(a)} → ${JSON.stringify(b)})`);
}

export function diffV1(a: SolverInput, b: SolverInput): string[] {
    const out: string[] = [];
    walk(a, b, '', out);
    return out;
}
