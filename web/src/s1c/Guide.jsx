import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Divider, Group, Modal, Paper, Stack, Text, TextInput, List } from '@mantine/core';
import { GLOSSARY } from '../glossary.js';
import { api } from '../api.js';
import { useConfirm } from '../Confirm.jsx';
import { configPath, mergeConfig } from '../orgConfig.js';
import { Pitch } from '../settings/FeatureBoard.jsx';
import { featureOn, featureDiff } from '../../../shared/features.js';
import { PITCH } from '../../../shared/feature-pitch.js';
import { SAMPLE_NOTE, WALKTHROUGH, clearSeen, parseDone, pitchKeyFor, seenKey, seenPrefix, stageTarget, toggleDone, walkKey, welcomeSteps } from '../../../shared/feature-guide.js';

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

// 메뉴를 처음 열 때 한 번 — 그 메뉴 기능의 소개 한 장. 닫으면 이 사람·이 기관에선 다시 안 뜬다(localStorage).
export function MenuIntro({ menu, user, features, pitchKey }) {
  const key = seenKey(user.orgId, user.id, menu);
  const [shown, setShown] = useState(() => { try { return !localStorage.getItem(key); } catch { return false; } });
  const [more, setMore] = useState(false);
  const k = pitchKey && PITCH[pitchKey] ? pitchKey : pitchKeyFor(menu, features, PITCH);
  if (!shown || !k) return null;
  const p = PITCH[k];
  const close = () => { try { localStorage.setItem(key, '1'); } catch { /* 저장 못 해도 이번엔 닫힌다 */ } setShown(false); };
  return (
    <Paper withBorder p="sm" mb="sm" className="no-print" data-testid="menu-intro">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text fw={600} size="sm">{p.line}</Text>
        <Button variant="subtle" size="compact-xs" color="gray" onClick={close}>닫기</Button>
      </Group>
      <Text size="sm" mt={4}><b>이런 학교에</b> {p.forSchools}</Text>
      <Text size="sm" mt={4}><b>이렇게 풀립니다</b> {p.relief}</Text>
      <Button variant="subtle" size="compact-xs" mt={4} onClick={() => setMore((o) => !o)}>{more ? '접기' : '자세히'}</Button>
      <Collapse in={more}><Pitch k={k} /></Collapse>
    </Paper>
  );
}

// 따라 하기 — 단계마다 할 일과 「이 단계 켜고 해 보기」. 저장은 기능 고르기와 같은 {features: 바뀐 키만}.
function Walkthrough({ P, user, onChanged }) {
  const [features, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ask, confirmBox] = useConfirm();
  const dk = walkKey(user.orgId, user.id);
  const [done, setDone] = useState(() => { try { return parseDone(localStorage.getItem(dk)); } catch { return []; } });
  useEffect(() => { api('GET', configPath(P)).then((r) => setF(mergeConfig(r).features || {})).catch(() => setF({})); }, [P]);
  const check = (n) => { const next = toggleDone(done, n); setDone(next); try { localStorage.setItem(dk, JSON.stringify(next)); } catch { /* 가벼운 표시라 못 남겨도 된다 */ } };
  async function turnOn(n) {
    const diff = featureDiff(features, stageTarget(n));
    if (!Object.keys(diff).length) return;
    if (!(await ask(`${n}단계 기능을 켭니다. 다른 단계는 그대로 둡니다. 계속할까요?`))) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api('PUT', configPath(P), { features: diff });
      const next = mergeConfig(r.config || r).features || { ...features, ...diff };
      setF(next); onChanged?.(next); setMsg(`${n}단계 기능을 켰습니다. 왼쪽 메뉴에 새 메뉴가 생겼는지 보세요.`);
    } catch (e) { setMsg(`저장하지 못했습니다: ${e.message}`); } finally { setBusy(false); }
  }
  if (!features) return null;
  return (
    <Stack gap="xs" data-testid="walkthrough">
      {confirmBox}
      <Text fw={600}>따라 하기</Text>
      <Text size="sm" c="dimmed">1단계부터 하나씩 켜 보며 익힙니다. 건너뛰어도 되고, 끈 기능에 넣은 자료는 지워지지 않습니다.</Text>
      <Text size="sm" c="dimmed">{SAMPLE_NOTE}</Text>
      {msg && <Alert color="gray" withCloseButton onClose={() => setMsg(null)}>{msg}</Alert>}
      {WALKTHROUGH.map((w) => {
        const allOn = Object.keys(stageTarget(w.stage)).every((k) => featureOn(features, k));
        return (
          <Paper key={w.stage} withBorder p="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm" fw={600}>{w.title}</Text>
              <Checkbox size="xs" label="해 봤어요" checked={done.includes(w.stage)} onChange={() => check(w.stage)} />
            </Group>
            <List type="ordered" size="sm" mt={4}>{w.steps.map((t) => <List.Item key={t}>{t}</List.Item>)}</List>
            <Button size="compact-sm" mt={6} variant="light" disabled={busy || allOn} onClick={() => turnOn(w.stage)}>{allOn ? '이미 켜져 있음' : '이 단계 켜고 해 보기'}</Button>
          </Paper>
        );
      })}
    </Stack>
  );
}

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

