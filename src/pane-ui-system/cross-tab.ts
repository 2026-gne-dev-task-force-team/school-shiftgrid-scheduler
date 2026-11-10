/**
 * 탭 간 동기화 — 같은 프로젝트(= 같은 DB)를 연 탭끼리 「무엇이 바뀌었나」를 알린다(R3-X · 쥔님 2026-11-10).
 *   *"서로 어떤거 만져도 데이터는 똑같이 씽크되고, 보는거나 열어놓은건 정도는 달라도 되겠지. 설정이나 데이터는 차이나면 안돼"*
 *
 * ⭐ 꼴: 알림은 「바뀐 키·노드 id」만 싣고, 받는 쪽이 저장소에서 **다시 읽는다**(값을 싣지 않는다).
 *    근거 — 저장소(IndexedDB·localStorage)가 이미 탭 공용 원본이라 값을 실어 나르면 원본이 둘이 된다.
 *
 *   자료(IndexedDB) — 쓰기가 끝나면 announceWrite(db, change) → 다른 탭의 onOtherTabWrite 구독자가 받는다.
 *     BroadcastChannel 이 없으면 localStorage 핑 키(`<접두사>.__cross-tab`)의 `storage` 이벤트로 대신 나른다.
 *   설정(localStorage) — 브라우저가 다른 탭에 `storage` 이벤트를 이미 쏜다. onStorageKey(키, fn) 로 받는다.
 *   보기(배치·폭·접힘·활성 탭) — 구독하지 않는다(탭마다 따로).
 *
 * 🔴 경고 배너(옛 「다른 탭에서 바뀌었습니다 — 새로고침」)는 걷었다 — 동기화가 되니 새로고침이 필요 없다.
 */
import { storageKey } from './storage';

/** 이 탭의 표식 — 자기 알림을 자기가 받지 않게. */
const TAB_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 쓰기 알림 한 장 — kind 'nodes' 는 노드 스토어(ids 또는 통째 'all') · 'kv' 는 큰 저장 한 키. */
export type WriteChange =
    | { kind: 'nodes'; ids: string[] | 'all' }
    | { kind: 'kv'; key: string };
type Msg = WriteChange & { projectId: string; origin: string };

let channel: BroadcastChannel | null = null;
let channelFor = '';
let pingOff: (() => void) | null = null;
const writeListeners = new Set<(c: WriteChange) => void>();

const pingKey = () => storageKey('__cross-tab');

function deliver(data: unknown, projectId: string): void {
    const m = data as Partial<Msg> | null;
    if (!m || m.projectId !== projectId || m.origin === TAB_ID) return;
    let change: WriteChange;
    if (m.kind === 'nodes') change = { kind: 'nodes', ids: Array.isArray(m.ids) ? m.ids.filter((x): x is string => typeof x === 'string') : 'all' };
    else if (m.kind === 'kv' && typeof m.key === 'string') change = { kind: 'kv', key: m.key };
    else return;
    for (const fn of [...writeListeners]) { try { fn(change); } catch (e) { console.error('[cross-tab] 구독자 실패', e); } }
}

function chan(projectId: string): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') { channelFor = projectId; return null; }
    if (channel && channelFor === projectId) return channel;
    try { channel?.close(); } catch { /* 무시 */ }
    channelFor = projectId;
    channel = new BroadcastChannel('cross-tab:' + projectId);
    channel.onmessage = (ev: MessageEvent) => deliver(ev.data, projectId);
    return channel;
}

/** DB 를 열 때 한 번 — 수신을 시작한다(채널 · 없으면 localStorage 핑). */
export function watchOtherTabs(projectId: string): void {
    if (chan(projectId)) return;
    pingOff?.();
    pingOff = onStorageKey(pingKey, (raw) => {
        if (!raw) return;
        try { deliver(JSON.parse(raw), projectId); } catch { /* 깨진 핑은 무시 */ }
    });
}

/** 쓰기가 끝났다고 다른 탭에 알린다 — 무엇이 바뀌었는지(change)를 싣는다. 실패는 조용히(다음 쓰기가 다시 알린다). */
export function announceWrite(projectId: string, change: WriteChange = { kind: 'nodes', ids: 'all' }): void {
    const msg: Msg = { ...change, projectId, origin: TAB_ID };
    try {
        const c = chan(projectId);
        if (c) { c.postMessage(msg); return; }
        // 대체 — localStorage 핑(값이 같으면 이벤트가 안 나니 nonce 를 붙인다)
        if (typeof localStorage !== 'undefined') localStorage.setItem(pingKey(), JSON.stringify({ ...msg, n: Math.random() }));
    } catch { /* 알림 실패는 자료 유실이 아니다 */ }
}

/** 다른 탭의 자료 쓰기를 구독한다 — 돌려주는 함수로 해지. */
export function onOtherTabWrite(fn: (c: WriteChange) => void): () => void {
    writeListeners.add(fn);
    return () => { writeListeners.delete(fn); };
}

// ── 설정(localStorage) — 브라우저 `storage` 이벤트(다른 탭이 쓴 키만 온다) ──
interface KeyListener { key: () => string; fn: (newValue: string | null) => void }
const keyListeners = new Set<KeyListener>();
let storageBound = false;

/** `storage` 이벤트 하나를 나눠 준다 — key 가 null(clear)이면 전부 다시 읽게 한다. 테스트도 이걸로 흉내 낸다. */
export function dispatchStorageEvent(e: { key: string | null; newValue?: string | null }): void {
    for (const l of [...keyListeners]) {
        if (e.key !== null && e.key !== l.key()) continue;
        try { l.fn(e.newValue ?? null); } catch (err) { console.error('[cross-tab] 설정 구독자 실패', err); }
    }
}

/**
 * 다른 탭이 이 localStorage 키를 바꾸면 fn — 🔴 key 는 함수로 받는다(setStoragePrefix 전에 굳지 않게 · storage.ts 와 같은 이유).
 *   돌려주는 함수로 해지.
 */
export function onStorageKey(key: () => string, fn: (newValue: string | null) => void): () => void {
    const entry: KeyListener = { key, fn };
    keyListeners.add(entry);
    if (!storageBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        storageBound = true;
        window.addEventListener('storage', (ev) => {
            const se = ev as StorageEvent;
            // 다른 저장 영역(sessionStorage)의 이벤트는 건너뛴다
            if (typeof localStorage !== 'undefined' && se.storageArea && se.storageArea !== localStorage) return;
            dispatchStorageEvent({ key: se.key ?? null, newValue: se.newValue ?? null });
        });
    }
    return () => { keyListeners.delete(entry); };
}

/** 🔴 테스트 전용 — 채널·자료 구독을 비운다. ⚠️ 설정 구독(onStorageKey)은 모듈 로드 때 걸리니 안 비운다. */
export function __resetCrossTabForTest(): void {
    try { channel?.close(); } catch { /* 무시 */ }
    channel = null; channelFor = '';
    pingOff?.(); pingOff = null;
    writeListeners.clear();
}
