/**
 * evaluateAll · diagnose · demandStatus — 규칙을 돌려 위반을 모으고 집계한다.
 */
import type { Doc } from '../types/doc';
import type { Assignment, Violation } from '../types/schema';
import type { Diagnosis, DemandStatus, EngineContext, RuleDiagnosis } from './api';
import { buildContext } from './context';
import { RULES, DAY_NAMES } from './rules';

const templateById = new Map(RULES.map((r) => [r.id, r]));

/** 메시지의 {교사}·{반}·{요일}·{교시} 를 채운다 */
function fillMessage(ctx: EngineContext, msg: string, v: Violation): string {
    if (!msg.includes('{')) return msg;
    const first: Assignment | undefined = v.assignmentIds.length
        ? ctx.assignments.get(v.assignmentIds[0]) : undefined;
    const agentId = v.subject?.kind === 'agent' ? v.subject.id : first?.agentId;
    const trackId = v.subject?.kind === 'track' ? v.subject.id : first?.trackId;
    const 교사 = agentId ? (ctx.agents.get(agentId)?.name ?? agentId) : '';
    const 반 = trackId ? (ctx.tracks.get(trackId)?.name ?? trackId) : '';
    const 요일 = first ? (DAY_NAMES[first.dayIndex] ?? String(first.dayIndex)) : '';
    const 과목 = first?.activityId ? (ctx.activities.get(first.activityId)?.name ?? '') : '';
    let 교시 = '';
    if (first) {
        const spec = ctx.specOfTrack(first.trackId);
        교시 = spec?.slots.find((s) => s.index === first.slotIndex)?.label ?? String(first.slotIndex);
    }
    return msg
        .replace(/\{교사\}/g, 교사).replace(/\{반\}/g, 반)
        .replace(/\{요일\}/g, 요일).replace(/\{교시\}/g, 교시)
        .replace(/\{과목\}/g, 과목);
}

export function evaluateAll(doc: Doc): Violation[] {
    const ctx = buildContext(doc);
    const out: Violation[] = [];
    for (const rule of doc.rules) {
        if (!rule.enabled) continue;
        const template = templateById.get(rule.templateId);
        if (!template) continue;
        const params = { ...Object.fromEntries(template.params.map((p) => [p.key, p.default])), ...rule.params };
        const viols = template.evaluate(params, ctx);
        for (const v of viols) {
            v.ruleId = rule.id;
            v.message = fillMessage(ctx, rule.message || v.message || template.defaultMessage, v);
            out.push(v);
        }
    }
    return out;
}

/** 위반 배치들이 걸친 요일 집합 */
function daysOf(ctx: EngineContext, viols: Violation[]): number[] {
    const s = new Set<number>();
    for (const v of viols) {
        for (const id of v.assignmentIds) {
            const a = ctx.assignments.get(id);
            if (a) s.add(a.dayIndex);
        }
        for (const c of v.cells ?? []) s.add(c.dayIndex);
    }
    return [...s].sort((a, b) => a - b);
}

export function diagnose(doc: Doc): Diagnosis {
    const ctx = buildContext(doc);
    const viols = evaluateAll(doc);
    const byRule = new Map<string, Violation[]>();
    for (const v of viols) (byRule.get(v.ruleId) ?? byRule.set(v.ruleId, []).get(v.ruleId)!).push(v);

    const ruleById = new Map(doc.rules.map((r) => [r.id, r]));
    const rules: RuleDiagnosis[] = [];
    const daysByRule: Record<string, number[]> = {};
    for (const [ruleId, list] of byRule) {
        const rule = ruleById.get(ruleId);
        const template = rule ? templateById.get(rule.templateId) : undefined;
        const subjects = new Set<string>();
        for (const v of list) if (v.subject) subjects.add(v.subject.id);
        rules.push({
            ruleId,
            templateId: rule?.templateId ?? '',
            label: rule?.name ?? template?.label ?? ruleId,
            kind: list[0].kind,
            bucket: template?.bucket,
            count: list.length,
            fixableCount: list.filter((v) => v.fixable).length,
            subjectCount: subjects.size,
            weight: list.reduce((s, v) => s + v.weight, 0),
            violations: list,
        });
        daysByRule[ruleId] = daysOf(ctx, list);
    }
    rules.sort((a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'hard' ? -1 : 1) || (b.weight - a.weight));

    return {
        hardCount: viols.filter((v) => v.kind === 'hard').length,
        softWeight: viols.filter((v) => v.kind === 'soft').reduce((s, v) => s + v.weight, 0),
        rules, daysByRule,
    };
}

export function demandStatus(doc: Doc): DemandStatus[] {
    const ctx = buildContext(doc);
    return doc.demands.map((d) => {
        const placed = ctx.byDemand(d.id).length;
        return {
            demandId: d.id, agentId: d.agentId, trackId: d.trackId, activityId: d.activityId,
            need: d.count, placed, remaining: d.count - placed,
        };
    });
}
