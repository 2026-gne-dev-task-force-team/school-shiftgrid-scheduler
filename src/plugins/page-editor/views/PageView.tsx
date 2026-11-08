/**
 * 페이지 편집 화면 — 노션식. 블록을 세로로 쌓고, 활성 블록 하나만 contentEditable(원본 글자)로,
 *   나머지는 서식으로 보여 준다(편집 중엔 원본·떠나면 서식). 모델·키 규칙은 전부 core 순수 함수에 있고
 *   여기선 캐럿(DOM)과 상태만 챙긴다.
 *   🔴 데이터는 노드 다리(nodes.ts)로만 — 페이지도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { useActivePage } from '../store';
import { pageDataOf, savePage, getNodesApi } from '../nodes';
import type { Block, BlockType, Page, TableBlockData } from '../core/types';
import { emptyBlock, emptyPage, isList } from '../core/types';
import {
    setText, setChecked, setTable, splitBlock, outdentOrParagraph, mergeBackspace,
    indentBlock, moveBlock, removeBlock, changeType, type EditResult,
} from '../core/blocks';
import { detectBlockShortcut, toggleMark, exportMarkdown } from '../core/markdown';
import {
    initHistory, commit, undo, redo, canUndo, canRedo, type History,
} from '../core/history';
import { decideKey } from '../core/keys';
import {
    caretAtStart, caretAtEnd, caretOffset, selectionRange, setCaret, setSelection,
} from './caret';
import { InlineText } from './Inline';
import { SlashMenu, filterSlash } from './SlashMenu';
import { TableBlock } from './TableBlock';

/** 캐럿을 둘 자리(resync 신호) — end 가 있으면 범위를 고른다(토글 결과). */
interface FocusIntent { id: string; offset: number; end?: number; }
/** `/` 메뉴 상태 — 어느 블록에서 무엇으로 걸렀나. */
interface SlashState { blockId: string; query: string; index: number; }

