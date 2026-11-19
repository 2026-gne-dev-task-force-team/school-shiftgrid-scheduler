import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Group, NativeSelect, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';

import { todayStr as today } from '../today.js';
import { useOrgConfig } from '../orgConfig.js';
import Term from '../Term.jsx';

// 방 등록 자리(학교 기본 탭)로 — 탭 상태가 화면 묶음 안에 있어 탭 이름표를 눌러 준다(shortcut: Screens 가 이동 콜백을 주면 그걸로 바꾼다)
const goBasic = () => [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '학교 기본')?.click();

// 특별실 — 예약 · 빈 교실 찾기 · (관리자) 고정 칸 잠금. 겹쳐도 저장되고 경고만 뜬다
export default function Rooms({ P, admin }) {
  const org = useOrgConfig(P);
  const DAYS = org.weekdays;
  const [tab, setTab] = useState('book');
  const [rooms, setRooms] = useState([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [rows, setRows] = useState(null);
  const [locks, setLocks] = useState([]);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState([]);
  const [f, setF] = useState({ room: '', date: today(), period: '1' });
  const [free, setFree] = useState(null);
  const [lk, setLk] = useState({ weekday: '1', period: '1', note: '' });

  const load = useCallback(() => {
    api('GET', `${P}/bookings?from=${today()}`).then((r) => setRows(r.rows)).catch((e) => setError(e.message));
    api('GET', `${P}/room-locks`).then(setLocks).catch(() => {});
  }, [P]);
  useEffect(() => {
    api('GET', `${P}/special-rooms`).then((r) => { setRooms(r); setRoomsLoaded(true); setF((p) => ({ ...p, room: p.room || String(r[0]?.id ?? '') })); }).catch((e) => setError(e.message));
    load();
  }, [P, load]);

  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e.message); } load(); };
  const book = () => run(async () => {
    const r = await api('POST', `${P}/bookings`, { special_room_id: Number(f.room), on_date: f.date, period: Number(f.period) });
    setWarn(r.warnings);
  });
  const roomOpts = rooms.map((r) => ({ value: String(r.id), label: r.name }));
  const dateRow = (
    <Group grow wrap="nowrap">
      <TextInput type="date" label="날짜" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <TextInput type="number" label="교시" min={1} description={`기관 기준 ${org.limits.periods}교시`} value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} />
    </Group>
  );

  return (
    <Stack gap="sm" maw={560}>
      <SegmentedControl fullWidth value={tab} onChange={setTab} data={[{ value: 'book', label: '예약' }, { value: 'free', label: '빈 교실' }, ...(admin ? [{ value: 'lock', label: '고정 잠금' }] : [])]} />
      {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      {tab === 'book' && (
        <>
          {roomsLoaded && !roomOpts.length && (
            <Alert color="blue" data-testid="rooms-empty">
              <Term k="특별실">특별실</Term>은 「학교 기본」 화면의 특별실 칸에서 먼저 등록합니다. 등록하면 여기서 고를 수 있습니다.
              <Group mt="xs"><Button size="compact-sm" variant="light" onClick={goBasic}>학교 기본에서 특별실 등록하러 가기</Button></Group>
              {!admin && <Text size="xs" mt={4}>등록은 기관 관리자가 합니다.</Text>}
            </Alert>
          )}
          <NativeSelect label={<Term k="특별실">특별실</Term>} data={roomOpts} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
          {dateRow}
          <Button onClick={book} disabled={!f.room}>예약하기</Button>
          {warn.map((w, i) => <Alert key={i} color={w.color} title={w.label}>{w.detail}</Alert>)}
          {rows?.map((b) => (
            <Card key={b.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600}>{b.on_date} · {b.period}교시 · {b.room_name}</Text>
                {(b.mine || admin) && <Button size="compact-xs" variant="subtle" color="red" onClick={() => run(() => api('DELETE', `${P}/bookings/${b.id}`))}>취소</Button>}
              </Group>
              <Text size="sm">{b.who}{b.grade ? ` · ${b.grade}-${b.class_no}` : ''}</Text>
              {b.warnings.map((w, i) => <Badge key={i} mt={4} mr={4} color={w.color} variant="light" style={{ whiteSpace: 'normal', height: 'auto' }}>{w.detail}</Badge>)}
            </Card>
          ))}
          {rows?.length === 0 && <Text c="dimmed">오늘 이후 예약이 없습니다.</Text>}
        </>
      )}
      {tab === 'free' && (
        <>
          {dateRow}
          <Button onClick={() => run(async () => setFree(await api('GET', `${P}/rooms/free?on_date=${f.date}&period=${f.period}`)))}>빈 교실 찾기</Button>
          {free?.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap">
              <Text>{r.name}</Text>
              {r.free ? <Badge color="green">비어 있음</Badge> : <Text size="xs" c="dimmed">{r.busy.join(' · ')}</Text>}
            </Group>
          ))}
        </>
      )}
      {tab === 'lock' && admin && (
        <>
          <NativeSelect label="특별실" data={roomOpts} value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
          <Group grow wrap="nowrap">
            <NativeSelect label="요일" data={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} value={lk.weekday} onChange={(e) => setLk({ ...lk, weekday: e.target.value })} />
            <TextInput type="number" label="교시" min={1} description={`기관 기준 ${org.limits.periods}교시`} value={lk.period} onChange={(e) => setLk({ ...lk, period: e.target.value })} />
          </Group>
          <TextInput label="메모" value={lk.note} onChange={(e) => setLk({ ...lk, note: e.target.value })} maxLength={60} />
          <Button onClick={() => run(() => api('POST', `${P}/room-locks`, { special_room_id: Number(f.room), weekday: Number(lk.weekday), period: Number(lk.period), note: lk.note || null }))}>고정 칸 잠그기</Button>
          {locks.map((l) => (
            <Group key={l.id} justify="space-between" wrap="nowrap">
              <Text size="sm">{l.room_name} · {DAYS[l.weekday - 1]}요일 {l.period}교시{l.note ? ` · ${l.note}` : ''}</Text>
              <Button size="compact-xs" variant="subtle" color="red" onClick={() => run(() => api('DELETE', `${P}/room-locks/${l.id}`))}>풀기</Button>
            </Group>
          ))}
        </>
      )}
    </Stack>
  );
}
