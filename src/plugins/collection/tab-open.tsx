/**
 * 「탭으로 열기」 한 길(W13 · 쥔님 2026-11-10 *"레코드에서 탭으로 열기나, 이미 열려져있는 미리보기 창에서 탭으로 열기 같은게 필요할 듯해"*).
 *   레코드 = 속성이 붙은 문서 — 미리보기(peek)에 뜨던 그 RecordPage 를 가운데 탭 하나에 그대로 띄운다.
 *   🔴 열기 갈래:
 *     - 제 편집 탭이 있는 노드(사용자·역할 → 계정 편집 탭 · 페이지 → 페이지 편집 탭)는 노드 열기(nodes.open) 그대로.
 *     - 제 탭이 없는 레코드(컬렉션 행 · 목록 꾸러미 항목)는 여기 「레코드」 탭(collection.record · 싱글턴)이 그린다.
 *   ⭐ 두 갈래 다 싱글턴 편집 탭이라 이미 떠 있으면 새로 안 열고 그 탭으로 간다(page·account 와 같은 결 — 탭이 「지금 연 노드」를 따라간다).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { ViewProps } from '../../pane-ui-system';
import { EmptyState } from '../../pane-ui-system';
import type { NodesApi } from '../explorer/contracts/nodes';

export const RECORD_TAB_ID = 'collection.record';

/** 노드 타입 → 그 레코드의 열기 페이지를 그리는 함수. 행(ROW_TYPE)·목록 꾸러미 항목 타입이 올린다. */
const renderers = new Map<string, (host: PluginHost, id: string) => ReactNode>();
export function registerRecordTab(type: string, render: (host: PluginHost, id: string) => ReactNode): void {
    renderers.set(type, render);
}

let activeId: string | null = null;
const subs = new Set<() => void>();
const getActive = (): string | null => activeId;
const subscribe = (fn: () => void): (() => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
function setActive(id: string): void { activeId = id; for (const s of [...subs]) s(); }

/** 레코드 하나를 편집 탭으로 연다 — 제 탭이 없으면 「레코드」 탭에, 있으면 노드 열기로. 열었으면 true. */
export function openRecordTab(host: PluginHost, id: string): boolean {
    const nodes = host.modules.use<NodesApi>('nodes');
    const type = nodes?.get(id)?.type;
    if (!nodes || !type) return false;
    if (renderers.has(type)) {
        setActive(id);
        return host.workspace.open(RECORD_TAB_ID, { where: 'center' }) != null;
    }
    nodes.open(id);
    return true;
}

/** 「레코드」 탭 몸통 — 지금 연 레코드를 미리보기와 같은 열기 페이지로 그린다. */
export function RecordTab({ host }: ViewProps & { host: PluginHost }) {
    const id = useSyncExternalStore(subscribe, getActive, getActive);
    const nodes = host.modules.use<NodesApi>('nodes');
    const node = id ? nodes?.get(id) : undefined;
    const render = node ? renderers.get(node.type) : undefined;
    if (!id || !node || !render || nodes?.isTrashed(id)) {
        return <EmptyState icon="fileText" title="열린 레코드가 없습니다" description="목록에서 줄을 ⌘클릭하거나 미리보기의 「탭으로 열기」를 누르면 여기서 엽니다." />;
    }
    return <div className="h-full overflow-auto p-4">{render(host, id)}</div>;
}

/** 테스트용 — 지금 연 레코드 비우기(올린 그리기 함수는 그대로). */
export function resetRecordTabForTest(): void { activeId = null; }
