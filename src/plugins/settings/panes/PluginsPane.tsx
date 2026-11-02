/**
 * 「플러그인」 설정 Pane — 설치된 플러그인 목록 · 켜기/끄기 스위치 · 줄을 누르면 **상세가 피크로** 뜬다.
 *   🔴 쥔님 2026-11-01 13:42: *"플러그인 누르면 플러그인 상세 나오고 … 여기에 피크를 넣어도 되겠구만"* ·
 *      *"켜고 끄기, 설정 가기"* — 상세(명령·뷰·설정·토글·설정 가기)는 PluginDetail 이 피크 안에 그린다.
 *   ⭐ 데모를 끄면 리본·사이드바 탭이 자리표시로 바뀌는 걸 눈으로 본다(그 자리에서 되돌아온다).
 *   🔴 ⛔ 코어(settings 등)는 스위치가 잠긴다 — 「설정을 꺼서 설정을 못 켜는」 일이 없다.
 *   ⚠️ 피크 창구가 없으면(공급자 밖) 줄 안에서 펼치는 폴백으로 — 상세를 못 보는 일이 없게.
 */
import { useState } from 'react';
import { Icon } from '../../../pane-ui-system';
import {
    type PluginHost, listPlugins, enablePlugin, disablePlugin, usePluginRegistry, useContribVersion,
    type PluginStatus,
} from '../../../pane-ui-system/plugin';
import { Toggle } from '../../../pane-ui-system';
import { PluginDetail } from './PluginDetail';
import { useSettingsChrome } from '../chrome-context';

export function PluginsPane({ host }: { host: PluginHost }) {
    usePluginRegistry();   // 켜고 끄면 다시 그린다
    useContribVersion();   // 기여(설정 섹션·명령)가 바뀌면 다시 그린다
    const chrome = useSettingsChrome();
    const plugins = listPlugins();
    const [openId, setOpenId] = useState<string | null>(null);   // 폴백(피크 없을 때)

    const openDetail = (p: PluginStatus) => {
        if (chrome.peek) {
            chrome.peek.show(<PluginDetail p={p} host={host} />, { wideMin: 480 });
        } else {
            setOpenId((cur) => (cur === p.id ? null : p.id));   // 폴백 — 줄 안에서 펼침
        }
    };

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted">
                설치된 플러그인입니다. 끄면 그 플러그인이 꽂은 뷰·리본·설정·상태바가 빠지고, 열려 있던 탭은
                「켜기」 자리표시로 남습니다(다시 켜면 그 자리에서 돌아옵니다). 줄을 누르면 상세가 옆에 뜹니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {plugins.map((p) => {
                    const open = openId === p.id && !chrome.peek;
                    return (
                        <div key={p.id} className="border-b border-line last:border-b-0">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => openDetail(p)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(p); } }}
                                className="flex items-center gap-3 px-3 py-2 min-h-row cursor-pointer select-none hover:bg-text/[0.03] transition-colors"
                            >
                                <Icon name="right" size={13} className="text-muted shrink-0 transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-semibold text-text truncate">{p.name}</span>
                                        <span className="text-[11px] text-muted">v{p.version}</span>
                                        {p.core && <span className="text-[11px] px-1.5 rounded bg-accent/15 text-accent">코어</span>}
                                        {p.failed && (
                                            <span className="flex items-center gap-1 text-[11px] text-warn">
                                                <Icon name="warn" size={12} /> 활성 실패
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] text-muted font-mono">{p.id}</span>
                                </div>
                                {/* 켜기/끄기는 스위치 하나 — 코어는 잠긴다. 줄 클릭과 안 섞이게 전파를 끊는다 */}
                                <span
                                    title={p.core ? '코어 플러그인은 끌 수 없습니다' : undefined}
                                    className="shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                >
                                    <Toggle
                                        on={p.enabled}
                                        disabled={p.core}
                                        label={`${p.name} ${p.enabled ? '끄기' : '켜기'}`}
                                        onToggle={(v) => (v ? enablePlugin(p.id) : disablePlugin(p.id))}
                                    />
                                </span>
                            </div>
                            {open && (
                                <div className="px-3 pb-3 pl-9 bg-side/40 border-t border-line">
                                    <div className="pt-2"><PluginDetail p={p} host={host} /></div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