export function HelpModal({ opened, onClose, admin, P, user, features, onChanged, onReset }) {
  const [reset, setReset] = useState(null);
  const again = () => {
    let n = 0;
    try { n = clearSeen(localStorage, seenPrefix(user.orgId, user.id)); localStorage.removeItem('tt-order-hint-dismissed'); } catch { /* 저장소를 못 쓰면 지울 것도 없다 */ }
    setReset(`첫 방문 안내를 다시 보이게 했습니다(메뉴 안내 ${n}곳 + 순서 안내).`); onReset?.();
  };
  return (
    <Modal opened={opened} onClose={onClose} title="도움말">
      <Stack>
        {admin ? (
          <>
            <Text size="sm">권장 순서입니다. 어느 것부터 눌러도 됩니다.</Text>
            <List type="ordered" size="sm">{welcomeSteps(features).map((s) => <List.Item key={s}>{s}</List.Item>)}</List>
            <Text size="sm">시간표 칸을 누르면 교과·교사·특별실을 넣고 뺄 수 있습니다. 같은 교사가 같은 시각에 두 반에 있거나 특별실이 겹치면 빨강으로 보이지만 저장은 됩니다. 「되돌리기」로 한 칸씩 돌립니다.</Text>
          </>
        ) : (
          <Text size="sm">「내 시간표」에서 내 수업만 모아 봅니다. 폰에서는 옆으로 밀어 보세요. 「인쇄」 버튼으로 종이에 뽑을 수 있습니다.</Text>
        )}
        {admin && <><Divider /><Walkthrough P={P} user={user} onChanged={onChanged} /></>}
        <Divider />
        <Group gap="xs"><Button variant="default" size="compact-sm" onClick={again}>안내 다시 보기</Button>{reset && <Text size="sm" c="dimmed">{reset}</Text>}</Group>
        <Divider />
        <Glossary />
      </Stack>
    </Modal>
  );
}

// 처음 로그인 환영 — 닫으면 서버에 기억한다
export function Welcome({ P, admin, features }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { api('GET', `${P}/me/guide`).then((r) => setOpen(!r.done)).catch(() => {}); }, [P]);
  const close = () => { setOpen(false); api('PUT', `${P}/me/guide`, { done: true }).catch(() => {}); };
  return (
    <Modal opened={open} onClose={close} title="환영합니다" centered>
      <Stack>
        {admin ? (
          <>
            <Text size="sm">시간표를 처음 만드는 순서입니다. 어느 것부터 눌러도 됩니다.</Text>
            <List type="ordered" size="sm">{welcomeSteps(features).map((s) => <List.Item key={s}>{s}</List.Item>)}</List>
          </>
        ) : <Text size="sm">「내 시간표」 메뉴에서 내 수업을 폰으로 볼 수 있습니다.</Text>}
        <Group justify="flex-end"><Button onClick={close}>시작하기</Button></Group>
      </Stack>
    </Modal>
  );
}
