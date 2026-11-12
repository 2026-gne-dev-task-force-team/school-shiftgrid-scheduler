/**
 * 🔴 골든 — 실제 PLUGINS 셋의 「활성 순서 + onFirstRun open 호출 순서」를 리팩토링 **전에** 박는다.
 *
 * 왜(명세 M0 「각 단계에서 죽는 방식」): 의존 순서가 바뀌며 지금 넷(설정·탐색기·달력)의 첫 실행 배치가
 *   증발하는 사고(11-02 ad43f55)와 같은 뿌리다. 모듈·의존성(provides/requires/supports·위상 정렬)을
 *   얹기 전에 **지금 순서 그대로** 못 박아, 리팩토링이 배치를 흔들면 여기서 빨간불이 켜진다.
 *
 * ⭐ 재는 것 둘:
 *   ① 활성 순서 — 코어(settings·explorer) 먼저, 그 뒤 목록 순(calendar·account·people·sheet·timetable-grid). onActivate 가 도는 차례.
 *      🔴 꾸러미 전환(2026-11-08 「플러그인은 꾸러미다」): 약속(contract-*)을 꾸러미 안으로 묶어 별도 약속 플러그인 7개가 사라졌다 — 10꾸러미만 선다.
 *   ② onFirstRun 이 다리가 선 뒤에 여는 viewId 순서 — explorer.tree → calendar.month(작은 달력은 2026-11-09 비활성화).
 *      (account·people·sheet·timetable-grid 는 onFirstRun 자동 열기가 없어 여는 순서에 안 낀다.)
 * ⚠️ node 라 localStorage 가 없다 — first-run.test 와 같은 메모리 스텁(깨끗한 프로파일 = 첫 실행).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { activateAll, listPlugins, listPropertiesPanes } from '../pane-ui-system/plugin';
import { setWorkspaceBridge } from '../pane-ui-system/plugin';
import { PLUGINS } from './plugins';

// ── localStorage 스텁 (node 환경 · 깨끗한 프로파일) ──
const mem = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
            setItem: (k: string, v: string) => { mem.set(k, String(v)); },
            removeItem: (k: string) => { mem.delete(k); },
            clear: () => { mem.clear(); },
            key: (i: number) => [...mem.keys()][i] ?? null,
            get length() { return mem.size; },
        },
    });
}

function bridgeCollecting(into: string[]) {
    return { open: (viewId: string) => { into.push(viewId); return viewId; }, close: () => { }, setTitle: () => { } };
}

beforeEach(() => { setWorkspaceBridge(null); mem.clear(); });

describe('골든 — 실제 PLUGINS 활성·첫 실행 배치 순서(리팩토링 전 고정)', () => {
    it('셋 다 활성되고(실패 0) 끄지 않았다', () => {
        activateAll(PLUGINS);
        const ps = listPlugins();
        expect(ps.map((p) => p.id)).toEqual([
            // 🔴 P6b(2026-11-09): 층 순 — 플랫폼(코어 둘 먼저) → 범용 앱 → 학교 도메인. P2(2026-11-10): icon-pack-basic 이 코어가 돼 코어 묶음 끝으로 올라왔다. 순서를 바꾸려면 manifest.layer 와 PLUGINS 를 같이 고친다(plugins.test.ts).
            'settings', 'explorer', 'selection', 'properties', 'icon-pack-basic', 'page', 'collection', 'sheet',
            'calendar', 'account',
            'people', 'rooms', 'room-booking', 'substitute', 'school', 'subjects', 'staff', 'bell', 'duty', 'timetable-grid', 'ops-check', 'v1-editor',
        ]);
        expect(ps.every((p) => p.enabled)).toBe(true);
        expect(ps.some((p) => p.failed)).toBe(false);
        expect(ps.some((p) => p.blocked)).toBe(false);
    });

    it('onFirstRun 이 다리가 선 뒤 여는 순서: 탐색기 트리 → 속성 → 달력 월', () => {
        activateAll(PLUGINS);
        const opened: string[] = [];
        setWorkspaceBridge(bridgeCollecting(opened));
        // 자리가 left·right·center 로 달라 순서 바뀜은 화면에 영향 없다
        expect(opened).toEqual(['explorer.tree', 'properties.panel', 'calendar.month']);
    });
});

/**
 * 🔴 사람용 설명이 비지 않았다(쥔님 2026-11-08 「설명이 너무 부족」) — 등록된 모든 플러그인은
 *   목록 한 줄 요약(description)과 상세 「무엇을 하나」(about.what)를 반드시 가진다. 빈 문자열·공백만도 막는다.
 */
describe('모든 플러그인에 한 줄 요약(description)·상세(about.what)가 비어 있지 않다', () => {
    it('description·about.what 이 전부 채워져 있다', () => {
        activateAll(PLUGINS);
        const ps = listPlugins();
        for (const p of ps) {
            expect(p.description?.trim(), `${p.id} 의 한 줄 요약(description)이 비었다`).toBeTruthy();
            expect(p.about?.what?.trim(), `${p.id} 의 상세 설명(about.what)이 비었다`).toBeTruthy();
        }
    });
});

/**
 * 🔴 선언한 약속마다 사람 이름(label)이 있다(쥔님 2026-11-08 21:27 「이게 뭔지 모르겠다」) — 설정 「다른 플러그인과의 관계」가
 *   id(people·nodes) 대신 이 이름을 보여 준다. 빈 문자열·공백만도 막는다(영어 id 만으로 두지 않게).
 */
describe('선언한 약속마다 사람 이름(label)이 비어 있지 않다', () => {
    it('모든 contributes.interfaces 에 label 이 채워져 있다', () => {
        activateAll(PLUGINS);
        const ps = listPlugins();
        for (const p of ps) {
            for (const it of p.interfaces) {
                expect(it.label?.trim(), `${p.id} 의 약속 ‘${it.name}’ 에 사람 이름(label)이 없다`).toBeTruthy();
            }
        }
    });
});

describe('속성 칸 — 노드 타입마다 주인이 칸을 낸다', () => {
    it('페이지·구독·일정(날짜 패턴 — 쥔님 11-10)에 속성 칸이 있고, 비밀엔 없다 — 사람·방·레코드 행·사용자·역할은 「열기」 페이지로 연다(🙋 7 A · 속성 패널 없음)', () => {
        activateAll(PLUGINS);
        for (const type of ['page.page', 'calendar-subscribe.subscription', 'calendar.event']) {
            expect(listPropertiesPanes(type).length, `${type} 에 속성 칸이 없다`).toBeGreaterThan(0);
        }
        for (const type of ['people.person', 'rooms.room', 'substitute.staff', 'collection.row', 'account.user', 'account.role']) expect(listPropertiesPanes(type), `${type} 은 열기 페이지로 — 속성 패널 칸 없음`).toEqual([]);
        expect(listPropertiesPanes('account.secret')).toEqual([]);
        expect(listPropertiesPanes('account.cred-secret')).toEqual([]);
    });
});
