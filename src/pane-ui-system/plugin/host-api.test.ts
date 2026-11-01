/**
 * 플러그인 호스트 API 증명 — 데모 플러그인이 하던 「기여점 한 칸씩 써 보기」를 테스트로 옮겼다(쥔님 판정 11-01).
 *   데모가 사라져도 settings·commands·ribbon·statusBar·workspace.on·enable/disable 회수 가 살아 있는지
 *   여기가 지킨다(⚠️ API 가 죽어도 아무도 모르는 일을 막는다).
 *
 * 🔴 모듈 전역 스토어라 테스트끼리 번지지 않게 각 테스트가 제 주인('t')을 먼저 거둔다(disposeOwner).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ComponentType } from 'react';
import { makeHost } from './host';
import {
    disposeOwner, listSettings, getCommand, runCommand,
    listRibbonActions, listStatusItems, fireWorkspace,
} from './store';

const OWNER = 't';
const Pane = (() => null) as ComponentType;

/** 주인 'OWNER' 를 깨끗이 비우고 새 호스트 하나 */
function fresh() { disposeOwner(OWNER); return makeHost(OWNER); }

beforeEach(() => disposeOwner(OWNER));

describe('host.settings — 섹션·항목이 등록되고 빈 섹션은 안 그린다', () => {
    it('addSection + addItem → 그 섹션이 항목과 함께 목록에 뜬다', () => {
        const h = fresh();
        h.settings.addSection('sec', '섹션');
        h.settings.addItem({ section: 'sec', id: 'it', title: '항목', icon: 'info', Pane });
        const sec = listSettings().find((s) => s.id === 'sec');
        expect(sec).toBeTruthy();
        expect(sec!.items.map((i) => i.id)).toEqual(['it']);
    });
});

describe('host.commands — 레지스트리에 쌓이고 run 이 돈다', () => {
    it('add → getCommand 로 찾고 run 을 부른다', () => {
        const h = fresh();
        let ran = 0;
        h.commands.add({ id: 't.cmd', title: '명령', run: () => { ran += 1; } });
        const c = getCommand('t.cmd');
        expect(c?.title).toBe('명령');
        c!.run();
        expect(ran).toBe(1);
    });
});

describe('host.ribbon — 명령을 가리키는 동작이 리본 목록에 뜬다', () => {
    it('명령을 먼저 꽂고 ribbon.add 하면 그 동작이 보인다(label·run 을 명령에서 푼다)', () => {
        const h = fresh();
        let ran = 0;
        h.commands.add({ id: 't.cmd', title: '리본 명령', icon: 'table', run: () => { ran += 1; } });
        h.ribbon.add({ commandId: 't.cmd' });
        const act = listRibbonActions().find((a) => a.id === 't.cmd');
        expect(act?.label).toBe('리본 명령');
        act!.run();
        expect(ran).toBe(1);
    });
});

describe('host.commands.run — id 로 부르고 맥락(ctx)을 넘긴다', () => {
    it('run(id, ctx) 가 그 명령을 ctx 와 함께 부른다 · 없는 id 는 false', () => {
        const h = fresh();
        let got: unknown = 'none';
        h.commands.add({ id: 't.run', title: '실행', run: (ctx) => { got = ctx; } });
        expect(h.commands.run('t.run', { leafId: 'L1' })).toBe(true);
        expect(got).toEqual({ leafId: 'L1' });
        expect(runCommand('없는명령')).toBe(false);   // 없는 id → false(조용히 삼키지 않는다)
    });
});

describe('host.statusBar — 항목이 등록되고 render 가 노드를 준다', () => {
    it('add → 목록에 뜨고 render() 가 내용을 돌려준다', () => {
        const h = fresh();
        h.statusBar.add({ id: 'st', side: 'left', render: () => '카드 0' });
        const mine = listStatusItems().filter((s) => s.owner === OWNER);
        expect(mine.map((s) => s.id)).toEqual(['st']);
        expect(mine[0].render()).toBe('카드 0');
    });
});

describe('host.workspace.on — open/close/activate 를 fireWorkspace 가 쏘면 구독이 받는다', () => {
    it('세 이벤트가 각각 제 콜백으로 간다', () => {
        const h = fresh();
        const got: string[] = [];
        h.workspace.on('open', (l) => got.push(`open:${l.viewId}`));
        h.workspace.on('activate', (l) => got.push(`activate:${l.viewId}`));
        h.workspace.on('close', (l) => got.push(`close:${l.viewId}`));
        fireWorkspace('open', { id: 'a', viewId: 't.v' });
        fireWorkspace('activate', { id: 'a', viewId: 't.v' });
        fireWorkspace('close', { id: 'a', viewId: 't.v' });
        expect(got).toEqual(['open:t.v', 'activate:t.v', 'close:t.v']);
    });
});

describe('enable/disable 회수 — disposeOwner 가 그 주인의 등록물을 전부 거둔다', () => {
    it('끄면 settings·commands·ribbon·statusBar 가 사라지고 workspace 구독도 멈춘다', () => {
        const h = fresh();
        let ran = 0;
        const got: string[] = [];
        h.settings.addSection('sec', '섹션');
        h.settings.addItem({ section: 'sec', id: 'it', title: '항목', icon: 'info', Pane });
        h.commands.add({ id: 't.cmd', title: '명령', run: () => { ran += 1; } });
        h.ribbon.add({ commandId: 't.cmd' });
        h.statusBar.add({ id: 'st', side: 'left', render: () => 'x' });
        h.workspace.on('open', (l) => got.push(l.viewId));

        // 켜져 있을 때: 전부 보인다
        expect(listSettings().some((s) => s.id === 'sec')).toBe(true);
        expect(getCommand('t.cmd')).toBeTruthy();
        expect(listRibbonActions().some((a) => a.id === 't.cmd')).toBe(true);
        expect(listStatusItems().some((s) => s.owner === OWNER)).toBe(true);

        // 끄면(회수): 전부 사라지고 구독도 멈춘다
        disposeOwner(OWNER);
        expect(listSettings().some((s) => s.id === 'sec')).toBe(false);
        expect(getCommand('t.cmd')).toBeUndefined();
        expect(listRibbonActions().some((a) => a.id === 't.cmd')).toBe(false);
        expect(listStatusItems().some((s) => s.owner === OWNER)).toBe(false);

        fireWorkspace('open', { id: 'b', viewId: 't.v2' });
        expect(got).toEqual([]);   // 🔴 구독이 거둬져 더는 안 온다
        expect(ran).toBe(0);
    });
});
