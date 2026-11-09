/**
 * 선언형 기여(contributes) · 동적 선언(host.declare) 증명 — 선언형 전환 D0(+ D0+ host 바인딩).
 *
 * ⭐ 재는 것 다섯:
 *   ① contributes(뷰·명령·리본·설정·상태바)로 적은 가짜 플러그인이 켜지면 레지스트리에 들어가고,
 *      🔴 명령은 (host, ctx) 를, 뷰 컴포넌트는 props.host 를 받는다(호스트가 꽂을 때 바인딩 — 안드로이드 Context)
 *   ② 이름이 구현에 없는 가짜 플러그인은 「활성 실패」로 보인다(조용히 안 넘어간다)
 *   ③ host.declare 가 같은 결과를 내고 같은 host 를 바인딩하고, dispose 로 빠지고, 이름 없으면 던진다
 *   ④ 옛 길(onActivate 안에서 host.views.register·host.commands.add 함수 직접)로도 그대로 켜진다
 *   ⑤ 활성 순서: contributes → lifecycle.onActivate
 *
 * 🔴 모듈 전역 스토어·뷰 레지스트리라 테스트끼리 안 번지게 beforeEach 에서 비운다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import type { ViewProps } from '../view-registry';
import { getView, clearViews } from '../view-registry';
import type { PluginModule, PluginImpl, PluginHost, CommandContext } from './types';
import { definePlugin } from './define';
import { makeHost } from './host';
import { activateAll, listPlugins } from './registry';
import {
    disposeOwner, getCommand, listRibbonActions, listSettings, listStatusItems,
} from './store';

// host 를 받아 그리는 가짜 구현 — host.id 를 props 에 담아 되비춘다(테스트가 element.props.host 로 읽는다).
const hostView: ComponentType<ViewProps & { host: PluginHost }> = (p) => createElement('div', { 'data-host': p.host.id });
const hostPane: ComponentType<{ host: PluginHost }> = (p) => createElement('div', { 'data-host': p.host.id });

/** 등록된 뷰(래퍼)를 가짜 props 로 불러 element.props.host.id 를 꺼낸다 — 렌더 없이 host 바인딩을 본다. */
const FAKE_VIEW_PROPS = {} as unknown as ViewProps;
function viewHostId(viewId: string): string | undefined {
    const C = getView(viewId)!.Component as unknown as (p: ViewProps) => ReactElement;
    return (C(FAKE_VIEW_PROPS).props as { host?: PluginHost }).host?.id;
}

/** 쓰는 주인들을 깨끗이 — 뷰 레지스트리까지 비운다(모듈 전역). */
const OWNERS = ['cfake', 'badfake', 'dyn', 'lifefake', 'explorer', 'ntfake', 'ntbad'];
beforeEach(() => {
    for (const o of OWNERS) disposeOwner(o);
    clearViews();
});

describe('① contributes 로 적은 가짜 플러그인이 켜지면 레지스트리에 들어가고 host 가 바인딩된다', () => {
    it('뷰·명령·리본·설정·상태바가 전부 꽂히고, 명령은 (host,ctx) 를·뷰는 props.host 를 받는다', () => {
        let cmdHostId: string | undefined;
        let cmdLeafId: string | undefined;
        const fake = definePlugin({
            manifest: {
                id: 'cfake', name: 'C Fake', version: '0.1.0', minHostVersion: '0.1.0',
                contributes: {
                    views: [{ id: 'board', title: '보드', icon: 'play', defaultArea: 'center', component: 'Board' }],
                    commands: [{ id: 'cfake.open', title: '보드 열기', icon: 'play' }],
                    ribbon: [{ commandId: 'cfake.open' }],
                    settings: {
                        sections: [{ id: 'cfake', title: '씨페이크' }],
                        items: [{ section: 'cfake', id: 'main', title: '설정', icon: 'info', pane: 'Main' }],
                    },
                    statusBar: [{ id: 'count', side: 'left', render: 'Count' }],
                },
            },
            components: { Board: hostView },
            // 🔴 명령은 첫 인자로 host, 둘째로 ctx — 둘 다 받아 기록한다
            commands: { 'cfake.open': (host: PluginHost, ctx?: CommandContext) => { cmdHostId = host.id; cmdLeafId = ctx?.leafId; } },
            panes: { Main: hostPane },
            renders: { Count: (host: PluginHost) => host.id },
        });

        activateAll([fake]);

        expect(getView('cfake.board'), '뷰가 접두사 붙어 등록').toBeTruthy();
        expect(getCommand('cfake.open')?.title).toBe('보드 열기');
        expect(listRibbonActions().some((a) => a.id === 'cfake.open'), '리본이 명령을 가리킴').toBe(true);
        expect(listSettings().find((s) => s.id === 'cfake')?.items.map((i) => i.id)).toEqual(['main']);
        expect(listStatusItems().some((s) => s.owner === 'cfake' && s.id === 'count')).toBe(true);
        expect(listPlugins().find((p) => p.id === 'cfake')?.failed).toBe(false);

        // 🔴 명령 run 이 host 와 ctx 를 둘 다 받는다
        getCommand('cfake.open')!.run({ leafId: 'L7' });
        expect(cmdHostId, '명령이 host 를 받는다').toBe('cfake');
        expect(cmdLeafId, '명령이 ctx 를 받는다').toBe('L7');

        // 🔴 뷰 컴포넌트 props 에 host 가 온다
        expect(viewHostId('cfake.board'), '뷰 컴포넌트 props.host').toBe('cfake');
    });
});

