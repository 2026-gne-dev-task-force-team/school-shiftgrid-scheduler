/** 탐색기 「새로 만들기」(createInit)가 config.newListFields 와 같은 칸을 심는다 — 새 꾸러미가 createInit 을 빼먹는 실수를 막는다. */
import { describe, it, expect } from 'vitest';
import { subjectsNodeTypeImpl } from '../plugins/subjects/nodes';
import { SUBJECT_CONFIG } from '../plugins/subjects/config';
import { staffNodeTypeImpl } from '../plugins/staff/nodes';
import { STAFF_CONFIG } from '../plugins/staff/config';
import { bellNodeTypeImpl } from '../plugins/bell/nodes';
import { SLOT_CONFIG } from '../plugins/bell/config';
import { dutyNodeTypeImpl } from '../plugins/duty/nodes';
import { DUTY_CONFIG } from '../plugins/duty/config';

const cases = [
    ['subjects', subjectsNodeTypeImpl, SUBJECT_CONFIG],
    ['staff', staffNodeTypeImpl, STAFF_CONFIG],
    ['bell', bellNodeTypeImpl, SLOT_CONFIG],
    ['duty', dutyNodeTypeImpl, DUTY_CONFIG],
] as const;

describe('목록 노드 createInit', () => {
    it.each(cases)('%s — newListFields 와 같은 칸', (_n, impl, cfg) => {
        const want = cfg.newListFields!();
        expect(want.length).toBeGreaterThan(0);
        expect((impl.list as { createInit?: () => unknown }).createInit?.()).toEqual({ data: { fields: want } });
    });
});
