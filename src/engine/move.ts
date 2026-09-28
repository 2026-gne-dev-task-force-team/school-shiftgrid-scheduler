/**
 * previewMove · applyMove · candidateCells — 손으로 옮기기.
 * 엔진은 판정만 한다: 하드가 깨지면 hardBroken=true 로 알리고, 소프트는 전·후 숫자로 보여준다.
 */
import type { Doc } from '../types/doc';
import type { Assignment, Violation } from '../types/schema';
import type { CellVerdict, CellVerdicts, Move, MovePreview } from './api';
import { buildContext, hm } from './context';
import { evaluateAll } from './evaluate';
import { RULES } from './rules';

const cellOf = (a: Assignment) => `${a.trackId}|${a.dayIndex}|${a.slotIndex}`;
const trackRef = (id: string) => ({ kind: 'track' as const, id });

export function applyMove(doc: Doc, move: Move): Doc {
    const A = doc.assignments.find((a) => a.id === move.assignmentId);
    if (!A) return doc;
    if (A.pinned || A.fixed) return doc; // 이동금지·고정은 못 옮긴다

    const dDay = move.to.dayIndex - A.dayIndex;
    const dSlot = move.to.slotIndex - A.slotIndex;
    const toTrack = move.to.trackId;
    if (dDay === 0 && dSlot === 0 && toTrack === A.trackId) return doc; // 제자리

    const group = A.blockId ? doc.assignments.filter((a) => a.blockId === A.blockId) : [A];
    const groupIds = new Set(group.map((a) => a.id));
    const newCells = group.map((g) => ({ track: toTrack, day: g.dayIndex + dDay, slot: g.slotIndex + dSlot }));
    const oldCells = group.map((g) => ({ track: g.trackId, day: g.dayIndex, slot: g.slotIndex }));

    // 새 자리의 점유자(맞바꿀 상대)를 찾는다
    const occupantTarget = new Map<string, { track: string; day: number; slot: number }>();
    for (let i = 0; i < newCells.length; i++) {
        const nc = newCells[i];
        const occ = doc.assignments.filter((a) =>
            !groupIds.has(a.id) && a.trackId === nc.track && a.dayIndex === nc.day && a.slotIndex === nc.slot);
        for (const o of occ) {
            if (o.fixed || o.pinned) return doc; // 고정/이동금지 상대는 못 밀어낸다 → 이동 실패
            occupantTarget.set(o.id, oldCells[i]);
        }
    }

    const posInGroup = new Map(group.map((g, i) => [g.id, i]));
    return {
        ...doc,
        assignments: doc.assignments.map((a) => {
            if (groupIds.has(a.id)) {
                const nc = newCells[posInGroup.get(a.id)!];
                return { ...a, trackId: nc.track, dayIndex: nc.day, slotIndex: nc.slot };
            }
            const t = occupantTarget.get(a.id);
            if (t) return { ...a, trackId: t.track, dayIndex: t.day, slotIndex: t.slot };
            return a;
        }),
    };
}

function countByRule(viols: Violation[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const v of viols) m.set(v.ruleId, (m.get(v.ruleId) ?? 0) + 1);
    return m;
}

