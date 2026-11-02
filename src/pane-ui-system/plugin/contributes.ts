/**
 * 선언형 기여를 꽂는 한 길 — contributes 블록(applyContributes)도, 동적 선언(host.declare → declareOne)도 여기로 온다.
 *
 * 🔴 「이름 → 구현」을 impl 에서 찾아 옛 host 등록 메서드로 꽂는다 — 새 등록소 0(기존 레지스트리를 그대로 쓴다).
 * 🔴 이름이 impl 에 없으면 던진다 — 로더(registry.activateOne)의 try/catch 가 받아 그 플러그인을 「활성 실패」로
 *    올린다(⛔ 콘솔만 찍고 넘어가지 않는다). 매니페스트가 가리키는 이름과 구현이 어긋나는 걸 켤 때 잡는 자리다.
 */
import type {
    PluginHost, PluginImpl, DeclareInput, Contributes, Disposable,
} from './types';

/** 동적 선언 하나 — contributes 항목 하나와 같은 타입·같은 검증·같은 꽂기 경로. host.declare 가 이걸 부른다. */
export function declareOne(item: DeclareInput, impl: PluginImpl, host: PluginHost): Disposable {
    switch (item.kind) {
        case 'command': {
            const run = impl.commands?.[item.id];
            if (!run) throw new Error(`[plugin] "${host.id}" 명령 "${item.id}" 의 구현이 commands 에 없다`);
            const { kind, ...rest } = item;
            return host.commands.add({ ...rest, run });
        }
        case 'view': {
            const Component = impl.components?.[item.component];
            if (!Component) throw new Error(`[plugin] "${host.id}" 뷰 "${item.id}" 가 가리키는 component "${item.component}" 가 components 에 없다`);
            const { kind, component, ...rest } = item;
            return host.views.register({ ...rest, Component });
        }
        case 'ribbon': {
            const { kind, ...rest } = item;
            return host.ribbon.add(rest);
        }
        case 'settingsSection':
            return host.settings.addSection(item.id, item.title, item.icon);
        case 'settingsItem': {
            const Pane = impl.panes?.[item.pane];
            if (!Pane) throw new Error(`[plugin] "${host.id}" 설정 항목 "${item.id}" 가 가리키는 pane "${item.pane}" 가 panes 에 없다`);
            const { kind, pane, ...rest } = item;
            return host.settings.addItem({ ...rest, Pane });
        }
        case 'statusBar': {
            const render = impl.renders?.[item.render];
            if (!render) throw new Error(`[plugin] "${host.id}" 상태바 "${item.id}" 가 가리키는 render "${item.render}" 가 renders 에 없다`);
            return host.statusBar.add({ id: item.id, side: item.side, render });
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
}
