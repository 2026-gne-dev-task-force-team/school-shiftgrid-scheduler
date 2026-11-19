import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Modal, NumberInput, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';
import { useOrgConfig } from '../orgConfig.js';
import { useConfirm } from '../Confirm.jsx';
import { todayStr } from '../today.js';
import { featureOn } from '../features.js';
import { EmptyHint, Finger } from './Guide.jsx';
import { emptyCount, confirmText } from '../../../shared/ttConfirm.js';
import { roomWeek, isClash, movePreview } from '../../../shared/ttDrag.js';
import { findById, pickOrFirst, sameId, loadPick, savePick } from './pick.js';

const UNDO_MAX = 50;
const GRADES = [1, 2, 3, 4, 5, 6];
// 폰은 오늘 요일부터. 기관 요일 수보다 큰 날(주말인데 토요일이 없는 학교)은 월
const todayDay = (n) => { const w = new Date().getDay(); const k = w === 0 ? 7 : w; return k <= n ? k : 1; };

// 빠른 시작 — 반 수와 교시 수만 묻고 학기·반·교시틀·빈 시안을 한 번에 만든다. 선생님·시수는 나중.
function QuickStart({ P, onDone }) {
  const [cls, setCls] = useState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 });
  const [per, setPer] = useState({ 1: 5, 2: 5, 3: 6, 4: 6, 5: 6, 6: 6 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    try { await api('POST', `${P}/quick-start`, { classes: cls, periods: per }); onDone(); } catch (e) { setError(e.message); setBusy(false); }
  };
  const total = GRADES.reduce((a, g) => a + (cls[g] || 0), 0);
  return (
    <Card withBorder maw={420}>
      <Stack gap="xs">
        <Text fw={700}>빠른 시작 — 반 수와 교시 수만 정하세요</Text>
        {error && <Alert color="red">{error}</Alert>}
        <Table><Table.Thead><Table.Tr><Table.Th>학년</Table.Th><Table.Th>반 수(0이면 안 만듦)</Table.Th><Table.Th>하루 교시 수</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{GRADES.map((g) => (
            <Table.Tr key={g}><Table.Td>{g}학년</Table.Td>
              <Table.Td><NumberInput aria-label={`${g}학년 반 수`} min={0} max={30} w={90} value={cls[g]} onChange={(v) => setCls({ ...cls, [g]: Number(v) || 0 })} /></Table.Td>
              <Table.Td><NumberInput aria-label={`${g}학년 교시 수`} min={1} max={10} w={90} value={per[g]} onChange={(v) => setPer({ ...per, [g]: Number(v) || 1 })} /></Table.Td></Table.Tr>
          ))}</Table.Tbody></Table>
        <Button disabled={busy || !total} onClick={go}>만들기</Button>
        <Text size="xs" c="dimmed">선생님·시수·자동 생성은 나중에 필요할 때 켜면 됩니다</Text>
      </Stack>
    </Card>
  );
}

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
        ? <QuickStart P={P} onDone={loadList} />
        : <EmptyHint title="아직 시간표가 없습니다" body="관리자가 시안을 만들면 여기에 보입니다." />)}
      {tid && <Editor key={tid} P={P} tid={tid} admin={admin} onChanged={loadList} onDeleted={() => { setTid(null); loadList(); }} />}
    </Stack>
  );
}

