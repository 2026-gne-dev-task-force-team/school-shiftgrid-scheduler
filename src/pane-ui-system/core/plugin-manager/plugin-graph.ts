/**
 * 설정 「플러그인」 사유 계산 — 🔴 화면과 떼어 둔 순수 함수다(vitest 단독으로 잰다).
 *   ⭐ 입력은 호스트가 주는 PluginStatus[](listPlugins()) 하나뿐 — 매니페스트(provides/requires/supports)와
 *      지금 상태(enabled/blocked/failed)만 읽는다. 전역 런타임을 안 건드린다.
 *
 * 🔴 ⭐ 끄기 영향(disableImpact)은 **호스트가 단일 진실**이다 — 여기선 그대로 불러 쓴다(아래 re-export).
 *    계산이 두 벌로 갈리지 않게, 「누가 같이 꺼지나」 규칙은 pane-ui-system/plugin 한 곳에만 산다.
 *
 * 여기 남는 것은 explainBlock 하나 — 꺼진(blocked) 플러그인 **자신의** 사유를 사람 말로 푼다(자리표시·상세가 그린다).
 *   🔴 실행 판정과 같은 규칙 하나뿐: requires 한 약속을 **채우는 활성 플러그인이 없으면** 꺼진다(사유 「채워 주는 플러그인 없음」).
 *   정의(contributes.interfaces)·uses 연쇄는 보지 않는다(쥔님 2026-11-08 19:42 — 정의와 제공은 서로 기대지 않는다).
 */
import type { PluginStatus } from '../../plugin';

// 🔴 끄기 영향은 호스트 단일 진실을 그대로 쓴다 — 설정에서 쓰던 이름(disableImpact·ImpactItem·DisableImpact)은 여기로 재수출한다.
export { disableImpact } from '../../plugin';
export type { ImpactItem, DisableImpact } from '../../plugin';

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

/** 그 약속을 지금 실제로 채우고 있는 제공자(켜졌고·안 막혔고·안 터진 첫 플러그인). 없으면 undefined. */
function activeProviderOf(iface: string, plugins: PluginStatus[]): PluginStatus | undefined {
    return plugins.find((p) => p.enabled && !p.blocked && !p.failed && iface in p.provides);
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 꺼진 사유를 사람 말로
// ─────────────────────────────────────────────────────────────────────────────

export type BlockKind = 'no-provider' | 'version' | 'cycle' | 'other';

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

/** 「채워 주는 플러그인 없음」 사유 한 줄 — 채우는 플러그인이 꺼졌나·막혔나·아예 없나로 가른다. */
function noProviderCause(iface: string, plugins: PluginStatus[], self: PluginStatus): BlockCause {
    const head = `약속 ‘${iface}’ 을(를) 채워 주는 플러그인이 없습니다`;
    // 끈 제공자가 있으면 그걸 켜라고 짚는다.
    const off = plugins.find((p) => p.id !== self.id && !p.enabled && iface in p.provides);
    if (off) return { kind: 'no-provider', iface, text: `${head}.`, fix: `제공자 ‘${off.name}’ 을 켜면 풀립니다.`, fixId: off.id };
    // 켜져 있지만 다른 의존 때문에 막힌 제공자가 있으면 그 막힘부터.
    const blockedProv = plugins.find((p) => p.id !== self.id && p.enabled && p.blocked && iface in p.provides);
    if (blockedProv) return { kind: 'no-provider', iface, text: `${head} — 제공자 ‘${blockedProv.name}’ 이 다른 의존 때문에 막혀 있습니다.`, fix: `먼저 ‘${blockedProv.name}’ 의 막힘을 풀어야 합니다.`, fixId: blockedProv.id };
    return { kind: 'no-provider', iface, text: `${head} — 그 약속을 채우는 제공자 플러그인이 설치돼 있지 않습니다.` };
}

/**
 * 🔴 ③ 꺼진 플러그인의 사유를 사람 말 목록으로. blocked 가 아니면 빈 배열.
 *   그래프에서 직접 다시 재므로 reason 문자열 파싱에 안 기댄다 — 못 재는 경우(순환 등)만 reason 으로 폴백.
 */
export function explainBlock(p: PluginStatus, plugins: PluginStatus[]): BlockCause[] {
    if (!p.blocked) return [];
    const causes: BlockCause[] = [];
    const seen = new Set<string>();
    const push = (c: BlockCause) => { const k = `${c.kind}:${c.iface}`; if (!seen.has(k)) { seen.add(k); causes.push(c); } };

    // requires 한 약속 — 채운 플러그인이 없음 / 판 안 맞음.
    for (const [iface, range] of Object.entries(p.requires)) {
        const prov = activeProviderOf(iface, plugins);
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
