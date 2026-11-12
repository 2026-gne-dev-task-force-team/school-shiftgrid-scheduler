/**
 * 구조 검사 — 「반복적으로 색을 줄줄이 박지 말라」를 주석이 아니라 돌아가는 검사로 내린다.
 *   ① features·shell 안에 하드코딩 색 0건 (색은 조각층의 토큰으로만)
 *   ② primitives 가 features·shell 을 import 0건 (층은 아래로만 의존한다)
 *   ③ 호버-숨김(group-hover)은 Row 조각 한 곳에만 — 다른 데 나오면 실패
 *
 * 🔴 이 검사 자체가 정규식 문자열로 금지 패턴을 품고 있으니, 검사 폴더(__tests__)는 스캔 대상에서 뺀다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename, dirname, relative, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');

/** dir 아래 .ts/.tsx 파일을 모은다. __tests__ 는 건너뛴다(검사 자신이 금지 문자열을 품는다) */
function walk(dir: string): string[] {
    let out: string[] = [];
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === '__tests__' || e.name === 'node_modules') continue;
            if (e.name === 'legacy' && dir.endsWith('v1-editor')) continue;   // v1 편성기 사본은 검사에서 뺀다(설계 ① 2-1 · 손대지 않는 사본)
            out = out.concat(walk(p));
        } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

const read = (p: string) => readFileSync(p, 'utf-8');

/**
 * 🍳 후라이팬 이사(2026-11-10) — 「코어」는 pane-ui-system/core/ 폴더 하나다(내부 코어 플러그인: 매니페스트·definePlugin 꼴 그대로).
 *   CORE      = pane-ui-system/core 아래 전부 — 플러그인과 같은 결(매니페스트·host)로 지어져 플러그인 검사를 같이 받는다
 *   ENGINE    = pane-ui-system 에서 core 를 뺀 것 — 엔진. 바깥·core 를 모르고 도메인 낱말도 모른다(⑦a·⑤)
 *   PLUGINLIKE = plugins + core — 「꾸러미 꼴」 검사(①⑩⑭⑯⑰⑱)의 스캔 범위. ⚠️ 안 넓히면 이사한 코드가 조용히 검사 밖으로 빠진다.
 */
const CORE_DIR = join(ROOT, 'pane-ui-system', 'core');
const CORE = walk(CORE_DIR);
const ENGINE = walk(join(ROOT, 'pane-ui-system')).filter((f) => !f.startsWith(CORE_DIR + sep));
const PLUGINLIKE = [...walk(join(ROOT, 'plugins')), ...CORE];

