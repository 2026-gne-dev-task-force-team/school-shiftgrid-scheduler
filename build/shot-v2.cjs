/**
 * v2 작업대 화면 찍기 — 넓은 화면과 폰 화면을 같은 빌드로 나란히 본다.
 *   사용: npx electron build/shot-v2.cjs [출력폴더]
 * 🔴 「고쳤다」와 「보인다」는 다르다. 패널·서랍은 눈으로 봐야 판정이 선다.
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const out = process.argv[2] || path.join(__dirname, '..', 'shots', 'v2');
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
    console.log('찍음', name);
}

/** 글자 또는 title 로 단추를 찾아 누른다 */
async function click(win, needle) {
    return win.webContents.executeJavaScript(`(() => {
        const els = [...document.querySelectorAll('button, a, [role=button]')];
        const hit = els.find(e => ((e.textContent||'') + ' ' + (e.title||'') + ' ' + (e.getAttribute('aria-label')||''))
            .replace(/\\s+/g,' ').includes(${JSON.stringify(needle)}));
        if (!hit) return '없음: ' + ${JSON.stringify(needle)};
        hit.click(); return 'ok';
    })()`);
}

/** 손잡이를 잡고 dx 만큼 끈다(합성 pointer 이벤트). index 0=탐색기, 1=속성 */
async function dragHandle(win, index, dx) {
    return win.webContents.executeJavaScript(`(() => {
        const h = document.querySelectorAll('[role=separator]')[${index}];
        if (!h) return '손잡이 없음';
        const r = h.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const mk = (t, cx) => new PointerEvent(t, { bubbles: true, cancelable: true,
            clientX: cx, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true });
        h.dispatchEvent(mk('pointerdown', x));
        h.dispatchEvent(mk('pointermove', x + (${dx})));
        h.dispatchEvent(mk('pointerup', x + (${dx})));
        return 'ok';
    })()`);
}

