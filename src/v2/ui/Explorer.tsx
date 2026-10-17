/**
 * 왼쪽 탐색기 — 프로젝트(학교) 하나 밑에 표들이 파일처럼 줄 선다.
 * 새로 만들기 · 더블클릭으로 열기 · 이름 바꾸기 · 지우기(휴지통) · 되살리기.
 */
import { useState } from 'react';
import { useV2 } from '../store';
import { Icon } from '../../ui/parts/Icon';

export function Explorer() {
    const st = useV2();
    const [renaming, setRenaming] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [trashOpen, setTrashOpen] = useState(false);

    const projectSelected = st.selection.kind === 'project';

    const beginRename = (id: string, name: string) => { setRenaming(id); setDraft(name); };
    const commitRename = () => {
        if (renaming && draft.trim()) st.renameSheet(renaming, draft.trim());
        setRenaming(null);
    };

    return (
        <div className="h-full flex flex-col text-[13px]">
            {/* 프로젝트 머리 */}
            <button
                onClick={() => st.select({ kind: 'project' })}
                className={`shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line text-left
                    ${projectSelected ? 'bg-panel2 text-text' : 'text-muted hover:text-text'}`}
                title="프로젝트 속성 보기">
                <Icon name="folder" size={15} />
                <span className="truncate font-semibold">{st.project.name || '제목 없는 학교'}</span>
            </button>

            {/* 표 목록 */}
            <div className="flex-1 min-h-0 overflow-auto py-1">
                {st.project.sheets.length === 0 && (
                    <p className="px-3 py-3 text-[12px] text-muted leading-relaxed">
                        아직 표가 없습니다.<br />아래 「새 표」로 하나 만들어 보세요.
                    </p>
                )}
                {st.project.sheets.map((s) => {
                    const selected = st.selection.kind === 'sheet' && st.selection.id === s.id;
                    const isRenaming = renaming === s.id;
                    return (
                        <div key={s.id}
                            className={`group flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 border-l-2 cursor-pointer
                                ${selected ? 'border-accent bg-panel2 text-text' : 'border-transparent text-muted hover:text-text hover:bg-panel2/50'}`}
                            onClick={() => st.select({ kind: 'sheet', id: s.id })}
                            onDoubleClick={() => { if (!isRenaming) st.openSheet(s.id); }}>
                            <Icon name="table" size={14} />
                            {isRenaming ? (
                                <input
                                    autoFocus
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenaming(null); }}
                                    onBlur={commitRename}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 min-w-0 px-1 py-0.5 bg-panel text-text border border-accent rounded text-[12.5px]"
                                />
                            ) : (
                                <span className="flex-1 truncate">{s.name}</span>
                            )}
                            {!isRenaming && (
                                <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                                    <button className="w-6 h-6 grid place-items-center rounded hover:bg-line text-muted" title="이름 바꾸기"
                                        onClick={(e) => { e.stopPropagation(); beginRename(s.id, s.name); }}>
                                        <Icon name="edit" size={13} />
                                    </button>
                                    <button className="w-6 h-6 grid place-items-center rounded hover:bg-line text-muted hover:text-bad" title="휴지통으로 지우기"
                                        onClick={(e) => { e.stopPropagation(); st.removeSheet(s.id); }}>
                                        <Icon name="trash" size={13} />
                                    </button>
                                </span>
                            )}
                        </div>
                    );
                })}

                {/* 휴지통 */}
                {st.project.trash.length > 0 && (
                    <div className="mt-2 border-t border-line pt-1">
                        <button className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-muted hover:text-text"
                            onClick={() => setTrashOpen((v) => !v)}>
                            <Icon name="trash" size={13} />
                            <span>휴지통 ({st.project.trash.length})</span>
                            <Icon name={trashOpen ? 'left' : 'right'} size={12} className="ml-auto" />
                        </button>
                        {trashOpen && st.project.trash.map((s) => (
                            <div key={s.id} className="group flex items-center gap-1.5 pl-6 pr-1.5 py-1.5 text-muted">
                                <span className="flex-1 truncate line-through opacity-70">{s.name}</span>
                                <button className="w-6 h-6 grid place-items-center rounded hover:bg-line text-muted hover:text-ok" title="되살리기"
                                    onClick={() => st.restoreSheet(s.id)}>
                                    <Icon name="undo" size={13} />
                                </button>
                                <button className="w-6 h-6 grid place-items-center rounded hover:bg-line text-muted hover:text-bad" title="완전히 지우기(되돌릴 수 없음)"
                                    onClick={() => { if (confirm(`「${s.name}」을(를) 완전히 지웁니다. 되돌릴 수 없습니다. 계속할까요?`)) st.purgeTrash(s.id); }}>
                                    <Icon name="x" size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 새 표 */}
            <div className="shrink-0 p-2 border-t border-line">
                <button onClick={st.newSheet}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[13px] font-medium bg-accent hover:bg-accenth text-white">
                    <Icon name="plus" size={15} /> 새 표
                </button>
            </div>
        </div>
    );
}
