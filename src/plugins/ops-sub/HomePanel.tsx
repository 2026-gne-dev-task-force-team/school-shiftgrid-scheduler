import { useState } from 'react';
import { Button, Icon, Segmented, Toolbar, ViewHeader } from '../../pane-ui-system';
import type { PluginHost } from '../../pane-ui-system/plugin';
import { ListPanel, MinePanel } from './ListPanels';

type Tab = 'list' | 'mine';

/** 「보결」 한 화면 — 머리줄(제목·명단 열기) + 툴바(목록·내 보결 탭). 리본 아이콘 하나가 여기를 연다.
 *  「보결 명단」(substitute)이 꺼져 있으면 그 단추는 안 보인다 — 켜짐은 그 플러그인의 보기가 등록됐는지로 본다. */
export function OpsSubHome({ host }: { host: PluginHost }) {
    const [tab, setTab] = useState<Tab>('list');
    const hasRoster = !!host.views.get('substitute.sheet');
    return (
        <div className="h-full flex flex-col min-h-0">
            <ViewHeader
                icon={<Icon name="userSwap" size={16} className="text-muted" />}
                title="보결"
                actions={hasRoster && <Button size="sm" onClick={() => host.workspace.open('substitute.sheet', { where: 'center' })}>보결 명단 열기</Button>}
            />
            <Toolbar label="보결 보기">
                <Segmented<Tab>
                    label="보결 보기" value={tab} onChange={setTab}
                    options={[{ value: 'list', label: '보결 목록' }, { value: 'mine', label: '내 보결' }]}
                />
            </Toolbar>
            <div className="flex-1 min-h-0 overflow-auto">
                {tab === 'list'
                    ? <ListPanel onOpen={() => { host.workspace.open('ops-sub.detail', { where: 'center' }); }} onRegister={() => { host.commands.run('ops-sub.open-register'); }} />
                    : <MinePanel />}
            </div>
        </div>
    );
}
