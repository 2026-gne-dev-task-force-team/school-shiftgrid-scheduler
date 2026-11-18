import { useEffect, useState } from 'react';
import { Alert, Badge, Button, ColorInput, Group, NumberInput, Select, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';

// S-4b 출력 — 내려받기(PDF·엑셀·HWPX) · 급식 벽시계 · 반 비교 · 담임 과목 올리기
export default function Output({ P, admin }) {
  return (
    <Tabs defaultValue="down" keepMounted={false} variant="pills">
      <Tabs.List mb="md">
        <Tabs.Tab value="down">내려받기</Tabs.Tab>
        <Tabs.Tab value="lunch">급식 벽시계</Tabs.Tab>
        <Tabs.Tab value="cmp">반 비교</Tabs.Tab>
        {admin && <Tabs.Tab value="homeroom">담임 과목 올리기</Tabs.Tab>}
      </Tabs.List>
      <Tabs.Panel value="down"><Download P={P} admin={admin} /></Tabs.Panel>
      <Tabs.Panel value="lunch"><LunchClock P={P} /></Tabs.Panel>
      <Tabs.Panel value="cmp"><Compare P={P} /></Tabs.Panel>
      {admin && <Tabs.Panel value="homeroom"><HomeroomUpload P={P} /></Tabs.Panel>}
    </Tabs>
  );
}

// 시간표 고르기 — 확정본이 먼저, 시안도 된다
function useTargets(P) {
  const [list, setList] = useState(null);
  const [tid, setTid] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('GET', `${P}/export/targets`).then((r) => { setList(r); setTid(r[0]?.id ?? null); }).catch((e) => setError(e.message)); }, [P]);
  const picker = list && (
    <Select label="시간표 (확정본이 먼저)" w={300} allowDeselect={false} value={tid ? String(tid) : null} onChange={setTid}
      data={list.map((t) => ({ value: String(t.id), label: `${t.name} · ${t.status}${t.starts_on ? ` · ${String(t.starts_on).slice(0, 10)}부터` : ''}` }))} />
  );
  return { list, tid, picker, error };
}

async function download(path, fallback) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '내려받지 못했습니다');
  const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') || '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = m ? decodeURIComponent(m[1]) : fallback;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Download({ P, admin }) {
  const { list, tid, picker, error } = useTargets(P);
  const [view, setView] = useState('class');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const go = async (fmt) => {
    setErr(''); setBusy(fmt);
    try { await download(`${P}/timetables/${tid}/export.${fmt}?view=${view}`, `timetable.${fmt}`); } catch (e) { setErr(e.message); }
    setBusy('');
  };
  if (error) return <Alert color="red">{error}</Alert>;
  if (!list) return null;
  if (!list.length) return <Text c="dimmed">아직 시간표가 없습니다.</Text>;
  return (
    <Stack>
      {err && <Alert color="red">{err}</Alert>}
      <Group align="end">
        {picker}
        <Select label="묶음" w={160} allowDeselect={false} value={view} onChange={setView} data={[{ value: 'class', label: '반별' }, { value: 'teacher', label: '교사별' }]} />
      </Group>
      <Group>
        {['pdf', 'xlsx', 'hwpx'].map((f) => <Button key={f} loading={busy === f} disabled={!tid} onClick={() => go(f)}>{f === 'pdf' ? 'PDF' : f === 'xlsx' ? '엑셀' : '한글(HWPX)'}</Button>)}
      </Group>
      <Text size="sm" c="dimmed">창체는 파랑 · 전담은 빨강 · 과학실 칸은 회색(HWPX 는 음영 대신 굵은 밑줄). 색은 아래에서 바꿀 수 있습니다.</Text>
      {admin && <Settings P={P} />}
    </Stack>
  );
}

