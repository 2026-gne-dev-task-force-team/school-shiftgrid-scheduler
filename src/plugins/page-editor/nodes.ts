/**
 * 페이지 ↔ 노드 시스템 다리 — 🔴 페이지 한 장도 노드다(저장·휴지통·복원은 노드 시스템이 쥔다).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 */
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import type { Page } from './core/types';
import { emptyPage } from './core/types';
import { setActivePage } from './store';

export const PAGE_TYPE = 'page-editor.page';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'page-editor.' 를 붙인다). 페이지를 열면 여는 편집 화면.
const EDITOR_ID = 'page-editor.editor';

let api: NodesApi | null = null;
const subs = new Set<() => void>();

let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

function notify(): void { for (const s of subs) s(); }

/**
 * 🔴 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름이 가리킨다.
 *   · page.open — 페이지를 열면 「보고 있는 페이지」를 그걸로 두고 편집 화면을 가운데에.
 */
export const pageNodeTypeImpl = {
    page: {
        open: (host: PluginHost, id: string) => { setActivePage(id); host.workspace.open(EDITOR_ID, { where: 'center' }); },
        menu: (_host: PluginHost, id: string) => pageMenu(id),
    } satisfies NodeTypeImplFns,
};

/** 노드 타입 하나 — 페이지(파일 역할 · 폴더·페이지 밑에 만들 수 있다). */
export const pageNodeTypes: NodeTypeContribution<'page'>[] = [
    {
        type: PAGE_TYPE, label: '페이지', icon: 'fileText',
        openable: true,
        create: { label: '페이지', under: ['folder', PAGE_TYPE] },
        container: { accepts: [PAGE_TYPE] },
        impl: 'page',
    },
];

export function pageMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '페이지 열기', icon: 'fileText', commandId: 'page-editor.openPage' },
    ];
}

/** 활성(index.ts)이 한 번 — NodesApi 를 쥐고 구독을 건다. */
export function initPageNodes(nodes: NodesApi | null): Disposable | null {
    api = nodes;
    notify();
    if (!nodes) return null;
    return nodes.subscribe(() => notify());
}

export function getNodesApi(): NodesApi | null { return api; }

export function subscribePageNodes(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }

/** 페이지 노드 하나 읽기(없으면 undefined). */
export function pageNodeOf(id: string): PublicNode | undefined {
    return api?.get(id);
}

/** 페이지 데이터 — 없으면 빈 페이지(결정적). */
export function pageDataOf(id: string): Page {
    const n = api?.get(id);
    const data = n?.data as Page | undefined;
    if (data && Array.isArray(data.blocks) && data.blocks.length > 0) return data;
    return emptyPage();
}

/** 페이지 데이터 저장 — 노드 data 로(저장·휴지통 주인은 노드 시스템). */
export function savePage(id: string, page: Page): void {
    api?.setData(id, page);
}
