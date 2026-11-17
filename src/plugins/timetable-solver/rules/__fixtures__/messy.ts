/**
 * 하드 규칙 시험용 합성 입력 — 지어낸 작은 학교(engine/__fixtures__/small) 위에 칸을 손으로 채운다. 실자료 없음.
 *   case(id) 는 그 하드 규칙 하나를 어기는(bad) / 지키는(ok) 입력을 돌려준다.
 *   messyDoc() 는 하드 9를 모두 어기는 칸을 한 문서에 섞는다 — 쪼개기 전후 동등 시험(split-equivalence)이 쓴다.
 */
import type { Doc } from '../../types/doc';
import type { Assignment } from '../../types/schema';
import { makeSmallDoc, put, IDS } from '../../engine/__fixtures__/small';

const A4 = 'a4';

function withA4(doc: Doc): Doc {
    doc.agents.push({ kind: 'agent', id: A4, name: '라 선생', tier: 2, role: '담임 겸 전담', homeroomTrackIds: [IDS.t31] });
    return doc;
}

export type HardCase = { doc: Doc; params?: Record<string, number> };

/** 규칙 id → 어기는 입력 · 지키는 입력 */
export function hardCase(id: string, variant: 'bad' | 'ok'): HardCase {
    const bad = variant === 'bad';
    const doc = makeSmallDoc();
    const as: Assignment[] = doc.assignments;
    switch (id) {
        case 'no-overlap-track':
            as.push(put('x1', IDS.t31, 0, 0, { agentId: IDS.a2 }), put('x2', IDS.t31, 0, bad ? 0 : 1, { agentId: IDS.a3 }));
            return { doc };
        case 'no-overlap-agent':
            as.push(put('x1', IDS.t31, 0, 0, { agentId: IDS.a2 }), put('x2', IDS.t32, 0, bad ? 0 : 1, { agentId: IDS.a2 }));
            return { doc };
        case 'no-overlap-resource':
            as.push(
                put('x1', IDS.t31, 0, 0, { agentId: IDS.a1, activityId: IDS.sci, resourceId: IDS.r1 }),
                put('x2', IDS.t32, 0, bad ? 0 : 1, { agentId: IDS.a3, activityId: IDS.sci, resourceId: IDS.r1 }),
            );
            return { doc };
        case 'blocked-cell':
            doc.weeklyBlocks.push({ id: 'wb1', name: '학년 협의', dayIndex: 0, slotIndex: 0, targets: [{ kind: 'track', id: IDS.t31 }] });
            as.push(put('x1', IDS.t31, 0, bad ? 0 : 1, { agentId: IDS.a2 }));
            return { doc };
        case 'demand-count':
            doc.demands = doc.demands.filter((d) => d.id === 'd-pe-0');
            if (!bad) as.push(put('x1', IDS.t31, 0, 0, { agentId: IDS.a3, activityId: IDS.pe, demandId: 'd-pe-0' }));
            return { doc };
        case 'block-contiguous':
            as.push(
                put('x1', IDS.t31, 0, 0, { agentId: IDS.a2, blockId: 'b1' }),
                put('x2', IDS.t31, 0, bad ? 2 : 1, { agentId: IDS.a2, blockId: 'b1' }),
            );
            return { doc };
        case 'cycle-order': {
            doc.demands = doc.demands.filter((d) => d.id === 'd-eng-0' || d.id === 'd-eng-1').map((d) => ({ ...d, cycle: true }));
            const eng = (aid: string, tid: string, dmd: string, day: number, slot = 0) =>
                put(aid, tid, day, slot, { agentId: IDS.a2, activityId: IDS.eng, demandId: dmd });
            // bad: 3-1 이 3-2 의 첫 차시(화)보다 먼저(월 2교시) 둘째 차시를 시작한다
            as.push(
                eng('x1', IDS.t31, 'd-eng-0', 0), bad ? eng('x2', IDS.t31, 'd-eng-0', 0, 1) : eng('x2', IDS.t31, 'd-eng-0', 2),
                eng('x3', IDS.t32, 'd-eng-1', 1), eng('x4', IDS.t32, 'd-eng-1', 3),
            );
            return { doc };
        }
        case 'agent-lunch-free':
            // 3학년 4교시(11:00~11:40) 수업 — 점심(11:40~12:20) 허용 오차 10분이면 걸리고 0분이면 비어 있다
            as.push(put('x1', IDS.t31, 0, 3, { agentId: IDS.a2 }));
            return { doc, params: { window: bad ? 10 : 0 } };
        case 'homeroom-plus-free':
            withA4(doc);
            as.push(put('x1', IDS.t32, 0, 0, { agentId: A4 }));
            if (!bad) as.push(put('x2', IDS.t31, 0, 0, { agentId: IDS.a2 }));
            return { doc };
    }
    throw new Error(`모르는 규칙: ${id}`);
}

/** 하드 9를 모두 어기는 칸을 한 문서에 — 배치 id 는 규칙마다 앞머리를 달리해 섞는다 */
export function messyDoc(): Doc {
    const doc = withA4(makeSmallDoc());
    const ids = ['no-overlap-track', 'no-overlap-agent', 'no-overlap-resource', 'blocked-cell',
        'block-contiguous', 'cycle-order', 'agent-lunch-free', 'homeroom-plus-free'];
    ids.forEach((id, n) => {
        const c = hardCase(id, 'bad').doc;
        // 담임 겸 전담 칸은 다른 칸이 담임반을 메우지 않게 3학년 5교시(slot 5)로 옮긴다
        const slot = (s: number) => (id === 'homeroom-plus-free' ? 5 : s);
        for (const a of c.assignments) doc.assignments.push({ ...a, id: `${n}-${a.id}`, dayIndex: (a.dayIndex + n) % 5, slotIndex: slot(a.slotIndex) });
        for (const wb of c.weeklyBlocks) doc.weeklyBlocks.push({ ...wb, dayIndex: (wb.dayIndex + n) % 5 });
    });
    doc.demands = doc.demands.map((d) => (d.agentId === IDS.a2 ? { ...d, cycle: true } : d));
    // 점심 허용 오차 10분 — 4교시 수업이 점심에 걸리게
    doc.rules = doc.rules.map((r) => (r.templateId === 'agent-lunch-free' ? { ...r, params: { ...r.params, window: 10 } } : r));
    return doc;
}