describe('① app·shell·plugins 에 하드코딩 색 0건', () => {
    // #rrggbb · rgb( · bg-gray- · text-gray- · border-gray-
    // 🔴 plugins 도 본다 — 뷰가 제멋대로 색을 박으면 테마가 안 먹는다(팬 UI 엔진 테스트의 색 글자도 토큰으로만).
    const BANNED = /#[0-9a-fA-F]{3,8}\b|rgb\(|\b(?:bg|text|border)-gray-/;
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'pane-ui-system', 'shell')), ...PLUGINLIKE];

    it('스캔할 파일이 실제로 있다(빈 글롭이 거짓 통과를 주지 않게)', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`색 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln: string) => BANNED.test(ln));
            expect(hit, `하드코딩 색이 ${hit + 1}번째 줄에 있다 — 토큰 클래스(bg-panel 등)를 쓴다`).toBe(-1);
        });
    }
});

describe('② primitives 는 features·shell 을 import 하지 않는다 (아래로만 의존)', () => {
    const IMPORT_UP = /from\s+['"][^'"]*(?:\/features\/|\/shell\/|\.\.\/shell|\.\.\/features)[^'"]*['"]/;
    const files = walk(join(ROOT, 'pane-ui-system', 'primitives'));

    it('스캔할 조각 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`위로 의존 없음: ${basename(f)}`, () => {
            expect(IMPORT_UP.test(read(f)), `${basename(f)} 가 상위 층을 import 한다`).toBe(false);
        });
    }
});

describe('③ 호버-숨김(group-hover)은 Row 조각 한 곳에만', () => {
    // 이 파일 자신이 금지 문자열을 품지 않게 조각으로 조립한다
    const NEEDLE = 'group' + '-hover';
    const files = walk(ROOT).filter((f) => basename(f) !== 'Row.tsx');

    it('Row.tsx 밖에는 group-hover 가 없다', () => {
        const offenders = files.filter((f) => read(f).includes(NEEDLE));
        expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
    });

    it('Row.tsx 에는 실제로 group-hover 가 있다(패턴이 중앙에 산다는 증거)', () => {
        expect(read(join(ROOT, 'pane-ui-system', 'primitives', 'Row.tsx')).includes(NEEDLE)).toBe(true);
    });
});

/*
 * ⑤⑦ pane-ui-system 은 통째로 떼어 갈 수 있어야 한다 (쥔님 2026-10-31:
 *    *"이 UI 엔진은 UI 폴더에 그대로 박지 말고 따로 폴더로 관리해줘"*).
 *    그 말이 참이려면 두 가지가 동시에 성립해야 한다:
 *      ⑦ 안에서 바깥(app·plugins)을 부르지 않는다 — 부르면 떼어 갈 때 끊긴다
 *      ⑤ 도메인 낱말이 안 들어온다 — 들어오면 이 창틀이 도메인 전용이 된다
 */
describe('⑦a 엔진(pane-ui-system 에서 core/ 를 뺀 것)은 바깥(app·plugins·interfaces)과 core 를 import 하지 않는다', () => {
    // 🔴 /interfaces/ 추가(M0) — 창틀은 인터페이스를 「이름 문자열」로만 안다(src/interfaces 를 import 하면 도메인이 샌다).
    // 🍳 /core/ 추가(후라이팬) — 조립은 app 몫이다. 엔진이 core 를 부르면 엔진→core 역방향이 생겨 core 를 떼어 낼 수 없다.
    const OUTWARD = /from\s+['"][^'"]*(?:\.\.\/app|\/app\/|\.\.\/plugins|\/plugins\/|\.\.\/App|\.\.\/interfaces|\/interfaces\/|(?:^|[/'"])core(?:\/|['"]))[^'"]*['"]/;
    const files = ENGINE;

    it('스캔할 파일이 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`바깥·core 의존 없음: ${f.slice(ROOT.length + 1)}`, () => {
            expect(OUTWARD.test(read(f))).toBe(false);
        });
    }
});

describe('⑦b core/ 는 바깥(app·plugins·interfaces)을 import 하지 않는다 (비테스트 — core 는 plugins 를 못 부른다)', () => {
    const OUTWARD = /from\s+['"][^'"]*(?:\.\.\/app|\/app\/|\.\.\/plugins|\/plugins\/|\.\.\/App|\.\.\/interfaces|\/interfaces\/)[^'"]*['"]/;

    it('스캔할 core 파일이 있다', () => { expect(CORE.length).toBeGreaterThan(0); });

    for (const f of CORE) {
        it(`바깥 의존 없음: ${f.slice(ROOT.length + 1)}`, () => {
            expect(OUTWARD.test(read(f))).toBe(false);
        });
    }
});

describe('⑤ 엔진(pane-ui-system 에서 core/ 를 뺀 것)에 도메인 낱말 0건', () => {
    // 이 창틀은 시간표를 모른다. ⚠️ 「바텀 시트」 같은 UI 용어와 겹치지 않게 낱말을 고른다
    // ⭐ 「속성」도 이번부터 도메인이다 — 창틀이 사이드바에 든 뷰 이름(속성 등)을 알면 안 된다(그건 앱이 등록소로 준다)
    const DOMAIN = ['시간표', '교시', '교사', '학교', '학년', '반 ', '과목', '특별실', '보결', '근태', '속성', 'shiftgrid'];
    // 이모지 사전은 낱말 자체가 데이터다(🏫=학교 · 🧑‍🏫=교사) — 창틀 코드가 도메인을 아는 게 아니라 일반 어휘라서 이 파일만 뺀다
    const files = ENGINE.filter((f) => basename(f) !== 'emoji-data.ts');   // 🍳 core 는 뺀다 — core 의 「속성」·주석 속 「시간표·교사」는 허용

    it('스캔할 엔진 파일이 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`도메인 낱말 없음: ${basename(f)}`, () => {
            const src = read(f);
            const hit = DOMAIN.filter((w) => src.includes(w));
            expect(hit, `도메인 낱말이 창틀에 들어왔다: ${hit.join(', ')}`).toEqual([]);
        });
    }
});

/*
 * ⑥⑧ 플러그인 경계 — 플러그인(src/plugins/**)은 창틀의 「문」(pane-ui-system/plugin 배럴) 하나로만 들어온다.
 *      ⑥ 창틀 속(shell·layout·primitives)을 직접 import 하면 안을 바꿀 때 플러그인이 깨진다
 *      ⑧ 폴더가 곧 플러그인이다 — manifest.ts 의 id 가 폴더명과 달라지면 저장 키·viewId 접두사가 어긋난다
 */
describe('⑥ plugins 는 pane-ui-system 속(shell·layout·primitives)을 직접 import 하지 않는다', () => {
    // pane-ui-system/plugin 배럴은 허용 · shell·layout·primitives 속 경로는 금지
    const DEEP = /from\s+['"][^'"]*pane-ui-system\/(?:shell|layout|primitives)\/[^'"]*['"]/;
    const files = walk(join(ROOT, 'plugins'));

    it('스캔할 플러그인 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`창틀 속 직접 import 없음: ${f.slice(ROOT.length + 1)}`, () => {
            expect(DEEP.test(read(f)), `${basename(f)} 가 창틀 속을 직접 집었다 — pane-ui-system/plugin 배럴로`).toBe(false);
        });
    }
});

/*
 * ⑥′ plugins 가 core/ 를 부를 때는 `core/<m>/contracts/` 의 `import type` 만 — core 의 일반 코드·값을 끌면 plugins↔core 가 런타임으로 엉킨다
 *   (값은 host.modules.use 로). 약속 타입만 컴파일 때 지나가는 문이다.
 */
describe("⑥′ plugins → core 는 core/<m>/contracts/ 의 import type 만", () => {
    const files = walk(join(ROOT, 'plugins'));

    it('스캔할 플러그인 파일이 실제로 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`core 를 약속 타입으로만 부른다: ${f.slice(ROOT.length + 1)}`, () => {
            const src = read(f);
            const typeOnly = new Set([...src.matchAll(/import\s+type\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]));
            const bad: string[] = [];
            for (const m of src.matchAll(/(?:from|import\s*\()\s*['"]([^'"]+)['"]/g)) {
                const s = m[1];
                if (!s.startsWith('.')) continue;
                const rel = relative(CORE_DIR, resolve(dirname(f), s));
                if (rel.startsWith('..')) continue;               // core 바깥
                const parts = rel.split(sep);
                const ok = parts[1] === 'contracts' && typeOnly.has(s);
                if (!ok) bad.push(s);
            }
            expect(bad, `${basename(f)} 가 core 를 약속 타입 밖으로 부른다(core/<m>/contracts/ 의 import type 만 — 값은 host.modules.use): ${bad.join(', ')}`).toEqual([]);
        });
    }
});

/*
 * ⑨ 플러그인끼리 직접 의존 금지 — 한 plugins/<a>/ 가 다른 plugins/<b>/ 를 import 하면 빨강.
 *   「다른 플러그인 API 는 자리만」(요구명세 4번) — 플러그인은 host 하나로만 바깥과 말한다.
 *
 * 🙋 4 예외(N4) — 「import type 만」은 통과한다: `import type { NodesApi } from '../explorer/api'`.
 *   사유: 공개 API 의 타입은 컴파일 때만 쓰이고(런타임 코드 0), tsc 가 번들에서 지운다 — 플러그인끼리
 *   「값」을 끌어오는 결합이 아니다. 값/기본/재export import 는 그대로 빨강(런타임 결합이 생긴다).
 *   ⚠️ 가름선은 「import type」 구문 하나다. 같은 파일에 값 import 가 또 있으면 그건 따로 걸린다.
 */
describe('⑨ plugins 는 다른 plugins 를 import 하지 않는다 (import type 만 예외 — 🙋 4)', () => {
    const PLUGROOT = join(ROOT, 'plugins');
    const files = walk(PLUGROOT);

    it('스캔할 플러그인 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        const self = relative(PLUGROOT, f).split(sep)[0];
        it(`다른 플러그인 import 없음(값): ${f.slice(ROOT.length + 1)}`, () => {
            const src = read(f);
            // `import type … from 'spec'` 로 들어온 spec 은 허용 목록 — 타입 전용이라 런타임 결합이 없다.
            const typeOnly = new Set(
                [...src.matchAll(/import\s+type\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
            );
            // 모든 import/재export 의 spec(값·타입·재export 전부) — 이 중 형제 플러그인에 닿는 것만 센다.
            const specs = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
            const offenders: string[] = [];
            for (const s of specs) {
                if (!s.startsWith('.')) continue;                 // 상대 경로만 형제 플러그인에 닿는다
                const rel = relative(PLUGROOT, resolve(dirname(f), s));
                if (rel.startsWith('..')) continue;               // plugins 바깥
                const other = rel.split(sep)[0];
                if (other && other !== self && !typeOnly.has(s)) offenders.push(s);   // 값으로 다른 플러그인에 들어갔다
            }
            expect(offenders, `${basename(f)} 가 다른 플러그인을 값으로 import 한다(import type 만 허용): ${offenders.join(', ')}`).toEqual([]);
        });
    }
});

/*
 * ⑩ 「모든 동작은 명령」 — 탭 메뉴·우클릭 메뉴 항목은 핸들러를 직접 안 부른다(commandId 로 runCommand 를 거친다).
 *   쥔님 2026-11-01: *"UI 는 있는데 명령어는 없는 그런 일이 없도록"* · *"모든 동작은 일단 명령어에 등록"*.
 *   장치: 메뉴를 짓는 파일에서 「메뉴 항목의 onClick 이 handlers 나 host.workspace 를 직접 부르는」 꼴을 금지한다.
 *   (JSX 단추 onClick 은 대상 아님 — 메뉴 항목 객체 리터럴 onClick 만 본다 · host.commands.run 은 허용)
 */
describe('⑩ 메뉴 항목은 명령으로 — 직접 핸들러 금지', () => {
    // 메뉴 항목 객체의 onClick 이 동작을 직접 부르는 꼴(핸들러/작업대 열기). commands.run 은 허용(명령을 거친 것).
    const BANNED = /onClick:\s*\(\)\s*=>\s*(?:handlers\.|host\.workspace\.|host\.commands\.(?!run))/;
    const files = [
        join(ROOT, 'pane-ui-system', 'shell', 'shared', 'WorkspaceView.tsx'),
        ...PLUGINLIKE,
    ];

    it('스캔할 파일이 실제로 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`메뉴 항목이 핸들러를 직접 안 부른다: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => BANNED.test(ln));
            expect(hit, `메뉴 항목이 ${hit + 1}번째 줄에서 동작을 직접 부른다 — commandId 로 runCommand 를 거친다`).toBe(-1);
        });
    }
});

