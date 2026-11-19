import { useEffect, useState } from 'react';
import { clearAllPartial } from './gen/store.js';
import { Alert, Button, Center, Checkbox, Container, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { api } from './api.js';
import S1aScreens from './s1a/Screens.jsx';

function Login({ onDone }) {
  const [choose, setChoose] = useState(null); // 소속이 여럿이면 로그인 뒤 고른다
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = choose ? await api('POST', '/auth/pick-org', { orgId: Number(e.nativeEvent?.submitter?.value) }) : await api('POST', '/auth/login', { loginId, password, remember });
      if (r.choose) setChoose(r.choose); else onDone(r.user);
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
            {choose ? (
              <Stack>
                <Text>소속을 고르세요</Text>
                {choose.map((o) => <Button key={o.orgId} type="submit" value={o.orgId} loading={busy} variant="light">{o.name} ({o.role})</Button>)}
                {error && <Alert color="red">{error}</Alert>}
              </Stack>
            ) : (
            <Stack>
              <TextInput label="ID" value={loginId} onChange={(e) => setLoginId(e.currentTarget.value)} autoComplete="username" required />
              <PasswordInput label="비밀번호" value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" required />
              <Checkbox label="로그인 유지(30일)" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
              {error && <Alert color="red">{error}</Alert>}
              <Button type="submit" loading={busy}>로그인</Button>
            </Stack>
            )}
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
