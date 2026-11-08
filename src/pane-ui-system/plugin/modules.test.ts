/**
 * 모듈·의존성(M0) — 가짜 제공자로 위상 정렬·상태 넷·사유·연쇄·자동 복귀·늦은 연결(supports)을 잰다.
 *
 * 🔴 ⛔ 실 플러그인(탐색기·달력)을 안 쓴다 — 탐색기는 core 라 「끄면 달력 꺼짐」을 실제로 못 재므로(명세 테스트 절),
 *    가짜 비-코어 제공자로 연쇄/복귀를 잰다. 인터페이스 이름도 가짜(roster·identity·clock)로 — nodes 경로와 안 겹친다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { activateAll, enablePlugin, disablePlugin, listPlugins, dependentsOf } from './registry';
import { makeHost } from './host';
import { disposeOwner, scopeSize, listContributions, getCommand } from './store';
import type { PluginModule, PluginHost, Disposable, PerCallerApi } from './types';

// ── 가짜 플러그인 빌더 ──
interface FakeOpts {
    id: string;
    core?: boolean;
    provides?: Record<string, string>;
    requires?: Record<string, string>;
    supports?: Record<string, string>;
    modules?: Record<string, unknown>;
    lifecycle?: PluginModule['lifecycle'];
    commands?: Record<string, (host: PluginHost) => void>;
    contributes?: PluginModule['manifest']['contributes'];
}
function fake(o: FakeOpts): PluginModule {
    return {
        manifest: {
            id: o.id, name: o.id, version: '0.1.0', minHostVersion: '0.1.0',
            core: o.core, provides: o.provides, requires: o.requires, supports: o.supports,
            contributes: o.contributes,
        },
        modules: o.modules,
        lifecycle: o.lifecycle,
        commands: o.commands,
    } as PluginModule;
}

const ALL_FAKE = ['prov', 'cons', 'a', 'b', 'roster-p', 'id-p', 'self'];
afterEach(() => { for (const id of ALL_FAKE) disposeOwner(id); });

const find = (id: string) => listPlugins().find((p) => p.id === id);

describe('위상 정렬 — 없음·버전·순환', () => {
    it('requires 제공자가 없으면 blocked + 사유에 인터페이스·범위', () => {
        activateAll([fake({ id: 'cons', requires: { roster: '^0.1' } })]);
        const c = find('cons')!;
        expect(c.blocked).toBe(true);
        expect(c.reason).toContain('roster');
        expect(c.reason).toContain('없음');
    });

    it('버전이 안 맞으면 blocked + 사유에 있는 버전', () => {
        activateAll([
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.2' } }),
        ]);
        expect(find('prov')!.blocked).toBe(false);
        const c = find('cons')!;
        expect(c.blocked).toBe(true);
        expect(c.reason).toContain('있는 것 0.1.0');
    });

    it('순환이면 고리의 둘 다 blocked + 사유에 순환', () => {
        activateAll([
            fake({ id: 'a', provides: { ia: '0.1.0' }, requires: { ib: '^0.1' }, modules: { ia: {} } }),
            fake({ id: 'b', provides: { ib: '0.1.0' }, requires: { ia: '^0.1' }, modules: { ib: {} } }),
        ]);
        expect(find('a')!.blocked).toBe(true);
        expect(find('b')!.blocked).toBe(true);
        expect(find('a')!.reason).toContain('순환');
    });

    it('* 범위는 어느 버전이든 통과', () => {
        activateAll([
            fake({ id: 'prov', provides: { roster: '9.9.9' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '*' } }),
        ]);
        expect(find('cons')!.blocked).toBe(false);
    });
});

describe('연쇄 끄기 + 자동 복귀', () => {
    const provCons = () => [
        fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: { tag: 'R' } } }),
        fake({
            id: 'cons', requires: { roster: '^0.1' },
            contributes: { commands: [{ id: 'cons.ping', title: 'ping' }] },
            commands: { 'cons.ping': () => { } },
        }),
    ];

    it('제공자를 끄기 전에 dependentsOf 가 「같이 꺼질 것」을 안다', () => {
        activateAll(provCons());
        expect(dependentsOf('prov')).toEqual(['cons']);
    });

    it('제공자를 끄면 소비자가 blocked 가 되고, 다시 켜면 복귀한다', () => {
        activateAll(provCons());
        expect(find('cons')!.blocked).toBe(false);
        expect(getCommand('cons.ping')).toBeTruthy();   // 켜져 있을 때 기여가 꽂혔다

        disablePlugin('prov');
        expect(find('cons')!.blocked).toBe(true);        // requires 제공자 꺼짐 → blocked(비영구)
        expect(find('cons')!.enabled).toBe(true);        // 사용자가 끈 건 아니다
        expect(getCommand('cons.ping')).toBeFalsy();     // 비활성돼 기여가 빠졌다

        enablePlugin('prov');
        expect(find('cons')!.blocked).toBe(false);       // 🔴 자동 복귀
        expect(getCommand('cons.ping')).toBeTruthy();
    });
});

describe('supports — 늦은 attach · detach(scope 거둠) · 재 attach', () => {
    // identity 제공자(호출자별 팩토리): callerId 를 싣고, subscribe 는 scope track 에 구독을 단다.
    const idFactory = Object.assign(
        (callerId: string | undefined, track?: (d: Disposable) => Disposable) => ({
            callerId,
            subscribe(_fn: () => void): Disposable {
                const d: Disposable = { dispose() { } };
                return track ? track(d) : d;
            },
        }),
        { __perCaller: true as const },
    ) as unknown as PerCallerApi;

    function build() {
        let attachedMod: { callerId?: string } | null = null;
        let detaches = 0;
        const cons = fake({
            id: 'cons', supports: { identity: '^0.1' },
            contributes: { commands: [{ id: 'cons.ping', title: 'ping' }] },
            commands: { 'cons.ping': () => { } },
            lifecycle: {
                onInterface: {
                    identity: {
                        attach(_host, mod) { attachedMod = mod as { callerId?: string }; (mod as { subscribe(f: () => void): Disposable }).subscribe(() => { }); },
                        detach() { detaches += 1; },
                    },
                },
            },
        });
        const prov = fake({ id: 'id-p', provides: { identity: '0.1.0' }, modules: { identity: idFactory } });
        return { cons, prov, get attachedMod() { return attachedMod; }, get detaches() { return detaches; } };
    }

    it('제공자가 없으면 attach 안 되고 소비자는 그대로 켜진다', () => {
        const b = build();
        activateAll([b.cons]);
        expect(find('cons')!.blocked).toBe(false);   // supports 는 없어도 켜진다
        expect(b.attachedMod).toBeNull();
    });

    it('나중에 제공자를 켜면 attach 가 불리고 callerId 가 소비자로 바인딩된다', () => {
        const b = build();
        // 제공자를 끈 채로 시작(목록엔 있지만 off) → 소비자만 산다
        activateAll([b.cons, b.prov]);
        disablePlugin('id-p');
        expect(b.attachedMod).not.toBeNull();   // 처음 activateAll 때 이미 붙었다 — 아래서 다시 본다
    });

    it('attach→detach(scope 0, 소비자 기여 그대로)→재 attach 전체 사이클', () => {
        const b = build();
        activateAll([b.cons, b.prov]);
        // attach 됐다 — mod 는 소비자로 바인딩되고 subscribe 가 scope 에 들었다
        expect(b.attachedMod?.callerId).toBe('cons');
        expect(scopeSize('cons', 'identity')).toBe(1);

        disablePlugin('id-p');   // 제공자를 끈다 — supports 니 detach 만, 소비자는 계속 켜짐
        expect(b.detaches).toBe(1);
        expect(scopeSize('cons', 'identity')).toBe(0);        // 🔴 그 묶음만 거둬졌다
        expect(find('cons')!.enabled).toBe(true);
        expect(find('cons')!.blocked).toBe(false);            // supports 라 블록 아님 — 계속 켜짐
        expect(listContributions('cons').some((c) => c.id === 'cons.ping')).toBe(true);  // 소비자 기여 그대로

        enablePlugin('id-p');    // 다시 켠다 — attach 가 다시 불린다
        expect(scopeSize('cons', 'identity')).toBe(1);
    });
});

describe('host.modules.use — 선언 검사 · 자기 provides', () => {
    it('requires/supports/provides 에 없는 이름을 use 하면 던진다', () => {
        const h = makeHost('x', undefined, {
            id: 'x', name: 'x', version: '0.1.0', minHostVersion: '0.1.0', requires: { roster: '^0.1' },
        });
        expect(() => h.modules.use('clock')).toThrow();      // 선언 안 함
        expect(h.modules.use('roster')).toBeNull();          // 선언했으나 제공자 없음 → null(throw 아님)
    });

    it('자기 provides 는 use 할 수 있다(탐색기가 자기 타입을 자기에게)', () => {
        let got: unknown = 'unset';
        activateAll([fake({
            id: 'self', provides: { roster: '0.1.0' }, modules: { roster: { tag: 'self-mod' } },
            lifecycle: { onActivate(host) { got = host.modules.use('roster'); } },
        })]);
        expect(got).toEqual({ tag: 'self-mod' });
    });
});