export function PageView({ host }: { host: PluginHost }) {
    const activeId = useActivePage();
    const [hist, setHist] = useState<History<Page>>(() => initHistory(emptyPage()));
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [focusIntent, setFocusIntent] = useState<FocusIntent | null>(null);
    const [slash, setSlash] = useState<SlashState | null>(null);

    const page = hist.present;
    const pageRef = useRef(page); pageRef.current = page;
    const histRef = useRef(hist); histRef.current = hist;
    const activeBlockRef = useRef(activeBlockId); activeBlockRef.current = activeBlockId;
    const typingRunRef = useRef<string | null>(null);
    const composingRef = useRef(false);
    const dragIdRef = useRef<string | null>(null);
    const els = useRef<Map<string, HTMLElement>>(new Map());

    const setEl = (id: string, el: HTMLElement | null) => {
        if (el) els.current.set(id, el); else els.current.delete(id);
    };

    // 페이지가 바뀌면(열기) 그 데이터로 새로 시작한다.
    useEffect(() => {
        if (!activeId) return;
        const p = pageDataOf(activeId);
        setHist(initHistory(p));
        setActiveBlockId(null);
        setSlash(null);
        typingRunRef.current = null;
    }, [activeId]);

    // 캐럿 둘 자리 — resync 신호가 오면 그 블록의 DOM 글자를 맞추고 캐럿을 놓는다.
    useLayoutEffect(() => {
        if (!focusIntent) return;
        const el = els.current.get(focusIntent.id);
        if (el) {
            const blk = pageRef.current.blocks.find((b) => b.id === focusIntent.id);
            if (el instanceof HTMLTextAreaElement) {
                if (blk && el.value !== blk.text) el.value = blk.text;
                el.focus();
                const end = focusIntent.end ?? focusIntent.offset;
                el.setSelectionRange(focusIntent.offset, end);
            } else {
                if (blk && el.textContent !== blk.text) el.textContent = blk.text;
                el.focus();
                if (focusIntent.end != null) setSelection(el, focusIntent.offset, focusIntent.end);
                else setCaret(el, focusIntent.offset);
            }
        }
        setFocusIntent(null);
    }, [focusIntent]);

    // ── 저장·커밋 도우미 ──
    const persist = (p: Page) => { if (activeId) savePage(activeId, p); };

    const commitResult = (r: EditResult) => {
        setHist((h) => commit(h, r.page));
        typingRunRef.current = null;
        persist(r.page);
        setActiveBlockId(r.focusId);
        setFocusIntent({ id: r.focusId, offset: r.offset });
    };

    const commitPage = (next: Page, focus?: FocusIntent) => {
        setHist((h) => commit(h, next));
        typingRunRef.current = null;
        persist(next);
        if (focus) setFocusIntent(focus);
    };

    /** 글자 입력 — 같은 블록을 이어 치면 되돌리기 한 칸으로 묶는다(블록 단위). */
    const applyText = (id: string, text: string) => {
        const next = setText(pageRef.current, id, text);
        if (typingRunRef.current === id) {
            setHist((h) => ({ ...h, present: next }));
        } else {
            setHist((h) => commit(h, next));
            typingRunRef.current = id;
        }
        persist(next);
    };

    // ── 입력 들어옴(contentEditable·textarea) ──
    const onInput = (id: string, text: string) => {
        if (composingRef.current) { applyText(id, text); return; }

        // `/` 메뉴 열고/거르기
        if (slash && slash.blockId === id) {
            if (text.startsWith('/')) { setSlash({ blockId: id, query: text.slice(1), index: 0 }); applyText(id, text); return; }
            setSlash(null);
        }
        const blk = pageRef.current.blocks.find((b) => b.id === id);
        if (blk && blk.type === 'paragraph' && text === '/') {
            setSlash({ blockId: id, query: '', index: 0 });
            applyText(id, text);
            return;
        }

        // 줄 앞 단축 변환(문단에서만)
        if (blk && blk.type === 'paragraph') {
            const sc = detectBlockShortcut(text);
            if (sc) { convertByShortcut(id, sc); return; }
        }
        applyText(id, text);
    };

    const convertByShortcut = (id: string, sc: ReturnType<typeof detectBlockShortcut>) => {
        if (!sc) return;
        const p = pageRef.current;
        const idx = p.blocks.findIndex((b) => b.id === id);
        if (idx < 0) return;
        const cur = p.blocks[idx];

        if (sc.type === 'divider') {
            const divider: Block = { id: cur.id, type: 'divider', text: '' };
            const para = emptyBlock();
            const blocks = p.blocks.slice();
            blocks.splice(idx, 1, divider, para);
            commitPage({ blocks });
            setActiveBlockId(para.id);
            setFocusIntent({ id: para.id, offset: 0 });
            return;
        }
        const nb: Block = { id: cur.id, type: sc.type, text: sc.rest };
        if (sc.type === 'todo') nb.checked = sc.checked ?? false;
        if (isList(sc.type)) nb.indent = 0;
        const blocks = p.blocks.slice();
        blocks[idx] = nb;
        commitPage({ blocks });
        setFocusIntent({ id: cur.id, offset: sc.rest.length });
    };

    // ── 슬래시 고르기 ──
    const pickSlash = (id: string, type: BlockType) => {
        setSlash(null);
        // `/` 로 시작하던 글자를 지우고 그 종류로.
        const cleared = setText(pageRef.current, id, '');
        const next = changeType(cleared, id, type);
        commitPage(next);
        if (type === 'table') { setActiveBlockId(null); }
        else { setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); }
    };

    // ── 키 ──
    const onKeyDown = (e: ReactKeyboardEvent, block: Block) => {
        const el = e.currentTarget as HTMLElement;
        const isComposing = composingRef.current || e.nativeEvent.isComposing;
        const isTa = el instanceof HTMLTextAreaElement;
        const liveText = isTa ? (el as HTMLTextAreaElement).value : (el.textContent ?? '');

        let atStart: boolean; let atEnd: boolean; let offset: number;
        if (isTa) {
            const ta = el as HTMLTextAreaElement;
            atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
            atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
            offset = ta.selectionStart;
        } else {
            atStart = caretAtStart(el); atEnd = caretAtEnd(el); offset = caretOffset(el);
        }

        // `/` 메뉴가 떠 있으면 그 키를 먼저 쓴다.
        if (slash && slash.blockId === block.id && !isComposing) {
            const items = filterSlash(slash.query);
            if (e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, index: Math.min(slash.index + 1, Math.max(0, items.length - 1)) }); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, index: Math.max(slash.index - 1, 0) }); return; }
            if (e.key === 'Enter') { e.preventDefault(); const it = items[slash.index]; if (it) pickSlash(block.id, it.type); return; }
            if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
        }

        const action = decideKey({
            key: e.key, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey,
            isComposing, atStart, atEnd, isEmpty: block.text === '',
            isListBlock: isList(block.type), isCodeBlock: block.type === 'code',
        });

        const base = () => setText(pageRef.current, block.id, liveText);
        switch (action) {
            case 'default': return;
            case 'split': { e.preventDefault(); const r = splitBlock(base(), block.id, offset); commitResult(r); break; }
            case 'list-break': { e.preventDefault(); const r = outdentOrParagraph(base(), block.id); commitResult(r); break; }
            case 'merge-prev': {
                e.preventDefault();
                const b = base();
                const r = mergeBackspace(b, block.id);
                if (r.page === b) return;            // 맨 위·표 앞 — 바뀐 것 없음
                commitResult(r);
                break;
            }
            case 'indent': case 'outdent': {
                e.preventDefault();
                const b = base();
                const next = indentBlock(b, block.id, action === 'indent' ? 'in' : 'out');
                if (next === b) return;
                commitPage(next, { id: block.id, offset });
                break;
            }
            case 'nav-prev': { e.preventDefault(); navBlock(block.id, -1); break; }
            case 'nav-next': { e.preventDefault(); navBlock(block.id, 1); break; }
            case 'bold': { e.preventDefault(); doMark(el, block.id, '**'); break; }
            case 'italic': { e.preventDefault(); doMark(el, block.id, '*'); break; }
            case 'undo': { e.preventDefault(); doUndo(); break; }
            case 'redo': { e.preventDefault(); doRedo(); break; }
        }
    };

    const navBlock = (id: string, dir: -1 | 1) => {
        const blocks = pageRef.current.blocks;
        let j = blocks.findIndex((b) => b.id === id) + dir;
        while (j >= 0 && j < blocks.length && (blocks[j].type === 'divider' || blocks[j].type === 'table')) j += dir;
        if (j < 0 || j >= blocks.length) return;
        const t = blocks[j];
        setActiveBlockId(t.id);
        setFocusIntent({ id: t.id, offset: dir > 0 ? 0 : t.text.length });
    };

    const doMark = (el: HTMLElement, id: string, marker: string) => {
        if (el instanceof HTMLTextAreaElement) return;   // 코드 블록엔 서식 토글 안 함
        const live = el.textContent ?? '';
        const { start, end } = selectionRange(el);
        const r = toggleMark(live, start, end, marker);
        const next = setText(pageRef.current, id, r.text);
        commitPage(next, { id, offset: r.start, end: r.end });
    };

    const doUndo = () => {
        const nh = undo(histRef.current);
        if (nh === histRef.current) return;
        setHist(nh); persist(nh.present); timeTravelFocus(nh.present);
    };
    const doRedo = () => {
        const nh = redo(histRef.current);
        if (nh === histRef.current) return;
        setHist(nh); persist(nh.present); timeTravelFocus(nh.present);
    };
    const timeTravelFocus = (p: Page) => {
        typingRunRef.current = null;
        const cur = activeBlockRef.current;
        const exists = !!cur && p.blocks.some((b) => b.id === cur);
        const target = exists ? cur! : (p.blocks[0]?.id ?? null);
        setActiveBlockId(target);
        if (target) setFocusIntent({ id: target, offset: 0 });
    };

    // ── 블록 조작(손잡이) ──
    const onChecked = (id: string, checked: boolean) => { const next = setChecked(pageRef.current, id, checked); commitPage(next); };
    const onTableChange = (id: string, table: TableBlockData) => { const next = setTable(pageRef.current, id, table); commitPage(next); };
    const onDelete = (id: string) => { const r = removeBlock(pageRef.current, id); commitResult(r); };
    const onChangeTypeMenu = (id: string, type: BlockType) => {
        const next = changeType(pageRef.current, id, type);
        commitPage(next);
        if (type !== 'table' && type !== 'divider') { setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); }
        else setActiveBlockId(null);
    };
    const onDrop = (toIndex: number) => {
        const dragId = dragIdRef.current;
        dragIdRef.current = null;
        if (!dragId) return;
        const next = moveBlock(pageRef.current, dragId, toIndex);
        commitPage(next);
    };

    const onFocusBlock = (id: string, offset: number) => {
        setSlash(null);
        setActiveBlockId(id);
        setFocusIntent({ id, offset });
    };

    // ── 그리기 ──
    if (!activeId) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-center text-muted select-none">
                왼쪽 탐색기에서 페이지를 열면 여기에서 쓸 수 있어요. (없으면 폴더에서 「새 페이지」로 만드세요)
            </div>
        );
    }

    const node = getNodesApi()?.get(activeId);
    const copyMarkdown = () => { void navigator.clipboard?.writeText(exportMarkdown(pageRef.current)); };

    // 번호 목록의 보이는 숫자 — 이어진 묶음 안에서 1,2,3…
    const ordinals: Record<string, number> = {};
    let run = 0;
    for (const b of page.blocks) {
        if (b.type === 'numbered') { run += 1; ordinals[b.id] = run; } else { run = 0; }
    }

    const btn = 'flex items-center gap-1 h-btn px-2 rounded border border-line text-[12px] text-muted hover:text-text hover:bg-text/[0.04] disabled:opacity-40';

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line shrink-0">
                <Icon name="fileText" size={15} className="text-muted" />
                <span className="font-medium text-text truncate">{node?.name ?? '페이지'}</span>
                <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" className={btn} disabled={!canUndo(hist)} onMouseDown={(e) => { e.preventDefault(); doUndo(); }}><Icon name="undo" size={12} /> 되돌리기</button>
                    <button type="button" className={btn} disabled={!canRedo(hist)} onMouseDown={(e) => { e.preventDefault(); doRedo(); }}><Icon name="redo" size={12} /> 다시</button>
                    <button type="button" className={btn} onMouseDown={(e) => { e.preventDefault(); copyMarkdown(); }}><Icon name="copy" size={12} /> 마크다운 복사</button>
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                <div
                    className="max-w-3xl mx-auto px-6 py-8"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) { setActiveBlockId(null); setSlash(null); } }}
                >
                    {page.blocks.map((b, i) => (
                        <BlockRow
                            key={b.id}
                            block={b}
                            index={i}
                            host={host}
                            active={activeBlockId === b.id}
                            ordinal={ordinals[b.id]}
                            slash={slash && slash.blockId === b.id ? { query: slash.query, index: slash.index } : null}
                            setEl={setEl}
                            onInput={onInput}
                            onKeyDown={onKeyDown}
                            composingRef={composingRef}
                            onFocusBlock={onFocusBlock}
                            onChecked={onChecked}
                            onTableChange={onTableChange}
                            onPickSlash={pickSlash}
                            onDelete={onDelete}
                            onChangeType={onChangeTypeMenu}
                            onDragStartBlock={(id) => { dragIdRef.current = id; }}
                            onDropBlock={onDrop}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────────────────
// 블록 한 줄
// ──────────────────────────────────────────────────────────────────────────

interface RowProps {
    block: Block;
    index: number;
    host: PluginHost;
    active: boolean;
    ordinal?: number;
    slash: { query: string; index: number } | null;
    setEl: (id: string, el: HTMLElement | null) => void;
    onInput: (id: string, text: string) => void;
    onKeyDown: (e: ReactKeyboardEvent, block: Block) => void;
    composingRef: { current: boolean };
    onFocusBlock: (id: string, offset: number) => void;
    onChecked: (id: string, checked: boolean) => void;
    onTableChange: (id: string, table: TableBlockData) => void;
    onPickSlash: (id: string, type: BlockType) => void;
    onDelete: (id: string) => void;
    onChangeType: (id: string, type: BlockType) => void;
    onDragStartBlock: (id: string) => void;
    onDropBlock: (index: number) => void;
}

const HEADING_CLASS: Record<string, string> = {
    heading1: 'text-[26px] font-bold leading-tight',
    heading2: 'text-[21px] font-bold leading-tight',
    heading3: 'text-[17px] font-semibold leading-snug',
};

function BlockRow(props: RowProps) {
    const { block, index, slash } = props;
    const [menuOpen, setMenuOpen] = useState(false);

    const indentPad = isList(block.type) ? { paddingLeft: `${(block.indent ?? 0) * 1.5}rem` } : undefined;

    return (
        <div
            className="flex items-start gap-1 -ml-7 pl-7 relative"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); props.onDropBlock(index); }}
        >
            {/* 손잡이 — 끌어서 순서, 눌러서 메뉴 */}
            <div className="w-6 shrink-0 flex justify-center pt-1">
                <button
                    type="button"
                    draggable
                    onDragStart={() => props.onDragStartBlock(block.id)}
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="블록 손잡이"
                    className="cursor-grab text-line hover:text-muted"
                >
                    <Icon name="grip" size={14} />
                </button>
                {menuOpen && (
                    <div className="absolute z-20 left-6 top-6 w-40 rounded-md border border-line bg-panel shadow-lg py-1 text-[12px]">
                        <HandleMenuItem label="글로" onPick={() => { props.onChangeType(block.id, 'paragraph'); setMenuOpen(false); }} />
                        <HandleMenuItem label="제목 1" onPick={() => { props.onChangeType(block.id, 'heading1'); setMenuOpen(false); }} />
                        <HandleMenuItem label="글머리표" onPick={() => { props.onChangeType(block.id, 'bulleted'); setMenuOpen(false); }} />
                        <HandleMenuItem label="체크 목록" onPick={() => { props.onChangeType(block.id, 'todo'); setMenuOpen(false); }} />
                        <HandleMenuItem label="표" onPick={() => { props.onChangeType(block.id, 'table'); setMenuOpen(false); }} />
                        <div className="my-1 border-t border-line" />
                        <HandleMenuItem label="삭제" onPick={() => { props.onDelete(block.id); setMenuOpen(false); }} />
                    </div>
                )}
            </div>

            {/* 내용 */}
            <div className="flex-1 min-w-0 py-0.5" style={indentPad}>
                {renderContent(props)}
                {slash && (
                    <SlashMenu items={filterSlash(slash.query)} active={slash.index} onPick={(type) => props.onPickSlash(block.id, type)} />
                )}
            </div>
        </div>
    );
}

