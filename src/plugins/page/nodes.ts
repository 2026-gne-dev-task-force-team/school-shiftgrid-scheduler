/**
 * 페이지 ↔ 노드 시스템 다리 — 🔴 페이지 한 장도 노드다(저장·휴지통·복원은 노드 시스템이 쥔다).
 *   ⛔ host.store·persist·tree 를 직접 안 본다 — NodesApi 하나로만(import type 만 · 값은 host.modules.use('nodes')).
 */
import type { NodesApi, PublicNode, NodeTypeImplFns } from '../explorer/contracts/nodes';
import type { Disposable, MenuEntry, PluginHost, NodeTypeContribution } from '../../pane-ui-system/plugin';
import { uniqueName } from '../../pane-ui-system';
import type { Page } from './core/types';
import { emptyPage } from './core/types';
import { childBlockIds, syncChildBlocks } from './core/children';
import { setActivePage } from './store';
import { PageCard } from './views/PageCard';

export const PAGE_TYPE = 'page.page';

// 🔴 viewId 접두사 = 플러그인 id(host 가 'page.' 를 붙인다). 페이지를 열면 여는 편집 화면.
const EDITOR_ID = 'page.editor';

let api: NodesApi | null = null;
const subs = new Set<() => void>();
let rev = 0;   // 노드가 바뀔 때마다 는다 — 시작 화면 목록 useSyncExternalStore 의 스냅샷

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
    return [
        { label: '페이지 열기', icon: 'fileText', commandId: 'page.openPage', commandArg: { nodeId } },
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

/** 이 페이지 바로 밑 페이지들(트리 순서) — 본문의 「하위 페이지」 줄이 이것과 맞춰진다. */
export function childPageIds(id: string): string[] {
    return api?.children(id).filter((n) => n.type === PAGE_TYPE).map((n) => n.id) ?? [];
}

/** 화면에 보일 본문 — 저장된 본문을 트리와 맞춘 것(Q8: 자식 페이지 = 본문의 하위 페이지 줄). */
export function pageViewOf(id: string): Page {
    return syncChildBlocks(pageDataOf(id), childPageIds(id));
}

/**
 * 페이지 본문 저장 — 노드 공통 body 칸으로(저장·휴지통 주인은 노드 시스템).
 *   🔑 Q8: 화면이 보여 주던 하위 페이지 줄이 사라졌으면 그 페이지도 휴지통으로(노션 꼴 · 되살리면 줄도 돌아온다).
 *   한 묶음 = 되돌리기 한 칸. 줄 지우기를 되돌려 줄이 돌아오면 휴지통의 그 페이지도 이 페이지 밑으로 돌아온다.
 */
export function savePage(id: string, page: Page): void {
    if (!api) return;
    const a = api;
    const before = childBlockIds(pageViewOf(id));
    const after = new Set(childBlockIds(page));
    a.batch(() => {
        a.setBody(id, page);
        for (const c of before) if (!after.has(c) && a.parent(c) === id) a.remove(c);
        reviveChildren(id, page);
    });
}

/** 본문에 줄이 있는데 그 페이지가 (이 페이지에서 나가) 휴지통에 있으면 돌려 놓는다. */
export function reviveChildren(id: string, page: Page): void {
    if (!api) return;
    for (const c of childBlockIds(page)) {
        const n = api.get(c);
        if (n && n.trashedFrom === id && api.parent(c) === api.roots.trash) api.move(c, id);
    }
}

/** 휴지통 안(휴지통 자신·자손)인가 — 노드 시스템의 정식 판정(nodes.isTrashed). 달력·명단·컬렉션과 같은 창구. */
export function inTrash(id: string): boolean { return api?.isTrashed(id) ?? false; }

/**
 * R3-E 무한 끼움 막기 — nodeId 를 selfId(이 페이지) 본문에 펼치면 제자리를 도나: 자기 자신이거나 조상(부모 사슬)이면 참.
 *   🔴 페이지 펼침 미리보기는 안쪽 끼움을 다시 펼치지 않으니(PageCard) 고리는 이 둘에서만 생긴다.
 */
export function inlineBlocked(nodeId: string, selfId: string): boolean {
    if (nodeId === selfId) return true;
    if (!api) return false;
    const seen = new Set<string>();
    for (let p = api.parent(selfId); p && !seen.has(p); p = api.parent(p)) {
        if (p === nodeId) return true;
        seen.add(p);
    }
    return false;
}

/** 살아 있는 페이지 전부(트리 순서) — 시작 화면 목록. */
export function livePages(): PublicNode[] {
    if (!api) return [];
    return api.liveByType(PAGE_TYPE);
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

/** 슬래시 「하위 페이지」 — parentId 페이지 밑에 빈 페이지 하나를 만든다(본문 줄은 호출자가 그 id 로 놓는다). 못 만들면 null. */
export function createChildPage(parentId: string): string | null {
    if (!api) return null;
    const name = uniqueName('페이지', api.children(parentId).map((n) => n.name));
    return api.create(parentId, { type: PAGE_TYPE, name }) || null;
}

/** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 목록의 꼬리표. */
export function parentNameOf(id: string): string | null {
    if (!api) return null;
    const p = api.parent(id);
    if (!p || p === api.roots.main) return null;
    return api.get(p)?.name ?? null;
}
