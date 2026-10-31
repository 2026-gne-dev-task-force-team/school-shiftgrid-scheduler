/**
 * 문서(프로젝트 파일) — P3. 「표 하나가 파일 하나」(기둥 2)의 바닥이자, 플러그인이 파일을 넘기는 창구.
 *
 * 🔴 두 성질이 갈린다(창틀 설계 「화면의 성질은 자료의 성질이 아니다」와 같다):
 *   - 플러그인 설정(기기별)  → host.storage (여기 아님)
 *   - 문서 데이터(프로젝트 파일) → 여기. 열기·저장·새 문서·임시 보관은 전부 호스트(app)가 쥔다.
 *
 * ⭐ 플러그인 데이터는 plugins.<id> 아래 제 칸만(요구명세 갈림길 ③). 창틀·앱은 plugins.* 안을 모른다.
 * 🔴 v1(schemaVersion 1~3) · 옛 v2(4·5) 파일을 연다 — 모르는 것·옮기지 못한 것은 legacy 에 통째로.
 *    ⛔ 「모르는 모양이면 빈 배열」 금지(옛 v1 migrateDoc 의 버릇). 통째로 들고 다니고, 변환 전후 항목 수를 검산한다.
 *    도메인 변환(v1 tracks → 카드·노드)은 **플러그인 몫**이다 — 호스트는 legacy 를 통째로 보존만 한다.
 *
 * 🔴 저장은 늘 「다른 이름으로」 — 원본 파일을 구조적으로 못 덮는다(기둥 4). 디스크 쓰기는 사용자가 누른다.
 *    자동 저장은 임시 보관(기기별 localStorage)으로만 — 열어 둔 파일을 덮지 않는다.
 *
 * 📌 이 파일은 둘로 자란다: (아래) ①순수 모델·변환·검산 — 테스트가 직접 검산한다.
 *    ②React 스토어 + host.doc 다리 + 열기/저장/임시 보관 — 부수효과가 산다.
 */
import { useSyncExternalStore } from 'react';
import { storageKey } from '../pane-ui-system';
import { setDocBridge, type DocBridge, type DocEvent, type DocMeta, type Disposable, type PluginHost } from '../pane-ui-system/plugin';

// ══════════════════════════════════════════════════════════════
//  ① 순수 — 모델 · 변환 · 검산
// ══════════════════════════════════════════════════════════════

/** 지금 판 — main 의 5(Project) 다음. 이 판은 「플러그인별 칸」이 뼈대다 */
export const DOC_SCHEMA_VERSION = 6 as const;

/** 파일 확장자 — v1·옛 v2 와 같은 자리(선생님이 아는 이름). 저장은 늘 이걸 붙인다 */
export const DOC_EXT = '.shiftgrid.json';

/** 문서 한 장. plugins.<id> 가 그 플러그인의 몫(호스트는 안 읽는다) · legacy 는 못 옮긴 원본 통째 */
export interface Doc {
    schemaVersion: typeof DOC_SCHEMA_VERSION;
    meta: { name: string; createdAt: string; updatedAt: string };
    plugins: Record<string, unknown>;
    /** v1 · 옛 v2 원본 통째(모르는 것도 버리지 않는다). 새 문서면 없음 */
    legacy?: unknown;
}

/**
 * 변환 리포트 — 옛 파일을 열 때만 생긴다(v6 파일·새 문서는 null).
 * 🔴 ok=false 면 저장을 막는다 — 변환 전후로 들고 있는 항목 수가 안 맞으면 뭔가를 잃은 것이다.
 */
export interface DocMigrationReport {
    ok: boolean;
    /** 원본이 들고 있던 항목(모든 배열 원소, 깊이 무관) 총수 */
    sourceTotal: number;
    /** 변환 뒤 legacy 가 들고 있는 항목 총수 — 호스트는 legacy 를 통째로 보존하니 sourceTotal 과 같아야 한다 */
    heldTotal: number;
}

