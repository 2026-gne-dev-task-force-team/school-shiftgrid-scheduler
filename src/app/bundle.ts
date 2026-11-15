/**
 * 시간표 번들 로더 — 앱이 번들을 읽어 들이는 한 곳. 본체(보관·판별)는 shared/bundle/store.ts.
 * 플러그인(ops-aux·ops-days)은 이 파일이 아니라 shared 의 getBundle 로 읽는다(플러그인이 src/app 을 import 하지 않는다).
 */
export { loadBundle, setBundle, getBundle } from '../../shared/bundle/store.ts'

import { appHost } from './host.ts'
import { loadBundle as loadRaw, getBundle } from '../../shared/bundle/store.ts'

const SAVED_KEY = 'bundle'

/** 기기 저장소에 둔 번들을 한 번 읽어 들인다. 없거나 번들이 아니거나 저장소가 죽어도 던지지 않고 false(가짜 값 그대로). */
export async function restoreBundle(): Promise<boolean> {
  try {
    const raw = await appHost.store.get<unknown>(SAVED_KEY, null)
    if (raw == null) return false
    return loadRaw(raw).ok
  } catch { return false }
}

/** 번들을 앱에 넣고 기기 저장소에도 둔다(가져오기 길이 생기면 여기로). 번들이 아니면 아무것도 안 바꾼다. */
export async function importBundle(raw: unknown): Promise<{ ok: true } | { ok: false; reason: string }> {
  const r = loadRaw(raw)
  if (!r.ok) return r
  await appHost.store.set(SAVED_KEY, getBundle())
  return { ok: true }
}
