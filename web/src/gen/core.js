// 자동 생성 핵심 — 순수 함수(브라우저 웹 워커와 node 벤치가 같이 쓴다). 서버로 보내지 않는다.
// 필수 12 를 「성립」 기준으로, 라운드로빈(진도 맞춤)은 ord(반별 세션 시간순 순번) 비교로 센다.
// 충돌 판정은 교시가 아니라 시각 칸(clock)으로 한다 — 학년마다 점심 자리가 달라 「N교시」의 실제 시각이 다르다.
// 업무 규칙을 막지 않는다: 못 놓은 수업·남은 위반은 목록으로 돌려줄 뿐 결과를 버리지 않는다.

import { findOverlaps } from './overlap.js';

export const HARD_RULES = [
  '한 반 한 시각 한 과목',
  '한 교사 한 시각 한 반(시각 칸)',
  '한 특별실 한 시각 한 반(시각 칸)',
  '주당 시수 채우기',
  '학년 교시 범위 안',
  '급식 칸 비우기',
  '전담 교사 식사용 빈 칸 하루 하나 이상',
  '교사 불가 시간(교시 기준)',
  '특별실 불가 시간(시각 칸 기준)',
  '반 고정·금지 칸에 다른 수업 안 넣기',
  '연강은 같은 날 붙여서 · 점심을 넘지 않게',
  '진도 맞춤(라운드로빈) — 순위로 센다',
];

export const DAYS = 5;
const W = 16; // 하루 칸 폭(교시·시각 ≤ 13)

