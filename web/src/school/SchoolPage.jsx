import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Select, Stack, Switch, Table, Tabs, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';
import { buildTimes, rowsOf } from './periodTimes.js';

// 학교 기본 · 전담·비교과 · 시수표 · 고정·금지 · 규칙 수위 (S-1b). 거부 없이 저장하고 알림만 띄운다.
import { useOrgConfig } from '../orgConfig.js';
import Term from '../Term.jsx';
import { SCHOOL_TAB_FEATURE, visibleTabs } from '../features.js';

function useLoad(path) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const reload = () => api('GET', path).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, [path]); // eslint-disable-line
  return [data, reload, err];
}
// 점심 칸 — blur 때나 잠깐(0.8초) 쉬면 저장한다. 형식은 HH:MM
function LunchInput({ value, disabled, onSave, label }) {
  const [v, setV] = useState(value ?? '');
  const last = useRef(value ?? '');
  useEffect(() => {
    if (!/^\d\d:\d\d$/.test(v) || v === last.current) return undefined;
    const t = setTimeout(() => { last.current = v; onSave(v); }, 800);
    return () => clearTimeout(t);
  }, [v]); // eslint-disable-line
  const flush = () => { if (/^\d\d:\d\d$/.test(v) && v !== last.current) { last.current = v; onSave(v); } };
  return <TextInput aria-label={label} disabled={disabled} placeholder="점심 12:10" value={v} onChange={(e) => setV(e.currentTarget.value)} onBlur={flush} w={110} />;
}
// 교시 시각 표 — 두 칸이 다 09:00 꼴이면 0.8초 쉴 때나 blur 때 저장한다(점심 칸과 같은 꼴). 틀린 칸은 이유를 적는다.
function TimesTable({ n, times, disabled, onSave }) {
  const [rows, setRows] = useState(() => rowsOf(times, n));
  const last = useRef(JSON.stringify(buildTimes(rowsOf(times, n)).times ?? []));
  const res = buildTimes(rows);
  const sig = res.ok ? JSON.stringify(res.times) : null;
  const doSave = () => { if (sig && sig !== last.current) { last.current = sig; onSave(res.times); } };
  useEffect(() => {
    if (!sig || sig === last.current) return undefined;
    const t = setTimeout(doSave, 800);
    return () => clearTimeout(t);
  }, [sig]); // eslint-disable-line
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <Stack gap="xs">
      <Table><Table.Tbody>
        {rows.map((r, i) => (
          <Table.Tr key={i}>
            <Table.Td>{i + 1}교시</Table.Td>
            <Table.Td><TextInput aria-label={`${i + 1}교시 시작`} disabled={disabled} placeholder="시작 09:00" value={r.start} onChange={(e) => set(i, 'start', e.currentTarget.value)} onBlur={doSave} w={110} /></Table.Td>
            <Table.Td><TextInput aria-label={`${i + 1}교시 끝`} disabled={disabled} placeholder="끝 09:40" value={r.end} onChange={(e) => set(i, 'end', e.currentTarget.value)} onBlur={doSave} w={110} /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody></Table>
      {!res.ok && <Text size="sm" c="red">{res.msg}(저장하지 않았습니다)</Text>}
    </Stack>
  );
}
const Err = ({ e }) => (e ? <Alert color="red">{e}</Alert> : null);

// 교과 — 기본 14 는 프리셋일 뿐. 기관이 추가·이름·줄임말 고치기·숨김(되살리기)·프리셋 다시 불러오기(없는 것만)
function Subjects({ P, admin }) {
  const [rows, reload] = useLoad(`${P}/subjects?hidden=1`);
  const [nw, setNw] = useState({ name: '', short_name: '' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const run = (fn) => async () => { setError(''); setNote(''); try { await fn(); reload(); } catch (e) { setError(e.message); } };
  const shown = (rows || []).filter((s) => !s.hidden);
  const hidden = (rows || []).filter((s) => s.hidden);
  const patch = (s, body) => run(() => api('PATCH', `${P}/subjects/${s.id}`, body))();
  return (
    <Stack>
      <Err e={error} />
      <Text fw={600}>교과 ({shown.length})</Text>
      {!admin && <Text size="sm">{shown.map((s) => s.name).join(' · ')}</Text>}
      {admin && (
        <Table.ScrollContainer minWidth={0} type="native"><Table><Table.Tbody>
          {shown.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td><TextInput defaultValue={s.name} onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== s.name && patch(s, { name: e.currentTarget.value })} w={{ base: 140, sm: 190 }} /></Table.Td>
              <Table.Td><TextInput defaultValue={s.short_name ?? ''} placeholder="줄임말" onBlur={(e) => e.currentTarget.value !== (s.short_name ?? '') && patch(s, { short_name: e.currentTarget.value })} w={80} /></Table.Td>
              <Table.Td><Button size="xs" variant="default" onClick={() => patch(s, { hidden: true })}>숨김</Button></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody></Table></Table.ScrollContainer>
      )}
      {admin && (
        <Group>
          <TextInput placeholder="새 교과 이름" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.currentTarget.value })} />
          <TextInput placeholder="줄임말" value={nw.short_name} onChange={(e) => setNw({ ...nw, short_name: e.currentTarget.value })} w={80} />
          <Button onClick={run(async () => { await api('POST', `${P}/subjects`, { name: nw.name, short_name: nw.short_name || null }); setNw({ name: '', short_name: '' }); })}>교과 추가</Button>
          <Button variant="default" onClick={run(async () => {
            const r = await api('POST', `${P}/subjects/preset-reload`);
            setNote(r.added.length ? `더했습니다: ${r.added.join(' · ')}` : '더할 것이 없습니다(프리셋 교과가 모두 있거나 숨겨져 있습니다)');
          })}>프리셋 다시 불러오기(없는 것만 더함)</Button>
        </Group>
      )}
      {note && <Text size="sm" c="dimmed">{note}</Text>}
      {admin && hidden.length > 0 && (
        <>
          <Text size="sm" fw={600}>숨긴 교과</Text>
          {hidden.map((s) => (
            <Group key={s.id} gap="xs"><Text size="sm">{s.name}</Text><Button size="xs" variant="default" onClick={() => patch(s, { hidden: false })}>다시 보이기</Button></Group>
          ))}
        </>
      )}
    </Stack>
  );
}

// 새 학기 시작(되돌릴 수 없음 — 한 번 더 묻는다) · 보관 학기 보기(읽기 전용)
function Semester({ P, admin, term, classes, onDone }) {
  const [terms] = useLoad(`${P}/terms`);
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState('');
  const start = async () => {
    setErr('');
    try {
      await api('POST', `${P}/terms/new-semester`, {});
    } catch (e) {
      if (e.status !== 409 || !e.body?.needConfirm) return setErr(e.message);
      if (!window.confirm(`${e.message}

계속할까요?`)) return;
      try { await api('POST', `${P}/terms/new-semester`, { confirm: true }); onDone(); } catch (e2) { setErr(e2.message); }
    }
  };
  const view = (v) => { setErr(''); setOv(null); if (v) api('GET', `${P}/terms/${v}/overview`).then(setOv).catch((e) => setErr(e.message)); };
  return (
    <Stack gap="xs">
      <Err e={err} />
      <Group>
        {admin && <Button color="red" variant="light" onClick={start}>새 학기 시작</Button>}
        {admin && !classes?.length && (terms || []).length > 1 && <Button variant="default" onClick={async () => { setErr(''); try { await api('POST', `${P}/terms/import-previous`, {}); onDone(); } catch (e) { setErr(e.message); } }}>지난 학기 반·과목 가져오기</Button>}
        <Select placeholder="보관 학기 보기" clearable w={200} onChange={view}
          data={(terms || []).filter((t) => t.id !== term?.id).map((t) => ({ value: String(t.id), label: `${t.year}년 ${t.semester}학기 (${t.status})` }))} />
      </Group>
      {ov && (
        <Alert color="gray" title={`${ov.term.year}년 ${ov.term.semester}학기 — 읽기 전용`}>
          <Text size="sm">반 {ov.classrooms.map((c) => `${c.grade}-${c.class_no}`).join(' · ') || '없음'} · 시수 줄 {ov.loadCount}개 · 시간표 {ov.timetables.map((t) => `${t.name}(${t.status})`).join(', ') || '없음'}</Text>
        </Alert>
      )}
    </Stack>
  );
}

function Basics({ P, admin }) {
  const org = useOrgConfig(P); // 기관 설정: 학기 시작 달·상한(넘으면 경고만 — 입력은 막지 않음)
  const [term, reloadTerm] = useLoad(`${P}/term`);
  const [classes, reloadC] = useLoad(`${P}/classrooms`);
  const [cfg, reloadCfg] = useLoad(`${P}/school/periods`);
  const [rooms, reloadR] = useLoad(`${P}/special-rooms`);
  const [grade, setGrade] = useState(1);
  const [count, setCount] = useState(3);
  const [room, setRoom] = useState({ name: '', purpose: '수업용' });
  const [error, setError] = useState('');
  const run = (fn) => async () => { setError(''); try { await fn(); } catch (e) { setError(e.message); } };
  const grades = cfg?.grades || {};
  const [saved, setSaved] = useState('');
  const setG = (g, patch) => { setSaved('저장 중…'); return api('PUT', `${P}/school/periods`, { ...(cfg?.times ? { times: cfg.times } : {}), grades: { ...grades, [g]: { periods: 5, ...grades[g], ...patch } } }).then(() => { setSaved('저장됨'); return reloadCfg(); }).catch((e) => { setSaved(''); throw e; }); };
  const saveTimes = (times) => { setSaved('저장 중…'); return api('PUT', `${P}/school/periods`, { grades, times }).then(() => { setSaved('저장됨'); return reloadCfg(); }).catch((e) => { setSaved(''); throw e; }); };
  const maxP = Math.max(1, ...Object.values(grades).map((x) => x?.periods || 0));
  return (
    <Stack>
      <Err e={error} />
      {term && <Text size="sm" c="dimmed">지금 {term.year}년 {term.semester}학기 · 학기 시작 달 {org.semesterStarts.join('·')}월(기관 설정)</Text>}
      <Semester P={P} admin={admin} term={term} classes={classes} onDone={() => { reloadTerm(); reloadC(); }} />
      <Text fw={600}>반</Text>
      <Text size="sm">{(classes || []).map((c) => `${c.grade}-${c.class_no}`).join(' · ') || '아직 없음'}</Text>
      {admin && (
        <Group>
          <NumberInput label="학년" description={`기관 기준 ${org.limits.grades}`} min={1} value={grade} onChange={setGrade} w={80} />
          <NumberInput label="반 수" description={`반 번호 ${org.limits.classNo}까지`} min={1} value={count} onChange={setCount} w={80} />
          <Button mt={24} onClick={run(async () => { await api('POST', `${P}/classrooms/bulk`, { grade, count }); reloadC(); })}>반 만들기</Button>
        </Group>
      )}
      <Group gap="xs"><Text fw={600}>학년별 교시 · 점심</Text>{saved && <Badge variant="light" color={saved === '저장됨' ? 'green' : 'gray'}>{saved}</Badge>}</Group>
      <Table><Table.Tbody>
        {[1, 2, 3, 4, 5, 6].map((g) => (
          <Table.Tr key={g}>
            <Table.Td>{g}학년</Table.Td>
            <Table.Td><NumberInput aria-label={`${g}학년 교시 수`} disabled={!admin} min={1} description={`기관 기준 ${org.limits.periods}`} value={grades[g]?.periods ?? ''} onChange={(v) => v && run(() => setG(g, { periods: v }))()} w={80} suffix="교시" /></Table.Td>
            <Table.Td><LunchInput key={`${g}:${grades[g]?.lunch ?? ''}`} label={`${g}학년 점심 시각`} disabled={!admin} value={grades[g]?.lunch ?? ''} onSave={(v) => run(() => setG(g, { lunch: v }))()} /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody></Table>
      <Text fw={600}>교시 시작·끝 시각</Text>
      <Text size="sm" c="dimmed">전 학년 공통입니다. 적어 두면 학년마다 점심 자리가 달라도 교사·특별실 겹침을 시각으로 셉니다. 비우면 교시 번호로 셉니다. 09:00 꼴로 적습니다.</Text>
      <TimesTable key={cfg ? 'ready' : 'wait'} n={maxP} times={cfg?.times} disabled={!admin} onSave={(t) => run(() => saveTimes(t))()} />
      <Text fw={600}>특별실</Text>
      {(rooms || []).map((r) => <Text key={r.id} size="sm">{r.name} <Badge variant="light">{r.purpose}</Badge> {r.capacity ? `정원 ${r.capacity}` : ''}</Text>)}
      {admin && (
        <Group>
          <TextInput placeholder="이름" value={room.name} onChange={(e) => setRoom({ ...room, name: e.currentTarget.value })} />
          <Select data={['수업용', '예약용']} value={room.purpose} onChange={(v) => setRoom({ ...room, purpose: v })} w={110} />
          <Button onClick={run(async () => { await api('POST', `${P}/special-rooms`, room); setRoom({ ...room, name: '' }); reloadR(); })}>추가</Button>
        </Group>
      )}
      <Subjects P={P} admin={admin} />
    </Stack>
  );
}

function Specialists({ P, admin }) {
  const cfg = useOrgConfig(P);
  const [rows, reload, err] = useLoad(`${P}/specialists`);
  return (
    <Stack>
      <Err e={err} />
      <Table><Table.Tbody>
        {(rows || []).map((r) => (
          <Table.Tr key={r.membership_id}>
            <Table.Td>{r.name}</Table.Td>
            <Table.Td>
              <Switch disabled={!admin} label="전담·비교과" checked={!!r.duty && r.duty !== '담임'}
                onChange={(e) => api('PATCH', `${P}/specialists/${r.membership_id}`, { duty: e.currentTarget.checked ? (cfg.duties.find((d) => d !== '담임') ?? '전담') : '담임' }).then(reload)} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody></Table>
    </Stack>
  );
}

function Loads({ P, admin }) {
  const org = useOrgConfig(P);
  const [d, reload, err] = useLoad(`${P}/loads`);
  const [people] = useLoad(`${P}/specialists`);
  const [subjects] = useLoad(`${P}/subjects`);
  const [classes] = useLoad(`${P}/classrooms`);
  const [row, setRow] = useState({});
  const opt = (a, f) => (a || []).map((x) => ({ value: String(f.v(x)), label: f.l(x) }));
  const add = () => api('POST', `${P}/loads`, { membership_id: row.m ? Number(row.m) : null, subject_id: row.s ? Number(row.s) : null, classroom_id: row.c ? Number(row.c) : null, weekly_hours: row.h || 0, sync_progress: !!row.p, block: row.b ? 2 : 1 }).then(() => { setRow({}); reload(); });
  const nm = (arr, k, id) => (arr || []).find((x) => String(x[k]) === String(id));
  return (
    <Stack>
      <Err e={err} />
      {(d?.alerts || []).map((a, i) => <Alert key={i} color={a.color}>{a.label}: {a.detail?.name}</Alert>)}
      <Table><Table.Tbody>
        {(d?.lines || []).map((l) => (
          <Table.Tr key={l.id} bg={l.incomplete ? 'yellow.0' : undefined}>
            <Table.Td>{nm(people, 'membership_id', l.membership_id)?.name ?? '(교사 비어 있음)'}</Table.Td>
            <Table.Td>{nm(subjects, 'id', l.subject_id)?.name ?? '(교과 비어 있음)'}</Table.Td>
            <Table.Td>{l.classroom_id ? (() => { const c = nm(classes, 'id', l.classroom_id); return c ? `${c.grade}-${c.class_no}` : ''; })() : '모든 반(반 지정 없음)'}</Table.Td>
            <Table.Td>{l.weekly_hours}시수{l.sync_progress ? ' · 진도 맞춤' : ''}{l.block === 2 ? ' · 2시수 연강' : ''}
              {admin && <Switch size="xs" mt={4} label="연강" checked={l.block === 2} onChange={(e) => api('PATCH', `${P}/loads/${l.id}`, { block: e.currentTarget.checked ? 2 : 1 }).then(reload)} />}</Table.Td>
            <Table.Td>{admin && <Button size="xs" variant="subtle" color="red" onClick={() => api('DELETE', `${P}/loads/${l.id}`).then(reload)}>지우기</Button>}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody></Table>
      {admin && (
        <Group align="end">
          <Select placeholder="교사" clearable data={opt(people, { v: (x) => x.membership_id, l: (x) => x.name })} value={row.m ?? null} onChange={(v) => setRow({ ...row, m: v })} w={130} />
          <Select placeholder="교과" clearable data={opt(subjects, { v: (x) => x.id, l: (x) => x.name })} value={row.s ?? null} onChange={(v) => setRow({ ...row, s: v })} w={130} />
          <Select placeholder="모든 반(비우면)" clearable data={opt(classes, { v: (x) => x.id, l: (x) => `${x.grade}-${x.class_no}` })} value={row.c ?? null} onChange={(v) => setRow({ ...row, c: v })} w={110} />
          <NumberInput placeholder="시수" description={`기관 기준 주 ${org.limits.loadPerWeek}`} min={0} value={row.h ?? ''} onChange={(v) => setRow({ ...row, h: v })} w={80} />
          <Switch label="진도 맞춤" checked={!!row.p} onChange={(e) => setRow({ ...row, p: e.currentTarget.checked })} />
          <Switch label="2시수 연강" checked={!!row.b} onChange={(e) => setRow({ ...row, b: e.currentTarget.checked })} />
          <Button onClick={add}>줄 추가</Button>
        </Group>
      )}
      <Text size="xs" c="dimmed">비어 있는 칸이 있어도 저장됩니다. 노랑 줄은 아직 덜 채운 줄입니다.</Text>
    </Stack>
  );
}

function Pins({ P, admin, kind }) {
  const org = useOrgConfig(P);
  const DAYS = org.weekdays;
  const [pins, reload, err] = useLoad(`${P}/pins?target_kind=${encodeURIComponent(kind)}`);
  const [people] = useLoad(`${P}/specialists`);
  const [classes] = useLoad(`${P}/classrooms`);
  const [rooms] = useLoad(`${P}/special-rooms`);
  const targets = kind === '교사' ? (people || []).map((x) => ({ value: String(x.membership_id), label: x.name }))
    : kind === '반' ? (classes || []).map((x) => ({ value: String(x.id), label: `${x.grade}-${x.class_no}` }))
    : (rooms || []).map((x) => ({ value: String(x.id), label: x.name }));
  const [f, setF] = useState({ kind: '금지', weekday: '1', period: 1 });
  const [error, setError] = useState('');
  const add = () => api('POST', `${P}/pins`, { target_kind: kind, target_id: Number(f.t), weekday: Number(f.weekday), period: f.period, kind: f.kind }).then(reload).catch((e) => setError(e.message));
  const label = (id) => targets.find((t) => t.value === String(id))?.label ?? id;
  return (
    <Stack>
      <Err e={err || error} />
      {(pins || []).map((p) => (
        <Group key={p.id}>
          <Badge color={p.kind === '고정' ? 'blue' : 'gray'}>{p.kind}</Badge>
          <Text size="sm">{label(p.target_id)} · {DAYS[p.weekday - 1]} {p.period}교시</Text>
          {admin && <Button size="xs" variant="subtle" color="red" onClick={() => api('DELETE', `${P}/pins/${p.id}`).then(reload)}>지우기</Button>}
        </Group>
      ))}
      {admin && (
        <Group align="end">
          <Select placeholder={kind} data={targets} value={f.t ?? null} onChange={(v) => setF({ ...f, t: v })} w={130} />
          <Select data={DAYS.map((d, i) => ({ value: String(i + 1), label: d }))} value={f.weekday} onChange={(v) => setF({ ...f, weekday: v })} w={80} />
          <NumberInput min={1} description={`기관 기준 ${org.limits.periods}교시`} value={f.period} onChange={(v) => setF({ ...f, period: v })} w={80} suffix="교시" />
          <Select data={['고정', '금지']} value={f.kind} onChange={(v) => setF({ ...f, kind: v })} w={90} />
          <Button disabled={!f.t} onClick={add}>추가</Button>
        </Group>
      )}
    </Stack>
  );
}

function Rules({ P, admin }) {
  const [d, reload, err] = useLoad(`${P}/rules`);
  const [error, setError] = useState('');
  if (!d) return <Err e={err} />;
  return (
    <Stack>
      <Err e={err || error} />
      <Text size="sm" c="dimmed">알림: 노랑 · 저장됨 / 경고: 빨강 · 되돌리기 / 재확인: 한 번 묻고 저장 / 끔</Text>
      {Object.entries(d.rules).map(([k, r]) => (
        <Group key={k} justify="space-between">
          <Text size="sm">{r.label}</Text>
          <Select disabled={!admin} data={d.choices} value={d.levels[k]} allowDeselect={false} w={110}
            onChange={(v) => api('PUT', `${P}/rules`, { levels: { [k]: v } }).then(reload).catch((e) => setError(e.message))} />
        </Group>
      ))}
    </Stack>
  );
}

export default function SchoolPage({ user }) {
  const P = `/orgs/${user.orgId}`;
  const admin = user.role === '기관관리자';
  // 기관 스위치로 꺼진 탭은 숨기고, 첫 탭은 켜진 것 중 첫째(Tabs 가 defaultValue 를 처음에만 읽어 key 로 다시 세운다)
  const on = visibleTabs(SCHOOL_TAB_FEATURE, useOrgConfig(P).features, ['basic', 'spec', 'loads', 'pins', ...(admin ? ['rules'] : [])]);
  const has = (t) => on.includes(t);
  return (
    <Tabs key={on[0]} defaultValue={on[0]} keepMounted={false}>
      <Tabs.List>
        {has('basic') && <Tabs.Tab value="basic">학교 기본</Tabs.Tab>}
        {has('spec') && <Tabs.Tab value="spec">전담·비교과</Tabs.Tab>}
        {has('loads') && <Tabs.Tab value="loads"><Term k="시수표">시수표</Term></Tabs.Tab>}
        {has('pins') && <Tabs.Tab value="pins">고정·금지</Tabs.Tab>}
        {has('rules') && <Tabs.Tab value="rules">규칙 수위</Tabs.Tab>}
      </Tabs.List>
      {has('basic') && <Tabs.Panel value="basic" pt="md"><Basics P={P} admin={admin} /></Tabs.Panel>}
      {has('spec') && <Tabs.Panel value="spec" pt="md"><Specialists P={P} admin={admin} /></Tabs.Panel>}
      {has('loads') && <Tabs.Panel value="loads" pt="md"><Loads P={P} admin={admin} /></Tabs.Panel>}
      {has('pins') && <Tabs.Panel value="pins" pt="md">
        <Tabs defaultValue="교사" keepMounted={false}>
          <Tabs.List>{['교사', '반', '특별실'].map((k) => <Tabs.Tab key={k} value={k}>{k}</Tabs.Tab>)}</Tabs.List>
          {['교사', '반', '특별실'].map((k) => <Tabs.Panel key={k} value={k} pt="md"><Pins P={P} admin={admin} kind={k} /></Tabs.Panel>)}
        </Tabs>
      </Tabs.Panel>}
      {has('rules') && <Tabs.Panel value="rules" pt="md"><Rules P={P} admin={admin} /></Tabs.Panel>}
    </Tabs>
  );
}
