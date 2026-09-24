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
        width: 390, height: 844, show: false, backgroundColor: '#10151c',
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

    // ── 폰 전용: 기초자료의 「배정 현황」 버튼 → 시트
    console.log('기초자료', await click(win, '기초자료'));
    await sleep(400);
    console.log('배정현황버튼', await click(win, '배정 현황'));
    await sleep(400);
    await shot(win, '2-basic-demand-sheet');
    console.log('시트닫기', await click(win, '닫기'));
    await sleep(300);

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
        for (const [label, name] of [['진단', '9-diagnose-after'], ['편집', '9-edit-after']]) {
            console.log(label, await click(win, label));
            await sleep(600);
            await shot(win, name);
        }

        // ── 폰 전용: 진단의 규칙 파라미터 모달(gear)도 한 번
        console.log('진단', await click(win, '진단'));
        await sleep(400);
        const gearR = await win.webContents.executeJavaScript(`(() => {
            const btn = document.querySelector('button[title="파라미터"]');
            if (!btn) return '없음';
            btn.click(); return 'ok';
        })()`);
        console.log('gear', gearR);
        await sleep(400);
        await shot(win, '9-diagnose-rule-modal-mobile');
        console.log('시트닫기', await click(win, '닫기'));
        await sleep(300);

        // ── 폰 전용: 두 번 탭 이동(held 툴바 · 이동 미리보기 시트) 한 번 찍어 본다
        const cellR = await win.webContents.executeJavaScript(`(() => {
            const cells = [...document.querySelectorAll('td div.cursor-pointer')];
            const filled = cells.find(c => !c.textContent.includes('빈 칸') && c.textContent.trim());
            if (!filled) return '채워진 칸 없음';
            filled.click(); return 'ok:' + filled.textContent.trim();
        })()`);
        console.log('칸 집기', cellR);
        await sleep(400);
        await shot(win, '9-edit-held-mobile');
        const cellR2 = await win.webContents.executeJavaScript(`(() => {
            const cells = [...document.querySelectorAll('td div.cursor-pointer')];
            const empty = cells.find(c => c.textContent.includes('빈 칸'));
            if (!empty) return '빈 칸 없음';
            empty.click(); return 'ok';
        })()`);
        console.log('빈 칸 두 번째 탭', cellR2);
        await sleep(400);
        await shot(win, '9-edit-preview-mobile');

        console.log('출력', await click(win, '출력'));
        await sleep(600);
        await shot(win, '9-export-after');
    }
    app.quit();
});
