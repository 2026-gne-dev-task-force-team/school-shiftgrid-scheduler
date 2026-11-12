// 배포 직전, 지금 공개 중인 사이트의 각 판 index 가 (재귀로) 부르는 assets/ 파일 중
// 새 산출물에 없는 것만 site/ 에 합친다 — 묵은 index(Pages max-age=600·서비스워커)가 옛 해시 파일을 불러도 404 백지가 안 나게.
// 쓰기: node deploy/keep-prev-assets.mjs <siteDir> <공개주소 예: https://o.github.io/r/>
// 상한: 「지금 공개 판의 index 에서 닿는 파일」만 가져오므로 직전 한 판이다(지난 판이 남긴 파일은 index 에서 안 닿아 다음 판에 버려진다).
// 실패는 전부 경고 — 이 스크립트 때문에 배포가 죽으면 안 된다.
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APPS = ['', 'v1.2/', 'v2/'] // 루트 v1 · 1.2v · v2
const EXT = 'js|mjs|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|json|wasm|mp3|ico'
const REF = new RegExp(`["'(=]\\s*((?:\\.{1,2}/|/)?[\\w\\-.@/]*[\\w\\-@]\\.(?:${EXT}))(?=["')\\s>?#])`, 'g')
const TEXT = /\.(?:html|js|mjs|css)$/

/** 본문에서 참조 후보를 URL 로 푼다. ./ ../ 는 파일 기준, / 는 도메인 기준, 맨몸(assets/x.js)은 판 루트 기준(vite base). */
export function refs(text, fileUrl, appUrl) {
  const out = new Set()
  for (const m of text.matchAll(REF)) {
    const s = m[1]
    try {
      const u = s.startsWith('.') || s.startsWith('/') ? new URL(s, s.startsWith('/') ? fileUrl : fileUrl) : new URL(s, appUrl)
      out.add(u.href)
    } catch { /* 무시 */ }
  }
  return [...out]
}

export async function keepPrevAssets({ siteDir, baseUrl, fetchFn = fetch, apps = APPS, maxFiles = 400, log = console }) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
  const added = []
  for (const app of apps) {
    const appUrl = new URL(app, base).href
    try {
      const seen = new Set()
      const queue = [appUrl + 'index.html']
      while (queue.length && added.length < maxFiles) {
        const href = queue.shift()
        if (seen.has(href)) continue
        seen.add(href)
        const u = new URL(href)
        if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) continue
        const rel = decodeURIComponent(u.pathname.slice(base.pathname.length))
        const isIndex = href === appUrl + 'index.html'
        if (!isIndex && !rel.includes('assets/')) continue
        const dest = path.resolve(siteDir, rel)
        if (!dest.startsWith(path.resolve(siteDir) + path.sep)) continue
        const exists = await access(dest).then(() => true, () => false)
        if (exists && !isIndex) continue // 새 산출물에 이미 있다 — 건드리지 않는다(cp -n)
        const res = await fetchFn(href)
        if (!res.ok) { if (!isIndex) log.warn?.(`옛 자산 없음(${res.status}): ${rel}`); continue }
        if (isIndex || TEXT.test(rel)) {
          const body = await res.text()
          if (!isIndex) { await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, body); added.push(rel) }
          for (const r of refs(body, href, appUrl)) queue.push(r)
        } else {
          await mkdir(path.dirname(dest), { recursive: true })
          await writeFile(dest, Buffer.from(await res.arrayBuffer()))
          added.push(rel)
        }
      }
    } catch (e) {
      log.warn?.(`::warning::옛 자산 보존 실패(${app || '루트'}): ${e.message}`)
    }
  }
  return added
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [siteDir, baseUrl] = process.argv.slice(2)
  try {
    if (!siteDir || !baseUrl) throw new Error('사용: keep-prev-assets.mjs <siteDir> <baseUrl>')
    const added = await keepPrevAssets({ siteDir, baseUrl })
    console.log(`옛 자산 ${added.length}개 보존`)
    added.forEach((a) => console.log('  +', a))
  } catch (e) {
    console.warn(`::warning::옛 자산 보존 건너뜀: ${e.message}`)
  }
}
