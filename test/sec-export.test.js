// S-sec2 2: 내보내기(PDF·엑셀·HWPX) 내용 노출 · 파일 이름 헤더 · 권한·기관 경계.
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { HAS_DB, setup } from './sec-helpers.js';
import { seal } from '../server/seal.js';

const SECRET_REASON = 'ZZ비밀사유ZZ';
const dec = (b) => b.toString('utf8');

test('내보내기', { skip: !HAS_DB && 'DB 없음' }, async (t) => {
  const f = await setup(t);
  const { pool, A, B } = f;
  const oA = `/api/orgs/${f.orgA}`;
  const q = (sql, a) => pool.query(sql, a);

  // A 시간표에 A 것 한 칸 + 남의 기관(B) 자원을 가리키는 오염 칸을 일부러 심는다(깨진 참조가 새는가)
  await q(`UPDATE subject SET name = 'A과목-표식', short_name = 'A표' WHERE id = $1`, [A.subject]);
  await q(`UPDATE subject SET name = 'B과목-표식', short_name = 'B표' WHERE id = $1`, [B.subject]);
  await q(`UPDATE special_room SET name = 'B실-표식' WHERE id = $1`, [B.room]);
  await q(`UPDATE app_user SET name = 'B교사-표식' WHERE id = $1`, [f.users.adminB.uid]);
  await q(`UPDATE app_user SET name = 'A교사-표식' WHERE id = $1`, [f.users.staffA.uid]);
  await q(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id) VALUES ($1,$2,$3,1,1,$4,$5)`, [f.orgA, A.tt, A.class, A.subject, f.users.staffA.mid]);
  await q(`INSERT INTO cell (org_id, timetable_id, classroom_id, weekday, period, subject_id, membership_id, special_room_id) VALUES ($1,$2,$3,1,2,$4,$5,$6)`, [f.orgA, A.tt, A.class, B.subject, f.users.adminB.mid, B.room]);
  // 암호화 사유·메모
  await q(`UPDATE substitute SET reason_enc = $2, reason_kind = '연가' WHERE id = $1`, [A.sub, seal(SECRET_REASON)]);
  await q(`UPDATE attendance SET memo_enc = $2 WHERE id = $1`, [B.att, seal(SECRET_REASON)]);

  const staff = await f.as('staffA');
  const get = async (c, p) => {
    const res = await fetch(f.base + p, { headers: { cookie: c.cookie } });
    return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  };

  const forbidden = [SECRET_REASON, 'B과목', 'B표', 'B실-표식', 'B교사', f.tag + '-', 'argon2', '$argon', 'password', 'login_id', 'B시간표'];
  const scan = (name, text) => {
    for (const w of forbidden) assert.ok(!text.includes(w), `${name} 에 "${w}" 노출`);
  };

  await t.test('엑셀: 글자 전체에 남의 기관·사유·계정 정보가 없다 · 내 자료는 있다', async () => {
    const r = await get(staff, `${oA}/timetables/${A.tt}/export.xlsx`);
    assert.equal(r.status, 200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
    let all = '';
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { all += `${c.value}\n`; })));
    all += `${wb.title}|${wb.creator}|${wb.lastModifiedBy}|${wb.company ?? ''}`;
    assert.match(all, /A표/); assert.match(all, /A교사-표식/);
    scan('xlsx', all);
    // 압축 안 풀린 부속 파일(docProps 등)도 훑는다
    const z = await JSZip.loadAsync(r.buf);
    for (const n of Object.keys(z.files)) if (!z.files[n].dir) scan(`xlsx:${n}`, await z.files[n].async('string'));
  });

  await t.test('HWPX: 모든 부속 파일에 남의 기관·사유·계정 정보가 없다', async () => {
    for (const q2 of ['', '?view=teacher']) {
      const r = await get(staff, `${oA}/timetables/${A.tt}/export.hwpx${q2}`);
      assert.equal(r.status, 200);
      const z = await JSZip.loadAsync(r.buf);
      let all = '';
      for (const n of Object.keys(z.files)) if (!z.files[n].dir) { const s = await z.files[n].async('string'); all += s; scan(`hwpx:${n}`, s); }
      assert.match(all, /A표/);
    }
  });

  await t.test('PDF: 원본 바이트·메타(제목·작성자)에 남의 기관·사유·계정 정보가 없다', async () => {
    const r = await get(staff, `${oA}/timetables/${A.tt}/export.pdf`);
    assert.equal(r.status, 200);
    assert.equal(dec(r.buf.subarray(0, 5)), '%PDF-');
    // 글꼴이 부분집합이라 본문은 글자로 못 찾는다 — 바이트 전체와 메타만 훑는다(본문은 같은 시트 자료를 쓰는 엑셀·HWPX 가 대신 증명)
    scan('pdf', r.buf.toString('latin1'));
    scan('pdf-utf16', Buffer.from(r.buf.toString('latin1')).toString('utf16le'));
  });

  await t.test('다른 기관 시간표·없는 시간표는 어느 형식이든 404 · 본문에 남의 것 없음', async () => {
    for (const fmt of ['pdf', 'xlsx', 'hwpx']) {
      for (const tid of [B.tt, 999999999]) {
        const r = await get(staff, `${oA}/timetables/${tid}/export.${fmt}`);
        assert.equal(r.status, 404, `${fmt} ${tid}`);
        assert.ok(!r.buf.toString().includes('B시간표'));
      }
    }
    // 남의 기관 경로로 부르면 내 세션은 막힌다
    const oB = `/api/orgs/${f.orgB}`;
    for (const fmt of ['pdf', 'xlsx', 'hwpx']) assert.ok([403, 404].includes((await get(staff, `${oB}/timetables/${B.tt}/export.${fmt}`)).status));
    for (const p of [`${oB}/export/targets`, `${oB}/export/settings`, `${oB}/lunch-clock`, `${oB}/timetables/${B.tt}/compare?a=${B.class}&b=${B.class}`]) assert.ok([403, 404].includes((await get(staff, p)).status), p);
    // 내 기관 시간표를 이용해 남의 반·교사를 지정(id=)해도 남의 것이 안 나온다
    for (const fmt of ['xlsx']) {
      for (const v of ['class', 'teacher']) {
        const r = await get(staff, `${oA}/timetables/${A.tt}/export.${fmt}?view=${v}&id=${v === 'class' ? B.class : f.users.adminB.mid}`);
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf);
        let all = ''; wb.eachSheet((ws) => { all += ws.name; ws.eachRow((row) => row.eachCell((c) => { all += `${c.value}\n`; })); });
        scan(`xlsx id=${v}`, all);
      }
    }
    // 반 비교에 남의 반
    assert.equal((await get(staff, `${oA}/timetables/${A.tt}/compare?a=${A.class}&b=${B.class}`)).status, 404);
  });

  await t.test('반 비교 JSON · 출력 설정 · 대상 목록에도 남의 것·사유가 없다', async () => {
    for (const p of [`${oA}/timetables/${A.tt}/compare?a=${A.class}&b=${A.class}`, `${oA}/export/targets`, `${oA}/export/settings`, `${oA}/lunch-clock`]) {
      const r = await get(staff, p);
      assert.equal(r.status, 200, p);
      scan(p, r.buf.toString());
    }
  });

  await t.test('파일 이름: 시간표 이름에 경로·따옴표·줄바꿈을 넣어도 Content-Disposition 이 안 깨진다', async () => {
    const evil = ['../../etc/passwd', '..\\..\\win.ini', 'a"; filename="evil.exe', "x'y(z)*", 'line1\r\nX-Injected: 1', '한글/이름?*:<>|', '%2e%2e%2f', '‮fdp.exe'];
    for (const [i, name] of evil.entries()) {
      const id = (await q(`INSERT INTO timetable (org_id, term_id, name) VALUES ($1,$2,$3) RETURNING id`, [f.orgA, A.term, name])).rows[0].id;
      for (const fmt of ['pdf', 'xlsx', 'hwpx']) {
        const r = await get(staff, `${oA}/timetables/${id}/export.${fmt}`);
        assert.equal(r.status, 200, `${i} ${fmt} → ${r.status}`);
        assert.equal(r.headers.get('x-injected'), null, `${i}: 헤더 주입`);
        const cd = r.headers.get('content-disposition');
        assert.match(cd, /^attachment; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''[A-Za-z0-9%._~!-]*$/, `${i} ${fmt}: ${cd}`);
        const star = decodeURIComponent(cd.split("filename*=UTF-8''")[1]);
        assert.ok(!/[\\/]/.test(star), `${i}: 복원한 이름에 경로 문자 "${star}"`);
        assert.ok(!/["\r\n]/.test(star), `${i}: 복원한 이름에 따옴표·줄바꿈`);
        assert.ok(!/‮/.test(star), `${i}: 방향 바꿈 글자`);
      }
    }
  });

  await t.test('권한: 보기만은 내려받기 가능하나 편집·관리자 전용(출력 설정 쓰기·담임 과목 양식·올리기)은 막힌다(404 로 감춤)', async () => {
    const view = await f.as('viewA');
    assert.equal((await get(view, `${oA}/timetables/${A.tt}/export.xlsx`)).status, 200);
    for (const [m, p, b] of [['PUT', '/export/settings', { lunchMinutes: 30 }], ['POST', '/homeroom-subjects/apply', { rows: [] }]]) {
      assert.equal((await view.call(m, oA + p, b)).status, 404, `보기만 ${m} ${p}`);
      assert.equal((await staff.call(m, oA + p, b)).status, 404, `교직원 ${m} ${p}`);
    }
    for (const c of [view, staff]) {
      assert.equal((await get(c, `${oA}/homeroom-subjects/template`)).status, 404);
      const up = await c.call('POST', `${oA}/homeroom-subjects/preview`, Buffer.from('x'), { 'content-type': 'application/octet-stream' });
      assert.equal(up.status, 404);
    }
    // 로그인 안 한 사람
    for (const p of [`${oA}/timetables/${A.tt}/export.xlsx`, `${oA}/export/targets`]) {
      const r = await fetch(f.base + p);
      assert.equal(r.status, 404, p); // 권한 없음은 404 로 감춘다(guard.js)
    }
  });

  await t.test('겸임(A 교직원·B 관리자): A 세션으로는 B 관리자 출력을 못 얻는다', async () => {
    const d = await f.as('dual', f.orgA);
    assert.equal((await d.call('PUT', `${oA}/export/settings`, { lunchMinutes: 30 })).status, 404);
    assert.equal((await get(d, `/api/orgs/${f.orgB}/timetables/${B.tt}/export.xlsx`)).status, 404);
  });
});
