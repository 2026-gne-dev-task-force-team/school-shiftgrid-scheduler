/**
 * platform — 화면이 쓰는 단 하나의 진입점.
 * Electron 에서는 preload 가 꽂아 둔 window.platform 을 쓰고, 아니면 웹 구현으로 간다.
 * ⚠️ 지금은 웹 구현만 있는 스텁이다. 껍데기 판이 electron 쪽을 채운다.
 */
import type { Platform, OpenedDoc } from './types';
import type { Doc } from '../types/doc';
import { migrateDoc } from '../types/doc';

export type { Platform, OpenedDoc } from './types';

const KEY = 'shiftgrid.autosave.v2';

function download(name: string, data: string | Uint8Array, mime = 'application/octet-stream') {
    const blob = new Blob([data as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(accept: string): Promise<File | null> {
    return new Promise((res) => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = accept;
        input.onchange = () => res(input.files?.[0] ?? null);
        input.oncancel = () => res(null);
        input.click();
    });
}

export const webPlatform: Platform = {
    kind: 'web',
    async openDoc() {
        const f = await pickFile('.json,application/json');
        if (!f) return null;
        return { doc: migrateDoc(JSON.parse(await f.text())), path: f.name };
    },
    async saveDoc(doc: Doc, path?: string) {
        const name = path ?? `${doc.meta.name || '시간표'}.shiftgrid.json`;
        download(name, JSON.stringify(doc, null, 1), 'application/json');
        return name;
    },
    async saveDocAs(doc: Doc) { return webPlatform.saveDoc(doc); },
    async autosave(doc: Doc) { try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch { /* 조용히 */ } },
    async loadAutosave() {
        try { const s = localStorage.getItem(KEY); return s ? migrateDoc(JSON.parse(s)) : null; } catch { return null; }
    },
    async exportFile(name, data, mime) { download(name, data, mime); },
    async importFile(accept) {
        const f = await pickFile(accept);
        if (!f) return null;
        return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
    },
    async print() { window.print(); },
    async recentFiles() { return []; },
};

declare global { interface Window { platform?: Platform } }

export const platform: Platform = (typeof window !== 'undefined' && window.platform) ? window.platform : webPlatform;
