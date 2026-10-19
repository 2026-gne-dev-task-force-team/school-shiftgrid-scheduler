/**
 * 작업대 순수 연산 — Project(저장 세계) 와 Layout(창 배치) 을 불변으로 바꾼다.
 * 🔴 표 하나의 상태는 Project 에만 산다. 창(Layout)은 표 id 만 들고 「비추기만」 한다 —
 *    같은 표를 두 창에 열면 한쪽 수정이 다른 쪽에 바로 보이는 이유가 이것이다(설계 「여기서 죽는다」).
 * ⚠️ React 를 안 쓴다 — node 환경 테스트가 이 파일을 통째로 검산한다.
 */
import type { CellValue, Col, OwnerRef, Project, Row, Sheet } from './model';
import { V2_SCHEMA_VERSION, cellKey } from './model';
import { defaultCols, defaultRows, DEFAULT_START_TIME } from './defaults';
import { pruneCells } from './cells';
import { COMPONENT_REGISTRY } from './components/registry';
import { uid } from '../store/ids';

const ROW_SNAP = 5;
const MIN_ROW_MINUTES = 5;
const DEFAULT_NEW_ROW_MINUTES = 40;
const DEFAULT_NEW_COL_LABEL = '새 열';

// ══════════════════════════════════════════════════════════════
//  Project — 표 만들기·이름·지우기·되살리기·칸
// ══════════════════════════════════════════════════════════════

/** 빈 프로젝트 — 켜면 이게 뜬다. 아무것도 안 묻는다 */
export function newProject(name = '', term = ''): Project {
    return { schemaVersion: V2_SCHEMA_VERSION, name, term, sheets: [], trash: [], legacy: null };
}

/** 표 하나 만들기 — 5열(월~금) × 6줄(40분·쉼 10분·09:00) 기본 격자. 점심은 없다(컴포넌트가 넣는다) */
export function createSheet(p: Project, name?: string): { project: Project; sheet: Sheet } {
    const sheet: Sheet = {
        id: uid('sheet'),
        name: name && name.trim() ? name.trim() : nextSheetName(p),
        startTime: DEFAULT_START_TIME,
        rows: defaultRows(),
        cols: defaultCols(),
        cells: {},
        components: [],
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
    return setSheetCells(p, sheetId, [{ colKey, rowKey, text }]);
}

/** 칸 여러 개를 한 번에(복붙·채우기) — 한 번 = undo 한 단위 */
export function setSheetCells(
    p: Project, sheetId: string, changes: { colKey: string; rowKey: string; text: string }[],
): Project {
    return mapSheet(p, sheetId, (s) => {
        const cells = { ...s.cells };
        for (const ch of changes) {
            const key = cellKey(ch.colKey, ch.rowKey);
            if (ch.text === '') delete cells[key];
            else cells[key] = { kind: 'text', text: ch.text } satisfies CellValue;
        }
        return { ...s, cells };
    });
}

/** 표의 주인 칸을 세팅(화면은 안 쓰지만, 나중 모듈이 쓸 경계를 뚫어 둔다) */
export function setSheetOwner(p: Project, sheetId: string, owner: OwnerRef | undefined): Project {
    return mapSheet(p, sheetId, (s) => ({ ...s, owner }));
}

/** 프로젝트 속성(학교 이름·학기) */
export function setProjectMeta(p: Project, patch: { name?: string; term?: string }): Project {
    return { ...p, ...patch };
}

// ══════════════════════════════════════════════════════════════
//  줄(Row) — 넣기·빼기·토글·라벨·시간. 표의 시간축 전부
// ══════════════════════════════════════════════════════════════

function snapMinutes(n: number): number {
    const snapped = Math.round(n / ROW_SNAP) * ROW_SNAP;
    return Math.max(MIN_ROW_MINUTES, snapped);
}

/**
 * 새 줄은 옆 줄을 닮는다 — 길이·뒤 쉬는 시간을 기준 줄에서 베낀다(엑셀이 줄을 넣으면 위 줄 서식을 물려주듯).
 * 🔴 `gapAfter: 0` 으로 박으면 새 줄 뒤에만 쉬는 시간이 없어져 시각이 한 줄만 붙는다(10-19 화면 실측에서 걸렸다).
 */
function rowLike(base: Row | undefined): Row {
    return {
        key: uid('row'),
        minutes: base?.minutes ?? DEFAULT_NEW_ROW_MINUTES,
        gapAfter: base?.gapAfter ?? 0,
        assignable: true,
    };
}

export function insertRowAbove(p: Project, sheetId: string, rowKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const i = s.rows.findIndex((r) => r.key === rowKey);
        if (i < 0) return s;
        const row = rowLike(s.rows[i]);
        return { ...s, rows: [...s.rows.slice(0, i), row, ...s.rows.slice(i)] };
    });
}

