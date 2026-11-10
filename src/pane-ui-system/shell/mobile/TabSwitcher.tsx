/**
 * 탭 전환 화면(좁은 화면) — 열린 탭들을 바텀 시트 안 카드 격자(2열)로 본다. 옵시디언·크롬의 탭 전환 몸짓.
 *   - 누르면 그 탭으로 · 길게 누르면 닫기(useContextTrigger — 「길게 누르기」는 그 훅 한 곳에만)
 *   - 「＋ 새 탭」 카드 하나
 * 🔴 split 은 그리지 않는다 — 앱이 flatten() 한 leaf 목록을 TabItem 으로 넘겨 준다(모바일은 스플릿 그림 없음).
 *    창틀은 무엇이 든 탭인지 모른다(아이콘·제목은 뷰 등록소가 준 값이 TabItem 에 실려 온다).
 */
import { BottomSheet } from '../../primitives/BottomSheet';
import { Icon } from '../../primitives/Icon';
import { NodeIcon } from '../../node-icon/NodeIcon';
import { IconButton } from '../../primitives/IconButton';
import { useContextTrigger } from '../../interactive/useContextTrigger';
import type { TabItem } from '../shared/Tabs';

export function TabSwitcher({
    open, onClose, tabs, activeId, onSelect, onCloseTab, onNew,
}: {
    open: boolean;
    onClose: () => void;
    tabs: TabItem[];
    activeId: string | null;
    /** 카드를 누르면 그 탭으로 (고른 뒤 시트는 닫는다) */
    onSelect: (id: string) => void;
    /** 카드를 길게 누르면 닫기 */
    onCloseTab: (id: string) => void;
    /** ＋ 새 탭 */
    onNew: () => void;
}) {
    // 🔴 길게 누르기 판정은 useContextTrigger 한 곳에만 — 어느 카드인지는 data-card-id 로 더듬는다
    const trigger = useContextTrigger((_x, _y, e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('[data-card-id]');
        const id = el?.getAttribute('data-card-id');
        if (id) onCloseTab(id);
    });

    const pick = (id: string) => { onSelect(id); onClose(); };

    return (
        <BottomSheet open={open} onClose={onClose} label="탭 전환">
            <div className="grid grid-cols-2 gap-pad p-pad" {...trigger}>
                {tabs.map((t) => {
                    const active = t.id === activeId;
                    return (
                        <div
                            key={t.id}
                            data-card-id={t.id}
                            role="button"
                            tabIndex={0}
                            aria-label={t.title}
                            aria-current={active}
                            onClick={() => pick(t.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(t.id); } }}
                            title={t.title}
                            className={`relative flex flex-col gap-1.5 rounded-xl border p-pad h-20 cursor-pointer select-none
                                transition-colors bg-bg hover:bg-text/[0.04]
                                ${active ? 'border-accent text-text' : 'border-line text-muted'}`}
                        >
                            <div className="flex items-center gap-1.5 shrink-0">
                                {t.glyph ? <NodeIcon value={t.glyph} size={16} /> : <Icon name={t.icon ?? 'table'} size={16} />}
                                <span className="min-w-0 flex-1 truncate text-body text-text">{t.title}</span>
                                <IconButton
                                    icon="x"
                                    label={`${t.title} 닫기`}
                                    size={13}
                                    className="w-6 h-6 -mr-1 -mt-1"
                                    onClick={(e) => { e.stopPropagation(); onCloseTab(t.id); }}
                                />
                            </div>
                            <div className="flex-1 min-h-0 rounded bg-panel2" aria-hidden="true" />
                        </div>
                    );
                })}

                {/* ＋ 새 탭 카드 — 틀의 조작이다 */}
                <button
                    type="button"
                    onClick={() => { onNew(); onClose(); }}
                    aria-label="새 탭"
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line
                        h-20 text-muted hover:text-text hover:bg-text/[0.04] transition-colors select-none"
                >
                    <Icon name="plus" size={20} />
                    <span className="text-small">새 탭</span>
                </button>
            </div>
        </BottomSheet>
    );
}
