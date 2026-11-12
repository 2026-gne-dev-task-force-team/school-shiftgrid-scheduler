import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { connectRealtime, realtimeUrl } from './realtime.ts'

class FakeWS {
  static all: FakeWS[] = []
  readyState = 0; sent: Record<string, unknown>[] = []
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null; onerror: (() => void) | null = null
  url: string
  constructor(url: string) { this.url = url; FakeWS.all.push(this) }
  send(s: string) { this.sent.push(JSON.parse(s)) }
  close() { this.readyState = 3; this.onclose?.() }
  open() { this.readyState = 1; this.onopen?.() }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }) }
}
const WS = FakeWS as unknown as new (u: string) => WebSocket
const env = { url: 'https://abc.supabase.co', key: 'K' }
const change = { topic: 'realtime:board', event: 'postgres_changes', payload: {} }
const ok = { topic: 'realtime:board', event: 'phx_reply', payload: { status: 'ok' } }

beforeEach(() => { FakeWS.all = []; vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

it('키가 없으면 소켓을 열지 않는다', () => {
  expect(connectRealtime({ onChange() {}, WS })).toBeNull()
  expect(connectRealtime({ url: env.url, onChange() {}, WS })).toBeNull()
  expect(FakeWS.all).toHaveLength(0)
})

it('주소와 join 메시지 꼴', () => {
  expect(realtimeUrl(env.url, 'K')).toBe('wss://abc.supabase.co/realtime/v1/websocket?apikey=K&vsn=1.0.0')
  connectRealtime({ ...env, onChange() {}, WS })
  const s = FakeWS.all[0]
  expect(s.url).toContain('vsn=1.0.0')
  s.open()
  expect(s.sent[0]).toMatchObject({ topic: 'realtime:board', event: 'phx_join',
    payload: { config: { postgres_changes: [{ event: '*', schema: 'board' }] } } })
})

it('30초마다 heartbeat', () => {
  connectRealtime({ ...env, onChange() {}, WS })
  FakeWS.all[0].open()
  vi.advanceTimersByTime(60_000)
  expect(FakeWS.all[0].sent.filter((m) => m.event === 'heartbeat')).toHaveLength(2)
})

it('알림 여러 개 → debounce 뒤 다시 읽기 1회, join 응답이 오면 실시간 켜짐', () => {
  const onChange = vi.fn(), onStatus = vi.fn()
  connectRealtime({ ...env, onChange, onStatus, WS })
  const s = FakeWS.all[0]; s.open(); s.recv(ok)
  expect(onStatus).toHaveBeenLastCalledWith(true)
  s.recv(change); vi.advanceTimersByTime(400); s.recv(change); s.recv(change)
  vi.advanceTimersByTime(999)
  expect(onChange).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(onChange).toHaveBeenCalledTimes(1)
})

it('끊기면 지수 물러서기로 다시 붙고 성공하면 물러서기 초기화', () => {
  const onStatus = vi.fn()
  connectRealtime({ ...env, onChange() {}, onStatus, WS })
  FakeWS.all[0].open(); FakeWS.all[0].recv(ok)
  FakeWS.all[0].close()
  expect(onStatus).toHaveBeenLastCalledWith(false)
  vi.advanceTimersByTime(999); expect(FakeWS.all).toHaveLength(1)
  vi.advanceTimersByTime(1); expect(FakeWS.all).toHaveLength(2)
  FakeWS.all[1].close() // 열리기 전에 또 실패 → 2초
  vi.advanceTimersByTime(1999); expect(FakeWS.all).toHaveLength(2)
  vi.advanceTimersByTime(1); expect(FakeWS.all).toHaveLength(3)
  FakeWS.all[2].open(); FakeWS.all[2].recv(ok); FakeWS.all[2].close()
  vi.advanceTimersByTime(1000); expect(FakeWS.all).toHaveLength(4)
})

it('close() 뒤에는 다시 붙지 않는다', () => {
  const r = connectRealtime({ ...env, onChange() {}, WS })!
  FakeWS.all[0].open(); r.close(); vi.advanceTimersByTime(120_000)
  expect(FakeWS.all).toHaveLength(1)
})
