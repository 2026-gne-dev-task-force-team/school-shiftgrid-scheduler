import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';
import { EmptyHint, Finger } from './Guide.jsx';
import { findById, pickOrFirst, sameId, loadPick, savePick } from './pick.js';

const DAYS = ['월', '화', '수', '목', '금'];
const UNDO_MAX = 50;

// 손으로 짜기 격자 — 반 하나씩(폰에서도 한 화면), 칸을 눌러 교과·교사·특별실을 넣고 뺀다.
// 겹침은 빨강 표시만 · 저장은 항상 된다. 되돌리기는 칸 단위로 여러 단계.
export default function Grid({ P, admin }) {
  const [list, setList] = useState(null);
  const [tid, setTid] = useState(() => loadPick().tid);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const loadList = useCallback(() => api('GET', `${P}/timetables`).then((r) => { setList(r); setTid((t) => (findById(r, t) ? t : r[0]?.id ?? null)); }).catch((e) => setError(e.message)), [P]);
  useEffect(() => { loadList(); }, [loadList]);

  async function create() {
    setError('');
    try {
      const t = await api('POST', `${P}/timetables`, { name: name.trim() });
      setName(''); setTid(t.id); loadList();
    } catch (e) { setError(e.message); }
  }

  if (!list) return error ? <Alert color="red">{error}</Alert> : null;
  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      <Group className="no-print" align="end">
        {list.length > 0 && <Select label="시간표" data={list.map((t) => ({ value: String(t.id), label: `${t.name} (${t.status})` }))} value={tid ? String(tid) : null} onChange={(v) => setTid(Number(v))} allowDeselect={false} />}
        {admin && (
          <>
            <TextInput label="새 시안 이름" placeholder="예: 2학기 시안 1" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Button disabled={!name.trim()} onClick={create}>시안 만들기</Button>
          </>
        )}
      </Group>
      {list.length === 0 && (admin
        ? <Finger text="먼저 시안 이름을 적고 「시안 만들기」를 누르세요">
            <EmptyHint title="아직 시간표가 없습니다" body="학교 기본(반)과 시수표를 채운 뒤 시안을 만들면 여기서 손으로 칸을 채울 수 있습니다." />
          </Finger>
        : <EmptyHint title="아직 시간표가 없습니다" body="관리자가 시안을 만들면 여기에 보입니다." />)}
      {tid && <Editor key={tid} P={P} tid={tid} admin={admin} />}
    </Stack>
  );
}

