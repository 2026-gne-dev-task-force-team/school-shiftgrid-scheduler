/**
 * 관계 칸(relation) — 다른 컬렉션의 항목(행 노드)을 가리킨다. 값 = 노드 id[] · 이름은 노드 시스템에서 그때그때 푼다.
 *   🔴 가리키던 항목이 휴지통·없음·대상 밖(대상을 바꿨을 때)이면 「사라진 항목」 칩 — 값은 안 지운다(복원·되돌리면 돌아온다).
 *   다른 목록의 줄도 넣을 수 있다(캐스팅 — 판정·값 꼴은 cast.ts) · 고르개가 「다른 목록에서」 후보 · 여러 대상 고르기 · 비었으면 잇기/새로 만들기를 띄운다.
 *   1차는 target.kind 'db' 만 동작한다. 'source'(등록된 소스) 는 타입만 있고 셀은 「지원 안 함」.
 */
import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, MenuItem, MenuList, Pill, Popover, Select, TextInput, Toggle, handleMenuKey } from '../../../pane-ui-system';
import type { FieldCellProps, RecordCellValue, RecordField } from '../contracts/collection';
import { getDbRev, getNodesApi, liveDbs, subscribeDb } from '../nodes';
import { DB_TYPE, ROW_TYPE, blankRow, normalizeRelation, relationToText } from '../schema';
import { kitListTypes, kitOfType } from '../kits';
import { effectiveParentId } from '../tree';
import { TITLE_KEY, targetFields, targetValue, valueText } from './follow';
import { castCandidate, castCandidates, castKeys, liveIn, parseRelationEntry, recordsOf, relationEntry, resolveRelationTargets, type RelationLook } from './cast';

export type RelationTarget = { kind: 'db'; nodeId: string } | { kind: 'source'; id: string };
/** show = 칩에 보일 대상 칸 key(없음 = 제목) */
export interface RelationConfig { target?: RelationTarget; many: boolean; show?: string }
export type { RelationLook } from './cast';
/** path = 부모 항목 이름들(바깥 → 안) — 최상위면 빈 배열 */
export interface RelationItem { id: string; name: string; path: string[] }

const UNTITLED = '제목 없음';

/** 가리킬 수 있는 목록 — 범용 컬렉션 + defineCollection 으로 만든 목록(방 목록 같은 꾸러미 타입). 폴더 이름은 든 곳 */
export function targetCollections(): { id: string; name: string; folder: string | null }[] {
    const a = getNodesApi();
    if (!a) return liveDbs();
    const extra = kitListTypes().flatMap((t) => a.liveByType(t)).map((n) => {
        const p = a.parent(n.id);
        return { id: n.id, name: n.name, folder: p && p !== a.roots?.main ? (a.get(p)?.name ?? null) : null };
    });
    return [...liveDbs(), ...extra];
}

/** 저장된 config → 꼴 맞춘 설정. 틀린 target 은 버린다(없음 = 아직 안 고름) · many 는 기본 true */
export function relationConfig(config: unknown): RelationConfig {
    const c = (config && typeof config === 'object' ? config : {}) as { target?: Partial<{ kind: string; nodeId: string; id: string }>; many?: unknown; show?: unknown };
    const t = c.target;
    const target: RelationTarget | undefined =
        t?.kind === 'db' && typeof t.nodeId === 'string' && t.nodeId ? { kind: 'db', nodeId: t.nodeId }
        : t?.kind === 'source' && typeof t.id === 'string' && t.id ? { kind: 'source', id: t.id }
        : undefined;
    return { target, many: c.many !== false, ...(typeof c.show === 'string' && c.show !== TITLE_KEY ? { show: c.show } : {}) };
}

/** 값 → id 배열(설정의 many 를 따른다) */
export const relationIds = (value: unknown, config: unknown): string[] => normalizeRelation(value, relationConfig(config).many);

/** 고르기 후보 — 대상 컬렉션 안 살아 있는 레코드(하위 항목 포함) + 부모 경로. 'source'·대상 없음·대상이 휴지통이면 빈 목록 */
export function relationCandidates(look: RelationLook | null, target: RelationTarget | undefined): RelationItem[] {
    if (!look || target?.kind !== 'db') return [];
    const db = target.nodeId;
    const recs = recordsOf(look, db);
    const byId = new Map(recs.map((r) => [r.id, r]));
    const pathOf = (id: string): string[] => {
        if (look.get(db)?.type === DB_TYPE) {
            const p = look.path(id);
            return p.slice(p.indexOf(db) + 1, -1).map((x) => look.get(x)?.name || UNTITLED);
        }
        const out: string[] = [];
        const seen = new Set([id]);
        for (let cur = effectiveParentId(recs, id); cur && !seen.has(cur); cur = effectiveParentId(recs, cur)) {
            seen.add(cur);   // 순환 막기
            out.unshift(byId.get(cur)?.name || UNTITLED);
        }
        return out;
    };
    return recs.map((r) => ({ id: r.id, name: r.name || UNTITLED, path: pathOf(r.id) }));
}

