/**
 * 「팬 UI 엔진 테스트」 탭 안 — 🔴 ⛔ 생성 단추는 **이 탭 안에만** 둔다(쥔님 2026-11-01: *"생성하기 버튼은 아무 데서나 만들지 말고"*).
 *   패널 A·B·C·D(틀에 하나씩) · 탭 가·나·다·라(가운데 탭) · 스크롤 시험. 피크는 단계 4 에서 이 자리에 붙는다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①).
 */
import type { PluginHost } from '../../../pane-ui-system/plugin';

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="px-3 py-2 rounded-md border border-line bg-panel2 hover:bg-panel text-[13px] text-text text-left"
        >
            {children}
        </button>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted select-none">{title}</h3>
            <div className="flex flex-wrap gap-2">{children}</div>
        </section>
    );
}

export function TestConsole({ host }: { host: PluginHost }) {
    const open = (id: string, where?: 'left' | 'center' | 'right') =>
        host.workspace.open(`pane-test.${id}`, where ? { where } : undefined);

    return (
        <div className="h-full overflow-auto p-5 flex flex-col gap-5 select-text bg-bg">
            <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-text">팬 UI 엔진 테스트</h2>
                <p className="text-[12px] text-muted">여기 단추로 여러 창 타입을 열어 창틀을 시험합니다. ⛔ 생성 단추는 이 탭 안에만 있습니다.</p>
            </header>

            <Group title="패널 — 틀에 하나씩">
                <Btn onClick={() => open('panel-a', 'left')}>패널 A — 왼쪽 틀</Btn>
                <Btn onClick={() => open('panel-b', 'right')}>패널 B — 오른쪽 틀</Btn>
                <Btn onClick={() => open('panel-c', 'center')}>패널 C — 가운데</Btn>
                <Btn onClick={() => open('panel-d', 'center')}>패널 D — 가운데</Btn>
            </Group>

            <Group title="탭 — 가운데에 탭으로">
                <Btn onClick={() => open('tab-ga', 'center')}>탭 가</Btn>
                <Btn onClick={() => open('tab-na', 'center')}>탭 나</Btn>
                <Btn onClick={() => open('tab-da', 'center')}>탭 다</Btn>
                <Btn onClick={() => open('tab-ra', 'center')}>탭 라</Btn>
            </Group>

            <Group title="스크롤">
                <Btn onClick={() => open('scroll', 'center')}>스크롤 시험 뷰</Btn>
            </Group>
        </div>
    );
}