/** selector 로 찾은 nth 번째 요소에 오른쪽 클릭(contextmenu) 이벤트를 쏜다 — 줄·열 머리 메뉴를 연다 */
async function rightClick(win, selector, nth = 0) {
    return win.webContents.executeJavaScript(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const el = els[${nth}];
        if (!el) return '없음: ' + ${JSON.stringify(selector)} + '[' + ${nth} + ']';
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
        return 'ok';
    })()`);
}

/** 글자가 든 <label> 안의 체크박스를 원하는 값으로 맞춘다("점심 넣기" 등) */
async function setCheckbox(win, needle, checked) {
    return win.webContents.executeJavaScript(`(() => {
        const labels = [...document.querySelectorAll('label')];
        const lab = labels.find(l => (l.textContent || '').replace(/\\s+/g, ' ').includes(${JSON.stringify(needle)}));
        if (!lab) return '없음: ' + ${JSON.stringify(needle)};
        const input = lab.querySelector('input[type=checkbox]');
        if (!input) return '체크박스 없음';
        if (input.checked !== ${checked}) input.click();
        return 'ok:' + input.checked;
    })()`);
}

/** 손가락(행 경계) 끌기 — dyPx 만큼 세로로 끈다(합성 pointer 이벤트) */
async function dragRowResize(win, nth, dyPx) {
    return win.webContents.executeJavaScript(`(() => {
        const h = document.querySelectorAll('[data-testid=row-resize]')[${nth}];
        if (!h) return '손잡이 없음';
        const r = h.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const mk = (t, cy) => new PointerEvent(t, { bubbles: true, cancelable: true,
            clientX: x, clientY: cy, pointerId: 1, pointerType: 'mouse', isPrimary: true });
        h.dispatchEvent(mk('pointerdown', y));
        h.dispatchEvent(mk('pointermove', y + (${dyPx})));
        h.dispatchEvent(mk('pointerup', y + (${dyPx})));
        return 'ok';
    })()`);
}

/** 격자 구조를 수치로 — 줄 머리 수·열 머리 수·쉬는 틈 수 */
async function probeGrid(win) {
    return win.webContents.executeJavaScript(`(() => {
        return JSON.stringify({
            줄: document.querySelectorAll('[data-testid=row-head]').length,
            열: document.querySelectorAll('[data-testid=col-head]').length,
            틈: document.querySelectorAll('[data-testid=gap-row]').length,
        });
    })()`);
}

/** 화면 상태를 한 줄로 — 눈으로 못 세는 것을 수치로 센다 */
async function probe(win) {
    return win.webContents.executeJavaScript(`(() => {
        const asides = [...document.querySelectorAll('aside')].map(a => Math.round(a.getBoundingClientRect().width));
        const main = document.querySelector('main');
        const drawerCount = document.querySelectorAll('.fixed.inset-0').length;
        return JSON.stringify({
            창: innerWidth + 'x' + innerHeight,
            옆패널폭: asides,
            가운데폭: main ? Math.round(main.getBoundingClientRect().width) : null,
            서랍: drawerCount,
            가로넘침: document.documentElement.scrollWidth > innerWidth,
        });
    })()`);
}

app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1280, height: 800, show: false, backgroundColor: '#f4f6f9' });
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    // 🔴 Electron 은 실행 간에 localStorage 를 들고 다닌다 — 지난 실행의 패널 폭·자동 보관이 이번 수치를 오염시킨다
    //    (10-19 실측: 앞 실행의 「상한 넘겨 끌기」 520px 이 다음 실행의 첫 화면에 그대로 떴다). 깨끗한 자리에서 다시 연다.
    await win.webContents.executeJavaScript('localStorage.clear(); location.reload(); 0');
    await sleep(900);

    // ── 넓은 화면 ──
    console.log('[넓은 화면]', await probe(win));
    await shot(win, '1-wide-빈작업대');

    console.log('새 표:', await click(win, '새 표'));
    await sleep(400);
    await shot(win, '2-wide-표하나');
    console.log('[표 하나]', await probe(win));
    console.log('[새 표 격자]', await probeGrid(win)); // 설계: 5열 × 6줄, 점심 없음

    // ── 모듈 2 — 줄 머리 오른쪽 클릭 → 줄 메뉴 → 아래 줄 넣기 ──
    console.log('줄 머리 오른쪽 클릭:', await rightClick(win, '[data-testid=row-head]', 0));
    await sleep(200);
    await shot(win, '2b-wide-줄메뉴');
    console.log('아래 줄 넣기:', await click(win, '아래 줄 넣기'));
    await sleep(200);
    console.log('[줄 넣은 뒤]', await probeGrid(win)); // 7줄이어야 한다

    // ── 열 머리 오른쪽 클릭 → 열 메뉴 → 오른쪽에 열 넣기 ──
    console.log('열 머리 오른쪽 클릭:', await rightClick(win, '[data-testid=col-head]', 0));
    await sleep(200);
    await shot(win, '2c-wide-열메뉴');
    console.log('오른쪽에 열 넣기:', await click(win, '오른쪽에 열 넣기'));
    await sleep(200);
    console.log('[열 넣은 뒤]', await probeGrid(win)); // 6열이어야 한다
    await shot(win, '2d-wide-줄열넣은뒤');

    // ── 행 경계 끌기 — 첫 줄을 20px(≈18분→5분 스냅 15~20분) 늘린다 ──
    console.log('행 경계 끌기:', await dragRowResize(win, 0, +20));
    await sleep(200);
    await shot(win, '2e-wide-행끌기');

    // ── 도구 상자 — 「학교 수업 시간」 컴포넌트 꽂기 → 점심 켜기 → 적용 ──
    console.log('꽂기:', await click(win, '꽂기'));
    await sleep(200);
    console.log('학교 수업 시간 고르기:', await click(win, '학교 수업 시간'));
    await sleep(200);
    await shot(win, '2f-wide-컴포넌트폼');
    console.log('점심 넣기 체크:', await setCheckbox(win, '점심 넣기', true));
    await sleep(150);
    await shot(win, '2g-wide-점심체크');
    console.log('적용:', await click(win, '적용'));
    await sleep(250);
    await shot(win, '2h-wide-적용후');
    console.log('[적용 후 격자]', await probeGrid(win)); // 수업 6 + 점심 1 = 7줄, 열은 그대로

    console.log('탐색기 접기:', await click(win, '탐색기 접기/펴기'));
    await sleep(300);
    await shot(win, '3-wide-탐색기접음');
    console.log('[탐색기 접음]', await probe(win));

    console.log('속성 접기:', await click(win, '속성 접기/펴기'));
    await sleep(300);
    await shot(win, '4-wide-둘다접음');
    console.log('[둘 다 접음]', await probe(win));

    console.log('탐색기 펴기:', await click(win, '탐색기 펴기'));
    console.log('속성 펴기:', await click(win, '속성 펴기'));
    await sleep(300);
    await shot(win, '5-wide-다시폄');
    console.log('[다시 폄]', await probe(win));

    // 손잡이로 폭 끌기 — 왼쪽은 오른쪽으로 +120, 오른쪽은 왼쪽으로 −100
    console.log('왼쪽 끌기:', await dragHandle(win, 0, +120));
    console.log('오른쪽 끌기:', await dragHandle(win, 1, -100));
    await sleep(300);
    await shot(win, '5b-wide-폭끌기');
    console.log('[폭 끈 뒤]', await probe(win));

    // 상한을 넘겨 끌어도 가둬지나
    console.log('왼쪽 과하게:', await dragHandle(win, 0, +3000));
    await sleep(200);
    console.log('[상한 넘겨 끔]', await probe(win));

    // ── 폰 화면 ──
    win.setSize(390, 844);
    await sleep(700);
    await shot(win, '6-phone-기본');
    console.log('[폰 기본]', await probe(win));

    console.log('☰:', await click(win, '탐색기 접기/펴기'));
    await sleep(400);
    await shot(win, '7-phone-탐색기서랍');
    console.log('[폰 탐색기 서랍]', await probe(win));

    // 서랍 밖(덮개)을 눌러 닫는다
    console.log('닫기:', await click(win, '탐색기 닫기'));
    await sleep(300);
    console.log('속성:', await click(win, '속성 접기/펴기'));
    await sleep(400);
    await shot(win, '8-phone-속성서랍');
    console.log('[폰 속성 서랍]', await probe(win));

    console.log('닫기:', await click(win, '속성 닫기'));
    await sleep(300);
    console.log('더 보기:', await click(win, '더 보기'));
    await sleep(300);
    await shot(win, '9-phone-더보기');

    app.quit();
}).catch((e) => { console.error(e); app.quit(); });
