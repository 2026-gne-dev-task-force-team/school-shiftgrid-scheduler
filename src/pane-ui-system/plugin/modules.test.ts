/**
 * 모듈·의존성(M0 · 4판 「정의와 제공은 서로 기대지 않는다」 2026-11-08 19:42) —
 *   가짜 플러그인으로 **단 하나의 실행 판정**·자동 복귀·늦은 연결(supports)을 잰다.
 *
 * 🔴 4판: 실행 중 판정은 하나뿐 — requires 한 약속을 **채우는 활성 플러그인(provides)이 없으면** 그 소비자만 꺼진다
 *    (사유 「채워 주는 플러그인 없음 — '약속'」). 🔴 정의(contributes.interfaces)가 켜졌나/설치됐나는 안 본다:
 *      · 제공자는 정의가 없어도 막히지 않는다(정의는 타입/문서일 뿐).
 *      · 「약속끼리 기대기(uses 연쇄)」·「약속 플러그인을 끄면 막힘」은 실행 판정에서 빠졌다.
 *    버전 맞춤(provides 버전 vs requires 범위)은 정의 없이도 둘끼리 비교한다. supports 는 채우는 쪽이 없으면 기능만 빠진다.
 * ⛔ 실 플러그인(탐색기·달력)을 안 쓴다 — 코어라 「끄면 막힘」을 실제로 못 재므로 가짜로 잰다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { activateAll, enablePlugin, disablePlugin, listPlugins, dependentsOf, attachmentsOf, consumersOf, listInterfaces } from './registry';
import { makeHost } from './host';
import { disposeOwner, disposeConsumerScopes, scopeSize, listContributions, getCommand } from './store';
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

/** 약속 플러그인 가짜 — contributes.interfaces 한 줄만(모듈 0·화면 0). id 는 `c-<이름>`. */
function contract(name: string, uses?: string[]): PluginModule {
    return fake({ id: `c-${name}`, contributes: { interfaces: [{ name, version: '0.1.0', uses }] } });
}

const ALL_FAKE = [
    'prov', 'cons', 'a', 'b', 'roster-p', 'id-p', 'self',
    'c-roster', 'c-clock', 'c-identity', 'c-week-grid', 'c-ia', 'c-ib',
];
afterEach(() => {
    for (const id of ALL_FAKE) { disposeOwner(id); disposeConsumerScopes(id); }   // 🔴 scope(구독 묶음)도 비운다 — 안 비우면 다음 테스트로 샌다
});

const find = (id: string) => listPlugins().find((p) => p.id === id);

