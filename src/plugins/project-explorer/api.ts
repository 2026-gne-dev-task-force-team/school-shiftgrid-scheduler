/**
 * 공개 API — 「nodes」 인터페이스를 채우는 모듈. 다른 플러그인이 host.modules.use<NodesApi>('nodes') 로 받는다.
 *
 * 🔴 ⛔ purge·purgeAll·replaceTree 는 **없다** — 영구 삭제·나무 통째 교체는 사람이 탐색기 단추/N5 들여오기로만.
 *    다른 플러그인이 사람 자료를 영구히 지우거나 통째로 덮을 길을 두지 않는다(설계 「마지막 한 타는 사람이 친다」).
 * 🔴 ⛔ Tree 객체 자체를 안 내보낸다 — 노드는 「얼린 복사본」으로만 준다(남이 나무를 직접 못 만지게).
 *
 * ⭐ 호출자별 팩토리(makeNodesApi(callerId, track)) — host.modules.use 가 호출자 id 와 scope track 을 넣어 부른다:
 *    ① types.register 는 `<callerId>.` 접두사를 강제(틀리면 콘솔 경고 + 빈 Disposable)
 *    ② setData 는 「그 타입을 등록한 플러그인(= 타입 접두사)만」을 호출자 id 로 가린다(🙋 3)
 *    ③ register·subscribe 가 낸 Disposable 을 track 으로 호출자 소유에 모아 둔다 — 호출자가 꺼지면 같이 회수.
 */
import type {
    Disposable, PluginHost, PluginImpl, NodeTypeContribution,
} from '../../pane-ui-system/plugin';
import type { Node } from './model/tree';
import { parentOf } from './model/tree';
import type { NodeTypeDef } from './model/types';
import { registerType } from './model/types';
import {
    getState, select as selectNode, apiCreate, apiRename, apiMove, apiRemove, apiSetData,
    apiInvalidate, openById, subscribeChanges, startInput,
} from './store';

// 🔴 공개 노드 약속(NodesApi·PublicNode·NodeTypeImplFns)은 이 꾸러미의 contracts/nodes 가 쥔다 — 이 파일은 그걸 **구현**한다(makeNodesApi).
//    ⭐ 재export 는 이 폴더·이 플러그인이 그대로 쓰던 길을 안 깨려는 것(index·테스트가 './api' 로 받는다). 타입 정의는 ./contracts/nodes.
import type { NodesApi, PublicNode, NodeTypeImplFns } from './contracts/nodes';
export type { NodeTypeDef, VirtualNode, CreateSpec, Node } from './contracts/nodes';
export type { NodesApi, PublicNode, NodeTypeImplFns } from './contracts/nodes';

const freeze = (n: Node): PublicNode => Object.freeze({ ...n, children: Object.freeze([...n.children]) }) as PublicNode;

/** root·trash sentinel 을 뺀, 셀 수 있는 실노드들. find/byType 의 바탕. */
function realNodes(): Node[] {
    const t = getState().tree;
    return Object.values(t.nodes).filter((n) => n.id !== t.root && n.id !== t.trash);
}

/**
 * 호출자별 NodesApi 하나를 짓는다.
 *   callerId — host.modules.use 를 부른 플러그인 id(접두사·주인 검사의 기준). 모르면 1차는 접두사 검사만.
 *   track — 호출자 소유로 Disposable 을 모아 두는 함수(호출자가 꺼지면 같이 회수). 없으면 안 모은다.
 */
