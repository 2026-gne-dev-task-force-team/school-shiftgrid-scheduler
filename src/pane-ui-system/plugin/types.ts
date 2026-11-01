/**
 * 플러그인 시스템 타입 — 매니페스트(신분증) · 모듈 · 호스트 객체 하나.
 *
 * 🔴 ⛔ 여기(pane-ui-system/plugin)는 창틀의 일부지만 도메인을 모른다 — 구조 검사 ⑤가 막는다.
 *    플러그인 실물은 src/plugins/ 바깥에 산다. 이 폴더는 「규격」만 낸다.
 *
 * ⭐ 매니페스트는 신분증이지 기능 목록이 아니다 — contributes 칸을 두지 않는다(실적은 레지스트리가 안다).
 * ⭐ 「코어」는 권한이 아니다 — 받는 호스트 API 는 여느 플러그인과 같다. 다른 점은 「끌 수 없다 · 먼저 산다」 둘뿐.
 *
 * 📌 범위: P1 에서 commands·settings·statusBar·menu·workspace.on·screen·theme·onFirstRun·newTab 를 채웠다.
 *    doc 만 P3 자리로 남는다(선택 멤버).
 */
import type { ComponentType, ReactNode } from 'react';
import type { ViewDef } from '../view-registry';
import type { IconName } from '../primitives/Icon';
import type { MenuEntry } from '../primitives/ContextMenu';

/** 창틀 버전 — manifest.minHostVersion 이 이걸 넘어서면 활성 안 함(버전 비교는 P2). */
export const HOST_VERSION = '0.1.0';

/** 등록을 되돌리는 손잡이(옵시디언 registerEvent 식) — 끌 때 호스트가 주인별로 모아 한꺼번에 부른다. */
export interface Disposable {
    dispose(): void;
}

/** 신분증 — contributes 없음. id 가 저장 키·viewId 접두사·doc.plugins 키의 단일 원본이다(name 은 표시용). */
export interface PluginManifest {
    id: string;              // 'demo' · 'scheduler' — 영문 소문자·하이픈
    name: string;            // 사람에게 보이는 이름
    version: string;         // '0.1.0'
    minHostVersion: string;  // 모자라면 활성 안 함(P2)
    core?: boolean;          // 끌 수 없다 · 먼저 산다. 그뿐이다
    description?: string;
}

/** 플러그인 = 객체 하나(클래스 상속 안 함). activate 는 등록만 한다 — 여기서 탭을 열지 않는다. */
export interface PluginModule {
    manifest: PluginManifest;
    activate: (host: PluginHost) => void | Promise<void>;
    deactivate?: () => void;   // 선택 — 등록물 회수는 호스트가 한다(P2)
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
    reuse?: boolean;
}

/** 명령(command) — 레지스트리에 쌓인다. 리본 동작이 commandId 로 가리킨다. 팔레트·단축키는 ⏸️. */
export interface CommandDef {
    id: string;
    title: string;
    icon?: IconName;
    run(): void;
    keys?: string;
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

/** 문서 이벤트 — 문서 내용이 바뀌거나(change) 새 문서·파일이 열리거나(open) 닫힐 때(close) */
export type DocEvent = 'change' | 'open' | 'close';
/** 플러그인이 읽기만 하는 문서 메타(이름 등) — plugins.* 안은 안 보인다 */
export interface DocMeta { name: string; createdAt: string; updatedAt: string }

/**
 * host.doc — 플러그인이 문서를 만지는 창구(P3). 🔴 ⛔ 자기 칸(plugins.<id>)만 읽고 쓴다.
 *   ⛔ 다른 플러그인 칸·legacy·파일 열기/저장 단추는 안 준다(그건 호스트 것이다).
 *   get/set 은 제 칸 · on 으로 바뀜을 듣고 · meta 는 읽기만.
 */
export interface DocHandle {
    get<T>(): T | undefined;
    set<T>(value: T): void;
    on(ev: DocEvent, cb: () => void): Disposable;
    meta(): DocMeta | undefined;
}

/**
 * 플러그인이 받는 객체 하나 — 창틀의 트리·DOM·localStorage 에 손대는 길은 없다.
 * 🔴 등록 함수는 전부 Disposable 을 돌려준다 — 안 챙겨도 호스트가 주인별로 모아 끌 때 한꺼번에 회수한다.
 */
export interface PluginHost {
    readonly id: string;
    readonly hostVersion: string;

    /** 뷰 등록 — id 는 `${id}.` 로 접두사가 붙는다(host 가 붙인다). newTab 한 칸으로 「+ 새 탭」을 정한다. */
    views: {
        register(def: ViewDef & { newTab?: { label: string } }): Disposable;
        get(id: string): ViewDef | undefined;
        list(): ViewDef[];
        listRibbon(): ViewDef[];
    };
    /** 리본 동작 — commandId 를 가리킨다(「뷰 열기」가 아니라 동작). Rail 이 뷰 설탕과 합쳐 그린다. */
    ribbon: { add(a: RibbonAddInput): Disposable };
    /** 명령 — 레지스트리에만 쌓인다(팔레트는 ⏸️). 리본 동작이 참조한다. */
    commands: { add(c: CommandDef): Disposable };
    /** 설정 — 섹션을 열고(제목은 첫 등록이 이긴다) 항목을 꽂는다. 빈 섹션은 안 그린다. */
    settings: {
        addSection(id: string, title: string, icon?: IconName): Disposable;
        addItem(i: SettingsContribution): Disposable;
    };
    /** 상태바 — side 로 갈라 render 를 그린다. */
    statusBar: { add(i: StatusContribution): Disposable };
    /** 「모든 탭 메뉴」에 항목을 더한다 — 우클릭 때 그 탭 맥락으로 factory 를 부른다. */
    menu: { addTabMenuItem(fn: (ctx: TabMenuContext) => MenuEntry[]): Disposable };
    /** 작업대 조작·구독 — 자리는 힌트까지(where). 트리 모양·setWs·DOM 은 안 준다. */
    workspace: {
        open(viewId: string, o?: WorkspaceOpenOptions): string | null;   // leafId
        close(leafId: string): void;
        on(ev: WorkspaceEvent, fn: (leaf: WorkspaceLeafInfo) => void): Disposable;
    };
    /** 화면 폭 구독 창구 — narrow() 지금값 · on 변화 */
    screen: { narrow(): boolean; on(fn: (narrow: boolean) => void): Disposable };
    /** 테마 구독 창구 — mode() 지금 밝기 · on 변화 */
    theme: { mode(): 'light' | 'dark'; on(fn: (m: 'light' | 'dark') => void): Disposable };
    /** 플러그인별 저장 — storageKey(`plugin.${id}.${key}`). 자기 네임스페이스만. */
    storage: {
        get<T>(key: string, fallback: T): T;
        set(key: string, v: unknown): void;
    };
    /** 저장값 없이, 그 플러그인이 처음 켜질 때 한 번(첫 실행 기본 배치 등). */
    onFirstRun(fn: () => void): void;

    /** 문서(프로젝트 파일) 창구 — 자기 칸만(P3). 호스트(app/document.ts)가 다리를 꽂아야 실동작한다. */
    doc: DocHandle;
}
