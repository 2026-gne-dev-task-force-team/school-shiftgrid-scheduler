// @ts-nocheck — 순찰(patrol.mjs) 시험: 가짜 레인 폴더·요청함·집은 카드·임시 git 으로 항목마다 ✅/❌.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { patrol, parseAt, render } from '../patrol/patrol.mjs'

const NOW = new Date('2026-11-12T22:30:00+09:00')
const laneMd = (rows: string) => `# 레인\n\n## 스프린트 1 — 시험 (21:00~)\n\n| 태스크 | 무엇 | 팀 | est_min | 상태 |\n|---|---|---|---|---|\n${rows}\n`
const row = (id: string, state: string) => `| ${id} | 무엇 | 코드 | 7 | ${state} |`
const reqMd = (rs: string, us: string) => `## 🚨 긴급 카드\n\n${us}\n\n## 📥 요청 백로그\n\n| # | 시각 | 원문 | 처방 | 종류 | 상태 |\n|---|---|---|---|---|---|\n${rs}\n`

function world(o: { lane: string; rs?: string; us?: string; picked?: string; subjects?: string[] }) {
  const root = mkdtempSync(join(tmpdir(), 'patrol-'))
  const dirs = join(root, '레인')
  mkdirSync(join(dirs, '작업현황판'), { recursive: true })
  mkdirSync(join(dirs, '요청함'), { recursive: true })
  const lane = join(dirs, '작업현황판', '레인 작업현황판.md')
  writeFileSync(lane, laneMd(o.lane))
  const requests = join(dirs, '요청함', '레인 요청함.md')
  writeFileSync(requests, reqMd(o.rs ?? '', o.us ?? ''))
  writeFileSync(join(dirs, '요청함', '집은 카드.md'), `## 집은 줄\n\n${o.picked ?? ''}\n`)
  const repo = join(root, 'repo')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore' })
  git('init', '-b', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  for (const s of o.subjects ?? ['T-1 시작']) git('commit', '--allow-empty', '-m', s)
  return { cfg: { lane, requests, laneRoot: dirs }, repo, lane }
}
const run = (w: ReturnType<typeof world>, extra = {}) => patrol(w.cfg, { now: NOW, branch: 'main', repo: w.repo, ...extra })
const by = (r, item: string) => r.lines.filter((l) => l.item === item)

describe('parseAt', () => {
  it('시각만이면 오늘, 미래면 하루 전', () => {
    expect(parseAt('22:00', NOW)).toBe(new Date('2026-11-12T22:00:00+09:00').getTime())
    expect(parseAt('23:30', NOW)).toBe(new Date('2026-11-11T23:30:00+09:00').getTime())
    expect(parseAt('11-12 14:23', NOW)).toBe(new Date('2026-11-12T14:23:00+09:00').getTime())
    expect(parseAt('없음', NOW)).toBeNull()
  })
})

describe('1 멈춘 판', () => {
  it('🔄 최근이면 ✅', () => expect(by(run(world({ lane: row('T-1', '🔄 22:20') })), '멈춘 판')[0].verdict).toBe('✅'))
  it('🔄 두 시간 전이면 ❌ · ✅ 뒤따르면 끝난 줄', () => {
    const r = run(world({ lane: `${row('T-1', '🔄 20:00')}\n${row('T-2', '🔄 20:00 → ✅ 20:30')}` }))
    const l = by(r, '멈춘 판')
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ verdict: '❌' })
    expect(l[0].target).toContain('T-1')
  })
})

