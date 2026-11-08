/**
 * 시간표 그리드 ↔ 노드 시스템 다리 — 🔴 시간표 한 장도, 특별 시간표도 노드다. 저장·휴지통·복원은 노드 시스템이 쥔다
 *   (달력·명단 다리와 같은 규칙). ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만.
 *
 * 이 모듈이 쥐는 것:
 *   ① 노드 타입 둘 등록(timetable-grid.sheet 컨테이너 · timetable-grid.special) — index.ts 가 contributes 로 꽂는다
 *   ② NodesApi 참조 + byType 스냅샷(시간표·특별)을 subscribe 로 갱신 — 뷰가 useSyncExternalStore 로 읽는다
 *   ③ 시간표 데이터 읽기·쓰기(손 편집 전부 model.ts 순수 함수로 돌린 뒤 setData) · 표 통째 복사(노드 복제)
 *   ④ 특별 시간표 모으기(노드 순서) + 일정 목록 계산(schedule.ts)
 */
// 🔴 import type 만 — 약속 타입은 약속 플러그인에서(값 아님, 구조 검사 ⑱·d·g). 값은 host.modules.use('nodes') 로 받는다.
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import type { TimetableData, SpecialData, ScheduleEntry } from '../contract-week-grid/types';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { blankTimetable } from './model';
import { scheduleRange, type SpecialInput } from './schedule';
import { setActiveSheet } from './store';

export const SHEET_TYPE = 'timetable-grid.sheet';
export const SPECIAL_TYPE = 'timetable-grid.special';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'timetable-grid.' 를 붙인다). 시간표를 열면 여는 그리드 화면.
const GRID_ID = 'timetable-grid.grid';

// ── 다리 상태(모듈 전역 — 달력·명단 nodes.ts 와 같은 결) ──
let api: NodesApi | null = null;
let sheetNodes: PublicNode[] = [];
let specialNodes: PublicNode[] = [];
const subs = new Set<() => void>();

// ── 우클릭 메뉴가 가리킨 노드 — 탐색기가 메뉴를 그릴 때 잡아 둔다(ContextMenu 는 인자를 안 싣는다). ──
let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

function recompute(): void {
    sheetNodes = api ? api.byType(SHEET_TYPE) : [];
    specialNodes = api ? api.byType(SPECIAL_TYPE) : [];
    for (const s of subs) s();
}

/**
 * 🔴 노드 타입 함수 묶음(선언형 D5) — contributes.nodeTypes 의 impl 이름이 가리킨다.
 *   · sheet.open  — 시간표를 열면 「보고 있는 시간표」를 그걸로 두고 그리드 화면을 가운데에.
 *   · special.open — 특별 시간표도 같은 그리드 화면에서 연다(보고 있는 것만 바뀐다).
 */
export const gridNodeTypeImpl = {
    sheet: {
        open: (host: PluginHost, id: string) => { setActiveSheet(id); host.workspace.open(GRID_ID, { where: 'center' }); },
        menu: (_host: PluginHost, id: string) => sheetMenu(id),
    } satisfies NodeTypeImplFns,
    special: {
        open: (host: PluginHost, id: string) => { setActiveSheet(id); host.workspace.open(GRID_ID, { where: 'center' }); },
        menu: (_host: PluginHost, id: string) => specialMenu(id),
    } satisfies NodeTypeImplFns,
};

/**
 * 타입 둘 — 시간표(컨테이너: 특별 시간표·폴더·시간표를 받음)·특별 시간표(시간표 밑에만).
 *   ⛔ 둘 다 탐색기에 보인다(특별도 사용자가 관리해야 하므로 record 아님).
 */
export const gridNodeTypes: NodeTypeContribution<'sheet' | 'special'>[] = [
    {
        type: SHEET_TYPE, label: '시간표', icon: 'schedule',
        container: { accepts: [SPECIAL_TYPE, 'folder', SHEET_TYPE] }, openable: true,
        create: { label: '시간표', under: ['folder', SHEET_TYPE] },
        impl: 'sheet',
    },
    {
        type: SPECIAL_TYPE, label: '특별 시간표', icon: 'sparkles',
        openable: true,
        create: { label: '특별 시간표', under: [SHEET_TYPE] },
        impl: 'special',
    },
];

export function sheetMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '시간표 열기', icon: 'schedule', commandId: 'timetable-grid.openSheet' },
        { label: '표 복사(통째)', icon: 'copy', commandId: 'timetable-grid.duplicate' },
    ];
}

export function specialMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '특별 시간표 열기', icon: 'sparkles', commandId: 'timetable-grid.openSheet' },
    ];
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다. */
export function initGridNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    recompute();
    if (!nodes) return null;
    return nodes.subscribe(() => recompute());
}

export function getNodesApi(): NodesApi | null { return api; }

// ── React 구독 창구 ──
export function subscribeNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getSheetNodes(): PublicNode[] { return sheetNodes; }
export function getSpecialNodes(): PublicNode[] { return specialNodes; }

/**
 * 시작 화면 「새 시간표」 — 탐색기 맨 위(main 루트)에 빈 시간표 한 장을 만든다. 이름이 겹치면 「시간표 2」…
 *   데이터는 비워 둔다(dataOf 가 기본 월~금 × 6행을 깐다 — 탐색기 「새로 만들기」와 같은 결). 새 id 를 돌려준다.
 */
