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

async function dropCachesAndWorkers(): Promise<void> {
  const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
  await Promise.all(regs.map((r) => r.unregister()))
  const names = (await globalThis.caches?.keys()) ?? []
  await Promise.all(names.filter((n) => n.startsWith(OUR_CACHE_PREFIX)).map((n) => caches.delete(n)))
}

export async function clearThisDevice(): Promise<string[]> {
  const gone = purgeStorage(localStorage)
  await dropCachesAndWorkers()
  return gone
}

// [지금 바꾸기] — 옛 파일 사본을 버리고 새 판으로 다시 연다. 저장 자료는 안 건드린다.
export async function applyUpdate(build: string): Promise<void> {
  await dropCachesAndWorkers()
  location.replace(location.pathname + '?v=' + encodeURIComponent(build))
}