function Settings({ P }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('GET', `${P}/export/settings`).then(setS).catch(() => {}); }, [P]);
  if (!s) return null;
  const set = (k, v) => setS({ ...s, [k]: v });
  const words = (k) => <TextInput label={k === 'changcheNames' ? '창체로 볼 교과 이름(쉼표)' : '음영 칠할 특별실 낱말(쉼표)'} value={s[k].join(', ')} onChange={(e) => set(k, e.currentTarget.value.split(',').map((x) => x.trim()).filter(Boolean))} />;
  return (
    <Stack gap="xs" mt="md">
      <Text fw={600}>출력 설정</Text>
      <Group align="end">
        <ColorInput label="창체" w={130} value={s.changcheColor} onChange={(v) => set('changcheColor', v)} />
        <ColorInput label="전담" w={130} value={s.specialistColor} onChange={(v) => set('specialistColor', v)} />
        <ColorInput label="음영" w={130} value={s.shadeColor} onChange={(v) => set('shadeColor', v)} />
        <NumberInput label="급식 한 교대(분)" w={130} min={10} max={120} value={s.lunchMinutes} onChange={(v) => set('lunchMinutes', Number(v) || 40)} />
      </Group>
      <Group align="end">{words('changcheNames')}{words('shadeRoomKeywords')}</Group>
      <Group>
        <Button variant="default" onClick={async () => { try { setS(await api('PUT', `${P}/export/settings`, s)); setMsg('저장했습니다'); } catch (e) { setMsg(e.message); } }}>설정 저장</Button>
        {msg && <Text size="sm">{msg}</Text>}
      </Group>
    </Stack>
  );
}

