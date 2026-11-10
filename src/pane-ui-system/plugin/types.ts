/**
 * 플러그인 시스템 타입 — 매니페스트(신분증) · 모듈 · 호스트 객체 하나.
 *
 * 🔴 ⛔ 여기(pane-ui-system/plugin)는 창틀의 일부지만 도메인을 모른다 — 구조 검사 ⑤가 막는다.
 *    플러그인 실물은 src/plugins/ 바깥에 산다. 이 폴더는 「규격」만 낸다.
 *
 * ⭐ 매니페스트는 「나는 이 뷰·명령·리본·설정·상태바를 낸다」를 contributes 로 적어 둔다(2026-11-02 선언형 전환).
 *    실행에 필요한 함수·컴포넌트는 모듈이 이름 붙여 내놓고(components·commands·panes·renders), 짝은 호스트가 맞춘다.
 *    📌 옛 설계 「매니페스트 = 신분증, contributes 없음」은 이 판으로 뒤집혔다(명세: 플러그인 선언형 전환).
 * ⭐ 「코어」는 권한이 아니다 — 받는 호스트 API 는 여느 플러그인과 같다. 다른 점은 「끌 수 없다 · 먼저 산다」 둘뿐.
 *
 * 📌 범위: commands·settings·statusBar·menu·workspace.on·screen·theme·onFirstRun·newTab.
 *    (문서 창구 doc 은 2026-11-01 걷어냈다 — 쓰는 플러그인이 없다.)
 */
import type { NotifyInput } from './notify';
import type { ComponentType, ReactNode } from 'react';
import type { ViewDef, ViewProps } from '../view-registry';
import type { IconName } from '../primitives/Icon';
import type { IconPackContribution } from '../node-icon/packs';
import type { MenuEntry } from '../primitives/ContextMenu';
import type { JsonValue } from '../json';
export type { JsonValue } from '../json';

/** 창틀 버전 — manifest.minHostVersion 이 이걸 넘어서면 활성 안 함(버전 비교는 P2). */
export const HOST_VERSION = '0.1.0';

/** 등록을 되돌리는 손잡이(옵시디언 registerEvent 식) — 끌 때 호스트가 주인별로 모아 한꺼번에 부른다. */
export interface Disposable {
    dispose(): void;
}

/**
 * 🔴 약속(인터페이스) 기여 한 줄 — **약속 플러그인**(`contract-<이름>`)이 매니페스트 contributes.interfaces 로 선언한다.
 *   약속은 플랫폼(창틀·앱)이 아니라 플러그인 소속이다 — 필요 없으면 그 약속 플러그인을 끄거나 빼면 사라진다(쥔님 2026-11-08 14:23).
 *   uses: 이 약속의 **타입이 실제로 import 하는** 다른 약속 이름(약속끼리 기대기). 그 약속이 없으면 이 약속 플러그인이 「약속 없음」으로 막힌다.
 *   ⛔ 창틀은 어떤 약속 이름도 고정으로 모른다 — 켜진 플러그인들의 이 선언을 모아 목록을 만든다(고정 배열 없음).
 */
export interface InterfaceContribution {
    name: string;
    version: string;
    uses?: string[];
    /** 🔴 사람 이름(쥔님 2026-11-08 21:27) — 설정 상세 「다른 플러그인과의 관계」가 id 대신 이 이름을 보여 준다(예: people → 「사람 명단」). */
    label?: string;
    /** 선택 — 한 줄 풀이(그 약속이 뭘 담나). 없으면 이름만. */
    desc?: string;
}

/**
 * 🔴 사람용 상세 설명 — 설정 「설치된 플러그인」 상세 맨 위에 그린다(쥔님 2026-11-08: *"플러그인 설명이 너무 부족"* ·
 *   *"뭐가 뭔지 모르겠는데 플러그인 설명도 좀 자세히"*). 읽는 사람은 개발자가 아닌 보통 사용자다.
 *   ⛔ 개발 낱말 금지(모듈·약속·레코드 노드·바닥 정책·하네스·엔진 등) · 짧은 문장 · 꾸밈말·이모지 금지.
 *   네 칸: 무엇을 하나(what, 필수) · 이럴 때 쓴다(use) · 끄면 어떻게 되나(off · 코어는 왜 못 끄나 한 줄) · 무엇과 같이 쓰나(with).
 *   목록 줄에 보이는 한 줄 요약은 description 이 맡는다(이건 상세 전용).
 */
export interface PluginAbout {
    what: string;
    use?: string[];
    off?: string;
    with?: string;
}

