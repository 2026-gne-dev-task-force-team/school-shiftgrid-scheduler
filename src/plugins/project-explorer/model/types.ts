/**
 * 노드 타입 등록소 — 플러그인이 「나는 이런 노드를 만든다」고 꽂는 표(설계 「노드 타입 규격」).
 *
 * ⭐ 이 플러그인은 「무엇」을 모르고 「역할」만 안다 — 탐색기는 이 표만 읽는다(시간표·교사라는 낱말은 여기 없다).
 *    N1 에서 실제로 쓰는 칸은 label·icon·container·can 넷 · 나머지(openable·open·derive·create·menu)는
 *    규격만 세워 둔 자리다(설계: *"나머지는 자리만"* — N4 에서 소비 플러그인이 채운다).
 *
 * 🔴 모듈 전역 Map 이다(등록은 본래 부수효과 — view-registry 와 같은 결). registerType 은 Disposable 을 돌려준다:
 *    그 타입을 등록한 플러그인이 꺼지면 아이콘·열기·메뉴만 빠지고 노드는 남는다(모르는 타입 = 회색 글자 + file 아이콘).
 */
import type { IconName } from '../../../pane-ui-system/plugin';
import type { MenuEntry, Disposable } from '../../../pane-ui-system/plugin';
import type { Node } from './tree';

/** 유도 트리(derive)가 돌려주는 가짜 자식 — N1 자리만(🔴 Tree.nodes 에 안 들어간다). */
export interface VirtualNode {
    key: string;
    type: string;
    name: string;
}

/** 우클릭 「새로 만들기 ▸」 한 칸 규격 — N1 자리만(자동 메뉴 조립은 N2). */
export interface CreateSpec {
    label: string;
    under?: string[];
    init?: (parentId: string) => Partial<Node>;
}

/** 노드 타입 한 벌 — 플러그인이 register 로 꽂는다. */
export interface NodeTypeDef {
    /** 🔴 `<pluginId>.` 접두사 강제(viewId 와 같은 규칙) — 내장 'folder' 만 접두사 없는 예외. */
    type: string;
    label: string;
    icon: IconName | ((node: Node) => IconName);
    /** 폴더 역할 — 자식을 받나(true), 어떤 타입만 받나({ accepts }). */
    container?: boolean | { accepts: string[] };
    /** ── 아래는 N1 자리만(규격 선언), 실제 소비는 N4 ── */
    openable?: boolean;
    open?: (nodeId: string) => void;
    derive?: (node: Node) => VirtualNode[];
    create?: CreateSpec;
    menu?: (nodeId: string) => MenuEntry[];
    /** 기본 전부 true. */
    can?: { rename?: boolean; move?: boolean; delete?: boolean };
}

const registry = new Map<string, NodeTypeDef>();

/** 타입을 꽂는다 — 같은 type 재등록은 덮어쓴다. dispose 는 「그 등록이 아직 그대로일 때만」 거둔다. */
export function registerType(def: NodeTypeDef): Disposable {
    registry.set(def.type, def);
    return {
        dispose() {
            if (registry.get(def.type) === def) registry.delete(def.type);
        },
    };
}

export function getType(type: string): NodeTypeDef | undefined {
    return registry.get(type);
}

/** 컨테이너(폴더 역할)인가 — 모르는 타입은 컨테이너 아님(파일처럼 그린다). */
export function isContainerType(type: string): boolean {
    return !!registry.get(type)?.container;
}

/** 이 노드에 그릴 아이콘 — 등록 안 된 타입은 'file'(회색 글자로 그리는 건 뷰 몫). */
export function iconOf(node: Node): IconName {
    const def = registry.get(node.type);
    if (!def) return 'file';
    return typeof def.icon === 'function' ? def.icon(node) : def.icon;
}

/** 등록된 타입인가 — 뷰가 「모르는 타입(회색 글자)」을 가릴 때 쓴다. */
export function isKnownType(type: string): boolean {
    return registry.has(type);
}

/** 테스트·앱 재마운트에서 목록을 비운다(view-registry.clearViews 와 같은 결). */
export function clearTypes(): void {
    registry.clear();
}