// 시각 칸: 점심(N교시 뒤)이 있으면 그 뒤 교시는 한 칸 밀린다
export const clockOf = (lunchAfter, period) => (lunchAfter > 0 && period > lunchAfter ? period + 1 : period);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 소규모교 설정을 생성 재료에 입힌다(순수). small = { enabled, homeroom_subject_ids, combined:[{classroom_ids}],
//   homeroom_fill(기본 켬): 담임 교과 줄에 교사가 비면 그 반 담임(classrooms[].homeroom_membership_id)으로 채운다
//   combined_mode(기본 'same_slot'): 복식 묶음 반들의 같은 교과·같은 교사 줄을 한 칸에 같이 놓는다 · 'separate' 면 따로 }
// 돌려주는 값: { lines(채운 줄), joint: [{lines:[줄...], hours}] } — 묶인 시수는 각 줄 weekly_hours 에서 빠진다.
export function applySmall(input) {
  const sm = input.small || {};
  const lines = (input.lines || []).map((l) => ({ ...l }));
  if (!sm.enabled) return { lines, joint: [] };
  if (sm.homeroom_fill !== false) {
    const hr = new Map((input.classrooms || []).map((c) => [String(c.id), c.homeroom_membership_id ?? null]));
    const subj = new Set((sm.homeroom_subject_ids || []).map(String));
    for (const l of lines) if (l.membership_id == null && subj.has(String(l.subject_id)) && hr.get(String(l.classroom_id)) != null) { l.membership_id = hr.get(String(l.classroom_id)); l.homeroom_filled = true; }
  }
  const joint = [];
  if (sm.combined_mode === 'separate') return { lines, joint };
  for (const g of sm.combined || []) {
    const ids = (g.classroom_ids || []).map(String);
    if (ids.length < 2) continue;
    // 교과 × 교사가 같은 줄을 묶음 반마다 하나씩 모은다(반 하나라도 빠지면 안 묶는다)
    const by = new Map();
    for (const l of lines) {
      if (!ids.includes(String(l.classroom_id)) || !l.subject_id || !(l.weekly_hours > 0)) continue;
      const k = `${l.subject_id}|${l.membership_id ?? ''}`;
      if (!by.has(k)) by.set(k, new Map());
      const m = by.get(k);
      if (!m.has(String(l.classroom_id))) m.set(String(l.classroom_id), l);
    }
    for (const m of by.values()) {
      if (m.size !== ids.length) continue;
      const ls = [...m.values()];
      const hours = Math.min(...ls.map((l) => l.weekly_hours));
      if (!(hours > 0)) continue;
      for (const l of ls) l.weekly_hours -= hours;
      joint.push({ lines: ls, hours });
    }
  }
  return { lines, joint };
}

// 입력: { classrooms:[{id,grade}], periods:{grades:{g:{periods,lunchAfter}}}, lines:[{classroom_id,membership_id,subject_id,special_room_id,weekly_hours,sync_progress,block?}], pins:[...] }
export function prepare(input) {
  const grades = input.periods?.grades || {};
  const classes = input.classrooms.map((c, i) => {
    const g = grades[c.grade] || grades[String(c.grade)] || {};
    return { id: c.id, grade: c.grade, idx: i, P: Math.min(12, g.periods || 5), L: g.lunchAfter || 0 };
  });
  const clsIdx = new Map(classes.map((c) => [String(c.id), c.idx]));
  const tIdx = new Map();
  const rIdx = new Map();
  const key = (m, v) => {
    if (v == null) return -1;
    const k = String(v);
    if (!m.has(k)) m.set(k, m.size);
    return m.get(k);
  };
  const lessons = [];
  const skipped = [];
  const small = applySmall(input);
  // 복식 묶음: 한 수업이 여러 반을 같은 교시에 차지한다(cs · lines). 진도 맞춤에서는 뺀다.
  for (const j of small.joint) {
    const cs = j.lines.map((l) => clsIdx.get(String(l.classroom_id)));
    if (cs.some((x) => x == null)) continue;
    const l0 = j.lines[0];
    const t = key(tIdx, l0.membership_id);
    const rs = j.lines.map((l) => key(rIdx, l.special_room_id));
    const blk = l0.block === 2 ? 2 : 1;
    let h = j.hours;
    while (h > 0) {
      const span = blk === 2 && h >= 2 ? 2 : 1;
      lessons.push({ id: lessons.length, c: cs[0], cs, t, r: rs[0], rs: [...new Set(rs.filter((x) => x >= 0))], s: l0.subject_id, span, sync: false, line: l0, lines: j.lines, fixed: false, d: -1, p: -1 });
      h -= span;
    }
  }
  for (const l of small.lines) {
    const ci = clsIdx.get(String(l.classroom_id));
    if (l.weekly_hours === 0 && small.joint.some((j) => j.lines.includes(l))) continue; // 전부 묶여 나간 줄
    if (ci == null || !l.subject_id || !(l.weekly_hours > 0)) { skipped.push(l); continue; }
    const t = key(tIdx, l.membership_id);
    const r = key(rIdx, l.special_room_id);
    let h = l.weekly_hours;
    const blk = l.block === 2 ? 2 : 1;
    while (h > 0) {
      const span = blk === 2 && h >= 2 ? 2 : 1;
      lessons.push({ id: lessons.length, c: ci, cs: [ci], t, r, rs: r >= 0 ? [r] : [], s: l.subject_id, span, sync: !!l.sync_progress, line: l, lines: null, fixed: false, d: -1, p: -1 });
      h -= span;
    }
  }
  const nC = classes.length;
  const nT = tIdx.size;
  const nR = rIdx.size;
  const classBlock = new Uint8Array(nC * DAYS * W);
  const teachBlockP = new Uint8Array(Math.max(1, nT) * DAYS * W);
  const roomBlockC = new Uint8Array(Math.max(1, nR) * DAYS * W);
  const fixedReq = []; // [{c, d, p, s}]
  for (const pin of input.pins || []) {
    const d = pin.weekday - 1;
    if (d < 0 || d >= DAYS || pin.period < 1 || pin.period >= W) continue;
    if (pin.target_kind === '반') {
      const ci = clsIdx.get(String(pin.target_id));
      if (ci == null) continue;
      if (pin.kind === '고정' && pin.subject_id) fixedReq.push({ c: ci, d, p: pin.period, s: pin.subject_id });
      else classBlock[(ci * DAYS + d) * W + pin.period] = 1;
    } else if (pin.target_kind === '교사') {
      const ti = tIdx.get(String(pin.target_id));
      if (ti != null) teachBlockP[(ti * DAYS + d) * W + pin.period] = 1;
    } else if (pin.target_kind === '특별실') {
      const ri = rIdx.get(String(pin.target_id));
      if (ri != null) roomBlockC[(ri * DAYS + d) * W + pin.period] = 1; // 특별실은 시각 칸 기준
    }
  }
  // 교사별 식사 후보 시각(가르치는 학년들의 점심 칸)
  const lunchClocks = Array.from({ length: nT }, () => new Set());
  for (const L of lessons) for (const c of L.cs) if (L.t >= 0 && classes[c].L > 0) lunchClocks[L.t].add(classes[c].L + 1);
  // 진도 맞춤 묶음: 교사 × 학년 × 과목
  const groups = new Map();
  for (const L of lessons) {
    if (!L.sync || L.t < 0) continue;
    const gk = `${L.t}:${classes[L.c].grade}:${L.s}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(L);
    L.g = gk;
  }
  const ids = { teachers: [...tIdx.keys()], rooms: [...rIdx.keys()] };
  return { small: input.small || null, joint: small.joint.length, classes, lessons, nC, nT, nR, classBlock, teachBlockP, roomBlockC, fixedReq, lunchClocks: lunchClocks.map((s) => [...s]), groups, skipped, ids };
}

// 한 후보 풀기. 상태는 prep 안 lessons 의 d/p 와 점유 배열.
export function solve(prep, { seed = 1, strategy = 0, deadline = Date.now() + 3000 } = {}) {
  const R = rng(seed);
  const { classes, lessons, nC, nT, nR, classBlock, teachBlockP, roomBlockC, lunchClocks } = prep;
  const classOcc = new Int32Array(nC * DAYS * W).fill(-1);
  const teachOcc = new Int32Array(Math.max(1, nT) * DAYS * W).fill(-1);
  const roomOcc = new Int32Array(Math.max(1, nR) * DAYS * W).fill(-1);
  const evicted = new Uint16Array(lessons.length);
  for (const L of lessons) { L.d = -1; L.p = -1; L.fixed = false; }

  const put = (L, d, p, v) => {
    for (const c of L.cs) {
      const k = classes[c];
      for (let i = 0; i < L.span; i++) {
        const pp = p + i;
        const cc = clockOf(k.L, pp);
        classOcc[(c * DAYS + d) * W + pp] = v;
        if (L.t >= 0) teachOcc[(L.t * DAYS + d) * W + cc] = v;
        for (const r of L.rs) roomOcc[(r * DAYS + d) * W + cc] = v;
      }
    }
  };
  const place = (L, d, p) => { put(L, d, p, L.id); L.d = d; L.p = p; };
  const remove = (L) => { if (L.d < 0) return; put(L, L.d, L.p, -1); L.d = -1; L.p = -1; };

  // 칸이 아예 안 되는가(막힘·범위·고정·식사) — 되면 비켜야 할 수업 수를 돌려준다(buf 에 담음)
  const buf = [];
  const occs = [];
  const cost = (L, d, p) => {
    buf.length = 0;
    for (const c of L.cs) {
      const k = classes[c];
      if (p + L.span - 1 > k.P) return -1;
      if (L.span === 2 && k.L > 0 && p === k.L) return -1; // 연강은 점심을 넘지 않는다
      for (let i = 0; i < L.span; i++) {
        const pp = p + i;
        const cc = clockOf(k.L, pp);
        if (classBlock[(c * DAYS + d) * W + pp]) return -1;
        occs.length = 0;
        occs.push(classOcc[(c * DAYS + d) * W + pp]);
        if (L.t >= 0) {
          if (teachBlockP[(L.t * DAYS + d) * W + pp]) return -1;
          occs.push(teachOcc[(L.t * DAYS + d) * W + cc]);
        }
        for (const r of L.rs) {
          if (roomBlockC[(r * DAYS + d) * W + cc]) return -1;
          occs.push(roomOcc[(r * DAYS + d) * W + cc]);
        }
        for (const o of occs) {
          if (o === -2) return -1; // 교과만 박힌 고정 칸
          if (o < 0 || o === L.id) continue;
          if (lessons[o].fixed) return -1;
          if (!buf.includes(o)) buf.push(o);
        }
      }
    }
    // 식사용 빈 칸: 이 교사의 점심 후보 시각이 하루에 하나는 남아야 한다
    if (L.t >= 0) {
      const lc = lunchClocks[L.t];
      if (lc.length) {
        const mine = new Set();
        for (const c of L.cs) for (let i = 0; i < L.span; i++) mine.add(clockOf(classes[c].L, p + i));
        let free = 0;
        for (const c of lc) {
          if (mine.has(c)) continue;
          const o = teachOcc[(L.t * DAYS + d) * W + c];
          if (o < 0 || o === L.id || buf.includes(o)) free++;
        }
        if (!free) return -1;
      }
    }
    return buf.length;
  };

  // 1) 고정(반 고정 + 교과): 그 반 그 교과 수업 하나를 그 칸에 박는다. 없으면 교과만 있는 칸을 만든다
  const extra = [];
  for (const f of prep.fixedReq) {
    if (f.p > classes[f.c].P) continue;
    if (classOcc[(f.c * DAYS + f.d) * W + f.p] >= 0) continue;
    const L = lessons.find((x) => x.c === f.c && x.cs.length === 1 && x.s === f.s && x.d < 0 && x.span === 1);
    if (L && cost(L, f.d, f.p) === 0) { place(L, f.d, f.p); L.fixed = true; } else if (!L) extra.push({ c: f.c, d: f.d, p: f.p, s: f.s });
  }
  for (const e of extra) classOcc[(e.c * DAYS + e.d) * W + e.p] = -2; // 교과만 있는 고정 칸(아무도 못 들어옴)

  // 2) 놓는 순서 — 전략마다 다르게(어려운 것 먼저가 기본)
  const tLoad = new Float64Array(Math.max(1, nT));
  for (const L of lessons) if (L.t >= 0) tLoad[L.t] += L.span;
  const free = lessons.filter((L) => !L.fixed);
  const jitter = new Float64Array(lessons.length).map(() => R());
  const diff = (L) => (L.r >= 0 ? 1000 : 0) + (L.span === 2 ? 500 : 0) + (L.t >= 0 ? tLoad[L.t] * 4 : 0) + (L.sync ? 50 : 0);
  if (strategy % 4 === 0) free.sort((a, b) => diff(b) - diff(a) || jitter[a.id] - jitter[b.id]);
  else if (strategy % 4 === 1) free.sort((a, b) => diff(b) + jitter[b.id] * 200 - diff(a) - jitter[a.id] * 200);
  else if (strategy % 4 === 2) free.sort((a, b) => (b.r >= 0) - (a.r >= 0) || (b.t >= 0 ? tLoad[b.t] : 0) - (a.t >= 0 ? tLoad[a.t] : 0) || a.c - b.c);
  else free.sort((a, b) => jitter[a.id] - jitter[b.id]);

  // 하루에 같은 과목이 이미 있으면 덜 좋다(골고루 — 성립엔 무관한 가벼운 선호)
  const sameDay = (L, d) => {
    let n = 0;
    const k = classes[L.c];
    for (let p = 1; p <= k.P; p++) {
      const o = classOcc[(L.c * DAYS + d) * W + p];
      if (o >= 0 && o !== L.id && lessons[o].s === L.s) n++;
    }
    return n;
  };

  // 3) 탐욕 배치 — 비켜 줄 것 없는 칸 중 고른다
  const queue = [];
  for (const L of free) {
    let best = null;
    let bestScore = Infinity;
    const k = classes[L.c];
    for (let d = 0; d < DAYS; d++) {
      const sd = sameDay(L, d) * 3;
      for (let p = 1; p <= k.P; p++) { // 복식 수업은 cost 가 반마다 범위를 다시 본다
        if (cost(L, d, p) !== 0) continue;
        const sc = sd + R();
        if (sc < bestScore) { bestScore = sc; best = [d, p]; }
      }
    }
    if (best) place(L, best[0], best[1]); else queue.push(L);
  }

  // 4) 고치기 — 못 놓은 수업을 가장 적게 비키는 칸에 넣고, 밀려난 수업은 다시 줄에 선다
  let iter = 0;
  const maxIter = lessons.length * 60;
  while (queue.length && iter < maxIter) {
    if ((iter & 63) === 0 && Date.now() > deadline) break;
    iter++;
    const qi = Math.floor(R() * queue.length);
    const L = queue[qi];
    queue[qi] = queue[queue.length - 1];
    queue.pop();
    const k = classes[L.c];
    let best = null;
    let bestScore = Infinity;
    let bestEvict = null;
    for (let d = 0; d < DAYS; d++) {
      for (let p = 1; p <= k.P; p++) {
        const n = cost(L, d, p);
        if (n < 0) continue;
        let w = 0;
        for (const o of buf) w += 1 + evicted[o] * 0.5 + lessons[o].span;
        const sc = w * 10 + R() * 6;
        if (sc < bestScore) { bestScore = sc; best = [d, p]; bestEvict = buf.slice(); }
      }
    }
    if (!best) { queue.push(L); if (queue.length === 1 && iter > lessons.length * 4) break; continue; }
    for (const o of bestEvict) { remove(lessons[o]); evicted[o]++; queue.push(lessons[o]); }
    place(L, best[0], best[1]);
  }

  // 5) 진도 맞춤 다듬기 — ord 위반이 줄면 같은 반 안에서 칸을 옮기거나 맞바꾼다
  const groups = [...prep.groups.values()];
  let rr = roundRobin(prep);
  if (rr > 0 && !queue.length) {
    const bad = () => groups.filter((g) => groupRR(prep, g) > 0);
    let tries = 0;
    let stale = 0;
    while (rr > 0 && stale < 4000 && tries < 200000) {
      if ((tries & 31) === 0 && Date.now() > deadline) break;
      tries++;
      const gs = bad();
      if (!gs.length) break;
      const g = gs[Math.floor(R() * gs.length)];
      const L = g[Math.floor(R() * g.length)];
      if (L.fixed || L.d < 0) continue;
      const k = classes[L.c];
      if (L.cs.length > 1) { stale++; continue; }
      const d = Math.floor(R() * DAYS);
      const p = 1 + Math.floor(R() * k.P);
      const before = groupRR(prep, g);
      const od = L.d;
      const op = L.p;
      const n = cost(L, d, p);
      if (n < 0) { stale++; continue; }
      // 비킬 것이 같은 반 수업 하나뿐이고 그 수업이 내 자리로 갈 수 있으면 맞바꾼다
      if (n > 1) { stale++; continue; }
      const other = n === 1 ? lessons[buf[0]] : null;
      if (other && (other.c !== L.c || other.cs.length > 1 || other.span !== L.span || other.fixed)) { stale++; continue; }
      remove(L);
      if (other) remove(other);
      if (cost(L, d, p) !== 0) { place(L, od, op); if (other) place(other, d, p); stale++; continue; }
      place(L, d, p);
      if (other) {
        if (cost(other, od, op) !== 0) { remove(L); place(L, od, op); place(other, d, p); stale++; continue; }
        place(other, od, op);
      }
      let delta = groupRR(prep, g) - before;
      if (other?.g && other.g !== L.g) {
        // 다른 묶음도 바뀌었다 — 전체로 다시 센다
        const now = roundRobin(prep);
        delta = now - rr;
      }
      if (delta <= 0) { rr += delta; if (delta < 0) stale = 0; else stale++; } else {
        remove(L);
        if (other) remove(other);
        place(L, od, op);
        if (other) place(other, d, p);
        stale++;
      }
    }
    rr = roundRobin(prep);
  }

  const cells = [];
  for (const L of lessons) {
    if (L.d < 0) continue;
    const ls = L.lines || [L.line];
    for (let j = 0; j < L.cs.length; j++) {
      for (let i = 0; i < L.span; i++) {
        cells.push({ classroom_id: classes[L.cs[j]].id, weekday: L.d + 1, period: L.p + i, subject_id: L.s, membership_id: ls[j].membership_id ?? null, special_room_id: ls[j].special_room_id ?? null });
      }
    }
  }
  for (const e of extra) cells.push({ classroom_id: classes[e.c].id, weekday: e.d + 1, period: e.p, subject_id: e.s, membership_id: null, special_room_id: null });
  const unplaced = queue.flatMap((L) => L.cs.map((c) => ({ classroom_id: classes[c].id, subject_id: L.s, membership_id: L.line.membership_id ?? null, hours: L.span, ...(L.cs.length > 1 ? { combined: true } : {}) })));
  return { cells, unplaced, hard: unplaced.reduce((a, u) => a + u.hours, 0), rr, iter };
}

// 진도 맞춤 위반 수 — 한 교사 안 같은 학년·과목 묶음에서, 반마다 세션을 시간순으로 세운 순번(ord)을 비교한다.
// ord k+1 이 다른 반의 ord k 보다 먼저 시작하면 위반 1. 차시 번호를 비교하지 않는다(v1 오탐 함정). 연강은 한 세션.
export function groupRR(prep, g) {
  const { classes } = prep;
  const byClass = new Map();
  for (const L of g) {
    if (L.d < 0) continue;
    const t = L.d * W + clockOf(classes[L.c].L, L.p);
    if (!byClass.has(L.c)) byClass.set(L.c, []);
    byClass.get(L.c).push(t);
  }
  const lists = [...byClass.values()].map((a) => a.sort((x, y) => x - y));
  if (lists.length < 2) return 0;
  let v = 0;
  const maxK = Math.max(...lists.map((a) => a.length));
  for (let k = 0; k + 1 < maxK; k++) {
    for (const X of lists) {
      if (X.length <= k + 1) continue;
      for (const Y of lists) {
        if (X === Y || Y.length <= k) continue;
        if (X[k + 1] < Y[k]) v++;
      }
    }
  }
  return v;
}
export function roundRobin(prep) {
  let v = 0;
  for (const g of prep.groups.values()) v += groupRR(prep, g);
  return v;
}

// best-of-K: 전략·씨앗을 바꿔 K 개를 만들고 [성립(못 놓은 시수) · 진도 위반 · 권장 점수] 순으로 줄 세운다
export function generate(input, { k = 8, perMs = 3000, seed = 1, softScore = () => 0, onProgress } = {}) {
  const prep = prepare(input);
  const out = [];
  const t0 = Date.now();
  for (let i = 0; i < k; i++) {
    const s0 = Date.now();
    const r = solve(prep, { seed: seed + i * 7919, strategy: i, deadline: s0 + perMs });
    let soft = 0;
    try { soft = Number(softScore({ cells: r.cells, input })) || 0; } catch { soft = 0; }
    out.push({ ...r, soft, strategy: i, ms: Date.now() - s0 });
    onProgress?.({ done: i + 1, k, hard: r.hard, rr: r.rr });
  }
  out.sort((a, b) => a.hard - b.hard || a.rr - b.rr || a.soft - b.soft);
  return { candidates: out.map((c, rank) => ({ ...c, rank })), skipped: prep.skipped.length, ms: Date.now() - t0 };
}

// 수정 모드: 한 반 안에서 칸 둘을 맞바꿨을 때 생기는 충돌(시각 칸 기준) — 칸 색을 정한다.
// cells: 시안 전체 칸 · cls: {id→{grade,L}} 반 정보 · 돌려주는 값: [{rule}] (없으면 안전)
export function moveConflicts(cells, classInfo, from, to, ctx = null) {
  const at = (c, w, p) => cells.find((x) => x.classroom_id === c && x.weekday === w && x.period === p);
  const a = at(from.classroom_id, from.weekday, from.period);
  const b = at(to.classroom_id, to.weekday, to.period);
  const moved = [];
  if (a) moved.push({ ...a, weekday: to.weekday, period: to.period });
  if (b) moved.push({ ...b, weekday: from.weekday, period: from.period });
  const rest = cells.filter((x) => x !== a && x !== b);
  if (ctx) { // 복식 묶음 · 교시 시각을 아는 판(서버 겹침 검사와 같은 규칙)
    const now = currentConflicts([...rest, ...moved], classInfo, ctx);
    const out = [];
    for (const m of moved) {
      if (m.period > ((classInfo[m.classroom_id] || {}).P || 12)) out.push({ rule: 'out_of_range' });
      out.push(...(now.get(`${m.classroom_id}:${m.weekday}:${m.period}`) || []));
    }
    return out;
  }
  return conflictsOf(moved, rest, classInfo);
}

// 칸 목록 안 각 칸이 지금 걸린 충돌(시각 칸 기준). 돌려주는 값: Map(key → [{rule}])
export function currentConflicts(cells, classInfo, ctx = null) {
  const res = new Map();
  if (ctx) {
    for (const f of findOverlaps(cells, ctx)) {
      for (const c of f.cells) {
        const ck = `${c.classroom_id}:${c.weekday}:${c.period}`;
        const list = res.get(ck) ?? res.set(ck, []).get(ck);
        if (!list.some((x) => x.rule === f.rule)) list.push({ rule: f.rule });
      }
    }
    return res;
  }
  const by = new Map();
  for (const c of cells) {
    const info = classInfo[c.classroom_id] || { L: 0 };
    const clock = clockOf(info.L, c.period);
    for (const [col, rule] of [['membership_id', 'teacher_overlap'], ['special_room_id', 'room_overlap']]) {
      if (!c[col]) continue;
      const k = `${rule}:${c[col]}:${c.weekday}:${clock}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(c);
    }
  }
  for (const [k, list] of by) {
    if (new Set(list.map((c) => c.classroom_id)).size < 2) continue;
    const rule = k.split(':')[0];
    for (const c of list) {
      const ck = `${c.classroom_id}:${c.weekday}:${c.period}`;
      if (!res.has(ck)) res.set(ck, []);
      res.get(ck).push({ rule });
    }
  }
  return res;
}

function conflictsOf(moved, rest, classInfo) {
  const out = [];
  for (const m of moved) {
    const info = classInfo[m.classroom_id] || { L: 0, P: 12 };
    if (m.period > (info.P || 12)) out.push({ rule: 'out_of_range' });
    const clock = clockOf(info.L, m.period);
    for (const o of rest) {
      if (o.classroom_id === m.classroom_id || o.weekday !== m.weekday) continue;
      const oc = clockOf((classInfo[o.classroom_id] || { L: 0 }).L, o.period);
      if (oc !== clock) continue;
      if (m.membership_id && o.membership_id === m.membership_id) out.push({ rule: 'teacher_overlap' });
      if (m.special_room_id && o.special_room_id === m.special_room_id) out.push({ rule: 'room_overlap' });
    }
  }
  return out;
}
