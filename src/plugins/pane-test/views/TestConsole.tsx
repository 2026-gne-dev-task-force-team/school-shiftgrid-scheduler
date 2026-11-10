/**
 * 「팬 UI 엔진 테스트」 탭 안 — 🔴 ⛔ 생성 단추는 **이 탭 안에만** 둔다(쥔님 2026-11-01: *"생성하기 버튼은 아무 데서나 만들지 말고"*).
 *   패널 A·B·C·D(틀에 하나씩) · 탭 가·나·다·라(가운데 탭) · 스크롤 시험. 피크는 단계 4 에서 이 자리에 붙는다.
 *   🔴 색은 토큰 클래스로만(구조 검사 ①).
 */
import { useState } from 'react';
import { Button } from '../../../pane-ui-system';
import type { PluginHost, PeekHandle } from '../../../pane-ui-system/plugin';
import { PEEK_WIDE_MIN_KEY, PEEK_WIDE_MIN_DEFAULT, openCmdId } from '../store';

/** 피크 안에 띄울 시험 내용 — 색 글자 + 넘치는 목록(피크 안 스크롤도 시험). 색은 토큰 클래스로만. */
function PeekContent() {
    return (
        <div className="flex flex-col gap-2">
            <h3 className="text-lg font-bold text-accent">미리보기</h3>
            <p className="text-body text-muted">이 미리보기는 전역 창이 아니라 <span className="text-text font-semibold">이 탭 안</span>에서 뜹니다. 넓으면 오른쪽, 좁으면 아래.</p>
            {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="shrink-0 py-1.5 px-2 rounded bg-accent/10 text-body text-text">미리보기 줄 {i + 1} — 피크 안 스크롤 시험</div>
            ))}
        </div>
    );
}

/** 접힘 표시 쉐브론 — 열리면 90° 돈다. 🔴 Icon 조각은 plugin 배럴에 없어(구조 검사 ⑥) 인라인 SVG, 색은 currentColor. */
function Chevron({ open }: { open: boolean }) {
    return (
        <svg
            width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        >
            <path d="M9 5l7 7-7 7" />
        </svg>
    );
}

/**
 * 접이식 섹션 — 🔴 처음엔 전부 접힘(쥔님 2026-11-01: *"테스트 처음에 다 펼치지 말아줘 산만해"*).
 *   펼친 상태는 기기별 host.storage 에 산다(`open.<id>`) — 다음에 열면 그대로.
 */
function Group({ id, title, host, children }: { id: string; title: string; host: PluginHost; children: React.ReactNode }) {
    const key = `open.${id}`;
    const [open, setOpen] = useState(() => host.storage.get<boolean>(key, false));
    const toggle = () => { const next = !open; setOpen(next); host.storage.set(key, next); };
    return (
        <section className="flex flex-col gap-2">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                className="flex items-center gap-1.5 text-left text-note font-semibold uppercase tracking-wide text-muted hover:text-text select-none"
            >
                <Chevron open={open} />
                {title}
            </button>
            {open && <div className="flex flex-wrap gap-2 pl-[18px]">{children}</div>}
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
                <h2 className="text-base font-semibold text-text">Pane UI Test</h2>
                <p className="text-small text-muted">여기 단추로 여러 창 타입을 열어 창틀을 시험합니다. ⛔ 생성 단추는 이 탭 안에만 있습니다.</p>
            </header>

            <Group id="panel" title="패널 — 틀에 하나씩" host={host}>
                <Button className="text-left" onClick={() => open('panel-a')}>패널 A — 왼쪽 틀</Button>
                <Button className="text-left" onClick={() => open('panel-b')}>패널 B — 오른쪽 틀</Button>
                <Button className="text-left" onClick={() => open('panel-c')}>패널 C — 가운데</Button>
                <Button className="text-left" onClick={() => open('panel-d')}>패널 D — 가운데</Button>
            </Group>

            <Group id="tab" title="탭 — 가운데에 탭으로" host={host}>
                <Button className="text-left" onClick={() => open('tab-ga')}>탭 가</Button>
                <Button className="text-left" onClick={() => open('tab-na')}>탭 나</Button>
                <Button className="text-left" onClick={() => open('tab-da')}>탭 다</Button>
                <Button className="text-left" onClick={() => open('tab-ra')}>탭 라</Button>
            </Group>

            <Group id="scroll" title="스크롤" host={host}>
                <Button className="text-left" onClick={() => open('scroll')}>스크롤 시험 뷰</Button>
            </Group>

            <Group id="peek" title="미리보기 — 이 탭 안에서(넓으면 오른쪽 · 좁으면 아래)" host={host}>
                <Button className="text-left" onClick={openPeek}>미리보기 열기</Button>
            </Group>
        </div>
    );
}
