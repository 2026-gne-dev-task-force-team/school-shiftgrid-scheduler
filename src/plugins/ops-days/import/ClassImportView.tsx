import { useState } from 'react';
import { Button, Field, TextInput } from '../../../pane-ui-system';
import { applyClassImport, DAYS, previewClassFile, type ClassPreview, type ClassPreviewResult, type ClassSubject } from './classImport';
import type { TimeFrame } from './frame';

const readBytes = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

/**
 * 담임 과목 불러오기 — 파일 고르기 → 결과 판(성공 반·❌ 이유·어긋남·건너뜀) → 반영.
 * 시간 틀(frame)과 지금 저장분(current)은 부르는 쪽이 준다. 반영하면 onApply 에 새 목록 전체를 넘긴다(저장은 부르는 쪽 몫).
 */
export function ClassImportView({ frame, current, onApply, loadFile }: {
    frame: TimeFrame;
    current: ClassSubject[];
    onApply: (next: ClassSubject[]) => void | Promise<void>;
    /** 시험용 — 파일 → 바이트 */
    loadFile?: (f: File) => Promise<Uint8Array>;
}) {
    const [name, setName] = useState<string | null>(null);
    const [result, setResult] = useState<ClassPreviewResult | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    const pick = async (f: File | undefined) => {
        if (!f) return;
        setMsg(null);
        setName(f.name);
        try { setResult(previewClassFile(frame, await (loadFile ?? readBytes)(f), f.name, current)); }
        catch (e) { setResult({ ok: false, reason: '파일을 읽지 못했습니다: ' + (e instanceof Error ? e.message : String(e)), warnings: [] }); }
    };
    const apply = async (p: ClassPreview) => {
        const r = applyClassImport(frame, current, p.classes.map((c) => ({ trackName: c.trackName, cells: c.cells })));
        if (!r.ok) { setMsg('❌ ' + r.error); return; }
        await onApply(r.next);
        setMsg('반영했습니다: ' + r.applied.map((a) => `${a.trackName} ${a.cells}칸`).join(', '));
    };

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            <Field label="담임 과목 파일 (hwp·hwpx·xlsx·csv)">
                <TextInput type="file" accept=".hwp,.hwpx,.xlsx,.csv,.txt" onChange={(e) => void pick(e.target.files?.[0])} />
            </Field>
            {msg && <p role="status" className="text-small">{msg}</p>}
            {result && !result.ok && (
                <div role="alert" className="text-small">
                    <p>❌ {name} — {result.reason}</p>
                    {result.warnings.filter((w) => w !== result.reason).map((w, i) => <p key={i}>{w}</p>)}
                </div>
            )}
            {result?.ok && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-small">{name} — 학급 {result.preview.classes.length}반 ({result.preview.source})</h3>
                    {result.preview.warnings.map((w, i) => <p key={i} className="text-small">⚠ {w}</p>)}
                    {result.preview.unknown.length > 0 && <p className="text-small">시간표에 없는 반(건너뜀): {result.preview.unknown.join(', ')}</p>}
                    {result.preview.classes.map((c) => (
                        <div key={c.trackName} className="text-small">
                            <div>{c.trackName}{c.homeroomName ? ` (${c.homeroomName})` : ''} 담임 칸 {c.cells.length} · 추가 {c.diff.add} · 바뀜 {c.diff.change} · 빠짐 {c.diff.remove} · 같음 {c.diff.same}</div>
                            {c.mismatches.map((m, i) => <div key={'m' + i}>⚠ {DAYS[m.dayIndex]} {m.start} 전담 칸 어긋남 — 파일 「{m.file}」 ≠ 편성 「{m.timetable}」(저장 안 함)</div>)}
                            {c.skipped.map((s, i) => <div key={'s' + i}>건너뜀 {DAYS[s.dayIndex]} {s.start} 「{s.text}」 — {s.why}</div>)}
                        </div>
                    ))}
                    <Button variant="solid" tone="accent" onClick={() => void apply(result.preview)}>이대로 반영</Button>
                </div>
            )}
        </div>
    );
}
