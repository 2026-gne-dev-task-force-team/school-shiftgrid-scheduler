import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, NumberInput, Progress, Select, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { api } from '../api.js';
import { currentConflicts, moveConflicts } from '../gen/core.js';
import { dropPartial, genKey, loadPartial, savePartial } from '../gen/store.js';
import { combinedOf } from '../gen/overlap.js';
import { DEFAULTS, useOrgConfig } from '../orgConfig.js';
import Term from '../Term.jsx';

const K = 8; // 후보 수 기본값(화면 입력칸이 덮고 localStorage 에 기억)
const PER_MS = 3000; // 후보 하나당 시간 기본값(ms)
// 2판 안내문 — 권장 17 이 아직 없다는 것을 먼저 말한다
export const NOTICE = '필수(겹침 · 시수 · 급식 · 불가 시간)를 먼저 맞추고, 만든 후보 중 권장 규칙(공강 · 연속수업 등) 점수가 낮은 것을 위로 올립니다. 가중은 「생성 설정」 탭에서 바꿉니다. 마음에 안 드는 칸은 수정 모드에서 옮기세요.';
const LEVEL_COLOR = { 경고: 'red', 알림: 'yellow', 재확인: 'orange', 끔: 'green' };
const BG = { green: 'var(--mantine-color-green-1)', yellow: 'var(--mantine-color-yellow-1)', red: 'var(--mantine-color-red-1)', orange: 'var(--mantine-color-orange-1)' };

// 자동 생성 · 시안 관리 · 수정 모드(관리자만)
export default function AutoGen({ P }) {
  const [input, setInput] = useState(null);
  const [error, setError] = useState('');
  const [list, setList] = useState([]);
  const [tid, setTid] = useState(null);
  const loadList = useCallback(() => api('GET', `${P}/timetables`).then(setList).catch((e) => setError(e.message)), [P]);
  useEffect(() => {
    api('GET', `${P}/gen/input`).then(setInput).catch((e) => setError(e.message));
    loadList();
  }, [P, loadList]);
  const cfg = useOrgConfig(P);
  const gin = useMemo(() => (input ? { ...input, weekdays: cfg.weekdays, days: cfg.weekdays.length, maxPeriods: cfg.limits.periods } : null), [input, cfg]);
  if (!input) return error ? <Alert color="red">{error}</Alert> : null;
  return (
    <Stack>
      {error && <Alert color="red" withCloseButton onClose={() => setError('')}>{error}</Alert>}
      <Generator P={P} input={gin} onSaved={(t) => { loadList(); setTid(t.id); }} />
      <Drafts P={P} input={gin} list={list} tid={tid} setTid={setTid} reload={loadList} />
    </Stack>
  );
}

const storeKey = (P, termId) => `s2-gen:${P}:${termId ?? ''}`; // 학기가 바뀌면 지난 학기 결과가 안 보이게
const slow = () => (typeof window !== 'undefined' && (window.innerWidth < 600 || (navigator.hardwareConcurrency || 8) <= 4));

const optKey = (P) => `s2-genopt:${P}`;
const readOpt = (P) => { try { return JSON.parse(localStorage.getItem(optKey(P)) || '{}') || {}; } catch { return {}; } };
// 후보 수·후보당 시간(초) 범위 — 밖이면 기본값
export const clampOpt = (o) => ({
  k: Number.isInteger(o?.k) && o.k >= 1 && o.k <= 40 ? o.k : K,
  sec: Number.isFinite(o?.sec) && o.sec >= 0.5 && o.sec <= 60 ? o.sec : PER_MS / 1000,
  mealGap: o?.mealGap !== false,
});