/** 꾸러미 층 — 위에서 아래로 PLUGINS 에 늘어선다(app/plugins.test.ts 가 지킨다). */
export type PluginLayer = 'platform' | 'app' | 'domain';
export const PLUGIN_LAYERS: readonly PluginLayer[] = ['platform', 'app', 'domain'];

/** 매니페스트 — id 가 저장 키·viewId 접두사·doc.plugins 키의 단일 원본이다(name 은 표시용). contributes 로 「무엇을 내나」를 적는다. */
export interface PluginManifest {
    id: string;              // 'scheduler' · 'settings' — 영문 소문자·하이픈
    name: string;            // 사람에게 보이는 이름
    version: string;         // '0.1.0'
    minHostVersion: string;  // 모자라면 활성 안 함(P2)
    /** 층 — PLUGINS 줄 세우기의 기준(core 플랫폼 → app 범용 → domain 업무 도메인). 활성 순서는 requires 가 정한다. */
    layer?: PluginLayer;
    core?: boolean;          // 끌 수 없다 · 먼저 산다. 그뿐이다
    description?: string;     // 목록 줄에 보이는 한 줄 요약(쉬운 말)
    /** 🔴 상세에 보이는 사람용 설명 — 무엇을/이럴 때/끄면/같이(위 PluginAbout). 개발 낱말 금지. */
    about?: PluginAbout;
    /**
     * 🔴 모듈·의존성(M0) — 전부 **인터페이스 이름**에 건다(플러그인·모듈 이름 아님). 범위는 `*`·`^a.b` 둘.
     *   provides: 내가 채우는 인터페이스 → 그 인터페이스 버전. 모듈 값은 PluginModule.modules[이름] 에 있다(짝).
     *   requires: 없으면 안 켜진다(blocked, 자동 복귀) — 위상 정렬이 이 순서로 켠다.
     *   supports: 없어도 켜진다 · 오면 붙는다(lifecycle.onInterface.attach) · 가면 떨어진다(detach).
     */
    provides?: Record<string, string>;
    requires?: Record<string, string>;
    supports?: Record<string, string>;
    /**
     * 🔴 선언형 기여 — 「나는 이 뷰·명령·리본·설정·상태바·노드 타입을 낸다」를 데이터로 적는다.
     *   ⛔ 순수 데이터만(함수·컴포넌트는 이름으로 가리킨다 — 모듈의 components·commands·panes·renders 키).
     *   ⛔ 이 객체 안에서 모듈의 다른 것을 import 하지 않는다 — 나중에 매니페스트만 떼어 먼저 읽을 수 있어야 한다(지연 로딩 자리).
     */
    contributes?: Contributes;
}

/**
 * 플러그인 = 객체 하나(클래스 상속 안 함).
 *   ⭐ 선언형 전환(2026-11-02): 등록은 manifest.contributes 로 적고, 실행 함수·컴포넌트는 아래 이름 붙은 칸으로 내놓는다.
 *      매니페스트가 가리키는 이름(component·pane·render·command id)을 호스트가 이 칸에서 찾아 꽂는다.
 *   🔴 lifecycle.onActivate 는 이제 선택이다 — 등록이 아니라 「구독·동작」(workspace.on·onFirstRun 등)만 남을 때 쓴다.
 *      활성 순서는 로더가 쥔다(contributes 꽂기 → onActivate → onFirstRun).
 */
export interface PluginModule extends PluginImpl {
    manifest: PluginManifest;
    /** 선택 — 수명주기 훅(안드로이드 onCreate 결). onActivate 는 등록 외 동작·구독, onFirstRun 은 첫 실행 때 한 번. */
    lifecycle?: PluginLifecycle;
    deactivate?: () => void;   // 선택 — 등록물 회수는 호스트가 한다(P2)
    /**
     * 🔴 M0 — manifest.provides 와 짝(같은 키). 인터페이스 이름 → 모듈 값. host.modules.use(name) 가 이걸 돌려준다.
     *   ⭐ 값이 「호출자별 팩토리」(__perCaller 표식 함수)면 use 가 (소비자id, scopedTrack) 로 불러 바인딩한 것을 준다 —
     *      소비자가 낸 Disposable 이 (소비자, 인터페이스) scope 에 모여, detach 때 그 묶음만 거둬진다.
     *      표식이 없으면 그 값을 그대로 돌려준다.
     */
    modules?: Record<string, unknown>;
}

/** 🔴 호출자별 모듈 팩토리 — PluginModule.modules[이름] 이 이 꼴이면 host.modules.use 가 호출자 맥락으로 부른다. */
export interface PerCallerApi<T = unknown> {
    (callerId: string | undefined, track?: (d: Disposable) => Disposable): T;
    __perCaller: true;
}

