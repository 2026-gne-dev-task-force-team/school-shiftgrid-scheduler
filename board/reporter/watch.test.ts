import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error — 보고꾼은 node ESM(.mjs)이라 타입 선언이 없다
import { createWatcher, runCycle, snapshotHash, sourceTargets, HEARTBEAT_MS } from './watch.mjs'
// @ts-expect-error — 위와 같음
import { build } from './snapshot.mjs'

type Cb = (ev: string, name: string | null) => void
const fakeFs = () => {
  const cbs: Cb[] = []
  const watch = (_dir: string, _o: unknown, cb: Cb) => { cbs.push(cb); return { close() {}, on() {} } }
  return { watch, emit: (name: string | null = 'a.md') => cbs.forEach((c) => c('change', name)) }
}

describe('감시 제어(가짜 감시·가짜 시계)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('1초 간격 5번 바뀜 → 싣기 1번(마지막 바뀜 뒤 3초)', async () => {
    const fs = fakeFs(); const exec = vi.fn(async () => {})
    const w = createWatcher({ targets: [{ dir: '/x', recursive: true }], exec, watch: fs.watch, log: () => {} }); w.start()
    for (let i = 0; i < 5; i++) { fs.emit(); await vi.advanceTimersByTimeAsync(1000) }
    expect(exec).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(2000)
    expect(exec).toHaveBeenCalledTimes(1)
    w.stop()
  })
  it('실행 중 바뀜 → 끝나고 한 번 더', async () => {
    const fs = fakeFs(); let release = () => {}; let n = 0
    const exec = vi.fn(() => { n++; return n === 1 ? new Promise<void>((r) => { release = r }) : Promise.resolve() })
    const w = createWatcher({ targets: [{ dir: '/x' }], exec, watch: fs.watch, log: () => {} }); w.start()
    fs.emit(); await vi.advanceTimersByTimeAsync(3000)
    expect(exec).toHaveBeenCalledTimes(1)
    fs.emit(); await vi.advanceTimersByTimeAsync(3000) // 실행 중에 바뀜 — 아직 한 번 더 안 돈다
    expect(exec).toHaveBeenCalledTimes(1)
    release(); await vi.advanceTimersByTimeAsync(0)
    expect(exec).toHaveBeenCalledTimes(2)
    w.stop()
  })
  it('예비 타이머 — 바뀜 없이도 2분마다 돈다 · 필터에 안 맞는 이름은 무시', async () => {
    const fs = fakeFs(); const exec = vi.fn(async () => {})
    const w = createWatcher({ targets: [{ dir: '/x', filter: (n: string) => n.endsWith('.md') }], exec, watch: fs.watch, log: () => {} }); w.start()
    fs.emit('a.tmp'); await vi.advanceTimersByTimeAsync(3000)
    expect(exec).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(120000)
    expect(exec).toHaveBeenCalledTimes(1)
    w.stop()
  })
  it('실행 오류가 나도 감시는 산다', async () => {
    const fs = fakeFs(); const exec = vi.fn(async () => { throw new Error('boom') })
    const w = createWatcher({ targets: [{ dir: '/x' }], exec, watch: fs.watch, log: () => {} }); w.start()
    fs.emit(); await vi.advanceTimersByTimeAsync(3000); fs.emit(); await vi.advanceTimersByTimeAsync(3000)
    expect(exec).toHaveBeenCalledTimes(2)
    w.stop()
  })
})

