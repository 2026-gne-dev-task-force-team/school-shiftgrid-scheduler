/**
 * useLauncherTab — 시작 화면(「새 페이지 / 만들어 둔 것」)이 서 있는 탭의 이름·아이콘.
 *   시작 화면은 노드가 아닌데 탭 제목이 직전 노드 이름(「페이지 2」)으로 남아 노드 탭처럼 보였다 → 「새 페이지」+「＋」로 바꾼다.
 *   노드가 열리면 NodeHeader 가 제목·아이콘을 다시 쓴다(같은 setLeafTitle 길).
 */
import { useEffect } from 'react';
import { setLeafGlyph, setLeafTitle } from './store';

export const LAUNCHER_GLYPH = '＋';

export function useLauncherTab(leafId: string | undefined, title: string): void {
    useEffect(() => {
        if (!leafId) return;
        setLeafTitle(leafId, title);
        setLeafGlyph(leafId, LAUNCHER_GLYPH);
    }, [leafId, title]);
}
