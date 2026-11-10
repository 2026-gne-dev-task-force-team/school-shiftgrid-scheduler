/**
 * 페이지 편집 화면 — 노션식. 블록을 세로로 쌓고, 활성 블록 하나만 contentEditable(원본 글자)로,
 *   나머지는 서식으로 보여 준다(편집 중엔 원본·떠나면 서식). 모델·키 규칙은 전부 core 순수 함수에 있고
 *   여기선 캐럿(DOM)과 상태만 챙긴다.
 *   🔴 데이터는 노드 다리(nodes.ts)로만 — 페이지도 노드고 저장·휴지통은 노드 시스템이 쥔다.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { isMod, ContextMenu, focusWhenReady, Icon, undoKey, useContextTrigger, useDragLeaf, type DragBind, type MenuEntry } from '../../../pane-ui-system';
import type { PluginHost } from '../../../pane-ui-system/plugin';
import { useLeafNode } from '../../../pane-ui-system/plugin';
import { useActivePage, setActivePage } from '../store';
import type { NodesApi } from '../../../pane-ui-system/core/nodes/contracts/nodes';
import { notifyBlocksRemoved } from '../removed';
import { createChildPage, getNodesApi, inlineBlocked, pageViewOf, savePage, inTrash, childPageIds, reviveChildren, getPageRev, subscribePageNodes } from '../nodes';
import { StartScreen } from './StartScreen';
import type { Block, BlockType, NodeDisplay, Page, TableBlockData } from '../core/types';
import { emptyBlock, emptyPage, isList, newId } from '../core/types';
import {
    setText, setChecked, setTable, setNodeRef, setNodeDisplay, splitBlock, outdentOrParagraph, mergeBackspace,
    indentBlock, softBreak, duplicateBlock, moveBlock, removeBlock, changeType, insertAfter, removeBlocks, moveBlocks, rangeIds, type EditResult,
} from '../core/blocks';
import { detectBlockShortcut, toggleMark, exportMarkdown } from '../core/markdown';
import {
    initHistory, commit, undo, redo, canUndo, canRedo, type History,
} from '../core/history';
import { decideKey } from '../core/keys';
import {
    caretAtStart, caretAtEnd, caretSourceOffset, selectionSourceRange,
    setCaretSource, setSelectionSource, serializeInline, buildInlineDom, inlineDomMatches,
} from './caret';
import { SlashMenu, filterSlash } from './SlashMenu';
import { TableBlock } from './TableBlock';
import { NodeBlock } from './NodeBlock';
import { ChildPageBlock } from './ChildPageBlock';
import { syncChildBlocks } from '../core/children';

/** 캐럿을 둘 자리(resync 신호) — end 가 있으면 범위를 고른다(토글 결과). */
interface FocusIntent { id: string; offset: number; end?: number; }
/** `/` 메뉴 상태 — 어느 블록에서 무엇으로 걸렀나. */
interface SlashState { blockId: string; query: string; index: number; }

export function PageView({ host, leafId }: { host: PluginHost; leafId?: string }) {
    const activeId = useLeafNode(leafId, useActivePage(), setActivePage);   // 새로고침 뒤에도 이 탭의 페이지
    // 보고 있는 페이지가 없으면(리본으로 처음 열기 · 휴지통으로 감) 시작 화면 — 새로 만들기 + 목록.
    if (!activeId || inTrash(activeId)) return <StartScreen leafId={leafId} />;
    return (
        <PageEditor
            host={host}
            docKey={activeId}
            leafId={leafId}
            load={() => pageViewOf(activeId)}
            save={(p) => savePage(activeId, p)}
            syncBlocks={(p) => syncChildBlocks(p, childPageIds(activeId))}
            reviveBlocks={(p) => reviveChildren(activeId, p)}
            titleAriaLabel="페이지 제목"
            titlePlaceholder="제목 없음"
        />
    );
}

/**
 * 🔴 본문 편집기 — 제목·아이콘·블록·되돌리기. 저장 자리는 모른다(load·save 를 받는다).
 *   페이지 노드(PageView)도, 다른 꾸러미의 「줄 문서」(모듈 page-doc)도 이걸 쓴다. docKey 가 바뀌면 새 문서로 다시 시작한다.
 */
export interface PageEditorProps {
    host: PluginHost;
    /** 문서 하나를 가리키는 안정 키 = 그 문서의 노드 id — 머리(아이콘·제목)·경로·⋯ 메뉴는 노드 틀(nodes.Frame)이 그린다. */
    docKey: string;
    load: () => Page;
    save: (p: Page) => void;
    /** 이 문서가 놓인 탭 — 주면 이름이 바뀔 때 탭 제목도 같이 고친다(피크는 안 준다). */
    leafId?: string;
    /** 본문을 노드 트리와 맞춘다(Q8 하위 페이지 줄) — 열 때·노드가 바뀔 때·되돌리기 뒤에 불린다. 안 주면 안 맞춘다. */
    syncBlocks?: (p: Page) => Page;
    /** 되돌리기로 본문에 돌아온 줄이 가리키는 휴지통의 페이지를 살린다(syncBlocks 가 줄을 걷기 전에 불린다). */
    reviveBlocks?: (p: Page) => void;
    /** 이름을 노드 이름 말고 다른 곳에도 쥐는 손님(레코드 뷰 행)의 이름 바꾸기 길 — 없으면 노드 이름만. */
    onRename?: (name: string) => void;
    titleAriaLabel?: string;
    titlePlaceholder?: string;
    /** 머리 밑·본문 위에 놓을 것(레코드 열기 페이지의 속성 목록) — 제목·속성·본문이 한 왼쪽 선. */
    properties?: ReactNode;
}

