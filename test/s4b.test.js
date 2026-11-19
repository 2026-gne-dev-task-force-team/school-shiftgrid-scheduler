import test from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { mergeSettings } from '../server/export/settings.js';
import { lunchShifts } from '../server/export/lunch.js';
import { buildSheets, classSheet } from '../server/export/data.js';
import { makePdf } from '../server/export/pdf.js';
import { makeXlsx } from '../server/export/xlsx.js';
import { makeHwpx } from '../server/export/hwpx.js';
import { makeTemplate, parseRows, readTable } from '../server/export/import.js';

const HAS_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_FILE);
const st = mergeSettings({});
const data = {
  tt: { id: 1, term_id: 1, name: '2학기 확정', status: '확정' },
  classrooms: [{ id: 1, grade: 3, class_no: 1 }, { id: 2, grade: 3, class_no: 2 }],
  subjects: [{ id: 1, name: '창의적체험활동', short_name: '창체' }, { id: 2, name: '과학', short_name: '과' }, { id: 3, name: '체육', short_name: '체' }],
  teachers: [{ id: 1, name: '김담임', duty: '담임' }, { id: 2, name: '박전담', duty: '전담·비교과' }],
  rooms: [{ id: 1, name: '과학실' }],
  cells: [
    { classroom_id: 1, weekday: 1, period: 1, subject_id: 1, membership_id: 1, special_room_id: null },
    { classroom_id: 1, weekday: 1, period: 2, subject_id: 2, membership_id: 2, special_room_id: 1 },
    { classroom_id: 2, weekday: 2, period: 1, subject_id: 3, membership_id: 2, special_room_id: null },
  ],
  periodConfig: { grades: { 3: { periods: 6, lunch: '12:00' } } },
};

test('시트: 창체 파랑 · 전담 빨강 · 과학실 음영 표시가 붙는다', () => {
  const sh = classSheet(data, st, data.classrooms[0]);
  assert.equal(sh.rows[0][1].kind, 'changche');
  assert.equal(sh.rows[1][1].kind, 'specialist');
  assert.equal(sh.rows[1][1].shade, true);
  assert.equal(sh.rows[0][2].text, '');
  assert.equal(buildSheets(data, st, { view: 'teacher' }).length, 2);
  // 기관 설정으로 바꾸면 그대로 따른다(하드코딩 아님)
  const c = mergeSettings({ changcheColor: '#00ff00', shadeRoomKeywords: ['체육관'], lunchMinutes: 9999, shadeColor: 'bad' });
  assert.equal(c.changcheColor, '#00ff00');
  assert.equal(c.lunchMinutes, 40);
  assert.equal(c.shadeColor, st.shadeColor);
  assert.equal(classSheet(data, c, data.classrooms[0]).rows[1][1].shade, false);
});

test('급식 벽시계: 학년별 점심을 교대로 묶고 3교대가 아니면 알림만', () => {
  const r = lunchShifts({ grades: { 1: { lunch: '11:40' }, 2: { lunch: '11:40' }, 3: { lunch: '12:30' }, 4: { lunch: '12:50' }, 5: { periods: 6 } } }, 40);
  assert.equal(r.shifts.length, 3);
  assert.deepEqual(r.shifts[0], { shift: 1, start: '11:40', end: '12:20', grades: [1, 2] });
  assert.deepEqual(r.noLunch, [5]);
  assert.equal(r.notes.length, 1); // 12:30~13:10 과 12:50 이 겹침
  assert.ok(lunchShifts({}).notes.length === 0);
});

test('PDF · 엑셀 · HWPX 바이트 생성 스모크', async () => {
  const sheets = buildSheets(data, st, { view: 'class' });
  const pdf = await makePdf(sheets, st, '2학기 확정');
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 5000, `PDF 크기 ${pdf.length}`); // 한글 글꼴 부분 내장
  const xlsx = await makeXlsx(sheets, st, '2학기 확정');
  assert.equal(xlsx.subarray(0, 2).toString(), 'PK');
  const table = await readTable(xlsx); // 엑셀을 우리가 다시 읽을 수 있다
  assert.ok(table.some((r) => r.includes('월')));
  const hwpx = await makeHwpx(sheets, st, '2학기 확정');
  assert.equal(hwpx.subarray(0, 2).toString(), 'PK');
  const JSZip = (await import('jszip')).default;
  const z = await JSZip.loadAsync(hwpx);
  assert.equal(await z.file('mimetype').async('string'), 'application/hwp+zip');
  const sec = await z.file('Contents/section0.xml').async('string');
  assert.ok(sec.includes('1학년'.replace('1', '3')) && sec.includes('<hp:tbl'));
  assert.ok((await z.file('Contents/header.xml').async('string')).includes(st.changcheColor));
  // S-fix-14: hwpx 범례는 기관 직무 목록에서 만든다
  const sec2 = await (await JSZip.loadAsync(await makeHwpx(sheets, st, 'x', ['담임', '영어전담']))).file('Contents/section0.xml').async('string');
  assert.ok(sec2.includes('영어전담') && !sec2.includes('파랑='));
  // 빈 시간표도 깨지지 않는다
  assert.equal((await makePdf([], st, 'x')).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await makeHwpx([], st, 'x')).subarray(0, 2).toString(), 'PK');
});

