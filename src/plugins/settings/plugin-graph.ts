/**
 * 설정 「플러그인·약속」 계산 로직 — 🔴 화면과 떼어 둔 순수 함수다(vitest 단독으로 잰다).
 *   ⭐ 입력은 호스트가 주는 PluginStatus[](listPlugins()) 하나뿐 — 매니페스트(provides/requires/supports·
 *      선언한 약속 interfaces)와 지금 상태(enabled/blocked/failed)만 읽는다. 전역 런타임을 안 건드린다.
 *   ⭐ 약속(인터페이스) 목록은 「켜진 플러그인들의 contributes.interfaces 모음」으로 센다(명세 「인터페이스도 꽂는다」).
 *      ⛔ 약속 = contract-* 라는 가정에 묶지 않는다 — 어느 플러그인이 선언하든 interfaces 에 적힌 것이 약속이다.
 *
 * 담는 셈 셋:
 *   ③ explainBlock — 꺼진(blocked) 사유를 사람 말로. 「약속 없음」 vs 「채운 모듈 없음」을 가르고 무엇을 켜면 풀리는지.
 *   ④ disableImpact — 끄기 전에 「같이 꺼질 것(requires)」·「기능만 떨어질 것(supports)」을 전이까지 계산.
 *   ⑤ promiseDetail/listPromiseRows — 약속 하나의 채운 모듈(제공자)·기다리는 플러그인(지금 붙었나).
 */
import type { PluginStatus } from '../../pane-ui-system/plugin';

export interface PluginRef { id: string; name: string }
const ref = (p: PluginStatus): PluginRef => ({ id: p.id, name: p.name });

// ── 버전 범위: `*`·`^a.b` 둘만(호스트 satisfies 와 같은 규칙) ──
function satisfies(range: string, version: string): boolean {
    if (range === '*') return true;
    const m = range.match(/^\^(\d+)\.(\d+)$/);
    if (!m) return false;
    const maj = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const v = version.split('.').map((n) => parseInt(n, 10) || 0);
    return v[0] === maj && (v[1] ?? 0) >= min;
}

interface DeclaredIface { name: string; version: string; uses: string[]; pluginId: string }

/** 켜진(enabled) 플러그인들이 선언한 약속 모음 — 같은 이름은 먼저 선언한 쪽. (호스트 collectDeclared 와 같은 규칙) */
function declaredByEnabled(plugins: PluginStatus[]): Map<string, DeclaredIface> {
    const out = new Map<string, DeclaredIface>();
    for (const p of plugins) {
        if (!p.enabled) continue;
        for (const it of p.interfaces) {
            if (!out.has(it.name)) out.set(it.name, { name: it.name, version: it.version, uses: it.uses, pluginId: p.id });
        }
    }
    return out;
}

/**
 * 🔴 「쓸 수 있는 약속」 — 약속 플러그인이 켜져 있고(선언됨) 그 약속의 uses 가 전부 쓸 수 있을 때만 산다.
 *   uses 대상이 없으면 그 약속을 떨구고(고정점), 그 약속에 기대던 약속도 연쇄로 떨어진다. (호스트 availablePromises 와 같다)
 */
export function availablePromises(plugins: PluginStatus[]): Set<string> {
    const declared = declaredByEnabled(plugins);
    const avail = new Set(declared.keys());
    let changed = true;
    while (changed) {
        changed = false;
        for (const [name, d] of declared) {
            if (!avail.has(name)) continue;
            if (d.uses.some((u) => !avail.has(u))) { avail.delete(name); changed = true; }
        }
    }
    return avail;
}

/** 지금 그 약속을 실제로 채우고 있는 제공자(켜졌고·안 막혔고·안 터진 첫 플러그인). 약속이 없으면 null. */
function activeProviderOf(iface: string, plugins: PluginStatus[], avail: Set<string>): PluginStatus | undefined {
    if (!avail.has(iface)) return undefined;
    return plugins.find((p) => p.enabled && !p.blocked && !p.failed && iface in p.provides);
}

