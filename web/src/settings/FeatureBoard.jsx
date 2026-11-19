import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Collapse, Group, Stack, Switch, Text, Title } from '@mantine/core';
import { api } from '../api.js';
import Term from '../Term.jsx';
import { configPath, mergeConfig } from '../orgConfig.js';
import { featureOn, featureDiff, featuresUpTo, featureStages, tryMenu } from '../../../shared/features.js';
import { PITCH, PITCH_NOTE } from '../../../shared/feature-pitch.js';

const Row = ({ label, children }) => children ? <div><Text size="sm" fw={600}>{label}</Text><Text size="sm">{children}</Text></div> : null;

// 소개 글 한 장 — 스위치가 있으면 admin 만 보인다(교직원은 읽기만)
export function Pitch({ k, extra }) {
  const p = PITCH[k];
  if (!p) return null;
  return (
    <Stack gap="xs" mt="xs">
      <Row label="개념">{p.concept}</Row>
      {p.terms?.length > 0 && <Text size="sm" c="dimmed">낱말: {p.terms.map((t, i) => <span key={t}>{i > 0 && ', '}<Term k={t} /></span>)}</Text>}
      <Row label="이런 학교에">{p.forSchools}</Row>
      <Row label="손으로 하면">{p.pain}</Row>
      <Row label="이렇게 풀립니다">{p.relief}</Row>
      <Row label="장면">{p.scene}</Row>
      <Text size="xs" c="dimmed">{PITCH_NOTE}</Text>
      <Row label="안 써도 되는 학교">{p.skipIf}</Row>
      {extra}
    </Stack>
  );
}

function Card1({ f, on, admin, busy, onToggle, onTry }) {
  const [open, setOpen] = useState(false);
  const p = PITCH[f.key];
  return (
    <Card withBorder padding="sm" data-testid={`feat-${f.key}`}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Group gap="xs"><Text fw={600}>{f.name}</Text>{!admin && <Badge variant="light" color={on ? 'teal' : 'gray'} size="sm">{on ? '쓰는 중' : '꺼 둠'}</Badge>}</Group>
          <Text size="sm" c="dimmed">{p?.line || f.why}</Text>
        </div>
        {admin && <Switch checked={on} disabled={busy} onChange={(e) => onToggle(f.key, e.currentTarget.checked)} aria-label={`${f.name} 켬/끔`} />}
      </Group>
      <Button variant="subtle" size="compact-xs" mt={4} onClick={() => setOpen((o) => !o)}>{open ? '접기' : '자세히'}</Button>
      <Collapse in={open}>
        <Pitch k={f.key} extra={admin && p?.tryIt && <Group gap="xs" align="center"><Text size="sm" style={{ flex: 1 }}><b>써 보기</b> {p.tryIt}</Text><Button size="compact-sm" onClick={() => onTry(f.key)}>{on ? '해 보러 가기' : '켜고 해 보기'}</Button></Group>} />
      </Collapse>
    </Card>
  );
}

// 기능 고르기 — 관리자는 스위치, 교직원은 읽기만. 저장은 이 화면 혼자 {features: {바뀐 키만}}.
export default function FeatureBoard({ P, admin, onChanged, onTry }) {
  const [features, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api('GET', configPath(P)).then((r) => setF(mergeConfig(r).features || {})).catch(() => { setF({}); setMsg('설정을 못 불러와 모두 켜진 것으로 보여 드립니다.'); }); }, [P]);
  if (!features) return null;

  async function apply(diff, text) {
    if (!Object.keys(diff).length) { setMsg('바뀔 것이 없습니다.'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api('PUT', configPath(P), { features: diff });
      const next = mergeConfig(r.config || r).features || { ...features, ...diff };
      setF(next); onChanged?.(next); setMsg(text);
    } catch (e) { setMsg(`저장하지 못했습니다: ${e.message}`); } finally { setBusy(false); }
  }
  const toggle = (k, v) => apply({ [k]: v }, null);
  const stage = (n) => {
    if (!window.confirm(`${n === 0 ? '모든 기능을 끕니다' : `${n}단계까지 켜고 나머지는 끕니다`}. 끈 기능에 넣어 둔 자료는 지워지지 않고, 다시 켜면 그대로 나옵니다. 계속할까요?`)) return;
    apply(featureDiff(features, featuresUpTo(n)), n === 0 ? '0단계로 했습니다(격자·내 정보·도움말만).' : `${n}단계까지 켰습니다.`);
  };
  const tryOne = async (k) => {
    if (!featureOn(features, k)) await apply({ [k]: true }, null);
    onTry?.(tryMenu(k), PITCH[k]?.tryIt);
  };

  return (
    <Stack maw={760}>
      <Title order={4}>기능 고르기</Title>
      <Text size="sm" c="dimmed">{admin ? '필요한 기능만 켜서 쓰세요. 끈 기능의 메뉴만 숨고, 넣어 둔 자료는 그대로 남습니다. 모르는 기능은 「자세히」를 눌러 보세요.' : '우리 학교 시간표 도구에 이런 기능들이 있습니다. 켜고 끄는 것은 기관 관리자가 합니다.'}</Text>
      {msg && <Alert color="gray" withCloseButton onClose={() => setMsg(null)}>{msg}</Alert>}
      <Card withBorder padding="sm" data-testid="feat-intro">
        <Text fw={600}>시간표 격자(늘 켜짐)</Text><Text size="sm" c="dimmed">{PITCH.intro.line}</Text>
        <IntroMore />
      </Card>
      {admin && (
        <Group gap="xs" className="no-print">
          <Button variant="default" size="compact-sm" disabled={busy} onClick={() => stage(0)}>0단계로(다 끔)</Button>
          {[1, 2, 3, 4, 5, 6].map((n) => <Button key={n} variant="default" size="compact-sm" disabled={busy} onClick={() => stage(n)}>{n}단계까지 켜기</Button>)}
        </Group>
      )}
      {featureStages().map(({ stage: s, items }) => (
        <Stack key={s} gap="xs">
          <Text fw={700} mt="xs">{s}단계</Text>
          {items.map((f) => <Card1 key={f.key} f={f} on={featureOn(features, f.key)} admin={admin} busy={busy} onToggle={toggle} onTry={tryOne} />)}
        </Stack>
      ))}
    </Stack>
  );
}

function IntroMore() {
  const [open, setOpen] = useState(false);
  return <><Button variant="subtle" size="compact-xs" mt={4} onClick={() => setOpen((o) => !o)}>{open ? '접기' : '자세히'}</Button><Collapse in={open}><Pitch k="intro" /></Collapse></>;
}
