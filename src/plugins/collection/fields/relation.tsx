/**
 * 관계 칸(relation) — 다른 컬렉션의 항목(행 노드)을 가리킨다. 값 = 노드 id[] · 이름은 노드 시스템에서 그때그때 푼다.
 *   🔴 가리키던 항목이 휴지통·없음·대상 밖(대상을 바꿨을 때)이면 「사라진 항목」 칩 — 값은 안 지운다(복원·되돌리면 돌아온다).
 *   1차는 target.kind 'db' 만 동작한다. 'source'(등록된 소스) 는 타입만 있고 셀은 「지원 안 함」.
 */
import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, MenuItem, MenuList, Pill, Popover, Select, TextInput, Toggle, handleMenuKey } from '../../../pane-ui-system';
import type { NodesApi } from '../../explorer/contracts/nodes';
import type { FieldCellProps, RecordCellValue, RecordField } from '../contracts/collection';
import { getDbRev, getNodesApi, liveDbs, subscribeDb } from '../nodes';
import { ROW_TYPE, normalizeRelation, relationToText } from '../schema';

export type RelationTarget = { kind: 'db'; nodeId: string } | { kind: 'source'; id: string };
export interface RelationConfig { target?: RelationTarget; many: boolean }
/** 노드 시스템에서 관계 칸이 쓰는 것만 — 시험은 가짜로 채운다 */
export type RelationLook = Pick<NodesApi, 'get' | 'isTrashed' | 'path' | 'liveByType'>;
export interface RelationItem { id: string; name: string }

const UNTITLED = '제목 없음';

/** 저장된 config → 꼴 맞춘 설정. 틀린 target 은 버린다(없음 = 아직 안 고름) · many 는 기본 true */
export function relationConfig(config: unknown): RelationConfig {
    const c = (config && typeof config === 'object' ? config : {}) as { target?: Partial<{ kind: string; nodeId: string; id: string }>; many?: unknown };
    const t = c.target;
    const target: RelationTarget | undefined =
        t?.kind === 'db' && typeof t.nodeId === 'string' && t.nodeId ? { kind: 'db', nodeId: t.nodeId }
        : t?.kind === 'source' && typeof t.id === 'string' && t.id ? { kind: 'source', id: t.id }
        : undefined;
    return { target, many: c.many !== false };
}

/** 값 → id 배열(설정의 many 를 따른다) */
export const relationIds = (value: unknown, config: unknown): string[] => normalizeRelation(value, relationConfig(config).many);

/** 이 id 가 대상 db 안에 살아 있는 행인가 */
function liveIn(look: RelationLook, dbId: string, id: string): boolean {
    const n = look.get(id);
    return !!n && n.type === ROW_TYPE && !look.isTrashed(id) && look.path(id).includes(dbId);
}

/** 고르기 후보 — 대상 db 안 살아 있는 행(하위 항목 포함). 'source'·대상 없음·대상이 휴지통이면 빈 목록 */
export function relationCandidates(look: RelationLook | null, target: RelationTarget | undefined): RelationItem[] {
    if (!look || target?.kind !== 'db') return [];
    const db = target.nodeId;
    return look.liveByType(ROW_TYPE)
        .filter((n) => look.path(n.id).includes(db))
        .map((n) => ({ id: n.id, name: n.name || UNTITLED }));
}

/** 값의 id 하나하나 → 이름. 없음·휴지통·대상 밖이면 name = null(「사라진 항목」) */
export function resolveRelation(look: RelationLook | null, target: RelationTarget | undefined, ids: readonly string[]): { id: string; name: string | null }[] {
    return ids.map((id) => {
        if (!look || target?.kind !== 'db' || !liveIn(look, target.nodeId, id)) return { id, name: null };
        return { id, name: look.get(id)?.name || UNTITLED };
    });
}

/** 하나 고르기 — many 면 켜고 끄기, 아니면 그것 하나로 바꾸기(같은 것을 또 누르면 비운다) */
export function toggleRelation(ids: readonly string[], id: string, many: boolean): string[] {
    if (many) return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    return ids.length === 1 && ids[0] === id ? [] : [id];
}

/** 글자 — 살아 있는 대상 이름을 `, ` 로(사라진 것은 건너뛴다 · 값은 그대로) */
export function relationText(value: RecordCellValue | undefined, config: unknown, look: RelationLook | null = getNodesApi()): string {
    const names = new Map(resolveRelation(look, relationConfig(config).target, relationIds(value, config)).map((r) => [r.id, r.name ?? undefined]));
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

function RelationPicker({ target, ids, many, onPick, onClear }: {
    target: RelationTarget & { kind: 'db' };
    ids: string[];
    many: boolean;
    onPick: (id: string) => void;
    onClear: () => void;
}) {
    const [q, setQ] = useState('');
    const listRef = useRef<HTMLDivElement>(null);
    const all = relationCandidates(getNodesApi(), target);
    const key = q.trim().toLowerCase();
    const shown = key ? all.filter((c) => c.name.toLowerCase().includes(key)) : all;
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
                    {shown.map((c) => <MenuItem key={c.id} label={c.name} icon={ids.includes(c.id) ? 'check' : undefined} onSelect={() => onPick(c.id)} />)}
                </MenuList>
                {shown.length === 0 && (
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
    const chips = resolveRelation(getNodesApi(), cfg.target, ids);
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
                    options={[{ value: '', label: '— 고르기 —' }, ...liveDbs().map((d) => ({ value: d.id, label: d.folder ? `${d.folder} / ${d.name}` : d.name }))]} />
            </label>
            <div className="flex items-center justify-between gap-2 text-body text-text">
                여러 개 고르기
                <Toggle on={cfg.many} onToggle={(v) => set({ many: v })} label="여러 개 고르기" />
            </div>
        </div>
    );
}
