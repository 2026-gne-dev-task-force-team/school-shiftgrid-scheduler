import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Code, FileButton, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { api } from '../api.js';
import { downloadTemp } from './csv.js';
import { dutyOptions, roleLabel, useOrgConfig } from '../orgConfig.js';

const ROLES = ['기관관리자', '교직원', '보기만'];
const FIELDS = [['name', '이름'], ['loginId', 'ID'], ['role', '역할'], ['duty', '담임/전담']];

const download = downloadTemp;

export default function Roster({ orgId }) {
  const base = `/orgs/${orgId}/roster`;
  const cfg = useOrgConfig(`/orgs/${orgId}`);
  const roleData = ROLES.map((r) => ({ value: r, label: roleLabel(cfg, r) })); // 권한 키는 그대로, 보이는 글자만
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', loginId: '', role: '교직원', duty: null });
  const [temp, setTemp] = useState(null); // { loginId, temp }
  const [imp, setImp] = useState(null); // 열 맞추기 상태
  const [result, setResult] = useState(null);

  const load = () => api('GET', base).then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [orgId]);
  const run = async (fn) => {
    setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message); }
  };

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('POST', base, { ...form, loginId: form.loginId || form.name });
      setTemp({ name: form.name, loginId: r.loginId, temp: r.temp });
      setForm({ name: '', loginId: '', role: '교직원', duty: null });
    });
  };
  const patch = (m, body) => run(() => api('PATCH', `${base}/${m.id}`, body));
  const post = (m, what) => run(async () => {
    const r = await api('POST', `${base}/${m.id}/${what}`);
    if (r.temp) setTemp({ name: m.name, loginId: r.loginId, temp: r.temp });
  });

  async function pick(file) {
    if (!file) return;
    setErr('');
    try {
      const r = await api('POST', `${base}/import/preview`, file);
      setImp({ headers: r.headers, rows: r.rows, truncated: r.truncated, map: r.mapping });
    } catch (e) {
      setErr(e.message);
    }
  }
  const mapped = () => imp.rows.map((cells) => Object.fromEntries(FIELDS.map(([k]) => [k, imp.map[k] >= 0 ? cells[imp.map[k]] ?? '' : ''])));
  const [odd, setOdd] = useState(null); // 목록 밖 담당 구분 줄 — 「그래도 올리기」 한 번 묻기(재확인 수위)
  const doImport = (confirm) => run(async () => {
    try {
      const r = await api('POST', `${base}/import`, { rows: mapped(), ...(confirm === true ? { confirm: true } : {}) });
      setResult(r);
      setImp(null);
      setOdd(null);
    } catch (e) {
      if (e.body?.needConfirm) setOdd(e.body); else throw e;
    }
  });
  // 못 읽은 줄 빨강: 올리기 전에 화면에서도 같은 기준으로 미리 표시한다(서버가 최종 판정)
  const preBad = (r) => !r.name.trim() ? '이름 없음' : r.role && !ROLES.includes(r.role.trim()) ? '역할 모름' : '';
  const preOdd = (r) => { const t = (r.duty || '').trim(); return t && !cfg.duties.includes(t) && !/담임|전담|비교과/.test(t) ? '담당 구분 목록 밖' : ''; };

  const actions = (m) => (
    <Group gap="xs" wrap="nowrap">
      <Button size="xs" variant="default" onClick={() => post(m, 'reset-password')}>초기화</Button>
      {m.state === '잠김' ? <Button size="xs" variant="default" onClick={() => post(m, 'unlock')}>잠금 해제</Button> : <Button size="xs" variant="default" onClick={() => post(m, 'lock')}>잠금</Button>}
      <Button size="xs" variant="subtle" onClick={() => patch(m, { hidden: m.listStatus !== '숨김' })}>{m.listStatus === '숨김' ? '숨김 해제' : '숨김'}</Button>
    </Group>
  );
  const roleSel = (m) => <Select data={roleData} value={m.role} onChange={(v) => v && patch(m, { role: v })} allowDeselect={false} size="xs" w={120} />;
  const stateBadge = (m) => <><Badge color={m.state === '잠김' ? 'red' : m.state === '사용 중' ? 'green' : 'yellow'}>{m.state}</Badge>{m.listStatus === '숨김' && <Badge ml={4} color="gray">숨김</Badge>}</>;

  return (
    <Stack>
      <Title order={4}>명단 ({rows.length}명)</Title>
      {err && <Alert color="red">{err}</Alert>}
      <form onSubmit={add}>
        <Group align="flex-end">
          <TextInput label="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} required />
          <TextInput label="ID(비우면 이름)" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.currentTarget.value })} />
          <Select label="역할" data={roleData} value={form.role} onChange={(v) => setForm({ ...form, role: v })} allowDeselect={false} w={130} />
          <Select label="담임/전담" data={dutyOptions(cfg, form.duty)} value={form.duty} onChange={(v) => setForm({ ...form, duty: v })} clearable w={130} />
          <Button type="submit">사람 추가</Button>
        </Group>
      </form>
      <Group>
        <Button component="a" href={`/api${base}/template`} variant="default">엑셀 양식 내려받기</Button>
        <FileButton onChange={pick} accept=".xlsx">{(p) => <Button variant="default" {...p}>엑셀 올리기</Button>}</FileButton>
      </Group>

      <Stack gap="xs" hiddenFrom="sm">
        {rows.map((m) => (
          <Paper key={m.id} withBorder p="sm" opacity={m.listStatus === '숨김' ? 0.5 : 1}>
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600}>{m.name}{m.duty && <Text span size="xs" c="dimmed"> {m.duty}</Text>}</Text>
              <div>{stateBadge(m)}</div>
            </Group>
            <Text size="xs" c="dimmed" mb={4}>ID {m.loginId} · 마지막 로그인 {m.lastLogin ? new Date(m.lastLogin).toLocaleString('ko-KR') : '-'}</Text>
            <Stack gap={6}>{roleSel(m)}<Group gap="xs">{actions(m)}</Group></Stack>
          </Paper>
        ))}
      </Stack>
      <Table.ScrollContainer minWidth={700} visibleFrom="sm">
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>이름</Table.Th><Table.Th>ID</Table.Th><Table.Th>역할</Table.Th><Table.Th>상태</Table.Th><Table.Th>마지막 로그인</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((m) => (
              <Table.Tr key={m.id} opacity={m.listStatus === '숨김' ? 0.5 : 1}>
                <Table.Td>{m.name}{m.duty && <Text span size="xs" c="dimmed"> {m.duty}</Text>}</Table.Td>
                <Table.Td>{m.loginId}</Table.Td>
                <Table.Td>{roleSel(m)}</Table.Td>
                <Table.Td>{stateBadge(m)}</Table.Td>
                <Table.Td>{m.lastLogin ? new Date(m.lastLogin).toLocaleString('ko-KR') : '-'}</Table.Td>
                <Table.Td>{actions(m)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={!!temp} onClose={() => setTemp(null)} title="임시 비밀번호(한 번만 보입니다)">
        <Stack>
          <Text>ID <Code>{temp?.loginId}</Code></Text>
          <Text>임시 비밀번호 <Code fz="lg">{temp?.temp}</Code></Text>
          <Alert color="yellow">닫으면 다시 볼 수 없습니다. 본인에게 전한 뒤 닫으세요. 본인은 첫 로그인 때 바꿉니다.</Alert>
          <Button variant="default" onClick={() => download('ID·임시 비밀번호.csv', [{ ok: true, name: temp.name, loginId: temp.loginId, temp: temp.temp }])}>이번 목록 내려받기(엑셀/CSV)</Button>
          <Button onClick={() => setTemp(null)}>닫기</Button>
        </Stack>
      </Modal>

      <Modal opened={!!imp} onClose={() => setImp(null)} title="열 맞추기" size="xl">
        {imp && (
          <Stack>
            <Text size="sm">엑셀의 어느 열이 무엇인지 맞춰 주세요. 못 읽은 줄은 빨갛게 표시되고, 나머지는 그대로 만들어집니다.{imp.truncated && ' (1000줄까지만 읽었습니다)'}</Text>
            <Group>
              {FIELDS.map(([k, label]) => (
                <Select key={k} label={label} data={[{ value: '-1', label: '(없음)' }, ...imp.headers.map((h, i) => ({ value: String(i), label: h || `열 ${i + 1}` }))]} value={String(imp.map[k])} onChange={(v) => setImp({ ...imp, map: { ...imp.map, [k]: Number(v) } })} allowDeselect={false} w={150} />
              ))}
            </Group>
            <Table.ScrollContainer minWidth={500} mah={320}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>줄</Table.Th>{FIELDS.map(([, l]) => <Table.Th key={l}>{l}</Table.Th>)}<Table.Th /></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {mapped().map((r, i) => (
                    <Table.Tr key={i} bg={preBad(r) ? 'red.1' : preOdd(r) ? 'orange.1' : undefined} c={preBad(r) ? 'red.9' : preOdd(r) ? 'orange.9' : undefined}>
                      <Table.Td>{i + 1}</Table.Td>{FIELDS.map(([k]) => <Table.Td key={k}>{r[k]}</Table.Td>)}<Table.Td>{preBad(r) || preOdd(r)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {odd && (
              <Alert color="orange" title="담당 구분이 기관 목록 밖인 줄이 있습니다 — 그래도 올릴까요?">
                {odd.odd.map((x) => <Text key={x.line} size="sm">{x.line}줄 {x.name} — 「{x.duty}」</Text>)}
                <Text size="xs" c="dimmed">기관 목록: {odd.duties.join('·')}</Text>
                <Button mt="xs" color="orange" onClick={doImport(true)}>그래도 올리기</Button>
              </Alert>
            )}
            <Button onClick={doImport()} disabled={imp.map.name < 0}>{imp.rows.length}줄 올리기</Button>
          </Stack>
        )}
      </Modal>

      <Modal opened={!!result} onClose={() => setResult(null)} title={`올린 결과 — 만듦 ${result?.made} · 못 읽음 ${result?.failed}`} size="xl">
        {result && (
          <Stack>
            <Alert color="yellow">임시 비밀번호는 저장되지 않습니다. 지금 「ID·임시 비밀번호 목록」을 내려받으세요. 창을 닫으면 다시 볼 수 없습니다.</Alert>
            <Button onClick={() => download('ID·임시 비밀번호.csv', result.results)} disabled={!result.made}>이번 목록 내려받기(엑셀/CSV)</Button>
            <Table.ScrollContainer minWidth={500} mah={320}>
              <Table>
                <Table.Tbody>
                  {result.results.map((r) => (
                    <Table.Tr key={r.line} bg={r.ok ? undefined : 'red.1'} c={r.ok ? undefined : 'red.9'}>
                      <Table.Td>{r.line}</Table.Td><Table.Td>{r.name}</Table.Td><Table.Td>{r.loginId}</Table.Td><Table.Td>{r.ok ? `만듦${r.warnings?.length ? ` — ${r.warnings.map((w) => w.msg).join(' ')}` : ''}` : r.error}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
