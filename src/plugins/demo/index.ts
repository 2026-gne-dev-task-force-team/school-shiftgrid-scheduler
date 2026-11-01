/**
 * 데모 플러그인 — ⭐ 플러그인 기여점 전부를 하나로 증명한다.
 *   뷰(표·개요·속성·정보) · 명령+리본 동작(새 표) · 상태바(열린 탭 N·저장됨) ·
 *   설정 섹션(데모) · 탭 메뉴(이 탭 정보 → 피크) · 작업대 이벤트(탭 수 세기) · 저장(마지막 연 탭).
 *
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다(열면 켤 때마다 탭이 는다).
 * 🔴 ⛔ 창틀은 이 폴더를 모른다. 바깥으로 나가는 값은 PluginModule 하나뿐이다.
 */
import { createElement } from 'react';
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { SheetView } from './views/SheetView';
import { EmptyView } from './views/EmptyView';
import { AboutView, ManifestCard } from './views/AboutView';

const hhmm = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function activate(host: PluginHost): void {
    // ── 뷰 ──
    // 표 — 좁아지면 스크롤 · 내용 메뉴로 이름 바꾸기. ⛔ 리본 설탕 없음(새 표는 동작이다)
    // ⛔ newTab 을 안 잡는다 — 쥔님 2026-11-01 13:15 *"+ 는 그냥 빈 새 탭이 떠야 되는데"*(빈 탭은 앱의 app.blank)
    host.views.register({
        id: 'sheet', title: '표', icon: 'table', defaultArea: 'center', Component: SheetView,
        layout: { minWidth: 240, squeeze: 'scroll' },
        menu: (lf, h) => [
            {
                label: '이름 바꾸기', icon: 'edit',
                onClick: () => { const n = window.prompt('새 이름', lf.title); if (n && n.trim()) h.rename(n.trim()); },
            },
        ],
    });
    // 개요 — 왼쪽 기본 · 리본 설탕 1번
    host.views.register({
        id: 'outline', title: '개요', icon: 'layers', defaultArea: 'left', Component: EmptyView,
        layout: { minWidth: 180, squeeze: 'shrink' }, ribbon: { order: 1 },
    });
    // 속성 — 오른쪽 기본 · 리본 설탕 2번
    host.views.register({
        id: 'props', title: '속성', icon: 'info', defaultArea: 'right', Component: EmptyView,
        layout: { minWidth: 200, squeeze: 'shrink' }, ribbon: { order: 2 },
    });
    // 정보 — 피크로 매니페스트를 띄우는 뷰(탭 메뉴가 연다)
    host.views.register({
        id: 'about', title: '데모 정보', icon: 'info', defaultArea: 'center', Component: AboutView,
        singleton: true, layout: { minWidth: 260 },
    });

    // ── 명령 + 리본 동작: 「새 표」는 뷰가 아니라 동작이다(엑셀 리본) ──
    host.commands.add({
        id: 'demo.new-sheet', title: '새 표', icon: 'plus',
        run: () => { host.workspace.open('demo.sheet', { where: 'center' }); },
    });
    host.ribbon.add({ commandId: 'demo.new-sheet', icon: 'plus', order: 0 });

    // ── 상태바 — app 이 아니라 데모가 꽂는다. 작업대 이벤트로 열린 탭 수를 센다 ──
    const openLeaves = new Set<string>();
    let savedAt = new Date();
    host.statusBar.add({ id: 'tab-count', side: 'left', render: () => `열린 탭 ${openLeaves.size}` });
    host.statusBar.add({ id: 'saved', side: 'right', render: () => `저장됨 ${hhmm(savedAt)}` });
    host.workspace.on('open', (l) => { openLeaves.add(l.id); savedAt = new Date(); });
    host.workspace.on('close', (l) => { openLeaves.delete(l.id); savedAt = new Date(); });
    // 저장 증명 — 마지막으로 활성화한 뷰를 기기별 저장에 남긴다(자기 네임스페이스)
    host.workspace.on('activate', (l) => { host.storage.set('last-view', l.viewId); });

    // ── 설정 「데모」 섹션 + 정보 판(설정 기여점 증명) ──
    host.settings.addSection('demo', '데모', 'sparkles');
    host.settings.addItem({
        section: 'demo', id: 'about', title: '이 플러그인 정보', icon: 'info',
        Pane: () => createElement(ManifestCard, { manifest }),
    });

    // ── 탭 메뉴: 「이 탭 정보」 → 피크로 매니페스트(host.menu + 피크 증명) ──
    host.menu.addTabMenuItem((ctx) => [
        {
            label: '이 탭 정보', icon: 'info',
            onClick: () => host.workspace.open('demo.about', {
                where: 'peek', reuse: true, title: '데모 정보', params: { aboutViewId: ctx.viewId },
            }),
        },
    ]);
}

export const demoPlugin: PluginModule = { manifest, activate };
export default demoPlugin;
