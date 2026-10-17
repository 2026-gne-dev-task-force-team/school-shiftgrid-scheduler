/**
 * 작업대 순수 연산 — Project(저장 세계) 와 Layout(창 배치) 을 불변으로 바꾼다.
 * 🔴 표 하나의 상태는 Project 에만 산다. 창(Layout)은 표 id 만 들고 「비추기만」 한다 —
 *    같은 표를 두 창에 열면 한쪽 수정이 다른 쪽에 바로 보이는 이유가 이것이다(설계 「여기서 죽는다」).
 * ⚠️ React 를 안 쓴다 — node 환경 테스트가 이 파일을 통째로 검산한다.
 */
import type { CellValue, OwnerRef, Project, Sheet } from './model';
import { V2_SCHEMA_VERSION, cellKey } from './model';
import { defaultSpec, defaultSlots } from './defaults';
import type { TimetableSpec } from '../types/schema';
import { uid } from '../store/ids';

// ══════════════════════════════════════════════════════════════
//  Project — 표 만들기·이름·지우기·되살리기·칸
// ══════════════════════════════════════════════════════════════

/** 빈 프로젝트 — 켜면 이게 뜬다. 아무것도 안 묻는다 */
export function newProject(name = '', term = ''): Project {
    return { schemaVersion: V2_SCHEMA_VERSION, name, term, sheets: [], trash: [], legacy: null };
}

/** 표 하나 만들기 — 월~금 × 6교시 기본 격자. 돌려주는 id 로 바로 열 수 있다 */
export function createSheet(p: Project, name?: string): { project: Project; sheet: Sheet } {
    const sheet: Sheet = {
        id: uid('sheet'),
        name: name && name.trim() ? name.trim() : nextSheetName(p),
        spec: defaultSpec(),
        cells: {},
    };
    return { project: { ...p, sheets: [...p.sheets, sheet] }, sheet };
}

/** 「새 시간표 N」 — 이미 있는 이름과 안 겹치는 다음 번호 */
function nextSheetName(p: Project): string {
    const taken = new Set([...p.sheets, ...p.trash].map((s) => s.name));
    for (let i = 1; ; i++) {
        const n = `새 시간표 ${i}`;
        if (!taken.has(n)) return n;
    }
}

export function getSheet(p: Project, id: string | null | undefined): Sheet | undefined {
    if (!id) return undefined;
    return p.sheets.find((s) => s.id === id);
}

export function renameSheet(p: Project, id: string, name: string): Project {
    return { ...p, sheets: p.sheets.map((s) => (s.id === id ? { ...s, name } : s)) };
}

/**
 * 표 지우기 — 영구 삭제가 아니라 탐색기 휴지통으로 옮긴다(되돌릴 수 있게).
 * ⛔ 묻지 않고 영구 삭제하지 않는다 — 설계 「이건 진짜 하지 마」.
 */
export function deleteSheet(p: Project, id: string): Project {
    const sheet = p.sheets.find((s) => s.id === id);
    if (!sheet) return p;
    return { ...p, sheets: p.sheets.filter((s) => s.id !== id), trash: [sheet, ...p.trash] };
}

/** 휴지통에서 되살리기 */
export function restoreSheet(p: Project, id: string): Project {
    const sheet = p.trash.find((s) => s.id === id);
    if (!sheet) return p;
    // 이름이 겹치면 살아 있는 표가 우선 — 되살리는 쪽에 꼬리표를 붙인다
    const taken = new Set(p.sheets.map((s) => s.name));
    const restored = taken.has(sheet.name) ? { ...sheet, name: `${sheet.name} (복원)` } : sheet;
    return { ...p, trash: p.trash.filter((s) => s.id !== id), sheets: [...p.sheets, restored] };
}

/** 휴지통 비우기(한 건) — 🔴 영구 삭제라 「되돌릴 수 있게」의 범위를 넘는다. 화면에서 명시 확인을 받은 뒤에만 부른다 */
export function purgeTrash(p: Project, id: string): Project {
    return { ...p, trash: p.trash.filter((s) => s.id !== id) };
}

/**
 * 칸에 글자 쓰기. 빈 글자면 칸을 지운다(파일을 작게).
 * 🔴 글자는 글자일 뿐이다 — 「김영희」를 교사로 승격시키지 않는다(설계 「이건 진짜 하지 마」).
 */
export function setSheetCell(p: Project, sheetId: string, colKey: string, rowKey: string, text: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const key = cellKey(colKey, rowKey);
        const cells = { ...s.cells };
        if (text === '') delete cells[key];
        else cells[key] = { kind: 'text', text } satisfies CellValue;
        return { ...s, cells };
    });
}

