/**
 * 설정 화면 「크롬」 창구 — 🔴 설정 Pane 들이 바깥 설정 화면에 손을 뻗는 길(피크 띄우기·다른 섹션으로 가기).
 *   ⭐ Pane 은 무프롭(ComponentType)으로 등록되므로, 이 컨텍스트로 받는다(SettingsScreen 이 공급).
 *   쥔님 2026-11-01 13:42: *"플러그인 누르면 플러그인 상세 나오고 … 설정 가기"* — 상세는 피크로, 「설정 가기」는 섹션 전환.
 */
import { createContext, useContext } from 'react';
import type { PeekHandle } from '../..';

export interface SettingsChrome {
    /** 이 설정 뷰(탭) 안에서 피크를 띄우는 손잡이 — 없으면(좁은 화면 등) null */
    peek: PeekHandle | null;
    /** 왼쪽 메뉴에서 그 설정 항목(id)으로 간다 — 「설정 가기」 단추가 쓴다 */
    goToItem: (itemId: string) => void;
}

export const SettingsChromeContext = createContext<SettingsChrome>({
    peek: null,
    goToItem: () => { /* 공급자 밖 — 아무 일 없음 */ },
});

export function useSettingsChrome(): SettingsChrome {
    return useContext(SettingsChromeContext);
}
