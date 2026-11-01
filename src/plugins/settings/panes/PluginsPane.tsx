/**
 * 「플러그인」 설정 Pane — 설치된 플러그인 목록 · 이름·버전·코어 표시 · 켜기/끄기 스위치 · 줄을 누르면 상세.
 *   ⭐ 데모를 끄면 리본·사이드바 탭이 자리표시로 바뀌는 걸 눈으로 본다(그 자리에서 되돌아온다).
 *   🔴 ⛔ 코어(settings 등)는 스위치가 잠긴다 — 「설정을 꺼서 설정을 못 켜는」 일이 없다.
 *   🔴 상세(쥔님 2026-11-01 13:42: *"이 플러그인에 대한 상세 설정이라던가 설명이라던가"*) — 설명·id·판·요구 창틀 판 ·
 *      이 플러그인이 꽂은 설정 섹션 목록. 설정 자체는 왼쪽 「플러그인」 묶음에서 연다.
 */
import { useState } from 'react';
import { Icon } from '../../../pane-ui-system';
import {
    listPlugins, enablePlugin, disablePlugin, usePluginRegistry, listSettings, useContribVersion, HOST_VERSION,
} from '../../../pane-ui-system/plugin';
import { Toggle } from './Toggle';

export function PluginsPane() {
    usePluginRegistry();   // 켜고 끄면 다시 그린다
    useContribVersion();   // 기여(설정 섹션)가 바뀌면 다시 그린다
    const plugins = listPlugins();
    const sections = listSettings();
    const [openId, setOpenId] = useState<string | null>(null);

    return (
        <div className="flex flex-col gap-3 max-w-[560px]">
            <p className="text-[12px] text-muted">
                설치된 플러그인입니다. 끄면 그 플러그인이 꽂은 뷰·리본·설정·상태바가 빠지고, 열려 있던 탭은
                「켜기」 자리표시로 남습니다(다시 켜면 그 자리에서 돌아옵니다). 줄을 누르면 상세가 펼쳐집니다.
            </p>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {plugins.map((p) => {
                    const open = openId === p.id;
                    const owned = sections.filter((s) => s.owner === p.id);
                    return (
                        <div key={p.id} className="border-b border-line last:border-b-0">
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenId(open ? null : p.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : p.id); } }}
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
                                {/* 켜기/끄기는 스위치 하나 — 코어는 잠긴다(쥔님 13:42). 줄 클릭과 안 섞이게 전파를 끊는다 */}
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
                                <div className="px-3 pb-3 pl-9 flex flex-col gap-2 bg-side/40 border-t border-line">
                                    <p className="pt-2 text-[12px] text-text">{p.description ?? '설명이 없습니다.'}</p>
                                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                                        <dt className="text-muted">판</dt><dd className="text-text">{p.version}</dd>
                                        <dt className="text-muted">요구 창틀</dt><dd className="text-text">≥ {p.minHostVersion} (지금 {HOST_VERSION})</dd>
                                        <dt className="text-muted">상태</dt><dd className="text-text">{p.failed ? '활성 실패' : p.enabled ? '켜짐' : '꺼짐'}{p.core ? ' · 코어' : ''}</dd>
                                        <dt className="text-muted">설정</dt>
                                        <dd className="text-text">
                                            {owned.length === 0
                                                ? <span className="text-muted">없음</span>
                                                : owned.map((s) => `${s.title}(${s.items.length})`).join(' · ')}
                                        </dd>
                                    </dl>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