const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// 급식 3교대 벽시계 — 시계 눈금 위에 학년 막대. 같은 시각이면 같은 칸으로 보인다.
function LunchClock({ P }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('GET', `${P}/lunch-clock`).then(setD).catch((e) => setError(e.message)); }, [P]);
  if (error) return <Alert color="red">{error}</Alert>;
  if (!d) return null;
  if (!d.shifts.length) return <Text c="dimmed">학교 기본에서 학년별 점심 시각을 넣으면 여기에 시계표가 나옵니다.</Text>;
  const from = Math.floor(Math.min(...d.shifts.map((x) => toMin(x.start))) / 30) * 30 - 30;
  const to = Math.ceil(Math.max(...d.shifts.map((x) => toMin(x.end))) / 30) * 30 + 30;
  const ticks = []; for (let t = from; t <= to; t += 30) ticks.push(t);
  const pct = (m) => `${((m - from) / (to - from)) * 100}%`;
  const label = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const colors = ['blue', 'teal', 'orange', 'grape', 'pink', 'gray'];
  return (
    <Stack>
      {d.notes.map((n) => <Alert key={n} color="yellow">{n}</Alert>)}
      <div style={{ position: 'relative', height: 40 + d.shifts.length * 34, borderLeft: '1px solid #bbb' }}>
        {ticks.map((t) => (
          <div key={t} style={{ position: 'absolute', left: pct(t), top: 0, bottom: 0, borderLeft: '1px dashed #ddd' }}>
            <Text size="xs" c="dimmed" style={{ transform: 'translateX(-50%)' }}>{label(t)}</Text>
          </div>
        ))}
        {d.shifts.map((s, i) => (
          <div key={s.shift} style={{ position: 'absolute', top: 28 + i * 34, left: pct(toMin(s.start)), width: `calc(${pct(toMin(s.end))} - ${pct(toMin(s.start))})`, height: 28, borderRadius: 6, background: `var(--mantine-color-${colors[i % colors.length]}-light)`, border: `1px solid var(--mantine-color-${colors[i % colors.length]}-4)`, padding: '3px 8px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <Text size="sm" fw={600}>{s.shift}교대 · {s.grades.join('·')}학년</Text>
          </div>
        ))}
      </div>
      <Table withTableBorder>
        <Table.Thead><Table.Tr><Table.Th>교대</Table.Th><Table.Th>시각</Table.Th><Table.Th>학년</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{d.shifts.map((s) => <Table.Tr key={s.shift}><Table.Td>{s.shift}</Table.Td><Table.Td>{s.start} ~ {s.end}</Table.Td><Table.Td>{s.grades.join(', ')}학년</Table.Td></Table.Tr>)}</Table.Tbody>
      </Table>
      {d.noLunch.length > 0 && <Text size="sm" c="dimmed">점심 시각이 없는 학년: {d.noLunch.join(', ')}학년</Text>}
    </Stack>
  );
}

const COL = { changche: 'var(--mantine-color-blue-7)', specialist: 'var(--mantine-color-red-7)' };

function Compare({ P }) {
  const { list, tid, picker, error } = useTargets(P);
  const [classes, setClasses] = useState([]);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!tid) return;
    api('GET', `${P}/timetables/${tid}`).then((r) => { setClasses(r.classrooms); setA(String(r.classrooms[0]?.id ?? '')); setB(String(r.classrooms[1]?.id ?? r.classrooms[0]?.id ?? '')); }).catch((e) => setErr(e.message));
  }, [P, tid]);
  useEffect(() => {
    if (!tid || !a || !b) return;
    setErr('');
    api('GET', `${P}/timetables/${tid}/compare?a=${a}&b=${b}`).then(setD).catch((e) => setErr(e.message));
  }, [P, tid, a, b]);
  if (error) return <Alert color="red">{error}</Alert>;
  if (!list) return null;
  const opts = classes.map((c) => ({ value: String(c.id), label: `${c.grade}학년 ${c.class_no}반` }));
  return (
    <Stack>
      {err && <Alert color="red">{err}</Alert>}
      <Group align="end">{picker}<Select label="왼쪽 반" w={140} data={opts} value={a} onChange={setA} allowDeselect={false} /><Select label="오른쪽 반" w={140} data={opts} value={b} onChange={setB} allowDeselect={false} /></Group>
      {d && (
        <Group align="flex-start" grow wrap="wrap">
          {d.sheets.map((sh, i) => (
            <div key={i} style={{ minWidth: 300 }}>
              <Text fw={600} mb={4}>{sh.title}</Text>
              <Table withTableBorder withColumnBorders>
                <Table.Thead><Table.Tr>{sh.header.map((h, k) => <Table.Th key={k} ta="center">{h.text}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                  {sh.rows.map((row, r) => (
                    <Table.Tr key={r}>
                      {row.map((c, k) => (
                        <Table.Td key={k} ta="center" style={{ color: COL[c.kind], background: c.shade ? d.settings.shadeColor : undefined, whiteSpace: 'pre-line', fontSize: 12 }}>{c.text}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          ))}
        </Group>
      )}
    </Stack>
  );
}

// 담임 과목 취합본 올리기 — 읽은 줄은 초록, 못 읽은 줄은 빨강(거부 아님). 읽은 줄만 시수표에 넣는다.
function HomeroomUpload({ P }) {
  const [pv, setPv] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  async function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(''); setMsg(''); setPv(null);
    try { setPv(await api('POST', `${P}/homeroom-subjects/preview`, f)); } catch (x) { setErr(x.message); }
  }
  async function apply() {
    try {
      const r = await api('POST', `${P}/homeroom-subjects/apply`, { rows: pv.rows.filter((x) => x.ok).map((x) => ({ classroom_id: x.classroom_id, subject_id: x.subject_id, hours: x.hours })) });
      setMsg(`${r.applied}줄을 시수표에 넣었습니다${r.skipped ? ` (${r.skipped}줄 건너뜀)` : ''}`); setPv(null);
    } catch (x) { setErr(x.message); }
  }
  return (
    <Stack>
      <Text size="sm">엑셀(.xlsx)이나 한글(.hwpx) 표를 올리면 학년·반·교과·시수를 읽어 미리 보여 줍니다. 아직 아무것도 저장하지 않습니다.</Text>
      <Group>
        <Button component="label" variant="default">파일 고르기<input type="file" hidden accept=".xlsx,.hwpx" onChange={pick} /></Button>
        <Button variant="subtle" onClick={() => download(`${P}/homeroom-subjects/template`, 'homeroom-template.xlsx').catch((e) => setErr(e.message))}>엑셀 양식 받기</Button>
      </Group>
      {err && <Alert color="red">{err}</Alert>}
      {msg && <Alert color="green">{msg}</Alert>}
      {pv && (
        <>
          <Group><Badge color="green">읽음 {pv.ok}</Badge><Badge color="red">못 읽음 {pv.unread}</Badge></Group>
          <Table withTableBorder>
            <Table.Thead><Table.Tr><Table.Th>줄</Table.Th><Table.Th>학년</Table.Th><Table.Th>반</Table.Th><Table.Th>교과</Table.Th><Table.Th>시수</Table.Th><Table.Th>비고</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {pv.rows.map((x) => (
                <Table.Tr key={x.line} style={x.ok ? undefined : { color: 'var(--mantine-color-red-7)', background: 'var(--mantine-color-red-0)' }}>
                  <Table.Td>{x.line}</Table.Td><Table.Td>{x.grade ?? '?'}</Table.Td><Table.Td>{x.class_no ?? '?'}</Table.Td><Table.Td>{x.subject || '?'}</Table.Td><Table.Td>{x.hours ?? '?'}</Table.Td><Table.Td>{x.reason}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group><Button disabled={!pv.ok} onClick={apply}>읽은 {pv.ok}줄을 시수표에 넣기</Button>{pv.unread > 0 && <Text size="sm" c="red">빨강 줄은 넣지 않습니다. 고쳐서 다시 올려 주세요.</Text>}</Group>
        </>
      )}
    </Stack>
  );
}
