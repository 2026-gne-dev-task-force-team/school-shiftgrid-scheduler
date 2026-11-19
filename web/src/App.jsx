import { useEffect, useState } from 'react';
import { clearAllPartial } from './gen/store.js';
import { Alert, Button, Center, Checkbox, Container, Paper, PasswordInput, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { api } from './api.js';
import S1aScreens from './s1a/Screens.jsx';

function Login({ onDone }) {
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState(null);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('GET', '/auth/orgs').then(setOrgs).catch(() => setError('기관 목록을 불러오지 못했습니다'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('POST', '/auth/login', { orgId: Number(orgId), loginId, password, remember });
      onDone(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Center mih="100vh" p="md">
      <Container size={400} w="100%">
        <Title order={2} ta="center" mb="md">우리학교 시간표</Title>
        <Paper withBorder shadow="sm" p="lg" radius="md">
          <form onSubmit={submit}>
            <Stack>
              <Select label="기관" placeholder="기관을 고르세요" data={orgs.map((o) => ({ value: String(o.id), label: o.name }))} value={orgId} onChange={setOrgId} required description="시스템 관리자는 기관 「교육청」을 고르세요" />
              <TextInput label="ID" value={loginId} onChange={(e) => setLoginId(e.currentTarget.value)} autoComplete="username" required />
              <PasswordInput label="비밀번호" value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" required />
              <Checkbox label="로그인 유지(30일)" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
              {error && <Alert color="red">{error}</Alert>}
              <Button type="submit" loading={busy} disabled={!orgId}>로그인</Button>
            </Stack>
          </form>
        </Paper>
      </Container>
    </Center>
  );
}

function Home({ user, onLogout, onUser }) {
  return <S1aScreens user={user} onLogout={onLogout} onUser={onUser} />;
}

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api('GET', '/auth/session').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api('POST', '/auth/logout');
    await clearAllPartial(); // 생성 중간 결과는 로그아웃 때 지운다
    const r = await api('GET', '/auth/session');
    setUser(r.user);
  }

  if (user === undefined) return null;
  return user ? <Home user={user} onLogout={logout} onUser={setUser} /> : <Login onDone={setUser} />;
}