describe('② 이름이 구현에 없으면 활성 실패', () => {
    it('component 가 components 에 없는 플러그인은 failed, 아무것도 안 꽂힌다', () => {
        // ⚠️ definePlugin 은 이름을 컴파일 때 막으니(③ 방어) 여기선 생 PluginModule 로 어긋남을 만든다 — 런타임 방어를 본다.
        const bad: PluginModule = {
            manifest: {
                id: 'badfake', name: 'Bad', version: '0.1.0', minHostVersion: '0.1.0',
                contributes: { views: [{ id: 'x', title: 'X', component: 'Ghost' }] },
            },
            components: { Real: hostView },   // 'Ghost' 는 없다
        };

        activateAll([bad]);

        expect(listPlugins().find((p) => p.id === 'badfake')?.failed, '이름 어긋남은 활성 실패로').toBe(true);
        expect(getView('badfake.x'), '실패한 플러그인의 뷰는 안 꽂힌다').toBeUndefined();
    });
});

describe('③ host.declare 가 같은 결과를 내고 같은 host 를 바인딩한다', () => {
    it('declare 로 명령·뷰가 꽂히고 host 를 받고, dispose 로 빠지고, 이름 없으면 던진다', () => {
        let ran = 0;
        let declHostId: string | undefined;
        const impl: PluginImpl = {
            components: { Dash: hostView },
            commands: { 'dyn.go': (host) => { ran += 1; declHostId = host.id; } },
        };
        const h = makeHost('dyn', impl);

        const dCmd = h.declare({ kind: 'command', id: 'dyn.go', title: '가기' });
        const dView = h.declare({ kind: 'view', id: 'dash', title: '대시', component: 'Dash' });

        expect(getCommand('dyn.go')?.title).toBe('가기');
        expect(getView('dyn.dash')).toBeTruthy();
        getCommand('dyn.go')!.run();
        expect(ran).toBe(1);
        // 🔴 declare 로 꽂은 명령도 같은 host 를 받는다
        expect(declHostId, 'declare 명령이 같은 host').toBe('dyn');
        // 🔴 declare 로 꽂은 뷰도 props.host 를 받는다
        expect(viewHostId('dyn.dash'), 'declare 뷰 props.host').toBe('dyn');

        dCmd.dispose(); dView.dispose();
        expect(getCommand('dyn.go')).toBeUndefined();
        expect(getView('dyn.dash')).toBeUndefined();

        // 이름이 impl 에 없으면 던진다(옛 register 보다 더 받지 않는다 — 이름으로만)
        expect(() => h.declare({ kind: 'view', id: 'z', title: 'Z', component: 'Nope' })).toThrow();
    });
});

// ④ 「옛 길(onActivate 안 host.views.register·host.commands.add 직접 등록)」 케이스는 D5③ 에서 그 5종을 지워
//    길 자체가 없어졌으므로 제거했다(선언형 전환 마무리 — 플러그인이 꽂는 길은 contributes·declare 둘뿐).

