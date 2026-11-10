/**
 * 워크스페이스 보관 — 기기별 localStorage 에 트리를 넣고 뺀다.
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

/** 저장된 배치가 있나 — 「첫 실행(저장값 없음)에만 기본 배치를 깐다」를 가르는 데 쓴다(깨진 JSON 은 자동 정리 후 false) */
export function hasWorkspace(): boolean {
    try {
        if (typeof localStorage === 'undefined') return false;
        const s = localStorage.getItem(workspaceKey());
        if (s == null) return false;
        const parsed = JSON.parse(s);
        if (!isObj(parsed)) {
            localStorage.removeItem(workspaceKey());
            return false;
        }
        return true;
    } catch {
        try { localStorage.removeItem(workspaceKey()); } catch (e) { reportSettingsSaveFail('작업 공간 배치', e); }
        return false;
    }
}

export function loadWorkspace(): Workspace {
    try {
        if (typeof localStorage === 'undefined') return emptyWorkspace();
        const s = localStorage.getItem(workspaceKey());
        if (!s) return emptyWorkspace();
        const parsed = JSON.parse(s);
        if (!isObj(parsed)) {
            localStorage.removeItem(workspaceKey());
            return emptyWorkspace();
        }
        return normalizeRaw(parsed);
    } catch {
        try { localStorage.removeItem(workspaceKey()); } catch (e) { reportSettingsSaveFail('작업 공간 배치', e); }
        return emptyWorkspace();
    }
}

export function saveWorkspace(ws: Workspace): void {
    try {
        if (typeof localStorage === 'undefined') return;
        // 🔴 피크(floating)는 「임시」다 — 저장하지 않는다(쥔님 2026-11-01: 다시 켜면 피크는 비어 있어야 한다, W9).
        //    floating 만 빈 배열로 덮어 넣는다(독·탭·비율은 그대로 보관).
        localStorage.setItem(workspaceKey(), JSON.stringify({ ...ws, floating: [] }));
    } catch (e) { reportSettingsSaveFail('작업 공간 배치', e); }
}
