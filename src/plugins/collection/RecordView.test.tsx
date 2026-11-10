// @vitest-environment jsdom
/**
 * RecordView 화면 검산 — DOM 은 data-rv-* 로 단언한다.
 *   🔴 IME(조합 중 Enter 무시) 셀·칸 이름·선택지 · 칸 추가(f_ key) · 제목 칸 보호 · 타입 변환 확인창 · 붙여넣기 · 보기 저장 자리(localStorage 안 생김).
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordView } from './RecordView';
import type { ConvertPlan, PasteRequest, RecordCellValue, RecordField, ViewDef } from './contracts/collection';
import { planConvert } from './convert';
import { normalizeViews } from './view-state';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Rec = { id: string } & Record<string, unknown>;
const START: RecordField[] = [
    { key: 'f_t', label: '제목', type: 'text' },
    { key: 'f_x', label: '값', type: 'text' },
    { key: 'f_s', label: '상태', type: 'select', options: [{ value: 'a', label: '가', color: 'blue' }] },
];

const fn = () => vi.fn<(...args: unknown[]) => void>();
interface Spy { cell: ReturnType<typeof fn>; fields: ReturnType<typeof fn>; paste: ReturnType<typeof fn>; views: ReturnType<typeof fn>; convert: ReturnType<typeof fn>; add: ReturnType<typeof fn> }
function spies(): Spy { return { cell: fn(), fields: fn(), paste: fn(), views: fn(), convert: fn(), add: fn() }; }

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;

/** 상태를 쥐는 감싸개 — 바깥(노드 어댑터 역할)처럼 콜백을 받아 상태를 바꿔 돌려준다 */
function Harness({ init, spy, withViews }: { init: Rec[]; spy: Spy; withViews?: boolean }) {
    const [fields, setFields] = useState(START);
    const [rows, setRows] = useState(init);
    const [views, setViews] = useState<ViewDef[]>(() => normalizeViews(undefined));
    return (
        <RecordView<Rec>
            fields={fields} records={rows} getId={(r) => r.id} viewKey="t.harness" titleKey="f_t"
            views={withViews ? views : undefined}
            onViewsChange={withViews ? (v) => { spy.views(v); setViews(v); } : undefined}
            onCellChange={(id, key, value) => { spy.cell(id, key, value); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r))); }}
            onFieldsChange={(f) => { spy.fields(f); setFields(f); }}
            onConvertField={(plan: ConvertPlan) => {
                spy.convert(plan);
                setFields((fs) => fs.map((f) => (f.key === plan.key ? plan.field : f)));
                setRows((rs) => rs.map((r) => { const c = plan.changes.find((x) => x.id === r.id); return c ? { ...r, [plan.key]: c.value } : r; }));
            }}
            onPaste={(req: PasteRequest) => spy.paste(req)}
            onAddRecord={() => spy.add()}
        />
    );
}

function mount(ui: React.ReactElement) {
    hostEl = document.createElement('div');
    document.body.appendChild(hostEl);
    root = createRoot(hostEl);
    act(() => { root!.render(ui); });
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.querySelectorAll(sel)] as HTMLElement[];
const mi = (label: string) => [...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === label) as HTMLButtonElement | undefined;
function click(el: Element | null) { act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); }); }
function setInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => {
    act(() => { root?.unmount(); });
    hostEl?.remove();
    root = null; hostEl = null;
    document.body.innerHTML = '';
});

describe('🔴 IME 가드 — 조합 중 Enter 는 확정이 아니다', () => {
    it('셀 입력: isComposing Enter 는 onChange 0 · 평범한 Enter 는 확정', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: '' }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_x"]'));
        const input = q('[data-rv-editing]') as HTMLInputElement;
        setInput(input, '한');
        key(input, 'Enter', { isComposing: true });
        expect(spy.cell).not.toHaveBeenCalled();
        key(input, 'Enter', { keyCode: 229 });   // 사파리식 — isComposing 이 false 여도 229
        expect(spy.cell).not.toHaveBeenCalled();
        key(input, 'Enter');
        expect(spy.cell).toHaveBeenCalledWith('r1', 'f_x', '한');
    });

    it('칸 이름 입력: isComposing Enter 는 이름을 안 바꾼다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        const input = q('[data-rv-rename="f_x"] input') as HTMLInputElement;
        setInput(input, '새 이름');
        key(input, 'Enter', { isComposing: true });
        expect(spy.fields).not.toHaveBeenCalled();
        key(input, 'Enter');
        expect(spy.fields).toHaveBeenCalledTimes(1);
        expect((spy.fields.mock.calls[0][0] as RecordField[]).find((f) => f.key === 'f_x')!.label).toBe('새 이름');
    });

    it('새 선택지 입력: isComposing Enter 는 선택지를 안 만든다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_s: null }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_s"]'));
        const input = q('[data-rv-new-opt]') as HTMLInputElement;
        setInput(input, '완료');
        key(input, 'Enter', { isComposing: true });
        expect(spy.fields).not.toHaveBeenCalled();
        key(input, 'Enter');
        const next = spy.fields.mock.calls[0][0] as RecordField[];
        expect(next.find((f) => f.key === 'f_s')!.options!.map((o) => o.label)).toEqual(['가', '완료']);
    });
});

describe('접근 이름', () => {
    it('머리 전체 선택 체크박스에 aria-label — 누르면 「모두 선택 해제」', () => {
        mount(<RecordView<Rec> fields={START} records={[{ id: 'a', f_t: 'A' }]} getId={(r) => r.id} viewKey="t.chk" titleKey="f_t" onDeleteRecords={() => {}} />);
        const c = q('[data-rv-check-all]')!;
        expect(c).toBeTruthy();
        expect(c.getAttribute('aria-label')).toBe('모두 선택');
        click(c);
        expect(q('[data-rv-check-all]')!.getAttribute('aria-label')).toBe('모두 선택 해제');
    });
});