describe('runCycle — 같으면 안 싣기', () => {
  const mk = (extra: Record<string, unknown> = {}) => ({ actors: [], tasks: [{ id: 'T-1', title: '가' }], usage: [], ...extra })
  const run = (snap: Record<string, unknown>, rec: { hash?: string; at?: string } | null, sinkFn: () => Promise<number>, at = new Date('2026-11-12T01:00:00Z')) => {
    let saved: unknown = null
    return runCycle({ makeSnap: async () => snap, sinkFn, readRec: () => rec, writeRec: (r: unknown) => { saved = r }, now: () => at, log: () => {} }).then((code: unknown) => ({ code, saved }))
  }
  it('첫 판 → 싣고 해시 기록 · 같은 스냅숏 → 0번', async () => {
    const sinkFn = vi.fn(async () => 0)
    const a = await run(mk(), null, sinkFn)
    expect(a.code).toBe(0); expect(sinkFn).toHaveBeenCalledTimes(1)
    const b = await run(mk(), a.saved as { hash: string; at: string }, sinkFn, new Date('2026-11-12T01:02:00Z'))
    expect(b.code).toBe('skip'); expect(sinkFn).toHaveBeenCalledTimes(1)
  })
  it('내용이 바뀌면 싣는다', async () => {
    const sinkFn = vi.fn(async () => 0)
    const a = await run(mk(), null, sinkFn)
    await run(mk({ tasks: [{ id: 'T-2' }] }), a.saved as { hash: string; at: string }, sinkFn, new Date('2026-11-12T01:02:00Z'))
    expect(sinkFn).toHaveBeenCalledTimes(2)
  })
  it('실패하면 해시를 안 남겨 다음에 다시 싣는다', async () => {
    const r = await run(mk(), null, async () => 1)
    expect(r.code).toBe(1); expect(r.saved).toBeNull()
  })
  it('같아도 마지막 성공이 20분 넘으면 한 번 싣는다(멈춤 표지 방지)', async () => {
    const sinkFn = vi.fn(async () => 0)
    const a = await run(mk(), null, sinkFn)
    const later = new Date(Date.parse('2026-11-12T01:00:00Z') + HEARTBEAT_MS + 1000)
    await run(mk(), a.saved as { hash: string; at: string }, sinkFn, later)
    expect(sinkFn).toHaveBeenCalledTimes(2)
  })
})

describe('snapshotHash', () => {
  it('시각 칸(지금 시각 · checked_at)만 다른 스냅숏은 같은 해시', () => {
    const s = (n: string) => ({ usage: [{ ts: n, pct_5h: 1 }], services: [{ id: 's', checked_at: n + 'x' }], tasks: [{ updated_at: n }] })
    expect(snapshotHash(s('A'), 'A')).toBe(snapshotHash(s('B'), 'B'))
    expect(snapshotHash({ ...s('A'), tasks: [{ updated_at: 'C' }] }, 'A')).not.toBe(snapshotHash(s('A'), 'A'))
  })
  it('실제 build() 를 시각만 달리 두 번 돌려도 해시가 같다', () => {
    const md = '# 레인\n'
    const mkb = (now: Date) => build({ md, requestMd: '', now, repoDir: '', usagePath: '', gatePath: '', laneRoot: '', tokens: {}, services: [] })
    const t1 = new Date('2026-11-12T01:00:00Z'); const t2 = new Date('2026-11-12T01:05:00Z')
    expect(snapshotHash(mkb(t1), t1.toISOString())).toBe(snapshotHash(mkb(t2), t2.toISOString()))
  })
})

describe('sourceTargets', () => {
  it('설정의 자리들을 가져온다(레인 폴더 안 파일은 따로 안 건다 · 한도·문지기는 파일명 필터)', () => {
    const cfg = { laneRoot: '/v/레인', lane: '/v/레인/작업현황판/a.md', requests: '/v/레인/요청함/b.md', usage: '/h/.claude/rate-limits.json', gate: '/h/.claude/board/actors.json' }
    const t = sourceTargets(cfg, '/repo', () => true, () => true)
    expect(t.map((x: { dir: string }) => x.dir)).toEqual(['/v/레인', '/h/.claude', '/h/.claude/board', '/repo/.git/refs/heads'])
    expect(t[1].filter('rate-limits.json')).toBe(true); expect(t[1].filter('other.json')).toBe(false)
    expect(t[0].filter('x.md')).toBe(true); expect(t[0].filter('x.png')).toBe(false)
  })
})
