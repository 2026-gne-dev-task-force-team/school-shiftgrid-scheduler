import { useEffect, useState } from 'react';
import { Button, Field, Textarea, TextInput } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import type { Rooms } from '../../rooms/contracts/rooms';
import type { RoomBooking } from '../../room-booking/contracts/room-booking';
import { parseRoomsCsv, roomsToCsv, type RoomCsvPreview } from './csv';
import { RoomImportView } from '../import/RoomImportView';
import { roomFrame } from '../import/roomFrame';
import type { TimeFrame } from '../../../../shared/import/frame.ts';
import { allRooms, applyCsvPlan, csvRoomsOf, legacyOf, planCsv, writeImport } from './ops';

/**
 * 방 관리 — 방 만들기·이름·정원·쓰는 방·지우기 · CSV 내보내기/불러오기(미리보기 뒤 확정) · 고정 사용 불러오기.
 *   🔴 자료는 rooms 약속(방 목록 + ext['room-booking'])뿐이다 — 여기엔 저장소가 없다. 차단 시간·고정 사용 손질은 「방 속성」 화면(room-booking)이 한다.
 */
export function RoomManageView({ rooms, host, newId, frame }: { rooms?: Rooms; host?: PluginHost; newId?: () => string; frame?: TimeFrame }) {
    const api = rooms ?? host?.modules.use<Rooms>('rooms') ?? undefined;
    const rb = host?.modules.use<RoomBooking>('room-booking');
    const [, bump] = useState(0);
    const [msg, setMsg] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', capacity: '2' });
    const [edit, setEdit] = useState<Record<string, { name: string; capacity: string }>>({});
    const [csv, setCsv] = useState('');
    const [preview, setPreview] = useState<RoomCsvPreview | null>(null);
    const [importing, setImporting] = useState(false);
    const [pendingDel, setPendingDel] = useState<string | null>(null);
    useEffect(() => { const d = api?.onChange(() => bump((n) => n + 1)); return () => d?.dispose(); }, [api]);

    if (!api) return <div className="p-4 text-small" role="alert">방 목록 플러그인이 꺼져 있습니다.</div>;
    const listId = api.lists()[0]?.id ?? '';
    const list = allRooms(api);
    const mk = newId ?? (() => crypto.randomUUID());
    const noList = () => { setMsg('방 목록이 아직 없습니다. 방 목록을 먼저 만드세요.'); };

    /** 정원 글자 → 숫자 · 빈 칸 = null(제한 없음) · 틀린 글자 = undefined. */
    const capOf = (text: string): number | null | undefined => {
        if (text.trim() === '') return null;
        const n = Number(text);
        return Number.isInteger(n) && n >= 0 ? n : undefined;
    };
    const add = () => {
        if (!listId) { noList(); return; }
        const name = form.name.trim();
        const capacity = capOf(form.capacity);
        if (!name) { setMsg('방 이름이 비었습니다.'); return; }
        if (capacity === undefined) { setMsg('정원은 비우거나 0 이상 정수여야 합니다.'); return; }
        if (list.some((r) => r.name === name)) { setMsg(`방 이름이 겹칩니다(${name}).`); return; }
        const id = api.addRoom(listId, { name });
        if (!id) { setMsg('방을 만들지 못했습니다.'); return; }
        const sort = list.reduce((m, r) => Math.max(m, api.roomProps(r.id).sort ?? 0), 0) + 1;
        api.setRoomProps(id, { capacity, sort });
        setMsg('방을 더했습니다.'); setForm({ name: '', capacity: '2' });
    };
    const save = (id: string) => {
        const e = edit[id];
        if (!e) return;
        const name = e.name.trim();
        const capacity = capOf(e.capacity);
        if (!name) { setMsg('방 이름이 비었습니다.'); return; }
        if (capacity === undefined) { setMsg('정원은 비우거나 0 이상 정수여야 합니다.'); return; }
        if (list.some((r) => r.id !== id && r.name === name)) { setMsg(`방 이름이 겹칩니다(${name}).`); return; }
        api.updateRoom(id, { name });
        api.setRoomProps(id, { capacity });
        setMsg('고쳤습니다.');
    };
    const doPreview = () => setPreview(parseRoomsCsv(csv, mk));
    const plan = preview && !preview.headerError ? planCsv(csvRoomsOf(api), preview.rooms) : null;
    const doImport = () => {
        if (!plan) return;
        if (plan.adds.length > 0 && !listId) { noList(); return; }
        const r = applyCsvPlan(api, listId, plan);
        setMsg(`불러왔습니다(더함 ${r.added} · 고침 ${r.set}).`); setPreview(null);
    };

    if (importing) {
        const cur = legacyOf(api);
        return (
            <div className="flex flex-col">
                <div className="p-4 pb-0"><Button variant="outline" onClick={() => setImporting(false)}>돌아가기</Button></div>
                <RoomImportView frame={frame ?? roomFrame()} rooms={cur.rooms} fixed={cur.fixed} newId={newId}
                    onApply={(n, applied) => { writeImport(api, listId, cur.rooms, n, applied); }} />
            </div>
        );
    }

    return (
        <div className="p-4 max-w-xl flex flex-col gap-3">
            {msg && <p role="alert" className="text-small">{msg}</p>}
            <h3 className="text-small">방 {list.length}개</h3>
            {list.map((r) => {
                const p = api.roomProps(r.id);
                const e = edit[r.id] ?? { name: r.name, capacity: p.capacity === undefined ? '' : String(p.capacity) };
                return (
                    <div key={r.id} data-testid="room-row" className="flex flex-wrap gap-2 items-center text-small">
                        <TextInput aria-label={`${r.name} 이름`} value={e.name} onChange={(x) => setEdit((s) => ({ ...s, [r.id]: { ...e, name: x.target.value } }))} />
                        <TextInput aria-label={`${r.name} 정원`} value={e.capacity} onChange={(x) => setEdit((s) => ({ ...s, [r.id]: { ...e, capacity: x.target.value } }))} />
                        <Button variant="outline" onClick={() => save(r.id)}>{`${r.name} 저장`}</Button>
                        <Button variant="outline" onClick={() => { api.setRoomProps(r.id, { active: !p.active }); setMsg(p.active ? '껐습니다.' : '켰습니다.'); }}>{p.active ? `${r.name} 끄기` : `${r.name} 켜기`}</Button>
                        {pendingDel === r.id
                            ? (
                                <>
                                    <span>정말 지울까요?</span>
                                    <Button variant="solid" tone="danger" onClick={() => { setPendingDel(null); api.removeRoom(r.id); setMsg('지웠습니다.'); }}>{`${r.name} 지우기 확인`}</Button>
                                    <Button variant="outline" onClick={() => setPendingDel(null)}>지우기 취소</Button>
                                </>
                            )
                            : <Button variant="outline" tone="danger" onClick={() => setPendingDel(r.id)}>{`${r.name} 지우기`}</Button>}
                    </div>
                );
            })}
            <div data-testid="form-row" className="flex flex-wrap gap-2 items-end">
                <Field label="새 방 이름"><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
                <Field label="정원"><TextInput value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></Field>
                <Button variant="solid" tone="accent" onClick={add}>방 더하기</Button>
            </div>
            <p className="text-small">차단 시간·고정 사용 손질은 「방 속성」 화면에서 합니다.</p>
            {host && <div><Button variant="outline" onClick={() => { host.workspace.open('room-booking.room-props', { where: 'center' }); }}>방 속성 열기</Button></div>}
            {rb && <div><Button variant="outline" onClick={() => { host?.commands.run(rb.cmd.book); }}>방 예약 열기</Button></div>}
            <Button variant="outline" onClick={() => setImporting(true)}>고정 사용 불러오기</Button>
            <h3 className="text-small">CSV</h3>
            <Button variant="outline" onClick={() => setCsv(roomsToCsv(csvRoomsOf(api)))}>CSV 내보내기</Button>
            <Textarea aria-label="CSV 내용" rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
            <Button variant="outline" onClick={doPreview}>미리보기</Button>
            {preview?.headerError && <p role="alert" className="text-small">{preview.headerError}</p>}
            {preview && !preview.headerError && plan && (
                <div className="text-small">
                    <p>넣을 방 {plan.adds.length} · 고칠 방 {plan.sets.length} · 그대로 {plan.same} · 거절 {preview.rejects.length}</p>
                    {preview.rejects.map((r) => <p key={r.line}>{r.line}줄: {r.why}</p>)}
                    <Button variant="solid" tone="accent" onClick={doImport}>불러오기</Button>
                </div>
            )}
        </div>
    );
}

export function RoomManagePanel({ host }: { host: PluginHost }) { return <RoomManageView host={host} />; }
