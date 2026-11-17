/**
 * 소프트 규칙 시험용 합성 입력 — 지어낸 작은 학교(engine/__fixtures__/small) 위에 칸을 손으로 채운다. 실자료 없음.
 *   softCase(id) 는 그 소프트 규칙 하나를 어기는(bad) / 지키는(ok) 입력을 돌려준다.
 *   3학년 규격: 0~3 오전(09:00~11:40) · 4 점심(11:40~12:20) · 5·6 오후. 쉬는 시간 0분이라 칸이 맞붙는다.
 */
import type { Doc } from '../../types/doc';
import type { Assignment, RuleParams } from '../../types/schema';
import { makeSmallDoc, put, IDS } from '../../engine/__fixtures__/small';

export type SoftCase = { doc: Doc; params?: RuleParams };

/** 규칙 id → 어기는 입력 · 지키는 입력 */
export function softCase(id: string, variant: 'bad' | 'ok'): SoftCase {
    const bad = variant === 'bad';
    const doc = makeSmallDoc();
    const as: Assignment[] = doc.assignments;
    const eng = (aid: string, tid: string, day: number, slot: number) =>
        put(aid, tid, day, slot, { agentId: IDS.a2, activityId: IDS.eng });
    switch (id) {
        case 'avoid':
            doc.weeklyBlocks.push({ id: 'wb1', name: '되도록 피함', soft: true, dayIndex: 0, slotIndex: 0, targets: [{ kind: 'agent', id: IDS.a2 }] });
            as.push(eng('x1', IDS.t31, 0, bad ? 0 : 1));
            return { doc };
        case 'consecutive-limit':
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', IDS.t32, 0, bad ? 1 : 2));
            return { doc, params: { limit: 2 } };
        case 'prefer-consecutive':
        case 'compact-day':
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', IDS.t32, 0, bad ? 2 : 1));
            return { doc };
        case 'subjects-per-day-agent':
            // 3학년 영어 + (bad: 5학년 영어 → 학년·과목 두 가지)
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', bad ? IDS.t51 : IDS.t32, 0, 1));
            return { doc, params: { max: 1 } };
        case 'subjects-per-day-track':
            as.push(eng('x1', IDS.t31, 0, 0),
                bad ? put('x2', IDS.t31, 0, 1, { agentId: IDS.a3, activityId: IDS.pe }) : eng('x2', IDS.t31, 0, 1));
            return { doc, params: { max: 1 } };
        case 'am-pm-balance':
            as.push(eng('x1', IDS.t31, 0, 0));
            if (!bad) as.push(eng('x2', IDS.t32, 0, 5)); // 점심 뒤 첫 칸
            return { doc };
        case 'same-period-across-days':
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', IDS.t31, 1, bad ? 1 : 0));
            return { doc };
        case 'subject-adjacent':
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', IDS.t31, 0, bad ? 2 : 1));
            return { doc };
        case 'day-cluster':
            as.push(eng('x1', IDS.t31, 0, 0), eng('x2', IDS.t32, bad ? 1 : 0, 1));
            return { doc };
        case 'one-place-per-day': {
            const sci = (aid: string, tid: string, slot: number, room: boolean) =>
                put(aid, tid, 0, slot, { agentId: IDS.a1, activityId: IDS.sci, ...(room ? { resourceId: IDS.r1 } : {}) });
            as.push(sci('x1', IDS.t31, 0, true), sci('x2', IDS.t32, 1, !bad));
            return { doc, params: { enabled: true } };
        }
        case 'lunch-adjacent':
            // bad: 점심 바로 앞(4교시) + 바로 뒤(5교시)
            as.push(eng('x1', IDS.t31, 0, bad ? 3 : 2), eng('x2', IDS.t32, 0, 5));
            return { doc };
        case 'day-load-balance':
            // bad: 월요일에 넷 몰림(평균 0.8 ± 2 를 벗어남) · ok: 요일마다 하나
            for (let i = 0; i < (bad ? 4 : 5); i++) as.push(eng(`x${i}`, IDS.t31, bad ? 0 : i, bad ? i : 0));
            return { doc };
        case 'priority-early': {
            const room = (aid: string, agentId: string, tid: string, slot: number) =>
                put(aid, tid, 0, slot, { agentId, activityId: IDS.sci, resourceId: IDS.r1 });
            // a1 우선순위 1 · a3 우선순위 3 — bad 는 a3 가 더 이른 칸
            as.push(room('x1', IDS.a1, IDS.t31, bad ? 1 : 0), room('x2', IDS.a3, IDS.t32, bad ? 0 : 1));
            return { doc };
        }
    }
    throw new Error(`모르는 규칙: ${id}`);
}
