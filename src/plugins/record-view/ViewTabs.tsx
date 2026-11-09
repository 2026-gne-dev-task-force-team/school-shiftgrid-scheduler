/**
 * 보기 탭 줄 — 추가·이름 바꾸기(더블클릭)·복제·삭제·끌어 순서. 🔴 마지막 하나는 못 지운다.
 *   보기 목록은 안 쥔다(onChange 로 통째 넘긴다 — 바깥이 한 묶음으로 저장 = 되돌리기 한 칸). 활성 탭만 onSelect.
 */
import { useRef, useState } from 'react';
import { Icon } from '../../pane-ui-system';
import { Popover } from './Popover';
import { isImeEnter } from './fields/ime';
import { defaultView, uid } from './view-state';
import type { RecordField, ViewDef } from './contracts/record-view';

const itemCls = 'flex items-center gap-2 h-row px-2 rounded text-[13px] text-text hover:bg-text/[0.06] text-left disabled:opacity-50 disabled:cursor-not-allowed';

export function ViewTabs({ views, activeId, fields, onSelect, onChange }: {
    views: ViewDef[];
    activeId: string;
    fields: RecordField[];
    onSelect: (id: string) => void;
    onChange: (views: ViewDef[], select?: string) => void;
}) {
    const [renaming, setRenaming] = useState<string | null>(null);
    const [menu, setMenu] = useState<{ id: string; rect: DOMRect } | null>(null);
    const dragId = useRef<string | null>(null);

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
    const drop = (to: string) => {
        const from = dragId.current;
        dragId.current = null;
        if (!from || from === to) return;
        const rest = views.filter((v) => v.id !== from);
        rest.splice(rest.findIndex((v) => v.id === to), 0, views.find((v) => v.id === from)!);
        onChange(rest);
    };

    return (
        <div className="flex items-center gap-0.5 px-2 pt-1 border-b border-line shrink-0 overflow-x-auto" data-rv-view-tabs>
            {views.map((v) => {
                const on = v.id === activeId;
                return renaming === v.id ? (
                    <input key={v.id} autoFocus defaultValue={v.name} data-rv-view-rename={v.id}
                        onKeyDown={(e) => { if (isImeEnter(e)) return; if (e.key === 'Enter') rename(v.id, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null); }}
                        onBlur={(e) => rename(v.id, e.target.value)}
                        className="h-row w-[110px] px-2 mb-1 rounded border border-line bg-bg text-[13px] text-text outline-none" />
                ) : (
                    <button key={v.id} type="button" data-rv-view-tab={v.id} aria-selected={on} role="tab" draggable
                        onClick={(e) => (on ? setMenu({ id: v.id, rect: e.currentTarget.getBoundingClientRect() }) : onSelect(v.id))}
                        onDoubleClick={() => { setMenu(null); setRenaming(v.id); }}
                        onDragStart={(e) => { dragId.current = v.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', v.id); } catch { /* 사파리 */ } }}
                        onDragOver={(e) => { if (dragId.current) e.preventDefault(); }}
                        onDrop={(e) => { e.preventDefault(); drop(v.id); }}
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
                    <div className="flex flex-col gap-0.5" data-rv-view-menu>
                        <button type="button" data-rv-view-act="rename" className={itemCls} onClick={() => { setRenaming(menu.id); setMenu(null); }}><Icon name="edit" size={14} />이름 바꾸기</button>
                        <button type="button" data-rv-view-act="duplicate" className={itemCls} onClick={() => { duplicate(menu.id); setMenu(null); }}><Icon name="copy" size={14} />복제</button>
                        <button type="button" data-rv-view-act="delete" disabled={views.length <= 1} className={`${itemCls} text-bad`} onClick={() => { remove(menu.id); setMenu(null); }}><Icon name="trash" size={14} />삭제</button>
                    </div>
                </Popover>
            )}
        </div>
    );
}
