/**
 * 컬렉션 바닥(P4a) — 「목록 노드 + 그 안의 레코드 노드」 한 벌을 설정 한 장(CollectionConfig)으로 만든다.
 *   목록 꾸러미들이 이 한 벌을 각자 복사해 짜던 것을 여기로 모았다. 특화 기능은 설정의 칸 정의(baseFields)와 tree 뿐이다.
 *   🔴 저장·휴지통·복원·되돌리기는 노드 시스템이 한다 — ⛔ host.store·persist·tree 를 직접 안 본다. NodesApi 하나로만(import type 만).
 *   🔴 값은 항목 노드 `data.values`(칸 key → 값) 하나로 둔다 · 제목 칸은 노드 이름 · tree 면 `data.parentId` · `data.ext` 는 위층 자리(안 건드림).
 *   🔴 목록 노드의 사용자 칸 정의는 `data.fields`.
 *   ⭐ 이 파일은 React 를 안 안다(화면은 views/CollectionTab·ItemProps) — 다만 Tab·Props 를 kit 에 붙이려 createElement 로 잇는다.
 */
import { createElement } from 'react';
import type { NodesApi, PublicNode } from '../../pane-ui-system/core/nodes/contracts/nodes';
import type { Disposable, PluginHost, PeekHandle, PropertiesPaneProps } from '../../pane-ui-system/plugin';
import { uniqueName } from '../../pane-ui-system';
import type { CollectionConfig, CollectionItem, CollectionKit, RecordCellValue, RecordField } from './contracts/collection';
import { effectiveParentId, wouldCycle } from './tree';
import { parseRows } from './parse';
import { CollectionTab } from './views/CollectionTab';
import { ItemProps, ItemPeek } from './views/ItemProps';
import { registerRecordTab } from './tab-open';
import { registerListType } from './nodes';

/** 뷰가 읽는 손잡이 — kit 에 구독·보고 있는 목록·부모 이름이 더 붙는다(밖으로는 안 나간다). */
export interface Bridge extends Omit<CollectionKit, 'Tab' | 'Props'> {
    /** useSyncExternalStore 용 — 노드가 바뀌거나 보고 있는 목록이 바뀔 때만 rev 가 오른다 */
    subscribe(fn: () => void): () => void;
    rev(): number;
    /** 노드가 든 폴더 이름(맨 위면 null) — 시작 화면 꼬리표·인스펙터 「목록」 칸 */
    parentNameOf(id: string): string | null;
}

const isEmpty = (v: unknown): boolean => v == null || v === '' || (Array.isArray(v) && v.length === 0);

