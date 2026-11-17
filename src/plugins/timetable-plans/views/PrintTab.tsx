/**
 * 인쇄 화면 — 편성안 하나를 골라 반별·교사별·교실별 시간표를 A4 가로 한 장씩 미리 보고 인쇄한다(1.2v 편성기 분해 F11).
 *   🔴 이름은 정본(staff·school·subjects·rooms)에서 읽는다 · 화면 밖(메뉴·창틀)은 인쇄할 때 숨긴다.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button, Checkbox, Segmented, Select } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Clock } from '../../bell/contracts/clock';
import { canonOf, gradeFrom, labelFrom } from '../labels';
import { subscribePlans, getPlanNodes, planOf } from '../nodes';
import { PRINT_KINDS, printSheets } from '../print';
import type { PrintKind, PrintSheet, PrintTimes } from '../print';

/** 인쇄할 때만 켜지는 규칙 — 인쇄 영역만 남기고 A4 가로로, 장마다 쪽을 나눈다. 색은 안 쓴다(흑백). */
export const PRINT_CSS = `@page { size: A4 landscape; margin: 10mm; }
@media print {
  body * { visibility: hidden !important; }
  .tt-print-area, .tt-print-area * { visibility: visible !important; }
  .tt-print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .tt-print-sheet { page-break-after: always; break-after: page; }
  .tt-print-hide { display: none !important; }
}`;

export function SheetView({ sheet }: { sheet: PrintSheet }) {
    return (
        <section className="tt-print-sheet border border-line rounded p-2" aria-label={`${sheet.title} 시간표`}>
            <h3 className="font-bold mb-1">{sheet.title}</h3>
            <table className="w-full border-collapse text-text">
                <thead>
                    <tr>
                        <th className="border border-line p-1 w-16" />
                        {sheet.days.map((d) => <th key={d.day} className="border border-line p-1">{d.name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {sheet.periods.map((n, r) => (
                        <tr key={n}>
                            <th className="border border-line p-1">
                                {n}교시
                                {sheet.times?.[r] && <div className="text-xs font-normal text-muted">{sheet.times[r]}</div>}
                            </th>
                            {sheet.cells[r].map((t, c) => (
                                <td key={c} className="border border-line p-1 whitespace-pre-line text-center h-12">{t}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}

export function PrintTab({ host, planId, onClose }: { host: PluginHost; planId?: string; onClose: () => void }) {
    const nodes = useSyncExternalStore(subscribePlans, getPlanNodes, getPlanNodes);
    const [pid, setPid] = useState<string | null>(planId ?? null);
    const [kind, setKind] = useState<PrintKind>('class');
    const [all, setAll] = useState(false);
    const [one, setOne] = useState<string | null>(null);

    // 일과표 약속(clock) — 꺼져 있으면 null 이라 「N교시」만 보인다. 일과표가 바뀌면 다시 그린다.
    const clock = host.modules.use<Clock>('clock') ?? null;
    const [bellTick, setBellTick] = useState(0);
    useEffect(() => clock?.subscribe(() => setBellTick((t) => t + 1)), [clock]);

    const sheets = useMemo(() => {
        const plan = pid ? planOf(pid) : null;
        if (!plan) return [];
        const canon = canonOf(host);
        const times: PrintTimes | undefined = clock ? {
            gradeOf: gradeFrom(canon),
            timeOf: (g, n) => clock.slotsFor(g).find((s) => s.period === n) ?? null,
        } : undefined;
        return printSheets(plan, kind, labelFrom(canon), times);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pid, kind, nodes, host, clock, bellTick]);
    const shown = all ? sheets : sheets.filter((s) => s.id === (one ?? sheets[0]?.id));
    const kindLabel = PRINT_KINDS.find((k) => k.kind === kind)?.label ?? '';

    return (
        <div className="h-full overflow-auto p-3 flex flex-col gap-3">
            <style>{PRINT_CSS}</style>
            <div className="tt-print-hide flex flex-wrap items-center gap-2">
                <Button onClick={onClose}>← 편성안으로</Button>
                <Select label="인쇄할 편성안" placeholder="편성안 고르기" value={pid ?? ''} onChange={(e) => { setPid(e.target.value || null); setOne(null); }}
                    options={nodes.map((n) => ({ value: n.id, label: n.name }))} />
                <Segmented label="시간표 종류" value={kind} onChange={(k) => { setKind(k); setOne(null); }} options={PRINT_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
                {!all && sheets.length > 1 && (
                    <Select label="인쇄할 장" value={one ?? sheets[0].id} onChange={(e) => setOne(e.target.value)}
                        options={sheets.map((x) => ({ value: x.id, label: x.title }))} />
                )}
                <Checkbox checked={all} onChange={setAll} label={`모든 ${kindLabel} 묶음으로`} />
                <Button variant="accent" onClick={() => window.print()} disabled={shown.length === 0}>인쇄</Button>
            </div>
            {!pid && <p className="tt-print-hide text-muted">인쇄할 편성안을 골라 주세요.</p>}
            {pid && sheets.length === 0 && <p className="tt-print-hide text-muted">이 안엔 {kindLabel} 표로 뽑을 칸이 없습니다.</p>}
            <div className="tt-print-area flex flex-col gap-3">
                {shown.map((s) => <SheetView key={s.id} sheet={s} />)}
            </div>
        </div>
    );
}
