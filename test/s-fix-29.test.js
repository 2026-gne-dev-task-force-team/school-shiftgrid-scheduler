// S-fix-29: 미리 압축 정적 제공 — Accept-Encoding 에 맞춰 .br/.gz, 없으면 원본(Vary 항상)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import { preCompressed } from '../server/precompressed.js';

test('미리 압축 정적 제공', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));
  const body = 'console.log("hi");'.repeat(50);
  fs.writeFileSync(path.join(dir, 'a.js'), body);
  fs.writeFileSync(path.join(dir, 'a.js.gz'), zlib.gzipSync(body));
  fs.writeFileSync(path.join(dir, 'a.js.br'), zlib.brotliCompressSync(body));
  fs.writeFileSync(path.join(dir, 'b.js'), body); // 압축본 없음
  const app = express();
  app.use(preCompressed(dir));
  app.use(express.static(dir));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const get = (p, ae) => fetch(`http://127.0.0.1:${server.address().port}${p}`, { headers: ae ? { 'accept-encoding': ae } : { 'accept-encoding': 'identity' } });

  let r = await get('/a.js', 'gzip, br');
  assert.equal(r.headers.get('content-encoding'), 'br');
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(r.headers.get('vary'), /Accept-Encoding/i);
  assert.equal(await r.text(), body);
  r = await get('/a.js', 'gzip');
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.equal(await r.text(), body);
  r = await get('/a.js', 'br;q=0, gzip');
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  r = await get('/a.js');
  assert.equal(r.headers.get('content-encoding'), null);
  assert.match(r.headers.get('vary'), /Accept-Encoding/i);
  assert.equal(await r.text(), body);
  r = await get('/b.js', 'br, gzip');
  assert.equal(r.headers.get('content-encoding'), null);
  assert.equal(await r.text(), body);
  r = await get('/..%2f..%2fetc/a.js', 'br');
  assert.notEqual(r.headers.get('content-encoding'), 'br');
});
