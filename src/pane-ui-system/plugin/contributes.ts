/**
 * 선언형 기여를 꽂는 한 길 — contributes 블록(applyContributes)도, 동적 선언(host.declare → declareOne)도 여기로 온다.
 *
 * 🔴 「이름 → 구현」을 impl 에서 찾아 옛 host 등록 메서드로 꽂는다 — 새 등록소 0(기존 레지스트리를 그대로 쓴다).
 * 🔴 이름이 impl 에 없으면 던진다 — 로더(registry.activateOne)의 try/catch 가 받아 그 플러그인을 「활성 실패」로
 *    올린다(⛔ 콘솔만 찍고 넘어가지 않는다). 매니페스트가 가리키는 이름과 구현이 어긋나는 걸 켤 때 잡는 자리다.
 */
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { registerView, unregisterView } from '../view-registry';
import type { ViewProps } from '../view-registry';
import {
    track, addCommand, addRibbonAction, getCommand,
    addSettingsSection, addSettingsItem, addStatusItem, setNewTab, touchContrib,
    recordContribution,
} from './store';
import type {
    PluginHost, PluginImpl, DeclareInput, Contributes, Disposable, NodeTypeRegistrar,
    ContributionRecord,
} from './types';

/**
 * 🔴 노드 타입 레지스트라의 플러그인 id — 창틀이 도메인(노드 하이라키)을 쥔 플러그인에 거는 유일한 끈이다.
 *   ⛔ 다른 도메인 지식은 창틀에 없다. contributes.nodeTypes 를 적은 플러그인이 켜질 때만 이 id 로 api 를 찾는다.
 */
const NODE_TYPE_REGISTRAR = 'project-explorer';

/**
 * 동적 선언 하나 — contributes 항목 하나와 같은 타입·같은 검증·같은 꽂기 경로. host.declare 가 이걸 부른다.
 *   🔴 이름으로 찾은 구현(run·Component·Pane·render)에 host 를 바인딩해 스토어 등록소에 꽂는다(주인 = host.id) —
 *      안드로이드가 Activity 에 Context 를 꽂듯. 그래서 선언형 구현도 host.workspace.open 등을 쓸 수 있다.
 *   📌 D5③: 옛 host.views.register·commands.add·ribbon.add·settings.add*·statusBar.add 를 지웠으니, 등록은 여기서
 *      스토어 함수(addCommand·registerView·… + track)로 바로 한다 — 이제 「꽂는 길」은 contributes·declare(둘 다 여기로) 뿐.
 */
// viewId 접두사 강제 — `${owner}.` 로 시작 안 하면 붙인다(저장된 leaf 의 viewId 만 보고 주인을 안다).
const scopedId = (owner: string, id: string) => (id.startsWith(`${owner}.`) ? id : `${owner}.${id}`);

/**
 * 🔴 기여 장부 한 줄로 바꾼다 — 실제 등록 뒤에 부른다(리본 제목은 그때 명령이 이미 있어 풀린다).
 *   id 는 등록된 실제 키: 뷰는 접두사 붙인 전체 id(scopedId), 명령·리본은 명령 id, 설정은 섹션/항목 id.
 */
function ledgerRecord(owner: string, item: DeclareInput, origin: ContributionRecord['origin']): ContributionRecord {
    switch (item.kind) {
        case 'view': return { kind: 'view', id: scopedId(owner, item.id), title: item.title, origin };
        case 'command': return { kind: 'command', id: item.id, title: item.title, origin };
        case 'ribbon': return { kind: 'ribbon', id: item.commandId, title: getCommand(item.commandId)?.title, origin };
        case 'settingsSection': return { kind: 'settingsSection', id: item.id, title: item.title, origin };
        case 'settingsItem': return { kind: 'settingsItem', id: item.id, title: item.title, origin };
        case 'statusBar': return { kind: 'statusBar', id: item.id, origin };
    }
}

/**
 * 동적 선언/매니페스트 기여 하나를 꽂고, 장부에 한 줄을 남긴다.
 *   origin: applyContributes 경로는 'manifest', host.declare 경로는 'declare'(기본값).
 *   🔴 장부 Disposable 도 주인별로 track 한다 — 끌 때(disposeOwner) 등록과 함께 장부에서도 빠진다.
 */
export function declareOne(
    item: DeclareInput, impl: PluginImpl, host: PluginHost, origin: ContributionRecord['origin'] = 'declare',
): Disposable {
    const reg = registerOne(item, impl, host);
    const led = track(host.id, recordContribution(host.id, ledgerRecord(host.id, item, origin)));
    return { dispose() { led.dispose(); reg.dispose(); } };
}