function Editor({ P, tid, admin }) {
  const [d, setD] = useState(null);
  const [classId, setClassId] = useState(() => loadPick().classId);
  const [sel, setSel] = useState(null); // {weekday, period}
  const [form, setForm] = useState({});
  const [undo, setUndo] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => api('GET', `${P}/timetables/${tid}`).then((r) => { setD(r); setClassId((c) => (findById(r.classrooms, c) ? c : r.classrooms[0]?.id ?? null)); }).catch((e) => setError(e.message)), [P, tid]);
  useEffect(() => { load(); }, [load]);

  const cellMap = useMemo(() => {
    const m = new Map();
    for (const c of d?.cells || []) m.set(`${c.classroom_id}:${c.weekday}:${c.period}`, c);
    return m;
  }, [d]);
  if (!d) return error ? <Alert color="red">{error}</Alert> : null;
  if (!d.classrooms.length) return <Finger text="학교 기본 메뉴에서 반을 먼저 만드세요"><EmptyHint title="반이 없습니다" body="「학교 기본」에서 학년별 반 수를 정하면 격자가 생깁니다." /></Finger>;

  const cls = pickOrFirst(d.classrooms, classId);
  const pcount = d.periods?.grades?.[cls.grade]?.periods ?? 5;
  const name = (list, v) => findById(list, v);
  const subjName = (id) => name(d.subjects, id)?.short_name || name(d.subjects, id)?.name || '';
  const levelOf = (rule) => d.levels[rule];
  // 이 칸이 걸린 위반(빨강/노랑 색은 수위가 정한다)
  const hit = (c, w, p) => d.violations.find((v) => v.weekday === w && v.period === p && v.classroom_ids?.some((x) => sameId(x, c)));

  async function save(cell, { record = true } = {}) {
    setError('');
    const key = `${cell.classroom_id}:${cell.weekday}:${cell.period}`;
    const prev = cellMap.get(key) || { ...cell, subject_id: null, membership_id: null, special_room_id: null };
    if (d.timetable.status === '확정' && levelOf('edit_confirmed') === '재확인' && !window.confirm('확정된 시간표입니다. 그래도 저장할까요?')) return;
    try {
      const r = await api('PUT', `${P}/timetables/${tid}/cells`, cell);
      if (record) setUndo((u) => [...u.slice(-(UNDO_MAX - 1)), prev]);
      setMsg(r.violations.length ? r.violations : null);
      await load();
    } catch (e) { setError(e.message); }
  }
  const undoOnce = async () => {
    const prev = undo[undo.length - 1];
    if (!prev) return;
    setUndo((u) => u.slice(0, -1));
    await save({ classroom_id: prev.classroom_id, weekday: prev.weekday, period: prev.period, subject_id: prev.subject_id ?? null, membership_id: prev.membership_id ?? null, special_room_id: prev.special_room_id ?? null }, { record: false });
  };
  const open = (w, p) => {
    if (!admin) return;
    const c = cellMap.get(`${cls.id}:${w}:${p}`);
    setSel({ weekday: w, period: p });
    setForm({ subject_id: c?.subject_id ? String(c.subject_id) : null, membership_id: c?.membership_id ? String(c.membership_id) : null, special_room_id: c?.special_room_id ? String(c.special_room_id) : null });
  };
  const num = (v) => (v ? Number(v) : null);
  const commit = async (clear) => {
    const base = { classroom_id: cls.id, weekday: sel.weekday, period: sel.period };
    await save(clear ? { ...base, subject_id: null, membership_id: null, special_room_id: null } : { ...base, subject_id: num(form.subject_id), membership_id: num(form.membership_id), special_room_id: num(form.special_room_id) });
    setSel(null);
  };
  const hasCells = d.cells.length > 0;
  const redCount = d.violations.filter((v) => v.color === 'red').length;

  return (
    <Stack>
      {error && <Alert color="red">{error}</Alert>}
      <Group className="no-print" justify="space-between">
        <Select label="반" data={d.classrooms.map((c) => ({ value: String(c.id), label: `${c.grade}학년 ${c.class_no}반` }))} value={String(cls.id)} onChange={(v) => setClassId(v)} allowDeselect={false} w={150} />
        <Group>
          {redCount > 0 && <Badge color="red" size="lg">겹침 {redCount}곳</Badge>}
          {d.violations.some((v) => v.color === 'yellow') && <Badge color="yellow" size="lg">알림 있음</Badge>}
          {admin && <Button variant="default" disabled={!undo.length} onClick={undoOnce}>되돌리기 ({undo.length})</Button>}
          <Button variant="default" onClick={() => window.print()}>인쇄</Button>
        </Group>
      </Group>
      <Text className="print-only" fw={700}>{d.timetable.name} — {cls.grade}학년 {cls.class_no}반</Text>
      {admin && !hasCells && <Finger text="아무 칸이나 눌러 교과와 교사를 넣어 보세요" />}
      {msg && (
        <Alert className="no-print" color={msg.some((v) => v.color === 'red') ? 'red' : 'yellow'} withCloseButton onClose={() => setMsg(null)}>
          저장했습니다. {msg.map((v) => v.detail || v.label).join(' · ')}
        </Alert>
      )}
      <div className="grid-scroll">
        <Table withTableBorder withColumnBorders className="tt-grid">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={50}>교시</Table.Th>
              {DAYS.map((x) => <Table.Th key={x} ta="center">{x}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Array.from({ length: pcount }, (_, i) => i + 1).map((p) => (
              <Table.Tr key={p}>
                <Table.Td ta="center" fw={600}>{p}</Table.Td>
                {DAYS.map((_x, wi) => {
                  const w = wi + 1;
                  const c = cellMap.get(`${cls.id}:${w}:${p}`);
                  const v = hit(cls.id, w, p);
                  return (
                    <Table.Td key={w} className={v ? `cell-${v.color}` : ''} style={{ cursor: admin ? 'pointer' : 'default', background: v ? (v.color === 'red' ? 'var(--mantine-color-red-1)' : 'var(--mantine-color-yellow-1)') : undefined }} onClick={() => open(w, p)}>
                      {c ? (
                        <>
                          <Text size="sm" fw={600}>{subjName(c.subject_id) || '·'}</Text>
                          <Text size="xs" c="dimmed">{name(d.teachers, c.membership_id)?.name || ''}{c.special_room_id ? ` @${name(d.rooms, c.special_room_id)?.name || ''}` : ''}</Text>
                          {v && <Text size="xs" c={v.color} fw={700}>{v.label}</Text>}
                        </>
                      ) : <Text size="xs" c="dimmed">&nbsp;</Text>}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <Modal opened={!!sel} onClose={() => setSel(null)} title={sel ? `${cls.grade}-${cls.class_no} ${DAYS[sel.weekday - 1]}요일 ${sel.period}교시` : ''}>
        <Stack>
          <Select label="교과" allowDeselect={false} searchable data={d.subjects.map((s) => ({ value: String(s.id), label: s.name }))} value={form.subject_id} onChange={(v) => setForm({ ...form, subject_id: v })} />
          <Select label="교사" allowDeselect={false} searchable data={d.teachers.map((t) => ({ value: String(t.id), label: t.name }))} value={form.membership_id} onChange={(v) => setForm({ ...form, membership_id: v })} />
          <Select label="특별실" allowDeselect={false} data={d.rooms.map((r) => ({ value: String(r.id), label: r.name }))} value={form.special_room_id} onChange={(v) => setForm({ ...form, special_room_id: v })} />
          <Group justify="space-between">
            <Button color="red" variant="light" onClick={() => commit(true)}>칸 비우기</Button>
            <Button onClick={() => commit(false)}>넣기</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
