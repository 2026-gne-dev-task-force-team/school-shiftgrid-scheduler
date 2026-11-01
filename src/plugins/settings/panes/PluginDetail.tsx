/**
 * 플러그인 상세 — 🔴 설정 「설치된 플러그인」 줄을 누르면 **피크로** 뜨는 자리(쥔님 2026-11-01 13:42:
 *   *"플러그인 누르면 플러그인 상세 나오고, 플러그인이 시스템에 등록한 명령어, 뷰들 상세한 설명 기능들 그런 걸 적어놔야지"* ·
 *   *"켜고 끄기, 설정 가기"* · *"여기에 피크를 넣어도 되겠구만"*).
 *
 * 담는 것: 긴 설명 · id·판·요구 창틀 · 이 플러그인이 등록한 명령 전부(이름·단축키·설명) ·
 *         뷰 전부(이름·어디 놓이나·설명) · 꽂은 설정 섹션 · 켜기/끄기 토글 · 「설정 가기」 단추.
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import type { ReactNode } from 'react';
import { Icon } from '../../../pane-ui-system';
import {
    type PluginHost, type PluginStatus, enablePlugin, disablePlugin,
    listCommands, listSettings, HOST_VERSION,
} from '../../../pane-ui-system/plugin';
import { Toggle } from './Toggle';
import { useSettingsChrome } from '../chrome-context';

const AREA_LABEL: Record<string, string> = { left: '왼쪽 사이드바', center: '가운데', right: '오른쪽 사이드바' };

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-1.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {title}{count != null && <span className="ml-1 text-muted/70">{count}</span>}
            </h4>
            {children}
        </section>
    );
}

export function PluginDetail({ p, host }: { p: PluginStatus; host: PluginHost }) {
    const chrome = useSettingsChrome();
    const commands = listCommands().filter((c) => c.owner === p.id);
    const views = host.views.list().filter((v) => v.id === p.id || v.id.startsWith(`${p.id}.`));
    const sections = listSettings().filter((s) => s.owner === p.id);
    const firstItemId = sections[0]?.items[0]?.id;

    return (
        <div className="flex flex-col gap-4">
            {/* 머리 — 이름·판·상태 + 토글 */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold text-text">{p.name}</span>
                        <span className="text-[11px] text-muted">v{p.version}</span>
                        {p.core && <span className="text-[11px] px-1.5 rounded bg-accent/15 text-accent">코어</span>}
                        {p.failed && <span className="flex items-center gap-1 text-[11px] text-warn"><Icon name="warn" size={12} /> 활성 실패</span>}
                    </div>
                    <span className="text-[11px] text-muted font-mono">{p.id}</span>
                </div>
                <span title={p.core ? '코어 플러그인은 끌 수 없습니다' : undefined} className="shrink-0">
                    <Toggle
                        on={p.enabled}
                        disabled={p.core}
                        label={`${p.name} ${p.enabled ? '끄기' : '켜기'}`}
                        onToggle={(v) => (v ? enablePlugin(p.id) : disablePlugin(p.id))}
                    />
                </span>
            </div>

            <p className="text-[13px] text-text leading-relaxed">{p.description ?? '설명이 없습니다.'}</p>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                <dt className="text-muted">판</dt><dd className="text-text">{p.version}</dd>
                <dt className="text-muted">요구 창틀</dt><dd className="text-text">≥ {p.minHostVersion} (지금 {HOST_VERSION})</dd>
                <dt className="text-muted">상태</dt><dd className="text-text">{p.failed ? '활성 실패' : p.enabled ? '켜짐' : '꺼짐'}{p.core ? ' · 코어' : ''}</dd>
            </dl>

            {/* 명령 — 이름 + 단축키 + 설명 */}
            <Section title="명령" count={commands.length}>
                {commands.length === 0
                    ? <p className="text-[12px] text-muted">등록한 명령이 없습니다.</p>
                    : (
                        <div className="flex flex-col rounded border border-line overflow-hidden">
                            {commands.map((c) => (
                                <div key={c.id} className="flex items-start gap-2 px-2.5 py-1.5 border-b border-line last:border-b-0">
                                    {c.icon && <Icon name={c.icon} size={14} className="mt-0.5 shrink-0 text-muted" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] text-text truncate">{c.title}</span>
                                            {c.keys && <kbd className="text-[10px] px-1 rounded border border-line bg-side text-muted">{c.keys}</kbd>}
                                        </div>
                                        {c.description && <p className="text-[11px] text-muted leading-snug">{c.description}</p>}
                                        <span className="text-[10px] text-muted/70 font-mono">{c.id}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            </Section>

            {/* 뷰 — 이름 + 어디 놓이나 + 설명 */}
            <Section title="뷰" count={views.length}>
                {views.length === 0
                    ? <p className="text-[12px] text-muted">등록한 뷰가 없습니다.</p>
                    : (
                        <div className="flex flex-col rounded border border-line overflow-hidden">
                            {views.map((v) => (
                                <div key={v.id} className="flex items-start gap-2 px-2.5 py-1.5 border-b border-line last:border-b-0">
                                    {v.icon && <Icon name={v.icon} size={14} className="mt-0.5 shrink-0 text-muted" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] text-text truncate">{v.title}</span>
                                            <span className="text-[11px] text-muted">{AREA_LABEL[v.defaultArea ?? 'center'] ?? '가운데'}{v.placement?.singleton ? ' · 한 장만' : ''}</span>
                                        </div>
                                        {v.description && <p className="text-[11px] text-muted leading-snug">{v.description}</p>}
                                        <span className="text-[10px] text-muted/70 font-mono">{v.id}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            </Section>

            {/* 설정 섹션 + 「설정 가기」 */}
            <Section title="설정">
                {sections.length === 0
                    ? <p className="text-[12px] text-muted">꽂은 설정이 없습니다.</p>
                    : (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] text-text">{sections.map((s) => `${s.title}(${s.items.length})`).join(' · ')}</span>
                            {firstItemId && (
                                <button
                                    type="button"
                                    onClick={() => { chrome.goToItem(firstItemId); chrome.peek?.hide(); }}
                                    className="shrink-0 whitespace-nowrap h-btn px-3 rounded border border-accent text-[12px] text-text bg-text/[0.06]
                                        hover:bg-text/[0.1] transition-colors
                                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    설정 가기
                                </button>
                            )}
                        </div>
                    )}
            </Section>
        </div>
    );
}
