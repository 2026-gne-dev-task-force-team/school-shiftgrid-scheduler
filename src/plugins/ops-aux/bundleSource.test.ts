import { afterEach, describe, expect, it } from 'vitest';
import { setBundle } from '../../../shared/bundle/store.ts';
import type { Bundle } from '../../../shared/bundle/types.ts';
import { defaultAuxSource } from './source';

const bundle = (): Bundle => ({
    bundleVersion: 1, versions: {},
    parts: { doc: {
        specs: [{ id: 'sp', activeDays: [0, 1, 2, 3, 4], slots: [{ index: 0, label: '1교시', start: '08:50', end: '09:30' }] }],
        tracks: [{ id: 't', name: '7-1', grade: 7, specId: 'sp' }],
        timetables: [{ id: 'tt', specId: 'sp', startDate: '2026-03-01', priority: 1 }],
        assignments: [{ timetableId: 'tt', trackId: 't', dayIndex: 0, slotIndex: 0, activityId: 'a1' }],
        activities: [{ id: 'a1', name: '과학' }],
    } },
});

afterEach(() => setBundle(null));

describe('defaultAuxSource 는 앱 번들을 읽는다', () => {
    it('번들 값으로 수업 칸이 나오고 번들이 바뀌면 구독자가 알림을 받는다', () => {
        let n = 0;
        const off = defaultAuxSource.subscribe!(() => { n++; });
        setBundle(bundle());
        expect(n).toBe(1);
        expect(defaultAuxSource.lessonsOn('2026-11-16')).toEqual([expect.objectContaining({ trackName: '7-1', subject: '과학', startMin: 530, endMin: 570 })]);
        off();
    });
    it('번들이 없으면 demo 로 돈다', () => {
        expect(defaultAuxSource.lessonsOn('2026-11-16').map((l) => l.trackName)).toContain('1-1');
    });
});
