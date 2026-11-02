/**
 * 선언형 기여를 꽂는 한 길 — contributes 블록(applyContributes)도, 동적 선언(host.declare → declareOne)도 여기로 온다.
 *
 * 🔴 「이름 → 구현」을 impl 에서 찾아 옛 host 등록 메서드로 꽂는다 — 새 등록소 0(기존 레지스트리를 그대로 쓴다).
 * 🔴 이름이 impl 에 없으면 던진다 — 로더(registry.activateOne)의 try/catch 가 받아 그 플러그인을 「활성 실패」로
 *    올린다(⛔ 콘솔만 찍고 넘어가지 않는다). 매니페스트가 가리키는 이름과 구현이 어긋나는 걸 켤 때 잡는 자리다.
 */
import { createElement } from 'react';
import type { ComponentType } from 'react';
import type { ViewProps } from '../view-registry';
import type {
    PluginHost, PluginImpl, DeclareInput, Contributes, Disposable, NodeTypeRegistrar,
} from './types';

/**
 * 🔴 노드 타입 레지스트라의 플러그인 id — 창틀이 도메인(노드 하이라키)을 쥔 플러그인에 거는 유일한 끈이다.
 *   ⛔ 다른 도메인 지식은 창틀에 없다. contributes.nodeTypes 를 적은 플러그인이 켜질 때만 이 id 로 api 를 찾는다.
 */
const NODE_TYPE_REGISTRAR = 'project-explorer';

/**
 * 동적 선언 하나 — contributes 항목 하나와 같은 타입·같은 검증·같은 꽂기 경로. host.declare 가 이걸 부른다.
 *   🔴 이름으로 찾은 구현(run·Component·Pane·render)에 host 를 바인딩해 옛 host 등록 메서드로 꽂는다 —
 *      안드로이드가 Activity 에 Context 를 꽂듯. 그래서 선언형 구현도 host.workspace.open 등을 쓸 수 있다.
 */
export function declareOne(item: DeclareInput, impl: PluginImpl, host: PluginHost): Disposable {
    switch (item.kind) {
        case 'command': {
            const fn = impl.commands?.[item.id];
            if (!fn) throw new Error(`[plugin] "${host.id}" 명령 "${item.id}" 의 구현이 commands 에 없다`);
            const { kind, ...rest } = item;
            return host.commands.add({ ...rest, run: (ctx) => fn(host, ctx) });
        }
        case 'view': {
            const Impl = impl.components?.[item.component];
            if (!Impl) throw new Error(`[plugin] "${host.id}" 뷰 "${item.id}" 가 가리키는 component "${item.component}" 가 components 에 없다`);
            const { kind, component, ...rest } = item;
            // ViewProps 는 창틀 타입 그대로 — host 는 꽂을 때 끼워 넣는다(교차 타입).
            const Component: ComponentType<ViewProps> = (p) => createElement(Impl, { ...p, host });
            return host.views.register({ ...rest, Component });
        }
        case 'ribbon': {
            const { kind, ...rest } = item;
            return host.ribbon.add(rest);
        }
        case 'settingsSection':
            return host.settings.addSection(item.id, item.title, item.icon);
        case 'settingsItem': {
            const Impl = impl.panes?.[item.pane];
            if (!Impl) throw new Error(`[plugin] "${host.id}" 설정 항목 "${item.id}" 가 가리키는 pane "${item.pane}" 가 panes 에 없다`);
            const { kind, pane, ...rest } = item;
            const Pane: ComponentType = (p) => createElement(Impl, { ...p, host });
            return host.settings.addItem({ ...rest, Pane });
        }
        case 'statusBar': {
            const fn = impl.renders?.[item.render];
            if (!fn) throw new Error(`[plugin] "${host.id}" 상태바 "${item.id}" 가 가리키는 render "${item.render}" 가 renders 에 없다`);
            return host.statusBar.add({ id: item.id, side: item.side, render: () => fn(host) });
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
    for (const cmd of c.commands ?? []) declareOne({ kind: 'command', ...cmd }, impl, host);
    for (const v of c.views ?? []) declareOne({ kind: 'view', ...v }, impl, host);
    for (const r of c.ribbon ?? []) declareOne({ kind: 'ribbon', ...r }, impl, host);
    for (const s of c.settings?.sections ?? []) declareOne({ kind: 'settingsSection', ...s }, impl, host);
    for (const it of c.settings?.items ?? []) declareOne({ kind: 'settingsItem', ...it }, impl, host);
    for (const sb of c.statusBar ?? []) declareOne({ kind: 'statusBar', ...sb }, impl, host);

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
