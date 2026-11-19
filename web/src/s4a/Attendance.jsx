import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Stack, Table, Text, TextInput, Modal } from '@mantine/core';
import { api } from '../api.js';

import { todayStr } from '../today.js';
const thisMonth = () => todayStr().slice(0, 7);

// 근태 — 폰에서 내 근무를 적고, 관리자는 월 집계 · 마감 · 남의 줄 고치기. 마감된 달을 고치면 한 번 되묻는다(거부 아님).
export default function Attendance({ P, admin }) {
  const [ym, setYm] = useState(thisMonth());
  const [data, setData] = useState({ rows: [], closed: false });
  const [sum, setSum] = useState({ people: [] });
  const [form, setForm] = useState({ on_date: todayStr(), hours: 4, allowed_subject: '', memo: '' });
  const [warn, setWarn] = useState([]);
  const [ask, setAsk] = useState(null); // 재확인 대기 { run, violations }
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api('GET', `${P}/attendance?ym=${ym}`));
      setSum(await api('GET', `${P}/attendance/summary?ym=${ym}`));
    } catch (e) { setErr(e.message); }
  }, [P, ym]);
  useEffect(() => { load(); }, [load]);

  // 저장·삭제 공통: 409 needConfirm 이면 묻고, 확인하면 confirm 을 붙여 다시 보낸다
  const send = async (method, path, payload) => {
    setErr('');
    try {
      const r = await api(method, path, payload);
      setWarn(r.violations || []);
      setAsk(null);
      await load();
    } catch (e) {
      if (e.status === 409) {
        // api() 는 본문을 버리므로 한 번 더 같은 요청을 confirm 없이 보내 목록을 받지 않고, 일반 문구로 묻는다
        setAsk({ run: () => send(method, path, { ...payload, confirm: true }) });
      } else setErr(e.message);
    }
  };

  return (
    <Stack>
      <Group>
        <TextInput type="month" label="달" value={ym} onChange={(e) => setYm(e.currentTarget.value)} />
        {data.closed ? <Badge color="gray">마감됨</Badge> : <Badge color="green">열림</Badge>}
        {admin && (data.closed
          ? <Button variant="default" onClick={() => send('DELETE', `${P}/attendance/close/${ym}`)}>마감 풀기</Button>
          : <Button variant="default" onClick={() => send('POST', `${P}/attendance/close`, { ym })}>이 달 마감</Button>)}
      </Group>
      {err && <Alert color="red">{err}</Alert>}
      {warn.length > 0 && <Alert color="yellow">{warn.map((v) => v.label).join(' · ')} (저장됨)</Alert>}

      <Group align="end">
        <TextInput type="date" label="날짜" value={form.on_date} onChange={(e) => setForm({ ...form, on_date: e.currentTarget.value })} />
        <NumberInput label="시간" min={0} max={24} step={0.5} w={90} value={form.hours} onChange={(v) => setForm({ ...form, hours: Number(v) || 0 })} />
        <TextInput label="한 교과" value={form.allowed_subject} onChange={(e) => setForm({ ...form, allowed_subject: e.currentTarget.value })} />
        <TextInput label="메모(암호화 저장)" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.currentTarget.value })} />
        <Button onClick={() => send('POST', `${P}/attendance`, { on_date: form.on_date, hours: form.hours, allowed_subject: form.allowed_subject || null, memo: form.memo || null })}>저장</Button>
      </Group>

      <Table>
        <Table.Thead><Table.Tr><Table.Th>날짜</Table.Th><Table.Th>시간</Table.Th><Table.Th>교과</Table.Th><Table.Th>메모</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>
          {data.rows.map((r) => (
            <Table.Tr key={r.id}>
              <Table.Td>{r.on_date}</Table.Td><Table.Td>{r.hours}</Table.Td><Table.Td>{r.allowed_subject}</Table.Td><Table.Td>{r.memo}</Table.Td>
              <Table.Td><Button size="xs" variant="subtle" color="red" onClick={() => send('DELETE', `${P}/attendance/${r.id}`, {})}>지우기</Button></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Text fw={600}>이 달 근무시간</Text>
      {sum.people.map((p) => <Text key={p.membership_id}>{p.name} — {p.total_hours}시간 ({p.days}일)</Text>)}

      <Modal opened={!!ask} onClose={() => setAsk(null)} title="마감된 달입니다">
        <Text mb="md">이미 마감한 달의 근태를 고칩니다. 그래도 저장할까요?</Text>
        <Group><Button onClick={() => ask.run()}>그래도 저장</Button><Button variant="default" onClick={() => setAsk(null)}>취소</Button></Group>
      </Modal>
    </Stack>
  );
}
