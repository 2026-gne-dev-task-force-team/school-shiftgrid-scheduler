/**
 * 톱니(ratchet) 검사 — 「공통 부품을 안 쓰고 제 손으로 짜는 것」이 다시는 늘지 않게 한다. 한 번에 다 고치지 않아도 된다.
 *   꾸러미(src/plugins/<id>) · app · pane-ui-system 마다 아래 셋을 세어 ratchet-baseline.json 과 비교한다 — **늘면 빨강**.
 *     bareButton : 맨 <button 수 — 공통 Button·IconButton·Dialog 단추를 쓰면 안 는다
 *     arbPx      : 임의 크기 -[Npx] 수(text-[12px]·w-[340px] …) — 글자는 단계 토큰(text-small …), 치수는 토큰·표준 클래스
 *     cmdIdString: 다른 꾸러미의 명령 id 를 글자로 부른 수 — 약속 파일의 상수로
 *     ctxDirect  : onContextMenu 를 직접 처리한 수 — 우클릭은 창틀 ContextMenu(useContextTrigger) 하나로만, 꾸러미는 메뉴 항목만 낸다(Q1·X2)
 *     roleToolbar: `role="toolbar"` 직접 쓰기 수 — 툴바는 Frame 의 toolbar 자리 + 창틀 Toolbar(primitives/Toolbar.tsx 한 곳만 0 예외)로만 그린다(Q10 W6).
 *       ⚠️ 컬렉션(collection/Toolbar.tsx)은 role 없이 제 줄을 그린다 — 이 세기가 못 본다. Q12 가 창틀 Toolbar 로 옮기면 끝(기준값은 이미 0 이라 허용 수 1 을 둘 일이 없었다).
 *     zRaw       : 맨 z-index 숫자(`z-[N]`·`zIndex: N`) 수 — 겹침은 z 토큰(z-modal·z-popover·z-tooltip·z-toast)으로(R7)
 *     bareInput  : 맨 <input·<select 수 — 공통 TextInput·InlineRename·Select·Toggle 을 쓰면 안 는다(type=color·file 같은 네이티브 전용 칸은 못 줄인다)(R7)
 *     divClick   : `<div … onClick` 수 — 단추가 아닌 클릭 영역. 공통 Button·Row·MenuItem·IconButton 을 쓴다(R7)
 *     ownTrash   : 꾸러미가 제 손으로 휴지통 부모 사슬을 판정한 수(`roots.trash`·`tree.trash`·`trashedFrom` 글자) — 판정은 nodes.isTrashed·liveByType 로(R7)
 *       ⚠️ 이 글자 셈은 못 잡는 모양이 있다(다른 이름의 변수·동적 접근). 확실히 잡히는 판별식만 센다. 휴지통의 주인 explorer 는 기준값이 높아도 정상이다.
 *     enterNoIme : `key === 'Enter'` 를 쓰는데 isImeEnter·isComposing 가드가 같은 파일에 없는 「파일」 수 — 한글 조합 중 Enter 가 확정으로 새지 않게(R7)
 *   ② ③ ⑤ ① 은 공통 부품 내부(pane-ui-system/primitives/)를 세지 않는다 — 부품이 제 몸에서 쓰는 건 당연하다.
 *   줄었으면 기준을 내린다:  RATCHET_UPDATE=1 npx vitest run src/pane-ui-system/__tests__/ratchet.test.ts
 *   ⛔ 기준을 올리는 건 규칙을 어기는 일이다 — 올려야 하면 이유를 커밋에 적는다(새 꾸러미는 0 에서 시작한다).
 *
 * 🔴 이 검사 자체가 금지 패턴 문자열을 품으니 검사 폴더(__tests__)는 스캔 대상에서 뺀다(structure.test 와 같다).
 * ⚠️ 셈의 한계: cmdIdString 은 매니페스트에 `{ id: 'x.y', title: … }` 꼴로 선언된 명령만 안다(동적으로 만든 id 는 못 본다).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src');
const BASELINE_FILE = join(ROOT, 'pane-ui-system', '__tests__', 'ratchet-baseline.json');

type Metric = 'bareButton' | 'arbPx' | 'cmdIdString' | 'ctxDirect' | 'roleToolbar'
    | 'zRaw' | 'bareInput' | 'divClick' | 'ownTrash' | 'enterNoIme';
type Counts = Record<Metric, number>;

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

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/** 세는 범위 — 꾸러미마다 하나, 앱, 창틀 */
const pluginDirs = readdirSync(join(ROOT, 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const SCOPES: Record<string, string> = {
    ...Object.fromEntries(pluginDirs.map((d) => [`plugins/${d}`, join(ROOT, 'plugins', d)])),
    app: join(ROOT, 'app'),
    'pane-ui-system': join(ROOT, 'pane-ui-system'),
};

/** 창틀 Toolbar 단 하나 — role="toolbar" 세기의 유일한 예외 */
const TOOLBAR_PRIMITIVE = join(ROOT, 'pane-ui-system', 'primitives', 'Toolbar.tsx');
const files = Object.fromEntries(Object.entries(SCOPES).map(([k, dir]) => [k, walk(dir).map((f) => readFileSync(f, 'utf-8'))]));
/** 공통 부품 내부 — R7 지표(zRaw·bareInput·divClick·enterNoIme)가 안 센다 */
const PARTS_DIR = join(ROOT, 'pane-ui-system', 'primitives') + '/';
const outsideParts = (scope: string) => walk(SCOPES[scope]).filter((f) => !f.startsWith(PARTS_DIR)).map((f) => readFileSync(f, 'utf-8'));
const r7Texts = Object.fromEntries(Object.keys(SCOPES).map((k) => [k, outsideParts(k)]));
const roleToolbarTexts = Object.fromEntries(Object.entries(SCOPES).map(([k, dir]) => [k, walk(dir).filter((f) => f !== TOOLBAR_PRIMITIVE).map((f) => readFileSync(f, 'utf-8'))]));

/** 명령 id 선언 → 주인 범위. 매니페스트 contributes 의 `{ id: 'x.y', title: … }` 꼴 */
const COMMAND_DEF = /\{\s*id:\s*'([a-z][a-z0-9-]*\.[A-Za-z0-9.]+)'\s*,\s*title:/g;
const commandOwner = new Map<string, string>();
for (const [scope, texts] of Object.entries(files)) {
    for (const t of texts) for (const m of t.matchAll(COMMAND_DEF)) commandOwner.set(m[1], scope);
}

function measure(scope: string): Counts {
    const texts = files[scope];
    let bareButton = 0, arbPx = 0, cmdIdString = 0, ctxDirect = 0, roleToolbar = 0;
    let zRaw = 0, bareInput = 0, divClick = 0, ownTrash = 0, enterNoIme = 0;
    for (const t of r7Texts[scope]) {
        zRaw += count(t, /\bz-\[\d+\]/g) + count(t, /\bzIndex\s*:\s*\d/g);
        bareInput += count(t, /<(?:input|select)\b/g);
        divClick += count(t, /<div\b(?:=>|[^>])*?\sonClick\b/g);
        if (/key\s*===\s*['"]Enter['"]/.test(t) && !/isImeEnter|isComposing/.test(t)) enterNoIme += 1;
    }
    for (const t of texts) ownTrash += count(t, /\broots\.trash\b|\btree\.trash\b|\btrashedFrom\b/g);
    for (const t of roleToolbarTexts[scope]) roleToolbar += count(t, /role\s*[=:]\s*\{?\s*["']toolbar["']/g);
    for (const t of texts) {
        bareButton += count(t, /<button\b/g);
        arbPx += count(t, /-\[\d+(?:\.\d+)?px\]/g);
        ctxDirect += count(t, /\bonContextMenu\b/g);
        for (const [id, owner] of commandOwner) {
            if (owner === scope) continue;
            cmdIdString += t.split(`'${id}'`).length - 1;
            cmdIdString += t.split(`"${id}"`).length - 1;
        }
    }
    return { bareButton, arbPx, cmdIdString, ctxDirect, roleToolbar, zRaw, bareInput, divClick, ownTrash, enterNoIme };
}

const current: Record<string, Counts> = Object.fromEntries(Object.keys(SCOPES).map((s) => [s, measure(s)]));

if (process.env.RATCHET_UPDATE) {
    writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + '\n');
}

const baseline: Record<string, Counts> = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
const METRICS: Metric[] = ['bareButton', 'arbPx', 'cmdIdString', 'ctxDirect', 'roleToolbar', 'zRaw', 'bareInput', 'divClick', 'ownTrash', 'enterNoIme'];
const HOW: Record<Metric, string> = {
    bareButton: '공통 Button·IconButton·Dialog 를 써라',
    arbPx: '글자는 단계 토큰(text-micro·note·small·body·lead), 치수는 토큰·표준 클래스로',
    cmdIdString: '다른 꾸러미 명령은 그 꾸러미 약속 파일의 상수로 불러라',
    ctxDirect: '우클릭은 창틀 useContextTrigger + ContextMenu 로 — 꾸러미는 메뉴 항목만 낸다',
    roleToolbar: '툴바는 Frame 의 toolbar 자리에 창틀 Toolbar 로 — role="toolbar" 를 직접 쓰지 마라',
    zRaw: '겹침은 z 토큰(z-modal 260 · z-popover 270 · z-tooltip 290 · z-toast 300)으로 — 맨 숫자 금지',
    bareInput: '공통 TextInput·InlineRename·Select·Toggle 을 써라',
    divClick: '클릭은 공통 Button·Row·MenuItem·IconButton 으로 — div 에 onClick 을 달지 마라',
    ownTrash: '휴지통 판정은 nodes.isTrashed·liveByType 로 — 부모 사슬을 제 손으로 걷지 마라',
    enterNoIme: 'Enter 확정은 isImeEnter 가드(또는 TextInput onEnter·InlineRename)로 — 한글 조합 중 Enter 가 새지 않게',
};

describe('톱니 검사 — 직접 짠 것이 늘지 않는다', () => {
    it('기준 파일이 있고 세는 범위가 비어 있지 않다(빈 스캔 거짓 통과 방지)', () => {
        expect(Object.keys(baseline).length).toBeGreaterThan(0);
        expect(Object.values(current).some((c) => c.arbPx > 0)).toBe(true);
        expect(commandOwner.size).toBeGreaterThan(0);
    });

    for (const scope of Object.keys(SCOPES)) {
        for (const metric of METRICS) {
            it(`${scope} · ${metric}`, () => {
                const base = baseline[scope]?.[metric] ?? 0;   // 기준에 없는 새 범위는 0 에서 시작한다
                expect(
                    current[scope][metric],
                    `${scope} 의 ${metric} 이 늘었다(기준 ${base} → 지금 ${current[scope][metric]}) — ${HOW[metric]}. `
                    + '줄었다면 RATCHET_UPDATE=1 로 기준을 내려라.',
                ).toBeLessThanOrEqual(base);
            });
        }
    }
});
