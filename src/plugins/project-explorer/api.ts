/**
 * 공개 API — 다른 플러그인이 host.plugins.get<NodesApi>('project-explorer') 로 받는 표면 하나(설계 「공개 API」).
 *
 * 🔴 ⛔ purge·purgeAll·replaceTree 는 **없다** — 영구 삭제·나무 통째 교체는 사람이 탐색기 단추/N5 들여오기로만.
 *    다른 플러그인이 사람 자료를 영구히 지우거나 통째로 덮을 길을 두지 않는다(설계 「마지막 한 타는 사람이 친다」).
 * 🔴 ⛔ Tree 객체 자체를 안 내보낸다 — 노드는 「얼린 복사본」으로만 준다(남이 나무를 직접 못 만지게).
 *
 * ⭐ 호출자별 팩토리(makeNodesApi(callerId, track)) — host.plugins.get 이 호출자 id 와 track 을 넣어 부른다:
 *    ① types.register 는 `<callerId>.` 접두사를 강제(틀리면 콘솔 경고 + 빈 Disposable)
 *    ② setData 는 「그 타입을 등록한 플러그인(= 타입 접두사)만」을 호출자 id 로 가린다(🙋 3)
 *    ③ register·subscribe 가 낸 Disposable 을 track 으로 호출자 소유에 모아 둔다 — 호출자가 꺼지면 같이 회수.
 */
import type { Disposable } from '../../pane-ui-system/plugin';
import type { Node } from './model/tree';
import { parentOf } from './model/tree';
import type { NodeTypeDef } from './model/types';
import { registerType } from './model/types';
import {
    getState, select as selectNode, apiCreate, apiRename, apiMove, apiRemove, apiSetData,
    apiInvalidate, openById, subscribeChanges,
} from './store';

export type { NodeTypeDef, VirtualNode, CreateSpec } from './model/types';
export type { Node } from './model/tree';

/** 공개 노드 — 「얼린 복사본」. children 도 새 배열이라 남이 나무를 못 만진다. */
export type PublicNode = Readonly<Node>;

/** 다른 플러그인이 받는 노드 시스템 표면. 🔴 version 을 처음부터(갈아끼울 데: 버전 달린 표면으로 큰다). */
export interface NodesApi {
    version: 1;
    /** 타입 등록 — `<pluginId>.` 접두사 강제. 꺼지면 아이콘·열기·메뉴만 빠지고 노드는 남는다. */
    types: { register(def: NodeTypeDef): Disposable };

    // ── 읽기(전부 얼린 복사본) ──
    get(id: string): PublicNode | undefined;
    children(id: string): PublicNode[];
    parent(id: string): string | null;
    path(id: string): string[];                         // 루트 밑 첫 조상 → id (루트 sentinel 제외)
    find(pred: (n: PublicNode) => boolean): PublicNode[];
    byType(type: string): PublicNode[];

    // ── 쓰기 ──
    create(parentId: string, spec: { type: string; name: string; data?: unknown; index?: number }): string;
    rename(id: string, name: string): void;
    setData(id: string, data: unknown): void;           // 🔴 그 타입을 등록한 플러그인만
    move(id: string, parentId: string, index?: number): void;
    remove(id: string): void;                           // 🔴 휴지통으로(영구 아님)

    invalidate(id: string): void;                       // 유도 자식 다시 계산
    select(id: string): void;                           // 탐색기에서 그 노드로 가기
    open(id: string): void;                             // 그 타입의 open 실행

    subscribe(fn: (changedIds: string[]) => void): Disposable;
    roots: { main: string; trash: string };
}

const freeze = (n: Node): PublicNode => Object.freeze({ ...n, children: Object.freeze([...n.children]) }) as PublicNode;

/** root·trash sentinel 을 뺀, 셀 수 있는 실노드들. find/byType 의 바탕. */
function realNodes(): Node[] {
    const t = getState().tree;
    return Object.values(t.nodes).filter((n) => n.id !== t.root && n.id !== t.trash);
}

/**
 * 호출자별 NodesApi 하나를 짓는다.
 *   callerId — host.plugins.get 을 부른 플러그인 id(접두사·주인 검사의 기준). 모르면 1차는 접두사 검사만.
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

        subscribe(fn) { return keep({ dispose: subscribeChanges(fn) }); },
        get roots() { const t = getState().tree; return { main: t.root, trash: t.trash }; },
    };
}
