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
import type { PluginHost, Disposable, PluginModule } from './types';
import { definePlugin } from './define';
import { activateAll, disablePlugin } from './registry';
import { disposeOwner, listContributions } from './store';

const hostView: ComponentType<ViewProps & { host: PluginHost }> = (p) => createElement('div', { 'data-host': p.host.id });

const OWNER = 'lfake';
// ④ 가 쓰는 레지스트라(코어)·소비 플러그인 주인까지 깨끗이(모듈 전역 스토어라 번지지 않게).
const OWNERS = [OWNER, 'explorer', 'ntled'];
beforeEach(() => {
    for (const o of OWNERS) disposeOwner(o);
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

describe('④ nodeTypes 도 장부에 — 레지스트라로 꽂힌 것을 호스트가 거울에 남긴다', () => {
    const REG = 'nodes-prov';   // nodes 인터페이스 제공자(코어 — 먼저 산다)
    const NT = 'ntled';         // nodeTypes 둘을 적는 소비 플러그인

    /** 가짜 nodes 모듈 — 실제 등록 대신 되돌림 손잡이만 준다(장부는 호스트가 applyContributes 에서 남긴다). */
    function registrar(): PluginModule {
        return {
            manifest: {
                id: REG, name: 'PE', version: '0.1.0', minHostVersion: '0.1.0', core: true,
                provides: { nodes: '0.1.0' },
                // 🔴 3판 — nodes 약속도 이 가짜가 선언한다(약속 없이는 provides 가 「약속 없음」으로 막힌다).
                contributes: { interfaces: [{ name: 'nodes', version: '0.1.0' }] },
            },
            modules: {
                nodes: { registerContributed() { return { dispose() { /* 테스트 */ } }; } },
            },
        };
    }

    /** nodeTypes 둘(상자·핀)을 적은 소비 플러그인(requires.nodes) — 함수 묶음 없는 순수 데이터 타입. */
    function consumer(): PluginModule {
        return definePlugin({
            manifest: {
                id: NT, name: 'NT Led', version: '0.1.0', minHostVersion: '0.1.0',
                requires: { nodes: '^0.1' },
                contributes: {
                    nodeTypes: [
                        { type: 'ntled.box', label: '상자' },
                        { type: 'ntled.pin', label: '핀' },
                    ],
                },
            },
        });
    }

    it('① 켜지면 장부에 nodeType 2건(origin manifest · id=type · title=label)', () => {
        activateAll([registrar(), consumer()]);

        const nt = listContributions(NT).filter((c) => c.kind === 'nodeType');
        expect(nt.length, 'nodeType 2건').toBe(2);
        expect(nt.every((c) => c.origin === 'manifest'), '전부 manifest').toBe(true);
        expect(nt.find((c) => c.id === 'ntled.box'), 'id=type · title=label')
            .toMatchObject({ kind: 'nodeType', id: 'ntled.box', title: '상자', origin: 'manifest' });
        expect(nt.find((c) => c.id === 'ntled.pin'))
            .toMatchObject({ kind: 'nodeType', id: 'ntled.pin', title: '핀', origin: 'manifest' });
    });

    it('② 끄면 장부에서 빠진다', () => {
        activateAll([registrar(), consumer()]);
        expect(listContributions(NT).length, '끄기 전엔 2건').toBe(2);

        disablePlugin(NT);

        expect(listContributions(NT), '끄면 장부가 빈다').toEqual([]);
    });
});