describe('제목 칸 보호', () => {
    it('제목 칸 메뉴에는 칸 삭제가 없고 타입 단추가 모두 비활성', () => {
        mount(<Harness init={[]} spy={spies()} />);
        click(q('[data-rv-head-menu="f_t"]'));
        expect(mi('속성 삭제')).toBeUndefined();
        const types = qa('[data-rv-type]');
        expect(types.length).toBe(15);
        expect(types.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });
    it('다른 칸은 삭제할 수 있다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        expect(mi('속성 삭제')).toBeTruthy();
        click(mi('속성 삭제') ?? null);
        expect((spy.fields.mock.calls[0][0] as RecordField[]).map((f) => f.key)).toEqual(['f_t', 'f_s']);
    });
});

describe('칸 설정(Config) — 칸 메뉴', () => {
    it('관계 칸 메뉴에 Config 가 그려지고 onChange 가 onFieldsChange 로 간다', () => {
        const spy = spies();
        const fields: RecordField[] = [...START, { key: 'f_r', label: '관계', type: 'relation', config: { many: true } }];
        mount(<RecordView<Rec> fields={fields} records={[]} getId={(r) => r.id} viewKey="t.cfg" titleKey="f_t" onCellChange={() => {}} onFieldsChange={(f) => spy.fields(f)} />);
        click(q('[data-rv-head-menu="f_x"]'));
        expect(q('[data-rv-rel-config]')).toBeNull();   // Config 없는 칸(text)엔 안 그려진다
        click(q('[data-rv-head-menu="f_r"]'));
        expect(q('[data-rv-rel-config="f_r"]')).toBeTruthy();
        click(q('[data-rv-rel-config="f_r"] [role="switch"]'));
        const out = spy.fields.mock.calls.at(-1)![0] as RecordField[];
        expect(out.map((f) => f.key)).toEqual(['f_t', 'f_x', 'f_s', 'f_r']);
        expect(out[3].config).toMatchObject({ many: false });
    });

    it('검수 K2 — 머리 메뉴에서 선택지를 편집한다(잠긴 칸도)', () => {
        const spy = spies();
        const fields: RecordField[] = START.map((f) => (f.key === 'f_s' ? { ...f, locked: true } : f));
        mount(<RecordView<Rec> fields={fields} records={[]} getId={(r) => r.id} viewKey="t.k2" titleKey="f_t" onCellChange={() => {}} onFieldsChange={(f) => spy.fields(f)} />);
        click(q('[data-rv-head-menu="f_x"]'));
        expect(q('[data-rv-head-options]')).toBeNull();   // 선택지 없는 칸엔 안 그려진다
        click(q('[data-rv-head-menu="f_s"]'));
        expect(q('[data-rv-head-options="f_s"]')).toBeTruthy();
        click(q('[data-rv-head-options="f_s"] [data-rv-opt="a"]'));
        expect(q('[data-rv-opt-editor="a"]')).toBeTruthy();
        click(q('[data-rv-opt-color="red"]'));
        const out = spy.fields.mock.calls.at(-1)![0] as RecordField[];
        expect(out.find((f) => f.key === 'f_s')!.options).toEqual([{ value: 'a', label: '가', color: 'red' }]);
    });

    it('검수 K20 — 설명이 있는 열 머리에만 ⓘ 가 있다', () => {
        const fs: RecordField[] = [START[0], { ...START[1], description: '금액(원)' }, { ...START[2], description: '   ' }];
        mount(<RecordView<Rec> fields={fs} records={[]} getId={(r) => r.id} viewKey="t.k20" titleKey="f_t" />);
        expect(q('[data-rv-head-info="f_x"]')).not.toBeNull();
        expect(q('[data-rv-head-info="f_t"]')).toBeNull();
        expect(q('[data-rv-head-info="f_s"]')).toBeNull();
    });

    it('검수 K1 — 목록 설명이 표 위와 빈 표 안내에 뜬다 · 읽기 전용이면 누름 자리가 없다', () => {
        mount(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.k1" titleKey="f_t" description="이 학교 교직원 명단" />);
        expect(q('p[data-rv-desc]')?.textContent).toBe('이 학교 교직원 명단');
        expect(q('[data-rv-empty-desc]')?.textContent).toBe('이 학교 교직원 명단');
    });

    it('검수 K21 — usage 가 있으면 빈 표에 번호 매긴 사용법과 「새 행 추가」 단추가 뜬다 · 없으면 지금 안내', () => {
        const add = vi.fn();
        mount(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.k21" titleKey="f_t" description="명단" usage={['첫째', '둘째']} onAddRecord={add} />);
        const lis = [...document.querySelectorAll('[data-rv-empty-usage] li')].map((x) => x.textContent);
        expect(lis).toEqual(['첫째', '둘째']);
        expect(q('[data-rv-empty-desc]')?.textContent).toBe('명단');
        const btn = [...document.querySelectorAll('[data-rv-empty] button')].find((b) => b.textContent?.includes('새 행 추가'));
        expect(btn).toBeTruthy();
        click(btn!);
        expect(add).toHaveBeenCalled();
        act(() => root!.render(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.k21" titleKey="f_t" onAddRecord={add} />));
        expect(q('[data-rv-empty-usage]')).toBeNull();
        expect(q('[data-rv-empty]')?.textContent).toContain('새로 만들기');
    });

    it('검수 K1 — 설명 없고 고칠 수 없으면 줄 자체가 없다 · 고칠 수 있으면 눌러서 고친다', () => {
        const onDesc = vi.fn();
        mount(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.k1b" titleKey="f_t" />);
        expect(q('[data-rv-desc]')).toBeNull();
        expect(q('[data-rv-empty-desc]')).toBeNull();
        act(() => root!.render(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.k1b" titleKey="f_t" onDescriptionChange={onDesc} />));
        click(q('button[data-rv-desc]'));
        const inp = q('[data-rv-desc-edit] input') as HTMLInputElement;
        setInput(inp, '방 목록');
        key(inp, 'Enter');
        expect(onDesc).toHaveBeenCalledWith('방 목록');
    });
});

describe('칸 추가 — 타입 고르기', () => {
    it('[data-rv-add-field] → 타입 팝오버(내장 15종) → 칸 +1 · key 가 f_ · 이름 「새 칸」', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-add-field]'));
        expect(qa('[role="menuitem"]')).toHaveLength(15);
        click(mi('숫자') ?? null);
        const next = spy.fields.mock.calls[0][0] as RecordField[];
        expect(next).toHaveLength(4);
        const made = next[3];
        expect(made.key.startsWith('f_')).toBe(true);
        expect(made.label).toBe('새 칸');
        expect(made.type).toBe('number');
    });
});

describe('🔴 타입 변환 — 깎이면 확인창', () => {
    const rows = (): Rec[] => [
        { id: 'r1', f_t: 'a', f_x: '12' },
        { id: 'r2', f_t: 'b', f_x: '12a' },
        { id: 'r3', f_t: 'c', f_x: '12a' },
        { id: 'r4', f_t: 'd', f_x: '12a' },
    ];
    it('안 깎이면 확인창 없이 바로(text 12 → number)', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a', f_x: '12' }]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(q('[data-rv-type="number"]'));
        expect(q('[data-rv-confirm]')).toBeNull();
        expect(spy.convert).toHaveBeenCalledTimes(1);
        expect(q('[data-rv-row="r1"] [data-rv-cell="f_x"]')!.textContent).toBe('12');
    });
    it('3행이 깎이면 [data-rv-confirm] 「3행의 값이 비워집니다」 → 취소하면 아무 일도', () => {
        const spy = spies();
        mount(<Harness init={rows()} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(q('[data-rv-type="number"]'));
        const dlg = q('[data-rv-confirm]')!;
        expect(dlg.textContent).toContain('3행의 값이 비워집니다');
        expect(spy.convert).not.toHaveBeenCalled();
        click(q('[data-rv-confirm-cancel]'));
        expect(q('[data-rv-confirm]')).toBeNull();
        expect(spy.convert).not.toHaveBeenCalled();
    });
    it('확인하면 적용 — 그 3행이 비워진다(값 null)', () => {
        const spy = spies();
        mount(<Harness init={rows()} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(q('[data-rv-type="number"]'));
        click(q('[data-rv-confirm-ok]'));
        expect(q('[data-rv-confirm]')).toBeNull();
        const plan = spy.convert.mock.calls[0][0] as ConvertPlan;
        expect(plan.lost).toBe(3);
        expect(plan.changes.filter((c) => c.value === null).map((c) => c.id)).toEqual(['r2', 'r3', 'r4']);
        expect(q('[data-rv-row="r2"] [data-rv-cell="f_x"]')!.textContent).toBe('');
    });
    it('계산만 하면 값이 안 바뀐다 — 확인 전에는 원본 그대로', () => {
        const plan = planConvert(rows().map((r) => ({ id: r.id, value: r.f_x as RecordCellValue })), START[1], 'number');
        expect(plan.lost).toBe(3);
        expect(rows()[1].f_x).toBe('12a');
    });
});

describe('붙여넣기 — 엑셀 TSV', () => {
    function pasteInto(el: Element, text: string) {
        const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
        ev.clipboardData = { getData: (t: string) => (t === 'text/plain' ? text : '') };
        act(() => { el.dispatchEvent(ev); });
        return ev;
    }
    it('표 영역에 TSV 3줄 → onPaste 한 번 · 보이는 칸 순서에 대응 · 기본 동작을 막는다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        const ev = pasteInto(q('[data-rv-grid]')!, '가\t1\n나\t2\n다\t3\n');
        const req = spy.paste.mock.calls[0][0] as PasteRequest;
        expect(req.rows).toEqual([['가', '1'], ['나', '2'], ['다', '3']]);
        expect(req.keys).toEqual(['f_t', 'f_x']);   // 첫 열 = 제목 칸
        expect(ev.defaultPrevented).toBe(true);
    });
    it('입력칸 안의 붙여넣기는 브라우저에 양보한다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: '' }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_x"]'));
        pasteInto(q('[data-rv-editing]')!, 'a\tb\nc\td');
        expect(spy.paste).not.toHaveBeenCalled();
    });
    it('#22 편집 중 입력칸에 탭·줄바꿈 글 → 그 칸에만(공백으로) 들어가고 행은 안 는다 · 확정하면 한 칸 값', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: '' }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_t"]'));
        const input = q('[data-rv-editing]') as HTMLInputElement;
        const ev = pasteInto(input, 'a\tb\nc\td\n');
        expect(ev.defaultPrevented).toBe(true);
        expect(input.value).toBe('a b\nc d');   // 글 칸(textarea)은 줄바꿈 보존 · 탭은 공백
        expect(spy.paste).not.toHaveBeenCalled();
        expect(spy.add).not.toHaveBeenCalled();
    });
    it('열이 보이는 칸보다 많으면 모자란 열의 key 는 null(칸을 만들 신호)', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        pasteInto(q('[data-rv-grid]')!, '1\t2\t3\t4\t5');
        expect((spy.paste.mock.calls[0][0] as PasteRequest).keys).toEqual(['f_t', 'f_x', 'f_s', null, null]);
    });
});

