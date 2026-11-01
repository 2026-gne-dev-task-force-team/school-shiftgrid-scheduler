/**
 * 「팬 UI 엔진 테스트」 탭 안 — 🔴 ⛔ 생성 단추는 **이 탭 안에만** 둔다(쥔님 2026-11-01: *"생성하기 버튼은 아무 데서나 만들지 말고"*).
 *   패널 A·B·C·D(틀에 하나씩) · 탭 가·나·다·라(가운데 탭) · 스크롤 시험. 피크는 단계 4 에서 이 자리에 붙는다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①).
 */
import type { PluginHost, PeekHandle } from '../../../pane-ui-system/plugin';
import { PEEK_WIDE_MIN_KEY, PEEK_WIDE_MIN_DEFAULT, openCmdId } from '../store';

/** 피크 안에 띄울 시험 내용 — 색 글자 + 넘치는 목록(피크 안 스크롤도 시험). 색은 토큰 클래스로만. */
function PeekContent() {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold text-accent">피크 미리보기</h3>
            <p className="text-[13px] text-muted">이 피크는 전역 창이 아니라 <span className="text-text font-semibold">이 탭 안</span>에서 뜹니다. 넓으면 오른쪽, 좁으면 아래.</p>
            {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="shrink-0 py-1.5 px-2 rounded bg-accent/10 text-[13px] text-text">피크 줄 {i + 1} — 피크 안 스크롤 시험</div>
            ))}
        </div>
    );
}

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

export function TestConsole({ host, peek }: { host: PluginHost; peek: PeekHandle }) {
    // 🔴 단추도 제 동작을 직접 안 부른다 — 명령으로 부른다(「모든 동작은 명령」, 팔레트에도 같이 뜬다).
    const open = (id: string) => host.commands.run(openCmdId(id));
    // 🔴 피크는 이 탭 안에서 뜬다(이 뷰의 peek 핸들이 필요해 전역 명령으로 못 뺀다) — 넓음/좁음 가름 폭은 설정값에서 읽어 넘긴다.
    const openPeek = () => peek.show(<PeekContent />, { wideMin: host.storage.get(PEEK_WIDE_MIN_KEY, PEEK_WIDE_MIN_DEFAULT) });

    return (
        <div className="h-full overflow-auto p-5 flex flex-col gap-5 select-text bg-bg">
            <header className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-text">팬 UI 엔진 테스트</h2>
                <p className="text-[12px] text-muted">여기 단추로 여러 창 타입을 열어 창틀을 시험합니다. ⛔ 생성 단추는 이 탭 안에만 있습니다.</p>
            </header>

            <Group title="패널 — 틀에 하나씩">
                <Btn onClick={() => open('panel-a')}>패널 A — 왼쪽 틀</Btn>
                <Btn onClick={() => open('panel-b')}>패널 B — 오른쪽 틀</Btn>
                <Btn onClick={() => open('panel-c')}>패널 C — 가운데</Btn>
                <Btn onClick={() => open('panel-d')}>패널 D — 가운데</Btn>
            </Group>

            <Group title="탭 — 가운데에 탭으로">
                <Btn onClick={() => open('tab-ga')}>탭 가</Btn>
                <Btn onClick={() => open('tab-na')}>탭 나</Btn>
                <Btn onClick={() => open('tab-da')}>탭 다</Btn>
                <Btn onClick={() => open('tab-ra')}>탭 라</Btn>
            </Group>

            <Group title="스크롤">
                <Btn onClick={() => open('scroll')}>스크롤 시험 뷰</Btn>
            </Group>

            <Group title="피크 — 이 탭 안에서(넓으면 오른쪽 · 좁으면 아래)">
                <Btn onClick={openPeek}>피크 열기</Btn>
            </Group>
        </div>
    );
}
