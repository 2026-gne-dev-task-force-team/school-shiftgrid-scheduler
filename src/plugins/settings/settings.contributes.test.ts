/**
 * settings 플러그인 선언형 전환 증명(D1) — 가짜 호스트로 켜면 contributes 로 꽂힌 섹션·항목이
 *   옛 호출형(host.settings.addSection/addItem)이 내던 것과 같은 집합·같은 순서인가.
 *
 * ⭐ 「옛 결과」는 전환 전 index.ts 의 onActivate 가 만들던 골든 구조다(아래 EXPECTED):
 *   섹션 순서 모양→창틀→플러그인→정보, 창틀 안 패널→리본. 전환 뒤에도 listSettings 가 같은 걸 내야 한다.
 *
 * 🔴 모듈 전역 스토어·뷰 레지스트리라 다른 테스트와 안 번지게 뒤에 비운다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getView, clearViews } from '../../pane-ui-system/view-registry';
import { activateAll, listPlugins } from '../../pane-ui-system/plugin/registry';
import { listSettings } from '../../pane-ui-system/plugin/store';
import { disposeOwner } from '../../pane-ui-system/plugin/store';
import { settingsPlugin } from './index';

// 전환 전 onActivate 가 만들던 골든 구조 — 섹션 id·제목·순서 + 섹션별 항목 id·순서.
const EXPECTED = [
    { id: 'appearance', title: '모양', items: ['theme'] },
    { id: 'frame', title: '창틀', items: ['pane', 'ribbon', 'startup', 'notify', 'keys'] },
    { id: 'plugins', title: '플러그인', items: ['plugins'] },
    { id: 'about', title: '정보', items: ['about'] },
];

afterEach(() => {
    disposeOwner('settings');
    clearViews();
});

describe('settings 선언형 전환 — contributes 가 옛 호출형과 같은 설정 집합을 낸다', () => {
    it('섹션·항목·순서·제목이 골든과 같고, 활성 실패가 아니며, 설정 뷰가 꽂힌다', () => {
        activateAll([settingsPlugin]);

        // 활성 실패 아님(이름 어긋남 없음)
        expect(listPlugins().find((p) => p.id === 'settings')?.failed, '활성 실패 아님').toBe(false);

        // 설정 섹션·항목이 골든과 글자 단위로 같다(순서 포함)
        const got = listSettings().map((s) => ({
            id: s.id, title: s.title, items: s.items.map((i) => i.id),
        }));
        expect(got).toEqual(EXPECTED);

        // 설정 화면 뷰가 접두사 붙어 꽂힌다(settings.main)
        expect(getView('settings.main'), '설정 뷰 등록').toBeTruthy();
    });
});
