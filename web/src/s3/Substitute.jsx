import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { api } from '../api.js';

const today = () => new Date().toISOString().slice(0, 10);
const GRADE_COLOR = { A: 'green', B: 'teal', C: 'blue', D: 'gray' };

// 보결 — 폰(390px) 먼저: 한 건이 카드 하나, 버튼은 줄바꿈되는 작은 버튼
export default function Substitute({ P, admin }) {
  const [tab, setTab] = useState('list');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cand, setCand] = useState(null);
  const load = useCallback(() => api('GET', `${P}/substitutes?from=${today()}`).then((r) => setRows(r.rows)).catch((e) => setError(e.message)), [P]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, body, okMsg) => {
    setError(''); setNotice('');
    try {
      const r = await api('POST', `${P}/substitutes/${path}`, body);
      setNotice([okMsg, ...(r.warnings || []).map((w) => `주의: ${w.detail}`)].filter(Boolean).join(' · '));
    } catch (e) { setError(e.message); }
    load(); setCand(null);
  };

  return (
    <Stack gap="sm" maw={560}>
      <SegmentedControl fullWidth value={tab} onChange={setTab} data={[{ value: 'list', label: '보결 목록' }, { value: 'new', label: '올리기' }, { value: 'fair', label: '형평성' }]} />
      {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert color={notice.includes('주의') ? 'yellow' : 'green'} withCloseButton onClose={() => setNotice('')}>{notice}</Alert>}
      {tab === 'new' && <NewForm P={P} admin={admin} onDone={(m) => { setTab('list'); setNotice(m || ''); load(); }} />}
      {tab === 'fair' && <Fairness P={P} />}
      {tab === 'list' && (rows === null ? null : rows.length === 0 ? <Text c="dimmed">오늘 이후 올라온 보결이 없습니다.</Text> : rows.map((s) => (
        <Card key={s.id} withBorder padding="sm" opacity={s.status === '취소' ? 0.5 : 1}>
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>{s.on_date} · {s.period}교시{s.grade ? ` · ${s.grade}-${s.class_no}` : ''}</Text>
            <Badge color={s.status === '열림' ? 'orange' : s.status === '맡음' ? 'green' : 'gray'}>{s.status}</Badge>
          </Group>
          <Text size="sm">결강 {s.absent_name}{s.reason_kind ? ` (${s.reason_kind})` : ''}{s.reason ? ` — ${s.reason}` : ''}</Text>
          {s.status === '맡음' && <Text size="sm">맡은 분 {s.taken_name || s.taken_outside_name}{s.taken_outside_name ? ' (명단 밖)' : ''}{s.grade_ab ? ` · 등급 ${s.grade_ab}` : ''}</Text>}
          <Group mt="xs" gap="xs">
            {s.status === '열림' && <Button size="xs" onClick={() => act(`${s.id}/take`, undefined, '맡았습니다')}>내가 맡기</Button>}
            {s.status !== '취소' && <Button size="xs" variant="default" onClick={() => api('GET', `${P}/substitutes/${s.id}/candidates`).then(setCand).catch((e) => setError(e.message))}>후보 보기</Button>}
            {s.status === '맡음' && (s.taken_by_me || admin) && <Button size="xs" variant="default" onClick={() => act(`${s.id}/release`, undefined, '해제했습니다')}>맡기 해제</Button>}
            {s.status !== '취소' && (s.mine || admin) && <Button size="xs" variant="subtle" color="red" onClick={() => act(`${s.id}/cancel`, undefined, '취소했습니다')}>취소</Button>}
          </Group>
        </Card>
      )))}
      <Modal opened={!!cand} onClose={() => setCand(null)} title="보결 후보" fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}>
        {cand && <Candidates data={cand} admin={admin} onAssign={(body) => act(`${cand.substitute.id}/assign`, body, '지정했습니다')} />}
      </Modal>
    </Stack>
  );
}

