/**
 * Electron main — 창 · 메뉴 · 파일 열기/저장/인쇄 · 파일 로그.
 * 화면(src/ui)·엔진(src/engine)은 이 파일을 모른다. 여기는 src/platform/types.ts 의 Platform 계약을
 * IPC(platform:*)로 구현하고, preload.ts 가 그걸 window.platform 에 꽂는다.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrateDoc, type Doc } from '../src/types/doc';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

// vite-plugin-electron 이 main 을 ESM(dist-electron/main.js)으로 내보내면 __dirname 이 없다.
// import.meta.url 은 esbuild/rolldown 이 결과 포맷(ESM·CJS 어느 쪽이든)에 맞게 알아서 옮겨 준다.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ──────────────────────────────────────────────── 경로

const userDataDir = () => app.getPath('userData');
const logsDir = () => path.join(userDataDir(), 'logs');
const logFile = () => path.join(logsDir(), 'app.log');
const autosaveFile = () => path.join(userDataDir(), 'autosave.json');
const recentFile = () => path.join(userDataDir(), 'recent.json');

// ──────────────────────────────────────────────── 로그·오류 (창 없는 자리의 유일한 눈)
//   자작앱 디자인 가이드 4절: 오류 한 덩어리 = 세 줄(무엇이·왜·다음에)

function log(line: string): void {
    try {
        fs.mkdirSync(logsDir(), { recursive: true });
        fs.appendFileSync(logFile(), `[${new Date().toISOString()}] ${line}\n`);
    } catch {
        // 로그 자체가 죽어도 앱은 막지 않는다 (fail-open)
    }
}

function reportError(what: string, why: string, next: string): void {
    log(`오류 — ${what} — ${why}`);
    try {
        dialog.showErrorBox('시간표 짜기 — 오류', `${what}\n${why}\n${next}`);
    } catch {
        // 다이얼로그조차 못 띄우면 로그 파일이 마지막 증거다
    }
}

process.on('uncaughtException', (err) => {
    reportError('예상 못 한 오류가 났습니다', String((err as Error)?.stack ?? err), '앱을 다시 시작해 주세요. 반복되면 로그 파일(logs/app.log)을 함께 알려 주세요.');
});
process.on('unhandledRejection', (reason) => {
    reportError('처리 안 된 비동기 오류가 났습니다', String(reason), '작업 중이던 내용은 자동저장에서 복구할 수 있습니다.');
});

// ──────────────────────────────────────────────── 문서 파일 읽기/쓰기

const DOC_FILTER = [{ name: '시간표 파일', extensions: ['shiftgrid.json'] }];

function ensureExt(p: string): string {
    return p.endsWith('.shiftgrid.json') ? p : `${p}.shiftgrid.json`;
}

async function readDocFile(filePath: string): Promise<Doc> {
    const text = await fsp.readFile(filePath, 'utf-8');
    return migrateDoc(JSON.parse(text));
}

async function writeDocFile(filePath: string, doc: Doc): Promise<void> {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
}

// ──────────────────────────────────────────────── 최근 파일 (최대 10)

async function readRecent(): Promise<string[]> {
    try {
        const arr = JSON.parse(await fsp.readFile(recentFile(), 'utf-8'));
        return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

async function pushRecent(filePath: string): Promise<void> {
    try {
        const list = (await readRecent()).filter((p) => p !== filePath);
        list.unshift(filePath);
        await fsp.mkdir(userDataDir(), { recursive: true });
        await fsp.writeFile(recentFile(), JSON.stringify(list.slice(0, 10), null, 1), 'utf-8');
    } catch (e) {
        log(`최근 파일 기록 실패 — ${e}`);
    }
}

// ──────────────────────────────────────────────── 열기/저장 (다이얼로그 + fs)

async function doOpenDoc(): Promise<{ doc: Doc; path?: string } | null> {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: DOC_FILTER });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    try {
        const doc = await readDocFile(filePath);
        await pushRecent(filePath);
        return { doc, path: filePath };
    } catch (e) {
        reportError('파일을 열지 못했습니다', `${filePath} — ${(e as Error).message}`, '파일이 손상되지 않았는지, .shiftgrid.json 형식이 맞는지 확인해 주세요.');
        return null;
    }
}

async function doSaveDocAs(doc: Doc): Promise<string | null> {
    if (!mainWindow) return null;
    const res = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${doc.meta?.name || '시간표'}.shiftgrid.json`,
        filters: DOC_FILTER,
    });
    if (res.canceled || !res.filePath) return null;
    const filePath = ensureExt(res.filePath);
    try {
        await writeDocFile(filePath, doc);
        await pushRecent(filePath);
        return filePath;
    } catch (e) {
        reportError('파일을 저장하지 못했습니다', `${filePath} — ${(e as Error).message}`, '다른 이름이나 다른 폴더로 다시 시도해 주세요.');
        return null;
    }
}

async function doSaveDoc(doc: Doc, filePath?: string): Promise<string | null> {
    // path 없으면 「다른 이름으로」가 기본 — 마지막 한 타는 사람이 친다
    if (!filePath) return doSaveDocAs(doc);
    try {
        await writeDocFile(filePath, doc);
        await pushRecent(filePath);
        return filePath;
    } catch (e) {
        reportError('파일을 저장하지 못했습니다', `${filePath} — ${(e as Error).message}`, '「다른 이름으로 저장」으로 다시 시도해 주세요.');
        return null;
    }
}

// ──────────────────────────────────────────────── IPC — src/platform/types.ts 의 Platform 과 1:1

ipcMain.handle('platform:openDoc', () => doOpenDoc());
ipcMain.handle('platform:saveDoc', (_e, doc: Doc, filePath?: string) => doSaveDoc(doc, filePath));
ipcMain.handle('platform:saveDocAs', (_e, doc: Doc) => doSaveDocAs(doc));

ipcMain.handle('platform:autosave', async (_e, doc: Doc) => {
    try {
        await fsp.mkdir(userDataDir(), { recursive: true });
        await fsp.writeFile(autosaveFile(), JSON.stringify(doc), 'utf-8');
    } catch (e) {
        log(`자동저장 실패 — ${e}`); // autosave 는 실패해도 던지지 않는다 (계약)
    }
});

ipcMain.handle('platform:loadAutosave', async (): Promise<Doc | null> => {
    try {
        return migrateDoc(JSON.parse(await fsp.readFile(autosaveFile(), 'utf-8')));
    } catch {
        return null;
    }
});

ipcMain.handle('platform:exportFile', async (_e, name: string, data: string | Uint8Array) => {
    if (!mainWindow) return;
    const res = await dialog.showSaveDialog(mainWindow, { defaultPath: name });
    if (res.canceled || !res.filePath) return;
    try {
        const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
        await fsp.mkdir(path.dirname(res.filePath), { recursive: true });
        await fsp.writeFile(res.filePath, buf);
    } catch (e) {
        reportError('내보내기를 못 했습니다', `${res.filePath} — ${(e as Error).message}`, '다른 폴더로 다시 시도해 주세요.');
    }
});

ipcMain.handle('platform:importFile', async (_e, accept: string) => {
    if (!mainWindow) return null;
    const exts = (accept || '').split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean);
    const res = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: exts.length ? [{ name: '가져올 파일', extensions: exts }] : undefined,
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    try {
        const bytes = await fsp.readFile(filePath);
        return { name: path.basename(filePath), bytes: new Uint8Array(bytes) };
    } catch (e) {
        reportError('파일을 읽지 못했습니다', `${filePath} — ${(e as Error).message}`, '파일 형식을 확인해 주세요.');
        return null;
    }
});

ipcMain.handle('platform:print', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    win?.webContents.print({}, (ok, reason) => {
        if (!ok && reason) log(`인쇄 취소/실패 — ${reason}`);
    });
});

ipcMain.handle('platform:recentFiles', () => readRecent());

// ──────────────────────────────────────────────── 메뉴
//   파일 메뉴의 열기는 여기서 바로 처리(다이얼로그가 main 소관)하고 결과를 렌더러로 보낸다.
//   새로/저장/다른 이름으로는 문서 상태가 렌더러(store)에 있으니 이벤트만 보낸다 — 화면 판이
//   window.shiftgridMenu.onAction 으로 받으면 실제로 동작한다(선택적 확장 지점, preload.ts 참고).

let mainWindow: BrowserWindow | null = null;

function sendMenu(action: string, payload?: unknown): void {
    mainWindow?.webContents.send('shiftgrid:menu', action, payload);
}

function buildMenu(): void {
    const template: MenuItemConstructorOptions[] = [];

    if (process.platform === 'darwin') {
        template.push({
            label: app.name,
            submenu: [
                { role: 'about', label: `${app.name} 정보` },
                { type: 'separator' },
                { role: 'services', label: '서비스' },
                { type: 'separator' },
                { role: 'hide', label: '가리기' },
                { role: 'hideOthers', label: '다른 항목 가리기' },
                { role: 'unhide', label: '모두 보기' },
                { type: 'separator' },
                { role: 'quit', label: '끝내기' },
            ],
        });
    }

    template.push(
        {
            label: '파일',
            submenu: [
                { label: '새로', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
                {
                    label: '열기', accelerator: 'CmdOrCtrl+O', click: async () => {
                        const opened = await doOpenDoc();
                        if (opened) sendMenu('open', opened);
                    },
                },
                { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
                { label: '다른 이름으로', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('saveAs') },
                { type: 'separator' },
                { label: '인쇄', accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.print() },
                { type: 'separator' },
                { role: 'quit', label: '끝내기' },
            ],
        },
        {
            label: '편집',
            submenu: [
                { role: 'undo', label: '되돌리기' },
                { role: 'redo', label: '다시하기' },
                { type: 'separator' },
                { role: 'cut', label: '잘라내기' },
                { role: 'copy', label: '복사' },
                { role: 'paste', label: '붙여넣기' },
                { role: 'selectAll', label: '전체 선택' },
            ],
        },
        {
            label: '보기',
            submenu: [
                { role: 'zoomIn', label: '확대' },
                { role: 'zoomOut', label: '축소' },
                { role: 'resetZoom', label: '원래 크기' },
                { type: 'separator' },
                { role: 'toggleDevTools', label: '개발자 도구' },
            ],
        },
    );

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ──────────────────────────────────────────────── 창

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: '시간표 짜기',
        backgroundColor: '#10151c',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
        reportError(
            '화면을 불러오지 못했습니다',
            `code=${code} ${desc}`,
            isDev ? 'vite dev 서버(npm run dev:app)가 켜져 있는지 확인해 주세요.' : '설치본이 손상됐을 수 있습니다. 다시 설치해 주세요.',
        );
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist-app/index.html'));
    }
}

app.whenReady().then(() => {
    log(`기동 — v${app.getVersion()} · ${isDev ? '개발' : '배포'} · ${process.platform}/${process.arch}`);
    buildMenu();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}).catch((e) => reportError('앱을 시작하지 못했습니다', String(e), '다시 실행해 주세요.'));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