describe('⑥ contributes.nodeTypes 는 nodes 인터페이스 모듈(host.modules.use)에 통째로 넘어간다', () => {
    /** nodes 를 채우는 가짜 제공자(코어 — 먼저 산다). registerContributed 가 받은 것을 기록한다. */
    function registrar(got: { type: string; implHas: boolean; hostId?: string }[]): PluginModule {
        return {
            manifest: {
                id: 'nodes-prov', name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
                provides: { nodes: '0.1.0' },
                // 🔴 3판 — nodes 약속을 이 가짜가 직접 선언도 한다(약속 플러그인이 없으면 provides 도 「약속 없음」으로 막힌다).
                contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
            },
            modules: {
                nodes: {
                    registerContributed(item: { type: string }, impl: PluginImpl, host: PluginHost) {
                        got.push({ type: item.type, implHas: !!impl.nodeTypes, hostId: host.id });
                        return { dispose() { /* 테스트 */ } };
                    },
                },
            },
        };
    }

    it('nodeTypes 를 적은 플러그인(requires.nodes)이 켜지면 모듈이 항목·impl·host 를 받는다', () => {
        const got: { type: string; implHas: boolean; hostId?: string }[] = [];
        const consumer = definePlugin({
            manifest: {
                id: 'ntfake', name: 'NT', version: '0.1.0', minHostVersion: '0.1.0',
                requires: { nodes: '^0.1' },
                contributes: { nodeTypes: [{ type: 'ntfake.box', label: '상자', impl: 'boxFns' }] },
            },
            nodeTypes: { boxFns: { open: () => { /* 함수 묶음 */ } } },
        });

        activateAll([registrar(got), consumer]);

        expect(got.length, '모듈이 한 번 불린다').toBe(1);
        expect(got[0].type).toBe('ntfake.box');
        expect(got[0].implHas, 'impl(함수 묶음)이 모듈로 넘어간다').toBe(true);
        expect(got[0].hostId, '그 플러그인 host 가 넘어간다').toBe('ntfake');
        expect(listPlugins().find((p) => p.id === 'ntfake')?.failed).toBe(false);
    });

    it('nodeTypes 인데 requires.nodes 를 선언 안 하면 blocked(호스트 검사 — 조용히 안 넘어간다)', () => {
        const consumer: PluginModule = {
            manifest: {
                id: 'ntbad', name: 'NTB', version: '0.1.0', minHostVersion: '0.1.0',
                contributes: { nodeTypes: [{ type: 'ntbad.box', label: '상자' }] },
            },
        };
        activateAll([registrar([]), consumer]);
        const p = listPlugins().find((x) => x.id === 'ntbad')!;
        expect(p.blocked, 'requires.nodes 선언이 없으면 blocked').toBe(true);
        expect(p.reason).toContain('requires.nodes');
    });

    it('requires.nodes 는 선언했지만 제공자가 없으면 blocked(활성 실패 아님)', () => {
        const consumer: PluginModule = {
            manifest: {
                id: 'ntnoprov', name: 'NTN', version: '0.1.0', minHostVersion: '0.1.0',
                requires: { nodes: '^0.1' },
                contributes: { nodeTypes: [{ type: 'ntnoprov.box', label: '상자' }] },
            },
        };
        activateAll([consumer]);   // nodes 제공자 없음
        const p = listPlugins().find((x) => x.id === 'ntnoprov')!;
        expect(p.blocked).toBe(true);
        expect(p.failed).toBe(false);
    });
});

describe('⑤ 활성 순서 — contributes → lifecycle.onActivate', () => {
    it('contributes 가 먼저라 onActivate 시점에 명령이 이미 보인다', () => {
        const order: string[] = [];
        const life = definePlugin({
            manifest: {
                id: 'lifefake', name: 'Life', version: '0.1.0', minHostVersion: '0.1.0',
                contributes: { commands: [{ id: 'lifefake.a', title: 'A' }] },
            },
            commands: { 'lifefake.a': () => { /* 동작 */ } },
            lifecycle: { onActivate: () => { order.push(getCommand('lifefake.a') ? 'onActivate(뒤:contributes 보임)' : 'onActivate'); } },
        });

        activateAll([life]);

        // contributes 가 먼저라 onActivate 시점에 명령이 이미 보인다
        expect(order).toEqual(['onActivate(뒤:contributes 보임)']);
    });
});