/**
 * 항목 수 — 구조 어디에 있든 모든 배열의 원소를 센다(깊이 무관).
 * 🔴 「통째로 들고 간다」가 참인지 재는 자. deepClone 은 이 값을 글자 하나 안 바꾼다.
 */
export function countItems(v: unknown): number {
    if (Array.isArray(v)) {
        let n = v.length;
        for (const x of v) n += countItems(x);
        return n;
    }
    if (v && typeof v === 'object') {
        let n = 0;
        for (const x of Object.values(v as Record<string, unknown>)) n += countItems(x);
        return n;
    }
    return 0;
}

/** JSON 으로 왕복 가능한 값만 다룬다 — structuredClone 이 없을 수도 있어 JSON 경유 */
function deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

/** 이 객체가 「지금 판 문서」인가 — plugins 칸이 있고 schemaVersion 이 6 이면 v6 파일(옛 파일엔 plugins 가 없다) */
export function isDocV6(raw: unknown): raw is Doc {
    if (!raw || typeof raw !== 'object') return false;
    const o = raw as Record<string, unknown>;
    return o.schemaVersion === DOC_SCHEMA_VERSION && !!o.plugins && typeof o.plugins === 'object' && !Array.isArray(o.plugins);
}

/** 새 문서 — 빈 작업대(기둥 1). 아무것도 안 묻는다 */
export function newDoc(name = '제목 없음'): Doc {
    const now = new Date().toISOString();
    return { schemaVersion: DOC_SCHEMA_VERSION, meta: { name, createdAt: now, updatedAt: now }, plugins: {} };
}

/** v6 파일을 안전하게 받아들인다 — 모양만 맞추고 plugins·legacy 는 통째로 보존한다 */
export function normalizeV6(raw: Doc): Doc {
    const o = raw as unknown as Record<string, unknown>;
    const meta = (o.meta && typeof o.meta === 'object') ? (o.meta as Record<string, unknown>) : {};
    const now = new Date().toISOString();
    return {
        schemaVersion: DOC_SCHEMA_VERSION,
        meta: {
            name: typeof meta.name === 'string' ? meta.name : '제목 없음',
            createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : now,
            updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : now,
        },
        // 🔴 plugins 를 통째로 보존한다 — 꺼진·모르는 플러그인의 몫도 그대로 들고 간다
        plugins: (o.plugins && typeof o.plugins === 'object') ? { ...(o.plugins as Record<string, unknown>) } : {},
        legacy: 'legacy' in o ? o.legacy : undefined,
    };
}

/** 옛 파일에서 문서 이름을 찾는다 — v2 는 name, v1 은 meta.name. 못 찾으면 기본 이름 */
function extractLegacyName(raw: unknown): string {
    if (raw && typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o.name === 'string' && o.name) return o.name;
        const meta = o.meta;
        if (meta && typeof meta === 'object') {
            const mn = (meta as Record<string, unknown>).name;
            if (typeof mn === 'string' && mn) return mn;
        }
    }
    return '불러온 문서';
}

/**
 * 옛 파일(v1·옛 v2) → 지금 판 문서.
 * 🔴 raw 를 통째로 legacy 에 깊은 복제해 보관한다 — 어떤 모양이 와도 한 항목도 잃지 않는다.
 *    도메인 변환(tracks → 카드)은 **여기서 안 한다** — 플러그인이 legacy 를 읽어 제 칸을 채운다.
 */
export function migrateToDoc(raw: unknown): { doc: Doc; report: DocMigrationReport } {
    const now = new Date().toISOString();
    const legacy = deepClone(raw);
    const doc: Doc = {
        schemaVersion: DOC_SCHEMA_VERSION,
        meta: { name: extractLegacyName(raw), createdAt: now, updatedAt: now },
        plugins: {},
        legacy,
    };
    const sourceTotal = countItems(raw);
    const heldTotal = countItems(doc.legacy);
    return { doc, report: { ok: sourceTotal === heldTotal, sourceTotal, heldTotal } };
}

