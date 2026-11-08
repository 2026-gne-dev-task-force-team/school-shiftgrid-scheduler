/**
 * 약속 플러그인 여덟(nodes + 학교 일곱) — 켜지면 선언·uses·활성이 서나, 그리고 🔴 uses 가 **실제 import type 그래프와 일치**하나(페이블 10).
 *
 * ⭐ 이 일곱(roster·clock·week-grid·timetable·absence·identity·export)은 PLUGINS 에 안 박았다(소비자·제공자 0 — 필요할 때 한 줄).
 *    그래도 타입·선언·기대기가 서는지는 여기서 켜서 증명한다(제공자 없이도 약속은 산다).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../pane-ui-system/plugin';
import type { PluginModule } from '../pane-ui-system/plugin';

import { contractNodesPlugin } from './contract-nodes';
import { contractRosterPlugin } from './contract-roster';
import { contractClockPlugin } from './contract-clock';
import { contractWeekGridPlugin } from './contract-week-grid';
import { contractTimetablePlugin } from './contract-timetable';
import { contractAbsencePlugin } from './contract-absence';
import { contractIdentityPlugin } from './contract-identity';
import { contractExportPlugin } from './contract-export';

const ALL: PluginModule[] = [
    contractNodesPlugin, contractRosterPlugin, contractClockPlugin, contractWeekGridPlugin,
    contractTimetablePlugin, contractAbsencePlugin, contractIdentityPlugin, contractExportPlugin,
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

describe('약속 여덟 — 선언·활성·uses', () => {
    it('켜면 여덟 다 활성(실패·블록 0)이고 약속 목록에 여덟 이름이 뜬다', () => {
        activateAll(ALL);
        const ps = listPlugins().filter((p) => IDS.includes(p.id));
        expect(ps.length).toBe(8);
        expect(ps.some((p) => p.failed)).toBe(false);
        expect(ps.some((p) => p.blocked)).toBe(false);   // clock 이 있어 week-grid·timetable·absence 의 uses 가 찬다

        const names = listInterfaces().map((i) => i.name).sort();
        expect(names).toEqual(['absence', 'clock', 'export', 'identity', 'nodes', 'roster', 'timetable', 'week-grid']);
        // 제공자 0명이어도 약속은 산다
        expect(listInterfaces().every((i) => i.provider === null)).toBe(true);
    });

    it('🔴 clock 약속을 끄면 그에 기대는 week-grid·timetable·absence 가 「약속 없음」으로 연쇄로 막힌다', () => {
        activateAll(ALL.filter((p) => p.manifest.id !== 'contract-clock'));   // clock 약속만 뺀다
        const find = (id: string) => listPlugins().find((p) => p.id === id)!;
        for (const id of ['contract-week-grid', 'contract-timetable', 'contract-absence']) {
            expect(find(id).blocked, `${id} 는 clock 없이 막힌다`).toBe(true);
            expect(find(id).reason).toContain('clock');
        }
        // clock 을 안 쓰는 약속은 멀쩡하다
        for (const id of ['contract-roster', 'contract-identity', 'contract-export', 'contract-nodes']) {
            expect(find(id).blocked, `${id} 는 clock 과 무관`).toBe(false);
        }
    });

    it('🔴 매니페스트 uses 가 types.ts 의 실제 import type 그래프와 글자 단위로 일치한다(페이블 10)', () => {
        for (const p of ALL) {
            expect(declaredUsesOf(p), `${p.manifest.id} 의 uses ≠ 실제 import`).toEqual(importedContractsOf(p.manifest.id));
        }
    });
});