/** 리본 동작 — 「뷰 열기」가 아니라 실제 동작(엑셀 리본, 쥔님). 뷰의 ribbon 칸은 「그 뷰 열기」 동작의 설탕. */
export interface RibbonAction {
    id: string;
    icon: IconName;
    label: string;
    run(): void;
    order?: number;
}

/** workspace.open 옵션 — 어디에·무슨 제목·파라미터로. 자리는 힌트까지(트리 모양은 못 가리킨다). */
export interface WorkspaceOpenOptions {
    title?: string;
    params?: Record<string, unknown>;
    where?: 'center' | 'left' | 'right';
    /** 비싱글턴 재사용 힌트 — params 가 같이 오면 「뷰+params 같은 탭」을 찾아 그리로(없으면 새 장). */
    reuse?: boolean;
}

/**
 * 명령 실행 맥락 — 「어느 탭에/어느 묶음에」. 우클릭 메뉴가 그 leaf 를 넘긴다.
 *   ⛔ 팔레트처럼 ctx 없이 부르면 명령이 활성 탭을 쓴다(명령 쪽이 fallback 을 쥔다).
 */
export interface CommandContext {
    /** 대상 leaf(탭) — 없으면 명령이 활성 탭을 쓴다 */
    leafId?: string;
    /** 대상 탭 묶음(가르기처럼 묶음이 필요한 명령용) */
    tabsId?: string;
    /** 대상 노드 하나(우클릭한 노드 등) — 없으면 명령이 「고른 노드」를 쓴다. 전역 menuTarget 우회 대신 이걸로. */
    nodeId?: string;
    /** 대상 노드 여럿(여러 줄 고르기) */
    nodeIds?: string[];
    /** 그 밖의 데이터(알림 단추의 대상 토큰 등) — 순수 데이터뿐(함수 금지). */
    args?: JsonValue;
}

/** 명령(command) — 레지스트리에 쌓인다. 🔴 리본·메뉴·팔레트가 commandId 로 가리켜 runCommand 로 부른다. */
export interface CommandDef {
    id: string;
    title: string;
    icon?: IconName;
    run(ctx?: CommandContext): void;
    keys?: string;
    /** 🔴 선택 — 플러그인 상세(설정 「설치된 플러그인」 피크)가 보여 주는 한 줄 설명(쥔님 2026-11-01). */
    description?: string;
    /** false = 명령 팔레트에 안 보인다(「삭제 확인」처럼 다른 화면 안에서만 쓰는 내부 단계 명령). 기본 보인다. */
    palette?: boolean;
    /** 지금 이 맥락으로 부를 수 있나 — false 면 runCommand 가 안 부르고 단추는 회색(알림 「되돌리기」가 낡았을 때 등). 없으면 늘 된다. */
    enabled?(ctx?: CommandContext): boolean;
}
/** 설정 기여 항목 — section 에 꽂는다. 같은 section 은 합쳐진다(제목은 첫 등록이 이긴다). */
export interface SettingsContribution {
    section: string;
    sectionTitle?: string;
    id: string;
    title: string;
    icon: IconName;
    Pane: ComponentType;
}
/** 상태바 기여 — render 가 노드를 돌려준다(작업대 이벤트에도 다시 그린다). */
export interface StatusContribution {
    id: string;
    side: 'left' | 'right';
    render: () => ReactNode;
}
/** 리본 동작 등록 입력 — 명령을 가리킨다. 호스트가 명령에서 label·run 을 푼다. */
export interface RibbonAddInput {
    commandId: string;
    icon?: IconName;
    order?: number;
}

// ──────────────────────────────────────────────────────────────────────────
// 🔴 선언형 기여(contributes) — 매니페스트가 데이터로 적는 것. 함수·컴포넌트는 「이름」으로 가리킨다.
//   이름(CompName 등)은 definePlugin 이 구현 객체의 keyof 로 파생시킨다 — 틀리면 tsc 가 그 자리에서 잡는다.
//   제네릭 기본값은 string 이라, 파생 없이 쓰는 평면 PluginManifest·DeclareInput 도 그대로 쓸 수 있다.
// ──────────────────────────────────────────────────────────────────────────

/** 뷰 기여 — ViewDef 에서 Component 함수를 빼고 component(모듈 components 의 키)로 가리킨다 + newTab. */
export interface ViewContribution<CompName extends string = string> extends Omit<ViewDef, 'Component'> {
    /** 모듈 components 의 키 — 호스트가 이 이름으로 Component 를 찾아 꽂는다. */
    component: CompName;
    newTab?: { label: string };
}