/** 파일 글자 → 문서. v6 면 그대로, 그 밖(v1·옛 v2)은 legacy 로 통째 감싼다 */
export function parseDocFile(text: string): { doc: Doc; report: DocMigrationReport | null } {
    const raw = JSON.parse(text) as unknown;
    if (isDocV6(raw)) return { doc: normalizeV6(raw), report: null };
    return migrateToDoc(raw);
}

/**
 * 저장 직전 관문 — legacy 가 열 때 그대로인지 다시 센다.
 * 🔴 ⛔ 여기 「===」(항목 수 비교)가 무결성의 전부다 — 이 비교를 빼면 잃어버린 것을 못 잡는다(버그 심기 자리).
 *    sourceTotal 은 열 때의 리포트가 쥐고 있던 기준값이다.
 */
export function verifyDocIntegrity(doc: Doc, sourceTotal: number): DocMigrationReport {
    const heldTotal = countItems(doc.legacy);
    return { ok: sourceTotal === heldTotal, sourceTotal, heldTotal };
}

/**
 * 한 플러그인의 칸만 바꾼다 — ⭐ update 는 자기 키만(남의 몫·legacy 는 손대지 않는다).
 * 「편하니까 전체를 넘기면 남의 몫을 지우는 버그가 조용히 난다」(요구명세 「여기서 죽는다」).
 */
export function setSlice(doc: Doc, pluginId: string, value: unknown): Doc {
    return {
        ...doc,
        meta: { ...doc.meta, updatedAt: new Date().toISOString() },
        plugins: { ...doc.plugins, [pluginId]: value },
    };
}

/** 문서 → 파일 글자. 저장 때 updatedAt 을 갱신한다(들여쓰기 1칸 — 옛 판과 같은 결) */
export function serializeDoc(doc: Doc): string {
    return JSON.stringify({ ...doc, meta: { ...doc.meta, updatedAt: new Date().toISOString() } }, null, 1);
}

// ══════════════════════════════════════════════════════════════
//  ② 스토어 · host.doc 다리 · 열기/저장/임시 보관 (부수효과)
// ══════════════════════════════════════════════════════════════

/** 지금 열린 문서의 상태 — 한 장만 산다(「표 하나가 파일 하나」지만 한 번에 한 문서가 바닥에 열린다) */
interface DocState {
    doc: Doc;
    /** 어느 파일에서 왔나(열기·저장 후에 생긴다) · 새 문서면 null */
    fileName: string | null;
    /** 저장 안 한 변경이 있나 — 상태바 ● · beforeunload 가 읽는다 */
    dirty: boolean;
    /** 옛 파일에서 왔으면 열 때의 무결성 기준(sourceTotal) — 저장 관문이 다시 검산한다. v6·새 문서면 null */
    baseline: number | null;
}

let state: DocState = { doc: newDoc(), fileName: null, dirty: false, baseline: null };

// React 구독 — 상태바·앱 UI 가 이름·더티를 다시 그린다
const listeners = new Set<() => void>();
function emit(): void { for (const l of listeners) l(); }
function subscribe(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

// 문서 이벤트 구독(플러그인) — change/open/close
interface DocEventSub { pluginId: string; ev: DocEvent; cb: () => void }
const docEventSubs: DocEventSub[] = [];
function fireDoc(ev: DocEvent): void {
    for (const s of docEventSubs) if (s.ev === ev) { try { s.cb(); } catch { /* 하나가 던져도 나머지는 */ } }
}

const TEMP_KEY = () => storageKey('doc');
const MAX_TEMP_BYTES = 5 * 1024 * 1024;   // 🔴 5MB 넘으면 임시 보관 건너뛴다(씽크 함정과 같은 결)

/** 임시 보관 — 기기별 localStorage 에 열린 문서를 둔다(새로고침에 안 날아가게). 🔴 5MB 넘으면 안 하고 경고. */
function tempSave(): void {
    try {
        if (typeof localStorage === 'undefined') return;
        const payload = JSON.stringify({ doc: state.doc, fileName: state.fileName, dirty: state.dirty });
        const bytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(payload).length : payload.length;
        if (bytes > MAX_TEMP_BYTES) { console.warn(`[doc] 임시 보관 건너뜀 — ${(bytes / 1048576).toFixed(1)}MB (5MB 초과)`); return; }
        localStorage.setItem(TEMP_KEY(), payload);
    } catch { /* 조용히 */ }
}

function loadTempSave(): DocState | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const s = localStorage.getItem(TEMP_KEY());
        if (!s) return null;
        const p = JSON.parse(s) as { doc?: unknown; fileName?: unknown; dirty?: unknown };
        if (!isDocV6(p.doc)) return null;
        return {
            doc: normalizeV6(p.doc),
            fileName: typeof p.fileName === 'string' ? p.fileName : null,
            dirty: !!p.dirty,
            baseline: null,
        };
    } catch { return null; }
}