function HandleMenuItem({ label, onPick }: { label: string; onPick: () => void }) {
    return (
        <button type="button" onClick={onPick} className="w-full text-left px-3 py-1.5 text-muted hover:text-text hover:bg-text/[0.05]">
            {label}
        </button>
    );
}

function renderContent(props: RowProps): ReactElement {
    const { block, host, active } = props;

    if (block.type === 'divider') {
        return <hr className="my-2 border-0 border-t border-line" />;
    }
    if (block.type === 'table') {
        return (
            <TableBlock
                host={host}
                table={block.table ?? { columns: [], rows: [] }}
                onChange={(t) => props.onTableChange(block.id, t)}
            />
        );
    }
    if (block.type === 'code') {
        return <CodeBlock {...props} />;
    }

    // 글자 블록(문단·제목·목록·인용) — 목록 표식 + 편집창/서식
    const marker = listMarker(props);
    return (
        <div className="flex items-start gap-1.5">
            {marker}
            <div className="flex-1 min-w-0">
                {active
                    ? <Editable {...props} />
                    : (
                        <div
                            className={`${textClass(block)} cursor-text whitespace-pre-wrap break-words`}
                            onMouseDown={(e) => { e.stopPropagation(); props.onFocusBlock(block.id, block.text.length); }}
                        >
                            <InlineText text={block.text} />
                        </div>
                    )}
            </div>
        </div>
    );
}

