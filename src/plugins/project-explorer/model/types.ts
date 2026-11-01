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

/**
 * 유도 트리(derive)가 돌려주는 가짜 자식 — 🔴 Tree.nodes 에 안 들어간다(저장 안 됨).
 *   id 는 뷰가 `<부모id>/<key>` 꼴로 짓는다 — `/` 가 「가상」 표식이라 move·remove 가 거부한다.
 */
export interface VirtualNode {
    key: string;                 // 부모 안에서 안정한 키(= id 꼬리)
    name: string;                // 탐색기에 보이는 이름
    icon?: IconName;             // 없으면 뷰가 기본 아이콘
    type?: string;               // 등록된 타입이면 열기·메뉴가 그 타입에서 온다
    openable?: boolean;          // 두 번 누르기·Enter 로 열리나(type.open 을 탄다)
    children?: VirtualNode[];    // 중첩 유도(1차는 항상 펼쳐 그린다)
}

/** 우클릭 「새로 만들기 ▸」 한 칸 규격 — 부모가 받고(accepts) 이 타입이 under 를 허용할 때 후보가 된다. */
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
    /** 파일 역할 — 두 번 누르기·Enter 로 열리나. */
    openable?: boolean;
    /** 열면 뭐가 되나(보통 host.workspace.open 한 줄). */
    open?: (nodeId: string) => void;
    /** 🔑 유도 트리 — 자식을 저장소가 아니라 이 함수가 만든다(저장 안 됨 · 이름 못 바꿈 · 못 끔). */
    derive?: (node: Node) => VirtualNode[];
    create?: CreateSpec;
    menu?: (nodeId: string) => MenuEntry[];
    /** 기본 전부 true. */
    can?: { rename?: boolean; move?: boolean; delete?: boolean };
    /**
     * 🔑 레코드성 — 이 타입의 노드는 탐색기에 「어떤 경우에도」 안 보인다(본 나무·검색·휴지통 어디서도).
     *   저장·삭제·휴지통·복원·되돌리기는 일반 노드와 완전히 같다(캐스케이딩이 공짜) — 보여주는 건 그 타입의 플러그인 몫.
     *   예: 달력의 'calendar.event'(일정). 🔴 탐색기는 이 칸을 콜백(isRecordType)으로만 묻는다 — 타입 낱말은 모른다.
     */
    record?: boolean;
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

/** 레코드성 타입인가 — 탐색기가 「어떤 경우에도 안 보일 노드」를 가릴 때 flatten·buildMainRows 에 콜백으로 준다. */
export function isRecordType(type: string): boolean {
    return registry.get(type)?.record === true;
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

/**
 * 이 부모 타입이 이 자식 타입을 받나 — 드래그·이동의 accepts 판정 한 곳(model/tree.move 에 주입된다).
 *   - 컨테이너가 아니면 안 받는다 · container === true 면 전부 · { accepts } 면 그 목록만.
 *   🔴 모르는 타입(등록 안 됨)은 컨테이너가 아니라고 본다 — 자식을 못 받는다.
 */
export function acceptsChild(parentType: string, childType: string): boolean {
    const c = registry.get(parentType)?.container;
    if (!c) return false;
    if (c === true) return true;
    return c.accepts.includes(childType);
}

/**
 * 우클릭 「새로 만들기 ▸」 후보 — 설계 그대로 표를 돈다(⛔ 타입 이름 비교 없음):
 *   부모 타입이 받는 것(accepts) ∩ 그 타입이 create.under 로 허용하는 부모. create 없는 타입은 후보 아님.
 *   🔴 지금은 「폴더」 하나뿐이지만 코드는 등록 표 전체를 돈다 — N4 에서 타입이 늘면 저절로 채워진다.
 */
export function createCandidates(parentType: string): NodeTypeDef[] {
    const out: NodeTypeDef[] = [];
    for (const def of registry.values()) {
        if (!def.create) continue;
        if (!acceptsChild(parentType, def.type)) continue;          // 부모가 이 타입을 받나
        const under = def.create.under;
        if (under && !under.includes(parentType)) continue;         // 이 타입이 이 부모 밑을 허용하나
        out.push(def);
    }
    return out;
}

/** 그 타입이 꽂은 줄 메뉴 항목(menu?(nodeId)) — 없으면 빈 배열. 뷰가 구분선 뒤에 붙인다. */
export function typeMenu(node: Node, nodeId: string): MenuEntry[] {
    return typeMenuByType(node.type, nodeId);
}

/** 타입 이름으로 줄 메뉴 항목 — 유도(가상) 줄은 Node 가 없으니 type 문자열로 묻는다. */
export function typeMenuByType(type: string, nodeId: string): MenuEntry[] {
    const fn = registry.get(type)?.menu;
    if (!fn) return [];
    try { return fn(nodeId); } catch { return []; }
}

/** 그 타입이 열 수 있나 + open 핸들러가 있나 — 유도 줄 열기 판정. */
export function canOpenType(type: string): boolean {
    const def = registry.get(type);
    return !!def?.openable && typeof def.open === 'function';
}

/** 그 타입의 open 을 실행(없으면 아무 일 없음) — 유도 줄·실노드 공통 열기 경로. */
export function openType(type: string, nodeId: string): void {
    const def = registry.get(type);
    if (def?.openable && def.open) def.open(nodeId);
}

/** can.rename/move/delete — 기본 전부 true(타입이 명시로 끌 때만 false). */
export function canDo(type: string, what: 'rename' | 'move' | 'delete'): boolean {
    const can = registry.get(type)?.can;
    return can?.[what] !== false;
}

/** 테스트·앱 재마운트에서 목록을 비운다(view-registry.clearViews 와 같은 결). */
export function clearTypes(): void {
    registry.clear();
}
