/**
 * 「레코드 뷰 연습장」 꾸러미 — 공통 목록 화면 부품(레코드 뷰)을 직접 만져 보는 하네스.
 *   선언형(contributes)으로 뷰·명령·리본을 적고, 실행 컴포넌트·명령은 이름으로 가리킨다(선언형 전환 결).
 *   🔴 도메인 모듈(사람·계정…)의 화면을 갈아끼우는 건 이 판이 아니다 — 여기선 부품 + 연습장까지.
 */
import { createElement } from 'react';
import { definePlugin } from '../../pane-ui-system/plugin';
import type { PluginHost, ViewContribution, CommandContribution } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import { PlaygroundView } from './views/PlaygroundView';

const VIEW_ID = 'record-playground.playground';
const OPEN_CMD = 'record-playground.open';

const components = {
    Playground: () => createElement(PlaygroundView),
};

const commands: Record<string, (host: PluginHost) => void> = {
    [OPEN_CMD]: (host) => { host.workspace.open(VIEW_ID, { where: 'center' }); },
};

const viewDefs: ViewContribution<'Playground'>[] = [
    {
        id: 'playground', title: '레코드 뷰 연습장', icon: 'table', defaultArea: 'center',
        placement: { areas: ['center'], singleton: true },
        layout: { minWidth: 300, squeeze: 'scroll' },
        component: 'Playground',
    },
];

const commandDefs: CommandContribution[] = [
    { id: OPEN_CMD, title: '레코드 뷰 연습장 열기', icon: 'table' },
];

export const recordPlaygroundPlugin = definePlugin({
    manifest: {
        ...manifest,
        contributes: {
            views: viewDefs,
            commands: commandDefs,
            ribbon: [{ commandId: OPEN_CMD, icon: 'table', order: 20 }],
        },
    },
    components,
    commands,
});
export default recordPlaygroundPlugin;
