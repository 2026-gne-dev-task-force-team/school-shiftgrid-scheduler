/**
 * 워크스페이스 보관 — 이 탭(sessionStorage)과 마지막 배치(localStorage)에 트리를 넣고 뺀다(R3-X 🙋15 · 아래 절).
 *
 * 🔴 모양이 틀린 저장값은 통째로 버리지 않는다 — normalize 로 살릴 수 있는 만큼 살리고,
 *    못 살리면 빈 배치로. (옛 panels.ts 의 normalizePanels 와 같은 받아들이기 태도)
 * 🔴 ⛔ 앱 이름을 키에 박지 않는다 — storage.ts 가 이미 접두사를 쥔다(storageKey).
 * (tree.ts 는 순수하게 둔다 — localStorage 를 아는 건 이 파일뿐이다)
 */
import { storageKey } from '../storage';
import { reportSettingsSaveFail } from './save-fail';
import {
    type Workspace, type Node, type Leaf,
    normalize, emptyWorkspace, emptyTabs,
} from './tree';

export const workspaceKey = () => storageKey('workspace');

function isObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object';
}

/** 저장된 날것 leaf 를 성한 Leaf 로 — id·viewId 가 문자열이어야 산다 */
function coerceLeaf(raw: unknown): Leaf | null {
    if (!isObj(raw)) return null;
    if (raw.kind !== 'leaf') return null;
    if (typeof raw.id !== 'string' || typeof raw.viewId !== 'string') return null;
    const title = typeof raw.title === 'string' ? raw.title : raw.id;
    const params = isObj(raw.params) ? (raw.params as Record<string, unknown>) : undefined;
    // 🔴 사용자가 직접 바꾼 제목만 되살린다 — 옛 저장값엔 이 칸이 없어(생략) 레지스트리 title 이 이긴다(leafTitle, 호환).
    const renamed = raw.renamed === true ? true : undefined;
    const glyph = typeof raw.glyph === 'string' && raw.glyph ? raw.glyph : undefined;
    return { kind: 'leaf', id: raw.id, viewId: raw.viewId, title, renamed, glyph, params };
}

/** 저장된 날것 노드를 성한 Node 로 — 모르는 모양은 버린다(normalize 가 뒤처리) */
function coerceNode(raw: unknown): Node | null {
    if (!isObj(raw)) return null;
    if (raw.kind === 'leaf') return coerceLeaf(raw);
    if (raw.kind === 'tabs') {
        if (typeof raw.id !== 'string' || !Array.isArray(raw.children)) return null;
        const children = raw.children.map(coerceLeaf).filter((l): l is Leaf => l !== null);
        const activeId = typeof raw.activeId === 'string' ? raw.activeId : (children[0]?.id ?? '');
        return { kind: 'tabs', id: raw.id, children, activeId };
    }
    if (raw.kind === 'split') {
        if (typeof raw.id !== 'string' || !Array.isArray(raw.children)) return null;
        if (raw.dir !== 'row' && raw.dir !== 'col') return null;
        const children = raw.children.map(coerceNode).filter((n): n is Node => n !== null);
        const sizes = Array.isArray(raw.sizes) ? raw.sizes.filter((s): s is number => typeof s === 'number') : [];
        return { kind: 'split', id: raw.id, dir: raw.dir, children, sizes };
    }
    return null;
}

/** 날것을 받아들인다 — 못 살리면 빈 배치 */
export function normalizeRaw(raw: unknown): Workspace {
    if (!isObj(raw)) return emptyWorkspace();
    const center = coerceNode(raw.center) ?? emptyTabs();
    const left = coerceNode(raw.left);
    const right = coerceNode(raw.right);
    const floating = Array.isArray(raw.floating)
        ? raw.floating.map(coerceLeaf).filter((l): l is Leaf => l !== null)
        : [];
    return normalize({ left, center, right, floating });
}

// ── 🔴 R3-X 🙋15 — 배치는 탭마다(sessionStorage) · 새 탭은 「마지막 배치」(localStorage)로 시작 ──
//    쥔님 2026-11-10 *"보는거나 열어놓은건 정도는 달라도 되겠지. 설정이나 데이터는 차이나면 안돼"*
//    → 열린 탭·가르기는 탭마다 따로 산다(다른 탭을 덮지 않는다). 저장할 때 localStorage 도 갱신해 다음 새 탭의 출발점이 된다.
//    ⭐ 읽기 순서: sessionStorage(이 탭) → 없으면 localStorage(마지막 배치). 깨진 값은 그 자리에서 치운다.
type Area = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function areas(): Area[] {
    const out: Area[] = [];
    try { if (typeof sessionStorage !== 'undefined' && sessionStorage) out.push(sessionStorage); } catch { /* 막힌 환경 */ }
    try { if (typeof localStorage !== 'undefined' && localStorage) out.push(localStorage); } catch { /* 막힌 환경 */ }
    return out;
}

/** 첫 성한 저장값(객체) — 이 탭 것 먼저, 없으면 마지막 배치. 깨진 JSON·비객체는 치우고 다음 자리로. */
function readRaw(): Record<string, unknown> | null {
    for (const a of areas()) {
        try {
            const s = a.getItem(workspaceKey());
            if (s == null || s === '') continue;
            const parsed = JSON.parse(s);
            if (isObj(parsed)) return parsed;
            a.removeItem(workspaceKey());
        } catch {
            try { a.removeItem(workspaceKey()); } catch (e) { reportSettingsSaveFail('작업 공간 배치', e); }
        }
    }
    return null;
}

/** 저장된 배치가 있나 — 「첫 실행(저장값 없음)에만 기본 배치를 깐다」를 가르는 데 쓴다(깨진 JSON 은 자동 정리 후 false) */
export function hasWorkspace(): boolean {
    return readRaw() !== null;
}

export function loadWorkspace(): Workspace {
    const raw = readRaw();
    return raw ? normalizeRaw(raw) : emptyWorkspace();
}

export function saveWorkspace(ws: Workspace): void {
    // 🔴 피크(floating)는 「임시」다 — 저장하지 않는다(쥔님 2026-11-01: 다시 켜면 피크는 비어 있어야 한다, W9).
    //    floating 만 빈 배열로 덮어 넣는다(독·탭·비율은 그대로 보관).
    const s = JSON.stringify({ ...ws, floating: [] });
    for (const a of areas()) {
        try { a.setItem(workspaceKey(), s); } catch (e) { reportSettingsSaveFail('작업 공간 배치', e); }
    }
}

/** 배치 저장값을 지운다 — 이 탭 것과 마지막 배치 둘 다(화면 초기화·오류 복구). */
export function clearWorkspace(): void {
    for (const a of areas()) {
        try { a.removeItem(workspaceKey()); } catch { /* 조용히 */ }
    }
}
