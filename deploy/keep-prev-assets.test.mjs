// node --test deploy/keep-prev-assets.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { keepPrevAssets, refs } from './keep-prev-assets.mjs'

const BASE = 'https://o.github.io/r/'
const quiet = { warn() {} }
const fakeFetch = (map) => async (href) => {
  const v = map[href]
  return v === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, text: async () => v, arrayBuffer: async () => Buffer.from(v) }
}
const has = (p) => access(p).then(() => true, () => false)
async function site(files) {
  const d = await mkdtemp(path.join(tmpdir(), 'kpa-'))
  for (const [f, c] of Object.entries(files)) { await mkdir(path.dirname(path.join(d, f)), { recursive: true }); await writeFile(path.join(d, f), c) }
  return d
}
const OLD = {
  [BASE + 'index.html']: '<script src="/r/assets/main-OLD.js"></script><link href="./assets/a-OLD.css">',
  [BASE + 'assets/main-OLD.js']: 'import("./chunk-OLD.js");x("assets/pre-OLD.js")',
  [BASE + 'assets/chunk-OLD.js']: 'chunk',
  [BASE + 'assets/pre-OLD.js']: 'pre',
  [BASE + 'assets/a-OLD.css']: 'a{background:url(./font-OLD.woff2)}',
  [BASE + 'assets/font-OLD.woff2']: 'font',
  [BASE + 'v1.2/index.html']: '<script src="/r/v1.2/assets/main-DWe.js"></script>',
  [BASE + 'v1.2/assets/main-DWe.js']: 'js12',
}

test('refs: 파일 기준·도메인 기준·판 루트 기준', () => {
  const r = refs('import("./c.js");f("assets/p.js");g("/r/assets/m.js")', BASE + 'v2/assets/x.js', BASE + 'v2/')
  assert.deepEqual(r.sort(), [BASE + 'assets/m.js', BASE + 'v2/assets/c.js', BASE + 'v2/assets/p.js'].sort())
})
test('옛 자산을 재귀로 가져온다(새 산출물에 없는 것만)', async () => {
  const d = await site({ 'index.html': 'new', 'assets/main-NEW.js': 'n', 'assets/chunk-OLD.js': 'KEEP-NEW-COPY' })
  const added = await keepPrevAssets({ siteDir: d, baseUrl: BASE, fetchFn: fakeFetch(OLD), log: quiet })
  assert.ok(await has(path.join(d, 'assets/main-OLD.js')))
  assert.ok(await has(path.join(d, 'assets/pre-OLD.js')))
  assert.ok(await has(path.join(d, 'assets/font-OLD.woff2')))
  assert.ok(await has(path.join(d, 'v1.2/assets/main-DWe.js')))
  assert.equal(await readFile(path.join(d, 'assets/chunk-OLD.js'), 'utf8'), 'KEEP-NEW-COPY') // 덮지 않음
  assert.equal(await readFile(path.join(d, 'index.html'), 'utf8'), 'new') // index 는 새 판 그대로
  assert.ok(!added.includes('assets/chunk-OLD.js'))
  assert.ok(!(await has(path.join(d, 'assets/main-NEW.js.bak'))))
})
test('못 받으면 경고만, 던지지 않는다', async () => {
  const d = await site({ 'index.html': 'new' })
  const added = await keepPrevAssets({ siteDir: d, baseUrl: BASE, fetchFn: async () => { throw new Error('net') }, log: quiet })
  assert.deepEqual(added, [])
})
test('assets/ 밖·도메인 밖·상위 경로 탈출은 안 받는다', async () => {
  const d = await site({ 'index.html': 'new' })
  const map = { [BASE + 'index.html']: '<script src="/r/sw.js"></script><script src="https://evil.com/assets/x.js"></script><script src="../../assets/e.js"></script>', [BASE + 'sw.js']: 's', 'https://evil.com/assets/x.js': 'x' }
  const added = await keepPrevAssets({ siteDir: d, baseUrl: BASE, fetchFn: fakeFetch(map), log: quiet })
  assert.deepEqual(added, [])
})
test('상한(maxFiles)', async () => {
  const d = await site({ 'index.html': 'new' })
  const added = await keepPrevAssets({ siteDir: d, baseUrl: BASE, fetchFn: fakeFetch(OLD), log: quiet, maxFiles: 2 })
  assert.ok(added.length <= 3)
})
