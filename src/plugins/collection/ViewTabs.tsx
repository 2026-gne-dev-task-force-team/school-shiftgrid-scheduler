/**
 * 보기 탭 줄 — 추가·이름 바꾸기(더블클릭)·복제·삭제·끌어 순서. 🔴 마지막 하나는 못 지운다.
 *   보기 목록은 안 쥔다(onChange 로 통째 넘긴다 — 바깥이 한 묶음으로 저장 = 되돌리기 한 칸). 활성 탭만 onSelect.
 */
import { useState } from 'react';
import { Icon, InlineRename, MenuItem, MenuList, Popover, useReorder } from '../../pane-ui-system';
import { ReorderOverlay } from './ReorderOverlay';
import { defaultView, uid } from './view-state';
import type { RecordField, ViewDef } from './contracts/collection';

export function ViewTabs({ views, activeId, fields, onSelect, onChange }: {
    views: ViewDef[];
    activeId: string;
    fields: RecordField[];
    onSelect: (id: string) => void;
    onChange: (views: ViewDef[], select?: string) => void;
}) {
    const [renaming, setRenaming] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
    // 🔴 순서 바꾸기는 공용 훅 하나(쥔님 ⑨ — 터치 길게 누르기·Alt+←/→ 키보드 포함). 손으로 HTML5 끌기를 짜지 않는다
    const reorder = useReorder<HTMLDivElement>({
        ids: views.map((v) => v.id),
        axis: 'x',
        onReorder: (ids) => onChange(ids.map((id) => views.find((v) => v.id === id)!)),
        onContext: (x, y, el) => {
            const id = el.closest('[data-row-id]')?.getAttribute('data-row-id');
            if (id) setMenu({ id, rect: new DOMRect(x, y, 0, 0) });
        },
    });

    const rename = (id: string, name: string) => {
        setRenaming(null);
        const t = name.trim();
        if (t && views.find((v) => v.id === id)?.name !== t) onChange(views.map((v) => (v.id === id ? { ...v, name: t } : v)));
    };
    const add = () => { const v = defaultView(fields, uid('v_'), `표 ${views.length + 1}`); onChange([...views, v], v.id); };
    const duplicate = (id: string) => {
        const i = views.findIndex((v) => v.id === id);
        if (i < 0) return;
        const copy: ViewDef = { ...(JSON.parse(JSON.stringify(views[i])) as ViewDef), id: uid('v_'), name: `${views[i].name} 사본` };
        onChange([...views.slice(0, i + 1), copy, ...views.slice(i + 1)], copy.id);
    };
    const remove = (id: string) => {
        if (views.length <= 1) return;
        const next = views.filter((v) => v.id !== id);
        onChange(next, id === activeId ? next[0].id : undefined);
    };
    return (
        <div ref={reorder.containerRef} {...reorder.bind} onKeyDown={reorder.onKeyDown}
            onPointerDownCapture={() => { reorder.draggedRef.current = false; }}
            className="flex items-center gap-0.5 px-2 pt-1 border-b border-line shrink-0 overflow-x-auto overflow-y-hidden" data-rv-view-tabs>
            {views.map((v) => {
                const on = v.id === activeId;
                return renaming === v.id ? (
                    <span key={v.id} data-rv-view-rename={v.id} className="inline-flex mb-1">
                        <InlineRename value={v.name} ariaLabel="보기 이름" className="h-row w-[110px] px-2 rounded border border-line bg-bg text-[13px] text-text outline-none"
                            onCommit={(name) => rename(v.id, name)} onCancel={() => setRenaming(null)} />
                    </span>
                ) : (
                    <button key={v.id} type="button" data-rv-view-tab={v.id} data-row-id={v.id} title={v.name} aria-selected={on} role="tab"
                        onClick={(e) => {
                            if (reorder.draggedRef.current) { reorder.draggedRef.current = false; return; }   // 끌기 끝에 따라오는 클릭은 삼킨다
                            if (on) setMenu({ id: v.id, rect: e.currentTarget.getBoundingClientRect() }); else onSelect(v.id);
                        }}
                        onDoubleClick={() => { setMenu(null); setRenaming(v.id); }}
                        className={`shrink-0 inline-flex items-center gap-1 h-row px-2 -mb-px border-b-2 text-[13px] ${on ? 'border-text text-text font-medium' : 'border-transparent text-muted hover:text-text'}`}>
                        <Icon name="table" size={13} />{v.name}
                    </button>
                );
            })}
            <button type="button" data-rv-view-add aria-label="보기 추가" onClick={add}
                className="shrink-0 grid place-items-center w-6 h-6 mb-0.5 rounded text-muted hover:text-text hover:bg-text/[0.06]">
                <Icon name="plus" size={14} />
            </button>
            {menu && (
                <Popover anchor={menu.rect} width={180} onClose={() => setMenu(null)}>
                    <MenuList autoFocus label="보기 메뉴">
                        <MenuItem label="이름 바꾸기" icon="edit" onSelect={() => { setRenaming(menu.id); setMenu(null); }} />
                        <MenuItem label="복제" icon="copy" onSelect={() => { duplicate(menu.id); setMenu(null); }} />
                        <MenuItem label="삭제" icon="trash" danger disabled={views.length <= 1} onSelect={() => { remove(menu.id); setMenu(null); }} />
                    </MenuList>
                </Popover>
            )}
            <ReorderOverlay drag={reorder.drag} indicator={reorder.indicator} axis="x" />
        </div>
    );
}
