/**
 * 설정 화면 — 2단 메뉴 껍데기. 왼쪽 메뉴 목록 · 오른쪽 고른 메뉴의 내용.
 * 좁은 화면이면 "메뉴 → 내용" 한 단계씩(내용에 뒤로 가기).
 *
 * 🔴 메뉴는 레지스트리다(registry.ts) — 이 파일은 "어느 메뉴를 고르나" 만 쥔다.
 *    내용 자체는 각 Pane 파일에 산다. ⛔ 여기에 설정 항목을 직접 쓰지 않는다.
 * 🔴 features/ 라 색은 토큰 클래스로만.
 */
import { useState } from 'react';
import { Row } from '../../workbench';
import { Icon } from '../../workbench';
import { IconButton } from '../../workbench';
import { useNarrow } from '../../workbench';
import type { ThemeControls } from '../../workbench';
import { SETTINGS_MENUS } from './registry';

export function SettingsScreen({ theme }: { theme: ThemeControls }) {
    const narrow = useNarrow();
    const [selected, setSelected] = useState<string>(SETTINGS_MENUS[0]?.id ?? '');
    // 좁은 화면에서만 뜻이 있다 — 메뉴 목록을 보는 중인가, 내용을 보는 중인가
    const [showContent, setShowContent] = useState(false);

    const menu = SETTINGS_MENUS.find((m) => m.id === selected) ?? SETTINGS_MENUS[0];
    const Pane = menu?.Pane;

    const MenuList = (
        <nav className="flex flex-col gap-0.5 p-pad">
            {SETTINGS_MENUS.map((m) => (
                <Row
                    key={m.id}
                    icon={m.icon}
                    label={m.title}
                    active={!narrow && m.id === selected}
                    onClick={() => { setSelected(m.id); if (narrow) setShowContent(true); }}
                    title={m.title}
                    end={narrow ? <Icon name="right" size={14} className="text-muted" /> : undefined}
                />
            ))}
        </nav>
    );

    const Content = (
        <div className="flex-1 min-w-0 overflow-auto p-4">
            {Pane && <Pane theme={theme} />}
        </div>
    );

    // ── 좁은 화면: 한 단계씩 ──
    if (narrow) {
        if (!showContent) {
            return (
                <div className="flex-1 min-h-0 overflow-auto bg-bg">
                    <div className="h-header px-pad flex items-center border-b border-line select-none">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">설정</span>
                    </div>
                    {MenuList}
                </div>
            );
        }
        return (
            <div className="flex-1 min-h-0 flex flex-col bg-bg">
                <div className="h-header px-pad flex items-center gap-1 border-b border-line select-none shrink-0">
                    <IconButton icon="left" label="메뉴로" size={15} onClick={() => setShowContent(false)} />
                    <span className="text-[13px] font-semibold text-text">{menu?.title}</span>
                </div>
                {Content}
            </div>
        );
    }

    // ── 넓은 화면: 좌 메뉴 · 우 내용 ──
    return (
        <div className="flex-1 min-h-0 flex bg-bg overflow-hidden">
            <div className="shrink-0 w-44 border-r border-line overflow-auto">
                <div className="h-header px-pad flex items-center border-b border-line select-none">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">설정</span>
                </div>
                {MenuList}
            </div>
            {Content}
        </div>
    );
}
