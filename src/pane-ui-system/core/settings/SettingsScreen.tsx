/**
 * 설정 화면 — 2단 메뉴 껍데기. 왼쪽 메뉴(섹션별로 묶임) · 오른쪽 고른 메뉴의 내용.
 *
 * 세 가지 몸짓(쥔님 2026-11-01 — 옵시디언 설정 참고):
 *   ① 넓게: 좌 메뉴(섹션 머리 + 항목) · 우 내용
 *   ② 좁아지면(뷰 폭 < collapseBelow, collapsed=true): 왼쪽 메뉴가 "아이콘만" 으로 접힌다
 *   ③ 더 좁으면(좁은 화면): "메뉴 → 내용" 한 단계씩
 *
 * 🔴 ⭐ 메뉴는 이제 상수가 아니라 기여 스토어다 — 플러그인이 host.settings 로 꽂은 섹션·항목을 그린다.
 *    데모가 끄면 「데모」 섹션이 사라지고, 플러그인이 더해지면 섹션이 는다(useContribVersion 구독).
 * 🔴 색은 토큰 클래스로만.
 */
import { useCallback, useMemo, useState } from 'react';
import { Row, Icon, IconButton, SectionHeader, useNarrow, type PeekHandle } from '../..';
import { listSettings, useContribVersion } from '../../plugin';
import { manifest } from './manifest';
import { SettingsChromeContext, type SettingsChrome } from './chrome-context';

/** 플러그인이 더한 설정 묶음 머리 — 앱 섹션 제목(모양·창틀·플러그인·정보)과 같으면 메뉴에 같은 낱말이 두 번 뜬다(S12) */
export const PLUGIN_GROUP_TITLE = '플러그인이 더한 설정';

