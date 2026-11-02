/**
 * 기여 장부(읽기 전용 거울) 증명 — 선언형 전환 D7.
 *
 * ⭐ 재는 것 셋:
 *   ① contributes 로 셋 + host.declare 로 하나 꽂으면 장부가 manifest 3 · declare 1 로 갈린다
 *   ② declare 의 Disposable 을 부르면 그 줄만 장부에서 빠진다(manifest 는 그대로)
 *   ③ 플러그인을 끄면(disablePlugin) 장부가 빈다 — 「켜져 있을 때의 값」을 비추므로
 *
 * 🔴 모듈 전역 스토어·뷰 레지스트리라 테스트끼리 안 번지게 beforeEach 에서 비운다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import type { ComponentType } from 'react';
import type { ViewProps } from '../view-registry';
import { clearViews } from '../view-registry';
import type { PluginHost, Disposable } from './types';
import { definePlugin } from './define';
import { activateAll, disablePlugin } from './registry';
import { disposeOwner, listContributions } from './store';

const hostView: ComponentType<ViewProps & { host: PluginHost }> = (p) => createElement('div', { 'data-host': p.host.id });

const OWNER = 'lfake';
beforeEach(() => {
    disposeOwner(OWNER);
    clearViews();
});

/** 매니페스트로 셋(뷰·명령·리본) + onActivate 에서 host.declare 로 하나(명령) 꽂는 가짜. declare 손잡이를 밖으로 넘긴다. */
function makeFake(captureDispose: (d: Disposable) => void) {
    return definePlugin({
        manifest: {
            id: OWNER, name: 'L Fake', version: '0.1.0', minHostVersion: '0.1.0',
            contributes: {
                views: [{ id: 'board', title: '보드', icon: 'play', defaultArea: 'center', component: 'Board' }],
                commands: [{ id: 'lfake.a', title: '가' }],
                ribbon: [{ commandId: 'lfake.a' }],   // 명령을 가리킨다 — 제목이 '가' 로 풀린다
            },
        },
        components: { Board: hostView },
        commands: { 'lfake.a': () => { /* 동작 */ }, 'lfake.b': () => { /* 동적 */ } },
        // 🔴 등록 아닌 동적 선언 — host.declare 로 명령 하나를 더 꽂고 손잡이를 밖으로 넘긴다
        lifecycle: { onActivate: (host) => { captureDispose(host.declare({ kind: 'command', id: 'lfake.b', title: '나' })); } },
    });
}

describe('① contributes 셋 + declare 하나 → 장부가 manifest 3 · declare 1 로 갈린다', () => {
    it('origin 별 개수와 각 줄(종류·id·제목)이 맞다', () => {
        let dyn: Disposable | undefined;
        activateAll([makeFake((d) => { dyn = d; })]);

        const led = listContributions(OWNER);
        const manifest = led.filter((c) => c.origin === 'manifest');
        const declare = led.filter((c) => c.origin === 'declare');

        expect(manifest.length, 'contributes 는 manifest 3').toBe(3);
        expect(declare.length, 'host.declare 는 declare 1').toBe(1);

        // 뷰는 접두사 붙인 전체 id
        expect(manifest.find((c) => c.kind === 'view')).toMatchObject({ id: 'lfake.board', title: '보드', origin: 'manifest' });
        // 리본 제목은 가리킨 명령에서 풀린다
        expect(manifest.find((c) => c.kind === 'ribbon')).toMatchObject({ id: 'lfake.a', title: '가', origin: 'manifest' });
        // 동적 명령
        expect(declare[0]).toMatchObject({ kind: 'command', id: 'lfake.b', title: '나', origin: 'declare' });

        expect(dyn, 'onActivate 가 declare 손잡이를 넘긴다').toBeTruthy();
    });
});

describe('② declare 의 Disposable 을 부르면 그 줄만 빠진다', () => {
    it('declare 0 · manifest 3 으로 남는다', () => {
        let dyn: Disposable | undefined;
        activateAll([makeFake((d) => { dyn = d; })]);

        dyn!.dispose();

        const led = listContributions(OWNER);
        expect(led.filter((c) => c.origin === 'declare').length, 'declare 는 빠졌다').toBe(0);
        expect(led.filter((c) => c.origin === 'manifest').length, 'manifest 는 그대로').toBe(3);
    });
});

describe('③ 플러그인을 끄면 장부가 빈다', () => {
    it('disablePlugin 뒤 listContributions 가 빈 배열', () => {
        activateAll([makeFake(() => { /* 안 쓴다 */ })]);
        expect(listContributions(OWNER).length, '끄기 전엔 차 있다').toBe(4);

        disablePlugin(OWNER);

        expect(listContributions(OWNER), '끄면 장부가 빈다').toEqual([]);
    });
});
