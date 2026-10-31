/**
 * 문서 데모 플러그인 — ⭐ P3 증명. host.doc 왕복을 하나로 보여 준다.
 *   뷰(메모) · 명령+리본 동작(메모 열기) · host.doc.set/get/on.
 *   ⛔ activate 는 등록만 한다 — 여기서 탭을 열지 않는다.
 * 🔴 ⛔ demo 플러그인(index.ts)은 손대지 않는다 — P4 머지 충돌을 피해 이 작은 플러그인을 따로 둔다.
 */
import type { PluginModule, PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { makeMemoView } from './views/MemoView';

function activate(host: PluginHost): void {
    // 메모 뷰 — host 는 클로저로 넘긴다(ViewProps 를 안 건드린다). singleton 으로 한 장만.
    host.views.register({
        id: 'memo', title: '메모', icon: 'edit', defaultArea: 'center',
        singleton: true,
        layout: { minWidth: 240, squeeze: 'scroll' },
        Component: makeMemoView(host),
    });

    // 명령 + 리본 동작: 「메모 열기」 (= doc-demo.memo 를 가운데에, 있으면 그 탭으로)
    host.commands.add({
        id: 'doc-demo.open-memo', title: '메모 열기', icon: 'edit',
        run: () => { host.workspace.open('doc-demo.memo', { where: 'center', reuse: true }); },
    });
    host.ribbon.add({ commandId: 'doc-demo.open-memo', icon: 'edit', order: 4 });
}

export const docDemoPlugin: PluginModule = { manifest, activate };
export default docDemoPlugin;
