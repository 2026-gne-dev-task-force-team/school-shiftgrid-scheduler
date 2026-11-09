// @vitest-environment jsdom
/**
 * 행 추가 성능 회귀 — 1,000행 표에 행 100개를 한 개씩 더할 때(#50).
 *   🔴 행 컴포넌트가 메모돼 있으면 새 행만 그려진다(행 렌더 수 ≈ 추가 수). 메모가 풀리면 렌더 수가 행 수에 비례해 폭증한다.
 *   시간 상한은 느슨하게(기기 편차) — 진짜 감시는 렌더 수다.
 */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { RecordView, rowRenderProbe } from './RecordView';
import type { RecordField } from './contracts/collection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { id: string } & Record<string, unknown>;
const FIELDS: RecordField[] = [
    { key: 'f_t', label: '제목', type: 'text' },
    { key: 'f_x', label: '값', type: 'text' },
];
const mk = (i: number): Rec => ({ id: `r${i}`, f_t: `행 ${i}`, f_x: `v${i}`, __parent: null });

describe('RecordView 행 추가 성능', () => {
    it('1,000행에 행 100개 추가 — 행 렌더 수·시간', () => {
        const base = Array.from({ length: 1000 }, (_, i) => mk(i));
        let add: () => void = () => {};
        function H() {
            const [rows, setRows] = useState(base);
            add = () => setRows((rs) => [...rs, mk(rs.length)]);
            return <RecordView<Rec> fields={FIELDS} records={rows} getId={(r) => r.id} viewKey="t.perf" titleKey="f_t"
                onCellChange={() => {}} onAddRecord={() => {}} />;
        }
        const el = document.createElement('div');
        document.body.appendChild(el);
        const root = createRoot(el);
        act(() => { root.render(<H />); });
        rowRenderProbe.n = 0;
        const t0 = performance.now();
        for (let i = 0; i < 100; i++) act(() => { add(); });
        const ms = performance.now() - t0;
        const renders = rowRenderProbe.n;
        console.log(`[perf] 1000행+100추가: ${ms.toFixed(0)}ms · 행 렌더 ${renders}`);
        expect(document.querySelectorAll('[data-rv-row]').length).toBe(1100);
        expect(renders).toBeLessThan(400);   // 메모 시 ≈100 · 안 되면 ≈105,000
        expect(ms).toBeLessThan(20000);
        act(() => root.unmount());
    }, 120000);
});
