// P10b — v1 이 부르는 `window.platform` 을 1.2v 꾸러미 쪽 구현으로 갈아 끼운다(설계 ① 2-1·16절).
// legacy 는 손대지 않는다: entry.ts 가 legacy 를 동적 import 하기 전에 installBundlePlatform() 으로 꽂는다.
// 저장 자리는 아래 DocStore 한 곳뿐이다(서버 전엔 메모리 가짜).
import { webPlatform } from './legacy/platform'
import type { Platform } from './legacy/platform'
import type { Doc } from './legacy/types/doc'

/** 꾸러미 쪽 「doc 칸」 어댑터. 진짜 서버 PUT(설계 ① 12절)이 붙을 자리는 이 인터페이스 하나다. */
export interface DocStore {
  /** autosave 가 맡긴 최신 doc 을 두고 dirty 표시를 켠다 */
  put(doc: Doc): void
  /** Ctrl+S — 모아 둔 doc 을 내보낸다(가짜는 dirty 만 끈다) */
  flush(): Promise<void>
  readonly dirty: boolean
  readonly doc: Doc | null
  /** dirty 가 바뀔 때 알린다(부모 화면의 「저장 안 됨」 표시용). 해제 함수를 돌려준다 */
  onDirty(fn: (dirty: boolean) => void): () => void
}

export function createMemoryDocStore(): DocStore {
  let doc: Doc | null = null
  let dirty = false
  const subs = new Set<(d: boolean) => void>()
  const set = (d: boolean) => {
    if (dirty === d) return
    dirty = d
    subs.forEach((f) => f(d))
  }
  return {
    put(d) {
      doc = d
      set(true)
    },
    async flush() {
      // TODO(서버 연결): 여기서 doc 칸 PUT. 지금은 메모리에만 두고 dirty 만 끈다.
      set(false)
    },
    get dirty() {
      return dirty
    },
    get doc() {
      return doc
    },
    onDirty(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export function createBundlePlatform(store: DocStore = createMemoryDocStore()): Platform {
  return {
    kind: 'web',
    // autosave 는 저장이 아니라 dirty 표시 — 실제 저장은 saveDoc/모아 보내기가 한다. 던지지 않는다.
    async autosave(doc) {
      store.put(doc)
    },
    // 「이어 할까요」 배너가 안 뜨게 항상 null
    async loadAutosave() {
      return null
    },
    // Ctrl+S — 모아 둔 것을 바로 보낸다. v1 계약상 경로 문자열을 돌려준다
    async saveDoc(doc, path) {
      store.put(doc)
      await store.flush()
      return path ?? doc.meta.name ?? '시간표'
    },
    // 파일 내려받기 계열은 v1 웹 구현 그대로(선생님 앱 호환 파일)
    saveDocAs: (doc) => webPlatform.saveDocAs(doc),
    exportFile: (name, data, mime) => webPlatform.exportFile(name, data, mime),
    // TODO(P10c): 파일 → 검사 → 「칸을 이 파일로 바꿀까요」 확인 → 자동 받기 순서로 감싼다
    openDoc: () => webPlatform.openDoc(),
    importFile: (accept) => webPlatform.importFile(accept),
    print: () => webPlatform.print(),
    recentFiles: async () => [],
  }
}

export function installBundlePlatform(store?: DocStore): DocStore {
  const s = store ?? createMemoryDocStore()
  window.platform = createBundlePlatform(s)
  return s
}