/** 그 약속을 선언한 플러그인(켜짐 우선, 없으면 아무 선언자). 설치 안 됐으면 undefined. */
function declarerOf(iface: string, plugins: PluginStatus[]): PluginStatus | undefined {
    return plugins.find((p) => p.enabled && p.interfaces.some((i) => i.name === iface))
        ?? plugins.find((p) => p.interfaces.some((i) => i.name === iface));
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 꺼진 사유를 사람 말로
// ─────────────────────────────────────────────────────────────────────────────

export type BlockKind = 'no-promise' | 'no-provider' | 'version' | 'cycle' | 'other';

export interface BlockCause {
    kind: BlockKind;
    /** 문제의 약속 이름(cycle·other 는 빈 문자열). */
    iface: string;
    /** 사람이 읽는 사유 한 줄. */
    text: string;
    /** 무엇을 켜면 풀리나 한 줄(켤 대상이 없으면 미설치 안내만, 또는 생략). */
    fix?: string;
    /** 켜면 풀리는 플러그인 id(단추용 · 없으면 생략). */
    fixId?: string;
}

/** 「약속 없음」 사유 한 줄 — 약속 플러그인이 꺼졌나·막혔나·설치 안 됐나로 가른다. */
function noPromiseCause(iface: string, plugins: PluginStatus[], prefix = ''): BlockCause {
    const dp = declarerOf(iface, plugins);
    const head = `${prefix}약속 ‘${iface}’ 이(가) 없습니다`;
    if (dp && !dp.enabled) {
        return { kind: 'no-promise', iface, text: `${head} — 약속 플러그인 ‘${dp.name}’ 이 꺼져 있습니다.`, fix: `약속 플러그인 ‘${dp.name}’ 을 켜면 풀립니다.`, fixId: dp.id };
    }
    if (dp && dp.blocked) {
        return { kind: 'no-promise', iface, text: `${head} — 약속 플러그인 ‘${dp.name}’ 이 다른 의존 때문에 막혀 있습니다.`, fix: `먼저 ‘${dp.name}’ 의 막힘을 풀어야 합니다.`, fixId: dp.id };
    }
    return { kind: 'no-promise', iface, text: `${head} — 그 약속 플러그인이 설치돼 있지 않습니다.` };
}

/** 「채운 모듈 없음」 사유 한 줄 — 제공자가 꺼졌나·미설치인가로 가른다. */
function noProviderCause(iface: string, plugins: PluginStatus[], self: PluginStatus): BlockCause {
    const head = `약속 ‘${iface}’ 은(는) 있지만 그 약속을 채운 모듈이 없습니다`;
    const off = plugins.find((p) => p.id !== self.id && !p.enabled && iface in p.provides);
    if (off) {
        return { kind: 'no-provider', iface, text: `${head}.`, fix: `제공자 ‘${off.name}’ 을 켜면 풀립니다.`, fixId: off.id };
    }
    return { kind: 'no-provider', iface, text: `${head} — 그 약속을 채우는 제공자 플러그인이 설치돼 있지 않습니다.` };
}

/**
 * 🔴 ③ 꺼진 플러그인의 사유를 사람 말 목록으로. blocked 가 아니면 빈 배열.
 *   사유 둘을 가른다(명세): ①약속 없음(약속 플러그인 꺼짐/미설치) ②약속은 있는데 채운 모듈 없음(제공자 꺼짐).
 *   그래프에서 직접 다시 재므로 reason 문자열 파싱에 안 기댄다 — 못 재는 경우(순환 등)만 reason 으로 폴백.
 */
export function explainBlock(p: PluginStatus, plugins: PluginStatus[]): BlockCause[] {
    if (!p.blocked) return [];
    const avail = availablePromises(plugins);
    const causes: BlockCause[] = [];
    const seen = new Set<string>();
    const push = (c: BlockCause) => { const k = `${c.kind}:${c.iface}`; if (!seen.has(k)) { seen.add(k); causes.push(c); } };

    // a. 내가 선언한 약속이 기대는(uses) 약속이 없다 → 내 약속 자신이 선다(약속 플러그인이 막히는 꼴).
    for (const it of p.interfaces) {
        for (const u of it.uses) {
            if (!avail.has(u)) push(noPromiseCause(u, plugins, `약속 ‘${it.name}’ 이 기대는 `));
        }
    }
    // b. 내가 채우기로 한(provides) 약속이 없다.
    for (const iface of Object.keys(p.provides)) {
        if (!avail.has(iface)) push(noPromiseCause(iface, plugins));
    }
    // c. 내가 필요로 하는(requires) 약속 — 약속 없음 / 채운 모듈 없음 / 판 안 맞음.
    for (const [iface, range] of Object.entries(p.requires)) {
        if (!avail.has(iface)) { push(noPromiseCause(iface, plugins)); continue; }
        const prov = activeProviderOf(iface, plugins, avail);
        if (!prov) { push(noProviderCause(iface, plugins, p)); continue; }
        const have = prov.provides[iface];
        if (!satisfies(range, have)) {
            push({ kind: 'version', iface, text: `약속 ‘${iface}’ 의 판이 안 맞습니다 — 필요 ${range}, 제공자 ‘${prov.name}’ 은 ${have}.` });
        }
    }

    if (causes.length === 0) {
        // 그래프로 못 집은 사유(순환·호스트 전용 검사 등) — reason 을 사람 말로 다듬어 그대로.
        const raw = (p.reason ?? '').replace(/^꺼짐 — /, '');
        if (/순환/.test(raw)) push({ kind: 'cycle', iface: '', text: `다른 플러그인과 서로 기대고 있어 켤 수 없습니다(순환): ${raw.replace(/^순환:\s*/, '')}` });
        else if (raw) push({ kind: 'other', iface: '', text: raw });
    }
    return causes;
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 끄기 전 영향 — 같이 꺼질 것(requires) · 기능만 떨어질 것(supports)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImpactItem extends PluginRef {
    /** 어느 약속을 통해 매였나(사람에게 보여 줄 꼬리표). */
    via: string;
}
export interface DisableImpact {
    /** requires 로 매달려 **같이 꺼질**(blocked 될) 플러그인 — 전이 포함. */
    willBlock: ImpactItem[];
    /** supports 로 붙어 **기능만 떨어질**(detach) 플러그인 — 계속 켜져 있다. */
    willDegrade: ImpactItem[];
}

/**
 * 🔴 ④ targetId 를 끄면 생기는 영향. 전이(연쇄)까지 고정점으로 계산.
 *   willBlock(requires 쪽) — 지금 살아 있는 플러그인이 끄는 집합 때문에 막히는 네 길:
 *     ① 약속 자체가 사라짐(약속 플러그인을 끈다) 을 requires · ② 제공자가 사라짐(다른 제공자도 없음) 을 requires ·
 *     ③ 자기 provides 하던 약속이 사라짐(제공자 자신이 막힘) · ④ 약속끼리 기대기(uses) 가 사라짐.
 *   willDegrade(supports 쪽) — 사라지는 약속을 supports 로 붙였던, 집합 밖의 살아 있는 플러그인(detach · 계속 켜짐).
 */
export function disableImpact(targetId: string, plugins: PluginStatus[]): DisableImpact {
    const byId = new Map(plugins.map((p) => [p.id, p]));
    if (!byId.has(targetId)) return { willBlock: [], willDegrade: [] };

    const live = (p: PluginStatus) => p.enabled && !p.blocked && !p.failed;
    const blockVia = new Map<string, string>();
    const down = new Set<string>([targetId]);       // 꺼질(또는 블록될) 집합

    // 집합이 내놓는 약속 — 선언한 약속(declaredDown)과 지금 채우는 약속(providedDown)을 가른다.
    const setsFromDown = () => {
        const declaredDown = new Set<string>();
        const providedDown = new Set<string>();
        for (const id of down) {
            const p = byId.get(id)!;
            for (const i of p.interfaces) declaredDown.add(i.name);
            for (const k of Object.keys(p.provides)) providedDown.add(k);
        }
        // 제공자가 사라지는 약속 = providedDown 중 집합 밖에 살아 있는 다른 제공자가 없는 것.
        const providerGone = new Set<string>();
        for (const x of providedDown) {
            const other = plugins.some((p) => !down.has(p.id) && live(p) && x in p.provides);
            if (!other) providerGone.add(x);
        }
        return { declaredDown, providerGone };
    };

    // 고정점 — 집합이 자라는 동안 네 길로 더 끌어들인다.
    let changed = true;
    while (changed) {
        changed = false;
        const { declaredDown, providerGone } = setsFromDown();
        for (const m of plugins) {
            if (down.has(m.id) || !live(m)) continue;
            const via =
                Object.keys(m.requires).find((i) => declaredDown.has(i))                 // ① 약속 사라짐
                ?? Object.keys(m.requires).find((i) => providerGone.has(i))              // ② 제공자 사라짐
                ?? Object.keys(m.provides).find((i) => declaredDown.has(i))              // ③ 내 약속 사라짐
                ?? m.interfaces.flatMap((i) => i.uses).find((u) => declaredDown.has(u)); // ④ 약속끼리 기대기
            if (via) { down.add(m.id); blockVia.set(m.id, via); changed = true; }
        }
    }
    const willBlock: ImpactItem[] = plugins
        .filter((m) => m.id !== targetId && down.has(m.id))
        .map((m) => ({ ...ref(m), via: blockVia.get(m.id) ?? '' }));

    // ── willDegrade: 사라지는 약속(declaredDown ∪ providerGone)을 supports 로 붙인, 집합 밖의 살아 있는 플러그인.
    const { declaredDown, providerGone } = setsFromDown();
    const gone = new Set<string>([...declaredDown, ...providerGone]);
    const willDegrade: ImpactItem[] = [];
    for (const m of plugins) {
        if (down.has(m.id) || !live(m)) continue;
        const hit = Object.keys(m.supports).find((i) => gone.has(i));
        if (hit) willDegrade.push({ ...ref(m), via: hit });
    }
    return { willBlock, willDegrade };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 약속별 화면
// ─────────────────────────────────────────────────────────────────────────────

export interface PromiseRow {
    name: string;
    version: string;
    declaredBy: PluginRef;
    available: boolean;
    provider: PluginRef | null;
    /** requires·supports 로 이 약속을 기다리는 플러그인 수. */
    consumerCount: number;
}

export interface PromiseConsumer extends PluginRef {
    relation: 'requires' | 'supports';
    /** 지금 붙었나 — 제공자가 살아 있고 이 소비자도 살아 있을 때 true. */
    attached: boolean;
}

export interface PromiseDetailInfo {
    name: string;
    version: string;
    declaredBy: PluginRef | null;
    available: boolean;
    provider: PluginRef | null;
    consumers: PromiseConsumer[];
}

/** 이 약속을 requires·supports 로 기다리는 플러그인들(지금 붙었나까지). */
function consumersOfPromise(name: string, plugins: PluginStatus[], providerLive: boolean): PromiseConsumer[] {
    const out: PromiseConsumer[] = [];
    const live = (p: PluginStatus) => p.enabled && !p.blocked && !p.failed;
    for (const p of plugins) {
        const relation: 'requires' | 'supports' | null =
            name in p.requires ? 'requires' : name in p.supports ? 'supports' : null;
        if (!relation) continue;
        out.push({ ...ref(p), relation, attached: providerLive && live(p) });
    }
    return out;
}

/**
 * ⑤ 켜진 플러그인들이 선언한 약속 모음 — 약속 하나하나의 제공자·소비자 수. (호스트 listInterfaces 와 같은 집합)
 *   ⛔ contract-* 라는 이름에 안 묶는다 — p.interfaces(선언한 약속)만 읽는다.
 */
export function listPromiseRows(plugins: PluginStatus[]): PromiseRow[] {
    const declared = declaredByEnabled(plugins);
    const avail = availablePromises(plugins);
    return [...declared.values()].map((d) => {
        const prov = activeProviderOf(d.name, plugins, avail);
        const count = plugins.filter((p) => d.name in p.requires || d.name in p.supports).length;
        const declarer = plugins.find((p) => p.id === d.pluginId);
        return {
            name: d.name,
            version: d.version,
            declaredBy: declarer ? ref(declarer) : { id: d.pluginId, name: d.pluginId },
            available: avail.has(d.name),
            provider: prov ? ref(prov) : null,
            consumerCount: count,
        };
    });
}

/** ⑤ 약속 하나의 상세 — 채운 모듈(제공자) · 기다리는 플러그인(지금 붙었나). 없는 약속이면 null. */
export function promiseDetail(name: string, plugins: PluginStatus[]): PromiseDetailInfo | null {
    const declarer = declarerOf(name, plugins);
    const declaredFromEnabled = declaredByEnabled(plugins).get(name);
    if (!declarer && !declaredFromEnabled) return null;
    const avail = availablePromises(plugins);
    const prov = activeProviderOf(name, plugins, avail);
    const version = declarer?.interfaces.find((i) => i.name === name)?.version
        ?? declaredFromEnabled?.version ?? '';
    return {
        name,
        version,
        declaredBy: declarer ? ref(declarer) : null,
        available: avail.has(name),
        provider: prov ? ref(prov) : null,
        consumers: consumersOfPromise(name, plugins, !!prov),
    };
}