function Candidates({ data, admin, onAssign }) {
  const [outside, setOutside] = useState('');
  const why = data.excluded.filter((e) => e.code !== 'teaching');
  return (
    <Stack gap="xs">
      {!data.tt && <Alert color="yellow">그 날 적용되는 확정 시간표가 없어 등급을 못 냈습니다.</Alert>}
      {data.candidates.map((c) => (
        <Group key={c.membership_id} justify="space-between" wrap="nowrap">
          <Group gap="xs"><Badge color={GRADE_COLOR[c.grade]}>{c.grade}</Badge><Text>{c.name}</Text>{c.taken && <Badge variant="outline" color="orange">같은 시간 맡음</Badge>}</Group>
          {admin && <Button size="xs" variant="default" onClick={() => onAssign({ membership_id: c.membership_id })}>지정</Button>}
        </Group>
      ))}
      {why.length > 0 && <Text size="sm" fw={600} mt="sm">제외 — 왜 안 되는지</Text>}
      {why.map((e) => (
        <Group key={e.membership_id} gap="xs"><Text size="sm">{e.name}</Text><Text size="xs" c="dimmed">{e.reason}</Text>{admin && <Button size="compact-xs" variant="subtle" onClick={() => onAssign({ membership_id: e.membership_id })}>그래도 지정</Button>}</Group>
      ))}
      {admin && (
        <Group mt="md" align="end" wrap="nowrap">
          <TextInput style={{ flex: 1 }} label="명단 밖 이름(강사 등)" value={outside} onChange={(e) => setOutside(e.target.value)} maxLength={40} />
          <Button disabled={!outside.trim()} onClick={() => onAssign({ outside_name: outside.trim() })}>지정</Button>
        </Group>
      )}
    </Stack>
  );
}

function NewForm({ P, admin, onDone }) {
  const [people, setPeople] = useState([]);
  const [who, setWho] = useState(null); // 관리자가 남을 대신해 올릴 때 결강자(비우면 본인)
  useEffect(() => { if (admin) api('GET', `${P}/specialists`).then(setPeople).catch(() => setPeople([])); }, [P, admin]);
  const [date, setDate] = useState(today());
  const [allDay, setAllDay] = useState(true);
  const [period, setPeriod] = useState('');
  const [kind, setKind] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await api('POST', `${P}/substitutes`, {
        on_date: date, all_day: allDay, absent_membership_id: who ? Number(who) : undefined, reason_kind: kind || null, reason: reason || null,
        items: allDay ? undefined : [{ period: Number(period) }],
      });
      onDone('보결을 올렸습니다.');
    } catch (e) { setError(e.message); }
  };
  return (
    <Stack gap="sm">
      {admin && <Select label="결강하는 분(관리자 대신 올리기)" placeholder="비우면 나" clearable searchable data={people.map((x) => ({ value: String(x.membership_id), label: x.name }))} value={who} onChange={setWho} />}
      <TextInput type="date" label="날짜" value={date} onChange={(e) => setDate(e.target.value)} />
      <Checkbox label="종일 결강(그 날 내 수업 전부)" checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} />
      {!allDay && <TextInput type="number" label="교시" min={1} max={12} value={period} onChange={(e) => setPeriod(e.target.value)} />}
      <TextInput label="구분(병가·출장 등)" value={kind} onChange={(e) => setKind(e.target.value)} maxLength={20} />
      <Textarea label="사유 (암호화되어 본인·관리자만 봅니다)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autosize minRows={2} />
      {error && <Alert color="red">{error}</Alert>}
      <Button onClick={submit} disabled={!allDay && !period}>보결 올리기</Button>
    </Stack>
  );
}

function Fairness({ P }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('GET', `${P}/substitutes/fairness`).then((r) => setRows(r.rows)).catch(() => setRows([])); }, [P]);
  if (!rows) return null;
  return (
    <Stack gap={4}>
      <Text size="sm" c="dimmed">이번 학기에 맡은 횟수 — 적게 간(안 간) 분이 위에 옵니다.</Text>
      {rows.map((x) => (
        <Group key={x.key} justify="space-between" wrap="nowrap">
          <Text>{x.name}{x.outside ? ' (명단 밖)' : ''}</Text>
          <Text c={x.count === 0 ? 'orange' : undefined} fw={x.count === 0 ? 700 : 400}>{x.count}회{x.last ? ` · 마지막 ${x.last}` : ''}</Text>
        </Group>
      ))}
    </Stack>
  );
}
