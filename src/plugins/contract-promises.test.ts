/**
 * 미편입 약속 폴더 여섯(roster·clock·week-grid·timetable·absence·export) — 켜지면 선언·uses·활성이 서나,
 *   그리고 🔴 uses 가 **실제 import type 그래프와 일치**하나(페이블 10).
 *
 * ⭐ 🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」): nodes·identity·credential·permit·people·table·calendar 는
 *    각 꾸러미 폴더 안으로 묶여(contributes.interfaces) 별도 contract-* 플러그인이 사라졌다. 이 여섯만 아직 소비자·제공자가
 *    없어 미편입 약속 폴더(contract-*)로 남아 있다(쥔님: 모듈을 지시할 때 그 꾸러미로 간다). 제공자 없이도 약속은 산다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../pane-ui-system/plugin';
import type { PluginModule } from '../pane-ui-system/plugin';

import { contractRosterPlugin } from './contract-roster';
import { contractClockPlugin } from './contract-clock';
import { contractWeekGridPlugin } from './contract-week-grid';
import { contractTimetablePlugin } from './contract-timetable';
import { contractAbsencePlugin } from './contract-absence';
import { contractExportPlugin } from './contract-export';

const ALL: PluginModule[] = [
    contractRosterPlugin, contractClockPlugin, contractWeekGridPlugin,
    contractTimetablePlugin, contractAbsencePlugin, contractExportPlugin,
];
const IDS = ALL.map((p) => p.manifest.id);

afterEach(() => { for (const id of IDS) disposeOwner(id); });

/** 그 약속 플러그인의 types.ts 가 **값으로든 타입으로든** import 하는 다른 contract-*(= 실제 기대기). */
function importedContractsOf(id: string): string[] {
    const src = readFileSync(resolve(process.cwd(), 'src', 'plugins', id, 'types.ts'), 'utf-8');
    const found = new Set<string>();
    for (const m of src.matchAll(/from\s+['"]\.\.\/(contract-[\w-]+)\/types['"]/g)) found.add(m[1]);
    return [...found].sort();
}

/** 매니페스트가 선언한 약속의 uses(이름)를 contract-<이름> 폴더 id 로 바꾼다. */
function declaredUsesOf(p: PluginModule): string[] {
    const ifaces = p.manifest.contributes?.interfaces ?? [];
    const names = new Set<string>();
    for (const it of ifaces) for (const u of it.uses ?? []) names.add(`contract-${u}`);
    return [...names].sort();
}

describe('약속 열 — 선언·활성·uses', () => {
    it('켜면 여섯 다 활성(실패·블록 0)이고 약속 목록에 여섯 이름이 뜬다', () => {
        activateAll(ALL);
        const ps = listPlugins().filter((p) => IDS.includes(p.id));
        expect(ps.length).toBe(6);
        expect(ps.some((p) => p.failed)).toBe(false);
        expect(ps.some((p) => p.blocked)).toBe(false);   // 정의 플러그인은 requires 가 없어 전부 그냥 켜진다

        const names = listInterfaces().map((i) => i.name).sort();
        expect(names).toEqual(['absence', 'clock', 'export', 'roster', 'timetable', 'week-grid']);
        // 제공자 0명이어도 약속은 산다
        expect(listInterfaces().every((i) => i.provider === null)).toBe(true);
    });

    it('🔴 정의는 서로 안 기댄다 — clock 정의 플러그인을 빼도 week-grid·timetable·absence 는 그냥 켜진다(uses 는 실행 판정 밖)', () => {
        activateAll(ALL.filter((p) => p.manifest.id !== 'contract-clock'));   // clock 정의만 뺀다
        const find = (id: string) => listPlugins().find((p) => p.id === id)!;
        // 🔴 uses 는 실행 판정 밖(쥔님 2026-11-08 19:42) — clock 정의가 없어도 그냥 켜진다(정의는 타입/문서일 뿐).
        for (const id of ['contract-week-grid', 'contract-timetable', 'contract-absence', 'contract-roster', 'contract-export']) {
            expect(find(id).blocked, `${id} 는 clock 정의가 없어도 안 막힌다`).toBe(false);
        }
    });

    it('🔴 매니페스트 uses 가 types.ts 의 실제 import type 그래프와 글자 단위로 일치한다(페이블 10 · 정의 무결성 — 실행과 무관)', () => {
        for (const p of ALL) {
            expect(declaredUsesOf(p), `${p.manifest.id} 의 uses ≠ 실제 import`).toEqual(importedContractsOf(p.manifest.id));
        }
    });
});