export function defineCollection(cfg: CollectionConfig): CollectionKit {
    registerListType(cfg.listType, cfg.listLabel);
    const titleKey = cfg.baseFields[0].key;
    const baseKeys = cfg.baseFields.map((f) => f.key);
    let api: NodesApi | null = null;
    let listNodes: PublicNode[] = [];
    let activeId: string | null = null;
    let rev = 0;
    const subs = new Set<() => void>();

    const bump = (): void => { rev++; for (const s of subs) s(); };
    const recompute = (): void => {
        listNodes = api ? api.byType(cfg.listType) : [];
        bump();
    };

    const inTrash = (id: string): boolean => api?.isTrashed(id) ?? false;

    const dataOf = (id: string): Record<string, unknown> => (api?.get(id)?.data ?? {}) as Record<string, unknown>;

    const toItem = (n: PublicNode): CollectionItem => {
        const d = (n.data ?? {}) as { values?: unknown; parentId?: unknown; ext?: unknown };
        const item: CollectionItem = {
            id: n.id,
            listId: api?.parent(n.id) ?? '',
            name: n.name,
            values: d.values && typeof d.values === 'object' ? { ...(d.values as Record<string, RecordCellValue>) } : {},
        };
        if (cfg.tree && typeof d.parentId === 'string' && d.parentId !== '') item.parentId = d.parentId;
        if (d.ext && typeof d.ext === 'object') item.ext = d.ext as Record<string, unknown>;
        return item;
    };

    const itemsIn = (listId: string): CollectionItem[] => {
        if (!api) return [];
        return api.children(listId).filter((n) => n.type === cfg.itemType && !inTrash(n.id)).map(toItem);
    };

    const cleanValues = (values: Record<string, RecordCellValue>): Record<string, RecordCellValue> => {
        const out: Record<string, RecordCellValue> = {};
        for (const [k, raw] of Object.entries(values)) {
            const v = typeof raw === 'string' ? raw.trim() : raw;
            if (!isEmpty(v)) out[k] = v;
        }
        return out;
    };

    const kit: Bridge = {
        config: cfg,
        subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
        rev: () => rev,
        active: () => activeId,
        setActive: (id) => { if (activeId === id) return; activeId = id; bump(); },

        init(nodes) {
            api = nodes;
            recompute();
            if (!nodes) return null;
            return nodes.subscribe(() => recompute());
        },
        nodes: () => api,
        onChange(fn): Disposable {
            const off = kit.subscribe(fn);
            return { dispose: off };
        },

        // ── 읽기 ──
        lists: () => listNodes.filter((n) => !inTrash(n.id)).map((n) => ({ id: n.id, name: n.name })),
        itemsIn,
        itemOf: (id) => { const n = api?.get(id); return n && n.type === cfg.itemType ? toItem(n) : undefined; },
        inTrash,
        parentNameOf(id) {
            if (!api) return null;
            const p = api.parent(id);
            if (!p || p === api.roots.main) return null;
            return api.get(p)?.name ?? null;
        },

        // ── 쓰기 ──
        createList() {
            if (!api) return null;
            const seed = cfg.newListFields?.();
            return api.create(api.roots.main, { type: cfg.listType, name: uniqueName(cfg.listLabel, listNodes.map((n) => n.name)), ...(seed ? { data: { fields: seed } } : {}) }) || null;
        },
        addItem(listId, values = {}) {
            if (!api) return '';
            const { [titleKey]: title, ...rest } = values;
            const vals = cleanValues(rest);
            return api.create(listId, {
                type: cfg.itemType,
                name: String(title ?? '').trim(),
                data: Object.keys(vals).length > 0 ? { values: vals } : {},
            });
        },
        setValue(id, key, value) {
            if (!api || api.get(id)?.type !== cfg.itemType) return;
            if (key === titleKey) { api.rename(id, String(value ?? '').trim()); return; }
            const cur = dataOf(id);
            const values = { ...((cur.values ?? {}) as Record<string, RecordCellValue>) };
            const v = typeof value === 'string' ? value.trim() : value;
            if (isEmpty(v)) delete values[key]; else values[key] = v;
            api.setData(id, { ...cur, values });
        },
        removeItem: (id) => { api?.remove(id); },
        moveItem: (id, listId, index) => { api?.move(id, listId, index); },
        reorderItem(id, beforeId) {
            if (!api || id === beforeId) return;
            const a = api;
            const listId = a.parent(id);
            if (!listId) return;
            a.batch(() => {
                if (cfg.tree) kit.setParent(id, beforeId ? effectiveParentId(itemsIn(listId), beforeId) : null);
                // move 는 id 를 뺀 배열 기준 index 에 꽂는다 — beforeId 의 자리가 곧 「그 앞」. 맨 끝이면 index 없이.
                const rest = a.children(listId).filter((c) => c.id !== id);
                const at = beforeId ? rest.findIndex((c) => c.id === beforeId) : -1;
                a.move(id, listId, at < 0 ? undefined : at);
            });
        },
        pasteItems(listId, text) {
            const ids: string[] = [];
            const a = api;
            if (!a) return ids;
            a.batch(() => {
                for (const row of parseRows(text, baseKeys)) {
                    const id = kit.addItem(listId, row);
                    if (id) ids.push(id);
                }
            });
            return ids;
        },
        userFieldsOf(listId) {
            const d = dataOf(listId) as { fields?: unknown };
            return Array.isArray(d.fields) ? (d.fields as RecordField[]) : [];
        },
        setUserFields(listId, fields) {
            api?.setData(listId, { ...dataOf(listId), fields });
        },

        // ── tree(방 안에 방) — 설정에 tree 가 없으면 전부 아무 일 없음 ──
        setParent(id, parentId) {
            if (!api || !cfg.tree) return;
            const node = api.get(id);
            if (!node || node.type !== cfg.itemType) return;
            const listId = api.parent(id);
            if (!listId) return;
            if (parentId) {
                const pn = api.get(parentId);
                if (!pn || pn.type !== cfg.itemType || api.parent(parentId) !== listId) return;   // 같은 목록의 항목만
                if (wouldCycle(itemsIn(listId), id, parentId)) return;                              // 순환 막기
            }
            const next = { ...dataOf(id) };
            if (parentId) next.parentId = parentId; else delete next.parentId;
            api.setData(id, next);
        },
        indent(id) {
            // 바로 앞 형제를 부모로 — 맨 앞 형제면 들여쓸 대상이 없어 무시
            if (!api || !cfg.tree) return;
            const listId = api.parent(id);
            if (!listId) return;
            const items = itemsIn(listId);
            const eff = effectiveParentId(items, id);
            const sibs = items.filter((r) => effectiveParentId(items, r.id) === eff);
            const at = sibs.findIndex((r) => r.id === id);
            if (at > 0) kit.setParent(id, sibs[at - 1].id);
        },
        outdent(id) {
            // 부모의 부모로 — 최상위면 무시
            if (!api || !cfg.tree) return;
            const listId = api.parent(id);
            if (!listId) return;
            const items = itemsIn(listId);
            const eff = effectiveParentId(items, id);
            if (eff) kit.setParent(id, effectiveParentId(items, eff));
        },

        // ── 노드 타입 함수 · 화면 ──
        open(host: PluginHost, listId) {
            kit.setActive(listId);
            host.workspace.open(cfg.viewId, { where: 'center' });
        },
        menu(listId) {
            // 🔴 대상은 항목이 싣는다(CommandContext.nodeId) — 전역 menuTarget 없음
            return [{ label: `${cfg.listLabel} 열기`, icon: cfg.listIcon, commandId: cfg.openCommandId, commandArg: { nodeId: listId } }];
        },
        openList(listId) { if (listId) api?.open(listId); },
    };

    // 「탭으로 열기」 — 항목은 제 편집 탭이 없으니 레코드 탭이 미리보기와 같은 열기 페이지(ItemPeek)로 그린다
    registerRecordTab(cfg.itemType, (host, id) => createElement(ItemPeek, { kit, host, id }));

    // 화면 — 컴포넌트 정체는 kit 마다 한 번(렌더마다 새로 만들면 React 가 매번 갈아 끼운다)
    return Object.assign(kit, {
        Tab: (props: { host?: PluginHost; peek?: PeekHandle; leafId?: string }) => createElement(CollectionTab, { kit, ...props }),
        Props: (props: PropertiesPaneProps) => createElement(ItemProps, { kit, ...props }),
    }) as CollectionKit;
}
