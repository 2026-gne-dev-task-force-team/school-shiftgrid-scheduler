import { useState } from 'react';
import { Alert, Button, Paper, PasswordInput, Stack, Text } from '@mantine/core';
import { api } from '../api.js';

// 비밀번호 바꾸기 — forced 면 첫 로그인 강제 변경(다른 화면이 안 열린다)
export default function ChangePassword({ forced, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (next !== again) return setMsg({ color: 'red', text: '새 비밀번호 두 칸이 다릅니다' });
    setBusy(true);
    try {
      const r = await api('POST', '/auth/password', { current, next });
      setCurrent(''); setNext(''); setAgain('');
      setMsg({ color: 'green', text: '바꿨습니다. 다른 기기의 로그인은 끊깁니다.' });
      onDone?.(r.user);
    } catch (err) {
      setMsg({ color: 'red', text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function others() {
    await api('POST', '/auth/logout-others');
    setMsg({ color: 'green', text: '다른 기기의 로그인을 끊었습니다' });
  }

  return (
    <Paper withBorder p="lg" radius="md" maw={420} mx={forced ? 'auto' : undefined}>
      <form onSubmit={submit}>
        <Stack>
          {forced && <Alert color="yellow">첫 로그인입니다. 새 비밀번호로 바꿔야 다른 화면이 열립니다. (8자 이상, 흔한 비밀번호는 안 됩니다)</Alert>}
          <PasswordInput label={forced ? '임시 비밀번호' : '현재 비밀번호'} value={current} onChange={(e) => setCurrent(e.currentTarget.value)} autoComplete="current-password" required />
          <PasswordInput label="새 비밀번호" value={next} onChange={(e) => setNext(e.currentTarget.value)} autoComplete="new-password" required />
          <PasswordInput label="새 비밀번호 한 번 더" value={again} onChange={(e) => setAgain(e.currentTarget.value)} autoComplete="new-password" required />
          {msg && <Alert color={msg.color}>{msg.text}</Alert>}
          <Button type="submit" loading={busy}>비밀번호 바꾸기</Button>
          {!forced && (
            <>
              <Text size="sm" c="dimmed">다른 기기(폰·다른 PC)에 로그인된 것을 끊습니다.</Text>
              <Button variant="default" onClick={others}>다른 기기 로그인 끊기</Button>
            </>
          )}
        </Stack>
      </form>
    </Paper>
  );
}
