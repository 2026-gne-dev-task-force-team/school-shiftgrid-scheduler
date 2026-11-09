/**
 * 🔴 약속 「nodes」 — 노드 하이라키를 다루는 범용 약속의 **타입 정의 자리**(값 0).
 *   ⭐ 3판(2026-11-08): 옛 `src/interfaces/nodes.ts` 는 제공자(explorer)의 타입을 **재export** 만 했다(M0 부채).
 *      이번에 그 부채를 끊었다 — 타입 정의를 여기(약속 쪽)에 두고, 제공자(explorer)가 이걸 **import 해서 구현**한다.
 *      그래서 소비자도 제공자도 약속(이 꾸러미 contracts/nodes)에서만 `import type` 한다 — explorer 가 서버로 바뀌어도 이 자리는 그대로다.
 *   ⛔ 값(const·function) 0 — 런타임 실체(makeNodesApi·레지스트리)는 제공자 플러그인 안에 산다.
 *   소비자는 이 타입을 host.modules 로 받는다(약속 이름 nodes).
 */
import type { ComponentType, ReactNode } from 'react';
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
    /** 🔑 이모지 아이콘 — 모든 노드 공통 칸(P2). 탐색기·탭 머리가 이것 하나만 읽는다. 없으면 타입 기본 아이콘. */
    icon?: string;
    /** 🔑 본문 — 모든 노드 공통 칸(P2). 속은 page-doc 주인(페이지 편집기)만 안다 — 노드 바닥은 저장만. */
    body?: unknown;
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

/**
 * 🔑 조작 가능 플래그 — rename·move·delete 각각 「해도 되나」. 생략/undefined 는 true.
 *   ⭐ 고정 객체(타입 전체가 늘 같은 답)로도, 함수(노드·현재 상황에 따라 답이 다름)로도 줄 수 있다 — NodeTypeDef.can 참고.
 */
export interface CanFlags { rename?: boolean; move?: boolean; delete?: boolean }

/**
 * 🔑 본문 종류 등록 표 — 모든 노드는 페이지고, 다른 건 본문 종류뿐(노션식 정비 P1.5).
 *   doc 블록(페이지 편집기) · sheet 격자(시트) · collection 자식 페이지를 표·목록·달력·보드로(컬렉션).
 *   새 본문(예: canvas)은 여기 한 줄 + 그 꾸러미가 노드 타입에 body 로 적으면 끝 — 노드·탐색기·머리는 안 바뀐다.
 */
