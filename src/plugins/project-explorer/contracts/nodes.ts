/**
 * 🔴 약속 「nodes」 — 노드 하이라키를 다루는 범용 약속의 **타입 정의 자리**(값 0).
 *   ⭐ 3판(2026-11-08): 옛 `src/interfaces/nodes.ts` 는 제공자(project-explorer)의 타입을 **재export** 만 했다(M0 부채).
 *      이번에 그 부채를 끊었다 — 타입 정의를 여기(약속 쪽)에 두고, 제공자(project-explorer)가 이걸 **import 해서 구현**한다.
 *      그래서 소비자도 제공자도 약속(이 꾸러미 contracts/nodes)에서만 `import type` 한다 — project-explorer 가 서버로 바뀌어도 이 자리는 그대로다.
 *   ⛔ 값(const·function) 0 — 런타임 실체(makeNodesApi·레지스트리)는 제공자 플러그인 안에 산다.
 *   소비자는 이 타입을 host.modules 로 받는다(약속 이름 nodes).
 */
import type {
    Disposable, PluginHost, PluginImpl, NodeTypeContribution, IconName, MenuEntry,
} from '../../../pane-ui-system/plugin';

/**
 * 노드 나무의 한 칸 — 「누가 누구 밑에 어떤 순서로」. 🔴 data 는 그 타입을 등록한 플러그인만 읽고 쓰는 불투명 칸.
 *   (실체 Tree·연산은 제공자 model/tree.ts 에 산다 — 여긴 약속이 드러내는 노드 모양만.)
 */
export interface Node {
    id: string;
    type: string;               // 'folder' · 'calendar.year' … — 등록 표의 키
    name: string;               // 탐색기에 보이는 이름
    children: string[];         // 저장된 자식 id, 순서 있음
    collapsed?: boolean;        // 접힘 — 나무에 산다(기기별 아님)
    data?: unknown;             // 🔴 그 타입의 플러그인만 읽고 쓰는 불투명 칸
    /** 휴지통에 있는 동안만: 지우기 전 원래 부모 id(복원 자리). */
    trashedFrom?: string;
}

/**
 * 유도 트리(derive)가 돌려주는 가짜 자식 — 🔴 저장 안 됨. id 는 뷰가 `<부모id>/<key>` 꼴로 짓는다(`/` 가 「가상」 표식).
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
     *   저장·삭제·휴지통·복원·되돌리기는 일반 노드와 완전히 같다. 예: 달력의 'calendar.event'.
     */
    record?: boolean;
}

/**
 * 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 `impl` 이름이 가리키는 레코드 값(모듈 nodeTypes[impl]).
 *   매니페스트엔 함수를 못 넣으니(순수 데이터), 노드 타입의 함수 칸은 여기 모아 두고 이름 하나로 가리킨다.
 *   ⭐ 동작성 함수(open·menu·createInit)는 첫 인자로 host 를 받는다 · 순수 계산(icon·derive)은 노드만. 전부 선택.
 */
export interface NodeTypeImplFns {
    icon?: (node: Node) => IconName;
    open?: (host: PluginHost, nodeId: string) => void;
    derive?: (node: Node) => VirtualNode[];
    menu?: (host: PluginHost, nodeId: string) => MenuEntry[];
    createInit?: (host: PluginHost, parentId: string) => Partial<Node>;
}

/** 공개 노드 — 「얼린 복사본」. children 도 새 배열이라 남이 나무를 못 만진다. */
export type PublicNode = Readonly<Node>;

/** 다른 플러그인이 받는 노드 시스템 표면. 🔴 version 을 처음부터(갈아끼울 데: 버전 달린 표면으로 큰다). */
export interface NodesApi {
    version: 1;
    /** 타입 등록 — `<pluginId>.` 접두사 강제. 꺼지면 아이콘·열기·메뉴만 빠지고 노드는 남는다. */
    types: { register(def: NodeTypeDef): Disposable };

    /**
     * 🔴 로더 전용(NodeTypeRegistrar) — 창틀 applyContributes 가 contributes.nodeTypes 를 꽂을 때 부른다.
     *   ⛔ 플러그인이 직접 부르는 창구가 아니다(그건 types.register) — 매니페스트 항목+impl 함수 묶음을 받아
     *      NodeTypeDef 를 조립해 꽂는다. Disposable 은 호출자 소유로 추적된다.
     */
    registerContributed(item: NodeTypeContribution, impl: PluginImpl, host: PluginHost): Disposable;

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
