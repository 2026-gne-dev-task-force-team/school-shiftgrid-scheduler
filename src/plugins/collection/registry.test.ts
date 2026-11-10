/**
 * 칸 타입 레지스트리 — 내장 여섯이 같은 꼴로 올라 있다 · 꽂힌 타입은 접두사 강제 · 해제하면 사라진다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFieldTypeRegistry, fieldTypes } from './fields/registry';
import { BUILTIN_FIELD_TYPES } from './fields/builtin';
import { recordViewApi } from './api';
import type { FieldTypeDef } from './contracts/collection';

const stub = (type: string): FieldTypeDef => ({
    type, label: type, icon: 'dot', Cell: () => null,
    toText: (v) => String(v ?? ''), fromText: (t) => t,
});

afterEach(() => { vi.restoreAllMocks(); });

describe('내장 칸 타입', () => {
    it('fieldTypes.list() — 내장 14종(P2 로 status·url·email·phone·created·updated·id · R 로 relation 추가)', () => {
        expect(recordViewApi.fieldTypes.list()).toHaveLength(14);
        expect(fieldTypes.list().map((d) => d.type)).toEqual([
            'text', 'number', 'select', 'multi', 'date', 'check',
            'status', 'url', 'email', 'phone', 'created', 'updated', 'id', 'relation',
        ]);
    });
    it('relation 은 R 판에서 올라 있다(칸 추가 팝오버 맨 끝)', () => {
        expect(fieldTypes.get('relation')?.label).toBe('관계');
    });
    it('모든 정의가 toText·fromText·Cell 을 갖는다 · 내장 ops 에 비어 있음이 있다', () => {
        for (const d of BUILTIN_FIELD_TYPES) {
            expect(typeof d.toText).toBe('function');
            expect(typeof d.fromText).toBe('function');
            expect(d.Cell).toBeTruthy();
        }
        // check 는 켜짐·꺼짐만 · created·updated·id 는 ops 미지정(opsOf 가 기본을 준다)
        expect(BUILTIN_FIELD_TYPES.filter((d) => d.ops?.some((o) => o.id === 'empty')).length).toBe(10);
    });
});

describe('등록·해제', () => {
    it('꽂힌 타입은 <pluginId>.<name> 꼴만 — 접두사 없는 것은 warn + 거절', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const reg = createFieldTypeRegistry(BUILTIN_FIELD_TYPES);
        reg.register(stub('person'));
        expect(reg.get('person')).toBeUndefined();
        expect(warn).toHaveBeenCalled();
        const d = reg.register(stub('x.person'));
        expect(reg.get('x.person')).toBeTruthy();
        expect(reg.list()).toHaveLength(15);
        d.dispose();
        expect(reg.get('x.person')).toBeUndefined();   // 해제하면 목록에서 사라진다
    });
    it('같은 이름 두 번은 거절(앞이 이긴다) · 내장 이름을 덮지 못한다', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const reg = createFieldTypeRegistry(BUILTIN_FIELD_TYPES);
        reg.register(stub('x.a'));
        reg.register(stub('x.a'));
        expect(reg.list()).toHaveLength(15);
        reg.register(stub('text'));
        expect(reg.get('text')).toBe(BUILTIN_FIELD_TYPES[0]);
    });
});

describe('모듈 표면 version 2', () => {
    it('RecordView · fieldTypes · schema 가 있다', () => {
        expect(recordViewApi.version).toBe(2);
        expect(typeof recordViewApi.RecordView).toBe('function');
        expect(typeof recordViewApi.schema.planConvert).toBe('function');
        expect(typeof recordViewApi.schema.relationToText).toBe('function');
    });
});
