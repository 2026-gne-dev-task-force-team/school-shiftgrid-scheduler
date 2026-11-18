import { useEffect, useState } from 'react';
import { Alert, Button, Group, Stack, Table, Text } from '@mantine/core';
import { api, appliedMinePath } from '../api.js';
import { EmptyHint } from './Guide.jsx';
import { emptyReason } from './mineReason.js';

const DAYS = ['월', '화', '수', '목', '금'];

// 교직원 「내 시간표」 — 내 칸만 모아 요일×교시로
export default function Mine({ P }) {
  const [data, setData] = useState(null);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');

  // 오늘 적용 중인 확정본의 내 칸(적용 시작일이 아직 안 온 확정본은 서버가 걸러 준다)
  useEffect(() => {
    api('GET', appliedMinePath(P)).then(setData).catch((e) => setError(e.message));
    api('GET', `${P}/timetables`).then(setList).catch(() => setList([]));
  }, [P]);

  if (error) return <Alert color="red">{error}</Alert>;
  if (!data) return null;
  const cells = data?.cells || [];
  const max = Math.max(5, ...cells.map((c) => c.period));
  const at = (w, p) => cells.filter((c) => c.weekday === w && c.period === p);
  return (
    <Stack>
      <Group className="no-print" align="end" justify="space-between">
        <Text size="sm" c="dimmed">{data.timetable ? `${data.timetable.name} (오늘 적용 중${data.timetable.starts_on ? ` · ${data.timetable.starts_on} 시작` : ''})` : '적용 중인 시간표 없음'}</Text>
        <Button variant="default" onClick={() => window.print()}>인쇄</Button>
      </Group>
      {!cells.length && (() => { const r = emptyReason(data.timetable, list); return <EmptyHint title={r.title} body={r.body} />; })()}
      <div className="grid-scroll">
        <Table withTableBorder withColumnBorders className="tt-grid">
          <Table.Thead><Table.Tr><Table.Th w={50}>교시</Table.Th>{DAYS.map((x) => <Table.Th key={x} ta="center">{x}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>
            {Array.from({ length: max }, (_, i) => i + 1).map((p) => (
              <Table.Tr key={p}>
                <Table.Td ta="center" fw={600}>{p}</Table.Td>
                {DAYS.map((_x, wi) => (
                  <Table.Td key={wi} >
                    {at(wi + 1, p).map((c) => (
                      <div key={c.classroom_id}>
                        <Text size="sm" fw={600}>{c.grade}-{c.class_no} {c.subject || ''}</Text>
                        {c.room && <Text size="xs" c="dimmed">{c.room}</Text>}
                      </div>
                    ))}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}
