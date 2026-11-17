/**
 * 막힘 → 열 화면 명령 — 막힘마다 fix 칸이 있고(planBlockers), 그 뜻이 그 꾸러미 약속의 cmd 로 바뀐다(T-10ft).
 *   ⛔ 실자료 0 — 이름은 지어낸 것. 실제 제공자 약속(commands.ts 상수)과 매니페스트 명령 id 가 한 벌인지도 지킨다.
 */
import { describe, expect, it } from 'vitest';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { fixCmdOf, FIX_LABEL } from './fix-cmd';
import { planBlockers } from './read-canon';
import type { BlockerFix, SolverCanon } from './contracts/solver';
import { CMD as SCHOOL } from '../school/contracts/commands';
import { CMD as BELL } from '../bell/contracts/commands';
import { CMD as STAFF } from '../staff/contracts/commands';
import { CMD as SUBJECTS } from '../subjects/contracts/commands';
import { CMD as DEMAND } from '../demand-table/contracts/commands';
import { schoolPlugin } from '../school';
import { bellPlugin } from '../bell';
import { staffPlugin } from '../staff';
import { subjectsPlugin } from '../subjects';
import { demandTablePlugin } from '../demand-table';

const hostWith = (mods: Record<string, unknown>) => ({ modules: { use: (n: string) => mods[n] ?? null } }) as unknown as PluginHost;
const ALL = {
    school: { cmd: { open: 'S' } }, clock: { cmd: { open: 'B' } }, staff: { cmd: { open: 'T' } },
    subjects: { cmd: { open: 'J' } }, 'demand-table': { cmd: { open: 'D' } },
};
const FIXES: BlockerFix[] = ['school', 'bell', 'staff', 'subjects', 'demand'];

describe('fixCmdOf', () => {
    it('뜻마다 그 꾸러미 약속의 cmd.open 을 돌려준다', () => {
        expect(FIXES.map((f) => fixCmdOf(hostWith(ALL), f))).toEqual(['S', 'B', 'T', 'J', 'D']);
    });
    it('꾸러미가 꺼져 있으면 undefined · 단추 글은 모두 있다', () => {
        for (const f of FIXES) { expect(fixCmdOf(hostWith({}), f)).toBeUndefined(); expect(FIX_LABEL[f]).toMatch(/열기$/); }
    });
});

describe('막힘 자료의 fix 칸', () => {
    const canon = (over: Partial<SolverCanon> = {}): SolverCanon => ({
        school: { name: '' }, range: { startDate: '', endDate: '' }, staff: [], classes: [], subjects: [], rooms: [], bell: [], duty: [], demands: [], blocks: [], ...over,
    });
    const built = { input: { specs: [], demands: [] }, issues: [] } as never;
    it('고칠 곳이 있는 막힘마다 fix 가 붙는다(교직원·반·과목·일과표·시수표)', () => {
        const fixOf = Object.fromEntries(planBlockers(canon(), built).map((b) => [b.code, b.fix]));
        expect(fixOf).toMatchObject({ 'no-staff': 'staff', 'no-class': 'school', 'no-subject': 'subjects', 'no-bell': 'bell', 'no-demand': 'demand' });
    });
    it('학년 없는 반 → school · 일과표 수업 칸 못 읽음 → bell · 시수 0 → demand', () => {
        const bellRow = { kind: 'class', period: 1, start: '09:00', end: '09:40', grades: [] };
        const noGrade = planBlockers(canon({ classes: [{ id: 'c', name: '반' }], bell: [bellRow] }), built);
        expect(noGrade.find((b) => b.code === 'no-grade')?.fix).toBe('school');
        const noSlots = planBlockers(canon({ classes: [{ id: 'c', name: '반', grade: 1 }], bell: [bellRow] }), built);
        expect(noSlots.find((b) => b.code === 'no-slots')?.fix).toBe('bell');
        const zero = planBlockers(canon(), { input: { specs: [], demands: [{ count: 0 }] }, issues: [] } as never);
        expect(zero.find((b) => b.code === 'zero-hours')?.fix).toBe('demand');
    });
});

describe('약속 상수 ↔ 매니페스트 명령 id 한 벌', () => {
    it.each([
        ['school', schoolPlugin, SCHOOL.open], ['bell', bellPlugin, BELL.open], ['staff', staffPlugin, STAFF.open],
        ['subjects', subjectsPlugin, SUBJECTS.open], ['demand-table', demandTablePlugin, DEMAND.open],
    ] as const)('%s', (_n, plugin, id) => {
        const m = plugin.manifest as { contributes?: { commands?: { id: string }[] } };
        expect(m.contributes?.commands?.map((c) => c.id)).toContain(id);
        expect(Object.keys((plugin as unknown as { commands: object }).commands)).toContain(id);
    });
});
