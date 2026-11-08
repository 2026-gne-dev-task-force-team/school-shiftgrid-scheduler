/**
 * 플러그인 상세 — 🔴 설정 「설치된 플러그인」 줄을 누르면 **피크로** 뜨는 자리(쥔님 2026-11-01 13:42:
 *   *"플러그인 누르면 플러그인 상세 나오고, 플러그인이 시스템에 등록한 명령어, 뷰들 상세한 설명 기능들 그런 걸 적어놔야지"* ·
 *   *"켜고 끄기, 설정 가기"* · *"여기에 피크를 넣어도 되겠구만"*).
 *
 * 담는 것: 긴 설명 · id·판·요구 창틀 · 이 플러그인이 등록한 명령 전부(이름·단축키·설명) ·
 *         뷰 전부(이름·어디 놓이나·설명) · 꽂은 설정 섹션 · 켜기/끄기 토글 · 「설정 가기」 단추.
 * 🔴 plugins/ 라 하드코딩 색 검사 — 토큰 클래스로만.
 */
import { useState, type ReactNode } from 'react';
import { Icon, Button, FOCUS_RING, setViewOverride, getViewOverride } from '../../../pane-ui-system';
import {
    type PluginHost, type PluginStatus, enablePlugin, disablePlugin,
    listCommands, listSettings, listContributions, HOST_VERSION,
    dependentsOf, attachmentsOf, consumersOf,
    type ContributionKind, type ContributionRecord,
} from '../../../pane-ui-system/plugin';
import { Toggle } from '../../../pane-ui-system';
import { useSettingsChrome } from '../chrome-context';
import { ViewSettingsCard, ViewSettingsNote } from './ViewSettingsCard';

const AREA_LABEL: Record<string, string> = { left: '왼쪽 사이드바', center: '가운데', right: '오른쪽 사이드바' };

// 🔴 기여 종류 한국어 라벨 — 장부 줄의 kind 를 사람 말로(nodeType 은 라벨 완성용 · declareOne 밖이라 평소엔 안 뜬다).
const KIND_LABEL: Record<ContributionKind, string> = {
    view: '뷰', command: '명령', ribbon: '리본',
    settingsSection: '설정 섹션', settingsItem: '설정 항목',
    statusBar: '상태바', nodeType: '노드 타입',
};

/**
 * 기여 한 묶음 — 「선언(매니페스트)」 또는 「동적(host.declare)」. 0건이면 한 줄만(빈 목록 안 늘어놓는다).
 *   각 줄: 종류 라벨 · id · 제목(없으면 id 만).
 */
