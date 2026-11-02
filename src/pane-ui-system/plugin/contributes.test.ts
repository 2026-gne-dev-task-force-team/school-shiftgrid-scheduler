/**
 * 선언형 기여(contributes) · 동적 선언(host.declare) 증명 — 선언형 전환 D0.
 *
 * ⭐ 재는 것 다섯:
 *   ① contributes(뷰·명령·리본·설정·상태바)로 적은 가짜 플러그인이 켜지면 레지스트리에 들어간다
 *   ② 이름이 구현에 없는 가짜 플러그인은 「활성 실패」로 보인다(조용히 안 넘어간다)
 *   ③ host.declare 가 같은 결과를 내고, dispose 로 빠지고, 이름 없으면 던진다
 *   ④ 옛 길(activate 안에서 host.views.register·host.commands.add 함수 직접)로도 그대로 켜진다
 *   ⑤ 활성 순서: contributes → activate → lifecycle.onActivate
 *
 * 🔴 모듈 전역 스토어·뷰 레지스트리라 테스트끼리 안 번지게 beforeEach 에서 비운다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import type { ViewProps } from '../view-registry';
import { getView, clearViews } from '../view-registry';
import type { PluginModule } from './types';
import { definePlugin } from './define';
import { makeHost } from './host';
import { activateAll, listPlugins } from './registry';
import {
    disposeOwner, getCommand, listRibbonActions, listSettings, listStatusItems,
} from './store';

const viewFn = (() => null) as unknown as ComponentType<ViewProps>;
const paneFn = (() => null) as unknown as ComponentType;

/** 쓰는 주인들을 깨끗이 — 뷰 레지스트리까지 비운다(모듈 전역). */
const OWNERS = ['cfake', 'badfake', 'dyn', 'oldfake', 'lifefake'];
beforeEach(() => {
    for (const o of OWNERS) disposeOwner(o);
    clearViews();
});

describe('① contributes 로 적은 가짜 플러그인이 켜지면 레지스트리에 들어간다', () => {
    it('뷰·명령·리본·설정·상태바가 전부 꽂힌다 + 활성 실패 아님', () => {
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
            components: { Board: viewFn },
            commands: { 'cfake.open': () => { /* 동작 */ } },
            panes: { Main: paneFn },
            renders: { Count: () => '0' },
        });

        activateAll([fake]);

        expect(getView('cfake.board'), '뷰가 접두사 붙어 등록').toBeTruthy();
        expect(getCommand('cfake.open')?.title).toBe('보드 열기');
        expect(listRibbonActions().some((a) => a.id === 'cfake.open'), '리본이 명령을 가리킴').toBe(true);
        expect(listSettings().find((s) => s.id === 'cfake')?.items.map((i) => i.id)).toEqual(['main']);
        expect(listStatusItems().some((s) => s.owner === 'cfake' && s.id === 'count')).toBe(true);
        expect(listPlugins().find((p) => p.id === 'cfake')?.failed).toBe(false);
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
            components: { Real: viewFn },   // 'Ghost' 는 없다
        };

        activateAll([bad]);

        expect(listPlugins().find((p) => p.id === 'badfake')?.failed, '이름 어긋남은 활성 실패로').toBe(true);
        expect(getView('badfake.x'), '실패한 플러그인의 뷰는 안 꽂힌다').toBeUndefined();
    });
});

describe('③ host.declare 가 같은 결과를 낸다', () => {
    it('declare 로 명령·뷰가 꽂히고, dispose 로 빠지고, 이름 없으면 던진다', () => {
        let ran = 0;
        const impl = {
            components: { Dash: viewFn },
            commands: { 'dyn.go': () => { ran += 1; } },
        };
        const h = makeHost('dyn', impl);

        const dCmd = h.declare({ kind: 'command', id: 'dyn.go', title: '가기' });
        const dView = h.declare({ kind: 'view', id: 'dash', title: '대시', component: 'Dash' });

        expect(getCommand('dyn.go')?.title).toBe('가기');
        expect(getView('dyn.dash')).toBeTruthy();
        getCommand('dyn.go')!.run();
        expect(ran).toBe(1);

        dCmd.dispose(); dView.dispose();
        expect(getCommand('dyn.go')).toBeUndefined();
        expect(getView('dyn.dash')).toBeUndefined();

        // 이름이 impl 에 없으면 던진다(옛 register 보다 더 받지 않는다 — 이름으로만)
        expect(() => h.declare({ kind: 'view', id: 'z', title: 'Z', component: 'Nope' })).toThrow();
    });
});

describe('④ 옛 길(activate 안 함수 직접 등록)로도 그대로 켜진다', () => {
    it('host.views.register·host.commands.add 를 activate 에서 부르면 등록된다', () => {
        const old: PluginModule = {
            manifest: { id: 'oldfake', name: 'Old', version: '0.1.0', minHostVersion: '0.1.0' },
            activate(host) {
                host.views.register({ id: 'v', title: '옛뷰', defaultArea: 'center', Component: viewFn });
                host.commands.add({ id: 'oldfake.cmd', title: '옛명령', run: () => { /* 동작 */ } });
            },
        };

        activateAll([old]);

        expect(getView('oldfake.v')).toBeTruthy();
        expect(getCommand('oldfake.cmd')).toBeTruthy();
        expect(listPlugins().find((p) => p.id === 'oldfake')?.failed).toBe(false);
    });
});

describe('⑤ 활성 순서 — contributes → activate → lifecycle.onActivate', () => {
    it('셋이 적힌 순서대로 돈다', () => {
        const order: string[] = [];
        const life = definePlugin({
            manifest: {
                id: 'lifefake', name: 'Life', version: '0.1.0', minHostVersion: '0.1.0',
                contributes: { commands: [{ id: 'lifefake.a', title: 'A' }] },
            },
            commands: { 'lifefake.a': () => { /* 동작 */ } },
            activate: () => { order.push(getCommand('lifefake.a') ? 'activate(뒤:contributes 보임)' : 'activate'); },
            lifecycle: { onActivate: () => { order.push('onActivate'); } },
        });

        activateAll([life]);

        // contributes 가 먼저라 activate 시점에 명령이 이미 보인다 · onActivate 는 activate 뒤
        expect(order).toEqual(['activate(뒤:contributes 보임)', 'onActivate']);
    });
});