/**
 * 명령 기여 — CommandDef 에서 run 을 뺀다. 구현을 찾는 길은 둘(판별 유니온):
 *   ① impl 없음 — id 가 곧 구현 키(모듈 commands 의 키). 평범한 선언 명령.
 *   ② impl 있음 — id 는 런타임값이어도 되고(예: new-<type>), impl 이 구현 키다. args(데이터)를 run(host, ctx, args) 로 넘긴다.
 *      🔴 ⛔ 함수 직접 받기 금지 — args 는 데이터뿐, 함수는 여전히 impl 이름으로만. 「런타임이니까 더 받자」를 막는다.
 */
export type CommandContribution<CmdName extends string = string> =
    | (Omit<CommandDef, 'run' | 'id' | 'enabled'> & {
        /** 모듈 commands 의 키 = 이 명령 id — 호스트가 이 이름으로 run 을 찾아 꽂는다. */
        id: CmdName;
        impl?: never;
        args?: never;
    })
    | (Omit<CommandDef, 'run' | 'id' | 'enabled'> & {
        /** 런타임에 정해지는 명령 id(id 는 자유 문자열) — 구현은 impl 이름이 가리킨다. */
        id: string;
        /** 모듈 commands 의 키 — run 을 이 이름으로 찾는다. */
        impl: CmdName;
        /** 데이터 — run(host, ctx, args) 로 넘어간다(순수 데이터뿐). */
        args?: unknown;
    });

/** 설정 기여 — 섹션·항목. 항목의 Pane 은 pane(모듈 panes 의 키)으로 가리킨다. */
export interface SettingsContributes<PaneName extends string = string> {
    sections?: { id: string; title: string; icon?: IconName }[];
    items?: { section: string; id: string; title: string; icon: IconName; pane: PaneName }[];
}

/**
 * 🔴 인스펙터 칸 기여 — 「이 종류(target)의 대상이 골라지면 인스펙터 패널에 이 화면을 그린다」(쥔님 2026-11-09).
 *   ⭐ 인스펙터 패널은 자리만 쥔다 — 무엇을 그릴지는 그 대상을 가진 플러그인이 pane 으로 낸다.
 *   target 은 대상 종류 문자열(예: 노드 타입 'calendar.event') — 창틀은 뜻을 모르고 같은지만 본다.
 *   한 종류에 여러 플러그인이 칸을 내면 order(작은 것 먼저)·등록 순으로 위에서 아래로 쌓인다.
 */
export interface PropertiesContribution<PaneName extends string = string> {
    target: string;
    id: string;
    title: string;
    pane: PaneName;
    order?: number;
}

/** 인스펙터 칸 pane 이 받는 것 — host 는 꽂을 때 끼워진다. target 은 「지금 고른 대상」(종류 + id). */
export interface PropertiesTarget { type: string; id: string }
export interface PropertiesPaneProps { host: PluginHost; target: PropertiesTarget }

/** 상태바 기여 — render 함수를 빼고 render(모듈 renders 의 키)로 가리킨다. */
export interface StatusBarContribution<RenderName extends string = string> {
    id: string;
    side: 'left' | 'right';
    render: RenderName;
}

/**
 * 🔴 노드 타입 기여 — 「나는 이런 노드를 낸다」를 데이터로 적는다(순수 데이터). views·commands 와 같은 「이름으로 가리키기」.
 *   ⛔ 함수 칸(아이콘 함수·open·derive·menu·create.init)은 매니페스트에 못 들어간다 — impl 이름 하나로 가리키고,
 *      그 함수 묶음은 모듈 nodeTypes[impl] 에 둔다(함수가 없는 순수 데이터 타입이면 impl 을 생략한다).
 *   ⚠️ 창틀은 노드 타입의 속뜻을 모른다(도메인) — 활성 때 applyContributes 가 항목을 통째로 노드 레지스트라
 *      (host.modules.use('nodes'))에 넘긴다. 이름 풀기·레지스트리 꽂기는 레지스트라 몫이다. 아래 칸은 적는 쪽이 쓰기 좋게
 *      흔한 꼴만 세워 둔 것이고, 레지스트라가 더 넓게 해석할 수 있다.
 */
