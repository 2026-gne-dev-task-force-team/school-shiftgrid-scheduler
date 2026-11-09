/**
 * 노드 얼굴의 자료 꼴(DbDoc·RowDoc) 정규화 + 관계 칸의 순수 함수 — React 0줄.
 *   🔴 정규화가 관문이다: 저장된 값(옛 판·깨진 값)이 어떤 모양이든 여기를 지나면 성한 꼴이 된다.
 *   🔴 칸 key 는 안정 id(`f_…`) — 이름(label)을 키로 쓰는 코드는 없다(vitest 가 소스를 훑어 막는다).
 */
import type { DbDoc, FieldOption, RecordCellValue, RecordField, RowDoc } from './contracts/record-view';
import { defaultView, normalizeViews, reconcileColumns, uid } from './view-state';

export const DB_TYPE = 'record-view.db';
export const ROW_TYPE = 'record-view.row';

/** ISO 분(`2026-11-08T14:05`) — 생성·수정 시각 */
export function isoMinute(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 새 칸 — key 는 `f_` + uid, 이름은 「새 칸」 */
export function newField(type: string, label = '새 칸'): RecordField {
    return { key: uid('f_'), label, type };
}

function normalizeOptions(raw: unknown): FieldOption[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const seen = new Set<string>();
    const out: FieldOption[] = [];
    for (const o of raw) {
        if (!o || typeof o !== 'object') continue;
        const r = o as Record<string, unknown>;
        if (typeof r.value !== 'string' || seen.has(r.value)) continue;
        seen.add(r.value);
        const opt: FieldOption = { value: r.value, label: typeof r.label === 'string' && r.label !== '' ? r.label : r.value };
        if (typeof r.color === 'string') opt.color = r.color;
        out.push(opt);
    }
    return out;
}

export function normalizeField(raw: unknown): RecordField | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.key !== 'string' || o.key === '') return null;
    const f: RecordField = {
        key: o.key,
        label: typeof o.label === 'string' ? o.label : '',
        type: typeof o.type === 'string' && o.type !== '' ? o.type : 'text',
    };
    if (o.config !== undefined) f.config = o.config;
    const options = normalizeOptions(o.options);
    if (options) f.options = options;
    if (typeof o.width === 'number' && o.width > 0) f.width = o.width;
    if (o.readOnly === true) f.readOnly = true;
    return f;
}

/** 빈 레코드 뷰 — 제목(글자) 한 칸 · 보기 하나(표) */
export function blankDb(): DbDoc {
    const title = newField('text', '제목');
    return { v: 1, fields: [title], titleKey: title.key, views: [defaultView([title])], seq: 1 };
}

/** 저장된 data → 성한 DbDoc. 🔴 제목 칸은 늘 있고(없으면 맨 앞에 만든다) 타입은 text 로 고정, 보기는 최소 하나, 보기 칸 목록은 칸과 맞춘다. */
export function normalizeDb(raw: unknown): DbDoc {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const seen = new Set<string>();
    let fields: RecordField[] = [];
    if (Array.isArray(o.fields)) {
        for (const r of o.fields) {
            const f = normalizeField(r);
            if (!f || seen.has(f.key)) continue;
            seen.add(f.key);
            fields.push(f);
        }
    }
    let titleKey = typeof o.titleKey === 'string' && seen.has(o.titleKey) ? o.titleKey : '';
    if (!titleKey) {
        const firstText = fields.find((f) => f.type === 'text');
        if (firstText) titleKey = firstText.key;
        else { const t = newField('text', '제목'); fields = [t, ...fields]; titleKey = t.key; }
    }
    fields = fields.map((f) => (f.key === titleKey ? { ...f, type: 'text', options: undefined, config: undefined, readOnly: undefined } : f));
    // undefined 칸은 JSON 에서 떨어지지만 객체 비교가 헷갈리지 않게 지운다
    fields = fields.map((f) => { const c = { ...f }; for (const k of Object.keys(c) as (keyof RecordField)[]) if (c[k] === undefined) delete c[k]; return c; });
    const views = normalizeViews(o.views).map((v) => reconcileColumns(v, fields));
    const seq = typeof o.seq === 'number' && o.seq >= 1 ? Math.floor(o.seq) : 1;
    const doc: DbDoc = { v: 1, fields, titleKey, views, seq };
    if (typeof o.icon === 'string' && o.icon) doc.icon = o.icon;
    return doc;
}

function normalizeValue(v: unknown): RecordCellValue | undefined {
    if (v === null) return null;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    // 날짜 값 {start, end?} — 유일한 객체 셀값. start 가 글자면 지킨다(그 밖의 객체는 버린다).
    if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.start === 'string') {
            return typeof o.end === 'string' ? { start: o.start, end: o.end } : { start: o.start };
        }
    }
    return undefined;
}

export function normalizeRow(raw: unknown): RowDoc {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const values: Record<string, RecordCellValue> = {};
    if (o.values && typeof o.values === 'object') {
        for (const [k, v] of Object.entries(o.values as Record<string, unknown>)) {
            const nv = normalizeValue(v);
            if (nv !== undefined) values[k] = nv;
        }
    }
    const now = isoMinute();
    const row: RowDoc = {
        v: 1,
        values,
        created: typeof o.created === 'string' ? o.created : now,
        updated: typeof o.updated === 'string' ? o.updated : now,
    };
    if (typeof o.seq === 'number' && o.seq >= 0) row.seq = Math.floor(o.seq);
    if (o.collapsed === true) row.collapsed = true;
    if (o.body !== undefined) row.body = o.body;
    return row;
}

export function blankRow(values: Record<string, RecordCellValue> = {}): RowDoc {
    const now = isoMinute();
    return { v: 1, values, created: now, updated: now };
}

// ── 관계 칸 모델(P1 은 순수 함수뿐 · UI·레지스트리 등록은 P3) ─────────────────────────

/** 관계 값 → 노드 id 배열. 문자열 하나도 받고, 겹침·빈 글자를 버린다. many=false 면 최대 하나. */
export function normalizeRelation(value: unknown, many = true): string[] {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const ids = [...new Set(list.filter((x): x is string => typeof x === 'string' && x !== ''))];
    return many ? ids : ids.slice(0, 1);
}

/** 관계 값 → 글자 — 대상 이름을 `, ` 로 잇는다. 이름을 모르는 id(지워졌거나 아직 안 온 것)는 건너뛴다(값 자체는 안 지운다). */
export function relationToText(ids: readonly string[], nameOf: (id: string) => string | undefined): string {
    return ids.map((id) => nameOf(id)).filter((n): n is string => typeof n === 'string' && n !== '').join(', ');
}
