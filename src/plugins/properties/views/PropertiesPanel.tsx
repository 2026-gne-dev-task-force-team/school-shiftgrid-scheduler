/**
 * 속성 패널 — 「지금 고른 대상」의 종류(type)에 꽂힌 속성 칸을 위에서 아래로 쌓는다.
 *   🔴 이 패널은 대상의 뜻을 모른다 — 칸은 그 대상을 가진 플러그인이 contributes.properties 로 낸다.
 */
import { useSyncExternalStore } from 'react';
import { EmptyState, SectionHeader } from '../../../pane-ui-system';
import { listPropertiesPanes, useContribVersion, type PluginHost, type PropertiesTarget } from '../../../pane-ui-system/plugin';
import type { SelectionApi } from '../../selection/contracts/selection';

/** 고른 대상 하나를 받아 그린다 — 대상이 어디서 오는지는 PropertiesView 몫(시험은 이걸 바로 그린다). */
export function PropertiesBody({ target }: { target: PropertiesTarget | null }) {
    useContribVersion();   // 칸을 낸 플러그인이 켜지고/꺼지면 다시 그린다
    if (!target) return <Empty text="고른 것이 없습니다." hint="탐색기나 목록에서 항목을 누르면 속성이 여기에 보입니다." />;
    const panes = listPropertiesPanes(target.type);
    if (panes.length === 0) return <Empty text="이것은 보여 줄 속성이 없습니다." hint="다른 항목을 누르면 그 항목의 속성을 볼 수 있습니다." />;
    return (
        <div className="flex flex-col">
            {panes.map(({ owner, id, title, Pane }) => (
                <section key={`${owner}:${id}`} className="border-b border-line">
                    <h3 className="px-pad pt-2 pb-1 text-[12px] text-muted select-none">{title}</h3>
                    <div className="px-pad pb-2"><Pane target={target} /></div>
                </section>
            ))}
        </div>
    );
}

function Empty({ text, hint }: { text: string; hint: string }) {
    return <EmptyState compact icon="info" title={text} description={hint} />;
}

const noSub = () => () => {};
const none = () => null;

export function PropertiesView({ host }: { host: PluginHost }) {
    useContribVersion();   // 선택 알림이 켜지고/꺼지면 다시 그려 sel 을 새로 받는다
    const sel = host.modules.use<SelectionApi>('selection');   // supports — 없으면 null(늘 「고른 것이 없습니다」)
    const target: PropertiesTarget | null = useSyncExternalStore(sel?.subscribe ?? noSub, sel?.get ?? none);
    return (
        <div className="h-full flex flex-col bg-side">
            <SectionHeader title="속성" />
            <div className="flex-1 min-h-0 overflow-auto"><PropertiesBody target={target} /></div>
        </div>
    );
}
