/**
 * 하드 규칙 「block-contiguous」 — 편성 규칙 낱개 기여 하나(F2a · v1 engine/rules.ts 에서 글자 그대로 옮김).
 *   선생님 말: 블록(연속) 수업은 같은 날 이어지는 교시에, 사이에 점심 없이 들어가게.
 */
import type { Assignment, Violation } from '../../types/schema';
import type { RuleContribution } from '../../contracts/rule';
import { trackRef, mkViol } from '../kit';

export const blockContiguous: RuleContribution = {
    about: '블록(연속) 수업은 같은 날 이어지는 교시에, 사이에 점심 없이 들어가게',
    id: 'block-contiguous', label: '연속 수업 묶음', kind: 'hard', params: [],
    description: '연속 수업으로 묶인 수업은 같은 반·같은 날·이어지는 교시에 있어야 하고 사이에 점심이 없어야 합니다.',
    defaultMessage: '연속 수업이 이어져 있지 않습니다',
    evaluate(_p, ctx) {
        const out: Violation[] = [];
        const byBlock = new Map<string, Assignment[]>();
        for (const a of ctx.doc.assignments) {
            if (!a.blockId) continue;
            (byBlock.get(a.blockId) ?? byBlock.set(a.blockId, []).get(a.blockId)!).push(a);
        }
        for (const [, list] of byBlock) {
            if (list.length < 2) continue;
            const sameTrack = list.every((a) => a.trackId === list[0].trackId);
            const sameDay = list.every((a) => a.dayIndex === list[0].dayIndex);
            let bad = !sameTrack || !sameDay;
            if (!bad) {
                const idxs = list.map((a) => a.slotIndex).sort((x, y) => x - y);
                const contiguous = idxs[idxs.length - 1] - idxs[0] === idxs.length - 1
                    && new Set(idxs).size === idxs.length;
                if (!contiguous) bad = true;
                else {
                    // [min..max] 안에 점심 슬롯이 끼면 안 된다
                    const sp = ctx.specOfTrack(list[0].trackId);
                    if (sp) {
                        for (let i = idxs[0]; i <= idxs[idxs.length - 1]; i++) {
                            if (sp.slots.find((s) => s.index === i)?.kind === 'lunch') { bad = true; break; }
                        }
                    }
                }
            }
            if (bad) {
                out.push(mkViol({
                    templateId: 'block-contiguous', kind: 'hard',
                    message: this.defaultMessage, assignmentIds: list.map((a) => a.id),
                    weight: 0, fixable: true, subject: trackRef(list[0].trackId),
                }));
            }
        }
        return out;
    },
};