describe('보기 정의 저장 자리', () => {
    it('views 를 넘기면(노드 얼굴) 필터·정렬이 onViewsChange 로 가고 localStorage 에 collection. 키가 안 생긴다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a' }]} spy={spy} withViews />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(mi('내림차순 정렬') ?? null);
        expect(spy.views).toHaveBeenCalled();
        const last = spy.views.mock.calls.at(-1)![0] as ViewDef[];
        expect(last[0].sorts).toEqual([{ key: 'f_x', dir: 'desc' }]);
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
        expect(keys.filter((k) => k.includes('collection.'))).toEqual([]);
    });
    it('views 를 안 넘기면(보기를 손님이 안 쥐면) localStorage 에 쓴다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a' }]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(mi('오름차순 정렬') ?? null);
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
        expect(keys.some((k) => k.includes('collection.t.harness'))).toBe(true);
    });
    it('칸 숨기기가 columns[].hidden 으로 간다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} withViews />);
        click(q('[data-rv-head-menu="f_x"]'));
        click(mi('칸 숨기기') ?? null);
        const last = spy.views.mock.calls.at(-1)![0] as ViewDef[];
        expect(last[0].columns.find((c) => c.key === 'f_x')).toEqual({ key: 'f_x', hidden: true });
        expect(q('[data-rv-head="f_x"]')).toBeNull();
    });
});

