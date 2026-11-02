/**
 * 리본 목록 — 🔴 ⭐ host.ribbon.add 로 명시해 꽂은 동작만(쥔님 2026-11-01: *"리본에 요청 안 한 아이콘이 서 있다"*).
 *   ⛔ 그냥 등록만 한 뷰는 리본에 안 선다 — 뷰 자동 줄 세우기(옛 listRibbonViews)를 뺐다. 리본에 올리려면
 *      플러그인이 그 뷰를 여는 명령을 만들고 host.ribbon.add({ commandId }) 로 꽂는다(지금 pane-test·calendar 가 그렇다).
 *
 * 🔴 ⛔ 창틀은 항목의 뜻을 모른다 — Rail·RibbonSheet 가 이 목록을 resolveRibbon(order·hidden)에 태워 그린다.
 */
import type { IconName } from '../primitives/Icon';
import { resolveRibbon, type Ribbon } from '../layout/pane-settings';
import { listRibbonActions } from './store';

export interface RibbonEntry {
    id: string;
    icon?: IconName;
    title: string;
    /** 지금은 전부 동작(명령을 가리킨다) — kind 는 쓰는 쪽이 「뷰냐 동작이냐」로 가지를 치던 흔적이라 남겨 둔다 */
    kind: 'view' | 'action';
    /** 누르면 이걸 부른다(동작은 명령 run) */
    run?: () => void;
}

/** 지금 등록된 리본 동작 — host.ribbon.add 로 꽂은 것만 */
export function ribbonBase(): RibbonEntry[] {
    return listRibbonActions().map((a) => ({
        id: a.id, icon: a.icon, title: a.label, kind: 'action', run: a.run,
    }));
}

/** base 를 저장 배치(order·hidden)에 태운 결과 — Rail·RibbonSheet 공용. */
export function resolveRibbonEntries(ribbon: Ribbon): { ordered: RibbonEntry[]; visible: RibbonEntry[]; hidden: RibbonEntry[] } {
    return resolveRibbon(ribbonBase(), ribbon);
}
