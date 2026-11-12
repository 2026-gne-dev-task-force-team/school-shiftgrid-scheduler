import { describe, expect, it } from 'vitest'
import { rawFixtures } from '../data.ts'
import { etaMinutes, fmtDur } from './forecast.ts'
import { isPlain } from './plain.ts'
import { purgeStorage, type StorageLike } from './purge.ts'
import { isNewer, parseVersion } from './version.ts'

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init))
  const s: StorageLike & { keys(): string[] } = {
    get length() { return m.size }, key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k), keys: () => [...m.keys()],
  }
  return s
}

describe('저장소 비우기', () => {
  it('우리 접두사만 지우고 다른 앱 키는 남긴다', () => {
    const s = fakeStorage({ 'shiftgrid.v1_2.preview': '1', 'board.calm': '1', 'board.x': '2', 'other.app.x': 'keep' })
    const gone = purgeStorage(s)
    expect(gone.sort()).toEqual(['board.calm', 'board.x', 'shiftgrid.v1_2.preview'])
    expect(s.keys()).toEqual(['other.app.x'])
  })
})

describe('판 번호', () => {
  it('다르면 새 판 · 같거나 읽기 실패면 아님', () => {
    expect(isNewer('a', parseVersion({ build: 'b', at: '', note: '고침' }))).toBe(true)
    expect(isNewer('a', parseVersion({ build: 'a' }))).toBe(false)
    expect(isNewer('a', parseVersion({ build: '' }))).toBe(false)
    expect(isNewer('a', parseVersion('깨짐'))).toBe(false)
  })
})

describe('담백 검사', () => {
  it('비밀 값·경로·이메일 꼴을 거절한다 (의도된 거절 예시)', () => {
    for (const bad of ['sk-abc123', 'eyJhbGciOiJIUzI1NiJ9', 'D:\\a\\b', 'C:/x', '/Users/kim/a', 'me@korea.kr']) expect(isPlain(bad)).toBe(false)
  })
  it('평범한 글은 통과한다', () => {
    for (const ok of ['보결 화면 틀', '목표 60%', '5/7 일감', '🌿 솔이 가지를 땄다']) expect(isPlain(ok)).toBe(true)
  })
  it('fixtures 의 모든 글이 담백하다', () => {
    const bad: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') { if (!isPlain(v)) bad.push(v) }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(rawFixtures)
    expect(bad).toEqual([])
  })
})

describe('속도 계산', () => {
  it('기울기로 다 쓰는 시간을 낸다', () => {
    expect(etaMinutes(32, 20, 30)).toBeCloseTo(170)
    expect(etaMinutes(20, 20, 30)).toBeNull()
  })
  it('시간 글자', () => {
    expect(fmtDur(14)).toBe('14분')
    expect(fmtDur(130)).toBe('2시간 10분')
    expect(fmtDur(3470)).toBe('2일 9시간')
  })
})
