export interface VersionInfo { build: string; at: string; note: string }

export function parseVersion(x: unknown): VersionInfo | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.build !== 'string' || !o.build) return null
  return { build: o.build, at: String(o.at ?? ''), note: String(o.note ?? '') }
}

/** seen = [지금 바꾸기]를 이미 누른 판 — 갱신이 끝내 안 돼도 같은 판 알림은 한 번만. */
export const isNewer = (local: string, remote: VersionInfo | null, seen = ''): boolean => !!remote && remote.build !== local && remote.build !== seen

/** version.json 주소 — 지금 페이지 기준 상대 경로(포트·호스트를 박지 않는다). base 를 주면 그 기준으로 푼다(시험용). */
export function versionUrl(base: string = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/', now = Date.now()): string {
  return new URL(`version.json?t=${now}`, base).href
}

/** 판 확인 — failed 는 연결 자체가 안 된 경우(서버 내려감·오프라인). 호출 쪽이 그동안 재시도를 멈춰 콘솔 오류가 쌓이지 않게 한다. */
export async function fetchVersionState(): Promise<{ info: VersionInfo | null; failed: boolean }> {
  try {
    // 쿼리로 매번 다른 주소 — Pages 는 max-age=600 이라 CDN 이 옛 version.json 을 10분까지 준다(no-store 는 브라우저 캐시만 건너뜀)
    const r = await fetch(versionUrl(), { cache: 'no-store' })
    return { info: r.ok ? parseVersion(await r.json()) : null, failed: false }
  } catch { return { info: null, failed: true } }
}

export async function fetchVersion(): Promise<VersionInfo | null> {
  return (await fetchVersionState()).info
}
