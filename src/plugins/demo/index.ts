/**
 * 데모 플러그인 — ⭐ 이 파일 + manifest.ts + views/ 가 플러그인의 전부다.
 *   activate 안에서 뷰 넷을 host.views.register 로 꽂는다(id 는 host 가 demo. 접두사를 붙인다).
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(열면 켤 때마다 탭이 는다).
 *
 * 🔴 ⛔ 창틀은 이 폴더를 모른다. 바깥으로 나가는 유일한 값은 PluginModule 하나(default)다.
 * 📌 「설정」 뷰가 여기 있는 건 P0 임시다 — 노트 🙋1(코어 플러그인 settings)은 쥔님 결정 대기.
 */
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { SheetView } from './views/SheetView';
import { EmptyView } from './views/EmptyView';

function activate(host: PluginHost): void {
    // 표 — 좁아지면 스크롤 · 리본 0번 · 내용 메뉴로 이름 바꾸기
    host.views.register({
        id: 'sheet', title: '표', icon: 'table', defaultArea: 'center', Component: SheetView,
        layout: { minWidth: 240, squeeze: 'scroll' },
        ribbon: { order: 0 },
        menu: (lf, h) => [
            {
                label: '이름 바꾸기', icon: 'edit',
                onClick: () => { const n = window.prompt('새 이름', lf.title); if (n && n.trim()) h.rename(n.trim()); },
            },
        ],
    });
    // 개요 — 왼쪽 기본 · 리본 1번
    host.views.register({
        id: 'outline', title: '개요', icon: 'layers', defaultArea: 'left', Component: EmptyView,
        layout: { minWidth: 180, squeeze: 'shrink' }, ribbon: { order: 1 },
    });
    // 속성 — 오른쪽 기본 · 리본 2번
    host.views.register({
        id: 'props', title: '속성', icon: 'info', defaultArea: 'right', Component: EmptyView,
        layout: { minWidth: 200, squeeze: 'shrink' }, ribbon: { order: 2 },
    });
}

export const demoPlugin: PluginModule = { manifest, activate };
export default demoPlugin;
