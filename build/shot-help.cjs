/**
 * 도움말 화면 찍기 + 팝오버 자리 검사 — 빌드된 앱(dist-app)을 Electron 으로 띄워
 *   ⓘ 팝오버가 뷰포트 안에 들어오는지(잘리지 않는지) getBoundingClientRect 로 PASS/FAIL 을 찍는다.
 *   헤드리스 세션의 유일한 눈. build/shot.cjs 를 본떴다.
 *   사용: npm run build:app && npx electron build/shot-help.cjs
 *   결과: shots-help/*.png · 콘솔에 PASS/FAIL · FAIL 이 하나라도 있으면 exit 1.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = path.join(__dirname, '..', 'shots-help');
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;

async function shot(win, name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    console.log('찍음', name);
}

async function click(win, text) {
    return win.webContents.executeJavaScript(`(() => {
        const els = [...document.querySelectorAll('button, a, [role=button]')];
        const el = els.filter(e => (e.textContent || '').replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})).pop();
        if (!el) return '없음: ' + ${JSON.stringify(text)};
        el.click(); return 'ok';
    })()`);
}

async function runJs(win, js) { return win.webContents.executeJavaScript(js); }
// ⚠️ Escape 는 Shell 에서 「홈으로」라 화면을 떠난다. 또 .click() 은 mousedown 을 안 쏴서 팝오버가
//    저절로 닫히지 않는다 — body 에 mousedown 을 직접 쏴 연 팝오버를 닫는다(모달은 안 닫힌다).
async function closePopovers(win) {
    await runJs(win, `document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`);
    await sleep(150);
}
async function closeModal(win) {
    await runJs(win, `(() => { const b=[...document.querySelectorAll('button[aria-label="닫기"]')].pop(); if(b) b.click(); return 'ok'; })()`);
    await sleep(200);
}

async function dismissOnboarding(win) {
    for (let i = 0; i < 12; i++) {
        const r = await click(win, '건너뛰기');
        if (r !== 'ok') break;
        await sleep(150);
    }
}

/** 환영 모달([data-welcome])의 rect 를 재서 뷰포트 안인지 PASS/FAIL.
 *  narrowOnly 면 좌우는 보지 않고 top/bottom 만 본다(좁은 창은 max-h-[94vh] overflow-auto 라 세로만 문제). */
async function checkWelcome(win, name, narrowOnly) {
    const rect = await runJs(win, `(() => {
        const el = document.querySelector('[data-welcome]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
    })()`);
    if (!rect) {
        fails++; console.log('FAIL', name, '(환영 모달 없음)');
    } else {
        const ok = narrowOnly
            ? (rect.top >= 0 && rect.bottom <= rect.h)
            : (rect.right <= rect.w && rect.left >= 0 && rect.bottom <= rect.h && rect.top >= 0);
        if (!ok) fails++;
        console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(rect));
    }
    await shot(win, name);
}

/** 환영 걸음 안내를 0장 → 시수표 장(3) → 직접 조정 장(7)으로 넘기며 자리 검사 */
async function walkWelcome(win, narrowOnly, suffix) {
    await checkWelcome(win, 'help-0a-welcome-1' + suffix, narrowOnly);   // 0장 (세 걸음)
    await click(win, '다음'); await sleep(250);
    await click(win, '다음'); await sleep(250);
    await checkWelcome(win, 'help-0b-welcome-3' + suffix, narrowOnly);   // 3번째 장 (시수표)
    for (let i = 0; i < 4; i++) { await click(win, '다음'); await sleep(220); }
    await checkWelcome(win, 'help-0c-welcome-7' + suffix, narrowOnly);   // 7번째 장 (직접 조정)
}