export interface NodeTypeContribution<ImplName extends string = string> {
    type: string;
    label: string;
    /** 데이터 아이콘(고정) — 노드마다 달라지는 함수 아이콘은 impl 로 뺀다. */
    icon?: IconName;
    container?: boolean | { accepts: string[] };
    openable?: boolean;
    create?: { label: string; under?: string[] };
    can?: { rename?: boolean; move?: boolean; delete?: boolean };
    record?: boolean;
    /** 🔑 본문 종류 키(doc·sheet·collection …) — 창틀은 속뜻을 모른다, 레지스트라(explorer)가 BODY_KINDS 로 푼다. */
    body?: string;
    /** 🔑 만들 때 인라인 입력 — 이 타입을 「새로 만들기」로 만들면 이름칸 자리에 입력을 띄우고, 커밋값을 impl.onInput(kind:'create')으로 넘긴다(레지스트라가 NodeTypeDef.createInput 로). */
    createInput?: { placeholder?: string };
    /** 🔑 싱글톤 — 'tree' 나무에 하나 · 'parent' 부모마다 하나(없으면 제한 없음). 레지스트라가 NodeTypeDef.unique 로 넘긴다. */
    unique?: 'tree' | 'parent';
    /** 🔑 자동 슬롯 — 이 타입을 만들면 같이 만들 자식 타입들. 레지스트라가 NodeTypeDef.slots 로 넘긴다. */
    slots?: string[];
    /** 모듈 nodeTypes 의 키 — 함수 묶음(아이콘 함수·open·derive·menu·create.init)을 레지스트라가 여기서 찾는다. */
    impl?: ImplName;
}

/**
 * 🔴 노드 타입 레지스트라 — 노드 하이라키를 쥔 플러그인이 「nodes」 인터페이스 모듈(PluginModule.modules.nodes)로 내준다.
 *   applyContributes 가 contributes.nodeTypes 를 만나면 host.modules.use('nodes') 로 이걸 받아
 *   항목 하나 + 그 플러그인의 impl + host 를 통째로 넘긴다 — 이름 풀기·NodeTypeDef 조립·레지스트리 꽂기는
 *   레지스트라 몫이다(창틀은 노드 타입의 속을 끝내 모른다). Disposable 을 돌려주면 그 플러그인 소유로 추적된다.
 */
export interface NodeTypeRegistrar {
    registerContributed(item: NodeTypeContribution, impl: PluginImpl, host: PluginHost): Disposable;
}

/**
 * 매니페스트 contributes 칸 — 여섯 종류(뷰·명령·리본·설정·상태바·노드 타입).
 *   제네릭 넷(이름 집합)은 definePlugin 이 구현 객체의 keyof 로 채운다 — 평소엔 string(파생 안 함).
 */
export interface Contributes<
    CompName extends string = string,
    CmdName extends string = string,
    PaneName extends string = string,
    RenderName extends string = string,
    NTName extends string = string,
> {
    views?: ViewContribution<CompName>[];
    commands?: CommandContribution<CmdName>[];
    ribbon?: RibbonAddInput[];
    settings?: SettingsContributes<PaneName>;
    statusBar?: StatusBarContribution<RenderName>[];
    /** 🔴 인스펙터 칸 — 인스펙터 패널이 「고른 대상」의 종류로 모아 그린다(위 PropertiesContribution). pane 은 모듈 panes 의 키. */
    properties?: PropertiesContribution<PaneName>[];
    /**
     * 🔴 커스텀 아이콘 묶음 — 제목 옆 아이콘 고르기 창의 「커스텀」 탭에 묶음별로 뜬다. 꼴: { id, name, icons: [{ id, name, keywords?, svg? | url? }] }.
     *   SVG 는 그리기 전에 소독한다(script·on*·외부 href 제거) · 이미지 주소는 https·같은 출처·그림 data: 만. 저장 값은 `custom:묶음id:그림id`.
     */
    iconPacks?: IconPackContribution[];
    /** 노드 타입 — applyContributes 가 노드 레지스트라(host.modules.use('nodes'))에 통째로 넘긴다(위 NodeTypeContribution). */
    nodeTypes?: NodeTypeContribution<NTName>[];
    /**
     * 🔴 약속(인터페이스) 선언 — 이 플러그인이 「이런 모양의 것이 올 수 있다」를 등록한다(약속 플러그인은 이것만 적는다).
     *   호스트는 켜진 플러그인들의 이 칸을 **모아** 약속 목록을 만든다(옛 INTERFACES 고정 배열을 대체 · 2026-11-08 3판).
     */
    interfaces?: InterfaceContribution[];
    /**
     * 🔴 권한 낱말 — 플러그인이 「나는 이런 권한을 가린다」를 선언한다(permit 제공자가 can() 으로 본다).
     *   호스트는 **모으기만** 한다(장부에 표시) — 진짜 판정은 permit 제공자·서버 몫(client can() 은 화면 가림).
     *   ⛔ default(역할 기본값)를 넣지 않는다 — 그게 정책이고, 정책은 편집 화면에서 사람이 건다(쥔님 2026-11-08 14:54).
     */
    /** desc: 이 권한이 있으면 무엇을 할 수 있게 되나 — 보통 사용자 말로 한 줄(역할·사용자 편집기와 설정 상세가 보여 준다). */
    permissions?: { id: string; title: string; desc?: string }[];
    /**
     * 🔴 사용자 칸 꽂기 — 다른 플러그인이 「사용자에 이런 칸을 끼운다」를 선언한다(노드 data 와 같은 결).
     *   값은 꽂은 플러그인만 고친다 · editor 가 있으면 계정 화면이 그 pane 을 끼워 그리고, 없으면 값을 표시만.
     *   ⛔ 칸 이름(id)은 호스트가 접두사를 붙이지 않는다 — 꽂는 쪽이 `<pluginId>.` 로 스스로 접두한다(충돌 방지).
     */
    userFields?: { id: string; title: string; editor?: string }[];
    /** 🔴 역할 칸 꽂기 — userFields 와 같은 결(역할에도 플러그인이 칸을 꽂는다 · 예: 「이 역할로 들어오면 먼저 보일 화면」). */
    roleFields?: { id: string; title: string; editor?: string }[];
}