export function PageEditor({ host, docKey: activeId, load, save, syncBlocks, reviveBlocks, leafId, onRename, titleAriaLabel, titlePlaceholder, properties }: PageEditorProps) {
    const [hist, setHist] = useState<History<Page>>(() => initHistory(emptyPage()));
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
    const [focusIntent, setFocusIntent] = useState<FocusIntent | null>(null);
    const [slash, setSlash] = useState<SlashState | null>(null);
    // 🔑 W3 여러 블록 고르기 — 고른 블록 id 들(문서 순서). 글 편집(활성 블록)과 배타: 고르면 활성은 꺼진다.
    const [selected, setSelected] = useState<string[]>([]);
    const selRef = useRef(selected); selRef.current = selected;
    const anchorRef = useRef<string | null>(null);
    const [band, setBand] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

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
        const p = load();
        setHist(initHistory(p));
        setActiveBlockId(null);
        setSlash(null);
        setSelected([]);
        typingRunRef.current = null;
    }, [activeId]);

    // 노드 트리가 바뀌면(탐색기에서 자식 만들기·옮기기·휴지통) 본문의 하위 페이지 줄을 맞춘다 — 저장은 안 한다(트리가 진실 · 루프 없음).
    const nodesRev = useSyncExternalStore(subscribePageNodes, getPageRev, getPageRev);
    useEffect(() => {
        if (!syncBlocks) return;
        setHist((h) => { const n = syncBlocks(h.present); return n === h.present ? h : { ...h, present: n }; });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodesRev]);

    // 캐럿 둘 자리 — resync 신호가 오면 그 블록의 DOM 을 맞추고 캐럿을 소스 오프셋으로 놓는다.
    //   🔴 글자 블록 DOM 은 Editable 의 레이아웃 효과(자식)가 먼저 다시 그린다 → 여기선(부모) 캐럿만 놓는다.
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
                // 혹시 아직 안 그려졌으면 맞춘다(자식 효과가 보통 먼저 돌지만 방어).
                if (blk && !inlineDomMatches(el, blk.text)) buildInlineDom(el, blk.text);
                el.focus();
                if (focusIntent.end != null) setSelectionSource(el, focusIntent.offset, focusIntent.end);
                else setCaretSource(el, focusIntent.offset);
            }
        }
        setFocusIntent(null);
    }, [focusIntent]);

    // ── 저장·커밋 도우미 ──
    const persist = (p: Page) => { save(p); };

    const commitResult = (r: EditResult) => {
        setHist((h) => commit(h, r.page));
        typingRunRef.current = null;
        setSelected([]);
        persist(r.page);
        setActiveBlockId(r.focusId);
        setFocusIntent({ id: r.focusId, offset: r.offset });
    };

    const commitPage = (next: Page, focus?: FocusIntent) => {
        setHist((h) => commit(h, next));
        typingRunRef.current = null;
        setSelected([]);
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
    //   el 이 있으면 글자 블록(contentEditable)이고 text 는 거기서 직렬화한 마크다운이다.
    //   🔴 조합 중(IME)엔 아무것도 하지 않는다 — compositionend 뒤에 한 번만 처리(명세 요구 11).
    const onInput = (id: string, text: string, el?: HTMLElement) => {
        if (composingRef.current) return;

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

        // 🔴 인라인 실시간 변환 — 완성된 마커로 서식 구조가 바뀌면 다시 그리고 캐럿을 소스 오프셋으로 복원.
        //   (평문 입력은 구조가 그대로라 다시 그리지 않는다 → 브라우저 캐럿을 건드리지 않는다)
        if (el && !inlineDomMatches(el, text)) {
            const off = caretSourceOffset(el);
            applyText(id, text);
            setFocusIntent({ id, offset: off });
            return;
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
            commitPage({ ...p, blocks });
            setActiveBlockId(para.id);
            setFocusIntent({ id: para.id, offset: 0 });
            return;
        }
        const nb: Block = { id: cur.id, type: sc.type, text: sc.rest };
        if (sc.type === 'todo') nb.checked = sc.checked ?? false;
        if (isList(sc.type)) nb.indent = 0;
        const blocks = p.blocks.slice();
        blocks[idx] = nb;
        commitPage({ ...p, blocks });
        setFocusIntent({ id: cur.id, offset: sc.rest.length });
    };

    // ── 슬래시 고르기 ──
    const pickSlash = (id: string, type: BlockType) => {
        setSlash(null);
        // `/` 로 시작하던 글자를 지우고 그 종류로.
        const cleared = setText(pageRef.current, id, '');
        if (type === 'childpage') {
            // 하위 페이지 — 이 페이지 밑에 새 페이지를 만들고 이 줄을 그 링크 블록으로 바꾼다
            const cid = createChildPage(activeId);
            if (!cid) { commitPage(cleared); setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); return; }
            commitPage({ ...cleared, blocks: cleared.blocks.map((b) => b.id === id ? { id, type: 'childpage' as const, text: '', nodeId: cid } : b) });
            setActiveBlockId(null);
            // 새 하위 페이지를 열고 그 제목 입력으로 초점(이름 전체 선택)
            getNodesApi()?.open(cid);
            focusWhenReady('input[aria-label="페이지 제목"]', true);
            return;
        }
        const next = changeType(cleared, id, type);
        commitPage(next);
        if (type === 'table' || type === 'node') { setActiveBlockId(null); }
        else { setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); }
    };

    // ── 키 ──
    const onKeyDown = (e: ReactKeyboardEvent, block: Block) => {
        const el = e.currentTarget as HTMLElement;
        const isComposing = composingRef.current || e.nativeEvent.isComposing;
        const isTa = el instanceof HTMLTextAreaElement;
        // 🔴 글자 블록은 DOM 에 서식이 입혀져 있다 — 모델 값(마크다운)은 직렬화로 읽는다(el.textContent 는 마커가 없다).
        const liveText = isTa ? (el as HTMLTextAreaElement).value : serializeInline(el);

        let atStart: boolean; let atEnd: boolean; let offset: number;
        if (isTa) {
            const ta = el as HTMLTextAreaElement;
            atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
            atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
            offset = ta.selectionStart;
        } else {
            atStart = caretAtStart(el); atEnd = caretAtEnd(el); offset = caretSourceOffset(el);
        }

        // `/` 메뉴가 떠 있으면 그 키를 먼저 쓴다.
        if (slash && slash.blockId === block.id && !isComposing) {
            const items = filterSlash(slash.query, !!syncBlocks);
            if (e.key === 'ArrowDown') { e.preventDefault(); setSlash({ ...slash, index: Math.min(slash.index + 1, Math.max(0, items.length - 1)) }); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSlash({ ...slash, index: Math.max(slash.index - 1, 0) }); return; }
            if (e.key === 'Enter') { e.preventDefault(); const it = items[slash.index]; if (it) pickSlash(block.id, it.type); return; }
            if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
        }

        const action = decideKey({
            key: e.key, code: e.code, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey,
            isComposing, atStart, atEnd, isEmpty: block.text === '',
            isListBlock: isList(block.type), isCodeBlock: block.type === 'code',
        });

        const base = () => setText(pageRef.current, block.id, liveText);
        switch (action) {
            case 'default': return;
            case 'split': { e.preventDefault(); const r = splitBlock(base(), block.id, offset); commitResult(r); break; }
            case 'soft-break': {
                e.preventDefault();
                const r = softBreak(base(), block.id, offset);
                commitResult(r);
                break;
            }
            case 'duplicate': {
                e.preventDefault();
                const r = duplicateBlock(base(), block.id);
                commitResult(r);
                break;
            }
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
            case 'select-block': { e.preventDefault(); selectOnly([block.id], block.id); break; }
            case 'nav-prev': { e.preventDefault(); navBlock(block.id, -1, offset); break; }
            case 'nav-next': { e.preventDefault(); navBlock(block.id, 1, offset); break; }
            case 'bold': { e.preventDefault(); doMark(el, block.id, '**'); break; }
            case 'italic': { e.preventDefault(); doMark(el, block.id, '*'); break; }
            case 'code': { e.preventDefault(); doMark(el, block.id, '`'); break; }
            case 'strike': { e.preventDefault(); doMark(el, block.id, '~~'); break; }
            case 'undo': { e.preventDefault(); doUndo(); break; }
            case 'redo': { e.preventDefault(); doRedo(); break; }
        }
    };

    // ↑↓ 블록 이동 — 가로 위치(소스 오프셋 열)를 가능한 만큼 유지한다(명세 요구 2).
    const navBlock = (id: string, dir: -1 | 1, column: number) => {
        const blocks = pageRef.current.blocks;
        let j = blocks.findIndex((b) => b.id === id) + dir;
        while (j >= 0 && j < blocks.length && (blocks[j].type === 'divider' || blocks[j].type === 'table' || blocks[j].type === 'node' || blocks[j].type === 'childpage')) j += dir;
        if (j < 0 || j >= blocks.length) return;
        const t = blocks[j];
        setActiveBlockId(t.id);
        setFocusIntent({ id: t.id, offset: Math.min(column, t.text.length) });
    };

    // ── W3 여러 블록 고르기 ──
    /** 블록들을 골라진 상태로 — 글 편집을 끄고 포커스를 본문 틀로(키 처리는 틀이 쥔다). */
    const selectOnly = (ids: string[], anchor?: string) => {
        setSlash(null);
        setActiveBlockId(null);
        setSelected(ids);
        if (anchor) anchorRef.current = anchor;
        (document.activeElement as HTMLElement | null)?.blur?.();
        rootRef.current?.focus();
    };
    const onShiftSelect = (id: string) => {
        const anchor = anchorRef.current ?? activeBlockRef.current ?? selRef.current[0] ?? id;
        selectOnly(rangeIds(pageRef.current, anchor, id), anchor);
    };
    const selectedMarkdown = () => exportMarkdown({ ...pageRef.current, blocks: pageRef.current.blocks.filter((b) => selRef.current.includes(b.id)) });
    /** 메뉴·선택 삭제 뒤 「되돌리기」 알림 — 편집기 더미를 되돌린다. 뒤에 다른 편집이 쌓이면 회색. */
    const announceRemoved = (r: EditResult, count: number, hasPage: boolean) => {
        notifyBlocksRemoved(host, hasPage ? `블록 ${count}개를 삭제했습니다 (하위 페이지는 휴지통으로 옮겼습니다)` : `블록 ${count}개를 삭제했습니다`,
            () => doUndo(), () => histRef.current.present === r.page);
    };
    const hasChildPage = (ids: string[]) => pageRef.current.blocks.some((b) => ids.includes(b.id) && b.type === 'node');
    const deleteSelected = () => {
        const ids = [...selRef.current];
        if (!ids.length) return;
        const hp = hasChildPage(ids);
        const r = removeBlocks(pageRef.current, ids);
        commitResult(r);
        announceRemoved(r, ids.length, hp);
    };
    const onRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget || selRef.current.length === 0) return;
        const mod = isMod(e);
        const k = e.key.toLowerCase();
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSelected(); return; }
        if (e.key === 'Escape') { e.preventDefault(); setSelected([]); return; }
        if (e.key === 'Enter') { e.preventDefault(); const id = selRef.current[0]; setSelected([]); setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); return; }
        if (mod && (k === 'c' || k === 'x')) {
            e.preventDefault();
            const text = selectedMarkdown();
            if (k === 'c') { void navigator.clipboard?.writeText(text); return; }
            // 🔴 잘라내기 — 클립보드에 쓴 게 끝난 뒤에만 블록을 지운다(쓰기가 막히면 글이 사라지는 사고 방지)
            const ids = [...selRef.current];
            const cb = navigator.clipboard;
            if (!cb) return;
            void cb.writeText(text).then(() => { commitResult(removeBlocks(pageRef.current, ids)); }, () => { /* 못 썼으면 지우지 않는다 */ });
            return;
        }
        // 🔴 되돌리기 키 판정은 창틀 공용 undoKey(한글 조합 중·Alt 낀 것 거름 · Ctrl+Y 다시)
        const u = undoKey(e.nativeEvent);
        if (u) { e.preventDefault(); if (u === 'redo') doRedo(); else doUndo(); }
    };

    const doMark = (el: HTMLElement, id: string, marker: string) => {
        if (el instanceof HTMLTextAreaElement) return;   // 코드 블록엔 서식 토글 안 함
        const { start, end } = selectionSourceRange(el);
        if (start === end) return;                       // 고른 영역이 없으면 토글 안 함(명세: 선택 영역에)
        const live = serializeInline(el);
        const r = toggleMark(live, start, end, marker);
        const next = setText(pageRef.current, id, r.text);
        commitPage(next, { id, offset: r.start, end: r.end });
    };

    const doUndo = () => {
        const nh = undo(histRef.current);
        if (nh === histRef.current) return;
        travel(nh);
    };
    const doRedo = () => {
        const nh = redo(histRef.current);
        if (nh === histRef.current) return;
        travel(nh);
    };
    // 🔑 되돌리기·다시 — 지운 하위 페이지 줄이 돌아오면 그 페이지를 먼저 살리고, 트리와 다시 맞춘 본문을 저장한다
    //   (옛 본문에 없던 자식이 이 저장으로 휴지통에 가는 일이 없게).
    const travel = (nh: History<Page>) => {
        reviveBlocks?.(nh.present);
        const present = syncBlocks ? syncBlocks(nh.present) : nh.present;
        const th = present === nh.present ? nh : { ...nh, present };
        setHist(th); persist(present); timeTravelFocus(present);
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
    const onNodePick = (id: string, nodeId: string) => { commitPage(setNodeRef(pageRef.current, id, nodeId)); };
    const onNodeDisplay = (id: string, display: NodeDisplay) => { commitPage(setNodeDisplay(pageRef.current, id, display)); };
    const onDelete = (id: string) => {
        const hp = hasChildPage([id]);
        const r = removeBlock(pageRef.current, id);
        commitResult(r);
        announceRemoved(r, 1, hp);
    };
    const onDuplicate = (id: string) => {
        const b = pageRef.current.blocks.find((x) => x.id === id);
        if (b) commitResult(insertAfter(pageRef.current, id, structuredClone({ ...b, id: newId() })));
    };
    const onMoveBy = (id: string, delta: number) => {
        const i = pageRef.current.blocks.findIndex((x) => x.id === id);
        if (i >= 0) commitPage(moveBlock(pageRef.current, id, i + delta));
    };
    const onChangeTypeMenu = (id: string, type: BlockType) => {
        const next = changeType(pageRef.current, id, type);
        commitPage(next);
        if (type !== 'table' && type !== 'divider' && type !== 'node') { setActiveBlockId(id); setFocusIntent({ id, offset: 0 }); }
        else setActiveBlockId(null);
    };
    const onDrop = (toIndex: number) => {
        const dragId = dragIdRef.current;
        dragIdRef.current = null;
        if (!dragId) return;
        const sel = selRef.current;
        if (sel.length > 1 && sel.includes(dragId)) {
            commitPage(moveBlocks(pageRef.current, sel, toIndex));
            setSelected(sel);
            return;
        }
        const next = moveBlock(pageRef.current, dragId, toIndex);
        commitPage(next);
    };

    // 🔑 V3 터치 끌기 — 손잡이를 길게 눌렀다가(350ms) 끌면 순서가 바뀐다. 판정은 공용 훅 한 곳(useDragLeaf)에서 오고,
    //   마우스는 이 훅에 안 넣는다(마우스는 위 HTML5 끌기가 이미 맡는다). 스크롤과 안 싸운다: 손잡이만 touch-none, 그 밖은 평소 스크롤.
    const scrollRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const touchDragged = useRef(false);
    const slotAt = (y: number): number => {
        const rows = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-block-row]') ?? [])];
        for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return i; }
        return rows.length;
    };
    const touch = useDragLeaf({
        enabled: true,
        axis: 'y',
        onContext: () => { /* 안 움직이고 떼면 손잡이 click 이 메뉴를 연다 */ },
        onDrop: (id, _x, y) => {
            touchDragged.current = true;
            const d = pageRef.current.blocks.findIndex((b) => b.id === id);
            const slot = slotAt(y);
            const sel = selRef.current;
            if (sel.length > 1 && sel.includes(id)) { commitPage(moveBlocks(pageRef.current, sel, slot)); setSelected(sel); return; }
            const to = slot > d ? slot - 1 : slot;
            if (d >= 0 && to !== d) commitPage(moveBlock(pageRef.current, id, to));
        },
    });
    const dragging = !!touch.drag;
    const dragYRef = useRef<number | undefined>(undefined); dragYRef.current = touch.drag?.y;
    // 끄는 동안 스크롤은 막혀 있다(body.is-dragging) — 위·아래 가장자리에 닿으면 우리가 밀어 준다
    useEffect(() => {
        if (!dragging) return;
        const t = window.setInterval(() => {
            const box = scrollRef.current; const y = dragYRef.current;
            if (!box || y == null) return;
            const r = box.getBoundingClientRect();
            if (y < r.top + 56) box.scrollTop -= 12; else if (y > r.bottom - 56) box.scrollTop += 12;
        }, 16);
        return () => window.clearInterval(t);
    }, [dragging]);
    // 놓을 자리 선 — 끄는 중에만 · 제자리(안 움직이는 자리)는 안 그린다
    const dragFrom = touch.drag ? page.blocks.findIndex((b) => b.id === touch.drag!.leafId) : -1;
    const dropSlot = touch.drag && dragFrom >= 0 ? slotAt(touch.drag.y) : -1;
    const touchLineOf = (i: number): 'before' | 'after' | null => {
        if (dropSlot < 0 || dropSlot === dragFrom || dropSlot === dragFrom + 1) return null;
        if (dropSlot === i) return 'before';
        if (dropSlot === page.blocks.length && i === page.blocks.length - 1) return 'after';
        return null;
    };

    // 사각 선택 — 블록 바깥(여백)에서 끌면 닿은 줄이 골라진다. 판정은 줄 상자와 사각의 겹침.
    const onBandStart = (e: { button: number; target: EventTarget | null; clientX: number; clientY: number }) => {
        const box = scrollRef.current;
        if (e.button !== 0 || !box || (e.target !== box && e.target !== box.parentElement && e.target !== rootRef.current)) return;
        const x1 = e.clientX; const y1 = e.clientY;
        let moved = false;
        const move = (ev: MouseEvent) => {
            if (!moved && Math.hypot(ev.clientX - x1, ev.clientY - y1) < 4) return;
            if (!moved) { moved = true; selectOnly([]); }
            ev.preventDefault();
            const r = { x1, y1, x2: ev.clientX, y2: ev.clientY };
            setBand(r);
            const top = Math.min(r.y1, r.y2); const bot = Math.max(r.y1, r.y2);
            const ids = [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-block-row]') ?? [])]
                .filter((row) => { const b = row.getBoundingClientRect(); return b.bottom >= top && b.top <= bot; })
                .map((row) => row.dataset.blockRow!);
            setSelected(ids);
            anchorRef.current = ids[0] ?? null;
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setBand(null); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
    };

    // 틀의 본문 칸(스크롤 상자의 부모)까지 여백이라 거기서도 시작하게 부모에 건다 — 최신 onBandStart 를 ref 로
    const bandStartRef = useRef(onBandStart); bandStartRef.current = onBandStart;
    useEffect(() => {
        const host = scrollRef.current?.parentElement;
        if (!host) return;
        const h = (e: MouseEvent) => bandStartRef.current(e);
        host.addEventListener('mousedown', h);
        return () => host.removeEventListener('mousedown', h);
    });

    const onFocusBlock = (id: string, offset: number) => {
        setSlash(null);
        setActiveBlockId(id);
        setFocusIntent({ id, offset });
    };

    // 🔴 클릭·탭으로 블록에 포커스가 가면 활성만 바꾼다(캐럿은 브라우저가 클릭 자리에 이미 놓았다 → 건드리지 않는다).
    const onFocusActive = (id: string) => {
        anchorRef.current = id;
        setSelected([]);
        if (activeBlockRef.current === id) return;
        setActiveBlockId(id);
        setSlash(null);
    };

    // ── 그리기 ──
    const copyMarkdown = () => { void navigator.clipboard?.writeText(exportMarkdown(pageRef.current)); };

    // ── 제목·아이콘(요구 12·13) — 노드 틀(nodes.Frame)의 머리가 쥔다(제목 = 노드 이름 한 곳) ──
    // 제목에서 Enter → 본문 첫 블록으로(본문이 비어 있으면 빈 문단 하나 만들고 거기로).
    const titleEnterToBody = () => {
        const p = pageRef.current;
        if (p.blocks.length === 0) {
            const nb = emptyBlock();
            setActiveBlockId(nb.id);
            commitPage({ ...p, blocks: [nb] }, { id: nb.id, offset: 0 });
            return;
        }
        setActiveBlockId(p.blocks[0].id);
        setFocusIntent({ id: p.blocks[0].id, offset: 0 });
    };
    // 본문 빈 곳 클릭 — 끝 블록이 빈 글자 블록이면 거기에, 아니면 새 문단을 붙이고 거기에 커서.
    const clickTail = () => {
        const p = pageRef.current;
        const lastB = p.blocks[p.blocks.length - 1];
        if (lastB && lastB.text === '' && lastB.type !== 'divider' && lastB.type !== 'table' && lastB.type !== 'node' && lastB.type !== 'childpage') {
            setActiveBlockId(lastB.id); setFocusIntent({ id: lastB.id, offset: 0 }); return;
        }
        const nb = emptyBlock();
        setActiveBlockId(nb.id);
        commitPage({ ...p, blocks: [...p.blocks, nb] }, { id: nb.id, offset: 0 });
    };
    // 번호 목록의 보이는 숫자 — 이어진 묶음 안에서 1,2,3…
    const ordinals: Record<string, number> = {};
    let run = 0;
    for (const b of page.blocks) {
        if (b.type === 'numbered') { run += 1; ordinals[b.id] = run; } else { run = 0; }
    }

    const Frame = host.modules.use<NodesApi>('nodes')?.Frame;
    if (!Frame) return <p className="p-4 text-small text-muted">항목 시스템이 꺼져 있어 문서를 그릴 수 없습니다.</p>;
    // 페이지 전체 동작은 상단 줄 ⋯ 메뉴로(R3) — 되돌리기·다시는 단추 없이 ⌘Z·메뉴
    const menu: MenuEntry[] = [
        { label: '실행 취소', icon: 'undo', disabled: !canUndo(hist), onClick: doUndo },
        { label: '다시 실행', icon: 'redo', disabled: !canRedo(hist), onClick: doRedo },
        { label: '마크다운 복사', icon: 'copy', onClick: copyMarkdown },
    ];

    return (
        <Frame nodeId={activeId} leafId={leafId} menu={menu} onRename={onRename}
            titleAriaLabel={titleAriaLabel} titlePlaceholder={titlePlaceholder} onTitleEnter={titleEnterToBody}
            fallback={<Icon name="fileText" size={32} className="text-muted" />}>
            {(header) => (
                <div className="h-full overflow-auto" ref={scrollRef}>
                    <div
                        ref={rootRef}
                        tabIndex={-1}
                        className="max-w-3xl mx-auto px-6 pt-3 pb-16 select-text outline-none"
                        onMouseDown={(e) => { if (e.target === e.currentTarget) { setActiveBlockId(null); setSlash(null); setSelected([]); } }}
                        onKeyDown={onRootKeyDown}
                    >
                        <div className="flex" key={activeId}>{header}</div>
                        {properties && <div className="mb-3">{properties}</div>}
                        {page.blocks.map((b, i) => (
                            <BlockRow
                                key={b.id}
                                block={b}
                                index={i}
                                host={host}
                                active={activeBlockId === b.id}
                                selected={selected.includes(b.id)}
                                onShiftSelect={onShiftSelect}
                                ordinal={ordinals[b.id]}
                                slash={slash && slash.blockId === b.id ? { query: slash.query, index: slash.index } : null}
                                setEl={setEl}
                                onInput={onInput}
                                onKeyDown={onKeyDown}
                                composingRef={composingRef}
                                onFocusBlock={onFocusBlock}
                                onFocusActive={onFocusActive}
                                onChecked={onChecked}
                                onTableChange={onTableChange}
                                onNodePick={onNodePick}
                                onNodeDisplay={onNodeDisplay}
                                selfId={activeId}
                                onPickSlash={pickSlash}
                                canChildPage={!!syncBlocks}
                                onDelete={onDelete}
                                onDuplicate={onDuplicate}
                                onMoveBy={onMoveBy}
                                last={i === page.blocks.length - 1}
                                onChangeType={onChangeTypeMenu}
                                onDragStartBlock={(id) => { dragIdRef.current = id; }}
                                onDropBlock={onDrop}
                                touchBind={touch.bind}
                                touchDraggedRef={touchDragged}
                                touchLine={touchLineOf(i)}
                            />
                        ))}
                        {/* 본문 아래 빈 곳 — 누르면 끝 블록(빈 문단이면 거기, 아니면 새 문단)에 커서 */}
                        <div data-testid="page-tail" className="min-h-[40vh] cursor-text" onMouseDown={(e) => { e.preventDefault(); clickTail(); }} />
                    </div>
                    {band && (
                        <div
                            data-testid="page-band"
                            className="fixed z-30 pointer-events-none border border-accent bg-accent/10"
                            style={{ left: Math.min(band.x1, band.x2), top: Math.min(band.y1, band.y2), width: Math.abs(band.x2 - band.x1), height: Math.abs(band.y2 - band.y1) }}
                        />
                    )}
                </div>
            )}
        </Frame>
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
    /** W3 — 여러 블록 고르기로 골라진 줄 */
    selected: boolean;
    onShiftSelect: (id: string) => void;
    ordinal?: number;
    slash: { query: string; index: number } | null;
    setEl: (id: string, el: HTMLElement | null) => void;
    onInput: (id: string, text: string, el?: HTMLElement) => void;
    onKeyDown: (e: ReactKeyboardEvent, block: Block) => void;
    composingRef: { current: boolean };
    onFocusBlock: (id: string, offset: number) => void;
    onFocusActive: (id: string) => void;
    onChecked: (id: string, checked: boolean) => void;
    onTableChange: (id: string, table: TableBlockData) => void;
    onNodePick: (id: string, nodeId: string) => void;
    /** R3-E 끼워 넣기 표시 모양 바꾸기(링크 카드 ↔ 본문 펼침) */
    onNodeDisplay: (id: string, display: NodeDisplay) => void;
    selfId: string;
    onPickSlash: (id: string, type: BlockType) => void;
    canChildPage: boolean;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onMoveBy: (id: string, delta: number) => void;
    last: boolean;
    onChangeType: (id: string, type: BlockType) => void;
    onDragStartBlock: (id: string) => void;
    onDropBlock: (index: number) => void;
    /** V3 터치 끌기 — 손잡이에만 얹는다(useDragLeaf) · 끌기 직후 따라오는 click 하나 삼키기 · 놓을 자리 선 */
    touchBind: DragBind;
    touchDraggedRef: { current: boolean };
    touchLine: 'before' | 'after' | null;
}

const HEADING_CLASS: Record<string, string> = {
    heading1: 'text-[26px] font-bold leading-tight',
    heading2: 'text-[21px] font-bold leading-tight',
    heading3: 'text-[17px] font-semibold leading-snug',
};

function BlockRow(props: RowProps) {
    const { block, index, slash, active } = props;
    const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);   // 손잡이 클릭·줄 우클릭이 같은 메뉴(R6)
    const menuOpen = !!menu;
    // 글을 쓰는 줄(contenteditable)·입력칸은 브라우저 기본 메뉴(맞춤법·붙여넣기)를 그대로 둔다 — 손잡이·빈 곳·표/노드 블록은 우리 메뉴
    const trigger = useContextTrigger((x, y) => setMenu({ x, y }), (t) => !!t.closest('input, textarea, [contenteditable="true"], [contenteditable=""]'));
    const isChild = block.type === 'childpage';
    const blockItems: MenuEntry[] = isChild ? [
        // 하위 페이지 줄은 종류를 못 바꾸고 복제도 못 한다 — 줄 하나 = 페이지 하나. 지우면 그 페이지도 휴지통(되돌리면 돌아옴)
        { label: '위로', icon: 'up', disabled: index === 0, onClick: () => props.onMoveBy(block.id, -1) },
        { label: '아래로', icon: 'down', disabled: props.last, onClick: () => props.onMoveBy(block.id, 1) },
        { sep: true },
        { label: '삭제', icon: 'trash', danger: true, onClick: () => props.onDelete(block.id) },
    ] : [
        ...([['글로', 'paragraph'], ['제목 1', 'heading1'], ['글머리표', 'bulleted'], ['체크 목록', 'todo'], ['표', 'table'], ['항목 끼워 넣기', 'node']] as const)
            .map(([label, type]) => ({ label, onClick: () => props.onChangeType(block.id, type) })),
        { sep: true },
        // R3-E 끼운 항목의 모양 — 노션 「링크로 / 인라인으로」. 지금 모양은 흐리게 · 자기 자신·상위 항목은 펼치기 못 함
        ...(block.type === 'node' && block.nodeId ? [
            { label: '링크 카드로', icon: 'arrowRight', disabled: block.display !== 'inline', onClick: () => props.onNodeDisplay(block.id, 'card') },
            { label: '본문에 펼치기', icon: 'table', disabled: block.display === 'inline' || inlineBlocked(block.nodeId, props.selfId), onClick: () => props.onNodeDisplay(block.id, 'inline') },
            { sep: true },
        ] satisfies MenuEntry[] : []),
        { label: '복제', icon: 'copy', onClick: () => props.onDuplicate(block.id) },
        { label: '위로', icon: 'up', disabled: index === 0, onClick: () => props.onMoveBy(block.id, -1) },
        { label: '아래로', icon: 'down', disabled: props.last, onClick: () => props.onMoveBy(block.id, 1) },
        { sep: true },
        { label: '삭제', icon: 'trash', danger: true, onClick: () => props.onDelete(block.id) },
    ];
    const [hover, setHover] = useState(false);       // 호버-숨김은 Row 조각 한 곳에만(구조 검사 ③) → 여기선 상태로
    const [dropHere, setDropHere] = useState(false); // 끌고 와서 이 줄 위에 있다 — 위쪽 파란 선
    const shown = hover || active || menuOpen;

    const indentPad = block.indent ? { paddingLeft: `${block.indent * 1.5}rem` } : undefined;

    return (
        // 🔑 R4: 줄 왼쪽 선 = 머리·속성 왼쪽 선. 손잡이는 선 바깥 여백(-left-6, 컬럼 px-6 안)에 절대 배치 — 줄을 밀어내지 않는다.
        <div
            aria-selected={props.selected || undefined}
            onMouseDownCapture={(e) => { if (e.shiftKey && e.button === 0 && !(e.target as HTMLElement).closest('[data-row-id]')) { e.preventDefault(); e.stopPropagation(); props.onShiftSelect(block.id); } }}
            className={`relative ${props.selected ? 'bg-accent/15 rounded' : ''} ${dropHere || props.touchLine === 'before' ? 'border-t-2 border-accent -mt-0.5' : ''} ${props.touchLine === 'after' ? 'border-b-2 border-accent' : ''}`}
            data-block-row={block.id}
            {...trigger}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!dropHere) setDropHere(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHere(false); }}
            onDrop={(e) => { e.preventDefault(); setDropHere(false); props.onDropBlock(index); }}
        >
            {/* 손잡이 — 끌어서 순서, 눌러서 메뉴. 마우스를 올리거나 활성 블록일 때만 보인다(터치는 활성 블록에서) */}
            <div className={`absolute -left-6 top-0.5 w-6 flex justify-center transition-opacity ${shown ? 'opacity-100' : 'opacity-0'}`}>
                {/* oxlint-disable-next-line react/forbid-elements -- 블록 편집 — 본문 모양 */}
                <button
                    type="button"
                    draggable
                    data-row-id={block.id}
                    onPointerDown={(e) => { if (e.pointerType === 'mouse') return; props.touchDraggedRef.current = false; e.stopPropagation(); props.touchBind.onPointerDown(e); }}
                    onPointerMove={(e) => { if (e.pointerType !== 'mouse') props.touchBind.onPointerMove(e); }}
                    onPointerUp={(e) => { if (e.pointerType !== 'mouse') props.touchBind.onPointerUp(e); }}
                    onPointerCancel={(e) => { if (e.pointerType !== 'mouse') props.touchBind.onPointerCancel(); }}
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', block.id);   // 일부 브라우저는 데이터가 있어야 끌기를 시작한다
                        props.onDragStartBlock(block.id);
                    }}
                    onClick={(e) => { if (props.touchDraggedRef.current) { props.touchDraggedRef.current = false; return; } const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right + 4, y: r.top }); }}
                    aria-label="블록 손잡이"
                    className="cursor-grab touch-none rounded py-0.5 text-text/80 hover:text-text hover:bg-text/[0.08]"
                >
                    <Icon name="grip" size={20} />
                </button>
                {menu && <ContextMenu x={menu.x} y={menu.y} items={blockItems} onClose={() => setMenu(null)} />}
            </div>

            {/* 내용 */}
            <div className="min-w-0 py-0.5" style={indentPad}>
                {renderContent(props)}
                {slash && (
                    <SlashMenu items={filterSlash(slash.query, props.canChildPage)} active={slash.index} onPick={(type) => props.onPickSlash(block.id, type)} />
                )}
            </div>
        </div>
    );
}

