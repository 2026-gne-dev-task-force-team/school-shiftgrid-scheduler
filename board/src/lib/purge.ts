// 이 앱 이름표가 붙은 것만 지운다. 금지: localStorage.clear() — 같은 출처의 다른 앱 자료를 건드린다.
export const OUR_PREFIXES = ['shiftgrid.v1_2', 'board.']
export const OUR_CACHE_PREFIX = 'board.'

export interface StorageLike { readonly length: number; key(i: number): string | null; removeItem(k: string): void }

export function purgeStorage(s: StorageLike, prefixes: readonly string[] = OUR_PREFIXES): string[] {
  const keys: string[] = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i)
    if (k !== null && prefixes.some((p) => k.startsWith(p))) keys.push(k)
  }
  keys.forEach((k) => s.removeItem(k)) // 순회 중에 지우면 인덱스가 밀려서 모았다가 지운다
  return keys
}

async function dropCachesAndWorkers(all = false): Promise<void> {
  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
  const names = (await globalThis.caches?.keys()) ?? []
  // 갱신 때는 workbox 사전 캐시(workbox-precache-…)도 비운다 — 접두사만 지우면 옛 번들이 남는다
  await Promise.all(names.filter((n) => all || n.startsWith(OUR_CACHE_PREFIX)).map((n) => caches.delete(n)))
}

export async function clearThisDevice(): Promise<string[]> {
  const gone = purgeStorage(localStorage)
  await dropCachesAndWorkers()
  return gone
}

export const SEEN_KEY = 'board.seenBuild'
export const loadSeen = (): string => localStorage.getItem(SEEN_KEY) ?? ''

// [지금 바꾸기] — 옛 파일 사본을 버리고 새 판으로 다시 연다. 저장 자료는 안 건드린다.
// 누른 판은 기록해 둔다 — 그래도 옛 판이 뜨면 무한 알림 대신 같은 판 알림은 더 안 띄운다.
export async function applyUpdate(build: string): Promise<void> {
  localStorage.setItem(SEEN_KEY, build)
  await dropCachesAndWorkers(true)
  location.replace(location.pathname + '?v=' + encodeURIComponent(build))
}