/**
 * 모듈이 이름 붙여 내놓는 구현 — 매니페스트 contributes 가 이름으로 가리킨다(전부 선택).
 *   🔴 host.declare 도 이 네 칸에서 이름으로 구현을 찾는다(함수 직접 받기 금지).
 *   🔴 넷 다 첫 인자로 host 를 받는다 — 안드로이드 Activity 가 Context 를 받듯, 호스트가 꽂을 때 바인딩한다
 *      (applyContributes·declareOne 이 run: (ctx)=>fn(host,ctx) · Component: (p)=>createElement(impl,{...p,host}) 로 감싼다).
 *      그래서 선언형으로 넘어온 명령·뷰·설정·상태바가 host.workspace.open 등을 그대로 쓸 수 있다.
 *   ⚠️ 뷰·설정은 창틀 ViewProps 를 안 더럽히려 교차 타입(& { host })으로 받는다 — host 가 끼워져 들어온다.
 */
export interface PluginImpl {
    components?: Record<string, ComponentType<ViewProps & { host: PluginHost }>>;
    /** 🔴 첫 인자 host(안드로이드 Context) · ctx(우클릭 맥락) · args(선언이 붙인 데이터 — declare 의 args·contributes 명령의 args). */
    commands?: Record<string, (host: PluginHost, ctx?: CommandContext, args?: unknown) => void>;
    /** 명령의 「지금 되나」 판정 — commands 와 같은 키. 없으면 늘 된다(CommandDef.enabled 로 꽂힌다). */
    enabled?: Record<string, (host: PluginHost, ctx?: CommandContext) => boolean>;
    /** 설정 항목 pane 은 { host } · 인스펙터 칸 pane 은 { host, target }(PropertiesPaneProps) */
    panes?: Record<string, ComponentType<{ host: PluginHost }> | ComponentType<PropertiesPaneProps>>;
    renders?: Record<string, (host: PluginHost) => ReactNode>;
    /**
     * 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 이름이 이 키를 가리킨다.
     *   값의 꼴(아이콘 함수·open·derive·menu·create.init)은 창틀이 모른다(도메인) — 노드 레지스트라가 해석한다.
     *   함수 없는 순수 데이터 노드 타입만 내는 플러그인이면 비운다.
     */
    nodeTypes?: Record<string, unknown>;
}

/**
 * 🔴 인터페이스 훅 — manifest.supports 와 짝(같은 이름). 늦게 오는 모듈에 붙는 자리.
 *   그 인터페이스가 채워지면 attach(host, mod), 사라지면 detach(host). 다시 채워지면 attach 가 다시 불린다.
 *   attach 안에서 mod 로 건 구독(Disposable)은 (이 소비자, 이 인터페이스) scope 에 모여 detach 때 그 묶음만 거둬진다.
 */
export interface InterfaceHook {
    attach(host: PluginHost, mod: unknown): void;
    detach(host: PluginHost): void;
}

/** 수명주기 훅(안드로이드 onCreate 결) — 전부 선택. onActivate 는 등록 뒤 동작·구독, onFirstRun 은 첫 실행 때 한 번. */
export interface PluginLifecycle {
    onActivate?(host: PluginHost): void | Promise<void>;
    onFirstRun?(host: PluginHost): void;
    onDeactivate?(): void;
    /** 🔴 supports 와 짝 — 인터페이스 이름 → attach/detach. 활성 순서·재시작과 무관하게 「채워지는 순간」 불린다. */
    onInterface?: Record<string, InterfaceHook>;
}

