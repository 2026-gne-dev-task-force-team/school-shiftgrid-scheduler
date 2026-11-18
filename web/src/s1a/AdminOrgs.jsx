import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Code, Group, Modal, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { api } from '../api.js';
import { downloadTemp } from './csv.js';

// 시스템 관리자 화면 — 기관 등록 · 상태 · 첫 관리자 · 비밀번호 초기화. 기관 안 데이터는 이 화면에 없다.
export default function AdminOrgs() {
  const [orgs, setOrgs] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', ilgoaName: '', orgCode: '', kind: '초' });
  const [temp, setTemp] = useState(null); // { title, loginId, temp }
  const [admin, setAdmin] = useState(null); // 첫 관리자 만들기 대상 기관
  const [adminForm, setAdminForm] = useState({ name: '', loginId: '' });
  const [conc, setConc] = useState(null); // 겸임 소속 추가 대상 기관
  const [concForm, setConcForm] = useState({ loginId: '', role: '교직원' });
  const [reset, setReset] = useState(null); // { org, admins }

  const load = () => api('GET', '/admin/orgs').then(setOrgs).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const run = async (fn) => {
    setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message); }
  };

  const register = (e) => {
    e.preventDefault();
    run(async () => {
      await api('POST', '/admin/orgs', { ...form, ilgoaName: form.ilgoaName || null, orgCode: form.orgCode || null });
      setForm({ name: '', ilgoaName: '', orgCode: '', kind: '초' });
    });
  };
  const toggle = (o) => run(() => api('PATCH', `/admin/orgs/${o.id}`, { status: o.status === '사용' ? '중지' : '사용' }));
  const makeAdmin = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('POST', `/admin/orgs/${admin.id}/first-admin`, adminForm);
      setTemp({ title: `${admin.name} 첫 관리자`, loginId: r.loginId, temp: r.temp, existing: r.existing });
      setAdmin(null);
      setAdminForm({ name: '', loginId: '' });
    });
  };
  const addConc = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await api('POST', `/admin/orgs/${conc.id}/members`, concForm);
      setTemp({ title: `${conc.name} 겸임 소속 추가`, loginId: r.loginId, temp: null });
      setConc(null);
      setConcForm({ loginId: '', role: '교직원' });
    });
  };
  const openReset = (o) => run(async () => setReset({ org: o, admins: await api('GET', `/admin/orgs/${o.id}/admins`) }));
  const doReset = (a) => run(async () => {
    const r = await api('POST', `/admin/orgs/${reset.org.id}/reset-password`, { userId: a.userId });
    setTemp({ title: `${reset.org.name} 비밀번호 초기화`, loginId: a.loginId, temp: r.temp });
    setReset(null);
  });

  return (
    <Stack>
      <Title order={4}>기관 관리</Title>
      {err && <Alert color="red">{err}</Alert>}
      <form onSubmit={register}>
        <Group align="flex-end">
          <TextInput label="기관 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} required />
          <TextInput label="아이좋아 표기(선택)" description="나이스·아이좋아 문서에 적힌 학교 이름 그대로. 올린 파일과 이름을 맞출 때만 씁니다" value={form.ilgoaName} onChange={(e) => setForm({ ...form, ilgoaName: e.currentTarget.value })} />
          <TextInput label="기관 코드(선택)" value={form.orgCode} onChange={(e) => setForm({ ...form, orgCode: e.currentTarget.value })} w={140} />
          <Select label="종류" data={['초', '중']} value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} allowDeselect={false} w={90} />
          <Button type="submit">기관 등록</Button>
        </Group>
      </form>
      <Table.ScrollContainer minWidth={600}>
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>기관</Table.Th><Table.Th>관리자</Table.Th><Table.Th>사용자</Table.Th><Table.Th>마지막 활동</Table.Th><Table.Th>상태</Table.Th><Table.Th /></Table.Tr></Table.Thead>
          <Table.Tbody>
            {orgs.map((o) => (
              <Table.Tr key={o.id}>
                <Table.Td>{o.name} <Text span size="xs" c="dimmed">{o.kind}</Text></Table.Td>
                <Table.Td>{o.admins}</Table.Td>
                <Table.Td>{o.users}</Table.Td>
                <Table.Td>{o.lastActive ? new Date(o.lastActive).toLocaleString('ko-KR') : '-'}</Table.Td>
                <Table.Td><Badge color={o.status === '사용' ? 'green' : 'gray'}>{o.status}</Badge></Table.Td>
                <Table.Td>
                  {o.kind !== '교육청' && (
                    <Group gap="xs" wrap="nowrap">
                      <Button size="xs" variant="default" onClick={() => toggle(o)}>{o.status === '사용' ? '중지' : '사용으로'}</Button>
                      <Button size="xs" variant="default" onClick={() => setAdmin(o)}>첫 관리자 만들기</Button>
                      <Button size="xs" variant="default" onClick={() => setConc(o)}>겸임 소속 추가</Button>
                      <Button size="xs" variant="default" onClick={() => openReset(o)}>관리자 비밀번호 초기화</Button>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal opened={!!admin} onClose={() => setAdmin(null)} title={`${admin?.name} — 첫 관리자 만들기`}>
        <form onSubmit={makeAdmin}>
          <Stack>
            <TextInput label="이름" value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.currentTarget.value })} required />
            <TextInput label="로그인 ID" description="이미 있는 ID 면 그 사람에게 소속만 더합니다(겸임)" value={adminForm.loginId} onChange={(e) => setAdminForm({ ...adminForm, loginId: e.currentTarget.value })} required />
            <Button type="submit">만들기</Button>
          </Stack>
        </form>
      </Modal>
      <Modal opened={!!conc} onClose={() => setConc(null)} title={`${conc?.name} — 겸임 소속 추가`}>
        <form onSubmit={addConc}>
          <Stack>
            <TextInput label="로그인 ID" description="이미 있는 계정에 이 기관 소속을 더합니다. 비밀번호는 그대로입니다." value={concForm.loginId} onChange={(e) => setConcForm({ ...concForm, loginId: e.currentTarget.value })} required />
            <Select label="역할" data={['기관관리자', '교직원', '보기만']} value={concForm.role} onChange={(v) => setConcForm({ ...concForm, role: v })} allowDeselect={false} />
            <Button type="submit">소속 더하기</Button>
          </Stack>
        </form>
      </Modal>
      <Modal opened={!!reset} onClose={() => setReset(null)} title={`${reset?.org.name} — 관리자 비밀번호 초기화`}>
        <Stack>
          {reset?.admins.length === 0 && <Text>관리자가 없습니다. 「첫 관리자 만들기」를 쓰세요.</Text>}
          {reset?.admins.map((a) => (
            <Group key={a.userId} justify="space-between">
              <Text>{a.name} ({a.loginId})</Text>
              <Button size="xs" color="red" variant="light" onClick={() => doReset(a)}>초기화</Button>
            </Group>
          ))}
        </Stack>
      </Modal>
      <Modal opened={!!temp} onClose={() => setTemp(null)} title={temp?.title}>
        <Stack>
          <Text>ID <Code>{temp?.loginId}</Code></Text>
          {temp?.temp ? <Text>임시 비밀번호 <Code fz="lg">{temp.temp}</Code></Text> : <Text>이미 있는 계정에 소속을 더했습니다. 비밀번호는 그대로입니다.</Text>}
          {temp?.temp && <Alert color="yellow">이 창을 닫으면 다시 볼 수 없습니다. 본인에게 전한 뒤 닫으세요.</Alert>}
          {temp?.temp && <Button variant="default" onClick={() => downloadTemp('ID·임시 비밀번호.csv', [{ name: temp.title, loginId: temp.loginId, temp: temp.temp }])}>이번 목록 내려받기(엑셀/CSV)</Button>}
          <Button onClick={() => setTemp(null)}>닫기</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