export const BODY_KINDS = { doc: '문서', sheet: '시트', collection: '컬렉션' } as const;
export type BodyKind = keyof typeof BODY_KINDS;

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
    /**
     * 🔑 이름바꾸기·옮기기·지우기를 「해도 되나」 — 기본 전부 true. 두 꼴:
     *   - 고정 객체 `{ rename?, move?, delete? }` — 타입 전체가 늘 같은 답(옛 꼴 그대로).
     *   - 함수 `(nodeId) => CanFlags` — 노드·현재 상황(로그인한 사람·권한 등)에 따라 그때그때 답한다.
     *   🔴 관문은 한 곳(canDo) — 메뉴 회색·드래그·모델 move/remove/rename·공개 API 가 전부 이걸 지난다(violatesUnique 와 같은 결).
     *   ⛔ 탐색기는 이 함수의 속을 모른다 — 판정은 노드 타입 주인(플러그인)이 준다(계정·권한 낱말 0).
     */
    can?: CanFlags | ((nodeId: string) => CanFlags);
    /**
     * 🔑 「만들기」 가림 — 이 타입을 parentId 아래 새로 만들어도 되나(기본 true). 없으면 늘 만들 수 있다.
     *   parentId 는 만들어질 부모(루트 포함) · null 은 부모가 정해지지 않은 자리(헤더 단추 등). 막히면 「새로 만들기」 후보가 회색.
     *   🔴 관문은 한 곳(canCreate) — 우클릭 메뉴·헤더 단추·공개 API create 가 전부 지난다.
     */
    canCreate?: (parentId: string | null) => boolean;
    /**
     * 🔑 「지울 때 경고」 — 이 타입을 지우기 전에 사람에게 한 번 물을 말(없으면 바로 휴지통으로). 두 꼴:
     *   - 고정 문자열 — 늘 같은 경고.
     *   - 함수 `(nodeId) => string | null` — 그 노드에 경고가 필요하면 문구, 아니면 null(바로 지움).
     *   ⛔ window.confirm 이 아니라 탐색기가 인라인 확인 줄로 띄운다(볼트 규칙과 같은 결).
     */
    confirmDelete?: string | ((nodeId: string) => string | null);
    /**
     * 🔑 조건부 숨김 — 이 노드를 지금 사람에게 보일까(true 면 record 처럼 「안 보인다」). 없으면 늘 보인다.
     *   record(무조건 숨김)와 다르다 — 상황(권한)에 따라 보였다 숨었다 한다. 본 나무·검색·휴지통 어디서도 안 보인다.
     *   ⛔ 탐색기는 판정의 속을 모른다 — 노드 타입 주인이 준다(예: 보기 권한 없으면 숨김).
     */
    hidden?: (nodeId: string) => boolean;
    /**
     * 🔑 싱글톤 — 이 타입의 노드를 몇 개까지 두나(🔴 휴지통은 안 센다):
     *   - 'tree'   나무 전체(휴지통 제외)에 하나만. 예: 학교 정보·설정.
     *   - 'parent' 같은 부모 밑에 하나만. 예: 시간표마다 「선생님 목록」·「반 목록」·「규칙」 폴더 하나씩.
     *   없으면 제한 없음(기본 · 내장 '폴더'가 그렇다). 관문은 모델 한 곳(violatesUnique) — 만들기·옮기기·복원·API 가 전부 지난다.
     */
    unique?: 'tree' | 'parent';
    /** 🔑 끼워 넣기 모습(P5) — impl.embed 에 host 를 묶어 온다. 없으면 링크 줄. */
    embed?: ComponentType<EmbedProps>;
    /**
     * 🔑 자동 슬롯 — 이 타입의 노드를 만들면 같이 만들 자식 타입들(예: 시간표를 만들면 선생님 목록·반 목록·규칙 폴더도).
     *   🔴 부모 생성과 슬롯 생성은 되돌리기 한 묶음(한 번의 apply). 슬롯 자식을 못 지우게/못 바꾸게 할지는
     *      그 자식 타입이 제 can 으로 스스로 정한다(⛔ 새 잠금 장치 없음). accepts 가 막는 슬롯은 조용히 건너뛴다.
     */
    slots?: string[];
    /**
     * 🔑 레코드성 — 이 타입의 노드는 탐색기에 「어떤 경우에도」 안 보인다(본 나무·검색·휴지통 어디서도).
     *   저장·삭제·휴지통·복원·되돌리기는 일반 노드와 완전히 같다. 예: 달력의 'calendar.event'.
     */
    record?: boolean;
    /** 🔑 본문 종류 — BODY_KINDS 의 키. 없으면 본문 없는 노드(폴더·레코드 행 등). */
    body?: BodyKind;
    /**
     * 🔑 만들 때 인라인 입력 — 이 타입을 「새로 만들기」로 만들면 이름칸 자리에 (빈) 입력을 띄우고(placeholder 안내),
     *   커밋값을 onInput(kind:'create') 으로 넘긴다. 이름이 아니라 「다른 값」(예: 링크)을 받아야 하는 타입을 위한 자리.
     *   ⛔ window.prompt 없이 — 탐색기가 이름바꾸기와 같은 인라인 입력을 띄운다(볼트 규칙과 같은 결).
     */
    createInput?: { placeholder?: string };
    /**
     * 🔑 인라인 입력 커밋 — createInput 생성 입력이나 promptInput(kind) 호출의 커밋값을 받는다.
     *   kind 는 'create'(생성 입력) 또는 플러그인이 promptInput 에 준 이름. host 는 등록 때 끼워졌다(open·menu 와 같은 결).
     */
    onInput?: (nodeId: string, kind: string, value: string) => void;
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
    /**
     * 🔑 상황에 따라 답하는 판정·가림 함수들 — 매니페스트엔 함수를 못 넣으니 여기 모아 두고 impl 이름으로 가리킨다.
     *   can — 노드별 rename/move/delete 가능 여부(고정 객체는 매니페스트 can 에 둬도 된다 · 함수면 여기).
     *   canCreate — 그 부모 밑에 이 타입을 만들어도 되나 · confirmDelete — 지울 때 경고(없으면 null) · hidden — 지금 숨길까.
     *   ⛔ 전부 순수 판정이라 host 를 안 받는다(open·menu 와 다르다) — nodeId/parentId 로만 답한다(값은 플러그인이 제 모듈 전역에서 읽는다).
     */
    can?: (nodeId: string) => CanFlags;
    canCreate?: (parentId: string | null) => boolean;
    confirmDelete?: (nodeId: string) => string | null;
    hidden?: (nodeId: string) => boolean;
    /** 🔑 인라인 입력 커밋 핸들러 — createInput 생성 입력·promptInput 의 커밋값(host 를 받는다 · open·menu 와 같은 결). */
    onInput?: (host: PluginHost, nodeId: string, kind: string, value: string) => void;
    /** 🔑 끼워 넣기 모습(P5) — 다른 노드 안(페이지 블록)에 이 타입이 어떻게 보일지. 없으면 「아이콘+이름」 링크 한 줄. */
    embed?: ComponentType<EmbedProps & { host: PluginHost }>;
}

