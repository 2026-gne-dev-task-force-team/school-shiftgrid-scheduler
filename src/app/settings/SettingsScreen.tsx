/**
 * 설정 화면 — 2단 메뉴 껍데기. 왼쪽 메뉴(섹션별로 묶임) · 오른쪽 고른 메뉴의 내용.
 *
 * 세 가지 몸짓(쥔님 2026-11-01 — 옵시디언 설정 참고):
 *   ① 넓게: 좌 메뉴(섹션 머리 + 항목) · 우 내용
 *   ② 좁아지면(뷰 폭 < collapseBelow, collapsed=true): 왼쪽 메뉴가 "아이콘만" 으로 접힌다
 *   ③ 더 좁으면(좁은 화면): "메뉴 → 내용" 한 단계씩
 *
 * 🔴 메뉴는 레지스트리다(registry.ts) — 이 파일은 "어느 항목을 고르나" 만 쥔다. 내용은 각 Pane 에 산다.
 * 🔴 features/ 라 색은 토큰 클래스로만.
 */
import { useState } from 'react';
import { Row, Icon, IconButton, SectionHeader, useNarrow, useTheme } from '../../pane-ui-system';
import { SETTINGS_SECTIONS, SETTINGS_ITEMS } from './registry';

export function SettingsScreen({ collapsed = false }: { collapsed?: boolean }) {
    // 테마 제어는 여기서 쥔다 — 설정 뷰를 꽂는 플러그인은 테마를 몰라도 된다(얇은 래퍼만)
    const theme = useTheme();
    const narrow = useNarrow();
    const [selected, setSelected] = useState<string>(SETTINGS_ITEMS[0]?.id ?? '');
    // 좁은 화면에서만 뜻이 있다 — 메뉴 목록을 보는 중인가, 내용을 보는 중인가
    const [showContent, setShowContent] = useState(false);

    const item = SETTINGS_ITEMS.find((m) => m.id === selected) ?? SETTINGS_ITEMS[0];
    const Pane = item?.Pane;

    // 섹션별로 묶은 전체 메뉴(넓은 화면·한 단계 목록 공용)
    const MenuList = (
        <nav className="flex flex-col py-1">
            {SETTINGS_SECTIONS.map((sec) => (
                <div key={sec.id}>
                    <SectionHeader title={sec.title} />
                    <div className="flex flex-col gap-0.5 p-pad">
                        {sec.items.map((m) => (
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
                    </div>
                </div>
            ))}
        </nav>
    );

    // 접힌 메뉴 — 아이콘만. 섹션 머리는 뺀다(폭이 없다), 툴팁으로 이름을 남긴다
    const IconMenu = (
        <nav className="flex flex-col items-center gap-0.5 py-2">
            {SETTINGS_ITEMS.map((m) => (
                <IconButton
                    key={m.id}
                    icon={m.icon}
                    label={m.title}
                    size={16}
                    active={m.id === selected}
                    onClick={() => setSelected(m.id)}
                />
            ))}
        </nav>
    );

    const Content = (
        <div className="flex-1 min-w-0 overflow-auto px-6 py-5">
            {Pane && <Pane theme={theme} />}
        </div>
    );

    // ── ③ 좁은 화면: 한 단계씩 ──
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
                    <span className="text-[13px] font-semibold text-text">{item?.title}</span>
                </div>
                {Content}
            </div>
        );
    }

    // ── ①② 넓은 화면: 좌 메뉴 · 우 내용. collapsed 면 왼쪽을 아이콘만으로 접는다 ──
    // 🔴 세로선(border-r)은 self-stretch 로 영역 끝까지 — 내용이 짧아도 선이 중간에 끊기지 않게
    return (
        <div className="flex-1 min-h-0 flex items-stretch bg-bg overflow-hidden">
            <div className={`shrink-0 self-stretch border-r border-line overflow-auto ${collapsed ? 'w-rail' : 'w-44'}`}>
                {!collapsed && (
                    <div className="h-header px-pad flex items-center border-b border-line select-none">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">설정</span>
                    </div>
                )}
                {collapsed ? IconMenu : MenuList}
            </div>
            {Content}
        </div>
    );
}
