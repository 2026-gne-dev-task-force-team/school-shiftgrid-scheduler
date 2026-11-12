// Supabase Realtime 에 phoenix 메시지로 직접 붙는다(의존성 없음). 바뀜 알림이 오면 onChange 를 1초 debounce 로 한 번만 부른다.
// 키가 없으면 소켓을 열지 않는다. 끊기면 지수 물러서기로 다시 붙는다(그동안은 바깥의 주기 읽기가 받친다).
export interface RealtimeOpts {
  url?: string; key?: string
  onChange(): void
  onStatus?(live: boolean): void
  WS?: new (url: string) => WebSocket
  debounceMs?: number; heartbeatMs?: number; backoffBaseMs?: number; backoffMaxMs?: number
}

export function realtimeUrl(url: string, key: string): string {
  return `${url.replace(/^http/, 'ws').replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`
}

/** 소켓을 열 수 없으면(키 없음·WebSocket 없음) null. 아니면 close() 를 돌려준다. */
export function connectRealtime(o: RealtimeOpts): { close(): void } | null {
  const WS = o.WS ?? (typeof WebSocket === 'undefined' ? undefined : WebSocket)
  if (!o.url || !o.key || !WS) return null
  const endpoint = realtimeUrl(o.url, o.key)
  const deb = o.debounceMs ?? 1000, hb = o.heartbeatMs ?? 30_000, b0 = o.backoffBaseMs ?? 1000, bMax = o.backoffMaxMs ?? 30_000
  let ws: WebSocket | null = null
  let ref = 0, fails = 0, closed = false, live = false
  let hbTimer: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let debTimer: ReturnType<typeof setTimeout> | undefined
  const send = (topic: string, event: string, payload: unknown) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref) }))
  }
  const setLive = (v: boolean) => { if (live !== v) { live = v; o.onStatus?.(v) } }
  const lost = (sock: WebSocket) => {
    if (sock !== ws) return // 이미 갈아 낀 소켓의 늦은 알림
    clearInterval(hbTimer); setLive(false); ws = null
    if (closed) return
    clearTimeout(retryTimer)
    retryTimer = setTimeout(open, Math.min(bMax, b0 * 2 ** fails++))
  }
  function open() {
    if (closed) return
    const sock = new WS!(endpoint)
    ws = sock
    sock.onopen = () => {
      send('realtime:board', 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { key: '' },
        postgres_changes: [{ event: '*', schema: 'board' }], private: false } })
      hbTimer = setInterval(() => send('phoenix', 'heartbeat', {}), hb)
    }
    sock.onmessage = (e) => {
      let m: { topic?: string; event?: string; payload?: { status?: string } }
      try { m = JSON.parse(String(e.data)) } catch { return }
      if (m.topic !== 'realtime:board') return
      if (m.event === 'phx_reply') {
        if (m.payload?.status === 'ok') { fails = 0; setLive(true) } else sock.close()
      } else if (m.event === 'postgres_changes') {
        clearTimeout(debTimer); debTimer = setTimeout(o.onChange, deb)
      } else if (m.event === 'phx_close' || m.event === 'phx_error') sock.close()
    }
    sock.onclose = () => lost(sock)
    sock.onerror = () => { try { sock.close() } catch { /* 이미 닫힘 */ } }
  }
  open()
  return { close() { closed = true; clearInterval(hbTimer); clearTimeout(retryTimer); clearTimeout(debTimer); setLive(false); ws?.close(); ws = null } }
}