describe('칸 순서 끌기', () => {
    it('머리 칸을 끌어 옮기면 활성 보기 columns 순서가 바뀐다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} withViews />);
        // useReorder 의 키보드 대안(Alt+←) — HTML5 끌기는 걷었다
        for (let i = 0; i < 2; i++) key(q('[data-rv-drag="f_s"]')!, 'ArrowLeft', { altKey: true });
        const last = spy.views.mock.calls.at(-1)![0] as ViewDef[];
        expect(last[0].columns.map((c) => c.key)).toEqual(['f_s', 'f_t', 'f_x']);
    });
});

describe('선택지 편집', () => {
    it('색 바꾸기 → options[].color · 선택지 삭제', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_s: 'a' }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_s"]'));
        click(q('[data-rv-opt-edit="a"]'));
        click(q('[data-rv-opt-color="red"]'));
        expect((spy.fields.mock.calls[0][0] as RecordField[])[2].options![0].color).toBe('red');
        click(q('[data-rv-opt-delete]'));
        expect((spy.fields.mock.calls.at(-1)![0] as RecordField[])[2].options).toEqual([]);
    });
    it('순서(손잡이 Alt+↑) — 배열 순서가 바뀐다', () => {
        const spy = spies();
        const Two = () => {
            const [fields, setFields] = useState<RecordField[]>([
                { key: 'f_t', label: '제목', type: 'text' },
                { key: 'f_s', label: '상태', type: 'select', options: [{ value: 'a', label: '가' }, { value: 'b', label: '나' }] },
            ]);
            return <RecordView<Rec> fields={fields} records={[{ id: 'r1', f_t: '', f_s: null }]} getId={(r) => r.id} viewKey="t.two" titleKey="f_t" onCellChange={() => {}} onFieldsChange={(f) => { spy.fields(f); setFields(f); }} />;
        };
        mount(<Two />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_s"]'));
        // useReorder 키보드 대안(Alt+↑) — 손잡이에서 한 칸 위로
        key(q('[data-rv-opt-grip="b"]')!, 'ArrowUp', { altKey: true });
        expect((spy.fields.mock.calls.at(-1)![0] as RecordField[])[1].options!.map((o) => o.value)).toEqual(['b', 'a']);
    });
});

describe('하위 항목(sub-items) — 트리 UI', () => {
    type TR = { id: string } & Record<string, unknown>;
    function TreeHarness() {
        const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
        const recs: TR[] = [
            { id: 'a', f_t: '부모', __parent: null },
            { id: 'b', f_t: '자식', __parent: 'a' },
            { id: 'c', f_t: '끝', __parent: null },
        ];
        return (
            <RecordView<TR>
                fields={START} records={recs} getId={(r) => r.id} viewKey="t.tree" titleKey="f_t"
                onCellChange={() => {}}
                tree={{
                    parentOf: (r) => (r.__parent as string | null) ?? null,
                    collapsed: (id) => !!collapsed[id],
                    onToggleCollapse: (id) => setCollapsed((cs) => ({ ...cs, [id]: !cs[id] })),
                    onIndent: () => {}, onOutdent: () => {},
                }}
            />
        );
    }
    it('부모만 접기 삼각형을 갖는다 · 잎(자식 없음)은 없다', () => {
        mount(<TreeHarness />);
        expect(q('[data-rv-fold="a"]')).toBeTruthy();
        expect(q('[data-rv-fold="c"]')).toBeNull();
        expect(q('[data-rv-fold="b"]')).toBeNull();
    });
    it('접으면 자손이 사라지고, 다시 펼치면 돌아온다(형제는 그대로)', () => {
        mount(<TreeHarness />);
        expect(q('[data-rv-row="b"]')).toBeTruthy();
        click(q('[data-rv-fold="a"]'));
        expect(q('[data-rv-row="b"]')).toBeNull();
        expect(q('[data-rv-row="c"]')).toBeTruthy();
        click(q('[data-rv-fold="a"]'));
        expect(q('[data-rv-row="b"]')).toBeTruthy();
    });
    it('정렬이 걸리면 트리를 접고 평평해진다 — 자식도 접기 삼각형 없이 다 보인다', () => {
        mount(<TreeHarness />);
        // 제목 칸 머리 메뉴로 정렬을 건다
        click(q('[data-rv-head-menu="f_t"]'));
        click(mi('오름차순 정렬') ?? null);
        expect(q('[data-rv-fold="a"]')).toBeNull();     // 평평 → 접기 없음
        expect(q('[data-rv-row="b"]')).toBeTruthy();    // 모든 행이 평평하게 보인다
    });
});

