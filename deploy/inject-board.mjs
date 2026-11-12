// 배포 때 v1·v2 페이지에 작업현황판 막대를 주입한다 (R32 2단).
// 현황판은 1.2v-preview 가지의 board/ 를 독립 번들로 한 번 빌드해 site/board/ 에 둔 것이다.
// 번들 진입(board/src/main.ts)은 host 없이 mountBoard() 를 부르므로 판 이름은 <html data-app> 에서 읽힌다
// (readApp(undefined) → document.documentElement). 그래서 마운트 자리는 별도 div 가 아니라 <html> 이다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const MARK = 'data-board-injected'
const APPS = ['v1', '1.2v', 'v2']

/** board 빌드의 index.html 에서 js·css 자산 경로(상대)를 뽑는다. */
export function boardAssets(boardIndexHtml) {
  const tag = (re) => [...boardIndexHtml.matchAll(re)].map((m) => m[1].replace(/^\.\//, '').replace(/^\//, ''))
  const js = tag(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/g)
  const css = tag(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g)
  const pre = tag(/<link[^>]*rel="modulepreload"[^>]*\shref="([^"]+)"/g)
  if (js.length === 0) throw new Error('board index.html 에 module script 가 없다')
  return { js, css, pre }
}

/** 페이지 html 에 현황판을 끼운 새 html 을 돌려준다(순수). prefix = 그 페이지에서 본 board 폴더 상대 경로. */
export function injectBoard(html, { app, prefix, assets }) {
  if (!APPS.includes(app)) throw new Error(`알 수 없는 판: ${app}`)
  if (html.includes(MARK)) return html // 이미 주입됨 — 두 번 불러도 한 번
  if (!/<html[\s>]/i.test(html) || !/<\/head>/i.test(html)) throw new Error('html/head 태그가 없다')
  const p = prefix.endsWith('/') ? prefix : `${prefix}/`
  const tags = [
    `<!-- ${MARK} -->`,
    ...assets.css.map((h) => `<link rel="stylesheet" href="${p}${h}" ${MARK}>`),
    ...assets.pre.map((h) => `<link rel="modulepreload" href="${p}${h}" ${MARK}>`),
    ...assets.js.map((s) => `<script type="module" src="${p}${s}" ${MARK}></script>`),
  ].join('\n    ')
  // <html> 에 data-app — 있으면 갈아 끼운다
  const out = html.replace(/<html([^>]*)>/i, (_, attrs) => `<html${attrs.replace(/\sdata-app="[^"]*"/i, '')} data-app="${app}">`)
  return out.replace(/<\/head>/i, `    ${tags}\n  </head>`)
}

/** 파일에 주입. */
export function injectFile(file, opts) {
  writeFileSync(file, injectBoard(readFileSync(file, 'utf-8'), opts))
}

// CLI: node deploy/inject-board.mjs <site 폴더>   (site/board/index.html 필요)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv[2]
  if (!site) { console.error('사용법: inject-board.mjs <site>'); process.exit(2) }
  const idx = `${site}/board/index.html`
  if (!existsSync(idx)) { console.error(`없음: ${idx}`); process.exit(1) }
  const assets = boardAssets(readFileSync(idx, 'utf-8'))
  injectFile(`${site}/index.html`, { app: 'v1', prefix: './board/', assets })
  injectFile(`${site}/v2/index.html`, { app: 'v2', prefix: '../board/', assets })
  console.log('주입 완료:', JSON.stringify(assets))
}
