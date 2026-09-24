/**
 * 화면 찍기 — 빌드된 앱(dist-app)을 Electron 으로 띄워 화면마다 PNG 를 남긴다.
 * 스크린샷 도구가 없는 자리(헤드리스 세션)에서 「진짜로 어떻게 보이나」를 보는 유일한 눈.
 *   사용: npx electron build/shot.cjs [출력폴더]
 * 화면 전환은 렌더러의 해시가 아니라 store 를 못 건드리니, 홈에서 「샘플 학교 불러오기」를 누르고
 * 왼쪽 탭을 차례로 눌러 찍는다(버튼 글자로 찾는다).
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || path.join(__dirname, '..', 'shots');
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    console.log('찍음', name);
}

async function click(win, text) {
    return win.webContents.executeJavaScript(`(() => {
        const els = [...document.querySelectorAll('button, a, [role=button]')];
        const el = els.find(e => (e.textContent || '').replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));
        if (!el) return '없음: ' + ${JSON.stringify(text)};
        el.click(); return 'ok';
    })()`);
}

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 1400, height: 900, show: false, backgroundColor: '#10151c',
        webPreferences: { preload: path.join(__dirname, '..', 'dist-electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
    });
    await win.loadFile(path.join(__dirname, '..', 'dist-app', 'index.html'));
    await sleep(800);
    await shot(win, '1-home');
    console.log(await click(win, '샘플 학교'));
    await sleep(600);
    await shot(win, '1-home-sample');
    const tabs = [['기초자료', '2-basic'], ['특별작업', '3-blocks'], ['생성', '4-generate'], ['진단', '5-diagnose'], ['편집', '6-edit'], ['판', '7-boards'], ['출력', '8-export']];
    for (const [label, name] of tabs) {
        console.log(label, await click(win, label));
        await sleep(500);
        await shot(win, name);
    }

    // ── 끝까지 한 번: 자동 배정 → 후보 적용 → 진단 → 편집 → 출력 (--solve 를 주면)
    if (process.argv.includes('--solve')) {
        console.log('생성', await click(win, '생성'));
        await sleep(300);
        console.log('자동 배정', await click(win, '자동 배정'));
        for (let i = 0; i < 90; i++) {           // 최대 90초 기다린다
            await sleep(1000);
            const r = await click(win, '이 후보로');
            if (r === 'ok') { console.log('후보 적용 (', i + 1, '초 )'); break; }
            if (i === 45) await shot(win, '9-solve-progress');
        }
        await sleep(600);
        await shot(win, '9-generate-after');
        const status = await win.webContents.executeJavaScript(`document.querySelector('footer, [data-status]')?.textContent || document.body.innerText.split('\\n').filter(l => l.includes('하드 위반'))[0] || ''`);
        console.log('상태줄:', status);
        for (const [label, name] of [['진단', '9-diagnose-after'], ['편집', '9-edit-after'], ['출력', '9-export-after']]) {
            console.log(label, await click(win, label));
            await sleep(600);
            await shot(win, name);
        }
    }
    app.quit();
});