describe('단일 실행 판정 — 채우는 플러그인이 있나 · 순환', () => {
    it('requires 한 약속을 채우는 플러그인이 없으면 「채워 주는 플러그인 없음」', () => {
        activateAll([fake({ id: 'cons', requires: { roster: '^0.1' } })]);
        const c = find('cons')!;
        expect(c.blocked).toBe(true);
        expect(c.reason).toContain('채워 주는 플러그인 없음');
        expect(c.reason).toContain('roster');
    });

    it('🔴 제공자는 정의(약속 플러그인)가 없어도 막히지 않는다 — 정의와 제공은 서로 기대지 않는다', () => {
        activateAll([fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } })]);
        const p = find('prov')!;
        expect(p.blocked).toBe(false);          // 옛 규칙이면 「약속 없음」으로 막혔다 — 이제 안 막힌다
    });

    it('🔴 소비자도 정의 없이 제공자만 있으면 산다 — 둘끼리 맞으면 된다', () => {
        activateAll([
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.1' } }),
        ]);
        expect(find('prov')!.blocked).toBe(false);
        expect(find('cons')!.blocked).toBe(false);
    });

    it('버전이 안 맞으면 「채워 주는 플러그인 없음」 + 있는 버전', () => {
        activateAll([
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.2' } }),
        ]);
        expect(find('prov')!.blocked).toBe(false);
        const c = find('cons')!;
        expect(c.blocked).toBe(true);
        expect(c.reason).toContain('채워 주는 플러그인 없음');
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

    it('🔴 정의(contributes.interfaces)를 끄거나 빼도 실행 판정은 안 바뀐다 — 정의는 타입/문서일 뿐', () => {
        // 제공자·소비자만 켜고 contract 는 아예 없다 — 그래도 소비자는 산다.
        activateAll([
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.1' } }),
            contract('roster'),   // 정의가 있어도 결과는 같다
        ]);
        expect(find('cons')!.blocked).toBe(false);
        expect(find('c-roster')!.blocked).toBe(false);   // 정의 플러그인도 그냥 켜진다(inert)
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

    it('🔴 정의(약속 플러그인)를 끄는 것은 아무 영향이 없다 — dependentsOf 가 비어 있다', () => {
        activateAll([contract('roster'), ...provCons()]);
        expect(dependentsOf('c-roster')).toEqual([]);   // 옛 규칙이면 cons 가 나왔다 — 이제 정의는 실행과 무관
    });

    it('제공자를 끄면 소비자가 「채워 주는 플러그인 없음」이 되고, 다시 켜면 복귀한다', () => {
        activateAll(provCons());
        expect(find('cons')!.blocked).toBe(false);
        expect(getCommand('cons.ping')).toBeTruthy();

        disablePlugin('prov');
        expect(find('cons')!.blocked).toBe(true);
        expect(find('cons')!.reason).toContain('채워 주는 플러그인 없음');
        expect(find('cons')!.enabled).toBe(true);           // 사용자가 끈 건 아니다
        expect(getCommand('cons.ping')).toBeFalsy();

        enablePlugin('prov');
        expect(find('cons')!.blocked).toBe(false);          // 🔴 자동 복귀
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
        expect(find('cons')!.blocked).toBe(false);   // supports 는 채우는 쪽이 없어도 켜진다(기능만 빠짐)
        expect(b.attachedMod).toBeNull();
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
        activateAll([
            fake({
                id: 'self', provides: { roster: '0.1.0' }, modules: { roster: { tag: 'self-mod' } },
                lifecycle: { onActivate(host) { got = host.modules.use('roster'); } },
            }),
        ]);
        expect(got).toEqual({ tag: 'self-mod' });
    });
});

describe('장부 — consumersOf · attachmentsOf · listInterfaces', () => {
    it('consumersOf 는 requires·supports 로 나를 쓰는 플러그인을, attachmentsOf 는 붙음 여부를 준다', () => {
        activateAll([
            contract('roster'),
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.1' } }),
            fake({
                id: 'a', supports: { roster: '^0.1' },
                lifecycle: { onInterface: { roster: { attach() { }, detach() { } } } },
            }),
        ]);

        expect(consumersOf('prov').sort()).toEqual(['a', 'cons']);
        expect(attachmentsOf('a')).toEqual([{ iface: 'roster', attached: true }]);
    });

    it('listInterfaces 는 선언한 플러그인·제공자·기다리는 플러그인을 주고, 약속 플러그인을 끄면 목록에서 빠진다', () => {
        activateAll([
            contract('roster'), contract('clock'),
            fake({ id: 'prov', provides: { roster: '0.1.0' }, modules: { roster: {} } }),
            fake({ id: 'cons', requires: { roster: '^0.1' } }),
        ]);

        const ifaces = listInterfaces();
        const roster = ifaces.find((i) => i.name === 'roster')!;
        expect(roster.declaredBy).toBe('c-roster');
        expect(roster.provider).toBe('prov');
        expect(roster.waiting).toContain('cons');
        const clock = ifaces.find((i) => i.name === 'clock')!;
        expect(clock.provider).toBeNull();   // 채운 모듈 없음(제공자 0명이어도 약속은 산다)

        disablePlugin('c-clock');            // 🔴 약속 플러그인을 끄면 그 약속이 목록에서 빠진다(켜진 것만)
        expect(listInterfaces().some((i) => i.name === 'clock')).toBe(false);
    });
});