function listMarker(props: RowProps): ReactElement | null {
    const { block } = props;
    if (block.type === 'bulleted') return <span className="select-none text-text pt-0.5">•</span>;
    if (block.type === 'numbered') return <span className="select-none text-muted pt-0.5 tabular-nums">{props.ordinal ?? 1}.</span>;
    if (block.type === 'todo') {
        return (
            <input
                type="checkbox"
                checked={!!block.checked}
                onChange={(e) => props.onChecked(block.id, e.target.checked)}
                onMouseDown={(e) => e.stopPropagation()}
                className="mt-1 accent-accent"
                aria-label="체크"
            />
        );
    }
    return null;
}

function textClass(block: Block): string {
    const base = HEADING_CLASS[block.type] ?? 'text-[15px] leading-relaxed';
    const text = block.type === 'quote' ? 'text-muted italic' : 'text-text';
    const quote = block.type === 'quote' ? 'border-l-2 border-line pl-3' : '';
    const strike = block.type === 'todo' && block.checked ? 'line-through text-muted' : '';
    return `${base} ${text} ${quote} ${strike}`.trim();
}

/** 활성 블록의 편집창 — 원본 글자(한 덩이). React 는 글자를 안 건드린다(ref 로만 세팅). */
function Editable(props: RowProps) {
    const { block } = props;
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (el) el.textContent = block.text;   // 마운트 때 초기 글자
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={(el) => { ref.current = el; props.setEl(block.id, el); }}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            tabIndex={0}
            spellCheck={false}
            className={`${textClass(block)} outline-none whitespace-pre-wrap break-words`}
            style={{ userSelect: 'text' as const, WebkitUserSelect: 'text' }}
            onMouseDown={(e) => e.stopPropagation()}
            onInput={(e) => props.onInput(block.id, e.currentTarget.textContent ?? '')}
            onKeyDown={(e) => props.onKeyDown(e, block)}
            onCompositionStart={() => { props.composingRef.current = true; }}
            onCompositionEnd={(e) => { props.composingRef.current = false; props.onInput(block.id, e.currentTarget.textContent ?? ''); }}
        />
    );
}

/** 코드 블록 — 여러 줄이라 textarea(캐럿·IME 가 안전하다). */
function CodeBlock(props: RowProps) {
    const { block, active } = props;
    if (!active) {
        return (
            <pre
                className="my-1 rounded border border-line bg-text/[0.03] px-3 py-2 text-[13px] font-mono text-text whitespace-pre-wrap break-words cursor-text"
                onMouseDown={(e) => { e.stopPropagation(); props.onFocusBlock(block.id, block.text.length); }}
            >{block.text === '' ? ' ' : block.text}</pre>
        );
    }
    return (
        <textarea
            ref={(el) => props.setEl(block.id, el)}
            value={block.text}
            spellCheck={false}
            rows={Math.max(2, block.text.split('\n').length)}
            className="my-1 w-full rounded border border-line bg-text/[0.03] px-3 py-2 text-[13px] font-mono text-text outline-none resize-none"
            style={{ userSelect: 'text' as const, WebkitUserSelect: 'text' }}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => props.onInput(block.id, e.target.value)}
            onKeyDown={(e) => props.onKeyDown(e, block)}
            onCompositionStart={() => { props.composingRef.current = true; }}
            onCompositionEnd={() => { props.composingRef.current = false; }}
        />
    );
}
