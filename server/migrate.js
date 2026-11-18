import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.js';

export async function migrate(pool) {
  // 시험 파일 여럿이 동시에 migrate 해도 부딪히지 않게 DB 잠금으로 한 줄 세운다(T-hk5)
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727001)');
    await migrateBody(c);
  } finally {
    await c.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    c.release();
  }
}

async function migrateBody(pool) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
  // 판마다 표를 더할 때는 server/migrations/<판>.sql 로 따로 둔다(병렬 판 충돌 방지 · 이름 순 적용 · IF NOT EXISTS 로 멱등)
  const mdir = path.join(dir, 'migrations');
  if (fs.existsSync(mdir)) {
    for (const f of fs.readdirSync(mdir).filter((n) => n.endsWith('.sql')).sort()) {
      await pool.query(fs.readFileSync(path.join(mdir, f), 'utf8'));
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool();
  // DB 가 막 뜬 직후일 수 있어 몇 번 다시 시도한다
  let last;
  for (let i = 0; i < 20; i++) {
    try {
      await migrate(pool);
      console.log('스키마 적용 완료');
      last = null;
      break;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  await pool.end();
  if (last) {
    console.error('스키마 적용 실패:', last.message);
    process.exit(1);
  }
}
