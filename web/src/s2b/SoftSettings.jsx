import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Group, MultiSelect, NumberInput, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { api } from '../api.js';
import { BANDS, SOFT_RULES, resolveWeights } from '../gen/soft.js';
import { diffFromDefault } from './diff.js';
import { OPTION_SPEC, PARAM_SPEC, avoidKey, avoidParse, extraFrom, extraToWeights } from './extra.js';

// 자동 생성 설정(기관 관리자) — 권장 규칙 묶음 가중 · 규칙별 묶음 · 교사 티어 배수 · 사람 티어 · 소규모교.
// 기본값은 soft.js 상수다. 여기서 바꾼 것만 서버(org.soft_weights)에 저장한다.
import { useOrgConfig } from '../orgConfig.js';
import Term from '../Term.jsx';
import { featureOn } from '../features.js';
const avoidCells = (DAY) => DAY.flatMap((_d, wi) => Array.from({ length: 8 }, (_p, pi) => `${wi + 1}-${pi + 1}`));
const avoidLabelOf = (DAY) => (v) => { const a = avoidParse(v); return `${DAY[a.weekday - 1] ?? a.weekday}${a.period}교시`; };
const TIER_LABEL = { 1: '1 보직', 2: '2 일반 전담', 3: '3 지원인력' };