export function previewMove(doc: Doc, move: Move): MovePreview {
    const before = evaluateAll(doc);
    const A = doc.assignments.find((a) => a.id === move.assignmentId);
    const afterDoc = applyMove(doc, move);
    const after = evaluateAll(afterDoc);

    // 무엇이 실제로 움직였나 (옮긴 것 + 맞바꾼 것)
    const beforeCell = new Map(doc.assignments.map((a) => [a.id, cellOf(a)]));
    const involved = new Set<string>();
    let displaced: Assignment | undefined;
    const groupIds = new Set(
        A?.blockId ? doc.assignments.filter((a) => a.blockId === A.blockId).map((a) => a.id) : A ? [A.id] : []);
    for (const a of afterDoc.assignments) {
        if (beforeCell.get(a.id) !== cellOf(a)) {
            involved.add(a.id);
            if (!groupIds.has(a.id) && !displaced) displaced = a;
        }
    }

    const kindOf = new Map(doc.rules.map((r) => {
        const t = RULES.find((x) => x.id === r.templateId);
        // 화면에 새 낱말이 나오게 템플릿 label 을 앞세운다(저장된 옛 name 이 낡은 말일 수 있다)
        return [r.id, { label: t?.label ?? r.name ?? r.id, kind: (t?.kind ?? 'soft') as 'hard' | 'soft' }];
    }));
    const cb = countByRule(before), ca = countByRule(after);
    // 결과표는 켜진 규칙 전부를 한 줄씩 (컴시간의 결과표처럼 0 도 보여준다)
    const ruleIds = new Set<string>([...cb.keys(), ...ca.keys()]);
    for (const r of doc.rules) if (r.enabled) ruleIds.add(r.id);
    const rows: MovePreview['rows'] = [];
    for (const ruleId of ruleIds) {
        const b = cb.get(ruleId) ?? 0, a = ca.get(ruleId) ?? 0;
        const meta = kindOf.get(ruleId) ?? { label: ruleId, kind: 'soft' as const };
        rows.push({ ruleId, label: meta.label, kind: meta.kind, before: b, after: a, delta: a - b });
    }
    rows.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'hard' ? -1 : 1) || Math.abs(y.delta) - Math.abs(x.delta));

    const softBefore = before.filter((v) => v.kind === 'soft').reduce((s, v) => s + v.weight, 0);
    const softAfter = after.filter((v) => v.kind === 'soft').reduce((s, v) => s + v.weight, 0);

    const hardReasons: string[] = [];
    let hardBroken = false;
    if (A && (A.pinned || A.fixed)) {
        hardBroken = true;
        hardReasons.push(A.pinned ? '이동금지 칸입니다' : '고정 수업은 옮길 수 없습니다');
    } else {
        for (const v of after) {
            if (v.kind === 'hard' && v.assignmentIds.some((id) => involved.has(id))) {
                hardBroken = true;
                if (!hardReasons.includes(v.message)) hardReasons.push(v.message);
            }
        }
    }

    return { move, hardBroken, hardReasons, rows, softBefore, softAfter, displaced, after: afterDoc };
}

export function candidateCells(doc: Doc, assignmentId: string): CellVerdicts {
    const ctx = buildContext(doc);
    const A = ctx.assignments.get(assignmentId);
    const cells: Record<string, CellVerdict> = {};
    const reasons: Record<string, string[]> = {}; // 칸마다 「왜 그 색인가」 (계약 v3 · 선생님 의견 #19)
    if (!A) return { assignmentId, cells, reasons };
    const track = A.trackId;
    const groupIds = new Set(
        A.blockId ? doc.assignments.filter((a) => a.blockId === A.blockId).map((a) => a.id) : [A.id]);
    const spec = ctx.specOfTrack(track);
    const days = spec?.activeDays ?? [0, 1, 2, 3, 4];
    const uniq = (xs: string[]) => [...new Set(xs)];
    for (const day of days) {
        for (const slot of ctx.lessonSlots(track, day)) {
            const key = `${day}:${slot.index}`;
            if (day === A.dayIndex && slot.index === A.slotIndex) { cells[key] = 'self'; continue; }
            const clock = { dayIndex: day, startMin: hm(slot.start), endMin: hm(slot.end) };
            if (ctx.isBlocked(trackRef(track), clock, track)) { cells[key] = 'blocked'; reasons[key] = ['배정 불가 칸']; continue; }
            const occupants = ctx.byCell(track, day, slot.index).filter((o) => !groupIds.has(o.id));
            const blocker = occupants.find((o) => o.fixed || o.pinned);
            if (blocker) { cells[key] = 'blocked'; reasons[key] = [blocker.fixed ? '고정 수업' : '잠긴 수업']; continue; }
            const pv = previewMove(doc, {
                assignmentId, to: { trackId: track, dayIndex: day, slotIndex: slot.index }, swap: occupants.length > 0,
            });
            let verdict: CellVerdict;
            if (occupants.length > 0) {
                verdict = pv.hardBroken ? 'occupied' : pv.softAfter > pv.softBefore ? 'soft' : 'ok';
            } else {
                verdict = pv.hardBroken ? 'hard' : pv.softAfter > pv.softBefore ? 'soft' : 'ok';
            }
            cells[key] = verdict;
            if (verdict === 'hard' || verdict === 'occupied') {
                let labels = uniq(pv.rows.filter((r) => r.kind === 'hard' && r.after > r.before).map((r) => r.label));
                if (labels.length === 0 && pv.hardReasons.length) labels = uniq(pv.hardReasons);
                if (labels.length) reasons[key] = labels;
            } else if (verdict === 'soft') {
                const labels = uniq(pv.rows.filter((r) => r.kind === 'soft' && r.delta > 0).map((r) => r.label));
                if (labels.length) reasons[key] = labels;
            }
        }
    }
    return { assignmentId, cells, reasons };
}
