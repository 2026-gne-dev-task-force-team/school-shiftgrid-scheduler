/**
 * 테스트 전용 — 페이지 편집기가 받는 host. 노드 틀(nodes.Frame)은 탐색기 몫이라 여기선 「머리 자리에 제목 칸만 놓는」 가짜 틀을 끼운다
 *   (진짜 틀·머리는 explorer/views 의 테스트가 본다). 페이지 편집기가 틀에 넘기는 약속(제목 접근성 이름·placeholder·Enter)만 확인한다.
 */
import type { ReactNode } from 'react';
import { TitleField } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import type { NodeFrameProps, NodesApi } from '../explorer/contracts/nodes';

/** host.notify 로 들어온 알림 — 테스트가 읽는다(frameHost 가 호출될 때마다 비운다) */
export const notices: Array<{ title: string; action?: { commandId: string } }> = [];

export function frameHost(nodes: NodesApi): PluginHost {
    notices.length = 0;
    const Frame = ({ nodeId, children, titleAriaLabel, titlePlaceholder, onTitleEnter, onRename }: NodeFrameProps) => {
        const n = nodes.get(nodeId);
        const header: ReactNode = (
            <TitleField value={n?.name ?? ''} ariaLabel={titleAriaLabel} placeholder={titlePlaceholder} onEnter={onTitleEnter}
                onRename={(name) => (onRename ?? ((x: string) => nodes.rename(nodeId, x)))(name)} />
        );
        return <>{typeof children === 'function' ? children(header) : children}</>;
    };
    const withFrame = { ...nodes, Frame } as NodesApi;
    return { notify: (i: { title: string; action?: { commandId: string } }) => { notices.push(i); }, modules: { use: (name: string) => (name === 'nodes' ? withFrame : null) } } as unknown as PluginHost;
}