/** 표의 시간 틀 통째 교체(속성 패널의 세밀 편집용) */
export function updateSheetSpec(p: Project, sheetId: string, spec: TimetableSpec): Project {
    return mapSheet(p, sheetId, (s) => ({ ...s, spec }));
}

/**
 * 교시 수 바꾸기 — 속성 패널에서 「교시 몇 개」를 바꾼다.
 * 🔴 교시를 줄이면 그 밖으로 나간 칸 글자는 지운다(격자에 없는 칸은 안 보이니까). 늘리면 빈 칸만 는다.
 *    기존 슬롯의 시각·라벨은 지키고, 는 만큼만 기본 슬롯을 덧댄다.
 */
export function setPeriods(p: Project, sheetId: string, periods: number): Project {
    const n = Math.max(0, Math.min(20, Math.floor(periods)));
    return mapSheet(p, sheetId, (s) => {
        const old = s.spec.slots;
        const base = defaultSlots(n);
        const slots = base.map((b, i) => old[i] ? { ...old[i], index: i } : b);
        const spec: TimetableSpec = {
            ...s.spec,
            slots,
            dayStart: slots[0]?.start ?? s.spec.dayStart,
            dayEnd: slots[slots.length - 1]?.end ?? s.spec.dayEnd,
        };
        const cells = pruneCells(s.cells, s.spec.activeDays, slots.map((x) => x.index));
        return { ...s, spec, cells };
    });
}

/**
 * 수업 요일 수 바꾸기 — 「요일 몇 개」(앞에서부터 월·화·수…). 줄이면 밖으로 나간 칸 글자는 지운다.
 */
export function setDays(p: Project, sheetId: string, days: number): Project {
    const n = Math.max(0, Math.min(7, Math.floor(days)));
    return mapSheet(p, sheetId, (s) => {
        const activeDays = Array.from({ length: n }, (_, i) => i);
        const spec: TimetableSpec = { ...s.spec, activeDays };
        const cells = pruneCells(s.cells, activeDays, s.spec.slots.map((x) => x.index));
        return { ...s, spec, cells };
    });
}

/** 한 슬롯(교시)의 속성(라벨·시각·수업/점심/쉼) 편집 */
export function updateSlot(p: Project, sheetId: string, slotIndex: number, patch: Partial<TimetableSpec['slots'][number]>): Project {
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        spec: { ...s.spec, slots: s.spec.slots.map((sl) => (sl.index === slotIndex ? { ...sl, ...patch } : sl)) },
    }));
}

/** 표의 주인 칸을 세팅(모듈 1 화면은 안 쓰지만, 나중 모듈이 쓸 경계를 뚫어 둔다) */
export function setSheetOwner(p: Project, sheetId: string, owner: OwnerRef | undefined): Project {
    return mapSheet(p, sheetId, (s) => ({ ...s, owner }));
}

/** 프로젝트 속성(학교 이름·학기) */
export function setProjectMeta(p: Project, patch: { name?: string; term?: string }): Project {
    return { ...p, ...patch };
}

// ── 보조 ──
function mapSheet(p: Project, id: string, fn: (s: Sheet) => Sheet): Project {
    let hit = false;
    const sheets = p.sheets.map((s) => (s.id === id ? (hit = true, fn(s)) : s));
    return hit ? { ...p, sheets } : p;
}

/** 격자 밖(요일·교시 범위 밖)으로 나간 칸 글자를 버린다 */
function pruneCells(cells: Record<string, CellValue>, activeDays: number[], slotIndexes: number[]): Record<string, CellValue> {
    const okCol = new Set(activeDays.map(String));
    const okRow = new Set(slotIndexes.map(String));
    const out: Record<string, CellValue> = {};
    for (const [k, v] of Object.entries(cells)) {
        const [c, r] = k.split(':');
        if (okCol.has(c) && okRow.has(r)) out[k] = v;
    }
    return out;
}

// ══════════════════════════════════════════════════════════════
//  Layout — 탭 + 좌우/상하 스플릿. 창은 표 id 만 들고 비추기만 한다
// ══════════════════════════════════════════════════════════════

export type PaneNode =
    | { kind: 'window'; id: string }
    | { kind: 'split'; id: string; dir: 'row' | 'col'; a: PaneNode; b: PaneNode; ratio: number };

export interface WindowState {
    id: string;
    tabs: string[];        // 열린 표 id 들
    active: string | null; // 지금 보는 탭
}

export interface Layout {
    root: PaneNode;
    windows: Record<string, WindowState>;
    activeWindow: string;  // 포커스된 창 (새 표를 여기로 연다)
}

export function newLayout(): Layout {
    const id = uid('win');
    return { root: { kind: 'window', id }, windows: { [id]: { id, tabs: [], active: null } }, activeWindow: id };
}

