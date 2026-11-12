/**
 * 도움말·처음 안내 상태 — 서랍(HelpDrawer)·환영 화면(Welcome)·코치마크(Tour)를 한 곳에서 여닫는다.
 * 화면 어디서나 useHelp() 로 「용어 자세히 보기」·「처음 안내 다시 보기」를 부를 수 있게 한다.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type HelpTab = 'screen' | 'glossary' | 'demos' | 'manual';

interface HelpValue {
    drawerOpen: boolean;
    drawerTab: HelpTab;
    focusTermId: string | undefined;   // 용어 탭에서 강조할 항목
    welcomeOpen: boolean;
    tourActive: boolean;
    openDrawer: (tab?: HelpTab, termId?: string) => void;
    closeDrawer: () => void;
    setDrawerTab: (tab: HelpTab) => void;
    openWelcome: () => void;
    closeWelcome: () => void;
    startTour: () => void;
    stopTour: () => void;
    /** 도움말에서 「처음 안내 다시 보기」 — 환영 화면부터 다시 */
    restartOnboarding: () => void;
}

const Ctx = createContext<HelpValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerTab, setDrawerTab] = useState<HelpTab>('screen');
    const [focusTermId, setFocusTermId] = useState<string | undefined>(undefined);
    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [tourActive, setTourActive] = useState(false);

    const openDrawer = useCallback((tab: HelpTab = 'screen', termId?: string) => {
        setDrawerTab(tab); setFocusTermId(termId); setDrawerOpen(true);
    }, []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);
    const openWelcome = useCallback(() => setWelcomeOpen(true), []);
    const closeWelcome = useCallback(() => setWelcomeOpen(false), []);
    const startTour = useCallback(() => { setWelcomeOpen(false); setDrawerOpen(false); setTourActive(true); }, []);
    const stopTour = useCallback(() => setTourActive(false), []);
    const restartOnboarding = useCallback(() => { setDrawerOpen(false); setTourActive(false); setWelcomeOpen(true); }, []);

    const value = useMemo<HelpValue>(() => ({
        drawerOpen, drawerTab, focusTermId, welcomeOpen, tourActive,
        openDrawer, closeDrawer, setDrawerTab, openWelcome, closeWelcome, startTour, stopTour, restartOnboarding,
    }), [drawerOpen, drawerTab, focusTermId, welcomeOpen, tourActive,
        openDrawer, closeDrawer, openWelcome, closeWelcome, startTour, stopTour, restartOnboarding]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHelp(): HelpValue {
    const v = useContext(Ctx);
    if (!v) throw new Error('useHelp 는 HelpProvider 안에서만');
    return v;
}