function renderContent(props: RowProps): ReactElement {
    const { block, host } = props;

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
    if (block.type === 'node') {
        return <NodeBlock nodeId={block.nodeId} display={block.display} selfId={props.selfId} onPick={(nid) => props.onNodePick(block.id, nid)} />;
    }
    if (block.type === 'childpage') {
        return <ChildPageBlock nodeId={block.nodeId} />;
    }
    if (block.type === 'code') {
        return <CodeBlock {...props} />;
    }

    // 🔴 글자 블록(문단·제목·목록·인용) — 늘 편집 가능하고 늘 서식이 입혀져 보인다(렌더/편집 두 모드를 없앴다).
    //   클릭하면 브라우저가 그 자리에 캐럿을 놓는다(명세 요구 2).
    const marker = listMarker(props);
    return (
        <div className="flex items-start gap-1.5">
            {marker}
            <div className="flex-1 min-w-0">
                <Editable {...props} />
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
            // oxlint-disable-next-line react/forbid-elements -- 블록 편집 — 본문 모양
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

/**
 * 글자 블록 편집창 — 🔴 서식이 입혀진 DOM(strong/em/code/s)을 직접 쥔다. React 는 자식을 안 그린다(ref 로만).
 *   · 모델(block.text=마크다운)이 바뀌고 구조가 달라졌을 때만 다시 그린다(캐럿 보존 · 조합 중엔 안 그린다).
 *   · 캐럿은 부모(focusIntent 효과)가 소스 오프셋으로 놓는다 — 자식 효과가 DOM 을 먼저 맞춘 뒤다.
 */
function Editable(props: RowProps) {
    const { block, composingRef } = props;
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (composingRef.current) return;                 // 🔴 IME 조합 중엔 다시 그리지 않는다(글자가 갈라진다)
        if (inlineDomMatches(el, block.text)) return;     // 이미 같은 구조 → 손대지 않는다(브라우저 캐럿 유지)
        buildInlineDom(el, block.text);
    });

    // 빈 문단 안내 — 활성이거나 페이지에 이 블록뿐일 때만(빈 줄마다 깔리면 시끄럽다). 겹쳐 그리는 글자라 DOM <br> 에 안 흔들린다.
    const showHint = block.type === 'paragraph' && block.text === '' && (props.active || (props.index === 0 && props.last));
    return (
        <div className="relative">
            {showHint && (
                <span aria-hidden="true" data-testid="page-empty-hint" className={`absolute left-0 top-0 opacity-40 pointer-events-none select-none ${textClass(block)}`}>
                    여기에 쓰세요 · 「/」로 블록 고르기
                </span>
            )}
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
            onFocus={() => props.onFocusActive(block.id)}
            onInput={(e) => props.onInput(block.id, serializeInline(e.currentTarget), e.currentTarget)}
            onKeyDown={(e) => props.onKeyDown(e, block)}
            onCompositionStart={() => { props.composingRef.current = true; }}
            onCompositionEnd={(e) => {
                props.composingRef.current = false;
                props.onInput(block.id, serializeInline(e.currentTarget), e.currentTarget);
            }}
        />
        </div>
    );
}

/** 코드 블록 — 여러 줄이라 늘 textarea(캐럿·IME 가 안전하다 · 클릭 자리에 캐럿). 글자 그대로라 서식 변환 없음. */
function CodeBlock(props: RowProps) {
    const { block } = props;
    return (
        // oxlint-disable-next-line react/forbid-elements -- 블록 편집 — 본문 모양
        <textarea
            ref={(el) => props.setEl(block.id, el)}
            value={block.text}
            spellCheck={false}
            rows={Math.max(2, block.text.split('\n').length)}
            className="my-1 w-full rounded border border-line bg-text/[0.03] px-3 py-2 text-body font-mono text-text outline-none resize-none"
            style={{ userSelect: 'text' as const, WebkitUserSelect: 'text' }}
            onMouseDown={(e) => e.stopPropagation()}
            onFocus={() => props.onFocusActive(block.id)}
            onChange={(e) => props.onInput(block.id, e.target.value)}
            onKeyDown={(e) => props.onKeyDown(e, block)}
            onCompositionStart={() => { props.composingRef.current = true; }}
            onCompositionEnd={() => { props.composingRef.current = false; }}
        />
    );
}
