/**
 * 플러그인 시스템 타입 — 매니페스트(신분증) · 모듈 · 호스트 객체 하나.
 *
 * 🔴 ⛔ 여기(pane-ui-system/plugin)는 창틀의 일부지만 도메인을 모른다 — 구조 검사 ⑤가 막는다.
 *    플러그인 실물은 src/plugins/ 바깥에 산다. 이 폴더는 「규격」만 낸다.
 *
 * ⭐ 매니페스트는 신분증이지 기능 목록이 아니다 — contributes 칸을 두지 않는다(실적은 레지스트리가 안다).
 * ⭐ 「코어」는 권한이 아니다 — 받는 호스트 API 는 여느 플러그인과 같다. 다른 점은 「끌 수 없다 · 먼저 산다」 둘뿐.
 *
 * 📌 P0 범위: views.register·ribbon.add·workspace.open/close·storage 만 구현한다.
 *    나머지(commands·settings·statusBar·screen·theme·onFirstRun·doc)는 **타입만** 두고 구현은 TODO(P1~P3).
 *    — 그래서 PluginHost 에서 그들은 선택(optional) 멤버다: 타입은 있고 makeHost 가 아직 안 채운다.
 */
import type { ComponentType } from 'react';
import type { ViewDef } from '../view-registry';
import type { IconName } from '../primitives/Icon';
import type { StatusItem } from '../shell/StatusBar';

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
    where?: 'center' | 'left' | 'right' | 'peek';
    reuse?: boolean;
}

// ── 아래 둘은 P1 자리만(타입) — 지금은 PluginHost 의 선택 멤버에서만 쓰인다 ──
/** 명령(command) — P1. 레지스트리에 쌓일 뿐 아직 아무도 안 읽는다(팔레트·단축키가 생기면). */
export interface CommandDef {
    id: string;
    title: string;
    run(): void;
    keys?: string;
}
/** 설정 기여 — P1. SETTINGS_SECTIONS 상수를 스토어로 바꾸면 여기로 꽂는다. */
export interface SettingsContribution {
    section: string;
    sectionTitle?: string;
    id: string;
    title: string;
    icon: IconName;
    Pane: ComponentType;
}

/**
 * 플러그인이 받는 객체 하나 — 창틀의 트리·DOM·localStorage 에 손대는 길은 없다.
 * 🔴 P0 에서 사는 것: views·ribbon·workspace·storage. 나머지는 선택 멤버(타입만, 구현 TODO).
 */
export interface PluginHost {
    readonly id: string;
    readonly hostVersion: string;

    /** 뷰 등록 — id 는 `${id}.` 로 접두사가 붙는다(host 가 붙인다). get·list 는 바깥이 host 로만 읽게 하는 창구. */
    views: {
        register(def: ViewDef & { newTab?: { label: string } }): Disposable;
        get(id: string): ViewDef | undefined;
        list(): ViewDef[];
        listRibbon(): ViewDef[];
    };
    /** 리본 동작 — 새 스토어(P0 은 쌓기만, Rail 렌더는 노트대로 뒤로). */
    ribbon: { add(a: RibbonAction): Disposable };
    /** 작업대 조작 — 자리는 힌트까지(where). 트리 모양·setWs·DOM 은 안 준다. */
    workspace: {
        open(viewId: string, o?: WorkspaceOpenOptions): string | null;   // leafId
        close(leafId: string): void;
    };
    /** 플러그인별 저장 — storageKey(`plugin.${id}.${key}`). 자기 네임스페이스만. */
    storage: {
        get<T>(key: string, fallback: T): T;
        set(key: string, v: unknown): void;
    };

    // ── P1+ : 타입만 두고 구현 TODO ──
    commands?: { add(c: CommandDef): Disposable };                                   // TODO(P1)
    settings?: { addItem(i: SettingsContribution): Disposable };                     // TODO(P1)
    statusBar?: { add(i: StatusItem): Disposable };                                  // TODO(P1)
    screen?: { narrow(): boolean; on(fn: (narrow: boolean) => void): Disposable };   // TODO(P1)
    theme?: { mode(): 'light' | 'dark'; on(fn: (m: 'light' | 'dark') => void): Disposable }; // TODO(P1)
    onFirstRun?(fn: () => void): void;                                               // TODO(P1)
    doc?: unknown;                                                                    // TODO(P3)
}