describe('P2 — url/email/phone 셀', () => {
    const LF: RecordField[] = [{ key: 'f_t', label: '제목', type: 'text' }, { key: 'f_u', label: '링크', type: 'url' }];
    it('형식 맞으면 열기 링크(href) · 틀리면 ⚠', () => {
        mount(
            <RecordView<Rec>
                fields={LF}
                records={[{ id: 'r1', f_t: 't', f_u: 'example.com' }, { id: 'r2', f_t: 't2', f_u: 'notaurl' }]}
                getId={(r) => r.id} viewKey="t.link" titleKey="f_t"
                onCellChange={() => {}}
            />,
        );
        const link = q('[data-rv-row="r1"] [data-rv-link]') as HTMLAnchorElement | null;
        expect(link).toBeTruthy();
        expect(link!.getAttribute('href')).toBe('https://example.com');
        expect(q('[data-rv-row="r2"] [data-rv-invalid]')).toBeTruthy();
        expect(q('[data-rv-row="r2"] [data-rv-link]')).toBeNull();
    });
});

describe('P2 — 날짜 시각·범위 팝오버', () => {
    const DF: RecordField[] = [{ key: 'f_t', label: '제목', type: 'text' }, { key: 'f_d', label: '기간', type: 'date', config: { time: true, range: true } }];
    it('셀을 누르면 시작·종료 달력 + 시각 입력', () => {
        mount(
            <RecordView<Rec>
                fields={DF}
                records={[{ id: 'r1', f_t: 't', f_d: { start: '2026-11-08' } }]}
                getId={(r) => r.id} viewKey="t.date" titleKey="f_t"
                onCellChange={() => {}}
            />,
        );
        click(q('[data-rv-row="r1"] [data-rv-cell="f_d"]'));
        expect(q('[data-rv-date-start]')).toBeTruthy();
        expect(q('[data-rv-date-end]')).toBeTruthy();
        expect(qa('[data-dp-time]').length).toBeGreaterThanOrEqual(2);   // 시작·종료 각각
    });
});

describe('P2 — 행 포커스에서 Tab 들여쓰기 / Shift+Tab 내어쓰기', () => {
    const TF: RecordField[] = [{ key: 'f_t', label: '제목', type: 'text' }];
    function treeRV(onIndent: () => void, onOutdent: () => void) {
        return (
            <RecordView<Rec>
                fields={TF}
                records={[{ id: 'a', f_t: 'a', __parent: null }, { id: 'b', f_t: 'b', __parent: null }]}
                getId={(r) => r.id} viewKey="t.tab" titleKey="f_t"
                onCellChange={() => {}}
                tree={{
                    parentOf: (r) => (r as Rec).__parent as string | null,
                    collapsed: () => false, onToggleCollapse: () => {}, onIndent, onOutdent,
                }}
            />
        );
    }
    it('Tab=들여쓰기 · Shift+Tab=내어쓰기 (셀 편집 아님)', () => {
        const indent = vi.fn(); const outdent = vi.fn();
        mount(treeRV(indent, outdent));
        key(q('[data-rv-row="b"]')!, 'Tab');
        expect(indent).toHaveBeenCalledTimes(1);
        key(q('[data-rv-row="b"]')!, 'Tab', { shiftKey: true });
        expect(outdent).toHaveBeenCalledTimes(1);
    });

    it('칸을 고른 채 ⌘] 들여쓰기 · ⌘[ 내어쓰기 (Tab 은 칸 이동 그대로)', () => {
        const indent = vi.fn(); const outdent = vi.fn();
        mount(treeRV(indent, outdent));
        const cell = q('[data-rv-pos="1:0"]')!;
        act(() => { cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
        const mod = { metaKey: true, ctrlKey: true };
        key(cell, ']', { ...mod, code: 'BracketRight' });
        expect(indent).toHaveBeenCalledWith('b');
        key(cell, '[', { ...mod, code: 'BracketLeft' });
        expect(outdent).toHaveBeenCalledWith('b');
        key(cell, ']', { code: 'BracketRight' });   // ⌘ 없으면 아무 일 없음
        expect(indent).toHaveBeenCalledTimes(1);
    });
});

describe('Q11 W10 — 칸 옵션 「유일」', () => {
    function pasteInto(el: Element, text: string) {
        const ev = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
        ev.clipboardData = { getData: (t: string) => (t === 'text/plain' ? text : '') };
        act(() => { el.dispatchEvent(ev); });
    }
    const turnOn = () => { click(q('[data-rv-head-menu="f_x"]')); click(mi('유일(같은 값 막기)') ?? null); };

    it('칸 메뉴로 켜고 · 겹치는 값 편집은 거부 + 경고 줄 · 다른 값은 통하고 경고가 사라진다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a', f_x: 'Kim' }, { id: 'r2', f_t: 'b', f_x: '' }]} spy={spy} />);
        turnOn();
        expect((spy.fields.mock.calls[0][0] as RecordField[]).find((f) => f.key === 'f_x')!.unique).toBe(true);
        click(q('[data-rv-row="r2"] [data-rv-cell="f_x"]'));
        setInput(q('[data-rv-editing]') as HTMLInputElement, ' kim ');   // 공백·대소문자 무시
        key(q('[data-rv-editing]')!, 'Enter');
        expect(spy.cell).not.toHaveBeenCalled();
        expect(q('[role="alert"][data-rv-unique-msg]')!.textContent).toContain('이미 다른 줄에 있습니다');
        click(q('[data-rv-row="r2"] [data-rv-cell="f_x"]'));
        setInput(q('[data-rv-editing]') as HTMLInputElement, 'Lee');
        key(q('[data-rv-editing]')!, 'Enter');
        expect(spy.cell).toHaveBeenCalledWith('r2', 'f_x', 'Lee');
        expect(q('[data-rv-unique-msg]')).toBeNull();
    });

    it('이미 겹친 값이 있으면 켜지 않고 이유를 보인다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a', f_x: 'x' }, { id: 'r2', f_t: 'b', f_x: 'X' }]} spy={spy} />);
        turnOn();
        expect(spy.fields).not.toHaveBeenCalled();
        expect(q('[data-rv-unique-msg]')!.textContent).toContain('유일을 켤 수 없습니다');
    });

    it('🔴 붙여넣기도 같은 검사 — 기존 값·앞 줄과 겹치는 칸만 비우고 몇 칸인지 알린다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: 'a', f_x: 'kim' }]} spy={spy} />);
        turnOn();
        pasteInto(q('[data-rv-grid]')!, '가\tKIM\n나\tlee\n다\tLee\n라\tpark');
        const req = spy.paste.mock.calls[0][0] as PasteRequest;
        expect(req.rows).toEqual([['가', ''], ['나', 'lee'], ['다', ''], ['라', 'park']]);
        expect(q('[data-rv-unique-msg]')!.textContent).toContain('2칸');
    });
});

