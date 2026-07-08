/** 상단 도구 막대 — 되돌리기/다시하기, 복사·붙여넣기·지우기, 블랙아웃·통합 조회 열기 */
import type { ReactNode } from 'react';
import { useStore } from '../../store/store';
import { useGridOps } from '../../store/ops';

function Btn({ onClick, disabled, children, title }: { onClick: () => void; disabled?: boolean; children: ReactNode; title: string }) {
    return (
        <button
            onClick={onClick} disabled={disabled} title={title}
            className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        >{children}</button>
    );
}

export default function Toolbar() {
    const { undo, redo, canUndo, canRedo, ui, setUI } = useStore();
    const { copy, paste, clear, hasClipboard } = useGridOps();
    const hasSel = !!ui.selection;

    return (
        <header className="flex items-center gap-3 px-4 py-2 border-b border-slate-200 bg-white">
            <h1 className="text-sm font-bold text-slate-800">ShiftGrid</h1>
            <span className="text-[11px] text-slate-400">학교 행정 통합 스케줄러</span>

            <div className="flex items-center gap-1 ml-4">
                <Btn onClick={undo} disabled={!canUndo} title="되돌리기 (⌘Z)">↶ 되돌리기</Btn>
                <Btn onClick={redo} disabled={!canRedo} title="다시하기 (⌘⇧Z)">↷ 다시</Btn>
            </div>
            <div className="flex items-center gap-1">
                <Btn onClick={copy} disabled={!hasSel} title="복사 (⌘C)">복사</Btn>
                <Btn onClick={paste} disabled={!hasSel || !hasClipboard} title="붙여넣기 (⌘V)">붙여넣기</Btn>
                <Btn onClick={clear} disabled={!hasSel} title="지우기 (Del)">지우기</Btn>
            </div>

            <div className="flex items-center gap-1 ml-auto">
                <Btn onClick={() => setUI({ overlay: 'blackout' })} title="휴일·복무·수리 등 차단 관리">🚫 블랙아웃</Btn>
                <Btn onClick={() => setUI({ overlay: 'combined' })} title="전체 배치를 필터링해 조회">🔍 통합 조회</Btn>
            </div>
        </header>
    );
}