test('담임 과목 취합본: 읽은 줄 · 못 읽은 줄(거부 아님) · hwpx 왕복', async () => {
  const ctx = { classrooms: [{ id: 10, grade: 3, class_no: 1 }], subjects: [{ id: 5, name: '체육', short_name: '체' }] };
  const rows = parseRows([['학년', '반', '교과', '주당 시수'], ['3학년', '1반', '체육', '3'], ['3', '9', '체육', '2'], ['3', '1', '춤', 'x']], ctx);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].ok, true);
  assert.deepEqual([rows[0].classroom_id, rows[0].subject_id, rows[0].hours], [10, 5, 3]);
  assert.equal(rows[1].ok, false);
  assert.ok(rows[2].reason.includes('교과') && rows[2].reason.includes('시수'));
  const tpl = await readTable(await makeTemplate());
  assert.equal(parseRows(tpl, ctx).filter((x) => x.ok).length, 1);
  const JSZip = (await import('jszip')).default;
  const z = new JSZip();
  z.file('mimetype', 'application/hwp+zip');
  const tc = (t) => `<hp:tc><hp:subList><hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`;
  const tr = (a) => `<hp:tr>${a.map(tc).join('')}</hp:tr>`;
  z.file('Contents/section0.xml', `<hs:sec><hp:tbl>${tr(['학년', '반', '교과', '시수'])}${tr(['3', '1', '체육', '2'])}</hp:tbl></hs:sec>`);
  const t2 = await readTable(await z.generateAsync({ type: 'nodebuffer' }));
  assert.equal(parseRows(t2, ctx)[0].ok, true);
  await assert.rejects(() => readTable(Buffer.from('not a zip')), /파일이 아닙니다/);
});