describe('R4 — 빈 상태 · 제목 없음 · 새 행', () => {
    const FILT: ViewDef[] = (() => { const v = normalizeViews(undefined); return [{ ...v[0], filter: { and: [{ key: 'f_x', op: 'contains', value: 'zzz' }] } }]; })();
    function FilterHarness({ rows }: { rows: Rec[] }) {
        const [views, setViews] = useState<ViewDef[]>(FILT);
        return <RecordView<Rec> fields={START} records={rows} getId={(r) => r.id} viewKey="t.empty" titleKey="f_t" views={views} onViewsChange={setViews} onCellChange={() => {}} />;
    }
    it('필터 때문에 0개면 「조건에 맞는 항목이 없습니다」 + 「필터 삭제」가 행을 되살린다', () => {
        mount(<FilterHarness rows={[{ id: 'r1', f_t: '가', f_x: 'a' }]} />);
        expect(q('[data-rv-empty="filtered"]')!.textContent).toContain('조건에 맞는 항목이 없습니다');
        expect(q('[data-rv-row="r1"]')).toBeNull();
        const btn = qa('[data-rv-empty="filtered"] button').find((b) => b.textContent!.includes('필터 삭제'))!;
        click(btn);
        expect(q('[data-rv-empty="filtered"]')).toBeNull();
        expect(q('[data-rv-row="r1"]')).toBeTruthy();
    });
    it('검색어 때문에 0개면 「검색어에 맞는 항목이 없습니다」 + 「검색어 지우기」가 행을 되살린다', () => {
        mount(<Harness init={[{ id: 'r1', f_t: '가', f_x: 'a' }]} spy={spies()} />);
        const input = q('[data-rv-search]') as HTMLInputElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zzz');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const box = q('[data-rv-empty="filtered"]')!;
        expect(box.textContent).toContain('검색어에 맞는 항목이 없습니다');
        expect(box.textContent).not.toContain('필터');
        expect(box.className).toContain('sticky');
        click(qa('[data-rv-empty="filtered"] button').find((b) => b.textContent!.includes('검색어 지우기'))!);
        expect(q('[data-rv-row="r1"]')).toBeTruthy();
    });
    it('데이터가 아예 없으면 필터 삭제 단추가 없다(그냥 빈 표)', () => {
        mount(<Harness init={[]} spy={spies()} />);
        expect(q('[data-rv-empty]')).toBeTruthy();
        expect(q('[data-rv-empty="filtered"]')).toBeNull();
    });
    it('S15: 제목이 비면 흐린 「제목 없음」 · 제목이 있으면 안 보인다 · 다른 칸이 비어도 안 보인다', () => {
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: '' }, { id: 'r2', f_t: '있음', f_x: '' }]} spy={spies()} />);
        expect(qa('[data-rv-row="r1"] [data-rv-untitled]')).toHaveLength(1);
        expect(qa('[data-rv-row="r2"] [data-rv-untitled]')).toHaveLength(0);
        expect(qa('[data-rv-row="r1"] [data-rv-untitled]')[0].textContent).toBe('제목 없음');
    });
    it('새 행 전환: 새로 추가된 행만 .ui-pop-in — 첫 렌더 행엔 없다', () => {
        let add: () => void = () => {};
        function AddHarness() {
            const [rows, setRows] = useState<Rec[]>([{ id: 'a', f_t: 'a' }]);
            add = () => setRows((rs) => [...rs, { id: 'b', f_t: 'b' }]);
            return <RecordView<Rec> fields={START} records={rows} getId={(r) => r.id} viewKey="t.pop" titleKey="f_t" onCellChange={() => {}} />;
        }
        mount(<AddHarness />);
        expect(q('[data-rv-row="a"]')!.className).not.toContain('ui-pop-in');
        act(() => add());
        expect(q('[data-rv-row="b"]')!.className).toContain('ui-pop-in');
        expect(q('[data-rv-row="a"]')!.className).not.toContain('ui-pop-in');
    });
});