function ContribGroup({ label, records }: { label: string; records: ContributionRecord[] }) {
    if (records.length === 0) return <p className="text-[12px] text-muted">{label} 0건</p>;
    return (
        <div className="flex flex-col gap-1">
            <h5 className="text-[11px] font-medium text-muted">{label} <span className="text-muted/70">{records.length}건</span></h5>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {records.map((c, i) => (
                    <div key={`${c.kind}:${c.id}:${i}`} className="flex items-center gap-2 px-2.5 py-1 border-b border-line last:border-b-0">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-side text-muted shrink-0">{KIND_LABEL[c.kind]}</span>
                        <span className="text-[11px] text-muted font-mono truncate">{c.id}</span>
                        {c.title && <span className="text-[12px] text-text truncate ml-auto">{c.title}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

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
    // 뷰 줄을 누르면 그 뷰의 설정 카드가 펼쳐진다(쥔님 19:06 — 뷰 설정은 그 플러그인 상세 안에). 처음엔 전부 접힘
    const [openViews, setOpenViews] = useState<Set<string>>(() => new Set());
    const toggleView = (id: string) => setOpenViews((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const anyOverride = views.some((v) => Object.keys(getViewOverride(v.id) ?? {}).length > 0);

    // 🔴 기여 장부 — 이 플러그인이 호스트에 꽂은 것 전부를 「선언(매니페스트)」·「동적(host.declare)」으로 가른다(쥔님 2026-11-02 21:22).
    //    꺼진 플러그인은 장부가 비므로 「꺼짐 — 기여 없음」. 켜져 있을 때의 값만 비춘다.
    const contribs = listContributions(p.id);
    const declared = contribs.filter((c) => c.origin === 'manifest');
    const dynamic = contribs.filter((c) => c.origin === 'declare');

    // 🔴 모듈·의존성 장부(M0) — 선언한 약속 / 채우는 인터페이스 / 필요한 것 / 있으면 쓰는 것(붙음·안 붙음) / 누가 나를 쓰나.
    const declaredInterfaces = p.interfaces;      // 🔴 선언한 약속(약속 플러그인은 이것만)
    const permissions = p.permissions;           // 🔴 선언한 권한 낱말(페이블 8 — 호스트는 모으기만, 여기서 표시)
    const provides = Object.entries(p.provides);
    const requires = Object.entries(p.requires);
    const attachments = attachmentsOf(p.id);     // supports → 붙었나
    const consumers = consumersOf(p.id);         // 나를 쓰는 플러그인
    const dependents = dependentsOf(p.id);       // 끄면 같이 꺼질 것(requires 로 매달린)
    const hasDeps = declaredInterfaces.length || provides.length || requires.length || attachments.length || consumers.length || permissions.length;

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

            {/* 🔴 끄면 같이 꺼지는 것(requires 로 매달린) — 모달 없이 토글 옆 인라인(쥔님: 끄기 전에 보이게) */}
            {p.enabled && !p.core && dependents.length > 0 && (
                <p className="text-[12px] text-warn leading-relaxed">
                    끄면 같이 꺼집니다: {dependents.join(', ')}
                </p>
            )}
            {/* 블록 사유 — 의존을 못 채워 꺼진 경우(비영구 · 제공자가 켜지면 복귀) */}
            {p.blocked && p.reason && (
                <p className="text-[12px] text-warn leading-relaxed">{p.reason.replace(/^꺼짐 — /, '막힘 — ')}</p>
            )}

            <p className="text-[13px] text-text leading-relaxed">{p.description ?? '설명이 없습니다.'}</p>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[12px]">
                <dt className="text-muted">판</dt><dd className="text-text">{p.version}</dd>
                <dt className="text-muted">요구 창틀</dt><dd className="text-text">≥ {p.minHostVersion} (지금 {HOST_VERSION})</dd>
                <dt className="text-muted">상태</dt><dd className="text-text">{p.failed ? '활성 실패' : p.enabled ? '켜짐' : '꺼짐'}{p.core ? ' · 코어' : ''}</dd>
            </dl>

            {/* 🔴 모듈·의존성(M0) — 채우는 인터페이스 / 필요한 것 / 있으면 쓰는 것(붙음·안 붙음) / 누가 나를 쓰나 */}
            {hasDeps ? (
                <Section title="모듈·의존성">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
                        {declaredInterfaces.length > 0 && (
                            <>
                                <dt className="text-muted">선언한 약속</dt>
                                <dd className="text-text font-mono">
                                    {declaredInterfaces.map((i) => `${i.name} ${i.version}${i.uses.length ? ` ▸ ${i.uses.join('·')}` : ''}`).join(' · ')}
                                </dd>
                            </>
                        )}
                        {permissions.length > 0 && (
                            <>
                                <dt className="text-muted">권한 낱말</dt>
                                <dd className="text-text">{permissions.map((pm) => `${pm.title}(${pm.id})`).join(' · ')}</dd>
                            </>
                        )}
                        {provides.length > 0 && (
                            <>
                                <dt className="text-muted">채우는 인터페이스</dt>
                                <dd className="text-text font-mono">{provides.map(([n, v]) => `${n} ${v}`).join(' · ')}</dd>
                            </>
                        )}
                        {requires.length > 0 && (
                            <>
                                <dt className="text-muted">필요한 것</dt>
                                <dd className="text-text font-mono">{requires.map(([n, r]) => `${n} ${r}`).join(' · ')}</dd>
                            </>
                        )}
                        {attachments.length > 0 && (
                            <>
                                <dt className="text-muted">있으면 쓰는 것</dt>
                                <dd className="text-text font-mono">
                                    {attachments.map((a) => `${a.iface}(${a.attached ? '붙음' : '안 붙음'})`).join(' · ')}
                                </dd>
                            </>
                        )}
                        {consumers.length > 0 && (
                            <>
                                <dt className="text-muted">누가 나를 쓰나</dt>
                                <dd className="text-text">{consumers.join(', ')}</dd>
                            </>
                        )}
                    </dl>
                </Section>
            ) : null}

            {/* 기여 — 호스트에 꽂은 것 전부를 선언(매니페스트)·동적(host.declare)으로 갈라 목록으로 */}
            <Section title="기여" count={p.enabled ? contribs.length : undefined}>
                {!p.enabled
                    ? <p className="text-[12px] text-muted">꺼짐 — 기여 없음</p>
                    : (
                        <div className="flex flex-col gap-2">
                            <ContribGroup label="선언" records={declared} />
                            <ContribGroup label="동적" records={dynamic} />
                        </div>
                    )}
            </Section>

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

            {/* 뷰 — 이름 + 어디 놓이나 + 설명 · 줄을 누르면 그 뷰의 설정(최소 폭·좁아질 때·접힘 폭 + 자리 제한) */}
            <Section title="뷰" count={views.length}>
                {views.length === 0
                    ? <p className="text-[12px] text-muted">등록한 뷰가 없습니다.</p>
                    : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <ViewSettingsNote />
                                {anyOverride && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => views.forEach((v) => setViewOverride(v.id, null))}
                                        className="shrink-0 whitespace-nowrap"
                                    >
                                        전부 되돌리기
                                    </Button>
                                )}
                            </div>
                            <div className="flex flex-col rounded border border-line overflow-hidden">
                                {views.map((v) => {
                                    const open = openViews.has(v.id);
                                    return (
                                        <div key={v.id} className="border-b border-line last:border-b-0">
                                            <button
                                                type="button"
                                                aria-expanded={open}
                                                onClick={() => toggleView(v.id)}
                                                className={`w-full text-left flex items-start gap-2 px-2.5 py-1.5 hover:bg-text/[0.04] transition-colors
                                                    ${FOCUS_RING}`}
                                            >
                                                <Icon name="right" size={12} className={`mt-1 shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                                                {v.icon && <Icon name={v.icon} size={14} className="mt-0.5 shrink-0 text-muted" />}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[13px] text-text truncate">{v.title}</span>
                                                        <span className="text-[11px] text-muted">{AREA_LABEL[v.defaultArea ?? 'center'] ?? '가운데'}{v.placement?.singleton ? ' · 한 장만' : ''}</span>
                                                    </div>
                                                    {v.description && <p className="text-[11px] text-muted leading-snug">{v.description}</p>}
                                                    <span className="text-[10px] text-muted/70 font-mono">{v.id}</span>
                                                </div>
                                            </button>
                                            {open && <ViewSettingsCard view={v} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
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
                                <Button
                                    variant="accent"
                                    size="md"
                                    onClick={() => { chrome.goToItem(firstItemId); chrome.peek?.hide(); }}
                                    className="shrink-0 whitespace-nowrap"
                                >
                                    설정 가기
                                </Button>
                            )}
                        </div>
                    )}
            </Section>
        </div>
    );
}
