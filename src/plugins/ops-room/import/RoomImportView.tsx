import { useState } from 'react';
import { Button, Field, Select, TextInput } from '../../../pane-ui-system';
import type { Room, RoomFixed } from '../book';
import { applyRoomImport, DAYS, previewRoomFile, type RoomPreview, type RoomPreviewResult } from './roomImport';
import type { TimeFrame } from '../../../../shared/import/frame.ts';

const readBytes = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

/**
 * 특별실 고정 사용 불러오기 — 파일 고르기 → 결과 판(표 고르기·줄 해석·방마다 넣을 곳·바뀜 수) → 반영.
 * 시간 틀(frame)과 지금 방·고정 목록은 부르는 쪽이 준다. 반영하면 onApply 에 새 목록을 넘긴다(저장은 부르는 쪽 몫).
 */
export function RoomImportView({ frame, rooms, fixed, onApply, newId, loadFile }: {
    frame: TimeFrame;
    rooms: Room[];
    fixed: RoomFixed[];
    onApply: (next: { rooms: Room[]; fixed: RoomFixed[] }) => void | Promise<void>;
    newId?: () => string;
    /** 시험용 — 파일 → 바이트 */
    loadFile?: (f: File) => Promise<Uint8Array>;
}) {
    const mk = newId ?? (() => crypto.randomUUID());
    const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
    const [choices, setChoices] = useState<Record<string, string>>({});
    const [tableIndex, setTableIndex] = useState<number | undefined>(undefined);
    const [result, setResult] = useState<RoomPreviewResult | null>(null);
    /** 방(열 이름)마다 고른 곳: 방 id · 'new' · 'skip' */
    const [dest, setDest] = useState<Record<string, string>>({});
    const [msg, setMsg] = useState<string | null>(null);

    const run = (f: { name: string; bytes: Uint8Array }, ch: Record<string, string>, ti: number | undefined) => {
        try { setResult(previewRoomFile(frame, f.bytes, f.name, rooms, fixed, { choices: ch, tableIndex: ti })); }
        catch (e) { setResult({ ok: false, reason: '파일을 읽지 못했습니다: ' + (e instanceof Error ? e.message : String(e)), warnings: [] }); }
    };
    const pick = async (f: File | undefined) => {
        if (!f) return;
        setMsg(null); setChoices({}); setTableIndex(undefined); setDest({});
        let bytes: Uint8Array;
        try { bytes = await (loadFile ?? readBytes)(f); }
        catch (e) { setFile(null); setResult({ ok: false, reason: '파일을 읽지 못했습니다: ' + (e instanceof Error ? e.message : String(e)), warnings: [] }); return; }
        const next = { name: f.name, bytes };
        setFile(next);
        run(next, {}, undefined);
    };
    const choose = (label: string, start: string) => { const ch = { ...choices, [label]: start }; setChoices(ch); if (file) run(file, ch, tableIndex); };
    const chooseTable = (i: number) => { setTableIndex(i); setDest({}); if (file) run(file, choices, i); };
    const destOf = (p: RoomPreview, key: string): string => dest[key] ?? p.rooms.find((r) => r.key === key)?.matchRoomId ?? 'new';

    const apply = async (p: RoomPreview) => {
        const items = p.rooms.flatMap((r) => {
            const d = destOf(p, r.key);
            return d === 'skip' ? [] : [{ roomId: d === 'new' ? null : d, name: r.suggestedName, capacity: r.capacityHint, cells: r.cells }];
        });
        const r = applyRoomImport(frame, rooms, fixed, items, mk);
        if (!r.ok) { setMsg('❌ ' + r.error); return; }
        await onApply(r.next);
        setMsg('반영했습니다: ' + r.applied.map((a) => `${a.name}${a.created ? '(새 방)' : ''} ${a.cells}칸`).join(', '));
    };

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <Field label="특별실 고정 사용 파일 (hwp·hwpx·xlsx·csv)">
                <TextInput type="file" accept=".hwp,.hwpx,.xlsx,.csv,.txt" onChange={(e) => void pick(e.target.files?.[0])} />
            </Field>
            {msg && <p role="status" className="text-small">{msg}</p>}
            {result && !result.ok && (
                <div role="alert" className="text-small">
                    <p>❌ {file?.name} — {result.reason}</p>
                    {result.warnings.filter((w) => w !== result.reason).map((w, i) => <p key={i}>{w}</p>)}
                </div>
            )}
            {result?.ok && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-small">{file?.name} — 방 {result.preview.rooms.length}곳 ({result.preview.source})</h3>
                    {result.preview.tables.length > 1 && (
                        <div className="text-small flex flex-wrap gap-1 items-center">
                            <span>읽은 표 {result.preview.tableIndex + 1}번 ·</span>
                            {result.preview.tables.filter((t) => t.score > 0 && t.index !== result.preview.tableIndex).map((t) => (
                                <Button key={t.index} variant="ghost" onClick={() => chooseTable(t.index)}>{`${t.index + 1}번 표로 읽기`}</Button>
                            ))}
                        </div>
                    )}
                    {result.preview.warnings.map((w, i) => <p key={i} className="text-small">⚠ {w}</p>)}
                    {result.preview.rows.filter((r) => r.options && (!r.start || r.chosen)).map((r) => (
                        <div key={r.label} className="text-small flex flex-wrap gap-1 items-center">
                            <span>줄 「{r.label}」{r.start ? ` → ${r.start}(${r.reason})` : ' 시각을 골라 주세요'}</span>
                            {r.options!.map((o) => <Button key={o.start} variant="ghost" onClick={() => choose(r.label, o.start)}>{`「${r.label}」→ ${o.start} (${o.grades.join('·')}학년)`}</Button>)}
                        </div>
                    ))}
                    {result.preview.rooms.map((r) => (
                        <div key={r.key} className="text-small flex flex-col gap-1">
                            <div>{r.suggestedName} 고정 {r.cells.length}칸 · 한 칸 최대 {r.capacityHint} · 추가 {r.diff.add} · 바뀜 {r.diff.change} · 빠짐 {r.diff.remove} · 같음 {r.diff.same}</div>
                            {r.cells.slice(0, 5).map((c) => <div key={c.dayIndex + c.start}>{DAYS[c.dayIndex]} {c.start} {c.label}</div>)}
                            <Select label={`${r.suggestedName} 넣을 곳`} value={destOf(result.preview, r.key)} onChange={(e) => setDest((s) => ({ ...s, [r.key]: e.target.value }))}
                                options={[...rooms.map((x) => ({ value: x.id, label: `기존 방 「${x.name}」에 넣기` })), { value: 'new', label: '새 방 만들기' }, { value: 'skip', label: '건너뛰기' }]} />
                        </div>
                    ))}
                    <Button variant="solid" tone="accent" onClick={() => void apply(result.preview)}>이대로 반영</Button>
                </div>
            )}
        </div>
    );
}
