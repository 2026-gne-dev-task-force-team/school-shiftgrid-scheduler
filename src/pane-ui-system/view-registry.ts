/**
 * 뷰 등록소 — leaf 는 viewId(문자열)만 들고, 무엇을 그릴지는 앱이 여기 등록한다.
 *
 * 🔴 ⛔ 이게 「창틀이 도메인을 모른다」를 지키는 장치다. 리본·패널·탭은 전부 이 목록을 읽을 뿐,
 *    viewId 가 무엇을 뜻하는지는 끝내 모른다. 앱이 registerView 로 render 함수·힌트·메뉴를 꽂아 준다.
 *
 * ⭐ 한 뷰가 들고 오는 것(2026-11-01 W4 증축):
 *    - layout : 뷰별 레이아웃 힌트("무슨 콘텐츠냐에 따라" 최소폭·찌그러짐이 다르다 — 쥔님)
 *    - menu   : 내용 메뉴 — 틀 메뉴(＋·가르기·닫기)와 구분된다(쥔님: "틀이 가지는 메뉴랑 내용이 가지는 메뉴는 구분")
 *    - ribbon : 리본(엑셀 상단 리본처럼 앱 실행·동작 아이콘)에 올릴지
 *    - placement : 🔴 자리 제한 — areas(어느 틀) · split(가를 수 있나) · singleton(딱 한 장만). 아래 설명.
 *
 * ⚠️ 모듈 전역 Map 이다(순수하지 않다) — 등록은 본래 부수효과다. tree.ts 와 달리 여기선 괜찮다.
 */
import type { ComponentType } from 'react';
import type { Leaf } from './layout/tree';
import type { ViewLayout } from './layout/clamp';
import type { IconName } from './primitives/Icon';
import type { MenuEntry } from './primitives/ContextMenu';

/** 뷰 몸통이 받는 것 — 자기 leaf + 지금 제 칸의 크기·접힘 상태 */
export interface ViewProps {
    leaf: Leaf;
    /** 지금 이 뷰가 차지한 칸의 폭·높이(px) — 창틀이 재서 준다 */
    width: number;
    height: number;
    /** squeeze='collapse' 이고 폭이 collapseBelow 아래면 true — 뷰가 접힌 그림을 그린다 */
    collapsed: boolean;
}

/** 내용 메뉴가 쓸 수 있는 틀 기능 — 창틀이 내주는 공통 조작(도메인 모름). 뷰가 골라 라벨만 붙인다 */
export interface ViewMenuHost {
    /** 이 leaf 의 제목을 바꾼다 */
    rename: (title: string) => void;
    /** 이 leaf 를 닫는다 */
    close: () => void;
}

/** 내용 메뉴 factory — leaf 와 틀 기능(host)을 받아 메뉴 항목을 돌려준다 */
export type ViewMenu = (leaf: Leaf, host: ViewMenuHost) => MenuEntry[];

export interface ViewDef {
    id: string;
    title: string;
    icon?: IconName;
    /** 어느 자리에 처음 열릴지(앱·리본 참고용 힌트) */
    defaultArea?: 'left' | 'center' | 'right';
    Component: ComponentType<ViewProps>;
    /** 🔴 뷰별 레이아웃 힌트 — 등록값은 기본일 뿐, 설정이 덮을 수 있다(pane-settings) */
    layout?: ViewLayout;
    /** 🔴 내용 메뉴 — 탭 우클릭 메뉴의 구분선 아래쪽에 붙는다 */
    menu?: ViewMenu;
    /** 리본에 올릴지. { order } 면 그 순서로 선다 · false·생략이면 리본에 없다 */
    ribbon?: { order?: number } | false;
    /**
     * 🔴 자리 제한 — 어디에·어떻게 놓일 수 있나. 생략이면 전부 허용. 세 축:
     *    - areas     : 어느 틀(left·center·right)에 놓일 수 있나. 생략이면 전부.
     *    - split     : 이 뷰를 가를 수 있나(복제해 옆에). 생략/true 가르기 허용 · false 금지.
     *    - singleton : 🔴 딱 한 장만 뜨나. 이미 떠 있으면 새로 안 열고 그리로 간다(id 고정 재사용).
     *                  ⛔ 싱글턴은 복제가 곧 「둘」이라 가를 수 없다 — canSplit 이 자동으로 막는다.
     *    쥔님 2026-11-01 13:43: *"콘텐츠마다 탭으로/사이드바로/분할할 수 있는지 제한을 걸어야"* ·
     *      *"스플릿할 수 있는가 · 딱 한 창만 띄울 수 있는가 그거 두 개 다 하자"*(두 축).
     *    🔴 메뉴·드래그·키보드·workspace.open 이 전부 이 셋(canPlace·canSplit·isSingleton)으로 묻는다 —
     *       한 곳만 막으면 다른 길로 뚫린다. ⛔ 창틀은 뷰가 뭔지는 여전히 모른다.
     */
    placement?: {
        areas?: ('left' | 'center' | 'right')[];
        split?: boolean;
        singleton?: boolean;
    };
}

const registry = new Map<string, ViewDef>();

/** 이 뷰가 그 자리에 갈 수 있나(등록 안 된 뷰는 전부 허용 — 꺼진 플러그인 자리표시를 옮길 수 있어야 한다) */
export function canPlace(viewId: string, area: 'left' | 'center' | 'right'): boolean {
    const p = registry.get(viewId)?.placement;
    return !p?.areas || p.areas.includes(area);
}
/** 이 뷰를 가를 수 있나 — split=false 면 금지. 🔴 싱글턴도 못 가른다(복제하면 「딱 한 장」이 깨진다). */
export function canSplit(viewId: string): boolean {
    const p = registry.get(viewId)?.placement;
    return p?.split !== false && p?.singleton !== true;
}
/** 이 뷰가 싱글턴인가 — 열기(workspace.open·리본)가 「이미 있으면 그리로」로 가는 판정. */
export function isSingleton(viewId: string): boolean {
    return registry.get(viewId)?.placement?.singleton === true;
}

export function registerView(def: ViewDef): void {
    registry.set(def.id, def);
}

/** 등록을 되돌린다 — 호스트의 Disposable 이 부른다(P2 비활성에서 뷰가 자리표시로 바뀌는 자리). */
export function unregisterView(id: string): void {
    registry.delete(id);
}

export function getView(id: string): ViewDef | undefined {
    return registry.get(id);
}

export function listViews(): ViewDef[] {
    return [...registry.values()];
}

/**
 * 리본에 올릴 뷰들 — ribbon 이 객체인 것만, order 오름차순(없으면 0).
 * 🔴 Array.sort 는 안정 정렬이라 order 가 같으면 등록 순서가 남는다.
 */
export function listRibbonViews(): ViewDef[] {
    return [...registry.values()]
        .filter((v): v is ViewDef & { ribbon: { order?: number } } => !!v.ribbon)
        .sort((a, b) => (a.ribbon.order ?? 0) - (b.ribbon.order ?? 0));
}

/** 테스트·앱 재마운트에서 목록을 비운다 */
export function clearViews(): void {
    registry.clear();
}