function Generator({ P, input, onSaved }) {
  const [opt, setOptState] = useState(() => clampOpt(readOpt(P)));
  const setOpt = (o) => { const c = clampOpt({ ...opt, ...o }); setOptState(c); try { localStorage.setItem(optKey(P), JSON.stringify(c)); } catch { /* 기억 못 해도 이번 화면엔 쓴다 */ } };
  const [run, setRun] = useState(null); // {done, k}
  const [res, setRes] = useState(() => { try { return JSON.parse(localStorage.getItem(storeKey(P, input.term?.id)) || 'null'); } catch { return null; } });
  const [rank, setRank] = useState(0);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const worker = useRef(null);
  const pkey = genKey(P.split('/')[2], input.term?.id);
  const [saved, setSaved] = useState(null);
  useEffect(() => { loadPartial(pkey).then(setSaved); }, [pkey]);
  useEffect(() => () => worker.current?.terminate(), []);

  const start = (resume) => {
    setMsg(null);
    const prev = resume ? saved.candidates : [];
    const k = resume ? Math.max(1, saved.k - saved.done) : opt.k;
    if (!resume) { setSaved(null); dropPartial(pkey); }
    worker.current?.terminate();
    const w = new Worker(new URL('../gen/worker.js', import.meta.url), { type: 'module' });
    worker.current = w;
    setRun({ done: 0, k });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        setRun({ done: m.done, k: m.k });
        const cs = prev.length ? [...prev, ...m.candidates].sort((a, b) => a.hard - b.hard || a.rr - b.rr || a.soft - b.soft).map((c, rank) => ({ ...c, rank })) : m.candidates;
        savePartial(pkey, { done: (resume ? saved.done : 0) + m.done, k: resume ? saved.k : m.k, candidates: cs });
      }
      if (m.type === 'error') { setRun(null); setMsg({ color: 'red', text: m.message }); }
      if (m.type === 'done') {
        const out = { at: new Date().toISOString(), skipped: m.skipped, ms: m.ms, candidates: [...prev, ...m.candidates].sort((a, b) => a.hard - b.hard || a.rr - b.rr || a.soft - b.soft).map((c, rank) => ({ ...c, rank }))
          .map((c) => ({ rank: c.rank, hard: c.hard, rr: c.rr, soft: c.soft, cells: c.cells, unplaced: c.unplaced })) };
        setRes(out); setRank(0); setRun(null); setSaved(null); dropPartial(pkey);
        try { localStorage.setItem(storeKey(P, input.term?.id), JSON.stringify(out)); } catch { /* 저장 공간이 모자라면 이번 화면에만 둔다 */ }
        w.terminate();
      }
    };
    w.postMessage({ input: { ...input, hardOff: opt.mealGap ? [] : ['teacherMealGap'] }, k, perMs: Math.round(opt.sec * 1000) });
  };
  const cand = res?.candidates?.[rank];
  const save = async () => {
    try {
      const t = await api('POST', `${P}/timetables/generated`, { name: name.trim(), cells: cand.cells, gen_info: { rank, hard: cand.hard, rr: cand.rr, soft: cand.soft, unplaced: cand.unplaced } });
      setName('');
      setMsg({ color: t.violations?.length ? 'yellow' : 'green', text: `「${t.name}」 시안으로 저장했습니다${t.violations?.length ? ` · 알림 ${t.violations.length}건` : ''}` });
      onSaved(t);
    } catch (e) { setMsg({ color: 'red', text: e.message }); }
  };

  return (
    <Stack>
      <Alert color="blue" title={<>명단과 <Term k="시수표">시수표</Term>를 다 넣었으면 <Term k="시안">시안</Term>을 만듭니다</>}>{NOTICE}</Alert>
      {slow() && <Text size="sm" c="dimmed">PC 에서 하시면 빠릅니다. 폰에서도 그대로 됩니다.</Text>}
      <Group align="end">
        <NumberInput label="후보 수" min={1} max={40} w={90} value={opt.k} onChange={(v) => setOpt({ k: Number(v) })} />
        <NumberInput label="후보당 초" min={0.5} max={60} step={0.5} decimalScale={1} w={100} value={opt.sec} onChange={(v) => setOpt({ sec: Number(v) })} />
        <Switch label="전담 식사 빈 칸 필수" checked={opt.mealGap} onChange={(e) => setOpt({ mealGap: e.currentTarget.checked })} />
      </Group>
      {!opt.mealGap && <Text size="sm" c="yellow.8">식사 빈 칸을 필수에서 뺐습니다. 대신 권장 점수의 「교사 점심시간 확보」가 세어 줍니다.</Text>}
      <Group align="end">
        <Button onClick={() => start(false)} loading={!!run} disabled={!input.classrooms.length}>자동 생성 (후보 {opt.k}개 · 최대 {opt.k * opt.sec}초)</Button>
        {res && <Button variant="default" disabled={!!run || rank + 1 >= res.candidates.length} onClick={() => setRank(rank + 1)}>다음 시안</Button>}
      </Group>
      {saved && !run && (
        <Alert color="yellow" title="중단된 생성이 있습니다">
          <Text size="sm">{new Date(saved.at).toLocaleString('ko-KR')} · 후보 {saved.done}/{saved.k}개까지 만들었습니다.</Text>
          <Group mt="xs"><Button size="xs" onClick={() => start(true)}>이어서 하기</Button><Button size="xs" variant="default" onClick={() => { setSaved(null); dropPartial(pkey); }}>버리기</Button></Group>
        </Alert>
      )}
      {!input.classrooms.length && <Text size="sm" c="dimmed">「학교 기본」에서 반을 먼저 만드세요.</Text>}
      {run && <Progress value={(run.done / run.k) * 100} animated />}
      {msg && <Alert color={msg.color} withCloseButton onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {cand && (
        <Stack gap="xs">
          <Group>
            <Badge size="lg">{rank + 1}순위 / {res.candidates.length}</Badge>
            <Badge size="lg" color={cand.hard ? 'red' : 'green'}>못 놓은 시수 {cand.hard}</Badge>
            <Badge size="lg" color={cand.rr ? 'yellow' : 'green'}>진도 맞춤 어긋남 {cand.rr}</Badge>
            <Badge size="lg" color="gray">권장 점수 {cand.soft} (낮을수록 좋음)</Badge>
            <Text size="xs" c="dimmed">{(res.ms / 1000).toFixed(1)}초 · {new Date(res.at).toLocaleString('ko-KR')}</Text>
          </Group>
          {cand.unplaced?.length > 0 && <Text size="sm" c="red">못 놓은 수업 {cand.unplaced.length}개 — 저장한 뒤 수정 모드에서 손으로 넣으세요.</Text>}
          {res.skipped > 0 && <Text size="sm" c="yellow.8">시수표에서 덜 채운 줄 {res.skipped}개는 빼고 만들었습니다.</Text>}
          <Group align="end">
            <TextInput label="시안 이름" placeholder="예: 2학기 자동 1" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Button disabled={!name.trim()} onClick={save}>이 시안 저장</Button>
          </Group>
          <ModeGrid input={input} cells={cand.cells} />
        </Stack>
      )}
    </Stack>
  );
}