export function insertRowBelow(p: Project, sheetId: string, rowKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const i = s.rows.findIndex((r) => r.key === rowKey);
        if (i < 0) return s;
        // 아래에 넣으면 기준 줄의 쉬는 시간은 새 줄이 물려받고, 기준 줄은 새 줄과의 틈으로 같은 값을 둔다
        const row = rowLike(s.rows[i]);
        return { ...s, rows: [...s.rows.slice(0, i + 1), row, ...s.rows.slice(i + 1)] };
    });
}

/** 줄 빼기 — 표는 최소 한 줄은 있어야 격자가 선다(마지막 한 줄은 못 뺀다) */
export function removeRow(p: Project, sheetId: string, rowKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        if (s.rows.length <= 1) return s;
        const rows = s.rows.filter((r) => r.key !== rowKey);
        const cells = pruneCells(s.cells, s.cols.map((c) => c.key), rows.map((r) => r.key));
        return { ...s, rows, cells };
    });
}

/** 「수업 없는 줄」 토글 — 끄면(=수업 못 넣게 되면) 그 줄의 칸 글자는 지운다(편집 못 하는 칸은 글자를 못 가진다) */
export function toggleRowAssignable(p: Project, sheetId: string, rowKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const rows = s.rows.map((r) => (r.key === rowKey ? { ...r, assignable: !r.assignable } : r));
        const target = rows.find((r) => r.key === rowKey);
        if (!target || target.assignable) return { ...s, rows };
        const cells = { ...s.cells };
        for (const col of s.cols) delete cells[cellKey(col.key, rowKey)];
        return { ...s, rows, cells };
    });
}

/** 줄 라벨(이름) — 빈 글자면 자동 번호로 되돌아간다(수업 줄일 때) */
export function setRowLabel(p: Project, sheetId: string, rowKey: string, label: string): Project {
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        rows: s.rows.map((r) => (r.key === rowKey ? { ...r, label: label.trim() === '' ? undefined : label } : r)),
    }));
}

/** 행 경계 끌기 — 그 줄 minutes 를 5분 스냅으로 바꾼다. 뒤 줄 시각은 파생값이라 저절로 밀린다 */
export function resizeRow(p: Project, sheetId: string, rowKey: string, deltaMinutes: number): Project {
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        rows: s.rows.map((r) => (r.key === rowKey ? { ...r, minutes: snapMinutes(r.minutes + deltaMinutes) } : r)),
    }));
}

/** 「시간 고치기」 메뉴 — 분·뒤 쉬는 시간을 직접 입력 */
export function setRowTime(p: Project, sheetId: string, rowKey: string, patch: { minutes?: number; gapAfter?: number }): Project {
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        rows: s.rows.map((r) => {
            if (r.key !== rowKey) return r;
            const minutes = patch.minutes != null ? Math.max(MIN_ROW_MINUTES, Math.round(patch.minutes)) : r.minutes;
            const gapAfter = patch.gapAfter != null ? Math.max(0, Math.round(patch.gapAfter)) : r.gapAfter;
            return { ...r, minutes, gapAfter };
        }),
    }));
}

