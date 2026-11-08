/**
 * 남의 일정 출처 레지스트리(feed.ts) — 등록·목록·버전·구독·해제·바뀜알림·멱등·던지는 출처.
 *   🔴 전역 싱글턴이라 테스트끼리 안 번지게 afterEach 에서 __resetFeeds.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    registerSource, subscribeFeeds, getFeedsVersion, listFeedSources, getFeedSource, __resetFeeds,
} from './feed';
import type { CalendarSource } from './contracts/calendar';

afterEach(() => __resetFeeds());

/** 바뀜알림을 바깥에서 쏠 수 있는 가짜 출처 — fire() 로 onChange 리스너를 울린다. */
function makeSource(id: string, over: Partial<CalendarSource> = {}): CalendarSource & { fire: () => void; unsubbed: () => boolean } {
    let listener: (() => void) | null = null;
    let disposed = false;
    return {
        id, label: `출처 ${id}`,
        list: () => [],
        onChange(l) { listener = l; return { dispose() { disposed = true; listener = null; } }; },
        fire() { listener?.(); },
        unsubbed() { return disposed; },
        ...over,
    };
}

describe('출처 등록·목록·조회', () => {
    it('등록하면 목록·조회에 뜨고 버전이 오른다', () => {
        const v0 = getFeedsVersion();
        const s = makeSource('a');
        registerSource(s);
        expect(listFeedSources().map((e) => e.source.id)).toEqual(['a']);
        expect(getFeedSource('a')).toBe(s);
        expect(getFeedsVersion()).toBeGreaterThan(v0);
    });

    it('없는 id 조회는 null', () => {
        expect(getFeedSource('없음')).toBeNull();
    });

    it('여러 출처는 등록 순서대로 색인이 붙는다', () => {
        registerSource(makeSource('a'));
        registerSource(makeSource('b'));
        const list = listFeedSources();
        expect(list.map((e) => e.source.id)).toEqual(['a', 'b']);
        expect(list[0].colorIdx).not.toBe(list[1].colorIdx);
    });
});

describe('구독·바뀜알림', () => {
    it('register·dispose·출처 onChange 때 구독자가 울린다(= 다시 그림)', () => {
        const cb = vi.fn();
        const stop = subscribeFeeds(cb);

        const s = makeSource('a');
        const d = registerSource(s);
        expect(cb).toHaveBeenCalledTimes(1);   // register

        s.fire();                               // 출처가 바뀜을 알림
        expect(cb).toHaveBeenCalledTimes(2);

        d.dispose();                            // 해제
        expect(cb).toHaveBeenCalledTimes(3);

        stop();
        s.fire();                               // 이미 해제돼 구독도 끊겼다 — 안 울린다
        expect(cb).toHaveBeenCalledTimes(3);
    });
});

describe('해제(Disposable)', () => {
    it('dispose 하면 출처가 사라지고 onChange 구독도 끊긴다', () => {
        const s = makeSource('a');
        const d = registerSource(s);
        expect(getFeedSource('a')).toBe(s);
        expect(s.unsubbed()).toBe(false);

        d.dispose();
        expect(getFeedSource('a')).toBeNull();
        expect(listFeedSources()).toEqual([]);
        expect(s.unsubbed()).toBe(true);        // 🔴 구독 해제됨
    });

    it('dispose 는 멱등 — 두 번 불러도 안전하고 버전은 한 번만', () => {
        const s = makeSource('a');
        const d = registerSource(s);
        d.dispose();
        const v = getFeedsVersion();
        expect(() => d.dispose()).not.toThrow();
        expect(getFeedsVersion()).toBe(v);      // 두 번째 dispose 는 아무 일 없음
    });
});

describe('망가진 출처도 달력은 산다', () => {
    it('onChange 가 등록 때 던져도 등록은 서고, dispose 도 던지지 않는다', () => {
        const s: CalendarSource = {
            id: 'bad', label: '던지는 출처', list: () => [],
            onChange() { throw new Error('구독 실패'); },
        };
        let d!: { dispose(): void };
        expect(() => { d = registerSource(s); }).not.toThrow();
        expect(getFeedSource('bad')).toBe(s);   // 그래도 등록은 산다
        expect(() => d.dispose()).not.toThrow();
        expect(getFeedSource('bad')).toBeNull();
    });
});
