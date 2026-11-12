/** 판 설정 한 장 — 저장 접두사와 설치 목록은 루트 site.config.json 이 정본이다(1.2v 설계 ① 1·2절). */
import config from '../../site.config.json';

/** 🔴 브라우저 저장소 키는 전부 이 접두사로 붙는다(main.tsx 가 setStoragePrefix 로 한 번 건다). 다른 곳에 접두사 리터럴 금지. */
export const STORAGE_PREFIX: string = config.storagePrefix;
export const INSTALLED_PLUGIN_IDS: readonly string[] = config.plugins;
/** 판 이름표 — 설치 이름(manifest)·탭 제목(title)·화면 배지가 전부 여기서 나온다(site.config.json 의 edition 이 정본). */
export const EDITION = config.edition;
const LEGACY_PREFIXES: readonly string[] = config.legacyStoragePrefixes;

/**
 * 옛 접두사 키 → 새 접두사 키 복사(옛 키는 지우지 않는다 · 새 키가 이미 있으면 건드리지 않는다).
 * 접두사마다 처음 한 번만(표지 키). shortcut: localStorage 만 — IndexedDB 는 안 옮긴다, 옛 자료가 생기면 그때.
 */
export function migrateLegacyKeys(storage: Storage, to: string, from: readonly string[]): number {
    let copied = 0;
    for (const f of from) {
        const mark = `${to}.__migrated-from.${f}`;
        if (storage.getItem(mark)) continue;
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(`${f}.`)) keys.push(k); }
        for (const k of keys) {
            const nk = `${to}.${k.slice(f.length + 1)}`;
            if (storage.getItem(nk) === null) { storage.setItem(nk, storage.getItem(k) as string); copied++; }
        }
        storage.setItem(mark, '1');
    }
    return copied;
}

export function migrateLegacyStorage(): void {
    try { migrateLegacyKeys(localStorage, STORAGE_PREFIX, LEGACY_PREFIXES); } catch { /* 저장소가 막혀도 앱은 뜬다 */ }
}
