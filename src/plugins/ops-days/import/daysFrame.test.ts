import { afterEach, describe, expect, it } from 'vitest';
import { setBundle } from '../../../../shared/bundle/store.ts';
import type { Bundle } from '../../../../shared/bundle/types.ts';
import { daysFrame } from './daysFrame';

const bundle = (): Bundle => ({
    bundleVersion: 1, versions: {},
    parts: { doc: {
        specs: [{ id: 'sp', slots: [{ index: 0, label: '1교시', start: '08:50', end: '09:30' }] }],
        tracks: [{ id: 't', name: '7-1', grade: 7, specId: 'sp' }],
        timetables: [{ id: 'tt', specId: 'sp', startDate: '2026-03-01', priority: 1 }],
    } },
});
afterEach(() => setBundle(null));

describe('daysFrame', () => {
    it('앱 번들이 있으면 번들 시간 틀', () => {
        setBundle(bundle());
        expect(daysFrame(null).periodOfTrack('7-1', 1)).toEqual({ start: '08:50', end: '09:30' });
    });
    it('번들이 없으면 마법학교 틀', () => {
        expect(daysFrame(null).track('1-1')).toBeDefined();
    });
});
