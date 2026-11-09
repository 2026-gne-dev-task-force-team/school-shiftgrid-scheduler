/**
 * 페이지 ↔ 노드 시스템 다리 — 🔴 페이지 한 장도 노드다(저장·휴지통·복원은 노드 시스템이 쥔다).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 */
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../explorer/contracts/nodes';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { uniqueName } from '../../pane-ui-system';
import type { Page } from './core/types';
import { emptyPage } from './core/types';
import { setActivePage } from './store';
import { PageCard } from './views/PageCard';

export const PAGE_TYPE = 'page.page';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'page.' 를 붙인다). 페이지를 열면 여는 편집 화면.
const EDITOR_ID = 'page.editor';

let api: NodesApi | null = null;
const subs = new Set<() => void>();
let rev = 0;   // 노드가 바뀔 때마다 는다 — 시작 화면 목록 useSyncExternalStore 의 스냅샷

let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

function notify(): void { rev++; for (const s of subs) s(); }
export function getPageRev(): number { return rev; }

/**
 * 🔴 노드 타입 함수 묶음(선언형) — contributes.nodeTypes 의 impl 이름이 가리킨다.
 *   · page.open — 페이지를 열면 「보고 있는 페이지」를 그걸로 두고 편집 화면을 가운데에.
 */
export const pageNodeTypeImpl = {
    page: {
        open: (host: PluginHost, id: string) => { setActivePage(id); host.workspace.open(EDITOR_ID, { where: 'center' }); },
        menu: (_host: PluginHost, id: string) => pageMenu(id),
        embed: PageCard,
    } satisfies NodeTypeImplFns,
};

/** 노드 타입 하나 — 페이지(파일 역할 · 폴더·페이지 밑에 만들 수 있다). */
export const pageNodeTypes: NodeTypeContribution<'page'>[] = [
    {
        type: PAGE_TYPE, body: 'doc', label: '페이지', icon: 'fileText',
        openable: true,
        create: { label: '페이지', under: ['folder', PAGE_TYPE] },
        container: { accepts: [PAGE_TYPE] },
        impl: 'page',
    },
];

export function pageMenu(nodeId: string): MenuEntry[] {
    setMenuTarget(nodeId);
    return [
        { label: '페이지 열기', icon: 'fileText', commandId: 'page.openPage' },
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
    const body = api?.get(id)?.body as Page | undefined;
    if (body && Array.isArray(body.blocks) && body.blocks.length > 0) return body;
    return emptyPage();
}

/** 페이지 본문 저장 — 노드 공통 body 칸으로(저장·휴지통 주인은 노드 시스템). */
export function savePage(id: string, page: Page): void {
    api?.setBody(id, page);
}

/** 조상에 휴지통이 있나 — 부모 사슬을 직접 탄다(달력·명단과 같은 규칙). */
export function inTrash(id: string): boolean {
    if (!api) return false;
    let cur: string | null = api.parent(id);
    let guard = 0;
    while (cur && guard < 1000) {
        if (cur === api.roots.trash) return true;
        if (cur === api.roots.main) return false;
        cur = api.parent(cur);
        guard++;
    }
    return false;
}

/** 살아 있는 페이지 전부(트리 순서) — 시작 화면 목록. */
export function livePages(): PublicNode[] {
    if (!api) return [];
    return api.byType(PAGE_TYPE).filter((n) => !inTrash(n.id));
}

/**
 * 시작 화면 「새 페이지」 — 탐색기 맨 위(main 루트)에 빈 페이지 하나를 만든다. 이름 겹치면 「페이지 2」…
 *   데이터는 비워 둔다(pageDataOf 가 빈 페이지를 깐다 — 탐색기 「새로 만들기」와 같은 결). 새 id 를 돌려준다(못 만들면 null).
 */
export function createPage(): string | null {
    if (!api) return null;
    const name = uniqueName('페이지', api.byType(PAGE_TYPE).map((n) => n.name));
    return api.create(api.roots.main, { type: PAGE_TYPE, name }) || null;
}

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}
