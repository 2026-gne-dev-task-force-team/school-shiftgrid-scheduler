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
import { Icon, Button, FOCUS_RING, setViewOverride, getViewOverride, useKeyOverrides, effectiveKey, formatKey, josa } from '../../..';
import {
    type PluginHost, type PluginStatus, enablePlugin, disablePlugin,
    listCommands, listSettings, listContributions, listPlugins, usePluginRegistry, HOST_VERSION,
    attachmentsOf, consumersOf,
    type ContributionKind, type ContributionRecord,
} from '../../../plugin';
import { notifyReset } from '../../settings/reset-undo';
import { useSettingsChrome } from '../../settings/chrome-context';
import { Section, RelRow, DetailTitle, Badge } from './plugin-parts';
import { ViewSettingsCard, ViewSettingsNote } from './ViewSettingsCard';
import { explainBlock, disableImpact, type ImpactItem } from '../plugin-graph';

const AREA_LABEL: Record<string, string> = { left: '왼쪽 사이드바', center: '가운데', right: '오른쪽 사이드바' };

// 🔴 기여 종류 한국어 라벨 — 장부 줄의 kind 를 사람 말로(nodeType 은 라벨 완성용 · declareOne 밖이라 평소엔 안 뜬다).
const KIND_LABEL: Record<ContributionKind, string> = {
    view: '뷰', command: '명령', ribbon: '리본',
    settingsSection: '설정 섹션', settingsItem: '설정 항목',
    statusBar: '상태바', nodeType: '항목 종류', properties: '속성 칸', iconPack: '아이콘 묶음',
};

/**
 * 기여 한 묶음 — 「선언(매니페스트)」 또는 「동적(host.declare)」. 0건이면 한 줄만(빈 목록 안 늘어놓는다).
 *   각 줄: 종류 라벨 · id · 제목(없으면 id 만).
 */