describe('2 방치 📥', () => {
  it('방금 들어온 📥 는 ✅', () => expect(by(run(world({ lane: row('T-1', '✅'), rs: '| R1 | 11-12 22:00 | 원문 | 처방 | 앱 | 📥 대기 |' })), '방치 📥')[0].verdict).toBe('✅'))
  it('6시간 된 R 은 ❌, 집은 카드에 있으면 뺀다', () => {
    const rs = '| R1 | 11-12 16:00 | 원문 | 처방 | 앱 | 📥 대기 |\n| R2 | 11-12 16:00 | 원문 | 처방 | 앱 | 📥 대기 |'
    const r = run(world({ lane: row('T-1', '✅'), rs, picked: '- R2 · → T-9 · abcd1234 · 17:00' }))
    const l = by(r, '방치 📥')
    expect(l.map((x) => x.target)).toEqual(['R1'])
    expect(l[0].verdict).toBe('❌')
  })
  it('🚨 U 는 🔨 줄 없이 15분 넘으면 문제 · 🔨 있으면 통과', () => {
    const us = '- 🚨 U1 · 22:00 · **할 일** · 📥\n- 🚨 U2 · 22:00 · **할 일** · 📥'
    const l = by(run(world({ lane: row('T-1', '✅'), us, picked: '- U2 · 🔨 abcd1234 · 22:05' })), '방치 📥')
    expect(l.map((x) => [x.target, x.verdict])).toEqual([['🚨 U1', '⚠️']])
  })
})

describe('3 번호 없는 커밋', () => {
  it('번호·merge 꼴이면 ✅', () => expect(by(run(world({ lane: row('T-1', '✅'), subjects: ['T-9z R78', 'merge x', 'fix U3 P1'] })), '번호 없는 커밋')[0].verdict).toBe('✅'))
  it('번호 없으면 그 커밋만 ⚠️', () => {
    const l = by(run(world({ lane: row('T-1', '✅'), subjects: ['T-1 가', '그냥 고침'] })), '번호 없는 커밋')
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ verdict: '⚠️' })
    expect(l[0].basis).toContain('그냥 고침')
  })
})

describe('4 🔨 만 남음', () => {
  it('✅ 줄이 있으면 통과, 없고 1시간 넘으면 문제', () => {
    const picked = '- U1 · 🔨 abcd1234 · 20:00\n- U1 · ✅ c0ffee · 20:30\n- U2 · 🔨 abcd1234 · 20:00\n- U3 · 🔨 abcd1234 · 22:10'
    const l = by(run(world({ lane: row('T-1', '✅'), picked })), '🔨만 남음')
    expect(l.map((x) => [x.target, x.verdict])).toEqual([['U2', '❌']])
  })
  it('다 끝났으면 ✅', () => expect(by(run(world({ lane: row('T-1', '✅'), picked: '- U1 · 🔨 a · 20:00\n- U1 · ✅ b · 20:10' })), '🔨만 남음')[0].verdict).toBe('✅'))
})

describe('5 놀고 있는 병렬', () => {
  const w = () => world({ lane: `${row('T-1', '✅')}\n${row('T-2', '⬜')}` })
  it('기본은 안 본다', () => expect(by(run(w()), '놀고 있는 병렬')).toHaveLength(0))
  it('앞이 ✅ 인데 노트가 오래 그대로면 ❌ · 방금 바뀌었으면 ✅', () => {
    const a = w()
    const old = new Date('2026-11-12T20:00:00+09:00')
    utimesSync(a.lane, old, old)
    expect(by(run(a, { parallel: true }), '놀고 있는 병렬')[0]).toMatchObject({ verdict: '❌' })
    const b = w()
    utimesSync(b.lane, new Date('2026-11-12T22:25:00+09:00'), new Date('2026-11-12T22:25:00+09:00'))
    expect(by(run(b, { parallel: true }), '놀고 있는 병렬')[0].verdict).toBe('✅')
  })
})

describe('요약·표', () => {
  it('요약 꼴과 표 머리', () => {
    const r = run(world({ lane: row('T-1', '🔄 20:00') }))
    expect(r.summary).toMatch(/^⚠️ \d+ · ❌ 1 — 쥔님께 한 줄/)
    expect(render(r).split('\n')[0]).toBe('| 시각 | 항목 | 대상 | 판정 | 근거 |')
  })
  it('다 멀쩡하면 이상 없음', () => expect(run(world({ lane: row('T-1', '✅') })).summary).toContain('이상 없음'))
})
