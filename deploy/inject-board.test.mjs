// node --test deploy/inject-board.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { boardAssets, injectBoard, MARK } from './inject-board.mjs'

const BOARD = `<!doctype html><html><head><script type="module" crossorigin src="./assets/index-abc.js"></script><link rel="modulepreload" href="./assets/x-1.js"><link rel="stylesheet" crossorigin href="./assets/index-def.css"></head><body></body></html>`
const PAGE = `<!doctype html>\n<html lang="ko">\n  <head>\n    <title>t</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>`
const assets = boardAssets(BOARD)

test('자산 추출', () => {
  assert.deepEqual(assets, { js: ['assets/index-abc.js'], css: ['assets/index-def.css'], pre: ['assets/x-1.js'] })
})
test('v1: html 에 data-app, 상대 경로 태그', () => {
  const o = injectBoard(PAGE, { app: 'v1', prefix: './board/', assets })
  assert.match(o, /<html lang="ko" data-app="v1">/)
  assert.ok(o.includes('src="./board/assets/index-abc.js"'))
  assert.ok(o.includes('href="./board/assets/index-def.css"'))
  assert.ok(o.indexOf(MARK) < o.indexOf('</head>'))
})
test('v2: ../board/ 접두', () => {
  const o = injectBoard(PAGE, { app: 'v2', prefix: '../board', assets })
  assert.ok(o.includes('src="../board/assets/index-abc.js"'))
  assert.match(o, /data-app="v2"/)
})
test('두 번 불러도 한 번', () => {
  const a = injectBoard(PAGE, { app: 'v1', prefix: './board/', assets })
  assert.equal(injectBoard(a, { app: 'v1', prefix: './board/', assets }), a)
  assert.equal(a.split('index-abc.js').length - 1, 1)
})
test('기존 data-app 은 갈아 끼운다', () => {
  const o = injectBoard(PAGE.replace('<html lang="ko">', '<html lang="ko" data-app="x">'), { app: 'v2', prefix: './b/', assets })
  assert.equal(o.match(/data-app="/g).length, 1)
  assert.match(o, /data-app="v2"/)
})
test('잘못된 입력은 던진다', () => {
  assert.throws(() => injectBoard(PAGE, { app: 'zz', prefix: './', assets }))
  assert.throws(() => injectBoard('<p>x</p>', { app: 'v1', prefix: './', assets }))
  assert.throws(() => boardAssets('<html></html>'))
})
