/** 앱 전체 레이아웃 — 상단 툴바 · 좌 탐색기 · 가운데 편집 · 우 검증 (+ 오버레이) */
import { useStore } from '../../store/store';
import Toolbar from './Toolbar';
import LeftPanel from './LeftPanel';
import GridEditor from './GridEditor';
import RightPanel from './RightPanel';
import CombinedView from './CombinedView';
import BlackoutManager from './BlackoutManager';

export default function Shell() {
    const { ui, doc } = useStore();
    const track = doc.tracks.find((t) => t.id === ui.selectedTrackId);

    return (
        <div className="h-screen flex flex-col bg-white text-slate-800">
            <Toolbar />
            {track && (
                <div className="px-4 py-1.5 border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                    편집 중: <span className="font-semibold text-slate-700">{track.name}</span>
                </div>
            )}
            <div className="flex flex-1 overflow-hidden">
                <LeftPanel />
                <GridEditor />
                <RightPanel />
            </div>
            {ui.overlay === 'combined' && <CombinedView />}
            {ui.overlay === 'blackout' && <BlackoutManager />}
        </div>
    );
}