function ContribGroup({ label, records }: { label: string; records: ContributionRecord[] }) {
    if (records.length === 0) return <p className="text-small text-muted">{label} 0건</p>;
    return (
        <div className="flex flex-col gap-1">
            <h5 className="text-note font-medium text-muted">{label} <span className="text-muted/70">{records.length}건</span></h5>
            <div className="flex flex-col rounded border border-line overflow-hidden">
                {records.map((c, i) => (
                    <div key={`${c.kind}:${c.id}:${i}`} className="flex items-center gap-2 px-2.5 py-1 border-b border-line last:border-b-0">
                        <span className="text-micro px-1.5 py-0.5 rounded bg-side text-muted shrink-0">{KIND_LABEL[c.kind]}</span>
                        <span className="text-note text-muted font-mono truncate">{c.id}</span>
                        {c.title && <span className="text-small text-text truncate ml-auto">{c.title}</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * 🔴 「다른 플러그인과의 관계」 한 묶음 — 쉬운 말 제목 + 작은 한 줄 풀이 + 「기여」와 같은 카드 줄(쥔님 2026-11-08 21:27).
 */
function RelGroup({ title, note, children }: { title: string; note: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <h5 className="text-small font-medium text-text">{title}</h5>
            <p className="text-micro text-muted leading-snug">{note}</p>
            <div className="flex flex-col rounded border border-line overflow-hidden">{children}</div>
        </div>
    );
}

/** ④ 끄기 영향 한 묶음 — 「같이 꺼짐(requires)」·「기능만 빠짐(supports)」 각각. 어느 약속을 통해 매였나 꼬리표. */
function ImpactList({ title, tone, items }: { title: string; tone: 'warn' | 'muted'; items: ImpactItem[] }) {
    return (
        <div className="flex flex-col gap-1">
            <p className={`text-note ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{title}</p>
            <ul className="flex flex-col gap-0.5 pl-1">
                {items.map((x) => (
                    <li key={x.id} className="text-small text-text flex items-baseline gap-1.5">
                        <Icon name="dot" size={10} className="text-muted shrink-0 translate-y-0.5" />
                        <span>{x.name}</span>
                        {x.via && <span className="text-note text-muted">— 약속 ‘{x.via}’</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/**
 * 사람용 상세 설명 — 무엇을 하나 → 이럴 때 씁니다 → 끄면 → 같이 쓰는 것(쥔님 2026-11-08 「설명이 너무 부족」).
 *   about 이 없으면 한 줄 요약(description)으로 떨어진다. 개발 낱말은 여기 안 온다(매니페스트가 쉬운 말로 적는다).
 */
function AboutBlock({ p }: { p: PluginStatus }) {
    const about = p.about;
    if (!about) return <p className="text-body text-text leading-relaxed">{p.description ?? '설명이 없습니다.'}</p>;
    return (
        <div className="flex flex-col gap-3">
            <p className="text-body text-text leading-relaxed">{about.what}</p>
            {about.use && about.use.length > 0 && (
                <div className="flex flex-col gap-1">
                    <p className="text-note font-semibold text-muted">이럴 때 씁니다</p>
                    <ul className="flex flex-col gap-1 pl-1">
                        {about.use.map((u, i) => (
                            <li key={i} className="text-small text-text leading-snug flex items-baseline gap-1.5">
                                <Icon name="dot" size={10} className="text-muted shrink-0 translate-y-0.5" />
                                <span>{u}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {about.off && (
                <div className="flex flex-col gap-0.5">
                    <p className="text-note font-semibold text-muted">끄면</p>
                    <p className="text-small text-text leading-snug">{about.off}</p>
                </div>
            )}
            {about.with && (
                <div className="flex flex-col gap-0.5">
                    <p className="text-note font-semibold text-muted">같이 쓰는 것</p>
                    <p className="text-small text-text leading-snug">{about.with}</p>
                </div>
            )}
        </div>
    );
}

export function PluginDetail({ p: p0, host, startConfirming = false }: { p: PluginStatus; host: PluginHost; startConfirming?: boolean }) {
    const chrome = useSettingsChrome();
    // 🔴 피크 안에서 켜고/끄면 이 상세도 바로 다시 그린다 — listPlugins 로 지금 상태를 다시 읽는다(스냅샷 p0 는 낡는다).
    usePluginRegistry();
    const all = listPlugins();
    const p = all.find((x) => x.id === p0.id) ?? p0;
    // ④ 끄기 영향 · ③ 꺼짐 사유 — 화면 밖 순수 함수가 센다.
    const impact = disableImpact(p.id, all);
    const hasImpact = impact.willBlock.length > 0 || impact.willDegrade.length > 0;
    const causes = p.blocked ? explainBlock(p, all) : [];
    // 줄의 끄기 스위치에서 열렸으면(startConfirming) 바로 확인 단계를 보여 준다.
    const [confirming, setConfirming] = useState(startConfirming && !p.core);
    const commands = listCommands().filter((c) => c.owner === p.id);
    const keyO = useKeyOverrides();   // 단축키는 사용자 재지정이 이긴다 — 설정 「단축키」와 같은 값
    const views = host.views.list().filter((v) => v.id === p.id || v.id.startsWith(`${p.id}.`));
    const sections = listSettings().filter((s) => s.owner === p.id);
    const firstItemId = sections[0]?.items[0]?.id;
    // 뷰 줄을 누르면 그 뷰의 설정 카드가 펼쳐진다(쥔님 19:06 — 뷰 설정은 그 플러그인 상세 안에). 처음엔 전부 접힘
    const [openViews, setOpenViews] = useState<Set<string>>(() => new Set());
    const toggleView = (id: string) => setOpenViews((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    // 🔴 개발자 정보(모듈·의존성·기여 장부)는 평소엔 접어 둔다 — 설명이 먼저 보이게(쥔님 2026-11-08).
    const [showDev, setShowDev] = useState(false);
    const anyOverride = views.some((v) => Object.keys(getViewOverride(v.id) ?? {}).length > 0);

    // 🔴 기여 장부 — 이 플러그인이 호스트에 꽂은 것 전부를 「선언(매니페스트)」·「동적(host.declare)」으로 가른다(쥔님 2026-11-02 21:22).
    //    꺼진 플러그인은 장부가 비므로 「꺼짐 — 기여 없음」. 켜져 있을 때의 값만 비춘다.
    const contribs = listContributions(p.id);
    const declared = contribs.filter((c) => c.origin === 'manifest');
    const dynamic = contribs.filter((c) => c.origin === 'declare');

    // 🔴 모듈·의존성 장부(M0) — 선언한 약속 / 채우는 인터페이스 / 필요한 것 / 있으면 쓰는 것(붙음·안 붙음) / 누가 나를 쓰나.
    const declaredInterfaces = p.interfaces;      // 🔴 선언한 약속(약속 플러그인은 이것만)
    const permissions = p.permissions;           // 🔴 선언한 권한 낱말(페이블 8 — 호스트는 모으기만, 여기서 표시)
    const userFields = p.userFields;             // 🔴 꽂은 사용자 칸(계정 화면이 모아 그린다)
    const roleFields = p.roleFields;             // 🔴 꽂은 역할 칸
    const provides = Object.entries(p.provides);
    const requires = Object.entries(p.requires);
    const attachments = attachmentsOf(p.id);     // supports → 붙었나
    const consumers = consumersOf(p.id);         // 나를 쓰는 플러그인

    // 🔴 약속의 사람 이름 — 모든 플러그인의 선언한 약속에서 label·desc 를 모은다(없으면 id 그대로). 설정은 「전체 선언에서 이름으로」.
    const ifaceMeta = new Map<string, { label?: string; desc?: string }>();
    for (const pl of all) for (const it of pl.interfaces) if (it.label && !ifaceMeta.has(it.name)) ifaceMeta.set(it.name, { label: it.label, desc: it.desc });
    const nameOf = (n: string) => ifaceMeta.get(n)?.label ?? n;
    const descOf = (n: string) => ifaceMeta.get(n)?.desc;
    // 지금 이 약속을 내주는(켜지고 안 막힌) 플러그인 — 「꼭 있어야 하는 것」의 상태용.
    const providerOf = (n: string) => all.find((pl) => pl.enabled && !pl.blocked && !pl.failed && n in pl.provides);

    // 관계(약속) 칸은 접힘 밖, 권한·칸 장부는 접힘 안.
    const hasRel = declaredInterfaces.length || provides.length || requires.length || attachments.length || consumers.length;
    const hasPermFields = permissions.length + userFields.length + roleFields.length > 0;

    return (
        <div className="flex flex-col gap-4">
            {/* 머리 — 이름·판·상태 + 토글 */}
            <div className="flex items-start justify-between gap-3">
                <DetailTitle name={p.name} version={p.version} id={p.id} badges={<>
                    {p.core && <Badge>기본</Badge>}
                    {p.failed && <span className="flex items-center gap-1 text-note text-warn"><Icon name="warn" size={12} /> 활성 실패</span>}
                </>} />
                {/* 🔴 ④ 코어는 끄기 단추 자체가 없다(쥔님) — 잠김 표시만. 비코어는 끄기/켜기 단추. */}
                <div className="shrink-0">
                    {p.core
                        ? <span className="flex items-center gap-1 text-note text-muted" title="기본 기능은 끌 수 없습니다"><Icon name="pin" size={12} /> 기본 기능 · 끌 수 없음</span>
                        : p.enabled
                            ? <Button variant="ghost" size="sm" onClick={() => { if (hasImpact) setConfirming(true); else disablePlugin(p.id); }}>끄기</Button>
                            : <Button variant="accent" size="sm" onClick={() => enablePlugin(p.id)}>켜기</Button>}
                </div>
            </div>

            {/* 🔴 ④ 끄기 확인 — 끄기 전에 「같이 꺼질 것(requires)」·「기능만 떨어질 것(supports)」을 전이까지 보여 준다 */}
            {confirming && !p.core && (
                <div className="rounded border border-warn/40 bg-warn/5 p-3 flex flex-col gap-2">
                    <p className="text-small font-semibold text-text">‘{p.name}’ 을 끄면:</p>
                    {impact.willBlock.length > 0 && (
                        <ImpactList
                            title="같이 꺼집니다 — 이 플러그인을 요구(requires)해서 함께 막힙니다"
                            tone="warn" items={impact.willBlock}
                        />
                    )}
                    {impact.willDegrade.length > 0 && (
                        <ImpactList
                            title="기능만 빠집니다 — 선택 연동(supports)이라 계속 켜져 있습니다"
                            tone="muted" items={impact.willDegrade}
                        />
                    )}
                    <div className="flex gap-2 pt-0.5">
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>취소</Button>
                        <Button variant="accent" size="sm" onClick={() => { disablePlugin(p.id); setConfirming(false); }}>그래도 끄기</Button>
                    </div>
                </div>
            )}

            {/* 🔴 ③ 막힘 사유 — 「약속 없음」 vs 「채운 모듈 없음」을 사람 말로, 무엇을 켜면 풀리는지 한 줄 */}
            {p.blocked && causes.length > 0 && (
                <div className="rounded border border-warn/40 bg-warn/5 p-3 flex flex-col gap-2">
                    <p className="text-small font-semibold text-warn">막힘 — 지금 켤 수 없습니다(의존이 안 찼습니다)</p>
                    {causes.map((c, i) => (
                        <div key={`${c.kind}:${c.iface}:${i}`} className="flex flex-col gap-1">
                            <p className="text-small text-text leading-relaxed">{c.text}</p>
                            {c.fix && (c.fixId
                                ? <Button variant="ghost" size="sm" className="self-start" onClick={() => enablePlugin(c.fixId!)}>{c.fix}</Button>
                                : <p className="text-note text-muted leading-relaxed">{c.fix}</p>)}
                        </div>
                    ))}
                </div>
            )}

            {/* 🔴 사람용 설명 — 상세 맨 위. 무엇을/이럴 때/끄면/같이(개발 낱말 없음). */}
            <AboutBlock p={p} />

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-small">
                <dt className="text-muted">판</dt><dd className="text-text">{p.version}</dd>
                <dt className="text-muted">요구 창틀</dt><dd className="text-text">≥ {p.minHostVersion} (지금 {HOST_VERSION})</dd>
                <dt className="text-muted">상태</dt><dd className="text-text">{p.failed ? '활성 실패' : p.enabled ? '켜짐' : '꺼짐'}{p.core ? ' · 기본 기능' : ''}</dd>
            </dl>

            {/* 🔴 다른 플러그인과의 관계 — 「기여」와 같은 카드 줄 꼴로, 사람 말 이름 + 지금 상태(쥔님 2026-11-08 21:27). 접힘 밖에 둔다. */}
            {hasRel && (
                <Section title="다른 플러그인과의 관계">
                    <div className="flex flex-col gap-3">
                        {declaredInterfaces.length > 0 && (
                            <RelGroup title="정해 둔 데이터 꼴" note="다른 플러그인과 주고받으려고 이 플러그인이 정해 둔 꼴입니다.">
                                {declaredInterfaces.map((i) => (
                                    <RelRow key={i.name} left={nameOf(i.name)} note={descOf(i.name)} right={`${i.name} ${i.version}`} />
                                ))}
                            </RelGroup>
                        )}
                        {provides.length > 0 && (
                            <RelGroup title="내주는 것" note="다른 플러그인이 쓸 수 있게 내줍니다.">
                                {provides.map(([n, v]) => <RelRow key={n} left={nameOf(n)} note={descOf(n)} right={`${n} ${v}`} />)}
                            </RelGroup>
                        )}
                        {requires.length > 0 && (
                            <RelGroup title="꼭 있어야 하는 것" note="없으면 이 플러그인이 꺼집니다.">
                                {requires.map(([n, r]) => {
                                    const prov = providerOf(n);
                                    return <RelRow key={n} left={nameOf(n)} note={prov ? `${prov.name}${josa(prov.name, '이/가')} 내주는 중 ✓` : '내주는 플러그인 없음'} right={`${n} ${r}`} />;
                                })}
                            </RelGroup>
                        )}
                        {attachments.length > 0 && (
                            <RelGroup title="있으면 더 좋은 것" note="없어도 돌아가고, 있으면 기능이 붙습니다.">
                                {attachments.map((a) => <RelRow key={a.iface} left={nameOf(a.iface)} note={a.attached ? '지금 붙음 ✓' : '아직 없음'} right={a.iface} />)}
                            </RelGroup>
                        )}
                        {consumers.length > 0 && (
                            <RelGroup title="이걸 쓰는 플러그인" note="이 플러그인이 내주는 것을 쓰는 다른 플러그인입니다.">
                                {consumers.map((cid) => { const c = all.find((x) => x.id === cid); return <RelRow key={cid} left={c?.name ?? cid} right={cid} />; })}
                            </RelGroup>
                        )}
                    </div>
                </Section>
            )}

            {/* 🔴 개발자 정보 — 권한·칸 장부와 기여 목록은 평소엔 접어 둔다(쥔님 2026-11-08: 설명·관계가 먼저 보이게). */}
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={() => setShowDev((v) => !v)}
                    aria-expanded={showDev}
                    className={`self-start flex items-center gap-1 text-note text-muted hover:text-text transition-colors ${FOCUS_RING}`}
                >
                    <Icon name="right" size={11} className={`transition-transform ${showDev ? 'rotate-90' : ''}`} />
                    개발자 정보 (권한·칸·기여)
                </button>
                {showDev && (
                    <div className="flex flex-col gap-4 pl-2 border-l border-line">
                        {hasPermFields && (
                            <Section title="권한·칸">
                                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
                                    {permissions.length > 0 && (
                                        <>
                                            <dt className="text-muted">권한 낱말</dt>
                                            <dd className="text-text flex flex-col gap-0.5">{permissions.map((pm) => (
                                                <span key={pm.id}>{pm.title} <span className="text-muted font-mono text-micro">{pm.id}</span>{pm.desc && <span className="block text-note text-muted leading-snug">{pm.desc}</span>}</span>
                                            ))}</dd>
                                        </>
                                    )}
                                    {userFields.length > 0 && (
                                        <>
                                            <dt className="text-muted">사용자 칸</dt>
                                            <dd className="text-text">{userFields.map((f) => `${f.title}(${f.id})${f.editor ? ' ▸ ' + f.editor : ''}`).join(' · ')}</dd>
                                        </>
                                    )}
                                    {roleFields.length > 0 && (
                                        <>
                                            <dt className="text-muted">역할 칸</dt>
                                            <dd className="text-text">{roleFields.map((f) => `${f.title}(${f.id})${f.editor ? ' ▸ ' + f.editor : ''}`).join(' · ')}</dd>
                                        </>
                                    )}
                                </dl>
                            </Section>
                        )}

                        {/* 기여 — 호스트에 꽂은 것 전부를 선언(매니페스트)·동적(host.declare)으로 갈라 목록으로 */}
                        <Section title="기여" count={p.enabled ? contribs.length : undefined}>
                            {!p.enabled
                                ? <p className="text-small text-muted">꺼짐 — 기여 없음</p>
                                : (
                                    <div className="flex flex-col gap-2">
                                        <ContribGroup label="선언" records={declared} />
                                        <ContribGroup label="동적" records={dynamic} />
                                    </div>
                                )}
                        </Section>
                    </div>
                )}
            </div>

            {/* 명령 — 이름 + 단축키 + 설명 */}
            <Section title="명령" count={commands.length}>
                {commands.length === 0
                    ? <p className="text-small text-muted">등록한 명령이 없습니다.</p>
                    : (
                        <div className="flex flex-col rounded border border-line overflow-hidden">
                            {commands.map((c) => (
                                <div key={c.id} className="flex items-start gap-2 px-2.5 py-1.5 border-b border-line last:border-b-0">
                                    {c.icon && <Icon name={c.icon} size={14} className="mt-0.5 shrink-0 text-muted" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-body text-text truncate">{c.title}</span>
                                            {effectiveKey(c.id, c.keys, keyO) && <kbd className="text-micro px-1 rounded border border-line bg-side text-muted">{formatKey(effectiveKey(c.id, c.keys, keyO))}</kbd>}
                                        </div>
                                        {c.description && <p className="text-note text-muted leading-snug">{c.description}</p>}
                                        <span className="text-micro text-muted/70 font-mono">{c.id}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            </Section>

            {/* 뷰 — 이름 + 어디 놓이나 + 설명 · 줄을 누르면 그 뷰의 설정(최소 폭·좁아질 때·접힘 폭 + 자리 제한) */}
            <Section title="뷰" count={views.length}>
                {views.length === 0
                    ? <p className="text-small text-muted">등록한 뷰가 없습니다.</p>
                    : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <ViewSettingsNote />
                                {anyOverride && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            const prev = views.map((v) => [v.id, getViewOverride(v.id)] as const);
                                            views.forEach((v) => setViewOverride(v.id, null));
                                            notifyReset(host, '뷰 설정을 전부 되돌렸습니다', () => prev.forEach(([id, o]) => { if (o) setViewOverride(id, o); }));
                                        }}
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
                                                        <span className="text-body text-text truncate">{v.title}</span>
                                                        <span className="text-note text-muted">{AREA_LABEL[v.defaultArea ?? 'center'] ?? '가운데'}{v.placement?.singleton ? ' · 한 장만' : ''}</span>
                                                    </div>
                                                    {v.description && <p className="text-note text-muted leading-snug">{v.description}</p>}
                                                    <span className="text-micro text-muted/70 font-mono">{v.id}</span>
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
                    ? <p className="text-small text-muted">꽂은 설정이 없습니다.</p>
                    : (
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-small text-text">{sections.map((s) => `${s.title}(${s.items.length})`).join(' · ')}</span>
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
