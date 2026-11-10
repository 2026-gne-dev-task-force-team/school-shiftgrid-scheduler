/**
 * 학교 정보 ↔ 노드 시스템 다리 — 타입 셋: 학교(싱글톤·페이지 본문 달림) · 학년도(컬렉션 목록) · 반(record).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만 · collection 값은 host.modules.use('collection') 로(구조 검사 ⑨).
 *   🔴 학교가 나무에 없으면 학년도를 못 만든다(canCreate) — 위치는 어디든.
 */
import type { NodesApi, NodeTypeImplFns } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { CollectionKit, RecordViewApi } from '../collection/contracts/collection';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { CLASS_CONFIG, SCHOOL_TYPE, YEAR_TYPE, CLASS_TYPE, SCHOOL_VIEW, newYearFields } from './config';

export { SCHOOL_TYPE, YEAR_TYPE, CLASS_TYPE };

let kit: CollectionKit | null = null;
let nodes: NodesApi | null = null;
let rv: RecordViewApi | null = null;
export function getKit(): CollectionKit | null { return kit; }
export function getRv(): RecordViewApi | null { return rv; }
export function getNodes(): NodesApi | null { return nodes; }
/** 테스트가 직접 건넬 수 있다(활성 없이). */
export function setKit(k: CollectionKit | null, n: NodesApi | null = nodes, r: RecordViewApi | null = rv): void { kit = k; nodes = n; rv = r; }

/** 지금 열린 학교 노드(싱글톤이라 사실상 하나 — 열 때 적어 둔다). */
let activeSchool: string | null = null;
const subs = new Set<() => void>();
export const getActiveSchool = (): string | null => activeSchool;
export const subscribeActiveSchool = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

/** 살아 있는 학교 노드 id — 없으면 null. */
export function liveSchoolId(): string | null { return nodes?.liveByType(SCHOOL_TYPE)[0]?.id ?? null; }

/** 활성(index.ts)이 한 번 — 컬렉션 모듈로 kit 를 만들고 NodesApi 를 잇는다(없으면 조용히 빈 상태). */
export function initSchool(host: PluginHost): Disposable | null {
    rv = host.modules.use<RecordViewApi>('collection') ?? null;
    nodes = host.modules.use<NodesApi>('nodes') ?? null;
    kit = rv ? rv.defineCollection(CLASS_CONFIG) : null;
    return kit?.init(nodes) ?? null;
}

export const schoolNodeTypeImpl = {
    school: {
        open: (host: PluginHost, id: string) => {
            activeSchool = id; for (const s of [...subs]) s();
            host.workspace.open(SCHOOL_VIEW, { where: 'center' });
        },
    } satisfies NodeTypeImplFns,
    year: {
        open: (host: PluginHost, id: string) => { kit?.open(host, id); },
        menu: (_host: PluginHost, id: string): MenuEntry[] => kit?.menu(id) ?? [],
        createInit: () => ({ data: { fields: newYearFields() } }),
        // 🔴 학교가 없으면 학년도를 못 만든다 — 메뉴 회색 · 공개 API create 도 같은 관문.
        canCreate: () => liveSchoolId() !== null,
    } satisfies NodeTypeImplFns,
};

export const schoolNodeTypes: NodeTypeContribution<'school' | 'year'>[] = [
    {
        type: SCHOOL_TYPE, body: 'doc', label: '학교', icon: 'home', unique: 'tree',
        openable: true, create: { label: '학교', under: ['folder'] },
        impl: 'school',
    },
    {
        type: YEAR_TYPE, body: 'collection', label: '학년도', icon: 'calendar',
        container: { accepts: [CLASS_TYPE, 'folder'] }, openable: true,
        create: { label: '학년도', under: ['folder'] },
        impl: 'year',
    },
    { type: CLASS_TYPE, label: '반', icon: 'users', record: true },
];
