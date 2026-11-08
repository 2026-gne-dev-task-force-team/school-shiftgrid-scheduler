/**
 * 약속 「people」 — 타입만(값 0) · 폴더명=id(구조 검사 ⑧) · 켜면 약속 목록에 뜨고 제공자 없이도 선다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as peopleTypes from '../contract-people/types';
import { contractPeoplePlugin } from '../contract-people';
import { contractNodesPlugin } from '../contract-nodes';
import { activateAll, listPlugins, listInterfaces, disposeOwner } from '../../pane-ui-system/plugin';

afterEach(() => { for (const id of ['contract-people', 'contract-nodes']) disposeOwner(id); });

describe('contract-people — 값 0 · 선언 · 활성', () => {
    it('🔴 types.ts 는 런타임 값이 0이다(타입만 — 컴파일 뒤 사라진다)', () => {
        expect(Object.keys(peopleTypes)).toEqual([]);
    });

    it('매니페스트 id 가 폴더명과 같고(people 아님) people 약속 0.1.0 을 선언한다', () => {
        expect(contractPeoplePlugin.manifest.id).toBe('contract-people');
        const ifaces = contractPeoplePlugin.manifest.contributes?.interfaces ?? [];
        expect(ifaces).toEqual([{ name: 'people', version: '0.1.0' }]);
    });

    it('켜면 막히지 않고(uses 없음) 약속 목록에 people 이 제공자 없이 뜬다', () => {
        activateAll([contractNodesPlugin, contractPeoplePlugin]);
        const p = listPlugins().find((x) => x.id === 'contract-people')!;
        expect(p.failed).toBe(false);
        expect(p.blocked).toBe(false);
        const people = listInterfaces().find((i) => i.name === 'people');
        expect(people).toBeTruthy();
        expect(people!.declaredBy).toBe('contract-people');
        expect(people!.provider).toBeNull();   // 제공자(people 플러그인)는 여기서 안 켰다 — 약속은 혼자 선다
    });
});
