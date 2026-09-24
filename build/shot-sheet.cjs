/**
 * 시트(엑셀식 편집) 화면 찍기 — 빌드된 앱(dist-app)을 Electron 으로 띄워 실제로 조작한다.
 *   사용: npx electron build/shot-sheet.cjs [출력폴더]
 * 헤드리스라 눈이 없으니, 시트가 개발/테스트에서만 여는 window.__sheet 훅으로 셀을 만지고
 * 단계마다 PNG 를 남긴다. localStorage.SHEET_TEST=1 을 켜고 새로고침해야 훅이 산다.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || path.join(__dirname, '..', 'shots-sheet');
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
        const el = els.find(e => (e.textContent||'').replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));
        if (!el) return '없음: ' + ${JSON.stringify(text)};
        el.click(); return 'ok';
    })()`);
}
const js = (win, code) => win.webContents.executeJavaScript(code);
async function sheetRows(win) { return js(win, `window.__sheet ? window.__sheet.state().rows : -1`); }

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 1400, height: 900, show: false, backgroundColor: '#10151c',
        webPreferences: { preload: path.join(__dirname, '..', 'dist-electron', 'preload.cjs'), contextIsolation: true, sandbox: true },
    });
    const indexFile = path.join(__dirname, '..', 'dist-app', 'index.html');
    await win.loadFile(indexFile);
    // 테스트 훅을 켜고 새로고침 — 그래야 window.__sheet 가 산다
    await js(win, `localStorage.setItem('SHEET_TEST','1')`);
    await win.loadFile(indexFile);
    await sleep(700);

    console.log('샘플', await click(win, '샘플 학교'));
    await sleep(500);

    // 시수표 탭으로
    console.log('시수표', await click(win, '시수표'));
    await sleep(500);
    console.log('훅?', await js(win, `!!window.__sheet`), '· 행수', await sheetRows(win));
    await shot(win, '1-demand-initial');

    // ① 셀 클릭 후 키 입력 → 편집 시작 (숫자 칸: 반당시수)
    await js(win, `window.__sheet.type('5', 0, 4);`);
    await sleep(250);
    await shot(win, '2-type-edit');
    await js(win, `document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(200);

    // ①-b 자동완성 (교사 이름 칸에서 '하' → 하늘·하람…)
    await js(win, `window.__sheet.type('하', 0, 0);`);
    await sleep(300);
    await shot(win, '3-autocomplete');
    await js(win, `document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(200);

    // ② TSV 붙이기 — 엑셀에서 복사한 두 줄을 맨 아래 빈 행부터. 행이 늘고 값이 들어간다
    const ghost = await sheetRows(win);
    await js(win, `window.__sheet.paste("가람\\t영어\\t5\\t1,2,3\\t3\\n누리\\t과학\\t5\\t전체\\t3", ${ghost}, 0);`);
    await sleep(400);
    console.log('붙인 뒤 행수', await sheetRows(win));
    await shot(win, '4-paste-tsv');

    // ③ 마지막 행에서 Enter → 새 행 (상태 반영을 위해 두 번에 나눠 부른다). 새 행이 보이게 아래로 스크롤
    const n = await sheetRows(win);
    await js(win, `window.__sheet.click(${n - 1}, 0);`);
    await sleep(150);
    await js(win, `window.__sheet.enter();`);
    await sleep(150);
    await js(win, `(document.activeElement && document.activeElement.scrollBy) ? document.activeElement.scrollBy(0, 99999) : (document.querySelector('.overflow-auto') || {}).scrollTop = 99999;`);
    await sleep(250);
    await shot(win, '5-enter-newrow');

    // ④ 범위 선택 후 Delete → 비워짐 (학년·반·반당시수 두 행)
    await js(win, `window.__sheet.select(0,2,1,4);`);
    await sleep(150);
    await js(win, `window.__sheet.clear();`);
    await sleep(150);
    await js(win, `window.__sheet.select(0,2,1,4);`);
    await sleep(200);
    await shot(win, '6-range-delete');

    // ⑤-a 없는 이름을 치면 「새로 만듭니다」 파란 테두리 (교사만 있는 미완성 행 0 — 위 ④에서 비워둔 행)
    await js(win, `window.__sheet.paste("가온누리", 0, 0);`);
    await sleep(150);
    await js(win, `window.__sheet.click(6, 1);`);   // 커서를 옮겨 파란 테두리만 남긴다
    await sleep(250);
    await shot(win, '7-new-name-note');

    // ⑤-b 잘못된 특별실(select) 붙이면 빨간 테두리
    await js(win, `window.__sheet.paste("없는특별실", 2, 5);`);
    await sleep(150);
    await js(win, `window.__sheet.click(6, 1);`);
    await sleep(250);
    await shot(win, '8-invalid-select');

    // 교사 시트도 한 장 (엔티티 시트가 격자로 바뀐 것 확인)
    console.log('교사', await click(win, '교사'));
    await sleep(400);
    await shot(win, '9-agents-sheet');

    // 특별실 시트에서 잘못된 「과목」 이름 붙이면 빨간 테두리
    console.log('특별실', await click(win, '특별실'));
    await sleep(400);
    await js(win, `window.__sheet.paste("없는과목", 0, 2);`);
    await sleep(300);
    await shot(win, '10-resources-bad-activity');

    // 반 시트
    console.log('반', await click(win, '반'));
    await sleep(400);
    await shot(win, '11-tracks-sheet');

    app.quit();
});
