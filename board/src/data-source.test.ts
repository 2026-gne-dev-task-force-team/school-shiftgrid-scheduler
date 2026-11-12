import { expect, it } from 'vitest'
import { loadData, rawFixtures } from './data.ts'
import { agoText, loadLast, saveLast, sourceChip, type Last } from './lib/remote.ts'
import type { BoardData } from './types.ts'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const mockIds = new Set(rawFixtures.actors.map((a) => a.id))
const server = { ...rawFixtures, actors: [{ ...rawFixtures.actors[0], id: 'srv-1' }] } as unknown as BoardData
const hasMock = (d: BoardData) => d.actors.some((a) => mockIds.has(a.id))

it('키 있음 + 첫 읽기 전: 목업 0 · 표가 비고 loading', () => {
  const d = loadData(NOW, null, undefined, { keyed: true, settled: false })
  expect(d.source).toBe('loading')
  expect(hasMock(d)).toBe(false)
  expect([d.actors, d.tasks, d.lanes, d.events, d.usage, d.sprints].every((x) => x.length === 0)).toBe(true)
})

it('키 있음 + 서버 실패 + 마지막 성공 없음: 목업 0 · failed', () => {
  const d = loadData(NOW, { tables: null, feedback: [] }, undefined, { keyed: true, settled: true, last: null })
  expect(d.source).toBe('failed')
  expect(hasMock(d) || d.tasks.length > 0).toBe(false)
})

it('키 있음 + 서버 실패 + 마지막 성공 있음: 그 값 + stale 시각', () => {
  const last: Last = { at: NOW - 5 * 60000, tables: server }
  const d = loadData(NOW, { tables: null, feedback: [] }, undefined, { keyed: true, settled: true, last })
  expect(d.source).toBe('stale')
  expect(d.staleAt).toBe(last.at)
  expect(d.actors.map((a) => a.id)).toEqual(['srv-1'])
  expect(sourceChip(d.source, d.staleAt, NOW)).toBe('서버 못 읽음 · 5분 전 값')
})

it('서버 성공: server 값', () => {
  const d = loadData(NOW, { tables: server, feedback: [] }, undefined, { keyed: true, settled: true })
  expect(d.source).toBe('server')
  expect(d.actors.map((a) => a.id)).toEqual(['srv-1'])
})

it('키 없음(로컬 개발): 목업', () => {
  const d = loadData(NOW, null, undefined, { keyed: false, settled: false })
  expect(d.source).toBe('mock')
  expect(hasMock(d)).toBe(true)
  expect(loadData(NOW).source).toBe('mock')
})

it('마지막 성공 저장·복원 · 깨진 값은 null · 시간 글', () => {
  const mem = new Map<string, string>()
  const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  expect(loadLast(s)).toBeNull()
  saveLast(s, { at: 1, tables: server })
  expect(loadLast(s)?.at).toBe(1)
  s.setItem('board.lastRemote', '{"at":1,"tables":{}}')
  expect(loadLast(s)).toBeNull()
  s.setItem('board.lastRemote', 'x{')
  expect(loadLast(s)).toBeNull()
  expect([agoText(NOW, NOW), agoText(NOW, NOW - 90 * 60000), agoText(NOW, NOW - 3 * 86400000)]).toEqual(['방금', '1시간 전', '3일 전'])
})
