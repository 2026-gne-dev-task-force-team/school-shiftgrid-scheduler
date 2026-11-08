/**
 * 설정 플러그인·약속 계산 로직 단위 테스트 — 🔴 화면 0 · vitest 단독(순수 함수라 전역을 안 건드린다).
 *   PluginStatus 를 손으로 짜서 ③ 사유·④ 끄기 영향·⑤ 약속별을 글자 단위로 잰다.
 */
import { describe, it, expect } from 'vitest';
import type { PluginStatus } from '../../pane-ui-system/plugin';
import {
    availablePromises, explainBlock, disableImpact, listPromiseRows, promiseDetail,
} from './plugin-graph';

type P = Partial<PluginStatus> & { id: string };
function mk(p: P): PluginStatus {
    return {
        name: p.id, version: '0.1.0', core: false, enabled: true, failed: false, blocked: false,
        minHostVersion: '0.1.0',
        provides: {}, requires: {}, supports: {}, interfaces: [], permissions: [], userFields: [], roleFields: [],
        ...p,
    };
}
const C = (name: string, uses: string[] = []): PluginStatus['interfaces'] => [{ name, version: '0.1.0', uses }];

// 공통 바닥: 약속 셋(identity·credential·nodes) + 제공자 둘(account·credential-local) + 소비자(boss).
function base(): PluginStatus[] {
    return [
        mk({ id: 'contract-nodes', name: '약속 nodes', core: true, interfaces: C('nodes') }),
        mk({ id: 'contract-identity', name: '약속 identity', interfaces: C('identity') }),
        mk({ id: 'contract-credential', name: '약속 credential', interfaces: C('credential') }),
        mk({ id: 'account', name: '계정', provides: { identity: '0.1.0' }, requires: { nodes: '^0.1' }, supports: { credential: '^0.1' } }),
        mk({ id: 'credential-local', name: '증명(로컬)', provides: { credential: '0.1.0' }, requires: { nodes: '^0.1' } }),
        mk({ id: 'boss', name: '명부', requires: { identity: '^0.1' } }),
    ];
}

describe('availablePromises — 켜진 약속 플러그인의 선언만, uses 연쇄까지', () => {
    it('전부 켜지면 선언한 약속이 다 쓸 수 있다', () => {
        const a = availablePromises(base());
        expect([...a].sort()).toEqual(['credential', 'identity', 'nodes']);
    });
    it('약속이 기대는 약속이 없으면 연쇄로 떨어진다', () => {
        const ps = [
            mk({ id: 'c-a', interfaces: C('a', ['b']) }),  // a 는 b 에 기댄다
            // b 선언 없음 → a 도 떨어진다
        ];
        expect(availablePromises(ps).has('a')).toBe(false);
    });
    it('약속 플러그인이 꺼지면 그 약속은 목록에서 사라진다', () => {
        const ps = base().map((p) => (p.id === 'contract-identity' ? { ...p, enabled: false } : p));
        expect(availablePromises(ps).has('identity')).toBe(false);
    });
});

describe('explainBlock ③ — 사유 둘을 가른다', () => {
    it('약속 없음(약속 플러그인 꺼짐) — 켤 대상을 짚는다', () => {
        const ps = base().map((p) => (p.id === 'contract-identity' ? { ...p, enabled: false }
            : p.id === 'boss' ? { ...p, blocked: true, reason: '꺼짐 — 약속 "identity" 없음' } : p));
        const causes = explainBlock(ps.find((p) => p.id === 'boss')!, ps);
        expect(causes).toHaveLength(1);
        expect(causes[0].kind).toBe('no-promise');
        expect(causes[0].iface).toBe('identity');
        expect(causes[0].fixId).toBe('contract-identity');
        expect(causes[0].text).toContain('약속 플러그인');
        expect(causes[0].fix).toContain('켜면 풀립니다');
    });

    it('약속 없음(미설치) — 켤 대상이 없으면 설치 안내만', () => {
        const ps = [mk({ id: 'boss', blocked: true, requires: { ghost: '^0.1' } })];
        const c = explainBlock(ps[0], ps)[0];
        expect(c.kind).toBe('no-promise');
        expect(c.fixId).toBeUndefined();
        expect(c.text).toContain('설치');
    });

    it('약속은 있는데 채운 모듈 없음(제공자 꺼짐) — 제공자를 켜라고 짚는다', () => {
        // identity 약속은 켜져 있고, 제공자 account 만 꺼졌다 → boss 는 「채운 모듈 없음」.
        const ps = base().map((p) => (p.id === 'account' ? { ...p, enabled: false }
            : p.id === 'boss' ? { ...p, blocked: true } : p));
        const c = explainBlock(ps.find((p) => p.id === 'boss')!, ps)[0];
        expect(c.kind).toBe('no-provider');
        expect(c.iface).toBe('identity');
        expect(c.fixId).toBe('account');
        expect(c.text).toContain('채운 모듈이 없습니다');
    });

    it('판 안 맞음 — 필요/있는 판을 보여 준다', () => {
        const ps = [
            mk({ id: 'c-x', interfaces: C('x') }),
            mk({ id: 'prov', provides: { x: '0.1.0' } }),
            mk({ id: 'boss', blocked: true, requires: { x: '^0.2' } }),
        ];
        const c = explainBlock(ps[2], ps)[0];
        expect(c.kind).toBe('version');
        expect(c.text).toContain('^0.2');
    });

    it('blocked 아니면 빈 배열', () => {
        expect(explainBlock(mk({ id: 'ok' }), [mk({ id: 'ok' })])).toEqual([]);
    });
});

