/**
 * 「시수표」 플러그인 — 시수표(demand-table.list)·수요 줄(demand-table.row) 노드 둘 + 표 화면 하나(1.2v 편성기 분해 F3a).
 *   선언형(substitute·staff 와 같은 결) — onActivate 엔 노드 다리만.
 *   교사·반·과목·특별실 이름은 정본(staff·school·subjects·rooms)에서 읽기만 한다 — 정본이 꺼져 있어도 이 조각은 뜬다(supports).
 *   선택 열(공동 담당·특별실·묶음·진도 맞춤·격주·고정, F4)은 표 위 「선택 열」 띠에서 시수표마다 켠다 — 특별실 이름은 정본 rooms 에서 읽는다.
 *   ⛔ 약속(provides)은 아직 없다 — 편성 입력(F5)이 읽을 때 그때 정한다.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, CommandContext } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { PasteBar } from './PasteBar';
import { OptionalColumnsBar } from './OptionalColumnsBar';
import { demandNodeTypes, demandNodeTypeImpl, initDemandTable, getKit } from './nodes';

const SHEET_ID = 'demand-table.sheet';

export const demandTablePlugin = definePlugin({
    manifest: {
        ...manifest,
        requires: { nodes: '^0.1', 'collection': '^0.2' },
        supports: { 'page-doc': '^0.1', staff: '^0.1', school: '^0.1', subjects: '^0.1', rooms: '^0.1' },
        contributes: {
            views: [{
                id: 'sheet', title: '시수표', icon: 'table', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'demand-table.open', title: '시수표 열기', icon: 'table' },
                { id: 'demand-table.openList', title: '시수표 열기(목록)', icon: 'table', palette: false },
            ],
            ribbon: [{ commandId: 'demand-table.open', icon: 'table', order: 6 }],
            nodeTypes: demandNodeTypes,
        },
    },

    components: {
        // 시수표 화면 = 컬렉션 표 + 그 위 엑셀 붙여 넣기 띠(F3b)
        Sheet: ({ host, peek, leaf }) => {
            const k = getKit();
            if (!k) return null;
            return createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
                createElement(OptionalColumnsBar, { kit: k }),
                createElement(PasteBar, { host, kit: k }),
                createElement('div', { style: { flex: 1, minHeight: 0 } }, createElement(k.Tab, { host, peek, leafId: leaf.id })));
        },
    },
    commands: {
        'demand-table.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
        'demand-table.openList': (_host: PluginHost, ctx?: CommandContext) => { getKit()?.openList(ctx?.nodeId); },
    },
    nodeTypes: demandNodeTypeImpl,

    lifecycle: {
        onActivate(host: PluginHost) { initDemandTable(host); },
    },
});

export default demandTablePlugin;