/** 값의 id 하나하나 → 이름. 없음·휴지통·대상 밖이면 name = null(「사라진 항목」) */
export function resolveRelation(look: RelationLook | null, target: RelationTarget | undefined, ids: readonly string[], show?: string): { id: string; name: string | null }[] {
    return ids.map((id) => {
        if (!look || target?.kind !== 'db') return { id, name: null };
        // 보일 대상 칸을 골랐으면 같은 따라가기(resolveRelationTargets)로 대상 줄을 찾아 그 칸 값을 보인다 — 못 풀면 아래 제목 꼴로
        if (show) {
            const shown = resolveRelationTargets(look, target.nodeId, [id]).map((t) => valueText(look, targetValue(look, t, show))).filter((s) => s !== '');
            if (shown.length > 0) return { id, name: shown.join(', ') };
        }
        if (liveIn(look, target.nodeId, id)) return { id, name: look.get(id)?.name || UNTITLED };
        // 캐스팅 원소(다른 목록의 줄 · 고른 대상) — 그 줄 이름 그대로, 고른 것이 있으면 「반 · 방」
        const { id: src, via } = parseRelationEntry(id);
        if (castCandidate(look, target.nodeId, src) === 'block') return { id, name: null };
        const viaName = via && liveIn(look, target.nodeId, via) ? look.get(via)?.name || UNTITLED : null;
        return { id, name: `${look.get(src)?.name || UNTITLED}${viaName ? ` · ${viaName}` : ''}` };
    });
}

/** 하나 고르기 — many 면 켜고 끄기, 아니면 그것 하나로 바꾸기(같은 것을 또 누르면 비운다) */
export function toggleRelation(ids: readonly string[], id: string, many: boolean): string[] {
    if (many) return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    return ids.length === 1 && ids[0] === id ? [] : [id];
}

/** 글자 — 살아 있는 대상 이름을 `, ` 로(사라진 것은 건너뛴다 · 값은 그대로) */
export function relationText(value: RecordCellValue | undefined, config: unknown, look: RelationLook | null = getNodesApi()): string {
    const names = new Map(resolveRelation(look, relationConfig(config).target, relationIds(value, config), relationConfig(config).show).map((r) => [r.id, r.name ?? undefined]));
    return relationToText(relationIds(value, config), (id) => names.get(id));
}

/** 글자 → 값 — 쉼표로 나눈 이름(또는 id)을 대상 후보에서 찾는다. 못 찾은 이름은 버린다 */
export function relationFromText(text: string, config: unknown, look: RelationLook | null = getNodesApi()): string[] {
    const cfg = relationConfig(config);
    const all = relationCandidates(look, cfg.target);
    const ids = text.split(',').map((s) => s.trim()).filter((s) => s !== '')
        .map((s) => all.find((c) => c.id === s || c.name === s)?.id)
        .filter((x): x is string => !!x);
    return normalizeRelation(ids, cfg.many);
}

/** 비어 있는 줄(캐스팅 empty)을 대상 줄에 잇는다 — 그 줄의 (첫) 관계 칸에 대상 id 를 더한다. 쓰기는 그 줄 타입 주인의 손(kit)으로 */
function castLink(targetDb: string, srcId: string, targetId: string): void {
    const look = getNodesApi();
    const n = look?.get(srcId);
    const key = look && castKeys(look, targetDb, srcId)[0];
    if (!look || !n || !key) return;
    const d = (n.data ?? {}) as { values?: Record<string, RecordCellValue> };
    const next = [...normalizeRelation(d.values?.[key]).filter((x) => x !== targetId), targetId];
    const kit = kitOfType(n.type);
    if (kit) kit.setValue(srcId, key, next);
    else if (n.type === ROW_TYPE) look.setData(srcId, { ...d, values: { ...d.values, [key]: next } });
}
/** 대상 컬렉션에 새 줄 — 범용은 행 노드, defineCollection 은 그 kit 으로. 못 만들면 '' */
function castNewTarget(targetDb: string, name: string): string {
    const look = getNodesApi();
    if (!look) return '';
    if (look.get(targetDb)?.type === DB_TYPE) return look.create(targetDb, { type: ROW_TYPE, name, data: blankRow() }) || '';
    const kit = kitOfType(look.get(targetDb)?.type);
    return kit ? kit.addItem(targetDb, { [kit.config.baseFields[0].key]: name }) || '' : '';
}

