/**
 * 막힘 → 고칠 화면 여는 명령 — 막힘(PlanBlocker.fix)은 뜻만 들고, 화면이 그 꾸러미 약속의 명령 id 로 바꾼다.
 *   🔴 명령 id 를 글자로 짜지 않는다(톱니 cmdIdString) — 값은 host.modules.use<..>(..).cmd.open 으로 받는다(남의 contracts 값 import ⛔).
 *   그 꾸러미가 꺼져 있으면 undefined — 열 화면이 없으니 단추를 안 단다.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { School } from '../school/contracts/school';
import type { Clock } from '../bell/contracts/clock';
import type { Staff } from '../staff/contracts/staff';
import type { Subjects } from '../subjects/contracts/subjects';
import type { DemandTable } from '../demand-table/contracts/demand-table';
import type { BlockerFix } from './contracts/solver';

/** 단추에 적는 글 — 선생님 말로. */
export const FIX_LABEL: Readonly<Record<BlockerFix, string>> = {
    school: '학교 정보 열기',
    bell: '일과표 열기',
    staff: '교직원 명단 열기',
    subjects: '과목 열기',
    demand: '시수표 열기',
};

export function fixCmdOf(host: PluginHost, fix: BlockerFix): string | undefined {
    switch (fix) {
        case 'school': return host.modules.use<School>('school')?.cmd.open;
        case 'bell': return host.modules.use<Clock>('clock')?.cmd.open;
        case 'staff': return host.modules.use<Staff>('staff')?.cmd.open;
        case 'subjects': return host.modules.use<Subjects>('subjects')?.cmd.open;
        case 'demand': return host.modules.use<DemandTable>('demand-table')?.cmd.open;
    }
}
