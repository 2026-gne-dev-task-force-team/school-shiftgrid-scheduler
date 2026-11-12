export interface VersionInfo { build: string; at: string; note: string }

export function parseVersion(x: unknown): VersionInfo | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  if (typeof o.build !== 'string' || !o.build) return null
  return { build: o.build, at: String(o.at ?? ''), note: String(o.note ?? '') }
}

export const isNewer = (local: string, remote: VersionInfo | null): boolean => !!remote && remote.build !== local

export async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const r = await fetch('version.json', { cache: 'no-store' })
    return r.ok ? parseVersion(await r.json()) : null
  } catch { return null }
}