/** [role="dialog"] 팝오버의 rect 를 재서 뷰포트 안에 들어오는지 PASS/FAIL */
async function checkPopover(win, name) {
    const rect = await runJs(win, `(() => {
        const el = [...document.querySelectorAll('[role="dialog"]')].pop();
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: window.innerWidth, h: window.innerHeight };
    })()`);
    if (!rect) {
        fails++; console.log('FAIL', name, '(팝오버 없음)');
    } else {
        const ok = rect.right <= rect.w && rect.left >= 0 && rect.bottom <= rect.h && rect.top >= 0;
        if (!ok) fails++;
        console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(rect));
    }
    await shot(win, name);
}

// ── 자주 쓰는 클릭 JS ─────────────────────────────────────────
const CLICK_SUBTAB = (label) => `(() => { const b=[...document.querySelectorAll('[data-tour="basic-subtabs"] button')].filter(x=>x.textContent.trim()===${JSON.stringify(label)}).pop(); if(!b) return '없음'; b.click(); return 'ok'; })()`;
const CLICK_DEMAND_INFO = `(() => { const b=[...document.querySelectorAll('[data-tour="demand-status"] button[aria-label="설명"]')].find(x=>x.getBoundingClientRect().width>0); if(!b) return '없음'; b.click(); return 'ok'; })()`;
const CLICK_STATUS_INFO = `(() => { const b=document.querySelector('[data-tour="status-bar"] button[aria-label="설명"]'); if(!b) return '없음'; b.click(); return 'ok'; })()`;
const CLICK_MAIN_INFO = `(() => { const b=[...document.querySelectorAll('button[aria-label="설명"]')].find(x=>x.getBoundingClientRect().width>0 && !x.closest('[data-tour="status-bar"]')); if(!b) return '없음'; b.click(); return 'ok'; })()`;
const CLICK_TAB = (label) => `(() => { const b=[...document.querySelectorAll('button, a, [role=button]')].filter(x=>x.textContent.replace(/\\s+/g,' ').trim()===${JSON.stringify(label)}).pop(); if(!b) return '없음'; b.click(); return 'ok'; })()`;

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 1400, height: 900, show: false, backgroundColor: '#f4f6f9',
        webPreferences: { preload: path.join(__dirname, '..', 'dist-electron', 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    await win.loadFile(path.join(__dirname, '..', 'dist-app', 'index.html'));
    await sleep(500);
    // 이전 실행이 userData 에 남긴 welcomed·toured 를 지우고 새로고침 → 환영이 처음처럼 뜬다
    await runJs(win, `localStorage.removeItem('shiftgrid.welcomed'); localStorage.removeItem('shiftgrid.toured'); localStorage.removeItem('shiftgrid.autosave.v2'); true`);
    await win.webContents.reload();
    await sleep(900);

    // ── 0) 환영 걸음 안내 — 처음 켰을 때 저절로 뜬다. 모달 자리 검사(1400×900 · 900×700 둘 다) ──
    await walkWelcome(win, false, '');
    // 좁은 창에서 다시 — welcomed 를 지운 채 새로고침하면 환영이 0장부터 다시 뜬다
    win.setSize(900, 700);
    await sleep(400);
    await runJs(win, `localStorage.removeItem('shiftgrid.welcomed'); localStorage.removeItem('shiftgrid.toured'); true`);
    await win.webContents.reload();
    await sleep(900);
    await walkWelcome(win, true, '-narrow');
    win.setSize(1400, 900);
    await sleep(400);

    // 환영·코치마크는 건너뛰고 앱으로. (help-8 에서 다시 처음 안내를 돌린다)
    await runJs(win, `localStorage.setItem('shiftgrid.welcomed','1'); localStorage.setItem('shiftgrid.toured','1'); localStorage.removeItem('shiftgrid.autosave.v2'); true`);
    await win.webContents.reload();
    await sleep(800);
    await dismissOnboarding(win);

    // 샘플 학교 로드
    console.log('샘플', await click(win, '샘플 학교'));
    await sleep(400);
    await click(win, '지우기');   // 자료가 있으면 「덮을까요?」 확인
    await sleep(700);
    await dismissOnboarding(win);

    // ── 1) 기초자료 → 시수표 → 배정/필요 ⓘ (오른쪽 열 — 잘리던 자리) @1400 ──
    console.log('기초자료', await click(win, '기초자료'));
    await sleep(400);
    console.log('시수표 소절', await runJs(win, CLICK_SUBTAB('시수표')));
    await sleep(400);
    console.log('배정/필요 ⓘ', await runJs(win, CLICK_DEMAND_INFO));
    await sleep(400);
    await checkPopover(win, 'help-1-demand-status');
    await closePopovers(win);

    // ── 2) 같은 검사 900×700 (좁은 창 — 모달 안에서) ──
    win.setSize(900, 700);
    await sleep(500);
    console.log('배정 현황 모달', await click(win, '배정 현황'));
    await sleep(400);
    console.log('배정/필요 ⓘ(좁게)', await runJs(win, CLICK_DEMAND_INFO));
    await sleep(400);
    await checkPopover(win, 'help-2-demand-status-narrow');
    await closePopovers(win);
    await closeModal(win);
    win.setSize(1400, 900);
    await sleep(500);

    // ── 3) 상태줄 ⓘ (아래 공간이 없어 위로 열려야 함) ──
    console.log('상태줄 ⓘ', await runJs(win, CLICK_STATUS_INFO));
    await sleep(400);
    await checkPopover(win, 'help-3-statusbar');
    await closePopovers(win);

    // ── 4) 자동 배정 화면 ⓘ ──
    console.log('자동 배정', await click(win, '자동 배정'));
    await sleep(500);
    console.log('자동 배정 ⓘ', await runJs(win, CLICK_MAIN_INFO));
    await sleep(400);
    await checkPopover(win, 'help-4-generate');
    await closePopovers(win);

    // ── 5~7) 도움말 서랍 — 이 화면 · 사용법 · 사용 설명서 ──
    console.log('도움말 서랍', await runJs(win, `(() => { const b=document.querySelector('[data-tour="topbar-help"]'); if(!b) return '없음'; b.click(); return 'ok'; })()`));
    await sleep(500);
    await shot(win, 'help-5-drawer-screen');
    console.log('사용법 탭', await runJs(win, CLICK_TAB('사용법')));
    await sleep(500);
    await shot(win, 'help-6-drawer-demos');
    console.log('사용 설명서 탭', await runJs(win, CLICK_TAB('사용 설명서')));
    await sleep(500);
    await shot(win, 'help-7-drawer-manual');

    // ── 8) 처음 안내 다시 보기 → 마지막 장까지 넘겨 둘러보기 → 코치마크 3단계 ──
    console.log('처음 안내 다시', await click(win, '처음 안내 다시 보기'));
    await sleep(500);
    // 환영 마지막 장(시작하기)까지 「다음」을 눌러 간다(장 수가 늘었다)
    for (let i = 0; i < 12; i++) { const r = await click(win, '다음'); if (r !== 'ok') break; await sleep(180); }
    console.log('둘러보기', await click(win, '샘플 학교로 둘러보기'));
    await sleep(900);
    await click(win, '다음'); await sleep(700);   // 코치마크 1 → 2
    await click(win, '다음'); await sleep(700);   // 코치마크 2 → 3
    // 코치마크 카드에 「이전」 버튼이 있는지(idx>0)
    const hasPrev = await runJs(win, `[...document.querySelectorAll('button')].some(b => (b.textContent || '').trim() === '이전')`);
    if (!hasPrev) fails++;
    console.log(hasPrev ? 'PASS' : 'FAIL', 'help-8-tour-prev', '(코치마크 이전 버튼)');
    await shot(win, 'help-8-tour-3');

    console.log(fails === 0 ? '\n모든 자리 검사 PASS' : `\n${fails}건 FAIL`);
    app.quit();
    app.exit(fails === 0 ? 0 : 1);
});
