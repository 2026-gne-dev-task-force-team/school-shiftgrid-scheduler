/**
 * 정본 id → 보일 이름 — 🔴 약속(staff·school·subjects·rooms)으로 **읽기만** 한다. 편성안엔 이름을 저장하지 않는다.
 *   정본이 꺼져 있거나 id 가 사라졌으면 「찾을 수 없음」.
 */
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import type { Rooms } from '../rooms/contracts/rooms';
import type { LabelOf } from './types';

export const NOT_FOUND = '찾을 수 없음';

export interface Canon { staff: Staff | null; school: School | null; subjects: Subjects | null; rooms: Rooms | null }

export function canonOf(host: PluginHost): Canon {
    return {
        staff: host.modules.use<Staff>('staff') ?? null,
        school: host.modules.use<School>('school') ?? null,
        subjects: host.modules.use<Subjects>('subjects') ?? null,
        rooms: host.modules.use<Rooms>('rooms') ?? null,
    };
}

export function labelFrom(canon: Canon): LabelOf {
    return (kind, id) => {
        let name: string | null | undefined;
        if (kind === 'teacher') name = canon.staff?.member(id)?.name;
        else if (kind === 'subject') name = canon.subjects?.subject(id)?.name;
        else if (kind === 'room') name = canon.rooms?.room(id)?.name;
        else if (canon.school) {
            for (const y of canon.school.years()) {
                const c = canon.school.classesIn(y.id).find((x) => x.id === id);
                if (c) { name = c.name; break; }
            }
        }
        return name ?? NOT_FOUND;
    };
}