function Drafts({ P, input, list, tid, setTid, reload }) {
  const [d, setD] = useState(null);
  const [date, setDate] = useState('');
  const [copyName, setCopyName] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => (tid ? api('GET', `${P}/timetables/${tid}`).then(setD).catch((e) => setMsg({ color: 'red', text: e.message })) : setD(null)), [P, tid]);
  useEffect(() => { load(); }, [load]);
  const act = (fn) => async () => { setMsg(null); try { await fn(); } catch (e) { setMsg({ color: 'red', text: e.message }); } };
  const tt = d?.timetable;
  const levelOf = (rule) => d?.levels?.[rule];

  // 수정 모드: 같은 반 안 두 칸 맞바꾸기(맞바꾸기 한 번 호출)
  const swap = act(async (from, to) => {
    if (tt.status === '확정' && levelOf('edit_confirmed') === '재확인' && !window.confirm('확정된 시간표입니다. 그래도 옮길까요?')) return;
    const r = await api('POST', `${P}/timetables/${tid}/cells/swap`, { from: { classroom_id: from.classroom_id, weekday: from.weekday, period: from.period }, to: { classroom_id: to.classroom_id, weekday: to.weekday, period: to.period } });
    setMsg(r.violations?.length ? { color: r.violations.some((v) => v.color === 'red') ? 'red' : 'yellow', text: `옮겼습니다. ${r.violations.map((v) => v.detail || v.label).join(' · ')}` } : { color: 'green', text: '옮겼습니다.' });
    await load();
  });

  if (!list.length) return null;
  return (
    <Stack mt="lg">
      <Group align="end">
        <Select label="저장한 시간표 (수정 모드)" placeholder="고르세요" data={list.map((t) => ({ value: String(t.id), label: `${t.name} (${t.status}${t.starts_on ? ` · ${String(t.starts_on).slice(0, 10)}부터` : ''})` }))} value={tid ? String(tid) : null} onChange={(v) => setTid(v ? Number(v) : null)} />
      </Group>
      {msg && <Alert color={msg.color} withCloseButton onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {tt && (
        <>
          <Group align="end">
            {tt.status === '시안' ? (
              <>
                <TextInput type="date" label="적용 시작일" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
                <Button color="green" disabled={!date} onClick={act(async () => {
                  if (!window.confirm(`「${tt.name}」을 ${date}부터 확정합니다. 확정하면 교직원 화면에 뜹니다.`)) return;
                  const r = await api('POST', `${P}/timetables/${tid}/confirm`, { starts_on: date });
                  setMsg({ color: r.notes?.length ? 'yellow' : 'green', text: `확정했습니다.${r.notes?.length ? ` ${r.notes.map((n) => n.detail).join(' · ')}` : ''}` });
                  reload(); load();
                })}>확정</Button>
              </>
            ) : (
              <Button variant="default" onClick={act(async () => { if (!window.confirm('확정을 풀고 시안으로 돌릴까요?')) return; await api('POST', `${P}/timetables/${tid}/unconfirm`); reload(); load(); })}>확정 풀기</Button>
            )}
            <TextInput label="복제 이름" placeholder={`${tt.name} 사본`} value={copyName} onChange={(e) => setCopyName(e.currentTarget.value)} />
            <Button variant="default" onClick={act(async () => { const t = await api('POST', `${P}/timetables/${tid}/copy`, { name: copyName.trim() || `${tt.name} 사본` }); setCopyName(''); reload(); setTid(t.id); })}>복제</Button>
            <Button color="red" variant="light" onClick={act(async () => {
              if (!window.confirm(`「${tt.name}」을 지울까요?${tt.status === '확정' ? ' 확정된 시간표입니다.' : ''}`)) return;
              await api('DELETE', `${P}/timetables/${tid}`); setTid(null); reload();
            })}>지우기</Button>
          </Group>
          <ModeGrid input={input} cells={d.cells} levels={d.levels} onSwap={swap} />
        </>
      )}
    </Stack>
  );
}