export default function SoftSettings({ P }) {
  const { weekdays: DAY, features } = useOrgConfig(P);
  const softOn = featureOn(features, 'soft'), smallOn = featureOn(features, 'small'); // 꺼진 구획은 숨기기만(자료·저장값 그대로)
  const AVOID_CELLS = avoidCells(DAY);
  const avoidLabel = avoidLabelOf(DAY);
  const [w, setW] = useState(null);
  const [tiers, setTiers] = useState({});
  const [people, setPeople] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [small, setSmall] = useState(null);
  const [extra, setExtra] = useState({ params: {}, options: {}, avoid: {} });
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const [sw, pe, su, cl, sm] = await Promise.all([api('GET', `${P}/soft-weights`), api('GET', `${P}/specialists`), api('GET', `${P}/subjects`), api('GET', `${P}/classrooms`), api('GET', `${P}/small-school`)]);
      setW(resolveWeights(sw.weights));
      setExtra(extraFrom(sw.weights));
      setTiers(Object.fromEntries(sw.tiers.map((t) => [t.membership_id, t.tier])));
      setPeople(pe); setSubjects(su); setClasses(cl); setSmall(sm);
    } catch (e) { setMsg({ color: 'red', text: e.message }); }
  }, [P]);
  useEffect(() => { load(); }, [load]);
  const run = (fn, ok) => async () => { setMsg(null); try { await fn(); setMsg({ color: 'green', text: ok }); } catch (e) { setMsg({ color: 'red', text: e.message }); } };
  if (!w || !small) return msg ? <Alert color="red">{msg.text}</Alert> : null;

  const setParam = (k, v) => setExtra({ ...extra, params: { ...extra.params, [k]: v } });
  const saveW = run(async () => { await api('PUT', `${P}/soft-weights`, { weights: { ...diffFromDefault(w), ...extraToWeights(extra) } }); }, '가중을 저장했습니다. 다음 자동 생성부터 적용됩니다.');
  const resetW = run(async () => { await api('PUT', `${P}/soft-weights`, { weights: extraToWeights(extra) }); setW(resolveWeights({})); }, '가중을 기본값으로 되돌렸습니다.');
  const setTier = (mid) => async (v) => {
    const tier = v ? Number(v) : null;
    try { await api('PUT', `${P}/soft-weights/tier`, { membership_id: mid, tier }); setTiers({ ...tiers, [mid]: tier }); } catch (e) { setMsg({ color: 'red', text: e.message }); }
  };
  const saveSmall = run(async () => { setSmall(await api('PUT', `${P}/small-school`, { ...small, combined: combined.filter((c) => c.classroom_ids.length >= 2) })); }, '소규모교 설정을 저장했습니다.');
  const subjOpt = subjects.map((s) => ({ value: String(s.id), label: s.name }));
  const classOpt = classes.map((c) => ({ value: String(c.id), label: `${c.grade}-${c.class_no}` }));
  const combined = small.combined || [];
  const setComb = (i, patch) => setSmall({ ...small, combined: combined.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <Stack>
      {msg && <Alert color={msg.color} withCloseButton onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {softOn && <>
      <Card withBorder>
        <Title order={4}><Term k="권장 규칙">권장 규칙</Term> 가중</Title>
        <Text size="sm" c="dimmed" mb="xs">자동 생성은 필수를 먼저 맞추고, 그다음 아래 우선순위를 더 잘 지킨 시안을 위로 올립니다. 규칙마다 우선순위 묶음만 고르면 됩니다.</Text>
        <Table mt="md"><Table.Tbody>
          {Object.entries(SOFT_RULES).map(([code, m]) => (
            <Table.Tr key={code}>
              <Table.Td>{m.label}{m.optional ? ' (선택)' : ''}</Table.Td>
              <Table.Td><Select data={BANDS} value={w.ruleBand[code] || m.band} onChange={(v) => setW({ ...w, ruleBand: { ...w.ruleBand, [code]: v } })} w={130} allowDeselect={false} /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody></Table>
        <Group mt="sm"><Button onClick={saveW}>가중 저장</Button><Button variant="default" onClick={resetW}>기본값으로</Button></Group>
      </Card>

      <Card withBorder>
        <Title order={4}>권장 규칙 세부값</Title>
        <Text size="sm" c="dimmed" mb="xs">비워 두면 기본값을 씁니다. 저장하면 다음 자동 생성부터 적용됩니다.</Text>
        <Group align="start">
          {Object.entries(PARAM_SPEC).map(([k, m]) => (
            <NumberInput key={k} label={m.label} description={m.hint} placeholder={`기본 ${m.def}`} min={m.min} max={m.max} allowDecimal={false} value={extra.params[k] ?? ''} onChange={(v) => setParam(k, typeof v === 'number' ? v : undefined)} w={200} />
          ))}
        </Group>
        <Select mt="sm" label="교사 요일 배치" description="분산은 하루 수업을 고르게, 몰기는 며칠에 몰아서 배치" clearable placeholder="기본 분산" data={['분산', '몰기']} value={extra.params.teacherDayMode ?? null} onChange={(v) => setParam('teacherDayMode', v || undefined)} w={200} />
        <MultiSelect mt="sm" label="차시 순환 교과" description="비우면 시수표에서 「진도 맞춤」을 켠 교과를 씁니다" data={subjOpt} value={(extra.params.roundSubjects || []).map(String)} onChange={(v) => setParam('roundSubjects', v.map(Number))} />
        {Object.entries(OPTION_SPEC).map(([k, m]) => (
          <Switch key={k} mt="sm" label={m.label} description={m.hint} checked={extra.options[k] === true} onChange={(e) => setExtra({ ...extra, options: { ...extra.options, [k]: e.currentTarget.checked } })} />
        ))}
        <Text size="sm" mt="md" fw={600}>교사 회피 칸</Text>
        <Text size="xs" c="dimmed" mb="xs">그 교사를 넣지 않았으면 하는 요일·교시입니다. 못 피하면 감점만 하고 넣을 수는 있습니다.</Text>
        {people.map((p) => {
          const cur = extra.avoid[p.membership_id] || [];
          const opts = [...new Set([...AVOID_CELLS, ...cur.map(avoidKey)])].map((v) => ({ value: v, label: avoidLabel(v) }));
          return <MultiSelect key={p.membership_id} mt="xs" label={p.name} placeholder="없음" data={opts} value={cur.map(avoidKey)} onChange={(v) => setExtra({ ...extra, avoid: { ...extra.avoid, [p.membership_id]: v.map(avoidParse) } })} searchable />;
        })}
        <Group mt="sm"><Button onClick={saveW}>세부값 저장</Button></Group>
      </Card>

      <Card withBorder>
        <Title order={4}><Term k="교사 티어">교사 티어</Term></Title>
        <Text size="sm" c="dimmed" mb="xs">티어가 높을수록(1 보직) 회피 선호를 더 세게 들어줍니다. 비우면 2 로 칩니다.</Text>
        <Table><Table.Tbody>
          {people.map((p) => (
            <Table.Tr key={p.membership_id}>
              <Table.Td>{p.name}</Table.Td>
              <Table.Td><Select clearable placeholder="미정" data={[1, 2, 3].map((t) => ({ value: String(t), label: TIER_LABEL[t] }))} value={tiers[p.membership_id] ? String(tiers[p.membership_id]) : null} onChange={setTier(p.membership_id)} w={160} /></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody></Table>
      </Card>
      </>}

      {smallOn && <Card withBorder>
        <Title order={4}>소규모교</Title>
        <Switch label="소규모교 설정 사용" checked={small.enabled} onChange={(e) => setSmall({ ...small, enabled: e.currentTarget.checked })} mb="xs" />
        <MultiSelect label="담임이 메우는 교과" data={subjOpt} value={(small.homeroom_subject_ids || []).map(String)} onChange={(v) => setSmall({ ...small, homeroom_subject_ids: v.map(Number) })} />
        <Switch label="담임 교과 빈 칸을 담임으로 채움" description="위 「담임이 메우는 교과」 줄에 교사가 비어 있으면 그 반 담임을 넣습니다. 끄면 빈 채로 둡니다." checked={small.homeroom_fill !== false} onChange={(e) => setSmall({ ...small, homeroom_fill: e.currentTarget.checked })} mt="sm" />
        <Switch label="복식 묶기" description="아래 묶음 반들의 같은 교과·같은 교사 수업을 한 시간에 같이 놓습니다(한 수업으로 셉니다). 끄면 반마다 따로 놓습니다." checked={small.combined_mode !== 'separate'} onChange={(e) => setSmall({ ...small, combined_mode: e.currentTarget.checked ? 'same_slot' : 'separate' })} mt="xs" />
        <Text size="sm" mt="sm">복식(합친) 학급 묶음</Text>
        {combined.map((c, i) => (
          <Group key={i} align="end" mt="xs">
            <TextInput label="이름" value={c.name} onChange={(e) => setComb(i, { name: e.currentTarget.value })} w={140} />
            <MultiSelect label="묶을 반(2~6)" data={classOpt} value={c.classroom_ids.map(String)} onChange={(v) => setComb(i, { classroom_ids: v.map(Number) })} w={280} />
            <Button variant="subtle" color="red" onClick={() => setSmall({ ...small, combined: combined.filter((_, j) => j !== i) })}>빼기</Button>
          </Group>
        ))}
        <Group mt="sm">
          <Button variant="default" onClick={() => setSmall({ ...small, combined: [...combined, { name: `묶음 ${combined.length + 1}`, classroom_ids: [] }] })}>묶음 추가</Button>
          <Button onClick={saveSmall}>소규모교 저장</Button>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">반을 2개 이상 고른 묶음만 저장됩니다.</Text>
      </Card>}
    </Stack>
  );
}
