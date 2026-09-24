/**
 * preload — window.platform 을 꽂는 유일한 자리.
 * ⛔ sandbox: true 로 돈다 — fs 는 여기서 안 쓴다. 파일 작업은 전부 main(electron/main.ts)이 하고
 * 여기는 ipcRenderer.invoke 로 부탁만 한다. src/platform/types.ts 의 Platform 계약을 그대로 구현한다.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Platform, OpenedDoc } from '../src/platform/types';
import type { Doc } from '../src/types/doc';

const platform: Platform = {
    kind: 'electron',
    openDoc: (): Promise<OpenedDoc | null> => ipcRenderer.invoke('platform:openDoc'),
    saveDoc: (doc: Doc, path?: string): Promise<string | null> => ipcRenderer.invoke('platform:saveDoc', doc, path),
    saveDocAs: (doc: Doc): Promise<string | null> => ipcRenderer.invoke('platform:saveDocAs', doc),
    autosave: (doc: Doc): Promise<void> => ipcRenderer.invoke('platform:autosave', doc),
    loadAutosave: (): Promise<Doc | null> => ipcRenderer.invoke('platform:loadAutosave'),
    exportFile: (name: string, data: string | Uint8Array, mime?: string): Promise<void> =>
        ipcRenderer.invoke('platform:exportFile', name, data, mime),
    importFile: (accept: string): Promise<{ name: string; bytes: Uint8Array } | null> =>
        ipcRenderer.invoke('platform:importFile', accept),
    print: (): Promise<void> => ipcRenderer.invoke('platform:print'),
    recentFiles: (): Promise<string[]> => ipcRenderer.invoke('platform:recentFiles'),
};

contextBridge.exposeInMainWorld('platform', platform);

/**
 * shiftgridMenu — Platform 계약 밖의 추가 다리(애더티브, 계약을 안 건드린다).
 * 파일 메뉴(새로/열기/저장/다른 이름으로)를 실제 문서 상태에 연결하고 싶으면 화면 판이 이걸 구독한다:
 *   window.shiftgridMenu.onAction((action, payload) => { ... })
 * action: 'new' | 'open'(payload: OpenedDoc) | 'save' | 'saveAs'
 */
contextBridge.exposeInMainWorld('shiftgridMenu', {
    onAction(cb: (action: string, payload?: unknown) => void): () => void {
        const listener = (_e: IpcRendererEvent, action: string, payload?: unknown) => cb(action, payload);
        ipcRenderer.on('shiftgrid:menu', listener);
        return () => ipcRenderer.removeListener('shiftgrid:menu', listener);
    },
});