/** 표를 창에서 연다 — 이미 열려 있으면 그 탭을 고르기만 */
export function openInWindow(layout: Layout, winId: string, sheetId: string): Layout {
    const w = layout.windows[winId];
    if (!w) return layout;
    const tabs = w.tabs.includes(sheetId) ? w.tabs : [...w.tabs, sheetId];
    return {
        ...layout,
        windows: { ...layout.windows, [winId]: { ...w, tabs, active: sheetId } },
        activeWindow: winId,
    };
}

/** 활성 창에 연다(탐색기 더블클릭) */
export function openInActive(layout: Layout, sheetId: string): Layout {
    return openInWindow(layout, layout.activeWindow, sheetId);
}

/** 탭 닫기 */
export function closeTab(layout: Layout, winId: string, sheetId: string): Layout {
    const w = layout.windows[winId];
    if (!w) return layout;
    const tabs = w.tabs.filter((t) => t !== sheetId);
    const active = w.active === sheetId ? (tabs[tabs.length - 1] ?? null) : w.active;
    return { ...layout, windows: { ...layout.windows, [winId]: { ...w, tabs, active } } };
}

/** 어느 창이든 그 표 탭을 다 닫는다(표를 지울 때) */
export function closeSheetEverywhere(layout: Layout, sheetId: string): Layout {
    let out = layout;
    for (const id of Object.keys(layout.windows)) out = closeTab(out, id, sheetId);
    return out;
}

/** 활성 탭 고르기 */
export function activateTab(layout: Layout, winId: string, sheetId: string): Layout {
    const w = layout.windows[winId];
    if (!w || !w.tabs.includes(sheetId)) return layout;
    return { ...layout, windows: { ...layout.windows, [winId]: { ...w, active: sheetId } }, activeWindow: winId };
}

export function focusWindow(layout: Layout, winId: string): Layout {
    if (!layout.windows[winId]) return layout;
    return { ...layout, activeWindow: winId };
}

/**
 * 창 가르기 — 그 창을 split{그 창, 새 창}으로 바꾼다. 새 창은 같은 표를 비춘다(두 창 반영 시연).
 *   dir: 'row' = 좌우로, 'col' = 상하로.
 */
export function splitWindow(layout: Layout, winId: string, dir: 'row' | 'col'): Layout {
    const w = layout.windows[winId];
    if (!w) return layout;
    const newId = uid('win');
    const newWin: WindowState = { id: newId, tabs: w.active ? [w.active] : [], active: w.active };
    const root = replaceNode(layout.root, winId, (node) => ({
        kind: 'split', id: uid('sp'), dir, ratio: 0.5,
        a: node, b: { kind: 'window', id: newId },
    }));
    return {
        root,
        windows: { ...layout.windows, [newId]: newWin },
        activeWindow: newId,
    };
}

/** 창(판) 닫기 — 스플릿을 접고 형제가 그 자리를 차지한다. 마지막 창 하나는 남긴다 */
export function closePane(layout: Layout, winId: string): Layout {
    if (Object.keys(layout.windows).length <= 1) return layout; // 마지막 하나는 못 닫는다
    const root = removeNode(layout.root, winId);
    if (!root) return layout;
    const windows = { ...layout.windows };
    delete windows[winId];
    const activeWindow = layout.activeWindow === winId ? firstWindowId(root) : layout.activeWindow;
    return { root, windows, activeWindow };
}

export function setRatio(layout: Layout, splitId: string, ratio: number): Layout {
    const r = Math.max(0.1, Math.min(0.9, ratio));
    const root = mapNode(layout.root, (n) => (n.kind === 'split' && n.id === splitId ? { ...n, ratio: r } : n));
    return { ...layout, root };
}

// ── 레이아웃 트리 보조 ──
function replaceNode(node: PaneNode, targetId: string, make: (n: PaneNode) => PaneNode): PaneNode {
    if (node.kind === 'window') return node.id === targetId ? make(node) : node;
    return { ...node, a: replaceNode(node.a, targetId, make), b: replaceNode(node.b, targetId, make) };
}

function removeNode(node: PaneNode, targetId: string): PaneNode | null {
    if (node.kind === 'window') return node.id === targetId ? null : node;
    const a = removeNode(node.a, targetId);
    const b = removeNode(node.b, targetId);
    if (a === null) return b;
    if (b === null) return a;
    return { ...node, a, b };
}

function mapNode(node: PaneNode, fn: (n: PaneNode) => PaneNode): PaneNode {
    const mapped = fn(node);
    if (mapped.kind === 'split') return { ...mapped, a: mapNode(mapped.a, fn), b: mapNode(mapped.b, fn) };
    return mapped;
}

function firstWindowId(node: PaneNode): string {
    return node.kind === 'window' ? node.id : firstWindowId(node.a);
}
