/**
 * 「플러그인」 설정 Pane — 설치된 플러그인 목록 · 켜기/끄기 스위치 · 줄 오른쪽 「자세히」로 **상세가 피크로** 뜬다.
 *   🔴 쥔님 2026-11-01 13:42: *"플러그인 누르면 플러그인 상세 나오고 … 여기에 피크를 넣어도 되겠구만"* ·
 *      *"켜고 끄기, 설정 가기"* — 상세(명령·뷰·설정·토글·설정 가기)는 PluginDetail 이 피크 안에 그린다.
 *   📌 2026-11-08 쥔님: *"플러그인 제목이 뭔가 버튼 같아서 계속 실수로 누르게 하는데 … 메뉴 같아"* →
 *      줄 전체를 누르는 버튼을 걷었다. **제목은 그냥 글자**(배경·테두리·호버·포인터 커서 없음)로 두고,
 *      상세 열기는 줄 오른쪽 **별도 「자세히 ›」 단추**로 옮겼다(토글 스위치와는 구분선으로 떨어뜨린다).
 *   ⭐ 데모를 끄면 리본·사이드바 탭이 자리표시로 바뀌는 걸 눈으로 본다(그 자리에서 되돌아온다).
 *   🔴 ⛔ 코어(settings 등)는 스위치가 잠긴다 — 「설정을 꺼서 설정을 못 켜는」 일이 없다.
 *   ⚠️ 피크 창구가 없으면(공급자 밖) 줄 안에서 펼치는 폴백으로 — 상세를 못 보는 일이 없게.
 */
import { useState } from 'react';
import { Icon } from '../../../pane-ui-system';
import {
    type PluginHost, listPlugins, enablePlugin, disablePlugin, usePluginRegistry, useContribVersion, HOST_VERSION,
    type PluginStatus,
} from '../../../pane-ui-system/plugin';
import { Toggle } from '../../../pane-ui-system';
import { PluginDetail } from './PluginDetail';
import { PlatformDetail } from './PlatformDetail';
import { DetailButton, LockedMark } from './plugin-parts';
import { useSettingsChrome } from '../chrome-context';
import { disableImpact } from '../plugin-graph';

export function PluginsPane({ host }: { host: PluginHost }) {
    usePluginRegistry();   // 켜고 끄면 다시 그린다
    useContribVersion();   // 기여(설정 섹션·명령)가 바뀌면 다시 그린다
    const chrome = useSettingsChrome();
    const plugins = listPlugins();
    const [openId, setOpenId] = useState<string | null>(null);   // 폴백(피크 없을 때)

    const openDetail = (p: PluginStatus, startConfirming = false) => {
        if (chrome.peek) {
            // 🔴 key 로 리마운트를 강제한다 — 피크가 같은 컴포넌트 자리를 재사용하면 startConfirming 초기 상태가 안 먹는다.
            chrome.peek.show(<PluginDetail key={`${p.id}:${startConfirming}`} p={p} host={host} startConfirming={startConfirming} />, { wideMin: 480 });
        } else {
            // 폴백 — 줄 안에서 펼침. 끄기 확인으로 왔으면 접지 말고 연다.
            setOpenId((cur) => (startConfirming ? p.id : cur === p.id ? null : p.id));
        }
    };

    const [platformOpen, setPlatformOpen] = useState(false);   // 폴백(피크 없을 때)
    const openPlatform = () => {
        if (chrome.peek) chrome.peek.show(<PlatformDetail />, { wideMin: 480 });
        else setPlatformOpen((v) => !v);
    };

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted">
                설치된 플러그인입니다. 끄면 그 플러그인이 꽂은 뷰·리본·설정·상태바가 빠지고, 열려 있던 탭은
                「켜기」 자리표시로 남습니다(다시 켜면 그 자리에서 돌아옵니다). 줄 오른쪽 「자세히」로 상세가 옆에 뜹니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {/* P6a — 바닥 자신도 한 줄(끌 수 없음). 플러그인이 아니라 「플러그인에게 주는 것」을 보이는 줄이다. */}
                <div className="border-b border-line">
                    <div className="flex items-center gap-3 px-3 py-2 min-h-row">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="text-body font-semibold text-text truncate">플랫폼(바닥)</span>
                                <span className="text-note text-muted">v{HOST_VERSION}</span>
                                <span className="text-note px-1.5 rounded bg-accent/15 text-accent">바닥</span>
                            </div>
                            <p className="text-small text-text/80 leading-snug">모든 플러그인이 올라서는 바닥 — 플러그인에게 주는 기능 목록과 켜진 약속을 봅니다.</p>
                            <span className="text-note text-muted font-mono">platform</span>
                        </div>
                        <DetailButton label="플랫폼 자세히" onClick={openPlatform} open={platformOpen && !chrome.peek} expanded={chrome.peek ? undefined : platformOpen} />
                        <LockedMark title="바닥은 끌 수 없습니다" />
                    </div>
                    {platformOpen && !chrome.peek && <div className="px-3 pb-3 bg-side/40 border-t border-line"><div className="pt-2"><PlatformDetail /></div></div>}
                </div>
                {plugins.map((p) => {
                    const open = openId === p.id && !chrome.peek;
                    return (
                        <div key={p.id} className="border-b border-line last:border-b-0">
                            {/* 🔴 줄 전체를 누르는 버튼을 걷었다(쥔님 2026-11-08 「메뉴 같아」) — 제목은 그냥 글자다. */}
                            <div className="flex items-center gap-3 px-3 py-2 min-h-row">
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
                                    {/* 🔴 한 줄 요약(쥔님 2026-11-08 「설명이 너무 부족」) — 목록에서 뭐 하는 것인지 바로 보이게. */}
                                    {p.description && <p className="text-[12px] text-text/80 leading-snug">{p.description}</p>}
                                    <span className="text-[11px] text-muted font-mono">{p.id}</span>
                                </div>
                                {/* 🔴 상세 열기 — 제목이 아니라 이 별도 단추로(오클릭 방지). 테두리 있는 작은 단추. */}
                                <DetailButton label={`${p.name} 자세히`} onClick={() => openDetail(p)} open={open} expanded={chrome.peek ? undefined : open} />
                                {/* 🔴 ④ 코어는 끄기 단추 자체가 없다 — 잠김 표시만. 비코어는 스위치 하나.
                                    「자세히」 단추와 섞이지 않게 구분선+여백으로 떨어뜨린다(쥔님: 토글과 충분히 떨어지게).
                                    끌 때 같이 꺼질 것이 있으면 바로 끄지 않고 상세를 열어 확인 단계를 보여 준다. */}
                                {p.core
                                    ? <LockedMark title="코어 플러그인은 끌 수 없습니다" />
                                    : (
                                        <span className="shrink-0 pl-3 ml-1 border-l border-line">
                                            <Toggle
                                                on={p.enabled}
                                                label={`${p.name} ${p.enabled ? '끄기' : '켜기'}`}
                                                onToggle={(v) => {
                                                    if (v) { enablePlugin(p.id); return; }
                                                    const { willBlock, willDegrade } = disableImpact(p.id, plugins);
                                                    if (willBlock.length || willDegrade.length) openDetail(p, true);   // 확인은 상세에서
                                                    else disablePlugin(p.id);
                                                }}
                                            />
                                        </span>
                                    )}
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
