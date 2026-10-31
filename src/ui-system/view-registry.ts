/**
 * 뷰 등록소 — leaf 는 viewId(문자열)만 들고, 무엇을 그릴지는 앱이 여기 등록한다.
 *
 * 🔴 ⛔ 이게 「창틀이 도메인을 모른다」를 지키는 장치다. 리본·패널·탭은 전부 이 목록을 읽을 뿐,
 *    viewId 가 무엇을 뜻하는지는 끝내 모른다. 앱이 registerView 로 render 함수를 꽂아 준다.
 *
 * ⚠️ 모듈 전역 Map 이다(순수하지 않다) — 등록은 본래 부수효과다. tree.ts 와 달리 여기선 괜찮다.
 */
import type { ComponentType } from 'react';
import type { Leaf } from './layout/tree';
import type { IconName } from './primitives/Icon';

/** 뷰 몸통이 받는 것 — 자기 leaf 하나. params·title 은 여기 들어 있다 */
export interface ViewProps {
    leaf: Leaf;
}

export interface ViewDef {
    id: string;
    title: string;
    icon?: IconName;
    /** 어느 자리에 처음 열릴지(앱 참고용 힌트) */
    defaultArea?: 'left' | 'center' | 'right';
    Component: ComponentType<ViewProps>;
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

/** 테스트·앱 재마운트에서 목록을 비운다 */
export function clearViews(): void {
    registry.clear();
}