// 수정 모드 격자 — 칸을 끌어 옮기거나(PC) 눌러 고른 뒤 눌러 옮긴다(폰).
// 고른 칸이 있으면 같은 반 칸마다 색: 초록=옮겨도 안전 · 노랑/빨강=옮기면 위반(규칙 수위 따라) · 빗금 빨강=지금 위반
export function ModeGrid({ input, cells, levels = input.levels || {}, onSwap }) {
  const DAYS = input.weekdays || DEFAULTS.weekdays;
  const [classId, setClassId] = useState(input.classrooms[0]?.id ?? null);
  const [src, setSrc] = useState(null);
  const classInfo = useMemo(() => {
    const g = input.periods?.grades || {};
    return Object.fromEntries(input.classrooms.map((c) => [c.id, { L: g[c.grade]?.lunchAfter || 0, P: g[c.grade]?.periods || 5 }]));
  }, [input]);
  // 복식 묶음·교시 시각을 아는 겹침 규칙(서버 violations.js 와 같은 규칙)
  const ctx = useMemo(() => ({ periods: input.periods || {}, gradeOf: Object.fromEntries(input.classrooms.map((c) => [c.id, c.grade])), combined: combinedOf(input.small) }), [input]);
  const now = useMemo(() => currentConflicts(cells, classInfo, ctx), [cells, classInfo, ctx]);
  const cellMap = useMemo(() => new Map(cells.map((c) => [`${c.classroom_id}:${c.weekday}:${c.period}`, c])), [cells]);
  const cls = input.classrooms.find((c) => c.id === classId) || input.classrooms[0];
  if (!cls) return null;
  const nm = (list, v) => list?.find((x) => String(x.id) === String(v));
  const subj = (v) => nm(input.subjects, v)?.short_name || nm(input.subjects, v)?.name || '';
  const colorOf = (rules) => {
    let worst = 'green';
    for (const r of rules) {
      const c = LEVEL_COLOR[levels[r.rule]] || 'red';
      if (c === 'red') return 'red';
      if (c === 'orange' || (c === 'yellow' && worst === 'green')) worst = c;
    }
    return worst;
  };
  const pcount = classInfo[cls.id].P;
  const slot = (w, p) => ({ classroom_id: cls.id, weekday: w, period: p });
  const drop = (w, p) => {
    if (!src || !onSwap) return;
    if (src.weekday === w && src.period === p) { setSrc(null); return; }
    const from = src;
    setSrc(null);
    onSwap(from, slot(w, p));
  };
  const tap = (w, p) => {
    if (!onSwap) return;
    if (!src) { if (cellMap.get(`${cls.id}:${w}:${p}`)) setSrc(slot(w, p)); return; }
    drop(w, p);
  };
  return (
    <Stack gap="xs">
      <Group>
        <Select label="반" data={input.classrooms.map((c) => ({ value: String(c.id), label: `${c.grade}학년 ${c.class_no}반` }))} value={String(cls.id)} onChange={(v) => { setClassId(Number(v)); setSrc(null); }} allowDeselect={false} w={150} />
        {onSwap && <Text size="sm" c="dimmed">{src ? '옮길 칸을 누르세요(초록이 안전합니다)' : '칸을 끌어 옮기거나, 눌러 고른 뒤 옮길 칸을 누르세요'}</Text>}
      </Group>
      <div className="grid-scroll">
        <Table withTableBorder withColumnBorders className="tt-grid">
          <Table.Thead><Table.Tr><Table.Th w={50}>교시</Table.Th>{DAYS.map((x) => <Table.Th key={x} ta="center">{x}</Table.Th>)}</Table.Tr></Table.Thead>
          <Table.Tbody>
            {Array.from({ length: pcount }, (_, i) => i + 1).map((p) => (
              <Table.Tr key={p}>
                <Table.Td ta="center" fw={600}>{p}</Table.Td>
                {DAYS.map((_x, wi) => {
                  const w = wi + 1;
                  const k = `${cls.id}:${w}:${p}`;
                  const c = cellMap.get(k);
                  const bad = now.get(k);
                  const isSrc = src && src.weekday === w && src.period === p;
                  const hint = src && !isSrc ? colorOf(moveConflicts(cells, classInfo, src, slot(w, p), ctx)) : null;
                  const style = {
                    cursor: onSwap ? 'pointer' : 'default', minWidth: 74,
                    background: hint ? BG[hint] : bad ? `repeating-linear-gradient(45deg, ${BG.red}, ${BG.red} 6px, transparent 6px, transparent 12px)` : undefined,
                    outline: isSrc ? '2px solid var(--mantine-color-blue-6)' : undefined,
                  };
                  return (
                    <Table.Td key={w} style={style} draggable={!!onSwap && !!c} onDragStart={() => setSrc(slot(w, p))} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(w, p)} onClick={() => tap(w, p)}>
                      {c ? (
                        <>
                          <Text size="sm" fw={600}>{subj(c.subject_id) || '·'}</Text>
                          <Text size="xs" c="dimmed">{nm(input.teachers, c.membership_id)?.name || ''}{c.special_room_id ? ` @${nm(input.rooms, c.special_room_id)?.name || ''}` : ''}</Text>
                          {bad && <Text size="xs" c="red" fw={700}>{bad.some((b) => b.rule === 'teacher_overlap') ? '교사 겹침' : '특별실 겹침'}</Text>}
                        </>
                      ) : <Text size="xs" c="dimmed">&nbsp;</Text>}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Stack>
  );
}
