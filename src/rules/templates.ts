/**
 * 규칙 틀(RuleTemplate) 모음 — 코드로 미리 만들어 두는 '검사 방법'들.
 * 사용자는 이 틀을 오른쪽 패널로 끌어와 이름·설정을 손보고 켜면 규칙이 된다.
 * (schema.ts의 RuleTemplate / ScheduleView 계약을 그대로 따른다.)
 */
import type { RuleTemplate, ScheduleView, RuleParams } from '../types/schema';

/** 같은 시간대에 같은 값(교사/시설/교과)이 정원 넘게 잡혔는지 검사 */
const noOverlap: RuleTemplate = {
    id: 'no-overlap',
    label: '같은 시간 중복 금지',
    description: '같은 요일·같은 교시에 같은 교사(또는 시설·교과)가 정원보다 많이 배치되면 충돌.',
    params: [
        { key: 'dimension', label: '무엇의 중복', type: 'select', options: ['교사', '시설', '교과'], default: '시설' },
        { key: 'max', label: '허용 개수', type: 'number', default: 1 },
    ],
    defaultMessage: '같은 시간에 중복 배치되었습니다',
    defaultSeverity: 'error',

    detect(params: RuleParams, view: ScheduleView): string[][] {
        const dim = String(params.dimension ?? '시설');
        const max = Number(params.max ?? 1);
        const field: 'agentId' | 'activityId' | 'resourceId' =
            dim === '교사' ? 'agentId' : dim === '교과' ? 'activityId' : 'resourceId';

        // (요일·교시·대상값) → 그 값을 쓰는 배치 id들
        const buckets = new Map<string, string[]>();
        for (const a of view.assignments) {
            const value = a[field];
            if (!value) continue;
            const key = `${a.dayIndex}:${a.slotIndex}:${value}`;
            (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(a.id);
        }
        return [...buckets.values()].filter((ids) => ids.length > max);
    },
};

/** 배치는 있는데 '무슨 일(교과)'이 비어 통계에 안 잡히는 칸을 경고 */
const missingActivity: RuleTemplate = {
    id: 'missing-activity',
    label: '교과 미지정 경고',
    description: '교사나 시설은 정해졌는데 교과(무슨 일)가 비어 있으면 통계에 안 잡히므로 경고.',
    params: [],
    defaultMessage: '교과가 지정되지 않았습니다',
    defaultSeverity: 'warning',

    detect(_params: RuleParams, view: ScheduleView): string[][] {
        return view.assignments
            .filter((a) => (a.agentId || a.resourceId) && !a.activityId)
            .map((a) => [a.id]);
    },
};

export const RULE_TEMPLATES: RuleTemplate[] = [noOverlap, missingActivity];

export const templateById = (id: string): RuleTemplate | undefined =>
    RULE_TEMPLATES.find((t) => t.id === id);
