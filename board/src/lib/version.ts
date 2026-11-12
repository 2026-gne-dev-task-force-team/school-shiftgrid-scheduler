export interface VersionInfo { build: string; at: string; note: string }

export function parseVersion(x: unknown): VersionInfo | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.build !== 'string' || !o.build) return null
  return { build: o.build, at: String(o.at ?? ''), note: String(o.note ?? '') }
}

/** seen = [지금 바꾸기]를 이미 누른 판 — 갱신이 끝내 안 돼도 같은 판 알림은 한 번만. */
export const isNewer = (local: string, remote: VersionInfo | null, seen = ''): boolean => !!remote && remote.build !== local && remote.build !== seen

export async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    // 쿼리로 매번 다른 주소 — Pages 는 max-age=600 이라 CDN 이 옛 version.json 을 10분까지 준다(no-store 는 브라우저 캐시만 건너뜀)
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
    return r.ok ? parseVersion(await r.json()) : null
  } catch { return null }
}
