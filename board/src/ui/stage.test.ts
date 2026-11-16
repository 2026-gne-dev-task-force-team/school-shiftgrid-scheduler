// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStage } from './stage.ts'

const 층 = (desc: string) => ({ id: 'x', desc, render() {} }) as never

describe('설명 줄 타자기 (R89)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  const 돌린다 = (reduce: boolean, ms: number) => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', () => ({ matches: reduce }))
    const s = createStage()
    s.show(층('가'.repeat(100)), {} as never)
    vi.advanceTimersByTime(ms)
    return s.el.querySelector('.tab-desc')!.textContent!.length
  }
  it('0.5초 안에 다 써진다', () => expect(돌린다(false, 500)).toBe(100))
  it('시스템 움직임 줄이기면 즉시 전부', () => expect(돌린다(true, 0)).toBe(100))
})
