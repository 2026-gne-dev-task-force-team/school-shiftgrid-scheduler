/**
 * 화면 찍기 — 빌드된 앱(dist-app)을 Electron 으로 띄워 화면마다 PNG 를 남긴다.
 * 스크린샷 도구가 없는 자리(헤드리스 세션)에서 「진짜로 어떻게 보이나」를 보는 유일한 눈.
 *   사용: npx electron build/shot.cjs [출력폴더] [--theme dark] [--solve]
 * 화면 전환은 store 를 못 건드리니, 홈에서 「샘플 학교로 둘러보기」를 누르고 왼쪽 탭을 차례로 눌러 찍는다(버튼 글자로 찾는다).
 * 환영 화면·코치마크가 떠 있으면 먼저 [건너뛰기] 를 누른다.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const out = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'shots');
const theme = args.includes('--theme') ? (args[args.indexOf('--theme') + 1] || 'light') : 'light';
const suffix = theme === 'dark' ? '-dark' : '';
const bg = theme === 'dark' ? '#10151c' : '#f4f6f9';
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}${suffix}.png`), img.toPNG());
    console.log('찍음', `${name}${suffix}`);
}

async function click(win, text) {
    return win.webContents.executeJavaScript(`(() => {
        const els = [...document.querySelectorAll('button, a, [role=button]')];
        // 같은 글자가 여럿이면 마지막 것 — 모달·서랍·코치마크는 DOM 뒤쪽에 그려진다
        const el = els.filter(e => (e.textContent || '').replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})).pop();
        if (!el) return '없음: ' + ${JSON.stringify(text)};
        el.click(); return 'ok';
    })()`);
}

async function clickSel(win, sel) {
    return win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return '없음: ' + ${JSON.stringify(sel)}; el.click(); return 'ok'; })()`);
}
async function press(win, key) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key }); }

/** 환영 화면·코치마크가 떠 있으면 [건너뛰기] 를 눌러 치운다 */
async function dismissOnboarding(win) {
    for (let i = 0; i < 12; i++) {
        const r = await click(win, '건너뛰기');
        if (r !== 'ok') break;
        await sleep(150);
    }
}

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 1400, height: 900, show: false, backgroundColor: bg,
        // 숨긴 창은 그리기가 느려져 옆 탭 강조가 한 박자 늦게 찍혔다 — 스로틀을 끈다
        webPreferences: { preload: path.join(__dirname, '..', 'dist-electron', 'preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    await win.loadFile(path.join(__dirname, '..', 'dist-app', 'index.html'));
    await sleep(400);
    // 테마를 저장하고 다시 읽어 적용한다(밝은/어두운 각각 찍기)
    await win.webContents.executeJavaScript(`localStorage.setItem('shiftgrid.theme', ${JSON.stringify(theme)}); localStorage.removeItem('shiftgrid.autosave.v2'); true`);
    await win.webContents.reload();
    await sleep(700);
    // ── 처음 안내 (--onboarding): 환영 3장 → 「샘플 학교로 둘러보기」 → 코치마크 3단계 → 도움말 서랍 3탭
    if (args.includes('--onboarding')) {
        await win.webContents.executeJavaScript(`localStorage.removeItem('shiftgrid.welcomed'); localStorage.removeItem('shiftgrid.toured'); localStorage.removeItem('shiftgrid.autosave.v2'); true`);
        await win.webContents.reload();
        await sleep(800);
        await shot(win, '0-welcome-1');
        console.log('다음', await click(win, '다음')); await sleep(300); await shot(win, '0-welcome-2');
        console.log('다음', await click(win, '다음')); await sleep(300); await shot(win, '0-welcome-3');
        console.log('둘러보기', await click(win, '샘플 학교로 둘러보기')); await sleep(900);
        await shot(win, '0-tour-1');
        console.log('다음', await click(win, '다음')); await sleep(700); await shot(win, '0-tour-2');
        console.log('다음', await click(win, '다음')); await sleep(700); await shot(win, '0-tour-3');
        console.log('다음', await click(win, '다음')); await sleep(700); await shot(win, '0-tour-4');
        await dismissOnboarding(win);
        console.log('도움말', await clickSel(win, '[data-tour="topbar-help"]')); await sleep(400); await shot(win, '0-help-screen');
        console.log('용어', await click(win, '용어')); await sleep(300); await shot(win, '0-help-glossary');
        console.log('설명서', await click(win, '사용 설명서')); await sleep(300); await shot(win, '0-help-manual');
        console.log('서랍 닫기', await clickSel(win, 'button[aria-label="닫기"]')); await sleep(300);
        await win.webContents.executeJavaScript(`localStorage.setItem('shiftgrid.welcomed', '1'); localStorage.setItem('shiftgrid.toured', '1'); true`);
        console.log('홈', await clickSel(win, 'header button')); await sleep(400);
    }
    await dismissOnboarding(win);
    await shot(win, '1-home');
    console.log(await click(win, '샘플 학교'));
    await sleep(300);
    await click(win, '지우기'); // 자료가 있으면 「덮을까요?」 확인이 한 번 더 뜬다
    await sleep(600);
    await dismissOnboarding(win);
    await shot(win, '1-home-sample');
    // 기초자료 소절들
    for (const [label, name] of [['시간 틀', '2-basic-specs'], ['교사', '2-basic-agents'], ['반', '2-basic-tracks'], ['특별실', '2-basic-rooms'], ['시수표', '2-basic-demands']]) {
        console.log(label, await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-tour="basic-subtabs"] button')].filter(x => x.textContent.trim() === ${JSON.stringify(label)}).pop(); if (!b) return '없음'; b.click(); return 'ok'; })()`));
        await sleep(400); await shot(win, name);
    }
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-tour="basic-subtabs"] button')].filter(x => x.textContent.trim() === '학교').pop(); if (b) b.click(); })()`);
    const tabs = [['기초자료', '2-basic'], ['고정·금지', '3-blocks'], ['자동 배정', '4-generate'], ['점검', '5-diagnose'], ['직접 조정', '6-edit'], ['시안', '7-boards'], ['인쇄·내보내기', '8-export']];
    for (const [label, name] of tabs) {
        console.log(label, await click(win, label));
        await sleep(500);
        await dismissOnboarding(win);
        await shot(win, name);
    }

    // ── 끝까지 한 번: 자동 배정 → 후보 적용 → 점검 → 직접 조정 → 인쇄 (--solve 를 주면)
    if (args.includes('--solve')) {
        console.log('자동 배정 탭', await click(win, '자동 배정'));
        await sleep(300);
        console.log('자동 배정 시작', await click(win, '자동 배정 시작'));
        for (let i = 0; i < 90; i++) {           // 최대 90초 기다린다
            await sleep(1000);
            const r = await click(win, '이 후보로');
            if (r === 'ok') { console.log('후보 적용 (', i + 1, '초 )'); break; }
            if (i === 45) await shot(win, '9-solve-progress');
        }
        await sleep(600);
        await shot(win, '9-generate-after');
        const status = await win.webContents.executeJavaScript(`document.querySelector('footer, [data-status]')?.textContent || document.body.innerText.split('\\n').filter(l => l.includes('필수 위반'))[0] || ''`);
        console.log('상태줄:', status);
        for (const [label, name] of [['점검', '9-diagnose-after'], ['직접 조정', '9-edit-after'], ['인쇄·내보내기', '9-export-after']]) {
            console.log(label, await click(win, label));
            await sleep(600);
            await shot(win, name);
            if (label === '직접 조정') {
                // 수업 하나를 선택해 색 범례·사유 툴팁 상태를 찍는다
                const r = await win.webContents.executeJavaScript(`(() => { const el = [...document.querySelectorAll('.grid-cell')].find(e => e.textContent && !e.textContent.includes('빈 칸') && !e.textContent.includes('🔒')); if (!el) return '없음'; el.click(); return 'ok'; })()`);
                console.log('수업 선택', r); await sleep(700); await shot(win, '9-edit-held');
                await press(win, 'Escape'); await sleep(200);
                console.log('교사별', await click(win, '교사별')); await sleep(500); await shot(win, '9-edit-agent');
            }
            if (label === '점검') {
                const r = await win.webContents.executeJavaScript(`(() => { const tr = document.querySelector('[data-tour="diagnose-table"] tbody tr'); if (!tr) return '없음'; tr.click(); return 'ok'; })()`);
                console.log('규칙 펼침', r); await sleep(400); await shot(win, '9-diagnose-open');
            }
        }
        console.log('고정·금지', await click(win, '고정·금지')); await sleep(400);
        // 교사 격자(시각 축)
        await win.webContents.executeJavaScript(`(() => { const sel = document.querySelector('select'); if (!sel) return; const k = Object.keys(sel).find(x => x.startsWith('__reactProps')); if (k && sel[k].onChange) sel[k].onChange({ target: { value: 'agent' } }); })()`);
        await sleep(500); await shot(win, '9-blocks-agent');
    }
    app.quit();
});