describe('disableImpact ④ — 같이 꺼질 것 / 기능만 떨어질 것', () => {
    it('제공자를 끄면 그 약속을 requires 한 소비자가 같이 꺼진다', () => {
        const { willBlock, willDegrade } = disableImpact('account', base());
        expect(willBlock.map((x) => x.id)).toContain('boss');     // boss requires identity(= account 가 채움)
        expect(willBlock.map((x) => x.id)).not.toContain('credential-local');
        expect(willDegrade.map((x) => x.id)).toEqual([]);         // identity 를 supports 하는 건 없다
    });

    it('약속 플러그인을 끄면 그 약속의 제공자도·소비자도 같이 꺼진다(전이)', () => {
        const ids = disableImpact('contract-identity', base()).willBlock.map((x) => x.id).sort();
        // account(provides identity) 가 막히고 → identity 소비자 boss 도 막힌다
        expect(ids).toContain('account');
        expect(ids).toContain('boss');
    });

    it('supports 로 붙은 건 blocked 가 아니라 degrade 로 나뉜다', () => {
        // credential-local 을 끄면 credential 제공자가 사라진다 → account 는 credential 을 supports → 기능만 떨어짐.
        const { willBlock, willDegrade } = disableImpact('credential-local', base());
        expect(willBlock.map((x) => x.id)).not.toContain('account');
        expect(willDegrade.map((x) => x.id)).toContain('account');
        expect(willDegrade[0].via).toBe('credential');
    });

    it('없는 id 는 빈 영향', () => {
        expect(disableImpact('nope', base())).toEqual({ willBlock: [], willDegrade: [] });
    });

    // 🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」) — 약속을 들고 온 꾸러미가 그 약속을 provides 로도 채운다(둘이 한 꾸러미).
    //    그 꾸러미를 끄면 ①약속 자체가 사라지고(declaredDown) ②제공자도 사라진다(providerGone) — 소비자는 어느 길로도 같이 꺼져야 한다.
    //    (옛 구조에서 선언자와 제공자가 갈려 있어 한쪽만 보면 소비자를 빠뜨릴 수 있던 결함 — 꾸러미로 묶여 자연히 막힌다.)
    it('약속을 들고 와 채우는 한 꾸러미를 끄면 그 약속 소비자가 같이 꺼진다(선언+제공 동시)', () => {
        const ps = [
            mk({ id: 'fake-nodes', core: true, provides: { nodes: '0.1.0' }, interfaces: C('nodes') }),
            // account 꾸러미: identity 를 들고 오고(interfaces) 동시에 채운다(provides) — 새 구조.
            mk({ id: 'account', provides: { identity: '0.2.0' }, requires: { nodes: '^0.1' }, interfaces: C('identity') }),
            mk({ id: 'boss', requires: { identity: '^0.1' } }),   // identity 소비자
        ];
        const { willBlock } = disableImpact('account', ps);
        expect(willBlock.map((x) => x.id)).toContain('boss');     // 꾸러미를 끄면 약속·제공자가 같이 사라져 소비자가 막힌다
    });
});

describe('promiseDetail / listPromiseRows ⑤ — 약속별', () => {
    it('약속 목록은 켜진 약속 플러그인의 선언 모음', () => {
        const names = listPromiseRows(base()).map((r) => r.name).sort();
        expect(names).toEqual(['credential', 'identity', 'nodes']);
    });

    it('identity — 제공자 account · 기다리는 쪽 boss(requires, 붙음)', () => {
        const d = promiseDetail('identity', base())!;
        expect(d.available).toBe(true);
        expect(d.provider?.id).toBe('account');
        const boss = d.consumers.find((c) => c.id === 'boss')!;
        expect(boss.relation).toBe('requires');
        expect(boss.attached).toBe(true);
    });

    it('제공자가 꺼지면 소비자는 안 붙음', () => {
        const ps = base().map((p) => (p.id === 'account' ? { ...p, enabled: false } : p));
        const d = promiseDetail('identity', ps)!;
        expect(d.provider).toBeNull();
        expect(d.consumers.find((c) => c.id === 'boss')!.attached).toBe(false);
    });

    it('credential — account 는 supports 로 기다린다', () => {
        const d = promiseDetail('credential', base())!;
        const acct = d.consumers.find((c) => c.id === 'account')!;
        expect(acct.relation).toBe('supports');
        expect(acct.attached).toBe(true);
    });

    it('없는 약속은 null', () => {
        expect(promiseDetail('ghost', base())).toBeNull();
    });
});
