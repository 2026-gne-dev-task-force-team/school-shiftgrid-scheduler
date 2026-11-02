/**
 * 빈 탭 — 「+」가 여는 것. 쥔님 2026-11-01 13:15: *"새 탭이 여전히 표로 뜨네, 그냥 빈 새 탭이 떠야 되는데"*
 *
 * 🔴 앱 자신의 뷰다(주인 'app') — 플러그인이 newTab 을 잡지 않으면 Workbench 가 이걸 연다.
 *    아무것도 안 그린다 — 리본에서 고르면 그 뷰가 **이 탭 자리에** 열리는 게 다음 손(지금은 새 탭으로 열린다).
 *
 * 📌 D5③: 옛 appHost.views.register 가 사라져(선언형 전환 마무리), host.declare 로 꽂는다 — 구현 'Blank' 를 이름으로 가리킨다.
 *    viewId 는 'app.blank'(host 가 접두사를 붙인다) — Workbench 가 그 글자로 연다.
 */
import { createElement } from 'react';
import { makeHost } from '../pane-ui-system/plugin';

function BlankView() {
    return (
        <div className="h-full grid place-items-center select-none">
            <p className="text-[13px] text-muted/60">왼쪽 리본에서 열 것을 고르세요</p>
        </div>
    );
}

makeHost('app', { components: { Blank: () => createElement(BlankView) } })
    .declare({
        kind: 'view',
        id: 'blank', title: '새 탭', icon: 'plus', defaultArea: 'center',
        layout: { minWidth: 120, squeeze: 'shrink' },
        component: 'Blank',
    });

export default BlankView;