/** nodes.Embed 속성 — 끼워 넣을 노드 id(+ 타입이 알아듣는 보기 이름). */
export interface EmbedProps { nodeId: string; view?: string }

/** nodes.Header 속성 — 뷰는 노드 id 만 주면 아이콘·제목이 알아서 그려지고 고쳐진다. */
export interface NodeHeaderProps {
    nodeId: string;
    /** 이 머리가 놓인 탭(leaf) — 주면 노드 이름이 바뀔 때 탭 제목도 같이 고친다. */
    leafId?: string;
    /** 머리 모양 — bar(탭 머리줄 · 기본 · 시간표 머리가 기준) / page(큰 얼굴 · 아이콘이 위 줄, 제목·속성·본문이 한 왼쪽 선). */
    variant?: 'bar' | 'page';
    /** 아이콘 글자 크기(토큰 클래스) — variant 기본값을 덮는다. */
    iconSizeClass?: string;
    /** 제목 입력 클래스 — variant 기본값을 덮는다. */
    titleClass?: string;
    /** 아이콘이 없을 때 보일 것 — 기본은 그 타입의 기본 아이콘. */
    fallback?: ReactNode;
    /** 제목 입력칸 접근성 이름 · 빈칸 안내 · Enter 확정 뒤 콜백(페이지: 본문 첫 블록으로). */
    titleAriaLabel?: string;
    titlePlaceholder?: string;
    onTitleEnter?: () => void;
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
    /** 🔑 공통 머리 — 아이콘(이모지, undefined 면 지움)·본문. 누구나 쓴다(사람 글 · 되돌리기 더미에 쌓인다). ⛔ 본문 속을 직접 뜯지 말 것 — page-doc 창구로만. */
    setIcon(id: string, icon: string | undefined): void;
    setBody(id: string, body: unknown): void;
    /** 🔑 노드 공통 머리 부품 — 아이콘 고르기 + 제목 입력(탐색기·탭 제목에 같이 반영). 뷰가 제 머리줄 안에 끼운다. */
    Header: ComponentType<NodeHeaderProps>;
    /** 🔑 끼워 넣기 부품 — 그 타입의 embed 모습(없으면 링크 줄). 지워진 노드면 안내 줄. */
    Embed: ComponentType<EmbedProps>;
    move(id: string, parentId: string, index?: number): void;
    remove(id: string): void;                           // 🔴 휴지통으로(영구 아님)
    /** 🔑 묶음 — fn 안의 쓰기 전부가 되돌리기 한 칸·저장 한 번·알림 한 번이 된다(붙여넣기·일괄 편집). 중첩은 바깥에 합쳐진다. */
    batch(fn: () => void): void;

    invalidate(id: string): void;                       // 유도 자식 다시 계산
    select(id: string): void;                           // 탐색기에서 그 노드로 가기
    open(id: string): void;                             // 그 타입의 open 실행
    /**
     * 🔑 인라인 입력 띄우기 — 그 노드의 이름칸 자리에 입력을 띄우고, 커밋하면 그 타입의 onInput(kind) 으로 값을 넘긴다
     *   (⛔ window.prompt 없이). 생성이 아니라 「값 바꾸기」(예: 링크 바꾸기)에 쓴다. initial 은 미리 채울 값.
     */
    promptInput(id: string, opts: { kind: string; initial?: string; placeholder?: string }): void;

    subscribe(fn: (changedIds: string[]) => void): Disposable;
    roots: { main: string; trash: string };
}