describe('칸 편집 키 — Enter·Shift+Enter·Tab·Esc·행 추가 단추', () => {
    const two = [{ id: 'r1', f_t: 'A', f_x: 'a' }, { id: 'r2', f_t: 'B', f_x: 'b' }];
    const open = (id: string, k: string) => { click(q(`[data-rv-row="${id}"] [data-rv-cell="${k}"]`)); return q('[data-rv-editing]') as HTMLInputElement; };
    const editingAt = () => q('[data-rv-editing]')?.closest('[data-rv-pos]')?.getAttribute('data-rv-pos');

    it('Enter = 저장 + 아래 행 같은 칸 편집', () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        const input = open('r1', 'f_x');
        setInput(input, 'z');
        key(input, 'Enter');
        expect(spy.cell).toHaveBeenCalledWith('r1', 'f_x', 'z');
        expect(editingAt()).toBe('1:1');
    });
    it('마지막 행 Enter = 확정만(새 행 없음 · 편집 닫힘)', () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        const input = open('r2', 'f_x');
        setInput(input, 'z');
        key(input, 'Enter');
        expect(spy.cell).toHaveBeenCalledWith('r2', 'f_x', 'z');
        expect(spy.add).not.toHaveBeenCalled();
        expect(editingAt()).toBeUndefined();
    });
    it('조합 중 Enter 는 이동도 안 한다', () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        key(open('r1', 'f_x'), 'Enter', { isComposing: true });
        expect(editingAt()).toBe('0:1');
    });
    it('Shift+Enter: 글 칸은 줄바꿈(textarea·저장 안 함) · 숫자 칸은 Enter 와 같다', () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        const ta = open('r1', 'f_x');
        expect(ta.tagName).toBe('TEXTAREA');
        key(ta, 'Enter', { shiftKey: true });
        expect(spy.cell).not.toHaveBeenCalled();
        expect(editingAt()).toBe('0:1');
    });
    it('Tab = 저장 + 오른쪽 칸 편집 · Shift+Tab = 왼쪽 · 행 끝이면 다음 행 첫 칸', async () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        let input = open('r1', 'f_t');
        setInput(input, 'Q');
        key(input, 'Tab');
        expect(spy.cell).toHaveBeenCalledWith('r1', 'f_t', 'Q');
        expect(editingAt()).toBe('0:1');
        key(q('[data-rv-editing]')!, 'Tab', { shiftKey: true });
        expect(editingAt()).toBe('0:0');
        // 셋째(고르기) 칸은 편집창 대신 고르기 팝오버가 뜬다 — 초점이 그 안으로 가고(R3-K), Esc 로 닫으면 칸으로 돌아온다
        key(q('[data-rv-editing]')!, 'Tab');
        key(q('[data-rv-editing]')!, 'Tab');
        expect(document.activeElement?.closest('[data-popover]')).not.toBeNull();
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
        expect(document.activeElement?.getAttribute('data-rv-pos')).toBe('0:2');
    });
    it('Esc = 취소 + 초점은 그 칸에 남는다(body 로 안 빠짐)', () => {
        const spy = spies();
        mount(<Harness init={two} spy={spy} />);
        const input = open('r1', 'f_x');
        setInput(input, 'zz');
        key(input, 'Escape');
        expect(spy.cell).not.toHaveBeenCalled();
        expect(q('[data-rv-editing]')).toBeNull();
        expect(document.activeElement?.getAttribute('data-rv-pos')).toBe('0:1');
    });
    it('행 추가 단추 = 새 행 첫(제목) 칸 편집으로 초점', () => {
        const spy = spies();
        const Grow = () => {
            const [rows, setRows] = useState<Rec[]>(two);
            return <RecordView<Rec> fields={START} records={rows} getId={(r) => r.id} viewKey="t.grow" titleKey="f_t"
                onCellChange={() => {}} onAddRecord={() => { spy.add(); setRows((r) => [...r, { id: 'n' + r.length, f_t: '', f_x: '' }]); }} />;
        };
        mount(<Grow />);
        click(q('[data-rv-add]'));
        expect(editingAt()).toBe('2:0');
    });
});

describe('#42 칸 껍데기 클릭·더블클릭 = 글 칸 편집 시작', () => {
    const dbl = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const up = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    it('칸 여백(껍데기) 클릭·더블클릭이 입력칸을 연다', () => {
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: 'a', f_s: 'a' }]} spy={spies()} />);
        up(q('[data-rv-row="r1"] [data-rv-pos="0:1"]')!);
        expect(q('[data-rv-editing]')).not.toBeNull();
        act(() => { key(q('[data-rv-editing]')!, 'Escape'); });
        dbl(q('[data-rv-row="r1"] [data-rv-pos="0:1"]')!);
        expect(q('[data-rv-editing]')).not.toBeNull();
    });
    it('칸 상자(글자 오른쪽 빈 영역) 클릭도 입력칸을 연다', () => {
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: 'a', f_s: 'a' }]} spy={spies()} />);
        up(q('[data-rv-row="r1"] [data-rv-pos="0:1"] [data-rv-cellbox]')!);
        expect(q('[data-rv-editing]')).not.toBeNull();
    });
    it('선택 칸 껍데기는 편집을 열지 않는다', () => {
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: 'a', f_s: 'a' }]} spy={spies()} />);
        up(q('[data-rv-row="r1"] [data-rv-pos="0:2"]')!); dbl(q('[data-rv-row="r1"] [data-rv-pos="0:2"]')!);
        expect(q('[data-rv-editing]')).toBeNull();
    });
});

