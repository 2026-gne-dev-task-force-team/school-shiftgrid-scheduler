/**
 * NodeIconPicker — 노드 아이콘 고르기 창. 탭 셋(이모지 · 아이콘 · 커스텀) + 검색 + 최근 사용 + 무작위 + 지우기.
 *   키보드: 방향키로 칸 이동 · Enter 로 고름 · Esc 로 닫음(팝오버가 맡는다). 검색칸은 한글 조합 중 Enter 를 확정으로 안 받는다.
 *   색: 아이콘 탭에서 여덟 색(+기본) 중 하나를 먼저 고르면 그 색으로 저장된다.
 *   🔴 색·치수는 토큰 클래스로만. 이모지 데이터는 외부 패키지 없이 emoji-data.ts 한 장.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ICON_NAMES, Icon } from '../primitives/Icon';
import { Button } from '../primitives/Button';
import { TextInput } from '../primitives/TextInput';
import { isImeEnter } from '../primitives/ime';
import { storageKey } from '../storage';
import { ALL_EMOJI } from './emoji-data';
import { COLS, customSections, emojiSections, iconSections, moveActive, pushRecent, rowsOf, type PickerTab } from './cells';
import { NODE_ICON_COLORS, serializeNodeIcon, type NodeIconColor } from './model';
import { NodeIcon } from './NodeIcon';
import { useIconPacks } from './packs';

const RECENT_KEY = 'nodeIcon.recent';
function loadRecent(): string[] {
    try { const v = JSON.parse(localStorage.getItem(storageKey(RECENT_KEY)) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function saveRecent(list: string[]): void {
    try { localStorage.setItem(storageKey(RECENT_KEY), JSON.stringify(list)); } catch { /* 저장이 막혀도 고르기는 된다 */ }
}

const TABS: { id: PickerTab; label: string }[] = [
    { id: 'emoji', label: '이모지' },
    { id: 'icon', label: '아이콘' },
    { id: 'custom', label: '커스텀' },
];

export function NodeIconPanel({ value, onPick }: {
    value: string | undefined;
    /** 고른 저장 문자열 · 지우기는 undefined */
    onPick: (v: string | undefined) => void;
}) {
    const packs = useIconPacks();
    const [tab, setTab] = useState<PickerTab>('emoji');
    const [query, setQuery] = useState('');
    const [color, setColor] = useState<NodeIconColor | undefined>(undefined);
    const [recent] = useState(loadRecent);
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);

    const sections = useMemo(() => (
        tab === 'emoji' ? emojiSections(query, recent)
            : tab === 'icon' ? iconSections(query, color, recent)
                : customSections(query, packs, recent)
    ), [tab, query, color, recent, packs]);
    const rows = useMemo(() => rowsOf(sections), [sections]);
    const flat = useMemo(() => sections.flatMap((s) => s.cells), [sections]);

    useEffect(() => {
        root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
    }, [active, sections]);

    const choose = (v: string | undefined) => {
        if (v) saveRecent(pushRecent(recent, v));
        onPick(v);
    };
    const random = () => {
        if (tab === 'icon') {
            const n = ICON_NAMES[Math.floor(Math.random() * ICON_NAMES.length)];
            return choose(serializeNodeIcon({ kind: 'icon', name: n, color }));
        }
        if (tab === 'custom') {
            const all = packs.flatMap((p) => p.icons.map((i) => serializeNodeIcon({ kind: 'custom', pack: p.id, id: i.id })!));
            if (all.length) return choose(all[Math.floor(Math.random() * all.length)]);
        }
        choose(ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)].char);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isImeEnter(e)) return;   // 한글 조합 끝 — 확정 아님
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;   // 단추는 자기 클릭이 맡는다
            const c = flat[active];
            if (c) { e.preventDefault(); choose(c.value); }
            return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (e.nativeEvent.isComposing) return;
            const inInput = (e.target as HTMLElement).tagName === 'INPUT';
            // 검색칸 안의 좌우는 캐럿 이동 — 칸이 비었을 때만 격자를 움직인다
            if (inInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && query) return;
            e.preventDefault();
            setActive((a) => moveActive(rows, a, e.key as 'ArrowLeft'));
        }
    };

    let n = 0;
    return (
        <div ref={root} onKeyDown={onKeyDown} className="flex flex-col gap-2" data-node-icon-panel>
            <TextInput
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="검색 (한글·영어)"
                aria-label="아이콘 검색"
                className="w-full min-w-0"
            />
            <div role="tablist" aria-label="아이콘 종류" className="flex items-center gap-1">
                {TABS.map((t) => (
                    <Button key={t.id} variant="plain" size="sm" role="tab" aria-selected={tab === t.id}
                        onClick={() => { setTab(t.id); setActive(0); }}
                        className={tab === t.id ? 'bg-text/[0.1]' : 'text-muted'}>
                        {t.label}
                    </Button>
                ))}
                <span className="flex-1" />
                <Button variant="plain" size="sm" onClick={random} className="text-muted">무작위</Button>
                {value && (
                    <Button variant="plain" size="sm" onClick={() => choose(undefined)} className="text-muted">
                        <Icon name="trash" size={12} /> 지우기
                    </Button>
                )}
            </div>
            {tab === 'icon' && (
                <div className="flex items-center gap-1" role="radiogroup" aria-label="아이콘 색">
                    {[{ id: undefined, label: '기본 색', cls: 'text-text' }, ...NODE_ICON_COLORS].map((c) => (
                        <button key={c.id ?? 'none'} type="button" role="radio" aria-checked={color === c.id} aria-label={c.label} onClick={() => setColor(c.id)}
                            className={`w-5 h-5 rounded-full grid place-items-center ${c.cls} ${color === c.id ? 'ring-2 ring-accent' : ''}`}>
                            <Icon name="dot" size={16} />
                        </button>
                    ))}
                </div>
            )}
            <div className="max-h-[280px] overflow-y-auto" role="listbox" aria-label="아이콘 목록">
                {sections.length === 0 && (
                    <div className="px-1 py-4 text-small text-muted text-center">
                        {tab === 'custom' && !query ? '꾸러미가 내놓은 아이콘이 없어요.' : '찾는 아이콘이 없어요.'}
                    </div>
                )}
                {sections.map((s) => (
                    <div key={s.id} className="mb-1">
                        {s.title && <div className="px-1 pt-1 pb-0.5 text-note text-muted">{s.title}</div>}
                        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                            {s.cells.map((c) => {
                                const i = n++;
                                return (
                                    <button key={c.key} type="button" role="option" tabIndex={-1} title={c.label} aria-label={c.label}
                                        aria-selected={i === active}
                                        onClick={() => choose(c.value)}
                                        onMouseEnter={() => setActive(i)}
                                        className={`grid place-items-center rounded py-1 hover:bg-text/[0.1] ${i === active ? 'bg-text/[0.1] ring-1 ring-accent' : ''}`}>
                                        <NodeIcon value={c.value} size={20} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