test('S-4b 경로: 출력 3종 · 벽시계 · 반 비교 · 취합본 올리기(교직원 막힘)', { skip: !HAS_DB && 'DB 없음 — 건너뜀' }, async (t) => {
  const { createPool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { createApp } = await import('../server/app.js');
  const pool = createPool();
  await migrate(pool);
  const tag = `x${Date.now()}`;
  const hash = await argon2.hash('pw-test-1234');
  const org = (await pool.query(`INSERT INTO org (name, kind, period_config) VALUES ($1, '초', $2) RETURNING id`, [`${tag}-O`, JSON.stringify({ grades: { 3: { periods: 6, lunch: '12:00' }, 4: { periods: 6, lunch: '12:40' } } })])).rows[0].id;
  const mk = async (lid, role, duty) => {
    const u = (await pool.query(`INSERT INTO app_user (name, login_id, password_hash, must_change_password) VALUES ($1,$2,$3,FALSE) RETURNING id`, [lid, `${tag}-${lid}`, hash])).rows[0].id;
    const m = (await pool.query(`INSERT INTO membership (org_id, user_id, role, duty) VALUES ($1,$2,$3,$4) RETURNING id`, [org, u, role, duty ?? null])).rows[0].id;
    return { login: `${tag}-${lid}`, m: Number(m) };
  };
  const adm = await mk('adm', '기관관리자');
  const stf = await mk('stf', '교직원', '담임');
  const term = Number((await pool.query(`INSERT INTO term (org_id, year, semester) VALUES ($1, 2026, 2) RETURNING id`, [org])).rows[0].id);
  const cl = Number((await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no, homeroom_membership_id) VALUES ($1,$2,3,1,$3) RETURNING id`, [org, term, stf.m])).rows[0].id);
  const cl2 = Number((await pool.query(`INSERT INTO classroom (org_id, term_id, grade, class_no) VALUES ($1,$2,3,2) RETURNING id`, [org, term])).rows[0].id);
  const sub = Number((await pool.query(`INSERT INTO subject (org_id, name) VALUES ($1,'체육') RETURNING id`, [org])).rows[0].id);
  const tt = Number((await pool.query(`INSERT INTO timetable (org_id, term_id, name, status, starts_on) VALUES ($1,$2,'확정본','확정','2026-09-01') RETURNING id`, [org, term])).rows[0].id);
  await pool.query(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id) VALUES ($1,$2,$3,1,1,$4,$5)`, [org, tt, cl, sub, stf.m]);
  const app = createApp(pool, { testMode: true, cookieSecure: false, loginLimit: 1000, apiLimit: 10000 });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.close();
    for (const tb of ['teaching_load', 'cell', 'timetable', 'subject', 'classroom', 'term', 'audit_log']) await pool.query(`DELETE FROM ${tb} WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM membership WHERE org_id = $1`, [org]);
    await pool.query(`DELETE FROM app_user WHERE login_id LIKE $1`, [`${tag}-%`]);
    await pool.query(`DELETE FROM org WHERE id = $1`, [org]);
    await pool.end();
  });
  const client = () => {
    let cookie = ''; let csrf = '';
    const call = async (method, path, body, raw) => {
      const res = await fetch(base + path, { method, headers: { 'content-type': raw ? 'application/octet-stream' : 'application/json', cookie, 'x-csrf-token': csrf }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
      const sc = res.headers.getSetCookie?.() ?? [];
      if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
      const buf = Buffer.from(await res.arrayBuffer());
      let json = null; try { json = JSON.parse(buf.toString()); } catch { /* 바이너리 */ }
      if (json?.csrf) csrf = json.csrf;
      return { status: res.status, json, buf, type: res.headers.get('content-type') };
    };
    return { call, login: async (login) => { await call('GET', '/api/auth/session'); return call('POST', '/api/auth/login', { orgId: org, loginId: login, password: 'pw-test-1234' }); } };
  };
  const A = client(); const S = client();
  assert.equal((await A.login(adm.login)).status, 200);
  assert.equal((await S.login(stf.login)).status, 200);
  const P = `/api/orgs/${org}`;

  await t.test('출력 3종은 바이트가 나오고 대상 목록은 확정본이 먼저', async () => {
    const tg = await A.call('GET', `${P}/export/targets`);
    assert.equal(Number(tg.json[0].id), tt);
    assert.equal(tg.json[0].status, '확정');
    for (const [f, magic] of [['pdf', '%PDF-'], ['xlsx', 'PK'], ['hwpx', 'PK']]) {
      const r = await S.call('GET', `${P}/timetables/${tt}/export.${f}`); // 교직원도 내려받기 가능
      assert.equal(r.status, 200, f);
      assert.equal(r.buf.subarray(0, magic.length).toString(), magic);
    }
    assert.equal((await A.call('GET', `${P}/timetables/${tt}/export.docx`)).status, 404);
    assert.equal((await A.call('GET', `${P}/timetables/999999/export.pdf`)).status, 404);
  });

  await t.test('벽시계·반 비교·설정 저장', async () => {
    const l = await A.call('GET', `${P}/lunch-clock`);
    assert.equal(l.json.shifts.length, 2);
    assert.ok(l.json.notes.length >= 1); // 3교대 아님 — 알림만
    const c = await A.call('GET', `${P}/timetables/${tt}/compare?a=${cl}&b=${cl2}`);
    assert.equal(c.status, 200);
    assert.equal(c.json.sheets.length, 2);
    assert.equal(c.json.sheets[0].rows[0][1].text.includes('체'), true); // 실제 칸이 실린다
    assert.equal((await S.call('PUT', `${P}/export/settings`, { lunchMinutes: 30 })).status, 404);
    assert.equal((await A.call('PUT', `${P}/export/settings`, { lunchMinutes: 30, shadeColor: '#aaaaaa' })).json.lunchMinutes, 30);
    assert.equal((await A.call('GET', `${P}/lunch-clock`)).json.shifts[0].end, '12:30');
    assert.equal((await A.call('PUT', `${P}/export/settings`, { shadeColor: 'red' })).status, 400);
  });

  await t.test('담임 과목 올리기: 못 읽은 줄은 빨강(거부 아님) · 읽힌 줄만 반영 · 교직원 404', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('a');
    ws.addRow(['학년', '반', '교과', '시수']); ws.addRow([3, 1, '체육', 2]); ws.addRow([3, 7, '체육', 2]);
    const file = Buffer.from(await wb.xlsx.writeBuffer());
    assert.equal((await S.call('POST', `${P}/homeroom-subjects/preview`, null, file)).status, 404);
    const pv = await A.call('POST', `${P}/homeroom-subjects/preview`, null, file);
    assert.equal(pv.status, 200);
    assert.deepEqual([pv.json.ok, pv.json.unread], [1, 1]);
    assert.equal((await A.call('POST', `${P}/homeroom-subjects/preview`, null, Buffer.from('zzzz'))).status, 400);
    const ap = await A.call('POST', `${P}/homeroom-subjects/apply`, { rows: pv.json.rows.filter((x) => x.ok).map((x) => ({ classroom_id: x.classroom_id, subject_id: x.subject_id, hours: x.hours })) });
    assert.equal(ap.json.applied, 1);
    await A.call('POST', `${P}/homeroom-subjects/apply`, { rows: [{ classroom_id: cl, subject_id: sub, hours: 4 }] }); // 다시 올리면 시수만 바뀜
    const rows = (await pool.query(`SELECT weekly_hours, membership_id FROM teaching_load WHERE org_id = $1`, [org])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].weekly_hours, 4);
    assert.equal(Number(rows[0].membership_id), stf.m);
  });
});
