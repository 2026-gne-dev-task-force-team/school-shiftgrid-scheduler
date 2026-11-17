import { describe, it, expect, vi } from 'vitest'
import { watchWaitingWorker, applyWaitingWorker, startSwUpdate, SW_SKIP_WAITING, SW_UPDATE_NOTICE, type SwWorkerLike, type SwRegistrationLike } from './sw-update'

function mkWorker(state = 'installing') {
  const ls: (() => void)[] = []
  const w = { state, posted: [] as unknown[], postMessage(m: unknown) { this.posted.push(m) }, addEventListener(_: 'statechange', fn: () => void) { ls.push(fn) }, fire() { ls.forEach((f) => f()) } }
  return w
}
function mkReg(waiting: SwWorkerLike | null = null) {
  const ls: (() => void)[] = []
  const reg = { waiting, installing: null as SwWorkerLike | null, updates: 0, addEventListener(_: 'updatefound', fn: () => void) { ls.push(fn) }, update: async () => { reg.updates++ }, found() { ls.forEach((f) => f()) } }
  return reg
}
function mkContainer(controller: unknown = {}) {
  const ls: (() => void)[] = []
  return { controller, addEventListener(_: 'controllerchange', fn: () => void) { ls.push(fn) }, change() { ls.forEach((f) => f()) }, register: async () => reg0 }
}
let reg0: ReturnType<typeof mkReg>

describe('sw-update', () => {
  it('새 워커가 installed 되면 한 번만 알린다', () => {
    const reg = mkReg(); const c = mkContainer(); const cb = vi.fn()
    watchWaitingWorker(reg as unknown as SwRegistrationLike, c, cb)
    const w = mkWorker(); reg.installing = w; reg.waiting = w; reg.found()
    expect(cb).not.toHaveBeenCalled()
    w.state = 'installed'; w.fire(); w.fire()
    expect(cb).toHaveBeenCalledTimes(1)
  })
  it('첫 설치(controller 없음)는 안내하지 않는다', () => {
    const reg = mkReg(); const c = mkContainer(null); const cb = vi.fn()
    watchWaitingWorker(reg as unknown as SwRegistrationLike, c, cb)
    const w = mkWorker(); reg.installing = w; reg.found(); w.state = 'installed'; w.fire()
    expect(cb).not.toHaveBeenCalled()
  })
  it('이미 대기 중인 워커가 있으면 바로 알린다', () => {
    const w = mkWorker('installed'); const cb = vi.fn()
    watchWaitingWorker(mkReg(w) as unknown as SwRegistrationLike, mkContainer(), cb)
    expect(cb).toHaveBeenCalledWith(w)
  })
  it('누르면 skipWaiting 메시지 → 새 워커가 쥐면 한 번 새로고침', () => {
    const w = mkWorker('installed'); const c = mkContainer(); const reload = vi.fn()
    applyWaitingWorker(w, c, reload)
    expect(w.posted).toEqual([SW_SKIP_WAITING])
    expect(reload).not.toHaveBeenCalled()
    c.change(); c.change()
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('startSwUpdate — 대기 → 안내 → apply 하면 메시지, 안내 전엔 apply 가 아무 일 없다', async () => {
    reg0 = mkReg(); const c = mkContainer(); const notify = vi.fn(); const reload = vi.fn()
    const { apply } = await startSwUpdate({ container: c, swUrl: './sw.js', notify, reload })
    expect(reg0.updates).toBe(1)
    apply(); expect(notify).not.toHaveBeenCalled()
    const w = mkWorker(); reg0.installing = w; reg0.waiting = w; reg0.found(); w.state = 'installed'; w.fire()
    expect(notify).toHaveBeenCalledWith(SW_UPDATE_NOTICE)
    expect(w.posted).toEqual([])
    apply()
    expect(w.posted).toEqual([SW_SKIP_WAITING])
  })
  it('안내는 자동으로 닫히지 않고(timeout 0) 단추가 명령을 가리킨다', () => {
    expect(SW_UPDATE_NOTICE.timeout).toBe(0)
    expect(SW_UPDATE_NOTICE.action.commandId).toBe('frame.app.update')
  })
})
