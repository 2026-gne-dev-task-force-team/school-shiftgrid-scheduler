/**
 * 렌더 오류 방어벽 — 개별 뷰(ViewErrorBoundary)와 최상위 창틀(RootErrorBoundary) 두 겹으로 하얀 빈 화면을 막는다.
 *
 * 🔴 ⛔ 도메인 낱말 0(구조 검사 ⑤) · 하드코딩 색 0(구조 검사 ①).
 *   ① ViewErrorBoundary — 탭/패널 하나가 깨진 저장값이나 예기치 못한 데이터로 던져도 그 칸만 안내 카드로 바꾸고
 *      나머지 작업대(사이드바·리본·설정·다른 탭)는 그대로 살린다.
 *   ② RootErrorBoundary — 최상위 렌더가 터지면 먼저 기기 배치 저장값(workspace·layout·pane·view-overrides·ribbon)과
 *      첫 실행 플래그를 한 번 자동으로 비워 자가 복구를 시도한다(사용자 자료인 IndexedDB 노드는 건드리지 않는다).
 *      그래도 또 터지면 개발자도구(F12) 없이 버튼 하나로 화면 설정·서비스워커 캐시를 초기화하고 새로 여는 복구 화면을 띄운다.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { storageKey } from '../../storage';
import { FOCUS_RING } from '../../primitives/focus';
import { Icon } from '../../primitives/Icon';
import { ConfirmDialog } from '../../primitives/ConfirmDialog';
import { resetPaneSettings } from '../../layout/pane-settings';
import { clearWorkspace } from '../../layout/workspace-store';
import { layoutKey } from '../../layout/panels';
import { resetFirstRunFlags } from '../../plugin/host';
import { notify } from '../../plugin/notify';

const AUTO_HEAL_SESSION_KEY = () => storageKey('auto-healed-once');

/** 기기별 화면·배치 localStorage 만 깨끗이 초기화한다(IndexedDB 프로젝트 노드 자료는 보존). */
export function healLayoutStorage(): void {
    try {
        clearWorkspace();   // 🔴 이 탭(sessionStorage)과 마지막 배치(localStorage) 둘 다 — 한쪽만 지우면 깨진 배치가 다시 실린다
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(layoutKey());
            localStorage.removeItem(storageKey('plugins'));
        }
        resetPaneSettings();
        resetFirstRunFlags();
    } catch { /* 조용히 */ }
}

interface ViewBoundaryProps {
    resetKey?: string;
    surface?: string;
    children: ReactNode;
}
interface ViewBoundaryState {
    error: Error | null;
}

export class ViewErrorBoundary extends Component<ViewBoundaryProps, ViewBoundaryState> {
    state: ViewBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ViewBoundaryState {
        return { error };
    }

    componentDidUpdate(prevProps: ViewBoundaryProps): void {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[pane-ui] 뷰 렌더 오류 격리:', error, info.componentStack);
        notify('frame', { level: 'error', title: '화면 오류', body: error.message, key: 'frame.view-error' });
    }

    render(): ReactNode {
        if (!this.state.error) return this.props.children;
        const surface = this.props.surface ?? 'bg-bg';
        return (
            <div className={`flex-1 min-h-0 grid place-items-center ${surface} overflow-hidden px-8 py-6 text-center`}>
                <div className="flex flex-col items-center gap-3 max-w-[22rem]">
                    <Icon name="warn" size={28} className="text-warn/70" />
                    <p className="text-[13px] text-text leading-relaxed">
                        이 화면을 표시하는 중 문제가 생겼습니다.
                    </p>
                    <p className="text-[11px] text-muted leading-relaxed break-all">
                        {this.state.error.message || '알 수 없는 오류'}
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ error: null })}
                        className={`h-btn px-3 rounded border border-accent text-[12px] text-text bg-text/[0.06]
                            hover:bg-text/[0.1] transition-colors ${FOCUS_RING}`}
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }
}

interface RootBoundaryState {
    error: Error | null;
    autoHealed: boolean;
    confirmReset: boolean;
}

export class RootErrorBoundary extends Component<{ children: ReactNode }, RootBoundaryState> {
    state: RootBoundaryState = { error: null, autoHealed: false, confirmReset: false };

    static getDerivedStateFromError(error: Error): Partial<RootBoundaryState> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[pane-ui] 최상위 렌더 오류 감지:', error, info.componentStack);
        // 🔴 1차 자동 복구 — 세션당 한 번은 사용자 개입 없이 깨진 배치 저장값을 정리하고 즉시 다시 그린다.
        try {
            const key = AUTO_HEAL_SESSION_KEY();
            const alreadyTried = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) === '1';
            if (!alreadyTried && !this.state.autoHealed) {
                if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
                healLayoutStorage();
                this.setState({ error: null, autoHealed: true });
            }
        } catch { /* sessionStorage 차단 환경이면 수동 복구 카드 표시 */ }
    }

    private handleManualReset = async (): Promise<void> => {
        healLayoutStorage();
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(AUTO_HEAL_SESSION_KEY());
            if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
            }
        } catch { /* 조용히 */ }
        if (typeof window !== 'undefined') window.location.reload();
    };

    render(): ReactNode {
        if (!this.state.error) return this.props.children;
        return (
            <div className="h-full w-full grid place-items-center bg-bg text-text px-6 py-8 text-center">
                <div className="flex flex-col items-center gap-4 max-w-[24rem] p-6 rounded border border-line bg-panel">
                    <Icon name="warn" size={32} className="text-warn/80" />
                    <p className="text-[14px] font-medium text-text leading-relaxed">
                        화면 구성을 불러오는 중 문제가 생겼습니다.
                    </p>
                    <p className="text-[12px] text-muted leading-relaxed">
                        이전 버전의 화면 배치나 캐시가 충돌했을 수 있습니다. 아래 단추를 누르면 저장된 자료는 유지한 채 화면 배치만 초기화하고 다시 엽니다.
                    </p>
                    <button
                        type="button"
                        onClick={() => this.setState({ confirmReset: true })}
                        className={`h-btn px-4 rounded border border-accent text-[13px] text-text bg-text/[0.06]
                            hover:bg-text/[0.12] transition-colors ${FOCUS_RING}`}
                    >
                        화면 배치 초기화 후 다시 열기
                    </button>
                    {this.state.confirmReset && (
                        <ConfirmDialog title="화면 배치를 초기화할까요?" confirmLabel="초기화" danger
                            onConfirm={() => { this.setState({ confirmReset: false }); void this.handleManualReset(); }}
                            onCancel={() => this.setState({ confirmReset: false })}>
                            화면 배치·캐시가 초기화되고 다시 열립니다. 저장된 자료는 유지됩니다.
                        </ConfirmDialog>
                    )}
                </div>
            </div>
        );
    }
}