/*
 * ⑪ 화면 전용 조각은 서로 섞이지 않는다 — shell/desktop(넓은 화면) ↔ shell/mobile(좁은 화면) 서로 import 0.
 *   쥔님 2026-11-01: *"공통, 모바일, 데스크톱 컴포넌트는 폴더 따로 두는 게 좋을 듯"*.
 *   한쪽 전용 조각이 다른 쪽을 끌어오면 「전용」이 거짓이 된다 — 공통으로 쓸 것은 shell/shared 에 둔다.
 */
describe('⑪ shell/desktop ↔ shell/mobile 서로 import 0', () => {
    const SHELL = join(ROOT, 'pane-ui-system', 'shell');
    const deskFiles = walk(join(SHELL, 'desktop'));
    const mobFiles = walk(join(SHELL, 'mobile'));
    const TO_MOBILE = /from\s+['"][^'"]*(?:\/mobile\/|\.\.\/mobile\/)[^'"]*['"]/;
    const TO_DESKTOP = /from\s+['"][^'"]*(?:\/desktop\/|\.\.\/desktop\/)[^'"]*['"]/;

    it('desktop·mobile 폴더에 스캔할 파일이 실제로 있다', () => {
        expect(deskFiles.length).toBeGreaterThan(0);
        expect(mobFiles.length).toBeGreaterThan(0);
    });

    for (const f of deskFiles) {
        it(`desktop 이 mobile 을 안 집는다: ${basename(f)}`, () => {
            expect(TO_MOBILE.test(read(f)), `${basename(f)} 가 mobile 전용 조각을 집었다 — 공통이면 shell/shared 로`).toBe(false);
        });
    }
    for (const f of mobFiles) {
        it(`mobile 이 desktop 을 안 집는다: ${basename(f)}`, () => {
            expect(TO_DESKTOP.test(read(f)), `${basename(f)} 가 desktop 전용 조각을 집었다 — 공통이면 shell/shared 로`).toBe(false);
        });
    }
});

/*
 * ⑫ 상호작용 분리 — 🔴 layout/ 은 포인터 이벤트 핸들러를 직접 들지 않는다(드래그·제스처는 interactive/ 를 거친다).
 *   쥔님 2026-11-01: *"UI 상호작용하는 거 하드코딩으로 각 레이아웃에 박지 말고 상호작용 코드 잘 분리해놔"* ·
 *     *"레이아웃에 드래그가 들어가는 게 맞는지 모르겠어"* → 드래그 기하(옛 layout/drag)도 interactive/ 로 옮겼다.
 *   layout 은 순수 기하·보관만 — 포인터 핸들러(onPointer*·setPointerCapture·'pointer…' 리스너)가 들어오면 빨간불.
 */
describe('⑫ layout/ 은 포인터 이벤트 핸들러를 직접 들지 않는다 (드래그는 interactive/ 를 거친다)', () => {
    // onPointerDown/Move/Up/Cancel/Leave · setPointerCapture · addEventListener('pointer…')
    const POINTER = /onPointer(?:Down|Move|Up|Cancel|Leave)|setPointerCapture|['"]pointer(?:down|move|up|cancel)['"]/;
    const files = walk(join(ROOT, 'pane-ui-system', 'layout'));

    it('스캔할 layout 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`포인터 핸들러 없음: ${basename(f)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => POINTER.test(ln));
            expect(hit, `layout/${basename(f)} ${hit + 1}번째 줄에 포인터 핸들러가 있다 — interactive/ 로 옮긴다`).toBe(-1);
        });
    }
});

/*
 * ⑬ 선택 허용(.select-text)은 예외 목록에서만 — 아무 컴포넌트나 전역 선택 차단(항목 A)을 못 뚫는다.
 *   쥔님 2026-11-01: *"UI 기본적으로 마우스 셀렉트 안 되게 해 줘"* → 기본은 선택 불가(index.css html user-select:none).
 *   「문서·글 내용」임을 뷰가 밝힌 자리만 .select-text 로 되살린다 — ⛔ 그 자리는 아래 ALLOW 에 등록돼야 한다.
 *   group-hover(③)와 같은 장치: 이 클래스가 허용 목록 밖에 나오면 빨간불.
 */
describe('⑬ .select-text 는 예외 목록(ALLOW)에서만 쓴다', () => {
    const NEEDLE = 'select' + '-text';   // 이 파일 자신이 금지 문자열을 품지 않게 조각으로
    // 예외 목록 = 옵트인 자리: 그 셀렉터를 정의하는 가드 · 알림 글(복사해 갈 오류 문구) · 플러그인 뷰 본문(글 내용)
    //   🔴 Q1·X1: 뷰 본문 칸(EditorArea)·피크·달력 세 뷰는 뺐다 — 통째로 select-text 면 칸·머리·단추 글자가 끌려 선택되고 기본 우클릭이 뜬다.
    const ALLOW = new Set([
        'NotifyPanel.tsx', 'guards.ts', 'PageView.tsx',   // 페이지 본문은 글 내용 — 안 켜진 블록(일반 div)도 끌어 고른다
        'SampleView.tsx', 'TestConsole.tsx', 'NodeSampleView.tsx',
        'Table.tsx',   // 표 편집기 편집창 — 칸 글자를 끌어 고른다(옵트인)
    ]);
    const files = walk(ROOT);

    it('.select-text 가 실제로 어딘가 쓰인다(빈 글롭 거짓 통과 방지)', () => {
        expect(files.some((f) => read(f).includes(NEEDLE))).toBe(true);
    });

    it('예외 목록 밖에는 .select-text 가 없다', () => {
        const offenders = files.filter((f) => read(f).includes(NEEDLE) && !ALLOW.has(basename(f)));
        expect(offenders.map((f) => f.slice(ROOT.length + 1)),
            '전역 선택 차단을 뚫으려면 예외 목록(ALLOW)에 등록해야 한다').toEqual([]);
    });
});

describe('⑧ plugins/<id>/ 마다 manifest.ts 의 id 가 폴더명과 같다', () => {
    let dirs: string[] = [];
    try {
        dirs = readdirSync(join(ROOT, 'plugins'), { withFileTypes: true })
            .filter((e) => e.isDirectory() && e.name !== '__tests__')
            .map((e) => e.name);
    } catch { dirs = []; }

    it('플러그인 폴더가 하나 이상 있다', () => {
        expect(dirs.length).toBeGreaterThan(0);
    });

    for (const dir of dirs) {
        it(`${dir}/manifest.ts 의 id === '${dir}'`, () => {
            const src = read(join(ROOT, 'plugins', dir, 'manifest.ts'));
            const m = src.match(/id:\s*['"]([^'"]+)['"]/);
            expect(m, `${dir}/manifest.ts 에 id 선언이 없다`).not.toBeNull();
            expect(m![1]).toBe(dir);
        });
    }
});

/*
 * ⑧′ core/<m>/manifest.ts — id === 폴더명 · core: true · layer 'platform'. 그리고 plugins/ 쪽 매니페스트엔 core: true 가 0
 *    (코어 = core/ 폴더 하나로 — 폴더가 신분이고 plugins/ 에 두고 core 표시만 하는 길은 닫는다).
 */
describe('⑧′ core/<m>/manifest.ts 는 id·core:true·layer platform · plugins/ 매니페스트에 core:true 0', () => {
    const mods = (() => {
        try { return readdirSync(CORE_DIR, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== '__tests__').map((e) => e.name); } catch { return []; }
    })();

    it('core 모듈 폴더가 하나 이상 있다', () => { expect(mods.length).toBeGreaterThan(0); });

    for (const m of mods.filter((d) => existsSync(join(CORE_DIR, d, 'manifest.ts')))) {   // 🍳 manifest.ts 가 있는 모듈만 — 없으면 꾸러미가 아닌 부품(nodes·node-store·node-frame·plugin-manager)
        it(`core/${m}/manifest.ts — id '${m}' · core: true · layer 'platform'`, () => {
            const src = read(join(CORE_DIR, m, 'manifest.ts'));
            expect(src.match(/\bid:\s*['"]([^'"]+)['"]/)?.[1], `core/${m}/manifest.ts id`).toBe(m);
            expect(/\bcore:\s*true\b/.test(src), `core/${m}/manifest.ts 에 core: true 가 없다`).toBe(true);
            expect(/\blayer:\s*['"]platform['"]/.test(src), `core/${m}/manifest.ts 의 layer 가 platform 이 아니다`).toBe(true);
        });
    }

    // 🍳 이사 중 — 아직 plugins/ 에 남은 코어 셋. ⭐ 이사하는 판이 자기 이름을 이 목록에서 지운다(P2 properties · P3 explorer · P4 settings). 다 지우면 이 목록과 이 주석을 없앤다.
    const NOT_MOVED_YET: string[] = [];
    for (const d of readdirSync(join(ROOT, 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== '__tests__' && !NOT_MOVED_YET.includes(e.name)).map((e) => e.name)) {
        it(`plugins/${d}/manifest.ts 에 core: true 없음`, () => {
            const src = read(join(ROOT, 'plugins', d, 'manifest.ts'));
            expect(/^\s*core:\s*true\b/m.test(src), `plugins/${d} 는 코어가 아니다 — 코어는 pane-ui-system/core/ 로 옮긴다`).toBe(false);
        });
    }
});

/*
 * ⑭ 플러그인은 kv 를 직접 안 부른다 — host.store 로만(⑥ 창틀 속 금지·⑩ 명령 창구와 같은 결).
 *   kvGet/kvSet/kvDel 을 직접 부르면 네임스페이스(plugin.<id>.<key>)를 안 거친 키가 생긴다 —
 *   host.store 가 그걸 가두는 자리다. 저장은 전부 host.store·host.storage 창구로.
 */
/*
 * ⑯ 탐색기 뷰(plugins/<id>/views/**)는 레코드성 판정을 콜백(isRecordType)으로만 받는다 —
 *   뷰 안에 'record' 낱말 비교(def.record · 'record' 리터럴 등)가 들어오면 탐색기가 타입 표의 속내를 알게 된다
 *   (설계 「여기서 죽는다」: 탐색기가 calendar.event 를 알게 되는 유혹과 같은 결). isRecordType(대문자 R)은 통과.
 */
describe('⑯ plugins/**/views 에 소문자 record 비교 0 (레코드 판정은 isRecordType 콜백으로만)', () => {
    const NEEDLE = /\brecord\b(?!-view)/;   // 꾸러미 이름 collection(약속 import·modules.use)는 레코드성 판정이 아니라 뺀다 ·   // 소문자 — isRecordType·isRecord 의 대문자 R 은 안 걸린다
    const files = PLUGINLIKE.filter((f) => f.includes(`${sep}views${sep}`));

    it('스캔할 뷰 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`record 낱말 비교 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => NEEDLE.test(ln));
            expect(hit, `뷰가 ${hit + 1}번째 줄에서 record 를 직접 본다 — isRecordType 콜백으로 받는다`).toBe(-1);
        });
    }
});

/*
 * ⑮ kv.ts 의 쓰기 트랜잭션 안에는 await 가 없다 — IndexedDB 트랜잭션은 마이크로태스크가 비면 자동 커밋되니,
 *   트랜잭션 도중 await 하면 큐가 비어 트랜잭션이 죽는다(저장소 레이어 요구명세 S1 「트랜잭션 안 await 금지」).
 *   검사: kvSet·nodesWrite 함수 몸(export async function … 다음 export 전)에 `await` 토큰이 0.
 */
describe('⑮ kv.ts 쓰기 트랜잭션 안에 await 가 없다 (openDb 직후의 await 는 트랜잭션 밖이라 허용)', () => {
    const src = read(join(ROOT, 'pane-ui-system', 'kv.ts'));
    /** `function <name>(` 부터 다음 `export ` 까지의 몸에서, `.transaction(` 뒤쪽(트랜잭션 구간)만 떼 온다. */
    function txPart(name: string): string {
        const start = src.indexOf(`function ${name}(`);
        expect(start, `${name} 를 kv.ts 에서 못 찾았다`).toBeGreaterThan(-1);
        const after = src.indexOf('\nexport ', start + 1);
        const fnBody = src.slice(start, after < 0 ? src.length : after);
        const tx = fnBody.indexOf('.transaction(');
        expect(tx, `${name} 에 트랜잭션이 없다`).toBeGreaterThan(-1);
        return fnBody.slice(tx);
    }
    for (const name of ['kvSet', 'nodesWrite']) {
        it(`${name} 의 트랜잭션 구간에 await 0 (자동 커밋에 안 죽는다)`, () => {
            expect(/\bawait\b/.test(txPart(name)), `${name} 의 트랜잭션 안에 await 가 있다 — 동기로 큐에 넣고 oncomplete 를 기다린다`).toBe(false);
        });
    }
});

describe('⑭ plugins 는 kv 를 직접 부르지 않는다 — host.store 로만 (노드 스토어만 persist.ts 예외)', () => {
    // kvGet/kvSet/kvDel 은 전부 금지(네임스페이스 없는 키를 막는다).
    // nodesGetAll/nodesWrite 는 노드 저장 층 전용 — 그 층인 core/node-store/persist.ts 하나만 예외.
    const BANNED = /\b(?:kv(?:Get|Set|Del)|nodesGetAll|nodesWrite)\s*\(/;
    const PERSIST = join('node-store', 'persist.ts');   // 저장소 레이어 한 파일만 노드 스토어를 직접 쓴다
    const files = PLUGINLIKE;

    it('스캔할 플러그인 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        const exempt = f.endsWith(PERSIST);
        it(`kv 직접 호출 없음${exempt ? '(노드 스토어는 예외)' : ''}: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => BANNED.test(ln));
            if (exempt) {
                // persist.ts 는 nodesGetAll/nodesWrite 는 써도 되지만 kvGet/kvSet/kvDel 은 여전히 금지.
                const kvHit = read(f).split('\n').findIndex((ln) => /\bkv(?:Get|Set|Del)\s*\(/.test(ln));
                expect(kvHit, `persist.ts 가 ${kvHit + 1}번째 줄에서 kvGet/Set/Del 을 직접 부른다 — host.store 로`).toBe(-1);
            } else {
                expect(hit, `kv/노드 스토어를 ${hit + 1}번째 줄에서 직접 부른다 — host.store 로 거친다(노드 스토어는 persist.ts 만)`).toBe(-1);
            }
        });
    }
});

/*
 * ⑰ 선언형 전환 마무리(D5③·⑤) — 플러그인(src/plugins/**)은 「매니페스트 밖 등록」을 하지 않는다.
 *   옛 5종 host.views.register·commands.add·ribbon.add·settings.add(Section|Item)·statusBar.add 는 지웠고,
 *   호스트에 뷰·명령·리본·설정·상태바를 꽂는 길은 manifest.contributes 와 host.declare 둘뿐이다(명세 「플러그인 선언형 전환」).
 *   ⚠️ ( 를 붙여 실제 호출만 본다 — 「host.settings.add* · …」 같은 주석 문구(괄호 없음)·host.views.get·host.commands.run 은 안 걸린다.
 *   (검사 자신은 __tests__ 라 walk 가 건너뛴다 — 금지 문자열을 품어도 제 발을 안 밟는다.)
 */
describe('⑰ plugins 에 매니페스트 밖 등록(옛 5종) 0건 — contributes·host.declare 로만', () => {
    const BANNED = /host\.(?:views\.register|commands\.add|ribbon\.add|settings\.add(?:Section|Item)|statusBar\.add)\s*\(/;
    const files = PLUGINLIKE;

    it('스캔할 플러그인 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        it(`옛 등록 호출 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => BANNED.test(ln));
            expect(hit, `${basename(f)} 가 ${hit + 1}번째 줄에서 옛 등록 5종을 직접 부른다 — contributes 또는 host.declare 로`).toBe(-1);
        });
    }
});

/*
 * ⑱ 모듈·의존성(M0 · 4판 「플러그인은 꾸러미다」 2026-11-08) — 플러그인이 모듈을 받는 길은 host.modules.use(약속 이름)
 *   하나뿐이고, 쓰는 약속은 매니페스트에 선언한다. 🔴 약속(타입)은 **그 약속을 들고 온 꾸러미** 안에 산다 — 꾸러미의
 *   `contracts/` 하위(예: explorer/contracts/nodes), 또는 아직 미편입인 약속 폴더(contract-* 폴더). 일곱을 지킨다:
 *     (a) src/plugins 에 host.plugins.get( 0건(설탕 없음 — modules.use 로만)
 *     (b) modules.use('x') 인데 x 가 그 플러그인 requires/supports/provides 에 없음 0건(선언 안 된 의존)
 *     (c) onInterface.x(= onInterface: { x: … }) 인데 x 가 supports 에 없음 0건(짝 없는 훅)
 *     (d) src/plugins 가 남의 약속(contracts/ 또는 contract-*)을 **값**으로 import 0건(타입 전용만 — 값은 modules.use 로)
 *     (e) src/interfaces 는 0파일이다(약속은 꾸러미로 옮겼다 · 옛 고정 목록 자리 소멸)
 *     (f) src/app·src/pane-ui-system 에 **학교 약속 이름** 하드코딩 0(플랫폼이 도메인 약속을 모른다 · 3판 핵심)
 *     (g) 플러그인이 **남의 약속 타입**을 import 할 땐 그 꾸러미의 `contracts/` 하위 또는 미편입 `contract-*` 폴더에서만
 *         (남의 꾸러미 일반 코드에서 타입/값을 끌면 빨강 — 약속만 꾸러미 밖으로 드러낸다)
 */
describe('⑱ 모듈·의존성 — host.plugins.get 0 · use/onInterface 는 선언된 약속만 · 약속 타입은 꾸러미 contracts/ 또는 contract-*/ 에서만', () => {
    const PLUGROOT = join(ROOT, 'plugins');
    const files = walk(PLUGROOT);   // (d·g) 는 plugins 끼리만 본다(core 는 ⑥′·⑦b 가 막는다)
    // 🍳 모듈 단위 = plugins/<id> 또는 core/<m> — (a)(b)(c) 는 core 도 같은 결로 받는다
    const unitFiles = PLUGINLIKE;
    const unitOf = (f: string) => (f.startsWith(CORE_DIR + sep) ? 'core/' + relative(CORE_DIR, f).split(sep)[0] : relative(PLUGROOT, f).split(sep)[0]);
    const plugins = [...new Set(unitFiles.map(unitOf))];

    it('스캔할 플러그인 폴더가 실제로 있다', () => { expect(plugins.length).toBeGreaterThan(0); });

    /** provides/requires/supports 객체 리터럴의 키(= 선언된 인터페이스 이름)를 그 플러그인 파일들에서 모은다. */
    function declaredFor(plugin: string): { all: Set<string>; supports: Set<string> } {
        const all = new Set<string>(); const supports = new Set<string>();
        // 🍳 manifest.ts 없는 core 폴더는 「부품」(nodes·node-store·node-frame) — 꾸러미(explorer)가 선언한 약속을 같이 쓴다. 부품의 선언 집합 = core 전체 선언의 합
        const isPart = plugin.startsWith('core/') && !existsSync(join(CORE_DIR, plugin.slice(5), 'manifest.ts'));
        for (const f of unitFiles.filter((x) => (isPart ? x.startsWith(CORE_DIR + sep) : unitOf(x) === plugin))) {
            const src = read(f);
            for (const kind of ['provides', 'requires', 'supports']) {
                for (const m of src.matchAll(new RegExp(`${kind}\\s*:\\s*\\{([^{}]*)\\}`, 'g'))) {
                    for (const km of m[1].matchAll(/['"]?([a-zA-Z_][\w-]*)['"]?\s*:/g)) {
                        all.add(km[1]);
                        if (kind === 'supports') supports.add(km[1]);
                    }
                }
            }
        }
        return { all, supports };
    }

    /** modules.use('x')(제네릭 있어도) 로 쓰는 인터페이스 이름들. */
    function usedIn(src: string): string[] {
        return [...src.matchAll(/modules\.use\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    }

    /** onInterface: { x: {…} } 의 최상위 키(x)들 — 균형 괄호로 블록을 떼고 depth-0 의 `name: {` 를 센다. */
    function onInterfaceKeys(src: string): string[] {
        const out: string[] = [];
        let idx = 0;
        while ((idx = src.indexOf('onInterface', idx)) >= 0) {
            const brace = src.indexOf('{', idx);
            if (brace < 0) break;
            let depth = 0; let end = -1;
            for (let i = brace; i < src.length; i++) {
                const c = src[i];
                if (c === '{') depth++;
                else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            if (end < 0) break;
            const inner = src.slice(brace + 1, end);
            let d = 0;
            for (let i = 0; i < inner.length; i++) {
                const c = inner[i];
                if (c === '{' || c === '(' || c === '[') d++;
                else if (c === '}' || c === ')' || c === ']') d--;
                else if (d === 0) {
                    const m = /^([a-zA-Z_][\w-]*)\s*:\s*\{/.exec(inner.slice(i));
                    if (m) { out.push(m[1]); i += m[0].length - 1; d++; }
                }
            }
            idx = end + 1;
        }
        return out;
    }

    // (a) host.plugins.get( 0건
    const GET = /host\.plugins\.get\s*\(/;
    for (const f of unitFiles) {
        it(`(a) host.plugins.get 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const hit = read(f).split('\n').findIndex((ln) => GET.test(ln));
            expect(hit, `${basename(f)} ${hit + 1}번째 줄 — host.plugins.get 은 걷혔다(host.modules.use 로)`).toBe(-1);
        });
    }

    // (b)·(c) 선언된 인터페이스만 use/onInterface
    for (const plugin of plugins) {
        it(`(b) use 는 선언된 인터페이스만: ${plugin}`, () => {
            const { all } = declaredFor(plugin);
            const bad: string[] = [];
            for (const f of unitFiles.filter((x) => unitOf(x) === plugin)) {
                for (const name of usedIn(read(f))) if (!all.has(name)) bad.push(`${basename(f)}:${name}`);
            }
            expect(bad, `${plugin} 가 선언 안 한 인터페이스를 use 한다(requires/supports/provides 에 적어라): ${bad.join(', ')}`).toEqual([]);
        });
        it(`(c) onInterface 는 supports 와 짝: ${plugin}`, () => {
            const { supports } = declaredFor(plugin);
            const bad: string[] = [];
            for (const f of unitFiles.filter((x) => unitOf(x) === plugin)) {
                for (const name of onInterfaceKeys(read(f))) if (!supports.has(name)) bad.push(`${basename(f)}:${name}`);
            }
            expect(bad, `${plugin} 의 onInterface.${bad.join('/')} 가 supports 에 없다 — supports 에 그 인터페이스를 적어라`).toEqual([]);
        });
    }

    // (d)·(g) 약속 타입은 꾸러미 contracts/ 또는 미편입 contract-*/ 에서만 · import type 만 — 다른 꾸러미에 닿는 import 를 통째로 본다.
    //   🔴 꾸러미 전환(2026-11-08): 약속을 꾸러미 안으로 묶어 「약속 위치」가 둘이다 — ①다른 꾸러미의 `contracts/` 하위, ②미편입 `contract-*/`.
    //      그 둘에서만 **타입 전용**으로 끌 수 있고, 남의 꾸러미 일반 코드를 끌면(약속이 아닌 결합) 빨강.
    for (const f of files) {
        const self = relative(PLUGROOT, f).split(sep)[0];
        it(`(d·g) 약속 타입은 꾸러미 contracts/·contract-*/ 에서만·타입 전용: ${f.slice(ROOT.length + 1)}`, () => {
            const src = read(f);
            const typeOnly = new Set(
                [...src.matchAll(/import\s+type\s+[^'"]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
            );
            const dVal: string[] = [];   // (d) 남의 약속을 값으로 끌었다
            const gBad: string[] = [];   // (g) 약속이 아닌 남의 꾸러미 코드를 끌었다
            for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
                const s = m[1];
                if (!s.startsWith('.')) continue;                 // 상대 경로만 다른 꾸러미에 닿는다
                const rel = relative(PLUGROOT, resolve(dirname(f), s));
                if (rel.startsWith('..')) continue;               // plugins 바깥
                const parts = rel.split(sep);
                const other = parts[0];
                if (!other || other === self) continue;           // 자기 꾸러미 안은 자유
                // 🔴 「약속 위치」 — 미편입 약속 폴더(contract-*) 또는 다른 꾸러미의 contracts/ 하위.
                const isPromise = other.startsWith('contract-') || parts[1] === 'contracts';
                if (isPromise) {
                    if (!typeOnly.has(s)) dVal.push(s);           // (d) 약속을 값으로 끌면 안 된다(값은 host.modules.use)
                } else {
                    gBad.push(s);                                 // (g) 약속이 아닌 남의 꾸러미 코드는 끌면 안 된다
                }
            }
            expect(dVal, `${basename(f)} 가 남의 약속을 값으로 import 한다(타입 전용만 — 값은 host.modules.use): ${dVal.join(', ')}`).toEqual([]);
            expect(gBad, `${basename(f)} 가 남의 꾸러미 일반 코드를 끈다(약속 타입은 꾸러미 contracts/·contract-*/ 에서만): ${gBad.join(', ')}`).toEqual([]);
        });
    }

    // (e) src/interfaces/ 는 0파일 — 약속을 플러그인(contract-*)으로 옮겼으니 이 폴더는 비어 있거나 없다.
    it('(e) src/interfaces/ 0파일 (약속은 contract-* 플러그인으로 옮겼다)', () => {
        let entries: string[] = [];
        try { entries = readdirSync(join(ROOT, 'interfaces')); } catch { entries = []; }   // 폴더가 없으면 0
        expect(entries, `src/interfaces/ 에 파일이 남았다: ${entries.join(', ')}`).toEqual([]);
    });

    // (f) 학교 약속 이름이 src/app·src/pane-ui-system 에 하드코딩 0 — 플랫폼은 도메인 약속을 모른다(3판 핵심).
    //   ⭐ 판정 기준: 「도메인 약속 아홉」(학교 일곱 + 계정 둘) 이름만 본다. 'nodes' 는 창틀의 유일한 레지스트라 다리
    //      (contributes.ts NODES_INTERFACE)라 제외한다(범용 약속 · 도메인 아님). 테스트 픽스처(.test.ts·__tests__)는 walk 가 이미 건너뛴다.
    describe('(f) src/app·src/pane-ui-system 에 학교 약속 이름 0', () => {
        const SCHOOL = ['roster', 'clock', 'week-grid', 'timetable', 'absence', 'identity', 'export', 'credential', 'permit'];
        const platformFiles = [...walk(join(ROOT, 'app')), ...ENGINE, ...CORE];   // 🍳 core 도 건다 — account 같은 학교 약속이 core 로 못 들어오게 하는 문
        // 낱말 경계로 — 'export' 키워드와 안 겹치게 따옴표로 감싼 리터럴만 본다('roster' 등).
        for (const f of platformFiles) {
            it(`학교 약속 이름 없음: ${f.slice(ROOT.length + 1)}`, () => {
                const src = read(f);
                const hit = SCHOOL.filter((n) => src.includes(`'${n}'`) || src.includes(`"${n}"`));
                expect(hit, `플랫폼 파일에 학교 약속 이름이 리터럴로 박혔다: ${hit.join(', ')}`).toEqual([]);
            });
        }
    });
});

/*
 * ⑲ 약속 이름은 레포 어딘가에 정의돼 있어야 한다 (이름 오타 방지 — 2026-11-08 19:42 「정의와 제공은 서로 기대지 않는다」).
 *   🔴 실행 중엔 정의를 안 본다(제공자는 정의 없이도 선다). 그래서 이름 오타는 런타임이 아니라 **구조 검사**가 잡는다:
 *     등록된 플러그인들의 provides·requires·supports 에 적힌 약속 이름은 레포에 정의가 있어야 한다 —
 *       ① 미편입 약속 폴더 `src/plugins/contract-<이름>/`, 또는 ② 어느 꾸러미의 `contracts/<이름>.ts`.
 *   오타(정의 없는 이름)를 provides/requires/supports 에 적으면 여기서 빨간불(실행 판정은 못 잡는다).
 */
describe('⑲ provides·requires·supports 의 약속 이름은 레포에 정의(contract-dir 또는 꾸러미 contracts 파일)가 있다', () => {
    const PLUGROOT = join(ROOT, 'plugins');
    const COREROOT = join(ROOT, 'pane-ui-system', 'core');

    /** 정의된 약속 이름 모음 — ① contract-<이름> 폴더 ② 꾸러미 contracts 폴더의 <이름>.ts 파일. */
    function definedPromises(): Set<string> {
        const out = new Set<string>();
        let top: Array<{ name: string; isDirectory(): boolean }> = [];
        try { top = readdirSync(PLUGROOT, { withFileTypes: true }); } catch { top = []; }
        // 🍳 ③ core/<m>/contracts/<이름>.ts — 후라이팬 코어가 들고 있는 약속(selection 등)
        let coreTop: Array<{ name: string; isDirectory(): boolean }> = [];
        try { coreTop = readdirSync(COREROOT, { withFileTypes: true }); } catch { coreTop = []; }
        for (const e of coreTop) {
            if (!e.isDirectory()) continue;
            let inner: string[] = [];
            try { inner = readdirSync(join(COREROOT, e.name, 'contracts')); } catch { inner = []; }
            for (const f of inner) if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.add(f.replace(/\.ts$/, ''));
        }
        for (const e of top) {
            if (!e.isDirectory()) continue;
            if (e.name.startsWith('contract-')) out.add(e.name.slice('contract-'.length));   // ① 미편입 약속 폴더
            // ② 꾸러미 안 contracts/<이름>.ts
            let inner: string[] = [];
            try { inner = readdirSync(join(PLUGROOT, e.name, 'contracts')); } catch { inner = []; }
            for (const f of inner) if (/\.ts$/.test(f) && !/\.test\.ts$/.test(f)) out.add(f.replace(/\.ts$/, ''));
        }
        return out;
    }

    /** 모든 플러그인 파일의 provides/requires/supports 객체 리터럴 키(= 쓰인 약속 이름)와 어디 쓰였나. */
    function usedPromises(): { name: string; where: string }[] {
        const out: { name: string; where: string }[] = [];
        for (const f of PLUGINLIKE) {
            const src = read(f);
            for (const kind of ['provides', 'requires', 'supports']) {
                for (const m of src.matchAll(new RegExp(`${kind}\\s*:\\s*\\{([^{}]*)\\}`, 'g'))) {
                    for (const km of m[1].matchAll(/['"]?([a-zA-Z_][\w-]*)['"]?\s*:/g)) {
                        out.push({ name: km[1], where: `${f.slice(ROOT.length + 1)} (${kind})` });
                    }
                }
            }
        }
        return out;
    }

    it('정의가 하나 이상 있다(빈 글롭 거짓 통과 방지)', () => {
        expect(definedPromises().size).toBeGreaterThan(0);
    });

    it('쓰인 약속 이름이 전부 정의돼 있다(오타 0건)', () => {
        const defined = definedPromises();
        const undefined_ = usedPromises().filter((u) => !defined.has(u.name));
        expect(undefined_.map((u) => `${u.name} @ ${u.where}`),
            `정의 없는 약속 이름 — contract-<이름>/ 또는 contracts/<이름>.ts 를 만들어라`).toEqual([]);
    });
});
