import { useEffect, useState } from 'react';
import type { Op } from '../../../server-link/replay';
import { Button, Field, Textarea, TextInput } from '../../../pane-ui-system';
import { getRoomSource, getViewer, isManager, isMockRoomSource, setViewer, type Room, type RoomSource, type RoomsPart, type Viewer } from '../book';
import { parseRoomsCsv, roomsToCsv, type RoomCsvPreview } from './csv';
import { RoomImportView } from '../import/RoomImportView';
import { roomFrame } from '../import/roomFrame';
import type { TimeFrame } from '../../../../shared/import/frame.ts';
import { addBlock, addRoom, applyRoomOps, delBlock, delRoom, editRoom, opsFromRooms } from './ops';

/** 방 관리(관리 역할만) — 방 추가·고침·끄기·지우기 · 차단 · CSV 내보내기/불러오기(미리보기 뒤 확정). */
export function RoomManageView({ source, viewer, newId, frame }: { source?: RoomSource; viewer?: Viewer; newId?: () => string; frame?: TimeFrame }) {
    const src = source ?? getRoomSource();
    const [, bump] = useState(0);
    const v = viewer ?? getViewer();
    const mock = !source && !viewer && isMockRoomSource(src);
    const asRole = (role: Viewer['role']) => { setViewer({ ...getViewer(), role }); bump((n) => n + 1); };
    const mk = newId ?? (() => crypto.randomUUID());
    const [part, setPart] = useState<RoomsPart | null>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', capacity: '2' });
    const [block, setBlock] = useState({ roomId: '', start: '', end: '', reason: '' });
    const [edit, setEdit] = useState<Record<string, { name: string; capacity: string }>>({});
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<RoomCsvPreview | null>(null);
    const [importing, setImporting] = useState(false);
    const reload = async () => setPart(await src.loadPart());
    useEffect(() => { void reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isManager(v)) {
        return (
            <div className="p-4 flex flex-col gap-2 items-start">
                <p className="text-small" role="alert">방 관리는 교무·교감·관리자만 할 수 있습니다.</p>
                {mock && <Button variant="ghost" onClick={() => asRole('교무')}>체험: 교무로 보기</Button>}
            </div>
        );
    }

    /** 서버 판을 새로 읽어 조작을 입히고, 규칙에 걸리지 않으면 쓴다. */
    const run = async (ops: Op[], done: string) => {
        const server = await src.loadPart();
        const out = applyRoomOps(server, ops);
        if (out.errors.length > 0) { setMsg(out.errors.join(' ')); await reload(); return; }
        await src.savePart(out.next);
        setMsg(done);
        await reload();
    };
    const add = () => {
        const capacity = Number(form.capacity);
        const sort = (part?.rooms.reduce((m, r) => Math.max(m, r.sort), 0) ?? 0) + 1;
        void run([addRoom({ id: mk(), name: form.name.trim(), capacity, resourceKey: null, active: true, sort, note: '' })], '방을 더했습니다.').then(() => setForm({ name: '', capacity: '2' }));
    };
    const save = (r: Room) => {
        const e = edit[r.id];
        if (!e) return;
        void run([editRoom(r, { ...r, name: e.name.trim(), capacity: Number(e.capacity) })], '고쳤습니다.');
    };
    const doPreview = () => setPreview(parseRoomsCsv(csv, mk));
    const doImport = () => {
        if (!preview || preview.headerError || !part) return;
        const { ops } = opsFromRooms(part.rooms, preview.rooms);
        void run(ops, `불러왔습니다(${ops.length}건).`).then(() => setPreview(null));
    };
    const plan = preview && !preview.headerError && part ? opsFromRooms(part.rooms, preview.rooms) : null;

    if (importing && part) {
        return (
            <div className="flex flex-col">
                <div className="p-4 pb-0"><Button variant="ghost" onClick={() => setImporting(false)}>돌아가기</Button></div>
                <RoomImportView frame={frame ?? roomFrame()} rooms={part.rooms} fixed={part.fixed} newId={newId}
                    onApply={async (n) => { await src.savePart({ rooms: n.rooms, fixed: n.fixed, blocks: part.blocks }); await reload(); }} />
            </div>
        );
    }

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            {mock && <div><Button variant="ghost" onClick={() => asRole('교사')}>교사로 돌아가기</Button></div>}
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">방 {part?.rooms.length ?? 0}개</h3>
            {part?.rooms.map((r) => {
                const e = edit[r.id] ?? { name: r.name, capacity: String(r.capacity) };
                return (
                    <div key={r.id} className="flex gap-2 items-center text-small">
                        <TextInput aria-label={`${r.name} 이름`} value={e.name} onChange={(x) => setEdit((s) => ({ ...s, [r.id]: { ...e, name: x.target.value } }))} />
                        <TextInput aria-label={`${r.name} 정원`} value={e.capacity} onChange={(x) => setEdit((s) => ({ ...s, [r.id]: { ...e, capacity: x.target.value } }))} />
                        <Button variant="ghost" onClick={() => save(r)}>{`${r.name} 저장`}</Button>
                        <Button variant="ghost" onClick={() => void run([editRoom(r, { ...r, active: !r.active })], r.active ? '껐습니다.' : '켰습니다.')}>{r.active ? `${r.name} 끄기` : `${r.name} 켜기`}</Button>
                        <Button variant="ghost" onClick={() => void run([delRoom(r.id)], '지웠습니다.')}>{`${r.name} 지우기`}</Button>
                    </div>
                );
            })}
            <div className="flex gap-2 items-end">
                <Field label="새 방 이름"><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
                <Field label="정원"><TextInput value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></Field>
                <Button variant="solid" tone="accent" onClick={add}>방 더하기</Button>
            </div>
            <h3 className="text-small">차단 {part?.blocks.length ?? 0}건</h3>
            {part?.blocks.map((b) => (
                <div key={b.id} className="flex gap-2 items-center text-small">
                    <span>{part.rooms.find((r) => r.id === b.roomId)?.name} {b.startDate}~{b.endDate} {b.reason}</span>
                    <Button variant="ghost" onClick={() => void run([delBlock(b.id)], '차단을 풀었습니다.')}>차단 풀기</Button>
                </div>
            ))}
            <div className="flex gap-2 items-end">
                <Field label="방 id"><TextInput value={block.roomId} onChange={(e) => setBlock((s) => ({ ...s, roomId: e.target.value }))} /></Field>
                <Field label="시작일"><TextInput value={block.start} onChange={(e) => setBlock((s) => ({ ...s, start: e.target.value }))} /></Field>
                <Field label="끝일"><TextInput value={block.end} onChange={(e) => setBlock((s) => ({ ...s, end: e.target.value }))} /></Field>
                <Field label="사유"><TextInput value={block.reason} onChange={(e) => setBlock((s) => ({ ...s, reason: e.target.value }))} /></Field>
                <Button variant="solid" onClick={() => void run([addBlock({ id: mk(), roomId: block.roomId, startDate: block.start, endDate: block.end, fromMin: null, toMin: null, reason: block.reason })], '차단했습니다.')}>차단 더하기</Button>
            </div>
            <Button variant="ghost" onClick={() => setImporting(true)}>고정 사용 불러오기</Button>
            <h3 className="text-small">CSV</h3>
            <Button variant="ghost" onClick={() => part && setCsv(roomsToCsv(part.rooms))}>CSV 내보내기</Button>
            <Textarea aria-label="CSV 내용" rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
            <Button variant="ghost" onClick={doPreview}>미리보기</Button>
            {preview?.headerError && <p role="alert" className="text-small">{preview.headerError}</p>}
            {preview && !preview.headerError && plan && (
                <div className="text-small">
                    <p>넣을 방 {plan.adds} · 고칠 방 {plan.sets} · 그대로 {plan.same} · 거절 {preview.rejects.length}</p>
                    {preview.rejects.map((r) => <p key={r.line}>{r.line}줄: {r.why}</p>)}
                    <Button variant="solid" tone="accent" onClick={doImport}>불러오기</Button>
                </div>
            )}
        </div>
    );
}

export function RoomManagePanel() { return <RoomManageView />; }
