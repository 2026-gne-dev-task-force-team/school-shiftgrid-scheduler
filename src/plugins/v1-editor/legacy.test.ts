// @vitest-environment node
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { V1_EDITOR_SRC } from './frame'

const here = __dirname
const root = join(here, '..', '..', '..')
const legacy = join(here, 'legacy')

function walk(dir: string, base = dir, acc: Record<string, string> = {}) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, base, acc)
    else if (e !== 'MANIFEST.json' && e !== 'PATCHES') acc[p.slice(base.length + 1)] = createHash('sha256').update(readFileSync(p)).digest('hex')
  }
  return acc
}

describe('v1-editor legacy 사본', () => {
  const manifest = JSON.parse(readFileSync(join(legacy, 'MANIFEST.json'), 'utf8')) as { source: string; files: Record<string, string> }
  it('legacy 차이 0 — 파일 목록·해시가 MANIFEST(v1 원본 해시)와 같다', () => {
    expect(walk(legacy)).toEqual(manifest.files)
  })
  it('사본 밖 자산(outside)이 MANIFEST 해시와 같다', () => {
    const out = (manifest as { outside?: Record<string, string> }).outside ?? {}
    expect(Object.keys(out).length).toBeGreaterThan(0)
    for (const [n, h] of Object.entries(out)) expect(createHash('sha256').update(readFileSync(join(here, n))).digest('hex')).toBe(h)
  })
  it('legacy 소스의 상대 import 는 사본 안이거나 outside 로 나르는 파일만 가리킨다(?raw 포함)', () => {
    const out = Object.keys((manifest as { outside?: Record<string, string> }).outside ?? {}).map((o) => join(here, o))
    const re = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]*)['"]/g
    const bad: string[] = []
    for (const n of Object.keys(manifest.files)) {
      if (!/\.(tsx?|jsx?|css)$/.test(n)) continue
      for (const m of readFileSync(join(legacy, n), 'utf8').matchAll(re)) {
        const abs = join(legacy, n, '..', m[1].replace(/\?.*$/, ''))
        if (!abs.startsWith(legacy) && !out.includes(abs)) bad.push(`${n} -> ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('원본 v1 가지에서 온 사본이다(source 기록)', () => {
    expect(manifest.source).toMatch(/^v1@[0-9a-f]{40}$/)
    expect(Object.keys(manifest.files).length).toBeGreaterThan(50)
  })
})

describe('v1-editor iframe 입구', () => {
  it('v1-editor.html 이 entry.ts 를 싣고 root 가 있다', () => {
    const html = readFileSync(join(root, 'v1-editor.html'), 'utf8')
    expect(html).toContain('src="./src/plugins/v1-editor/entry.ts"')
    expect(html).toContain('id="root"')
  })
  it('iframe src 가 입구 html 과 같은 이름이다', () => {
    expect(V1_EDITOR_SRC).toBe('./v1-editor.html')
    expect(existsSync(join(root, V1_EDITOR_SRC))).toBe(true)
  })
  it('vite 다중 입구에 v1-editor 가 있다', () => {
    expect(readFileSync(join(root, 'vite.config.ts'), 'utf8')).toMatch(/'v1-editor':[^}]*v1-editor\.html/)
  })
  it('legacy 입구(App.tsx)가 있다', () => {
    expect(existsSync(join(legacy, 'App.tsx'))).toBe(true)
  })
})

describe('legacy 안 fetch(', () => {
  it('정확히 1곳(ui/feedback/Feedback.tsx) — 새 fetch 가 생기면 걸린다', () => {
    const hits: string[] = []
    const scan = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) scan(p)
        else if (/\.tsx?$/.test(e) && /\bfetch\(/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(legacy.length + 1))
      }
    }
    scan(legacy)
    expect(hits).toEqual(['ui/feedback/Feedback.tsx'])
  })
})
