// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { setBundle } from '../../../shared/bundle/store.ts';
import type { Bundle } from '../../../shared/bundle/types.ts';
import { AuxView } from './AuxPanel';
import { defaultAuxSource } from './source';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { setBundle(null); document.body.innerHTML = ''; localStorage.clear(); });

// 목요일(2026-11-19) 한 칸짜리 합성 번들 — 반 7-1 만 있다(데모의 1-1 은 없다).
const bundle = (): Bundle => ({
    bundleVersion: 1, versions: {},
    parts: { doc: {
        specs: [{ id: 'sp', activeDays: [0, 1, 2, 3, 4], slots: [{ index: 0, label: '1교시', start: '09:00', end: '09:40' }] }],
        tracks: [{ id: 't', name: '7-1', grade: 7, specId: 'sp' }],
        timetables: [{ id: 'tt', specId: 'sp', startDate: '2026-03-01', priority: 1 }],
        assignments: [{ timetableId: 'tt', trackId: 't', dayIndex: 3, slotIndex: 0, activityId: 'a1' }],
        activities: [{ id: 'a1', name: '과학' }],
    } },
});

describe('근태 화면은 번들이 나중에 들어와도 다시 그린다', () => {
    it('그린 뒤 restore 처럼 setBundle 하면 배정 판정이 번들 기준으로 바뀐다', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        await act(async () => createRoot(host).render(createElement(AuxView, { source: defaultAuxSource, viewer: { userId: 'u-a', role: '근태담당' }, initialDate: '2026-11-19' })));
        expect(host.textContent).not.toContain('[재배정 필요');
        await act(async () => { setBundle(bundle()); });
        expect(host.textContent).toContain('[재배정 필요');
    });
});