/** 실제 등록 — 「이름 → 구현」을 impl 에서 찾아 스토어·뷰 레지스트리에 꽂는다(장부는 안 건드린다). */
function registerOne(item: DeclareInput, impl: PluginImpl, host: PluginHost): Disposable {
    const owner = host.id;
    const scoped = (id: string) => scopedId(owner, id);
    switch (item.kind) {
        case 'command': {
            // 구현 키 = impl 이 있으면 impl(id 는 런타임값일 수 있다), 없으면 id 자체.
            const key = item.impl ?? item.id;
            const fn = impl.commands?.[key];
            if (!fn) throw new Error(`[plugin] "${owner}" 명령 "${item.id}" 의 구현("${key}")이 commands 에 없다`);
            const { kind, impl: _impl, args, ...rest } = item;
            return track(owner, addCommand(owner, { ...rest, run: (ctx) => fn(host, ctx, args) }));
        }
        case 'view': {
            const Impl = impl.components?.[item.component];
            if (!Impl) throw new Error(`[plugin] "${owner}" 뷰 "${item.id}" 가 가리키는 component "${item.component}" 가 components 에 없다`);
            const { kind, component, newTab, ...rest } = item;
            const full = scoped(item.id);
            // ViewProps 는 창틀 타입 그대로 — host 는 꽂을 때 끼워 넣는다(교차 타입).
            const Component: ComponentType<ViewProps> = (p) => createElement(Impl, { ...p, host });
            registerView({ ...rest, id: full, Component });
            touchContrib();   // 뷰가 늘면 리본·뷰 목록이 바뀐다 — 다시 그리게
            const d = track(owner, { dispose() { unregisterView(full); touchContrib(); } });
            if (newTab) track(owner, setNewTab(owner, full, newTab.label));   // 「+ 새 탭」 한 칸(뒤가 이긴다)
            return d;
        }
        case 'ribbon': {
            // 🔴 리본 동작은 명령을 가리킨다 — label·run 을 명령에서 푼다(없으면 경고하고 빈 동작).
            const cmd = getCommand(item.commandId);
            if (!cmd) console.warn(`[plugin] 리본 동작이 없는 명령을 가리킨다: ${item.commandId}`);
            return track(owner, addRibbonAction(owner, {
                id: item.commandId,
                icon: item.icon ?? cmd?.icon ?? 'dot',
                label: cmd?.title ?? item.commandId,
                run: cmd?.run ?? (() => { /* 없는 명령 */ }),
                order: item.order,
            }));
        }
        case 'settingsSection':
            return track(owner, addSettingsSection(owner, item.id, item.title, item.icon));
        case 'settingsItem': {
            const Impl = impl.panes?.[item.pane];
            if (!Impl) throw new Error(`[plugin] "${owner}" 설정 항목 "${item.id}" 가 가리키는 pane "${item.pane}" 가 panes 에 없다`);
            const { kind, pane, ...rest } = item;
            const Pane: ComponentType = (p) => createElement(Impl, { ...p, host });
            return track(owner, addSettingsItem(owner, { ...rest, Pane }));
        }
        case 'statusBar': {
            const fn = impl.renders?.[item.render];
            if (!fn) throw new Error(`[plugin] "${owner}" 상태바 "${item.id}" 가 가리키는 render "${item.render}" 가 renders 에 없다`);
            return track(owner, addStatusItem(owner, { id: item.id, side: item.side, render: () => fn(host) }));
        }
    }
}

/**
 * 매니페스트 contributes 블록 전체를 꽂는다 — 활성 때 로더가 한 번 부른다(host.declare 와 같은 경로).
 *   순서: 명령 먼저(리본이 명령을 가리킨다) → 뷰 → 리본 → 설정 섹션 → 설정 항목 → 상태바.
 *   ⚠️ nodeTypes 는 D2 자리 — 여기서 꽂지 않는다(노드 레지스트리를 탐색기가 쥔다).
 *   🔴 Disposable 은 안 모은다 — host 가 주인(pluginId)별로 이미 track 해 끌 때 한꺼번에 회수한다.
 */
export function applyContributes(c: Contributes | undefined, impl: PluginImpl, host: PluginHost): void {
    if (!c) return;
    for (const cmd of c.commands ?? []) declareOne({ kind: 'command', ...cmd }, impl, host, 'manifest');
    for (const v of c.views ?? []) declareOne({ kind: 'view', ...v }, impl, host, 'manifest');
    for (const r of c.ribbon ?? []) declareOne({ kind: 'ribbon', ...r }, impl, host, 'manifest');
    for (const s of c.settings?.sections ?? []) declareOne({ kind: 'settingsSection', ...s }, impl, host, 'manifest');
    for (const it of c.settings?.items ?? []) declareOne({ kind: 'settingsItem', ...it }, impl, host, 'manifest');
    for (const sb of c.statusBar ?? []) declareOne({ kind: 'statusBar', ...sb }, impl, host, 'manifest');

    // 🔴 노드 타입 — 창틀은 꼴을 모른다(도메인). 노드 하이라키를 쥔 플러그인(NODE_TYPE_REGISTRAR)의 api 에
    //    항목·impl·host 를 통째로 넘겨 꽂는다. 없으면(꺼짐·활성 실패·먼저 안 삼) 던져서 「활성 실패」로 올린다
    //    — 명세 「조용히 안 넘어간다」. 코어(탐색기)가 먼저 사니 평소엔 늘 있다.
    //    ⚠️ Disposable 은 안 모은다 — api(host.plugins.get 바인딩)가 이미 이 플러그인 주인으로 track 한다.
    if (c.nodeTypes?.length) {
        const reg = host.plugins.get<NodeTypeRegistrar>(NODE_TYPE_REGISTRAR);
        if (!reg || typeof reg.registerContributed !== 'function') {
            throw new Error(`[plugin] "${host.id}" 의 nodeTypes 기여를 받을 노드 레지스트라("${NODE_TYPE_REGISTRAR}")가 없다 — 켜져 있고 먼저 산 코어인가`);
        }
        for (const nt of c.nodeTypes) reg.registerContributed(nt, impl, host);
    }
}
