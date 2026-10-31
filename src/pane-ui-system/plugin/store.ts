/**
 * 플러그인 기여 스토어 + 주인 꼬리표 + 작업대 다리.
 *
 * 🔴 ⛔ 도메인 0. 여기는 「누가 무엇을 등록했나」만 쥔다 — viewId 가 무슨 뜻인지 모른다.
 *
 * ⭐ 세 가지가 산다:
 *   ① 주인별 Disposable 묶음 — 플러그인이 안 챙겨도 호스트가 모아 뒀다가 끌 때 한꺼번에 부른다(P2).
 *   ② 리본 동작 스토어 — 노트: 「리본은 뷰가 아니라 동작」. P0 은 쌓기만(Rail 은 뷰 설탕을 읽는다, 안 고침).
 *   ③ 작업대 다리 — 호스트는 React 밖(main.tsx)에서 산다. 작업대 상태(setWs)는 Workbench 가 쥐니,
 *      Workbench 가 마운트될 때 다리를 걸어 둔다. workspace.open/close 는 이 다리로 넘긴다.
 */
import type { Disposable, RibbonAction, WorkspaceOpenOptions } from './types';

// ── ① 주인별 Disposable ──
const owned = new Map<string, Disposable[]>();

/** 주인 꼬리표를 달아 모아 둔다 — 그대로 돌려준다(체이닝). */
export function track(owner: string, d: Disposable): Disposable {
    const arr = owned.get(owner) ?? [];
    arr.push(d);
    owned.set(owner, arr);
    return d;
}

/** 그 주인의 등록물을 전부 회수한다(역순) — P2 비활성에서 쓴다. */
export function disposeOwner(owner: string): void {
    const arr = owned.get(owner);
    if (!arr) return;
    for (const d of [...arr].reverse()) {
        try { d.dispose(); } catch { /* 하나가 던져도 나머지는 회수 */ }
    }
    owned.set(owner, []);
}

// ── ② 리본 동작 스토어 ──
let ribbonSeq = 0;
const ribbonActions: (RibbonAction & { owner: string; seq: number })[] = [];

export function addRibbonAction(owner: string, a: RibbonAction): Disposable {
    const entry = { ...a, owner, seq: ribbonSeq++ };
    ribbonActions.push(entry);
    return { dispose() { const i = ribbonActions.indexOf(entry); if (i >= 0) ribbonActions.splice(i, 1); } };
}

/** order 오름차순, 같으면 등록 순(안정). P0 은 아직 아무도 안 읽는다(자리). */
export function listRibbonActions(): RibbonAction[] {
    return [...ribbonActions].sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || x.seq - y.seq);
}

// ── ③ 작업대 다리 ──
export interface WorkspaceBridge {
    open(viewId: string, o?: WorkspaceOpenOptions): string | null;
    close(leafId: string): void;
}

let bridge: WorkspaceBridge | null = null;

/** Workbench 가 마운트 때 건다(언마운트 때 null). */
export function setWorkspaceBridge(b: WorkspaceBridge | null): void {
    bridge = b;
}

export function getWorkspaceBridge(): WorkspaceBridge | null {
    return bridge;
}