export function createSheet(): string | null {
    if (!api) return null;
    const taken = new Set(sheetNodes.map((n) => n.name));
    let name = '시간표';
    for (let i = 2; taken.has(name); i++) name = `시간표 ${i}`;
    return api.create(api.roots.main, { type: SHEET_TYPE, name });
}

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}

/** 조상에 휴지통이 있나(달력·명단과 같은 규칙). */
export function inTrash(id: string): boolean {
    if (!api) return false;
    const trash = api.roots.trash;
    let cur: string | null = api.parent(id);
    let guard = 0;
    while (cur && guard < 1000) {
        if (cur === trash) return true;
        if (cur === api.roots.main) return false;
        cur = api.parent(cur);
        guard++;
    }
    return false;
}

// ── 데이터 읽기 ──

/** 노드의 종류 — 시간표인가 특별인가(없으면 null). */
export function typeOf(id: string): 'sheet' | 'special' | null {
    const n = api?.get(id);
    if (!n) return null;
    if (n.type === SHEET_TYPE) return 'sheet';
    if (n.type === SPECIAL_TYPE) return 'special';
    return null;
}

/** 시간표 데이터 — 없으면 빈 표(결정적). */
export function sheetDataOf(id: string): TimetableData {
    const n = api?.get(id);
    return (n?.data as TimetableData | undefined) ?? blankTimetable();
}

/** 특별 시간표 데이터 — 없으면 부모 시간표의 모양(열·행)을 본떠 빈 칸 overlay 로(1차: 모양 공유). */
export function specialDataOf(id: string): SpecialData {
    const n = api?.get(id);
    const existing = n?.data as SpecialData | undefined;
    if (existing) return existing;
    const parent = api?.parent(id);
    const baseShape = parent ? sheetDataOf(parent) : blankTimetable();
    return {
        range: { kind: 'period', start: '', end: '' },
        columns: baseShape.columns,
        rows: baseShape.rows,
        cells: {},
        mode: 'overlay',
    };
}

/** 어느 노드든(시간표·특별) 편집용 데이터를 읽는다. */
export function dataOf(id: string): TimetableData {
    return typeOf(id) === 'special' ? specialDataOf(id) : sheetDataOf(id);
}

// ── 쓰기 ──

/** 데이터 한 장을 순수 함수로 바꿔 저장한다 — 손 편집 전부 이 길. */
export function applyEdit(id: string, edit: (data: TimetableData) => TimetableData): void {
    if (!api) return;
    const next = edit(dataOf(id));
    api.setData(id, next);
}

/** 특별 시간표 머리(모드·우선순위)만 바꾼다. */
export function applySpecialMeta(id: string, patch: { mode?: SpecialData['mode']; priority?: number | null }): void {
    if (!api || typeOf(id) !== 'special') return;
    const cur = specialDataOf(id);
    const next: SpecialData = { ...cur };
    if (patch.mode !== undefined) next.mode = patch.mode;
    if (patch.priority !== undefined) { if (patch.priority === null) delete next.priority; else next.priority = patch.priority; }
    api.setData(id, next);
}

export function renameNode(id: string, name: string): void { api?.rename(id, name); }

/** 그 시간표 밑에 특별 시간표 하나 만들기 — 모양은 부모를 본뜬다(specialDataOf 가 읽기 때 채운다). */
export function createSpecial(sheetId: string): string {
    if (!api) return '';
    return api.create(sheetId, { type: SPECIAL_TYPE, name: '특별 시간표' });
}

/**
 * 🔴 표 통째 복사 — 노드를 복제한다(명세: 칸 복사는 표 편집기 몫, 표 통째 복사는 그리드가 노드 복제로).
 *   같은 부모 밑에 시간표를 복사하고, 그 밑 특별 시간표들도 같이 복사한다. 새 시간표 id 를 돌려준다.
 */
export function duplicateSheet(id: string): string {
    if (!api || typeOf(id) !== 'sheet') return '';
    const parent = api.parent(id) ?? api.roots.main;
    const src = api.get(id);
    if (!src) return '';
    const newId = api.create(parent, { type: SHEET_TYPE, name: `${src.name} 복사`, data: sheetDataOf(id) });
    if (!newId) return '';
    for (const child of api.children(id)) {
        if (child.type !== SPECIAL_TYPE || inTrash(child.id)) continue;
        api.create(newId, { type: SPECIAL_TYPE, name: child.name, data: specialDataOf(child.id) });
    }
    return newId;
}

// ── 특별 시간표 모으기 + 일정 ──

/** 그 시간표의 살아 있는 특별 시간표들(노드 순서). schedule 의 SpecialInput 꼴로. */
export function specialsOf(sheetId: string): SpecialInput[] {
    if (!api) return [];
    return api.children(sheetId)
        .filter((n) => n.type === SPECIAL_TYPE && !inTrash(n.id))
        .map((n) => ({ id: n.id, data: specialDataOf(n.id) }));
}

/** 특별 시간표의 부모 시간표 id(없으면 null). */
export function parentSheetOf(specialId: string): string | null {
    return api?.parent(specialId) ?? null;
}

/** 그 시간표가 [from,to] 에 내는 일정 목록(특별 반영) — 🔴 달력으로 갈 재료. */
export function scheduleFor(sheetId: string, from: string, to: string): ScheduleEntry[] {
    return scheduleRange(sheetDataOf(sheetId), specialsOf(sheetId), from, to);
}