function Editor({ P, tid, admin, onChanged, onDeleted }) {
  const [date, setDate] = useState(() => todayStr());
  const [d, setD] = useState(null);
  const [classId, setClassId] = useState(() => loadPick().classId);
  const [sel, setSel] = useState(null); // {weekday, period}
  const cfg = useOrgConfig(P);
  const DAYS = cfg.weekdays; // 요일은 기관 설정 한 곳(서버 config.weekdays)
  const roomsOn = featureOn(cfg.features, 'rooms');
  const [ask, confirmBox] = useConfirm();
  const [day, setDay] = useState(() => todayDay(DAYS.length));
  useEffect(() => { if (cfg.loaded) setDay(todayDay(cfg.weekdays.length)); }, [cfg.loaded]); // 기관 요일을 받은 뒤 한 번 다시 맞춘다 // 폰에서 보이는 요일(1~요일 수)
  const [tx, setTx] = useState(null);
  const go = (n) => setDay((x) => Math.min(DAYS.length, Math.max(1, x + n)));
  const [form, setForm] = useState({});
  const [undo, setUndo] = useState([]);
  const [roomView, setRoomView] = useState(null);
  const [drag, setDrag] = useState(null); // 끌고 있는 칸 {weekday, period}
  const [over, setOver] = useState(null); // 지나가는 칸 {weekday, period}
  const moved = useRef(false); // 끌어서 다른 칸까지 갔으면 true — 그 뒤 클릭은 칸 열기로 치지 않는다
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
  if (!d.classrooms.length && admin) return <QuickStart P={P} onDone={load} />;
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
    if (d.timetable.status === '확정' && levelOf('edit_confirmed') === '재확인') {
      const a = await ask('확정된 시간표입니다. 어떻게 고칠까요?', { yes: '확정 풀고 고치기', alt: '확정본 그대로 고치기(기록에 남음)', no: '취소' });
      if (!a) return;
      if (a === true) {
        try { await api('POST', `${P}/timetables/${tid}/unconfirm`); onChanged(); } catch (e) { setError(e.message); return; }
      }
    }
    try {
      const r = await api('PUT', `${P}/timetables/${tid}/cells`, cell);
      if (record) setUndo((u) => [...u.slice(-(UNDO_MAX - 1)), prev]);
      setMsg(r.violations.length ? { head: '저장했습니다.', list: r.violations } : null);
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
    const nn = (form.newSubject || '').trim();
    if (!clear && nn) { // 처음 보는 과목 이름은 그 자리에서 과목으로 만든다
      try {
        const have = d.subjects.find((x) => x.name === nn);
        form.subject_id = String(have ? have.id : (await api('POST', `${P}/subjects`, { name: nn })).id);
      } catch (e) { setError(e.message); return; }
    }
    await save(clear ? { ...base, subject_id: null, membership_id: null, special_room_id: null } : { ...base, subject_id: num(form.subject_id), membership_id: num(form.membership_id), special_room_id: num(form.special_room_id) });
    setSel(null);
  };
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const confirmTt = () => run(async () => {
    const t = d.timetable;
    if (!(await ask(confirmText(t.name, date, d.violations.length, emptyCount(d.classrooms, d.periods, d.cells)), { yes: '확정' }))) return;
    const r = await api('POST', `${P}/timetables/${tid}/confirm`, { starts_on: date });
    setMsg(r.notes?.length ? { head: '확정했습니다.', list: r.notes } : null);
    await load(); onChanged();
  });
  const unconfirmTt = () => run(async () => {
    if (!(await ask('확정을 풀고 시안으로 돌릴까요?', { yes: '확정 풀기' }))) return;
    await api('POST', `${P}/timetables/${tid}/unconfirm`); setMsg(null); await load(); onChanged();
  });
  const deleteTt = () => run(async () => {
    if (!(await ask(`「${d.timetable.name}」을 지울까요?${d.timetable.status === '확정' ? ' 확정된 시간표입니다.' : ''}`, { yes: '지우기' }))) return;
    await api('DELETE', `${P}/timetables/${tid}`); onDeleted();
  });
  const hasCells = d.cells.length > 0;
  const redCount = d.violations.filter((v) => v.color === 'red').length;
  const gradeOf = Object.fromEntries(d.classrooms.map((k) => [k.id, k.grade]));
  const pv = drag && over ? movePreview(d.cells, { classroom_id: cls.id, ...drag }, { classroom_id: cls.id, ...over }, { periods: d.periods, gradeOf, roomCap: Object.fromEntries(d.rooms.filter((r) => r.capacity != null).map((r) => [r.id, r.capacity])), studentOf: Object.fromEntries(d.classrooms.filter((k) => k.student_count != null).map((k) => [k.id, k.student_count])), capCount: cfg.roomCapacity?.count }) : null;
  const drop = async (w, p) => {
    const from = drag; setDrag(null); setOver(null);
    if (!admin || !from || (from.weekday === w && from.period === p)) return;
    const src = cellMap.get(`${cls.id}:${from.weekday}:${from.period}`);
    if (!src) return;
    const dst = cellMap.get(`${cls.id}:${w}:${p}`);
    const body = (x) => ({ subject_id: x?.subject_id ?? null, membership_id: x?.membership_id ?? null, special_room_id: x?.special_room_id ?? null });
    await save({ classroom_id: cls.id, weekday: w, period: p, ...body(src) });
    await save({ classroom_id: cls.id, weekday: from.weekday, period: from.period, ...body(dst) }); // 맞바꿈이면 옛 칸 내용, 아니면 비움
  };

  // 끌어 옮기기는 포인터 이벤트(마우스·터치 공통). 손가락은 처음 눌린 칸에 묶이니 좌표로 칸을 찾는다.
  const cellAt = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-w]'); return el ? { weekday: Number(el.dataset.w), period: Number(el.dataset.p) } : null; };
  const pMove = (e) => {
    if (!drag) return;
    const t = cellAt(e);
    if (!t) return;
    if (!over || over.weekday !== t.weekday || over.period !== t.period) setOver(t);
    if (t.weekday !== drag.weekday || t.period !== drag.period) moved.current = true;
  };
  const pUp = (e) => {
    if (!drag) return;
    const t = cellAt(e);
    if (moved.current && t) drop(t.weekday, t.period); else { setDrag(null); setOver(null); }
  };

  return (
    <Stack>
      {confirmBox}
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
      {admin && (
        <Group className="no-print" align="end">
          {d.timetable.status === '확정'
            ? <><Badge color="green" size="lg">확정됨{d.timetable.starts_on ? ` · ${String(d.timetable.starts_on).slice(0, 10)}부터` : ''}</Badge><Button variant="default" onClick={unconfirmTt}>확정 풀기</Button></>
            : <><TextInput type="date" label="적용 시작일" value={date} onChange={(e) => setDate(e.currentTarget.value)} /><Button color="green" disabled={!date} onClick={confirmTt}>확정</Button></>}
          <Button color="red" variant="light" onClick={deleteTt}>지우기</Button>
        </Group>
      )}
      <Text className="print-only" fw={700}>{d.timetable.name} — {cls.grade}학년 {cls.class_no}반</Text>
      {admin && !hasCells && <Finger text="아무 칸이나 눌러 교과와 교사를 넣어 보세요" />}
      {msg && (
        <Alert className="no-print" color={msg.list.some((v) => v.color === 'red') ? 'red' : 'yellow'} withCloseButton onClose={() => setMsg(null)}>
          {msg.head} {msg.list.map((v) => v.detail || v.label).join(' · ')}
        </Alert>
      )}
      <Group className="phone-only no-print" justify="space-between">
        <Button variant="default" size="xs" disabled={day <= 1} onClick={() => go(-1)}>◀ 전날</Button>
        <Text fw={700}>{DAYS[day - 1]}요일</Text>
        <Button variant="default" size="xs" disabled={day >= DAYS.length} onClick={() => go(1)}>다음날 ▶</Button>
      </Group>
      <div className="grid-scroll" onPointerMove={pMove} onPointerUp={pUp} onPointerCancel={() => { setDrag(null); setOver(null); }} onTouchStart={(e) => setTx(e.target.closest?.('[data-drag]') ? null : e.touches[0].clientX)} onTouchEnd={(e) => { if (tx != null && Math.abs(e.changedTouches[0].clientX - tx) > 60) go(e.changedTouches[0].clientX < tx ? 1 : -1); setTx(null); }}>
        <Table withTableBorder withColumnBorders className="tt-grid">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={50}>교시</Table.Th>
              {DAYS.map((x, i) => <Table.Th key={x} ta="center" className={i + 1 === day ? 'day-on' : 'day-off'}>{x}</Table.Th>)}
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
                  const here = pv && over.weekday === w && over.period === p; // 놓을 자리 미리보기
                  const bad = here && pv.overlaps.length > 0;
                  return (
                    <Table.Td key={w} className={`${w === day ? 'day-on' : 'day-off'} ${v ? `cell-${v.color}` : ''}`} style={{ cursor: admin ? 'pointer' : 'default', ...(admin && c ? { touchAction: 'none', userSelect: 'none' } : {}), background: here ? (bad ? 'var(--mantine-color-red-2)' : 'var(--mantine-color-green-1)') : v ? (v.color === 'red' ? 'var(--mantine-color-red-1)' : 'var(--mantine-color-yellow-1)') : undefined }} onClick={() => { if (moved.current) { moved.current = false; return; } open(w, p); }}
                      data-w={w} data-p={p} {...(admin && c ? { 'data-drag': 1 } : {})}
                      onPointerDown={(e) => { moved.current = false; if (admin && c && e.button === 0) { setDrag({ weekday: w, period: p }); } }}>
                      {c ? (
                        <>
                          <Text size="sm" fw={600}>{subjName(c.subject_id) || '·'}</Text>
                          <Text size="xs" c="dimmed">{name(d.teachers, c.membership_id)?.name || ''}{c.special_room_id ? ` @${name(d.rooms, c.special_room_id)?.name || ''}` : ''}</Text>
                          {v && <Text size="xs" c={v.color} fw={700}>{v.label}</Text>}
                        </>
                      ) : <Text size="xs" c="dimmed">&nbsp;</Text>}
                      {here && <Text size="xs" fw={700} c={bad ? 'red' : 'green'} data-testid="drag-preview">{bad ? `옮기면 ${pv.overlaps.join(' · ')}` : '겹침 없음'}{pv.vacates ? ' · 보낸 칸은 빈칸이 됩니다' : ' · 맞바꿈'}</Text>}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
      {roomsOn && <Stack gap={4} className="no-print">
        <Select label="특별실 주간 보기" placeholder="방을 고르면 그 방을 쓰는 칸이 나옵니다" clearable data={d.rooms.map((r) => ({ value: String(r.id), label: r.name }))} value={roomView} onChange={setRoomView} w={260} />
        {roomView && (() => {
          const wk = roomWeek(d.cells, roomView);
          const maxP = Math.max(1, ...d.classrooms.map((k) => d.periods?.grades?.[k.grade]?.periods ?? 5), ...[...wk.keys()].map((k) => Number(k.split(':')[1])));
          return (
            <div style={{ overflowX: 'auto' }} data-testid="room-week">
              <Table withTableBorder withColumnBorders style={{ minWidth: 80 + DAYS.length * 110 }}>
                <Table.Thead><Table.Tr><Table.Th w={50}>교시</Table.Th>{DAYS.map((x) => <Table.Th key={x} ta="center">{x}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>{Array.from({ length: maxP }, (_, i) => i + 1).map((p) => (
                  <Table.Tr key={p}>
                    <Table.Td ta="center" fw={600}>{p}</Table.Td>
                    {DAYS.map((_x, wi) => {
                      const list = wk.get(`${wi + 1}:${p}`);
                      const clash = isClash(list);
                      return (
                        <Table.Td key={wi} style={{ background: clash ? 'var(--mantine-color-red-1)' : undefined }}>
                          {list?.map((c) => {
                            const k = findById(d.classrooms, c.classroom_id);
                            return <Text size="xs" key={c.classroom_id} c={clash ? 'red' : undefined}>{k ? `${k.grade}-${k.class_no}` : ''} {name(d.subjects, c.subject_id)?.name || ''} {name(d.teachers, c.membership_id)?.name || ''}</Text>;
                          })}
                          {clash && <Text size="xs" c="red" fw={700}>겹침</Text>}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                ))}</Table.Tbody>
              </Table>
            </div>
          );
        })()}
      </Stack>}
      <Modal opened={!!sel} onClose={() => setSel(null)} title={sel ? `${cls.grade}-${cls.class_no} ${DAYS[sel.weekday - 1]}요일 ${sel.period}교시` : ''}>
        <Stack>
          <Select label="교과" allowDeselect={false} searchable data={d.subjects.map((s) => ({ value: String(s.id), label: s.name }))} value={form.subject_id} onChange={(v) => setForm({ ...form, subject_id: v })} />
          <TextInput label="또는 과목 이름 직접 쓰기" placeholder="목록에 없으면 여기에 (예: 창체)" value={form.newSubject || ''} onChange={(e) => setForm({ ...form, newSubject: e.currentTarget.value })} />
          <Select label="교사(비워도 됩니다)" clearable searchable data={d.teachers.map((t) => ({ value: String(t.id), label: t.name }))} value={form.membership_id} onChange={(v) => setForm({ ...form, membership_id: v })} />
          {roomsOn && <Select label="특별실" clearable placeholder="없음" data={d.rooms.map((r) => ({ value: String(r.id), label: r.name }))} value={form.special_room_id} onChange={(v) => setForm({ ...form, special_room_id: v })} />}
          <Group justify="space-between">
            <Button color="red" variant="light" onClick={() => commit(true)}>칸 비우기</Button>
            <Button onClick={() => commit(false)}>넣기</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
