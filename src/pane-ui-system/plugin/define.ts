/**
 * definePlugin — 매니페스트가 가리키는 이름을 구현 객체의 키에서 「컴파일 때」 묶는다(선언형 전환 ③).
 *
 * 🔴 명세 「여기서 죽는다: 이름이 어긋난다」의 컴파일 쪽 방어다 — contributes 의
 *    component·pane·render·command id 가 components·panes·renders·commands 의 키와 안 맞으면
 *    tsc 가 그 자리에서 잡는다(문자열이라 리팩토링 도구가 못 따라오는 걸 막는다).
 *    런타임 쪽 방어는 로더(applyContributes)가 활성 때 대조해 「활성 실패」로 올린다 — 둘 다 있어야 한다.
 *
 * 쓰는 법(D1~D4):
 *   export default definePlugin({
 *     manifest: {
 *       id: 'x', name: 'X', version: '0.1.0', minHostVersion: '0.1.0',
 *       contributes: {
 *         views: [{ id: 'main', title: 'X', component: 'Main' }],   // 'Main' 은 아래 components 의 키여야 한다
 *         commands: [{ id: 'x.open', title: '열기' }],              // 'x.open' 은 아래 commands 의 키여야 한다
 *         ribbon: [{ commandId: 'x.open' }],
 *       },
 *     },
 *     components: { Main: (p) => createElement(XView, { ...p }) },   // p.host 로 창틀 호스트가 온다
 *     commands: { 'x.open': (host) => host.workspace.open('x.main') },   // 명령은 첫 인자로 host
 *   });
 *   // component 를 'Mian' 으로 오타 내면 tsc 가 거부한다(keyof typeof components 로 좁혔다).
 *   // ⭐ host 는 호스트가 꽂을 때 바인딩한다(안드로이드 Activity 의 Context) — 명령은 (host, ctx), 뷰·설정은 props.host, 상태바는 (host).
 */
import type { ComponentType, ReactNode } from 'react';
import type { ViewProps } from '../view-registry';
import type {
    PluginManifest, PluginModule, PluginHost, PluginLifecycle, Contributes, CommandContext,
} from './types';

// 🔴 기본값은 「빈 객체」여야 한다 — keyof {} = never(이름 없음). ⛔ Record<string, never> 는 keyof 가 string 이라
//    이름이 통째로 string 으로 넓어져 오타를 못 잡는다(검산 2026-11-02).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type EmptyRec = {};

export function definePlugin<
    C extends Record<string, ComponentType<ViewProps & { host: PluginHost }>> = EmptyRec,
    Cmd extends Record<string, (host: PluginHost, ctx?: CommandContext, args?: unknown) => void> = EmptyRec,
    P extends Record<string, ComponentType<{ host: PluginHost }>> = EmptyRec,
    R extends Record<string, (host: PluginHost) => ReactNode> = EmptyRec,
    // 🔴 노드 타입 함수 묶음 레코드 — 값의 꼴은 창틀이 모른다(도메인). 키(impl 이름)만 contributes 가 파생해 쓴다.
    NT extends Record<string, unknown> = EmptyRec,
    // 🔴 모듈 레코드 — provides 와 짝. manifest.provides 의 키는 이 레코드의 키(= 인터페이스 이름)여야 한다(아래 파생 검사).
    Mods extends Record<string, unknown> = EmptyRec,
>(spec: {
    manifest: Omit<PluginManifest, 'contributes' | 'provides'> & {
        contributes?: Contributes<
            Extract<keyof C, string>,
            Extract<keyof Cmd, string>,
            Extract<keyof P, string>,
            Extract<keyof R, string>,
            Extract<keyof NT, string>
        >;
        /** 🔴 내가 채우는 인터페이스 → 버전. 🔴 키는 modules 의 키여야 한다 — 짝 없는 provides 를 tsc 가 잡는다. */
        provides?: { [K in keyof Mods]?: string };
    };
    components?: C;
    commands?: Cmd;
    panes?: P;
    renders?: R;
    /** 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 이 이 키를 가리킨다(오타는 tsc 가 잡는다). */
    nodeTypes?: NT;
    /** 🔴 모듈 — provides 가 가리키는 인터페이스를 채운 값. host.modules.use 가 돌려준다(__perCaller 팩토리 가능). */
    modules?: Mods;
    lifecycle?: PluginLifecycle;
    deactivate?: () => void;
    api?: unknown;
}): PluginModule {
    return spec as unknown as PluginModule;
}