function RelationPicker({ target, ids, many, onPick, onClear }: {
    target: RelationTarget & { kind: 'db' };
    ids: string[];
    many: boolean;
    onPick: (id: string) => void;
    onClear: () => void;
}) {
    const [q, setQ] = useState('');
    const [step, setStep] = useState<{ kind: 'pick' | 'empty'; id: string; name: string; targets: string[] } | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const look = getNodesApi();
    const all = relationCandidates(look, target);
    const key = q.trim().toLowerCase();
    const shown = key ? all.filter((c) => c.name.toLowerCase().includes(key)) : all;
    const casts = look ? castCandidates(look, target.nodeId).filter((c) => !key || c.name.toLowerCase().includes(key)) : [];
    const nameOf = (id: string) => look?.get(id)?.name || UNTITLED;
    if (step) {
        // 캐스팅 2단 — pick: 그 줄이 가리키는 것 중 하나(넣은 칸 값에 적는다) · empty: 있는 항목에 잇거나 새로 만들어 잇는다(그 줄 쪽 칸이 채워진다)
        const link = (tid: string) => { if (tid) castLink(target.nodeId, step.id, tid); onPick(step.id); setStep(null); };
        const fresh = q.trim() || '새 항목';
        return (
            <div className="flex flex-col gap-1" data-rv-rel-cast-step={step.kind}>
                <div className="px-2 text-note text-muted">{step.kind === 'pick' ? `「${step.name}」 — 어느 항목인지 고르세요` : `「${step.name}」은 아직 가리키는 항목이 없어요 — 이을 항목을 고르세요`}</div>
                <div className="max-h-72 overflow-auto">
                    <MenuList label="이을 항목">
                        <MenuItem label="뒤로" icon="left" onSelect={() => setStep(null)} />
                        {step.kind === 'pick'
                            ? step.targets.map((t) => (
                                <div key={t} className="contents" data-rv-rel-cast-target={t}>
                                    <MenuItem label={nameOf(t)} icon={ids.includes(relationEntry(step.id, t)) ? 'check' : undefined}
                                        onSelect={() => { onPick(relationEntry(step.id, t)); setStep(null); }} />
                                </div>
                            ))
                            : <>
                                {all.map((c) => (
                                    <div key={c.id} className="contents" data-rv-rel-cast-target={c.id}><MenuItem label={c.name} onSelect={() => link(c.id)} /></div>
                                ))}
                                <div className="contents" data-rv-rel-cast-new><MenuItem label={`새로 만들어 잇기: ${fresh}`} icon="plus" onSelect={() => link(castNewTarget(target.nodeId, fresh))} /></div>
                            </>}
                    </MenuList>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1" data-rv-rel-picker>
            {/* ↑↓ 로 목록에 내려가고(MenuList 가 이어받는다) · Enter = 맨 위 항목 · Esc 는 Popover 가 닫는다 */}
            <TextInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="항목 찾기" aria-label="항목 찾기"
                data-rv-rel-search
                onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') handleMenuKey(e, listRef.current); }}
                onEnter={() => { if (shown[0]) onPick(shown[0].id); }} />
            <div ref={listRef} className="max-h-72 overflow-auto">
                <MenuList label="항목 고르기">
                    {ids.length > 0 && <MenuItem label="비우기" icon="x" onSelect={onClear} />}
                    {shown.map((c) => (
                        <div key={c.id} className="contents" data-rv-rel-option={c.id}>
                            <MenuItem label={c.name} icon={ids.includes(c.id) ? 'check' : undefined} onSelect={() => onPick(c.id)} />
                            {/* 항목 안의 항목 — 부모 경로를 이름 밑에 작게(눌러도 고르기는 위 줄이 맡는다) */}
                            {c.path.length > 0 && <div data-rv-rel-path className="-mt-1 pb-1 pl-8 pr-pad text-note text-muted truncate">{c.path.join(' › ')}</div>}
                        </div>
                    ))}
                    {casts.length > 0 && <div data-rv-rel-cast-head className="px-2 pt-1 text-note text-muted">다른 목록에서</div>}
                    {casts.map((c) => (
                        <div key={c.id} className="contents" data-rv-rel-cast={c.id} data-rv-rel-cast-kind={c.kind}>
                            <MenuItem label={c.name || UNTITLED}
                                icon={ids.some((e) => parseRelationEntry(e).id === c.id) ? 'check' : c.kind === 'direct' ? undefined : 'right'}
                                onSelect={() => (c.kind === 'direct' ? onPick(c.id) : setStep({ kind: c.kind, id: c.id, name: c.name || UNTITLED, targets: c.targets }))} />
                            <div className="-mt-1 pb-1 pl-8 pr-pad text-note text-muted truncate">{c.from}</div>
                        </div>
                    ))}
                </MenuList>
                {shown.length === 0 && casts.length === 0 && (
                    <div data-rv-rel-empty className="px-2 py-1 text-note text-muted">{all.length > 0 ? '맞는 항목이 없어요' : '가리킬 컬렉션에 항목이 없어요'}</div>
                )}
            </div>
            {!many && <div className="px-2 text-note text-muted">하나만 고를 수 있어요</div>}
        </div>
    );
}

export function RelationCell({ field, value, config, editable, onChange }: FieldCellProps) {
    useSyncExternalStore(subscribeDb, getDbRev);   // 대상 항목 이름·휴지통이 바뀌면 다시 그린다
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const cfg = relationConfig(config);
    const ids = relationIds(value, config);
    const chips = resolveRelation(getNodesApi(), cfg.target, ids, cfg.show);
    const unsupported = cfg.target?.kind === 'source';
    return (
        <>
            {/* 공통 Button(plain) 을 칸 크기로 편다 — 맨 button·div 클릭은 톱니 검사가 센다 */}
            <Button
                variant="plain" size="sm" data-rv-cell={field.key} data-rv-relation aria-haspopup="menu" aria-disabled={!editable}
                onClick={(e) => editable && setAnchor(e.currentTarget.getBoundingClientRect())}
                className={`w-full !h-full !justify-start overflow-hidden ${editable ? 'cursor-pointer' : 'cursor-default'}`}
            >
                {unsupported ? <span data-rv-rel-unsupported className="text-small text-muted">지원 안 함</span>
                    : chips.length === 0 ? <span className="text-small text-muted">—</span>
                    : chips.map((c) => (
                        <span key={c.id} className="contents" data-rv-rel-chip={c.id} data-rv-rel-missing={c.name === null ? '' : undefined}>
                            {c.name === null ? <Pill color="gray" className="opacity-60 italic">사라진 항목</Pill> : <Pill color="blue">{c.name}</Pill>}
                        </span>
                    ))}
            </Button>
            {anchor && (
                <Popover anchor={anchor} width={260} onClose={() => setAnchor(null)}>
                    {cfg.target?.kind === 'db' ? (
                        <RelationPicker target={cfg.target} ids={ids} many={cfg.many}
                            onPick={(id) => { onChange(toggleRelation(ids, id, cfg.many)); if (!cfg.many) setAnchor(null); }}
                            onClear={() => { onChange([]); setAnchor(null); }} />
                    ) : (
                        <div className="px-2 py-1 text-note text-muted">
                            {unsupported ? '등록된 소스를 가리키는 관계는 아직 지원 안 해요.' : '칸 메뉴에서 가리킬 컬렉션을 먼저 고르세요.'}
                        </div>
                    )}
                </Popover>
            )}
        </>
    );
}

/** 칸 설정 — 가리킬 컬렉션 · 여러 개 고르기. 🔴 대상을 바꿔도 값은 안 지운다(새 대상 밖 id 는 「사라진 항목」) */
export function RelationConfigEditor({ field, onChange }: { field: RecordField; onChange: (f: RecordField) => void }) {
    useSyncExternalStore(subscribeDb, getDbRev);
    const cfg = relationConfig(field.config);
    const cur = cfg.target?.kind === 'db' ? cfg.target.nodeId : '';
    const set = (patch: Partial<RelationConfig>) => onChange({ ...field, config: { ...cfg, ...patch } });
    return (
        <div className="flex flex-col gap-1.5 px-2 py-1" data-rv-rel-config={field.key}>
            <label className="flex flex-col gap-0.5 text-note text-muted">
                가리킬 컬렉션
                <Select value={cur} data-rv-rel-target
                    onChange={(e) => set({ target: e.target.value ? { kind: 'db', nodeId: e.target.value } : undefined })}
                    options={[{ value: '', label: '— 고르기 —' }, ...targetCollections().map((d) => ({ value: d.id, label: d.folder ? `${d.folder} / ${d.name}` : d.name }))]} />
            </label>
            {cur && (
                <label className="flex flex-col gap-0.5 text-note text-muted">
                    칩에 보일 칸
                    <Select value={cfg.show ?? TITLE_KEY} data-rv-rel-show
                        onChange={(e) => set({ show: e.target.value || undefined })}
                        options={targetFields(getNodesApi(), cur).map((c) => ({ value: c.key, label: c.label }))} />
                </label>
            )}
            <div className="flex items-center justify-between gap-2 text-body text-text">
                여러 개 고르기
                <Toggle on={cfg.many} onToggle={(v) => set({ many: v })} label="여러 개 고르기" />
            </div>
        </div>
    );
}
