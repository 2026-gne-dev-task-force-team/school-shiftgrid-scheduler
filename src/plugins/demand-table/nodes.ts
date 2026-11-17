/**
 * 시수표 ↔ 노드 시스템 다리 — substitute·staff 와 같은 꼴(다리 본체는 컬렉션 바닥 defineCollection).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만 · collection 값은 host.modules.use('collection') 로(구조 검사 ⑨).
 */
import type { NodesApi, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { CollectionKit, RecordViewApi } from '../collection/contracts/collection';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { Staff } from '../staff/contracts/staff';
import type { School } from '../school/contracts/school';
import type { Subjects } from '../subjects/contracts/subjects';
import { DEMAND_CONFIG, LIST_TYPE, ROW_TYPE, newListFields } from './config';
import type { RelationTargets } from './config';

export { LIST_TYPE, ROW_TYPE };

let kit: CollectionKit | null = null;
export function getKit(): CollectionKit | null { return kit; }
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setKit(k: CollectionKit | null): void { kit = k; }

/** 정본 꾸러미(교직원·학교·과목) 약속으로 읽은 첫 컬렉션 id — 꾸러미가 꺼져 있거나 목록이 없으면 빈 칸. 학년도는 반이 든 것을 먼저 고른다. */
export function relationTargets(host: PluginHost): RelationTargets {
    const staff = host.modules.use<Staff>('staff');
    const school = host.modules.use<School>('school');
    const subjects = host.modules.use<Subjects>('subjects');
    const years = school?.years() ?? [];
    const year = years.find((y) => school?.classesIn(y.id).length) ?? years[0];
    return { teacher: staff?.lists()[0]?.id, class: year?.id, subject: subjects?.lists()[0]?.id };
}

/** 활성(index.ts)이 한 번 — 컬렉션 모듈로 kit 를 만들고 NodesApi 를 잇는다(없으면 조용히 빈 상태). */
export function initDemandTable(host: PluginHost): Disposable | null {
    const rv = host.modules.use<RecordViewApi>('collection');
    const nodes = host.modules.use<NodesApi>('nodes');
    // 🔴 「새로 만들기」가 어느 길이든(탐색기 createInit · 화면 시작 칸 kit.createList) 같은 대상 이음을 심는다 — 화면 길은 host 를 안 넘기니 여기서 묶는다(T-10g1).
    kit = rv ? rv.defineCollection({ ...DEMAND_CONFIG, newListFields: () => newListFields(relationTargets(host)) }) : null;
    return kit?.init(nodes ?? null) ?? null;
}

/** 이미 만든 시수표의 빈 관계 칸(대상 없음)만 지금 정본으로 채운다 — 사용자가 고른 대상은 안 덮는다. 열 때 한 번. */
export function fillEmptyTargets(host: PluginHost, listId: string): void {
    if (!kit) return;
    const fields = kit.userFieldsOf(listId);
    if (fields.length === 0) return;
    const t = relationTargets(host);
    const want: Record<string, string | undefined> = { f_teacher: t.teacher, f_class: t.class, f_subject: t.subject };
    let changed = false;
    const next = fields.map((f) => {
        const id = want[f.key];
        const cfg = (f.config ?? {}) as { target?: unknown };
        if (!id || f.type !== 'relation' || cfg.target) return f;
        changed = true;
        return { ...f, config: { ...cfg, target: { kind: 'db' as const, nodeId: id } } };
    });
    if (changed) kit.setUserFields(listId, next as typeof fields);
}

export const demandNodeTypeImpl = {
    list: {
        open: (host: PluginHost, id: string) => { fillEmptyTargets(host, id); kit?.open(host, id); },
        menu: (_host: PluginHost, id: string): MenuEntry[] => kit?.menu(id) ?? [],
        createInit: (host: PluginHost) => ({ data: { fields: newListFields(relationTargets(host)) } }),
    } satisfies NodeTypeImplFns,
};

export const demandNodeTypes: NodeTypeContribution<'list'>[] = [
    {
        type: LIST_TYPE, body: 'collection', label: '시수표', icon: 'table',
        container: { accepts: [ROW_TYPE, 'folder', LIST_TYPE] }, openable: true,
        create: { label: '시수표', under: ['folder', LIST_TYPE] },
        impl: 'list',
    },
    { type: ROW_TYPE, label: '시수 줄', icon: 'file', record: true },
];