// ══════════════════════════════════════════════════════════════
//  열(Col) — 넣기·빼기·라벨. 「한 열 = 무조건 하루」
// ══════════════════════════════════════════════════════════════

export function insertColLeft(p: Project, sheetId: string, colKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const i = s.cols.findIndex((c) => c.key === colKey);
        if (i < 0) return s;
        const col: Col = { key: uid('col'), label: DEFAULT_NEW_COL_LABEL };
        return { ...s, cols: [...s.cols.slice(0, i), col, ...s.cols.slice(i)] };
    });
}

export function insertColRight(p: Project, sheetId: string, colKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const i = s.cols.findIndex((c) => c.key === colKey);
        if (i < 0) return s;
        const col: Col = { key: uid('col'), label: DEFAULT_NEW_COL_LABEL };
        return { ...s, cols: [...s.cols.slice(0, i + 1), col, ...s.cols.slice(i + 1)] };
    });
}

/** 열 빼기 — 표는 최소 한 열은 있어야 격자가 선다 */
export function removeCol(p: Project, sheetId: string, colKey: string): Project {
    return mapSheet(p, sheetId, (s) => {
        if (s.cols.length <= 1) return s;
        const cols = s.cols.filter((c) => c.key !== colKey);
        const cells = pruneCells(s.cells, cols.map((c) => c.key), s.rows.map((r) => r.key));
        return { ...s, cols, cells };
    });
}

export function setColLabel(p: Project, sheetId: string, colKey: string, label: string): Project {
    return mapSheet(p, sheetId, (s) => ({ ...s, cols: s.cols.map((c) => (c.key === colKey ? { ...c, label } : c)) }));
}

// ══════════════════════════════════════════════════════════════
//  컴포넌트 — 꽂기·속성·적용·빼기
// ══════════════════════════════════════════════════════════════

/** 컴포넌트 꽂기 — 레지스트리의 기본 속성값으로 인스턴스 하나를 더한다(적용 전엔 표에 영향 없음) */
export function addComponent(p: Project, sheetId: string, componentId: string): Project {
    const entry = COMPONENT_REGISTRY[componentId];
    if (!entry) return p;
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        components: [...s.components, { componentId, instanceId: uid('cmp'), props: { ...entry.def.defaultProps } }],
    }));
}

/** 컴포넌트 빼기 — 인스턴스만 지운다. 이미 적용돼 반영된 표 모양은 그대로 남는다(쓰지 소유하지 않는다) */
export function removeComponent(p: Project, sheetId: string, instanceId: string): Project {
    return mapSheet(p, sheetId, (s) => ({ ...s, components: s.components.filter((c) => c.instanceId !== instanceId) }));
}

/** 속성 만지기 — 적용을 누르기 전까지는 표에 영향이 없다. 다시 열어도 이 값이 보인다 */
export function updateComponentProps(p: Project, sheetId: string, instanceId: string, patch: Record<string, unknown>): Project {
    return mapSheet(p, sheetId, (s) => ({
        ...s,
        components: s.components.map((c) => (c.instanceId === instanceId ? { ...c, props: { ...c.props, ...patch } } : c)),
    }));
}

/** 「적용」 — 그 컴포넌트의 apply(sheet, props) 를 불러 표(rows/cols/cells)를 바꾼다. 적용 한 번 = undo 한 단위 */
export function applyComponent(p: Project, sheetId: string, instanceId: string): Project {
    return mapSheet(p, sheetId, (s) => {
        const inst = s.components.find((c) => c.instanceId === instanceId);
        const def = inst && COMPONENT_REGISTRY[inst.componentId]?.def;
        if (!inst || !def) return s;
        return def.apply(s, inst.props);
    });
}

// ── 보조 ──
function mapSheet(p: Project, id: string, fn: (s: Sheet) => Sheet): Project {
    let hit = false;
    const sheets = p.sheets.map((s) => (s.id === id ? (hit = true, fn(s)) : s));
    return hit ? { ...p, sheets } : p;
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
