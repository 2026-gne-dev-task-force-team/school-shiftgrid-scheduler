// 미리 압축한 .br/.gz 가 있으면 Accept-Encoding 에 맞춰 준다(없으면 원본). express.static 앞에 붙인다.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml' };

export function preCompressed(dir) {
  const root = path.resolve(dir);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    const ext = path.extname(rel);
    const type = TYPES[ext];
    if (!type) return next();
    res.vary('Accept-Encoding');
    // 토큰별로 읽는다(q=0 은 거절). shortcut: q 값 순위는 안 따진다 — br 우선 고정
    const ok = new Set(String(req.get('accept-encoding') || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x && !/;\s*q=0(\.0*)?$/.test(x)).map((x) => x.split(';')[0].trim()));
    const file = path.resolve(root, '.' + rel);
    if (!file.startsWith(root + path.sep)) return next();
    for (const [enc, suffix] of [['br', '.br'], ['gzip', '.gz']]) {
      if (!ok.has(enc)) continue;
      if (!fs.existsSync(file + suffix)) continue;
      req.url = req.url.replace(/(\?|$)/, `${suffix}$1`);
      res.set({ 'Content-Encoding': enc, 'Content-Type': type });
      break;
    }
    next();
  };
}
