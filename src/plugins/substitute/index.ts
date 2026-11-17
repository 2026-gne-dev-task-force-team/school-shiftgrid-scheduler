/**
 * 「보결 명단」 플러그인 — 🔴 R4(T-10ey): 교직원 명단(staff) 위 보기 하나 + 옛 노드 타입 둘(이사한 값은 staff 로 갔다).
 *   선언형 — onActivate 엔 노드 다리 + 이사(멱등)만. ⛔ 자기 저장 없음 · ⛔ 약속(provides) 없음.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { substituteNodeTypes, substituteNodeTypeImpl, initSubstitute } from './nodes';
import { SubstituteSheet } from './SubstituteSheet';

const SHEET_ID = 'substitute.sheet';

export const substitutePlugin = definePlugin({
    manifest: {
        ...manifest,
        requires: { nodes: '^0.1' },
        // 🔴 보기는 staff 약속 위에 선다 — 꺼져 있어도 이 조각은 뜬다(안내만).
        supports: { staff: '^0.1' },
        contributes: {
            views: [{
                id: 'sheet', title: '보결 명단', icon: 'userSwap', defaultArea: 'center',
                placement: { areas: ['center'], singleton: true },
                layout: { minWidth: 280, squeeze: 'scroll' },
                component: 'Sheet',
            }],
            commands: [
                { id: 'substitute.open', title: '보결 명단 열기', icon: 'userSwap' },
            ],
            // 🔴 리본 줄 없음 — 「보결」 화면(ops-sub)의 머리줄 「보결 명단 열기」 단추가 이 화면을 연다(T-30g).
            nodeTypes: substituteNodeTypes,
        },
    },

    components: {
        Sheet: ({ host }) => createElement(SubstituteSheet, { host }),
    },
    commands: {
        'substitute.open': (host: PluginHost) => { host.workspace.open(SHEET_ID, { where: 'center' }); },
    },
    nodeTypes: substituteNodeTypeImpl,

    lifecycle: {
        onActivate(host: PluginHost) { initSubstitute(host); },
    },
});

export default substitutePlugin;
