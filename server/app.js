import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import rateLimit from 'express-rate-limit';
import { secret } from './db.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { orgRouter } from './routes/org.js';
import { auditRouter } from './routes/audit-log.js';
import { rosterRouter } from './routes/roster.js';
import { schoolRouter } from './routes/school.js';
import { loadsRouter } from './routes/loads.js';
import { pinsRouter } from './routes/pins.js';
import { rulesRouter } from './routes/rules.js';
import { timetablesRouter } from './routes/timetables.js';
import { attendanceRouter } from './routes/attendance.js';
import { softWeightsRouter } from './routes/soft-weights.js';
import { substituteRouter } from './routes/substitute.js';
import { bookingRouter } from './routes/booking.js';
import { exportRouter } from './routes/export.js';

const PgStore = connectPgSimple(session);
const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp(pool, opts = {}) {
  const app = express();
  app.disable('x-powered-by');
  // HTTPS 프록시 뒤 전제로 기본 1단. TRUST_PROXY: 숫자(단수) · true/false · loopback 같은 이름·주소 목록.
  const tp = process.env.TRUST_PROXY ?? '1';
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp === 'false' ? false : tp);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Mantine 은 인라인 스타일을 쓴다
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          workerSrc: ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  // NUL 글자(\u0000)는 Postgres text·jsonb 가 못 받아 500 이 난다 — 들어오는 문에서 400 으로(S-sec)
  const hasNul = (v, depth = 0) =>
    depth > 20 ? false
      : typeof v === 'string' ? v.includes('\u0000')
        : v && typeof v === 'object' ? Object.entries(v).some(([k, x]) => k.includes('\u0000') || hasNul(x, depth + 1)) : false;
  app.use((req, res, next) => (hasNul(req.body) || hasNul(req.query) ? res.status(400).json({ error: '입력을 확인해 주세요' }) : next()));

  const sessionSecret = secret('SESSION_SECRET') || (opts.testMode ? 'test-secret' : null);
  if (!sessionSecret) throw new Error('SESSION_SECRET 이 없다');
  app.use(
    session({
      store: new PgStore({ pool, tableName: 'session', pruneSessionInterval: 60 * 15 }),
      secret: sessionSecret.split(','), // 쉼표로 여러 개 — 앞이 새 키, 뒤는 옛 키(교체용)
      name: 'sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: opts.cookieSecure ?? process.env.COOKIE_SECURE !== 'false',
      },
    }),
  );

  // CSRF: 세션에 든 토큰을 헤더로 되돌려 받는다(상태를 바꾸는 요청만)
  app.use((req, res, next) => {
    if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const sent = req.get('x-csrf-token') || '';
    const a = Buffer.from(sent);
    const b = Buffer.from(req.session.csrf);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: '요청을 확인할 수 없습니다. 새로고침 해 주세요.' });
    }
    next();
  });

  // API 응답은 개인·기관 자료라 브라우저·중간 캐시에 남기지 않는다(S-sec2)
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const apiLimit = rateLimit({ windowMs: 60_000, limit: opts.apiLimit ?? 300, standardHeaders: true, legacyHeaders: false });
  app.use('/api', apiLimit);

  app.use('/api/auth', authRouter(pool, opts));
  app.use('/api/admin', adminRouter(pool));
  // 보관 학기의 시간표는 읽기만(데이터 보존). 고치기 요청은 409.
  app.use('/api/orgs/:orgId/timetables/:tid', async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || !/^\d+$/.test(req.params.tid) || !/^\d+$/.test(req.params.orgId)) return next();
    try {
      const { rows } = await pool.query(`SELECT 1 FROM timetable tt JOIN term t ON t.id = tt.term_id WHERE tt.id = $1 AND tt.org_id = $2 AND t.status = '보관'`, [req.params.tid, req.params.orgId]);
      return rows[0] ? res.status(409).json({ error: '보관된 학기의 시간표는 볼 수만 있습니다' }) : next();
    } catch (e) { return next(e); }
  });
  // 보관 학기의 시수·고정 핀·반도 id 로 직접 고치기 거부(같은 409)
  const ARCHIVED_SQL = {
    loads: `SELECT 1 FROM teaching_load x JOIN term t ON t.id = x.term_id WHERE x.id = $1 AND x.org_id = $2 AND t.status = '보관'`,
    pins: `SELECT 1 FROM pin x JOIN term t ON t.id = x.term_id WHERE x.id = $1 AND x.org_id = $2 AND t.status = '보관'`,
    classrooms: `SELECT 1 FROM classroom x JOIN term t ON t.id = x.term_id WHERE x.id = $1 AND x.org_id = $2 AND t.status = '보관'`,
  };
  app.use('/api/orgs/:orgId/:kind/:id', async (req, res, next) => {
    const sql = Object.hasOwn(ARCHIVED_SQL, req.params.kind) && ARCHIVED_SQL[req.params.kind];
    if (!sql || req.method === 'GET' || req.method === 'HEAD' || !/^\d+$/.test(req.params.id) || !/^\d+$/.test(req.params.orgId)) return next();
    try {
      const { rows } = await pool.query(sql, [req.params.id, req.params.orgId]);
      return rows[0] ? res.status(409).json({ error: '보관된 학기는 볼 수만 있습니다' }) : next();
    } catch (e) { return next(e); }
  });
  app.use('/api/orgs/:orgId/roster', rosterRouter(pool));
  app.use('/api/orgs/:orgId', auditRouter(pool));
  app.use('/api/orgs/:orgId', orgRouter(pool));
  app.use('/api/orgs/:orgId', schoolRouter(pool));
  app.use('/api/orgs/:orgId', loadsRouter(pool));
  app.use('/api/orgs/:orgId', pinsRouter(pool));
  app.use('/api/orgs/:orgId', rulesRouter(pool));
  app.use('/api/orgs/:orgId', timetablesRouter(pool));
  app.use('/api/orgs/:orgId', attendanceRouter(pool));
  app.use('/api/orgs/:orgId', softWeightsRouter(pool));
  app.use('/api/orgs/:orgId', substituteRouter(pool, opts));
  app.use('/api/orgs/:orgId', bookingRouter(pool));
  app.use('/api/orgs/:orgId', exportRouter(pool));

  app.use('/api', (req, res) => res.status(404).json({ error: '없습니다' }));

  // 화면 파일 — 해시 붙은 assets 는 1년 캐시
  const dist = process.env.WEB_DIST || path.join(here, '..', 'web', 'dist');
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'), (e) => e && res.status(404).end()));

  // 오류 — 스택 트레이스는 응답에 내지 않는다
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status && err.status < 500 ? err.status : 500).json({ error: '처리하지 못했습니다' });
  });
  return app;
}