describe('R3-K 초점 — 칸 추가 · 열기', () => {
    const addOne = () => {
        click(q('[data-rv-add-field]'));
        click(q('[data-rv-add-menu] [role="menuitem"]'));
    };
    it('칸 종류를 고르면 새 칸 이름 입력에 초점 · 이름 전체 선택', () => {
        mount(<Harness init={[]} spy={spies()} />);
        addOne();
        const ae = document.activeElement as HTMLInputElement;
        expect(ae.getAttribute('aria-label')).toBe('칸 이름');
        expect(ae.value).toBe('새 칸');
        expect([ae.selectionStart, ae.selectionEnd]).toEqual([0, 3]);
    });
    it('기본 이름이 겹치면 「새 칸 2」 · 「새 칸 3」', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        addOne(); key(document.activeElement!, 'Escape');
        click(q('[data-rv-add-field]')); click(q('[data-rv-add-menu] [role="menuitem"]'));
        const labels = (spy.fields.mock.calls.at(-1)![0] as RecordField[]).map((f) => f.label);
        expect(labels.filter((l) => l.startsWith('새 칸'))).toEqual(['새 칸', '새 칸 2']);
    });
    it('행 열기(onOpenRecord) 직전에 그 행의 첫 칸에 초점을 둔다(피크가 닫히면 여기로 돌아온다)', () => {
        const open = vi.fn(() => { expect((document.activeElement as HTMLElement).closest('[data-rv-row]')?.getAttribute('data-rv-row')).toBe('r2'); });
        mount(<RecordView<Rec> fields={START} records={[{ id: 'r1', f_t: 'a' }, { id: 'r2', f_t: 'b' }]} getId={(r) => r.id} viewKey="t.open" titleKey="f_t" onOpenRecord={open} onCellChange={() => {}} />);
        act(() => { q('[data-rv-row="r2"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 })); });
        click(mi('열기') ?? null);
        expect(open).toHaveBeenCalledWith('r2');
    });
});


describe('QA ux2 — 설명 자리·행 ⠿ 메뉴·빈 행 Enter', () => {
    it('빈 목록 설명도 늘 보이는 「설명 추가…」 자리(hover 전용 아님)', () => {
        mount(<RecordView<Rec> fields={START} records={[]} getId={(r) => r.id} viewKey="t.ux2a" titleKey="f_t" onDescriptionChange={() => {}} />);
        const b = q('button[data-rv-desc]')!;
        expect(b.textContent).toBe('설명 추가…');
        expect(b.className).not.toContain('opacity-0');
    });

    it('칸 메뉴의 「설명」 입력 → onFieldsChange 에 description 이 실린다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        const inp = q('[data-rv-field-desc="f_x"] input') as HTMLInputElement;
        setInput(inp, '금액(원)');
        key(inp, 'Enter');
        const out = spy.fields.mock.calls.at(-1)![0] as RecordField[];
        expect(out.find((f) => f.key === 'f_x')!.description).toBe('금액(원)');
    });

    it('⠿ 를 끌지 않고 누르면 행 메뉴 · 버튼 역할 + 툴팁', () => {
        const del = vi.fn();
        mount(<RecordView<Rec> fields={START} records={[{ id: 'r1', f_t: 'a' }]} getId={(r) => r.id} viewKey="t.ux2b" titleKey="f_t" onReorder={() => {}} onDeleteRecords={del} onCellChange={() => {}} />);
        const grip = q('[data-rv-row-drag="r1"]')!;
        expect(grip.getAttribute('aria-haspopup')).toBe('menu');
        expect(grip.getAttribute('title')).toBe('끌어서 옮기기 · 눌러서 메뉴');
        act(() => { grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); });
        act(() => { grip.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 })); });
        click(mi('삭제') ?? null);
        expect(del).toHaveBeenCalledWith(['r1']);
    });

    it('⠿ 메뉴로 위·아래 옮기기 · 첫 행 「위로」·끝 행 「아래로」 비활성', () => {
        const re = vi.fn();
        mount(<RecordView<Rec> fields={START} records={[{ id: 'r1', f_t: 'a' }, { id: 'r2', f_t: 'b' }, { id: 'r3', f_t: 'c' }]} getId={(r) => r.id} viewKey="t.ux2m" titleKey="f_t" onReorder={re} onCellChange={() => {}} />);
        const open = (id: string) => {
            const grip = q(`[data-rv-row-drag="${id}"]`)!;
            act(() => { grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })); });
            act(() => { grip.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 })); });
        };
        const m = (p: string) => [...document.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent?.startsWith(p)) as HTMLButtonElement;
        open('r1');
        expect(m('위로 옮기기').disabled).toBe(true);
        expect(m('아래로 옮기기').disabled).toBe(false);
        expect(m('위로 옮기기').textContent).toContain('Alt+↑');
        click(m('아래로 옮기기'));
        expect(re).toHaveBeenLastCalledWith('r1', 'r3');   // r2 뒤 = r3 앞
        open('r3');
        expect(m('아래로 옮기기').disabled).toBe(true);
        click(m('위로 옮기기'));
        expect(re).toHaveBeenLastCalledWith('r3', 'r2');
    });

    it('마지막 행 Enter 는 비었든 값이 있든 새 행을 안 만든다', () => {
        const spy = spies();
        mount(<Harness init={[{ id: 'r1', f_t: '', f_x: '' }]} spy={spy} />);
        click(q('[data-rv-row="r1"] [data-rv-cell="f_t"]'));
        key(q('[data-rv-editing]')!, 'Enter');
        expect(spy.add).not.toHaveBeenCalled();
        click(q('[data-rv-row="r1"] [data-rv-cell="f_t"]'));
        const input = q('[data-rv-editing]') as HTMLInputElement;
        setInput(input, '가');
        key(input, 'Enter');
        expect(spy.add).not.toHaveBeenCalled();
    });
});
