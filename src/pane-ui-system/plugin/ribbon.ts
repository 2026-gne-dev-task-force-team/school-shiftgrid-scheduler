/**
 * 리본 합치기 — 뷰의 `ribbon` 설탕(「그 뷰 열기」)과 동작 스토어(명령을 가리키는 리본 동작)를 한 목록으로.
 *
 * 🔴 ⛔ 창틀은 항목의 뜻을 모른다 — kind 로 「뷰냐 동작이냐」만 가른다.
 *    Rail·RibbonSheet 가 이 목록을 resolveRibbon(order·hidden)에 태워 그린다. id 를 키로만 쓴다.
 *
 * ⭐ base 순서: 뷰 설탕(ribbon.order) 먼저, 그다음 동작(order). 저장 배치(order)가 있으면 그게 이긴다.
 */
import type { IconName } from '../primitives/Icon';
import { listRibbonViews } from '../view-registry';
import { resolveRibbon, type Ribbon } from '../layout/pane-settings';
import { listRibbonActions } from './store';

export interface RibbonEntry {
    id: string;
    icon?: IconName;
    title: string;
    kind: 'view' | 'action';
    /** 동작일 때만 — 누르면 이걸 부른다(뷰는 바깥이 onOpenView(id) 로 연다) */
    run?: () => void;
}

/** 지금 등록된 리본 뷰 + 동작을 합친 base */
export function ribbonBase(): RibbonEntry[] {
    const views: RibbonEntry[] = listRibbonViews().map((v) => ({
        id: v.id, icon: v.icon, title: v.title, kind: 'view',
    }));
    const actions: RibbonEntry[] = listRibbonActions().map((a) => ({
        id: a.id, icon: a.icon, title: a.label, kind: 'action', run: a.run,
    }));
    return [...views, ...actions];
}

/** base 를 저장 배치(order·hidden)에 태운 결과 — Rail·RibbonSheet 공용. */
export function resolveRibbonEntries(ribbon: Ribbon): { ordered: RibbonEntry[]; visible: RibbonEntry[]; hidden: RibbonEntry[] } {
    return resolveRibbon(ribbonBase(), ribbon);
}