export function makeNodesApi(callerId?: string, track?: (d: Disposable) => Disposable): NodesApi {
    const keep = (d: Disposable): Disposable => (track ? track(d) : d);

    return {
        version: 1,

        types: {
            register(def: NodeTypeDef): Disposable {
                // 🔴 `<caller>.` 접두사 강제 — 틀리면 throw 가 아니라 콘솔 경고 + 빈 Disposable(설계).
                const prefix = callerId ? `${callerId}.` : null;
                const ok = prefix
                    ? def.type.startsWith(prefix)
                    : /^[a-z0-9-]+\.[^.]/.test(def.type);   // 호출자를 모르면 「접두사 꼴」만 본다
                if (!ok) {
                    console.warn(`[project-explorer] 타입 "${def.type}" 는 접두사 "${prefix ?? '<pluginId>.'}" 로 시작해야 한다 — 등록 거부`);
                    return { dispose() { /* 빈 것 */ } };
                }
                return keep(registerType(def));
            },
        },

        registerContributed(item: NodeTypeContribution, impl: PluginImpl, host: PluginHost): Disposable {
            const fns = (item.impl ? impl.nodeTypes?.[item.impl] : undefined) as NodeTypeImplFns | undefined;
            const def: NodeTypeDef = {
                type: item.type,
                label: item.label,
                icon: fns?.icon ?? item.icon ?? 'file',   // 함수 아이콘(impl) → 데이터 아이콘 → 기본 'file'
                container: item.container,
                openable: item.openable,
                open: fns?.open ? (id) => fns.open!(host, id) : undefined,
                derive: fns?.derive,
                create: item.create
                    ? { ...item.create, init: fns?.createInit ? (pid) => fns.createInit!(host, pid) : undefined }
                    : undefined,
                menu: fns?.menu ? (id) => fns.menu!(host, id) : undefined,
                // 🔑 조작 가능 여부 — 함수 꼴(impl.can)이 있으면 그걸(노드·상황에 따라), 없으면 매니페스트의 고정 객체(item.can).
                can: fns?.can ?? item.can,
                canCreate: fns?.canCreate,          // 🔑 「만들기」 가림 — 함수뿐이라 impl 에서만 온다(매니페스트엔 함수 못 넣음)
                confirmDelete: fns?.confirmDelete,  // 🔑 지울 때 경고(함수 꼴) — impl 에서
                hidden: fns?.hidden,                // 🔑 조건부 숨김 — impl 에서
                unique: item.unique,
                slots: item.slots,
                record: item.record,
                createInput: item.createInput,      // 🔑 만들 때 인라인 입력(순수 데이터) — 커밋은 onInput(kind:'create')
                onInput: fns?.onInput ? (id, kind, val) => fns.onInput!(host, id, kind, val) : undefined,
            };
            // 🔴 선언형 노드 타입은 raw registerType — 접두사 검사를 안 탄다. 내장 'folder' 는 접두사 없는 예외고,
            //    선언형 기여는 in-tree·tsc 검사된 1차 자료라 런타임 types.register 의 접두사 가드가 불필요하다.
            //    (런타임 동적 등록은 여전히 types.register 가 접두사를 강제한다 — 창구가 다르다.)
            return keep(registerType(def));
        },

        get(id) { const n = getState().tree.nodes[id]; return n ? freeze(n) : undefined; },
        children(id) {
            const t = getState().tree;
            const n = t.nodes[id];
            if (!n) return [];
            return n.children.map((c) => t.nodes[c]).filter((c): c is Node => !!c).map(freeze);
        },
        parent(id) { return parentOf(getState().tree, id); },
        path(id) {
            const t = getState().tree;
            if (!t.nodes[id]) return [];
            const out: string[] = [];
            let cur: string | null = id;
            while (cur && cur !== t.root && cur !== t.trash) { out.unshift(cur); cur = parentOf(t, cur); }
            return out;
        },
        find(pred) { return realNodes().map(freeze).filter(pred); },
        byType(type) { return realNodes().filter((n) => n.type === type).map(freeze); },

        create(parentId, spec) { return apiCreate(parentId, spec); },
        rename(id, name) { apiRename(id, name); },
        setData(id, data) {
            const n = getState().tree.nodes[id];
            if (!n) return;
            // 🔴 주인 검사 — 그 노드의 타입 접두사(= 등록한 플러그인)와 호출자가 같아야 쓴다.
            const owner = n.type.includes('.') ? n.type.slice(0, n.type.indexOf('.')) : null;
            if (!owner) {
                console.warn(`[project-explorer] setData 거부 — 타입 "${n.type}" 에 주인(접두사)이 없다(내장 노드엔 data 를 안 쓴다)`);
                return;
            }
            if (callerId && owner !== callerId) {
                console.warn(`[project-explorer] setData 거부 — "${n.type}" 의 주인은 "${owner}", 호출자는 "${callerId}"`);
                return;
            }
            apiSetData(id, data);
        },
        move(id, parentId, index) { apiMove(id, parentId, index); },
        remove(id) { apiRemove(id); },

        invalidate(id) { apiInvalidate(id); },
        select(id) { selectNode(id); },
        open(id) { selectNode(id); openById(id); },
        promptInput(id, opts) { startInput(id, opts.kind, opts.initial ?? '', opts.placeholder ?? null); },

        subscribe(fn) { return keep({ dispose: subscribeChanges(fn) }); },
        get roots() { const t = getState().tree; return { main: t.root, trash: t.trash }; },
    };
}
