/**
 * 「탭으로 열기」 한 길(W13 · 쥔님 2026-11-10 *"레코드에서 탭으로 열기나, 이미 열려져있는 미리보기 창에서 탭으로 열기 같은게 필요할 듯해"*).
 *   레코드 = 속성이 붙은 문서 — 미리보기(peek)에 뜨던 그 RecordPage 를 가운데 탭 하나에 그대로 띄운다.
 *   🔴 열기 갈래:
 *     - 제 편집 탭이 있는 노드(사용자·역할 → 계정 편집 탭 · 페이지 → 페이지 편집 탭)는 노드 열기(nodes.open) 그대로.
 *     - 제 탭이 없는 레코드(컬렉션 행 · 목록 꾸러미 항목)는 여기 「레코드」 탭(collection.record · 레코드마다 한 장)이 그린다.
 *   ⭐ W15: 레코드마다 탭 한 장(문서처럼) — 탭 params {recordId} 가 정체성이라 같은 레코드는 그 탭으로 가고, 저장·복원도 params 로 된다.
 *      제목·아이콘은 레코드를 따라가고, 휴지통에 가면 「삭제된 문서」 안내.
 */
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { setLeafGlyph, setLeafTitle } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { ViewProps } from '../../pane-ui-system';
import { EmptyState, focusWhenReady } from '../../pane-ui-system';
import { modClickLabel } from '../../pane-ui-system/platform-keys';
import type { NodesApi } from '../../pane-ui-system/core/nodes/contracts/nodes';

export const RECORD_TAB_ID = 'collection.record';

/** 노드 타입 → 그 레코드의 열기 페이지를 그리는 함수. 행(ROW_TYPE)·목록 꾸러미 항목 타입이 올린다. */
const renderers = new Map<string, (host: PluginHost, id: string) => ReactNode>();
export function registerRecordTab(type: string, render: (host: PluginHost, id: string) => ReactNode): void {
    renderers.set(type, render);
}

/** 방금 「탭으로 열기」로 연 레코드 id — 그 탭이 그려지면 제목 칸으로 초점을 한 번 준다(새로고침 복원은 안 뺏는다) */
let focusOnOpen: string | null = null;
export function takeFocusOnOpen(id: string): boolean {
    if (focusOnOpen !== id) return false;
    focusOnOpen = null;
    return true;
}

/** 레코드 하나를 편집 탭으로 연다 — 제 탭이 없으면 레코드마다 「레코드」 탭 한 장(같은 레코드는 그 탭으로), 있으면 노드 열기로. 열었으면 true. */
export function openRecordTab(host: PluginHost, id: string, collectionId?: string): boolean {
    const nodes = host.modules.use<NodesApi>('nodes');
    const node = nodes?.get(id);
    if (!nodes || !node) return false;
    if (renderers.has(node.type)) {
        const params: Record<string, unknown> = collectionId ? { recordId: id, collectionId } : { recordId: id };
        focusOnOpen = id;
        const opened = host.workspace.open(RECORD_TAB_ID, { where: 'center', reuse: true, params, title: node.name }) != null;
        // 🔑 이미 열린 같은 레코드 탭을 재사용하면 RecordTab 이 새로 안 그려져 아래 효과가 안 돈다 — 여기서도 제목 칸으로 초점
        if (opened) focusWhenReady(':is(input,textarea)[aria-label="제목"]', false);
        return opened;
    }
    nodes.open(id);
    return true;
}

/** 「레코드」 탭 몸통 — 지금 연 레코드를 미리보기와 같은 열기 페이지로 그린다. */
export function RecordTab({ host, leaf }: ViewProps & { host: PluginHost }) {
    const id = typeof leaf?.params?.recordId === 'string' ? leaf.params.recordId : null;   // 🔑 탭이 저장한 레코드 id — 새로고침·배치 복원 뒤에도 같다
    const nodes = host.modules.use<NodesApi>('nodes');
    // 이름·아이콘·휴지통 여부가 바뀌면 다시 그린다(원시값 스냅샷 — 노드 객체가 새로 만들어져도 루프 없음)
    useSyncExternalStore(
        (fn) => { const d = nodes?.subscribe(fn); return () => d?.dispose(); },
        () => { const n = id ? nodes?.get(id) : undefined; return n ? `${n.name}\u0000${n.icon ?? ''}\u0000${nodes?.isTrashed(id!) ? 1 : 0}` : ''; },
    );
    const node = id ? nodes?.get(id) : undefined;
    const trashed = !!id && !!nodes?.isTrashed(id);
    const render = node ? renderers.get(node.type) : undefined;
    const leafId = leaf?.id;
    const bodyRef = useRef<HTMLDivElement>(null);
    const hasBody = !!(id && node && !trashed && render);
    useEffect(() => {   // 🔑 탭으로 열린 직후 — 제목 칸(없으면 첫 입력)으로 초점
        if (!id || !hasBody || !takeFocusOnOpen(id)) return;
        let n = 0;
        const t = window.setInterval(() => {
            const inputs = Array.from(bodyRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type=checkbox]), textarea') ?? []);
            const el = inputs.find((i) => /제목/.test(i.getAttribute('aria-label') ?? '')) ?? inputs[0];
            if (el) { el.focus({ preventScroll: true }); }
            if (el || ++n > 20) window.clearInterval(t);
        }, 50);
        return () => window.clearInterval(t);
    }, [id, hasBody]);
    useEffect(() => {
        if (!leafId) return;
        if (!node) { if (id) { setLeafTitle(leafId, '삭제된 레코드'); setLeafGlyph(leafId, undefined); } return; }   // 영구 삭제·비움 — 이전 이름을 안 남긴다
        setLeafTitle(leafId, trashed ? '삭제된 문서' : node.name || '제목 없음');
        setLeafGlyph(leafId, trashed ? undefined : node.icon);
    }, [leafId, id, !node, node?.name, node?.icon, trashed]);   // eslint-disable-line react-hooks/exhaustive-deps
    if (id && trashed) {
        return <EmptyState icon="fileText" title="삭제된 문서" description="이 레코드는 휴지통에 있습니다. 복원하면 다시 열립니다." />;
    }
    if (id && !node) {
        return <EmptyState icon="fileText" title="삭제된 레코드" description="이 레코드는 삭제되었습니다. 휴지통에도 없어 복원할 수 없습니다." />;
    }
    if (!id || !node || !render) {
        return <EmptyState icon="fileText" title="열린 레코드가 없습니다" description={`목록에서 줄을 ${modClickLabel()}하거나 미리보기의 「탭으로 열기」를 누르면 여기서 엽니다.`} />;
    }
    return <div ref={bodyRef} className="h-full overflow-auto p-4">{render(host, id)}</div>;
}
