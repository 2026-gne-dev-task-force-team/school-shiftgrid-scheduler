// @vitest-environment jsdom
/**
 * 알림 스토어 — 토스트 수명(기본 5초 · 오류는 닫을 때까지) · key 는 토스트만 덮음 · 보관 개수 · 새로고침 복원 · 단추=명령 · 주인 꼬리표.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn(() => true));
const can = vi.hoisted(() => vi.fn((_id: string, _ctx?: unknown) => true));
vi.mock('./store', async (orig) => ({ ...(await orig<typeof import('./store')>()), runCommand: run, commandEnabled: can }));

import {
    notify, dismiss, runNotifyAction, markAllRead, clearNotifications, applyNotifyRetain,
    getNotifications, actionState, __resetNotifyForTest,
} from './notify';
import { setPaneSettings, resetPaneSettings } from '../layout/pane-settings';
import { makeHost } from './host';
import { reportStorageError, clearStorageErrors } from './storage-errors';
import { storageKey } from '../storage';

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    resetPaneSettings();
    __resetNotifyForTest();
    run.mockClear();
    can.mockReset(); can.mockImplementation(() => true);
});
afterEach(() => { vi.useRealTimers(); });

describe('토스트 수명', () => {
    it('info 는 5초 뒤 걷히고 기록엔 남는다', () => {
        notify('a', { title: '안녕' });
        expect(getNotifications().toasts).toHaveLength(1);
        vi.advanceTimersByTime(5001);
        expect(getNotifications().toasts).toHaveLength(0);
        expect(getNotifications().items).toHaveLength(1);
    });

    it('🔴 error 는 기본 0 — 시간이 지나도 안 걷힌다 · dismiss 해야 걷힌다', () => {
        const id = notify('a', { level: 'error', title: '망함' });
        vi.advanceTimersByTime(60_000);
        expect(getNotifications().toasts).toHaveLength(1);
        dismiss(id);
        expect(getNotifications().toasts).toHaveLength(0);
        expect(getNotifications().items).toHaveLength(1);
    });

    it('timeout 을 주면 info 도 그 값을 따른다 · 0 이면 안 걷힌다', () => {
        notify('a', { title: '짧게', timeout: 1000 });
        notify('a', { title: '계속', timeout: 0 });
        vi.advanceTimersByTime(1001);
        expect(getNotifications().toasts.map((t) => t.title)).toEqual(['계속']);
    });

    it('토스트는 동시에 4개 — 넘치면 가장 오래된 것부터 걷힌다', () => {
        for (let i = 0; i < 6; i++) notify('a', { title: `n${i}`, timeout: 0 });
        expect(getNotifications().toasts.map((t) => t.title)).toEqual(['n2', 'n3', 'n4', 'n5']);
        expect(getNotifications().items).toHaveLength(6);
    });
});

describe('key 는 토스트만 덮는다', () => {
    it('같은 보낸이·같은 key — 떠 있는 토스트는 최신 하나, 기록엔 둘 다 쌓인다', () => {
        notify('a', { title: '1', key: 'k' });
        notify('a', { title: '2', key: 'k' });
        expect(getNotifications().items.map((i) => i.title)).toEqual(['1', '2']);
        expect(getNotifications().toasts.map((i) => i.title)).toEqual(['2']);
    });
    it('보낸이가 다르면 같은 key 라도 따로다', () => {
        notify('a', { title: '1', key: 'k' });
        notify('b', { title: '2', key: 'k' });
        expect(getNotifications().items).toHaveLength(2);
    });
});

describe('읽음 · 비우기 · 단추', () => {
    it('안 읽은 수 → markAllRead → 0', () => {
        notify('a', { title: '1' }); notify('a', { title: '2' });
        expect(getNotifications().unread).toBe(2);
        markAllRead();
        expect(getNotifications().unread).toBe(0);
    });
    it('clearNotifications 는 기록과 토스트를 다 비운다', () => {
        notify('a', { title: '1', timeout: 0 });
        clearNotifications();
        expect(getNotifications().items).toHaveLength(0);
        expect(getNotifications().toasts).toHaveLength(0);
    });
    it('🔴 단추는 함수가 아니라 명령 id — 누르면 runCommand · 토스트는 걷히고 읽음', () => {
        const id = notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo' }, timeout: 0 });
        runNotifyAction(id);
        expect(run).toHaveBeenCalledWith('x.undo', undefined);
        expect(getNotifications().toasts).toHaveLength(0);
        expect(getNotifications().items[0].read).toBe(true);
    });
    it('단추는 한 번만 — 두 번째 누름은 명령을 안 부르고 actionUsed 가 선다', () => {
        const id = notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo' }, timeout: 0 });
        runNotifyAction(id);
        runNotifyAction(id);
        expect(run).toHaveBeenCalledTimes(1);
        expect(getNotifications().items[0].actionUsed).toBe(true);
    });
    it('단추 없는 알림에 runNotifyAction 은 아무 일도 안 한다', () => {
        const id = notify('a', { title: '그냥' });
        runNotifyAction(id);
        expect(run).not.toHaveBeenCalled();
    });
});

describe('🔴 C1 — 낡은 단추는 안 눌린다(args 토큰 · 새로고침 만료)', () => {
    it('args 는 명령 맥락 ctx.args 로 넘어간다', () => {
        const id = notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo', args: { undoTop: 7 } }, timeout: 0 });
        expect(can).toHaveBeenCalledTimes(0);
        runNotifyAction(id);
        expect(can).toHaveBeenCalledWith('x.undo', { args: { undoTop: 7 } });
        expect(run).toHaveBeenCalledWith('x.undo', { args: { undoTop: 7 } });
    });
    it('명령이 「지금 안 된다」(enabled=false) 면 안 부르고 회색 + 까닭 · 단추는 안 쓴 채로 남는다', () => {
        const id = notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo', args: { undoTop: 1 }, unavailable: '이미 다른 작업이 있어 되돌릴 수 없습니다' }, timeout: 0 });
        can.mockImplementation(() => false);
        const it0 = getNotifications().items[0];
        expect(actionState(it0)).toEqual({ kind: 'stale', reason: '이미 다른 작업이 있어 되돌릴 수 없습니다' });
        runNotifyAction(id);
        expect(run).not.toHaveBeenCalled();
        expect(getNotifications().items[0].actionUsed).toBeFalsy();
        expect(getNotifications().toasts).toHaveLength(1);
        // 다시 맞으면(뒤 작업을 되돌렸으면) 살아난다
        can.mockImplementation(() => true);
        expect(actionState(getNotifications().items[0]).kind).toBe('ready');
    });
    it('🔴 새로고침 뒤 불러온 기록의 단추는 만료 — 안 부른다', () => {
        const id = notify('a', { title: '지움', action: { label: '되돌리기', commandId: 'x.undo', args: { undoTop: 1 } } });
        __resetNotifyForTest();
        const it0 = getNotifications().items[0];
        expect(it0.id).toBe(id);
        expect(actionState(it0).kind).toBe('stale');
        runNotifyAction(id);
        expect(run).not.toHaveBeenCalled();
    });
});

describe('보관 개수', () => {
    it('보관 2 → 3번째가 오면 가장 오래된 것이 잘린다', () => {
        setPaneSettings({ notifyRetain: 2 });
        for (const t of ['1', '2', '3']) notify('a', { title: t });
        expect(getNotifications().items.map((i) => i.title)).toEqual(['2', '3']);
    });

    it('보관을 줄이면 applyNotifyRetain 이 바로 자른다', () => {
        for (const t of ['1', '2', '3']) notify('a', { title: t });
        setPaneSettings({ notifyRetain: 1 });
        applyNotifyRetain();
        expect(getNotifications().items.map((i) => i.title)).toEqual(['3']);
    });

    it('🔴 새로고침(모듈 재시작)해도 기록이 돌아온다', () => {
        notify('a', { title: '남는다', level: 'warn' });
        __resetNotifyForTest();
        expect(getNotifications().items.map((i) => i.title)).toEqual(['남는다']);
        expect(getNotifications().toasts).toHaveLength(0);   // 토스트는 되살리지 않는다
    });

    it('🔴 보관 0 이면 저장하지 않는다 — 새로고침하면 비움(세션 안에서는 쌓인다)', () => {
        setPaneSettings({ notifyRetain: 0 });
        notify('a', { title: '휘발' });
        expect(getNotifications().items).toHaveLength(1);
        __resetNotifyForTest();
        expect(getNotifications().items).toHaveLength(0);
    });

    it('깨진 저장값은 비운 채 시작한다(던지지 않는다)', () => {
        localStorage.setItem(storageKey('notify.history'), '{깨짐');
        __resetNotifyForTest();
        expect(() => getNotifications()).not.toThrow();
    });
});

describe('주인 꼬리표 · 저장 실패 연결', () => {
    it('host.notify 는 보낸 꾸러미 id 를 창틀이 붙인다', () => {
        const id = makeHost('demo').notify({ title: '안녕' });
        expect(getNotifications().items[0]).toMatchObject({ id, owner: 'demo' });
    });
    it('host.notify.dismiss 는 토스트를 걷는다', () => {
        const h = makeHost('demo');
        const id = h.notify({ title: '안녕', timeout: 0 });
        h.notify.dismiss(id);
        expect(getNotifications().toasts).toHaveLength(0);
    });
    it('🔴 저장 실패는 오류 알림으로도 나가고, 같은 자리 반복 실패는 토스트 한 건에 덮인다(기록엔 쌓인다)', () => {
        clearStorageErrors();
        const e = { scope: 'local', key: 'k', reason: 'quota' as const, at: 1 };
        reportStorageError(e);
        reportStorageError({ ...e, at: 2 });
        const { items, toasts } = getNotifications();
        expect(toasts).toHaveLength(1);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ level: 'error', title: '저장 실패', owner: 'frame' });
        clearStorageErrors();
    });
});
