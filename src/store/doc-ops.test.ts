/** 시수 합치기 — 엑셀에서 불러온 줄이 시트에서 만든 같은 줄과 겹치면 두 배로 세면 안 된다 (검수 2026-09-28) */
import { describe, it, expect } from 'vitest';
import { emptyDoc } from '../types/doc';
import { mergeImport } from './doc-ops';
import type { Demand } from '../types/schema';

const dm = (id: string, count: number): Demand => ({ id, agentId: 'a1', trackId: 't1', activityId: 'act1', count });

describe('mergeImport', () => {
    it('교사·반·과목이 같은 시수는 불러온 쪽이 이기고 하나만 남는다', () => {
        const d = { ...emptyDoc(), demands: [dm('dm-ui', 3)] };
        const out = mergeImport(d, { agents: [], tracks: [], activities: [], demands: [dm('d-xlsx', 2)] });
        expect(out.demands).toHaveLength(1);
        expect(out.demands[0].id).toBe('d-xlsx');
        expect(out.demands[0].count).toBe(2);
    });
    it('같은 파일을 두 번 불러와도 늘지 않는다', () => {
        const once = mergeImport(emptyDoc(), { agents: [], tracks: [], activities: [], demands: [dm('d-1', 2)] });
        const twice = mergeImport(once, { agents: [], tracks: [], activities: [], demands: [dm('d-1', 2)] });
        expect(twice.demands).toHaveLength(1);
    });
    it('다른 반의 시수는 그대로 더해진다', () => {
        const d = { ...emptyDoc(), demands: [dm('dm-ui', 3)] };
        const other: Demand = { id: 'd-2', agentId: 'a1', trackId: 't2', activityId: 'act1', count: 3 };
        const out = mergeImport(d, { agents: [], tracks: [], activities: [], demands: [other] });
        expect(out.demands).toHaveLength(2);
    });
});
