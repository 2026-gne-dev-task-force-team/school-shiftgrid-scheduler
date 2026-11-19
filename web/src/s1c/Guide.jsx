import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Group, Modal, Paper, Stack, Text, TextInput, List } from '@mantine/core';
import { GLOSSARY } from '../glossary.js';
import { api } from '../api.js';

// 처음 안내 — 환영 · 손가락(다음 할 일 가리키기) · 빈 화면 안내 · 도움말
export function Finger({ text, children }) {
  return (
    <Stack gap="xs" className="no-print">
      <Alert color="blue" icon={<span>👉</span>}>{text}</Alert>
      {children}
    </Stack>
  );
}

export function EmptyHint({ title, body }) {
  return (
    <Paper withBorder p="xl" ta="center" className="no-print">
      <Text fw={600}>{title}</Text>
      <Text size="sm" c="dimmed" mt="xs">{body}</Text>
    </Paper>
  );
}

const STEPS = ['학교 기본 — 반 · 교시 · 점심 시각 (기본 교과 14개는 이미 들어 있습니다)', '명단 — 선생님 계정 만들기', '시수표 — 누가 어느 반에 몇 시간', '시간표 — 시안을 만들고 칸을 채우기'];

function Glossary() {
  const [q, setQ] = useState('');
  const rows = Object.entries(GLOSSARY).sort((a, b) => a[0].localeCompare(b[0], 'ko')).filter(([k, v]) => !q.trim() || (k + v).includes(q.trim()));
  return (
    <Stack gap="xs">
      <Text fw={600}>낱말 풀이</Text>
      <TextInput placeholder="낱말 찾기 (예: 시수)" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      {rows.length === 0 && <Text size="sm" c="dimmed">찾는 낱말이 없습니다.</Text>}
      {rows.map(([k, v]) => <div key={k}><Text size="sm" fw={600}>{k}</Text><Text size="sm">{v}</Text></div>)}
    </Stack>
  );
}

export function HelpModal({ opened, onClose, admin }) {
  return (
    <Modal opened={opened} onClose={onClose} title="도움말">
      <Stack>
        {admin ? (
          <>
            <Text size="sm">권장 순서입니다. 어느 것부터 눌러도 됩니다.</Text>
            <List type="ordered" size="sm">{STEPS.map((s) => <List.Item key={s}>{s}</List.Item>)}</List>
            <Text size="sm">시간표 칸을 누르면 교과·교사·특별실을 넣고 뺄 수 있습니다. 같은 교사가 같은 시각에 두 반에 있거나 특별실이 겹치면 빨강으로 보이지만 저장은 됩니다. 「되돌리기」로 한 칸씩 돌립니다.</Text>
          </>
        ) : (
          <Text size="sm">「내 시간표」에서 내 수업만 모아 봅니다. 폰에서는 옆으로 밀어 보세요. 「인쇄」 버튼으로 종이에 뽑을 수 있습니다.</Text>
        )}
        <Divider />
        <Glossary />
      </Stack>
    </Modal>
  );
}

// 처음 로그인 환영 — 닫으면 서버에 기억한다
export function Welcome({ P, admin }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { api('GET', `${P}/me/guide`).then((r) => setOpen(!r.done)).catch(() => {}); }, [P]);
  const close = () => { setOpen(false); api('PUT', `${P}/me/guide`, { done: true }).catch(() => {}); };
  return (
    <Modal opened={open} onClose={close} title="환영합니다" centered>
      <Stack>
        {admin ? (
          <>
            <Text size="sm">시간표를 처음 만드는 순서입니다. 어느 것부터 눌러도 됩니다.</Text>
            <List type="ordered" size="sm">{STEPS.map((s) => <List.Item key={s}>{s}</List.Item>)}</List>
          </>
        ) : <Text size="sm">「내 시간표」 메뉴에서 내 수업을 폰으로 볼 수 있습니다.</Text>}
        <Group justify="flex-end"><Button onClick={close}>시작하기</Button></Group>
      </Stack>
    </Modal>
  );
}