export function SettingsScreen({ collapsed = false, peek }: { collapsed?: boolean; peek?: PeekHandle }) {
    const narrow = useNarrow();
    useContribVersion();   // 설정 섹션/항목이 바뀌면(플러그인 켜고 끄기) 다시 그린다
    const sections = listSettings();
    const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

    const [selectedId, setSelectedId] = useState<string>('');
    // 좁은 화면에서만 뜻이 있다 — 메뉴 목록을 보는 중인가, 내용을 보는 중인가
    const [showContent, setShowContent] = useState(false);

    // 🔴 Pane 들이 바깥 설정 화면에 손 뻗는 창구 — 피크 띄우기(플러그인 상세) · 다른 설정 항목으로 가기(설정 가기)
    const goToItem = useCallback((id: string) => { setSelectedId(id); if (narrow) setShowContent(true); }, [narrow]);
    const chrome: SettingsChrome = useMemo(() => ({ peek: peek ?? null, goToItem }), [peek, goToItem]);

    // 고른 항목이 사라졌으면(플러그인을 껐다) 첫 항목으로 떨어뜨린다
    const item = items.find((m) => m.id === selectedId) ?? items[0];
    const Pane = item?.Pane;

    // 🔴 앱 설정(이 플러그인이 등록한 것)과 「플러그인이 띄운 설정」을 갈라 그린다 — 쥔님 2026-11-01 13:39:
    //    *"플러그인이 띄운 설정이랑 기존 설정이랑 구분이 안 가"*. 가름선은 owner(= 등록한 플러그인 id).
    const appSections = sections.filter((s) => s.owner === manifest.id);
    const pluginSections = sections.filter((s) => s.owner !== manifest.id);
    const renderSection = (sec: (typeof sections)[number]) => (
        <div key={sec.id}>
            <SectionHeader title={sec.title} />
            <div className="flex flex-col gap-0.5 p-pad">
                {sec.items.map((m) => (
                    <Row
                        key={m.id}
                        icon={m.icon}
                        label={m.title}
                        active={!narrow && m.id === item?.id}
                        onClick={() => { setSelectedId(m.id); if (narrow) setShowContent(true); }}
                        title={m.title}
                        end={narrow ? <Icon name="right" size={14} className="text-muted" /> : undefined}
                    />
                ))}
            </div>
        </div>
    );
    // 섹션별로 묶은 전체 메뉴(넓은 화면·한 단계 목록 공용)
    const MenuList = (
        <nav className="flex flex-col py-1">
            {appSections.map(renderSection)}
            {pluginSections.length > 0 && (
                // 플러그인 묶음 — 굵은 선 + 「플러그인이 더한 설정」 머리(앱 섹션 「플러그인」과 낱말이 겹치지 않게) + 살짝 어두운 바탕으로 앱 설정과 갈린다
                <div className="mt-2 pt-1 border-t-2 border-line bg-side/60">
                    <div className="flex items-center gap-1.5 px-pad h-header select-none">
                        <Icon name="puzzle" size={13} className="text-muted" />
                        <span className="text-note font-semibold uppercase tracking-wide text-muted">{PLUGIN_GROUP_TITLE}</span>
                    </div>
                    {pluginSections.map(renderSection)}
                </div>
            )}
        </nav>
    );

    // 접힌 메뉴 — 아이콘만. 섹션 머리는 뺀다(폭이 없다), 툴팁으로 이름을 남긴다
    const IconMenu = (
        <nav className="flex flex-col items-center gap-0.5 py-2">
            {items.map((m) => (
                <IconButton
                    key={m.id}
                    icon={m.icon}
                    label={m.title}
                    size={16}
                    active={m.id === item?.id}
                    onClick={() => setSelectedId(m.id)}
                />
            ))}
        </nav>
    );

    // 🔴 내용 위에 제목 한 줄 — 어느 설정이 열려 있는지 보이게(쥔님 13:42 *"상단에 제목 정도는 띄워야"*)
    const Content = (
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            {item && !narrow && (
                <div className="shrink-0 flex items-center gap-2 h-header px-6 border-b border-line select-none">
                    {item.icon && <Icon name={item.icon} size={15} className="text-muted" />}
                    <span className="text-body font-semibold text-text truncate">{item.title}</span>
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto px-6 py-5">
                {Pane && <Pane />}
            </div>
        </div>
    );

    // ── ③ 좁은 화면: 한 단계씩 ──
    if (narrow) {
        if (!showContent) {
            return (
                <SettingsChromeContext.Provider value={chrome}>
                    <div className="h-full min-h-0 overflow-auto bg-bg">
                        <div className="h-header px-pad flex items-center border-b border-line select-none">
                            <span className="text-note font-semibold uppercase tracking-wide text-muted">설정</span>
                        </div>
                        {MenuList}
                    </div>
                </SettingsChromeContext.Provider>
            );
        }
        return (
            <SettingsChromeContext.Provider value={chrome}>
                <div className="h-full min-h-0 flex flex-col bg-bg">
                    <div className="h-header px-pad flex items-center gap-1 border-b border-line select-none shrink-0">
                        <IconButton icon="left" label="메뉴로" size={15} onClick={() => setShowContent(false)} />
                        <span className="text-body font-semibold text-text">{item?.title}</span>
                    </div>
                    {Content}
                </div>
            </SettingsChromeContext.Provider>
        );
    }

    // ── ①② 넓은 화면: 좌 메뉴 · 우 내용. collapsed 면 왼쪽을 아이콘만으로 접는다 ──
    // 🔴 세로선(border-r)은 self-stretch 로 영역 끝까지 — 내용이 짧아도 선이 중간에 끊기지 않게
    // 🔴 뿌리는 h-full 이다 — EditorArea 가 뷰를 「블록 h-full」 안에 그리므로 flex-1 은 아무 뜻이 없고
    //    높이가 내용만큼 자라 overflow-auto 가 영영 안 걸렸다(쥔님 13:14 「설정 안이 스크롤이 안 돼」)
    return (
        <SettingsChromeContext.Provider value={chrome}>
            <div className="h-full min-h-0 flex items-stretch bg-bg overflow-hidden">
                <div className={`shrink-0 self-stretch border-r border-line overflow-auto ${collapsed ? 'w-rail' : 'w-44'}`}>
                    {!collapsed && (
                        <div className="h-header px-pad flex items-center border-b border-line select-none">
                            <span className="text-note font-semibold uppercase tracking-wide text-muted">설정</span>
                        </div>
                    )}
                    {collapsed ? IconMenu : MenuList}
                </div>
                {Content}
            </div>
        </SettingsChromeContext.Provider>
    );
}
