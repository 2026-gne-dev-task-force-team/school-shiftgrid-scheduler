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
 *    - singleton : 한 번에 하나만 열리나(설정처럼) — id 고정 재사용
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
    /** 한 번에 하나만(설정처럼) — id 고정 재사용 */
    singleton?: boolean;
}

const registry = new Map<string, ViewDef>();

export function registerView(def: ViewDef): void {
    registry.set(def.id, def);
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