/** 문서 내용이 바뀌었다 — 더티 올리고 임시 보관하고 구독자(React·플러그인)에 알린다 */
function markChanged(): void {
    state = { ...state, dirty: true };
    tempSave();
    fireDoc('change');
    emit();
}

/** 새 문서·파일을 바닥에 앉힌다 — 플러그인에 open 을 쏘고 React 를 다시 그린다 */
function setDocument(next: DocState): void {
    state = next;
    tempSave();
    fireDoc('open');
    emit();
}

// ── host.doc 다리 ──
const docBridge: DocBridge = {
    get(pluginId) { return state.doc.plugins[pluginId]; },
    set(pluginId, value) {
        // ⭐ 자기 칸만 바꾼다(setSlice) — 남의 몫·legacy 는 손대지 않는다
        state = { ...state, doc: setSlice(state.doc, pluginId, value) };
        markChanged();
    },
    on(pluginId, ev, cb) {
        const entry: DocEventSub = { pluginId, ev, cb };
        docEventSubs.push(entry);
        const d: Disposable = { dispose() { const i = docEventSubs.indexOf(entry); if (i >= 0) docEventSubs.splice(i, 1); } };
        return d;
    },
    meta(): DocMeta { return { ...state.doc.meta }; },
};

// ── React 창구 ──
export function useDoc(): DocState {
    return useSyncExternalStore(subscribe, () => state, () => state);
}
export function getDocState(): DocState { return state; }

// ── 동작: 새 문서 · 열기 · 저장 ──

/** 새 문서 — 빈 작업대. 묻지 않는다 */
export function createNewDoc(name = '제목 없음'): void {
    setDocument({ doc: newDoc(name), fileName: null, dirty: false, baseline: null });
}

/** 파일 고르기 창(<input type=file>) → 문서. 취소하면 아무 일도 안 한다 */
function pickFile(accept: string): Promise<File | null> {
    return new Promise((res) => {
        if (typeof document === 'undefined') { res(null); return; }
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept;
        input.onchange = () => res(input.files?.[0] ?? null);
        input.oncancel = () => res(null);
        input.click();
    });
}

/** 글자 하나를 바로 문서로 — 파일 input·테스트가 쓰는 공통 입구(파일 읽기는 바깥에서 끝낸다) */
export function loadDocText(text: string, fileName: string): DocMigrationReport | null {
    const { doc, report } = parseDocFile(text);
    if (report && !report.ok) {
        console.warn(`[doc] 무결성 경고 — 변환 전후 항목 수가 다르다(${report.sourceTotal} → ${report.heldTotal}). 저장이 막힌다.`);
    }
    setDocument({ doc, fileName, dirty: false, baseline: report ? report.sourceTotal : null });
    return report;
}

/** 열기 — 파일을 골라 읽어 바닥에 앉힌다. 취소하면 null */
export async function openFile(): Promise<DocMigrationReport | null | undefined> {
    const f = await pickFile('.json,application/json');
    if (!f) return undefined;
    const text = await f.text();
    return loadDocText(text, f.name);
}

