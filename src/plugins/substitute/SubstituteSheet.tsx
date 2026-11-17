/**
 * 보결 명단 보기 — 🔴 R4(T-10ey): 교직원 명단(staff 약속) 위에 얹은 보기다. 값은 staff 가 저장하고 이 화면은 읽고 쓰기만 한다(⛔ 자기 저장 없음).
 *   읽기 = staff.lists()·staffIn() · 쓰기 = addMember·updateMember(이름·구분·메모)·removeMember — 전부 약속 하나로.
 *   staff 가 꺼져 있으면 안내만 뜬다. 명단·사람이 바뀌면 약속의 onChange 로 다시 그린다.
 */
import { useEffect, useReducer } from 'react';
import { Button, EmptyState, IconButton, Select, TextInput } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
// 🔴 import type 만 — 약속 타입은 약속 꾸러미 contracts 에서.
import type { Staff, StaffMember } from '../staff/contracts/staff';
import { runMigration } from './nodes';

/** 구분 기본 선택지 — 명단이 고친 선택지는 value 만 그대로 보여 준다(모르는 값도 잃지 않게 아래에서 덧붙인다). */
export const KIND_OPTIONS = [
    { value: 'homeroom', label: '담임' },
    { value: 'subject', label: '전담' },
    { value: 'nonteaching', label: '비교과' },
    { value: 'assistant', label: '보조인력' },
];
const TIER_LABEL: Record<number, string> = { 1: '보직', 2: '일반', 3: '지원' };

function kindOptions(kind: string | undefined) {
    return kind && !KIND_OPTIONS.some((o) => o.value === kind) ? [...KIND_OPTIONS, { value: kind, label: kind }] : KIND_OPTIONS;
}

function Row({ staff, m }: { staff: Staff; m: StaffMember }) {
    return (
        <div className="flex items-center gap-2" data-testid="sub-row">
            <TextInput size="sm" className="w-32" label="이름" defaultValue={m.name} key={`n-${m.id}-${m.name}`}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.name) staff.updateMember(m.id, { name: v }); }} />
            <Select size="sm" label="구분" placeholder="구분" value={m.kind ?? ''} options={kindOptions(m.kind)}
                onChange={(e) => staff.updateMember(m.id, { kind: e.target.value })} />
            <span className="w-12 text-small text-muted">{m.tier ? TIER_LABEL[m.tier] : ''}</span>
            <TextInput size="sm" className="flex-1" label="메모" defaultValue={m.memo ?? ''} key={`m-${m.id}-${m.memo ?? ''}`}
                onBlur={(e) => { if (e.target.value !== (m.memo ?? '')) staff.updateMember(m.id, { memo: e.target.value }); }} />
            <IconButton icon="trash" label="지우기" onClick={() => staff.removeMember(m.id)} />
        </div>
    );
}

export function SubstituteSheet({ host }: { host?: PluginHost }) {
    const staff = host?.modules.use<Staff>('staff') ?? null;
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        if (!staff) return undefined;
        runMigration();   // staff 가 나중에 켜졌어도 옛 명단을 따라잡는다(멱등)
        return staff.onChange(bump).dispose;
    }, [staff]);
    if (!staff) return <EmptyState icon="warn" title="교직원 명단이 꺼져 있습니다" description="보결 명단은 교직원 명단 위에서 보입니다. 설정에서 교직원 명단을 켜면 나타납니다." />;
    const lists = staff.lists();
    if (lists.length === 0) return <EmptyState icon="users" title="교직원 명단이 없습니다" description="교직원 명단에서 명단을 만들면 여기에도 보입니다." />;
    return (
        <div className="flex flex-col gap-4 p-3">
            {lists.map((l) => (
                <section key={l.id} className="flex flex-col gap-2" data-testid="sub-list">
                    <div className="flex items-center gap-2">
                        <span className="text-note font-semibold text-muted">{l.name}</span>
                        <Button size="sm" variant="soft" onClick={() => staff.addMember(l.id, { name: '새 사람', kind: 'subject' })}>사람 더하기</Button>
                    </div>
                    {staff.staffIn(l.id).map((m) => <Row key={m.id} staff={staff} m={m} />)}
                </section>
            ))}
        </div>
    );
}
