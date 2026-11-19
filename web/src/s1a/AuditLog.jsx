import { useEffect, useState } from 'react';
import { Alert, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';

// 기록 탭 — 감사 로그(최근순). 기관 관리자는 orgId, 시스템 관리자는 기관을 골라서(orgId 없음).
export default function AuditLog({ orgId }) {
  const [orgs, setOrgs] = useState([]);
  const [pick, setPick] = useState(null);
  const [f, setF] = useState({ from: '', to: '', who: '', action: '' });
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [err, setErr] = useState('');
  const target = orgId ?? pick;
  const base = orgId ? `/orgs/${orgId}/audit` : `/admin/orgs/${pick}/audit`;

  useEffect(() => { if (!orgId) api('GET', '/admin/orgs').then(setOrgs).catch((e) => setErr(e.message)); }, [orgId]);

  const qs = (before) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    if (before) p.set('before', before);
    return p.toString();
  };
  const load = async (more) => {
    setErr('');
    try {
      const r = await api('GET', `${base}?${qs(more ? next : null)}`);
      setItems(more ? [...items, ...r.items] : r.items);
      setNext(r.more ? r.next : null);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { if (target) load(false); }, [target]);

  const detail = (r) => [r.before && `전 ${JSON.stringify(r.before)}`, r.after && `후 ${JSON.stringify(r.after)}`].filter(Boolean).join(' ');
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });

  return (
    <Stack>
      {err && <Alert color="red">{err}</Alert>}
      {!orgId && <Select label="기관" data={orgs.map((o) => ({ value: String(o.id), label: o.name }))} value={pick} onChange={setPick} searchable />}
      <form onSubmit={(e) => { e.preventDefault(); if (target) load(false); }}>
        <Group align="flex-end">
          <TextInput type="date" label="부터" value={f.from} onChange={set('from')} />
          <TextInput type="date" label="까지" value={f.to} onChange={set('to')} />
          <TextInput label="사람(이름)" value={f.who} onChange={set('who')} w={140} />
          <TextInput label="동작(앞글자)" placeholder="예: roster" value={f.action} onChange={set('action')} w={160} />
          <Button type="submit" disabled={!target}>찾기</Button>
        </Group>
      </form>
      <Table.ScrollContainer minWidth={600}>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>시각</Table.Th><Table.Th>누가</Table.Th><Table.Th>무엇</Table.Th><Table.Th>대상</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {items.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{new Date(r.at).toLocaleString('ko-KR')}</Table.Td>
                <Table.Td>{r.who ?? '-'}</Table.Td>
                <Table.Td>{r.action}</Table.Td>
                <Table.Td>{r.table ?? ''}{r.rowId ? ` #${r.rowId}` : ''} <Text span size="xs" c="dimmed">{detail(r)}</Text></Table.Td>
              </Table.Tr>
            ))}
            {target && !items.length && <Table.Tr><Table.Td colSpan={4}><Text c="dimmed">기록이 없습니다</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {next && <Button variant="default" onClick={() => load(true)}>더 보기</Button>}
    </Stack>
  );
}
