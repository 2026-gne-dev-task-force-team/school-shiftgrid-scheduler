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
function setInput(el: HTMLInputElement, value: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
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

describe('제목 칸 보호', () => {
    it('제목 칸 메뉴에는 칸 삭제가 없고 타입 단추가 모두 비활성', () => {
        mount(<Harness init={[]} spy={spies()} />);
        click(q('[data-rv-head-menu="f_t"]'));
        expect(mi('칸 삭제')).toBeUndefined();
        const types = qa('[data-rv-type]');
        expect(types.length).toBe(13);
        expect(types.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });
    it('다른 칸은 삭제할 수 있다', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-head-menu="f_x"]'));
        expect(mi('칸 삭제')).toBeTruthy();
        click(mi('칸 삭제') ?? null);
        expect((spy.fields.mock.calls[0][0] as RecordField[]).map((f) => f.key)).toEqual(['f_t', 'f_s']);
    });
});

describe('칸 추가 — 타입 고르기', () => {
    it('[data-rv-add-field] → 타입 팝오버(내장 13종) → 칸 +1 · key 가 f_ · 이름 「새 칸」', () => {
        const spy = spies();
        mount(<Harness init={[]} spy={spy} />);
        click(q('[data-rv-add-field]'));
        expect(qa('[role="menuitem"]')).toHaveLength(13);
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
    it('끌어서 순서 — 배열 순서가 바뀐다', () => {
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
        const mk = (type: string) => { const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }; ev.dataTransfer = {}; return ev; };
        act(() => { q('[data-rv-opt-row="b"]')!.dispatchEvent(mk('dragstart')); });
        act(() => { q('[data-rv-opt-row="a"]')!.dispatchEvent(mk('dragover')); });
        act(() => { q('[data-rv-opt-row="a"]')!.dispatchEvent(mk('drop')); });
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
