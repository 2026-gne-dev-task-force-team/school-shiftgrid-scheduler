/**
 * 설정 플러그인 사유 계산 — 🔴 화면 0 · vitest 단독(순수 함수라 전역을 안 건드린다).
 *   PluginStatus 를 손으로 짜서 ③ 사유·④ 끄기 영향을 글자 단위로 잰다.
 *
 * 🔴 4판(2026-11-08 19:42 「정의와 제공은 서로 기대지 않는다」): 실행 판정은 하나뿐 — requires 한 약속을
 *    **채우는 활성 플러그인(provides)이 없으면** 꺼진다. 정의(contributes.interfaces)·uses 연쇄는 안 본다.
 *    disableImpact 는 호스트 단일 진실을 re-export 한 것이다(여기선 그 결과를 잰다).
 */
import { describe, it, expect } from 'vitest';
import type { PluginStatus } from '../../pane-ui-system/plugin';
import { explainBlock, disableImpact } from './plugin-graph';

type P = Partial<PluginStatus> & { id: string };
function mk(p: P): PluginStatus {
    return {
        name: p.id, version: '0.1.0', core: false, enabled: true, failed: false, blocked: false,
        minHostVersion: '0.1.0',
        provides: {}, requires: {}, supports: {}, interfaces: [], permissions: [], userFields: [], roleFields: [],
        ...p,
    };
}

// 공통 바닥: 제공자 둘(account 가 identity · credential-local 이 credential) + 소비자(boss requires identity).
//   🔴 약속 정의(contract-*)는 실행 판정 밖이라 바닥에 안 둔다 — 제공자·소비자만으로 선다.
function base(): PluginStatus[] {
    return [
        mk({ id: 'account', name: '계정', provides: { identity: '0.1.0' }, requires: { nodes: '^0.1' }, supports: { credential: '^0.1' } }),
        mk({ id: 'nodes-prov', name: '노드', provides: { nodes: '0.1.0' } }),
        mk({ id: 'credential-local', name: '증명(로컬)', provides: { credential: '0.1.0' }, requires: { nodes: '^0.1' } }),
        mk({ id: 'boss', name: '명부', requires: { identity: '^0.1' } }),
    ];
}

describe('explainBlock ③ — 채우는 플러그인이 없음 / 판 안 맞음', () => {
    it('제공자가 꺼졌음 — 켤 대상을 짚는다', () => {
        // identity 제공자 account 가 꺼졌다 → boss 는 「채워 주는 플러그인 없음」.
        const ps = base().map((p) => (p.id === 'account' ? { ...p, enabled: false }
            : p.id === 'boss' ? { ...p, blocked: true } : p));
        const causes = explainBlock(ps.find((p) => p.id === 'boss')!, ps);
        expect(causes).toHaveLength(1);
        expect(causes[0].kind).toBe('no-provider');
        expect(causes[0].iface).toBe('identity');
        expect(causes[0].fixId).toBe('account');
        expect(causes[0].text).toContain('채워 주는 플러그인이 없습니다');
        expect(causes[0].fix).toContain('켜면 풀립니다');
    });

    it('제공자가 아예 없음(미설치) — 설치 안내만', () => {
        const ps = [mk({ id: 'boss', blocked: true, requires: { ghost: '^0.1' } })];
        const c = explainBlock(ps[0], ps)[0];
        expect(c.kind).toBe('no-provider');
        expect(c.fixId).toBeUndefined();
        expect(c.text).toContain('설치');
    });

    it('🔴 제공자만 켜져 있으면 — 정의 유무와 무관하게 안 막힌다(explainBlock 빈 배열)', () => {
        // account 가 identity 를 채우면 boss 는 안 막힌다 → explainBlock 은 애초에 빈 배열.
        const ps = base();
        expect(explainBlock(ps.find((p) => p.id === 'boss')!, ps)).toEqual([]);
    });

    it('판 안 맞음 — 필요/있는 판을 보여 준다', () => {
        const ps = [
            mk({ id: 'prov', provides: { x: '0.1.0' } }),
            mk({ id: 'boss', blocked: true, requires: { x: '^0.2' } }),
        ];
        const c = explainBlock(ps[1], ps)[0];
        expect(c.kind).toBe('version');
        expect(c.text).toContain('^0.2');
    });

    it('blocked 아니면 빈 배열', () => {
        expect(explainBlock(mk({ id: 'ok' }), [mk({ id: 'ok' })])).toEqual([]);
    });
});

describe('disableImpact ④ — 같이 꺼질 것 / 기능만 떨어질 것 (호스트 단일 진실)', () => {
    it('제공자를 끄면 그 약속을 requires 한 소비자가 같이 꺼진다', () => {
        const { willBlock, willDegrade } = disableImpact('account', base());
        expect(willBlock.map((x) => x.id)).toContain('boss');     // boss requires identity(= account 가 채움)
        expect(willBlock.map((x) => x.id)).not.toContain('credential-local');
        expect(willDegrade.map((x) => x.id)).toEqual([]);         // identity 를 supports 하는 건 없다
    });

    it('🔴 정의(약속 플러그인)를 끄는 것은 영향이 없다 — 제공자가 그대로면 소비자도 그대로', () => {
        const ps = [...base(), mk({ id: 'contract-identity', name: '약속 identity', interfaces: [{ name: 'identity', version: '0.1.0', uses: [] }] })];
        const { willBlock, willDegrade } = disableImpact('contract-identity', ps);
        expect(willBlock).toEqual([]);        // 옛 규칙이면 account·boss 가 전이로 꺼졌다 — 이제 정의는 실행과 무관
        expect(willDegrade).toEqual([]);
    });

    it('전이 — 제공자 체인이 끊기면 그 끝까지 같이 꺼진다', () => {
        // nodes-prov 를 끄면 account(requires nodes)가 막히고 → account 가 채우던 identity 소비자 boss 도 막힌다.
        const ids = disableImpact('nodes-prov', base()).willBlock.map((x) => x.id).sort();
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

    it('약속을 들고 와 채우는 한 꾸러미를 끄면 그 약속 소비자가 같이 꺼진다(제공자가 사라짐)', () => {
        const ps = [
            mk({ id: 'fake-nodes', core: true, provides: { nodes: '0.1.0' } }),
            // account 꾸러미: identity 를 채운다(provides). 정의를 들고 오든 말든 실행 판정엔 provides 만 본다.
            mk({ id: 'account', provides: { identity: '0.2.0' }, requires: { nodes: '^0.1' }, interfaces: [{ name: 'identity', version: '0.2.0', uses: [] }] }),
            mk({ id: 'boss', requires: { identity: '^0.1' } }),   // identity 소비자
        ];
        const { willBlock } = disableImpact('account', ps);
        expect(willBlock.map((x) => x.id)).toContain('boss');     // 꾸러미를 끄면 provides 가 사라져 소비자가 막힌다
    });
});