/** 파일 쓰기 — 지원 브라우저면 showSaveFilePicker, 아니면 다운로드. 취소하면 false */
async function writeFile(name: string, text: string): Promise<boolean> {
    const w = typeof window !== 'undefined' ? (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }> }) : undefined;
    if (w?.showSaveFilePicker) {
        try {
            const handle = await w.showSaveFilePicker({
                suggestedName: name,
                types: [{ description: 'ShiftGrid', accept: { 'application/json': [DOC_EXT, '.json'] } }],
            });
            const ws = await handle.createWritable();
            await ws.write(text);
            await ws.close();
            return true;
        } catch (e) {
            if ((e as { name?: string })?.name === 'AbortError') return false;   // 사용자가 취소
            // 그 밖(미지원·권한)은 다운로드로 폴백
        }
    }
    download(name, text);
    return true;
}

function download(name: string, text: string): void {
    if (typeof document === 'undefined') return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 다른 이름으로 저장 — 🔴 늘 「다른 이름으로」(원본을 구조적으로 못 덮는다).
 *   ⛔ 옛 파일에서 왔으면 저장 직전에 무결성을 다시 검산하고, 어긋나면 막는다(아무것도 안 잃는다는 보장).
 *   성공하면 더티를 내리고 파일 이름을 기억한다. 반환: 저장했으면 파일 이름, 막혔으면 null, 취소면 undefined.
 */
export async function saveAs(): Promise<string | null | undefined> {
    if (state.baseline != null) {
        const v = verifyDocIntegrity(state.doc, state.baseline);
        if (!v.ok) {
            const msg = `저장을 막았다 — 열 때 ${v.sourceTotal}개이던 항목이 ${v.heldTotal}개로 줄었다. 무언가를 잃었다.`;
            console.error(`[doc] ${msg}`);
            if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(msg);
            return null;
        }
    }
    const base = state.doc.meta.name && state.doc.meta.name.trim() ? state.doc.meta.name.trim() : '시간표';
    const name = `${base}${DOC_EXT}`;
    const text = serializeDoc(state.doc);
    const ok = await writeFile(name, text);
    if (!ok) return undefined;   // 취소
    state = { ...state, fileName: name, dirty: false };
    tempSave();
    emit();
    return name;
}

/**
 * 호스트 초기화 — main.tsx 가 React 가 뜨기 전 한 번 부른다.
 *   ① host.doc 다리를 꽂는다(플러그인의 activate 안에서도 doc 이 돌게 — activateAll 보다 먼저).
 *   ② 임시 보관본이 있으면 되살린다(새로고침에 안 날아가게).
 *   ③ 더티면 창을 닫기 전 경고한다.
 */
export function initDoc(): void {
    setDocBridge(docBridge);
    const restored = loadTempSave();
    if (restored) state = restored;
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
            if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }
}

/**
 * 앱 리본·명령 등록 — 코어(호스트 app) 가 「새 문서·열기·다른 이름으로 저장」을 꽂는다.
 *   ⭐ 특권 없음 — 플러그인과 같은 길(host.commands/ribbon)로 꽂는다(주인은 'app').
 */
export function registerAppCommands(host: PluginHost): void {
    host.commands.add({ id: 'app.new-doc', title: '새 문서', icon: 'file', run: () => createNewDoc() });
    host.commands.add({ id: 'app.open-doc', title: '열기', icon: 'folder', run: () => { void openFile(); } });
    host.commands.add({ id: 'app.save-doc', title: '다른 이름으로 저장', icon: 'save', run: () => { void saveAs(); } });
    // 🔴 order 음수 — 문서 동작을 리본 맨 앞에(플러그인 동작·뷰 설탕보다 먼저)
    host.ribbon.add({ commandId: 'app.new-doc', icon: 'file', order: -3 });
    host.ribbon.add({ commandId: 'app.open-doc', icon: 'folder', order: -2 });
    host.ribbon.add({ commandId: 'app.save-doc', icon: 'save', order: -1 });
}
