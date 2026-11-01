/**
 * 구조 검사 — 「반복적으로 색을 줄줄이 박지 말라」를 주석이 아니라 돌아가는 검사로 내린다.
 *   ① features·shell 안에 하드코딩 색 0건 (색은 조각층의 토큰으로만)
 *   ② primitives 가 features·shell 을 import 0건 (층은 아래로만 의존한다)
 *   ③ 호버-숨김(group-hover)은 Row 조각 한 곳에만 — 다른 데 나오면 실패
 *
 * 🔴 이 검사 자체가 정규식 문자열로 금지 패턴을 품고 있으니, 검사 폴더(__tests__)는 스캔 대상에서 뺀다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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
            out = out.concat(walk(p));
        } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

const read = (p: string) => readFileSync(p, 'utf-8');

describe('① app·shell·plugins 에 하드코딩 색 0건', () => {
    // #rrggbb · rgb( · bg-gray- · text-gray- · border-gray-
    // 🔴 plugins 도 본다 — 뷰가 제멋대로 색을 박으면 테마가 안 먹는다(팬 UI 엔진 테스트의 색 글자도 토큰으로만).
    const BANNED = /#[0-9a-fA-F]{3,8}\b|rgb\(|\b(?:bg|text|border)-gray-/;
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'pane-ui-system', 'shell')), ...walk(join(ROOT, 'plugins'))];

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
describe('⑦ pane-ui-system 은 바깥(app·plugins)을 import 하지 않는다', () => {
    const OUTWARD = /from\s+['"][^'"]*(?:\.\.\/app|\/app\/|\.\.\/plugins|\/plugins\/|\.\.\/App)[^'"]*['"]/;
    const files = walk(join(ROOT, 'pane-ui-system'));

    it('스캔할 파일이 있다', () => { expect(files.length).toBeGreaterThan(0); });

    for (const f of files) {
        it(`바깥 의존 없음: ${basename(f)}`, () => {
            expect(OUTWARD.test(read(f))).toBe(false);
        });
    }
});

describe('⑤ pane-ui-system 에 도메인 낱말 0건', () => {
    // 이 창틀은 시간표를 모른다. ⚠️ 「바텀 시트」 같은 UI 용어와 겹치지 않게 낱말을 고른다
    // ⭐ 「속성」도 이번부터 도메인이다 — 창틀이 사이드바에 든 뷰 이름(속성 등)을 알면 안 된다(그건 앱이 등록소로 준다)
    const DOMAIN = ['시간표', '교시', '교사', '학교', '학년', '반 ', '과목', '특별실', '보결', '근태', '속성', 'shiftgrid'];
    const files = walk(join(ROOT, 'pane-ui-system'));

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
 * ⑨ 플러그인끼리 직접 의존 금지 — 한 plugins/<a>/ 가 다른 plugins/<b>/ 를 import 하면 빨강.
 *   「다른 플러그인 API 는 자리만」(요구명세 4번) — 플러그인은 host 하나로만 바깥과 말한다.
 */
describe('⑨ plugins 는 다른 plugins 를 import 하지 않는다', () => {
    const PLUGROOT = join(ROOT, 'plugins');
    const files = walk(PLUGROOT);

    it('스캔할 플러그인 파일이 실제로 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        const self = relative(PLUGROOT, f).split(sep)[0];
        it(`다른 플러그인 import 없음: ${f.slice(ROOT.length + 1)}`, () => {
            const src = read(f);
            const specs = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
            const offenders: string[] = [];
            for (const s of specs) {
                if (!s.startsWith('.')) continue;                 // 상대 경로만 형제 플러그인에 닿는다
                const rel = relative(PLUGROOT, resolve(dirname(f), s));
                if (rel.startsWith('..')) continue;               // plugins 바깥
                const other = rel.split(sep)[0];
                if (other && other !== self) offenders.push(s);   // 다른 플러그인 폴더로 들어갔다
            }
            expect(offenders, `${basename(f)} 가 다른 플러그인을 직접 import 한다: ${offenders.join(', ')}`).toEqual([]);
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
        ...walk(join(ROOT, 'plugins')),
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
    // 예외 목록 = 옵트인 자리: 셸 본문 칸·피크 본문 · 그 셀렉터를 정의하는 가드 · 플러그인 뷰 본문(글 내용)
    const ALLOW = new Set([
        'EditorArea.tsx', 'PeekLayer.tsx', 'guards.ts',
        'MonthView.tsx', 'YearView.tsx', 'TimeGridView.tsx', 'SampleView.tsx', 'TestConsole.tsx',
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