/**
 * 🔴 동적 선언(host.declare) 입력 — contributes 의 「한 항목」과 같은 타입(판별 유니온).
 *   ⛔ 옛 register 보다 더 받지 않는다 — 함수 직접 받기 금지, 이름으로만(그 플러그인의 impl 에서 찾는다).
 *   같은 검증·같은 꽂기 경로를 탄다(declareOne 하나). 설정은 「한 항목」이 섹션·항목 둘로 갈린다.
 */
export type DeclareInput =
    | ({ kind: 'view' } & ViewContribution)
    | ({ kind: 'command' } & CommandContribution)
    | ({ kind: 'ribbon' } & RibbonAddInput)
    | { kind: 'settingsSection'; id: string; title: string; icon?: IconName }
    | { kind: 'settingsItem'; section: string; id: string; title: string; icon: IconName; pane: string }
    | ({ kind: 'statusBar' } & StatusBarContribution)
    | ({ kind: 'properties' } & PropertiesContribution)
    | ({ kind: 'iconPack' } & IconPackContribution);

/**
 * 🔴 기여 장부 한 줄 — 「이 플러그인이 호스트에 지금 무엇을 꽂아 두었나」의 읽기 전용 거울(2026-11-02 D7).
 *   declareOne 이 꽂을 때 남기고, 그 Disposable 이 불리면 뺀다(동적 선언은 켜졌다 꺼질 수 있다 — pane-test 의 node-count 가 그 예).
 *   ⛔ 새 등록소가 아니다 — 실제 등록은 지금 경로(스토어) 그대로고, 장부는 그걸 비추기만 한다.
 */
export type ContributionKind = DeclareInput['kind'] | 'nodeType';
export interface ContributionRecord {
    /** 기여 종류 — declareOne 이 꽂는 여섯(뷰·명령·리본·설정 섹션·설정 항목·상태바). nodeType 은 라벨 완성용(declareOne 밖). */
    kind: ContributionKind;
    /** 등록 id — 뷰는 접두사 붙인 전체 id(calendar.month), 명령·리본은 명령 id, 설정은 섹션/항목 id. */
    id: string;
    /** 표시 제목 — 상태바처럼 제목이 없으면 비운다(UI 가 id 로 떨어진다). */
    title?: string;
    /** 출처 — 매니페스트 contributes 면 'manifest', host.declare(급조) 면 'declare'. */
    origin: 'manifest' | 'declare';
}

/** 탭 메뉴 기여가 받는 맥락 — 그 탭의 leaf 정보 */
export interface TabMenuContext {
    id: string;
    viewId: string;
    title: string;
    params?: Record<string, unknown>;
}
/** 작업대 이벤트 — 뷰(leaf)가 열리고·닫히고·활성화될 때 */
export type WorkspaceEvent = 'open' | 'close' | 'activate';
/** area — 어느 자리에 있나(left·center·right·floating). 플러그인이 「가운데 탭만」 셀 수 있게(쥔님 13:42: 열린 탭 수가 사이드바까지 셌다) */
export interface WorkspaceLeafInfo { id: string; viewId: string; params?: unknown; area?: 'left' | 'center' | 'right' | 'floating' }

/**
 * 플러그인이 받는 객체 하나 — 창틀의 트리·DOM·localStorage 에 손대는 길은 없다.
 * 🔴 등록 함수는 전부 Disposable 을 돌려준다 — 안 챙겨도 호스트가 주인별로 모아 끌 때 한꺼번에 회수한다.
 */
export interface PluginHost {
    readonly id: string;
    readonly hostVersion: string;

    /**
     * 뷰 읽기 — get/list. 🔴 D5③: 등록(register)은 지웠다(선언형 전환 마무리). 뷰·리본·명령·설정·상태바를 호스트에
     *   꽂는 길은 manifest.contributes 와 host.declare 둘뿐이다(둘 다 declareOne 으로 간다). 여기 get/list 는 읽기다.
     */
    views: {
        get(id: string): ViewDef | undefined;
        list(): ViewDef[];
    };
    /** 명령 — 리본·메뉴·팔레트가 run 으로 부른다(「모든 동작은 명령」). add 는 지웠다(contributes·declare 로). */
    commands: { run(id: string, ctx?: CommandContext): boolean };
    /** 「모든 탭 메뉴」에 항목을 더한다 — 우클릭 때 그 탭 맥락으로 factory 를 부른다. */
    menu: { addTabMenuItem(fn: (ctx: TabMenuContext) => MenuEntry[]): Disposable };
    /** 작업대 조작·구독 — 자리는 힌트까지(where). 트리 모양·setWs·DOM 은 안 준다. */
    workspace: {
        open(viewId: string, o?: WorkspaceOpenOptions): string | null;   // leafId
        close(leafId: string): void;
        /** 탭 제목 바꾸기 — 노드 이름이 바뀌면 그 탭도 따라가게(사용자가 직접 바꾼 것과 같은 길). */
        setTitle(leafId: string, title: string): void;
        on(ev: WorkspaceEvent, fn: (leaf: WorkspaceLeafInfo) => void): Disposable;
    };
    /** 화면 폭 구독 창구 — narrow() 지금값 · on 변화 */
    screen: { narrow(): boolean; on(fn: (narrow: boolean) => void): Disposable };
    /** 테마 구독 창구 — mode() 지금 밝기 · on 변화 */
    theme: { mode(): 'light' | 'dark'; on(fn: (m: 'light' | 'dark') => void): Disposable };
    /** 플러그인별 저장 — storageKey(`plugin.${id}.${key}`). 자기 네임스페이스만. 설정 전용(작은 값). */
    storage: {
        get<T>(key: string, fallback: T): T;
        set(key: string, v: unknown): void;
        /** 키 하나 지우기 — 큰 자료가 kv 로 이사한 뒤 옛 localStorage 원본을 치울 때. 실패는 조용히(삭제 실패는 유실이 아니다). */
        remove(key: string): void;
        /**
         * 🔴 R3-X — 다른 탭이 이 키를 바꾸면 fn(설정이 탭 사이에 같게). 보기 상태(폭·접힘)는 걸지 말 것(탭마다 따로).
         *   선택 칸 — 옛 가짜 호스트를 깨지 않게. 해지는 돌려준 Disposable(플러그인이 꺼지면 같이 풀린다).
         */
        watch?(key: string, fn: () => void): Disposable;
    };
    /**
     * 플러그인별 큰 저장(비동기 · IndexedDB) — 나무처럼 5MB localStorage 천장을 넘기는 자료용.
     *   🔴 ⛔ kvGet/kvSet 을 직접 부르지 않는다(네임스페이스 없는 키가 생기는 구멍) — 여기로만 들어온다.
     *      키는 host.storage 와 같은 꼴 `plugin.${id}.${key}` 로 가둔다(storageKey 접두사는 kv DB 이름에 이미 들어갔다).
     *   available() 이 false 면(사파리 프라이빗·정책) 쓰는 쪽이 localStorage(host.storage)로 버틴다.
     */
    store: {
        get<T>(key: string, fallback: T): Promise<T>;
        /** 🔴 성패를 돌려준다(성공 true · 실패 false). 실패는 상태바(저장 실패)가 이미 비춘다 — 쓰는 쪽은 「원본을 지워도 되나」 판정에만 쓴다. */
        set(key: string, v: unknown): Promise<boolean>;
        del(key: string): Promise<void>;
        available(): Promise<boolean>;
        estimate(): Promise<{ usage: number; quota: number } | null>;
    };
    /**
     * 알림 — 토스트로 잠깐 띄우고 알림 패널에 기록한다. 돌려주는 id 를 notify.dismiss 에 주면 토스트를 걷는다.
     *   단추(action)는 함수가 아니라 명령 id 로만 · 같은 key 는 덮어 쓴다 · 보낸 꾸러미는 창틀이 붙인다.
     */
    notify: { (input: NotifyInput): string; dismiss(id: string): void };
    /** 저장값 없이, 그 플러그인이 처음 켜질 때 한 번(첫 실행 기본 배치 등). */
    onFirstRun(fn: () => void): void;

    /**
     * 🔴 M0 — 모듈 소비. 인터페이스 **이름**으로 받는다(누가 채웠는지 소비자는 모른다 — 그래서 갈아 껴도 안 바뀐다).
     *   ⛔ requires·supports·자기 provides 에 선언한 이름만 — 안 선언한 이름을 use 하면 던진다(선언 안 된 의존 0건).
     *   supports 인데 아직 제공자가 없으면 null(requires 는 있으면 블록이 아니라 늘 차 있다).
     *   ⚠️ 모듈이 「호출자별 팩토리」면 이 호스트 id(= 소비자)와 (소비자,인터페이스) scope track 으로 바인딩해 돌려준다.
     */
    modules: {
        use<T = unknown>(name: string): T | null;
    };

    /**
     * 🔴 동적 선언 창구 하나(급조용) — contributes 항목 하나와 같은 타입·같은 검증·같은 꽂기 경로(declareOne).
     *   ⛔ 함수 직접 받기 금지(이름으로만 — 이 플러그인의 impl 에서 찾는다). 이름이 없으면 던진다.
     *   Disposable 을 돌려준다(안 챙겨도 호스트가 주인별로 모아 끌 때 회수).
     */
    declare(item: DeclareInput): Disposable;
}
