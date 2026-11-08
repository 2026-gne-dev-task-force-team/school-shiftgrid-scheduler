/**
 * 구독 노드 — 「구독도 노드로」(쥔님 2026-11-08). 탐색기에 보이는 노드로서:
 *   · 보이는 타입(record 아님) + 「새로 만들기」 후보 · 만들 때 인라인 링크 입력(createInput) · 열면 달력 탭(open)
 *   · 우클릭 메뉴(새로고침·파일로 갱신·링크 바꾸기·켜기/끄기) · 끄기→달력에서 빠짐
 *   · 휴지통→사라짐·복원→돌아옴 · 이름바꾸기→출처 라벨 · 옛 record 구독 데이터 유실 0
 * (테스트는 구조 검사 walk 가 건너뛰므로 real 탐색기 스토어·real 달력 feed 를 직접 import 해 끝단을 잰다.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PluginHost, PluginImpl } from '../../../pane-ui-system/plugin';

const kv = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();
    const nodesGetAll = vi.fn(async (): Promise<unknown[] | null> => [...store.values()]);
    const nodesWrite = vi.fn(async (b: { put?: Record<string, unknown>[]; del?: string[]; clear?: boolean }): Promise<boolean> => {
        if (b.clear) store.clear();
        for (const v of b.put ?? []) store.set(v.id as string, v);
        for (const id of b.del ?? []) store.delete(id);
        return true;
    });
    return { store, nodesGetAll, nodesWrite };
});
vi.mock('../../../pane-ui-system/kv', () => ({ nodesGetAll: kv.nodesGetAll, nodesWrite: kv.nodesWrite }));

import { initStore, select, restoreSelected, newNode, getState, commitRename } from '../../project-explorer/store';
import { __resetPersistForTest } from '../../project-explorer/persist';
import { makeNodesApi } from '../../project-explorer/api';
import { registerType, clearTypes, isRecordType, createCandidates, getType } from '../../project-explorer/model/types';
import { clearDerived } from '../../project-explorer/model/derive';
import { calendarModule, listFeedSources, __resetFeeds } from '../feed';
import { SUB_TYPE, initSubs, listSubs, addSub, updateSub, removeSub, getSubById, getSubsApi, renameSub } from './subscriptions';
import { setCalendar, reconcile, disposeAll, refresh, registeredCount } from './controller';
import { subscribeNodeTypes, subscribeNodeTypeImpl, applyLink } from './nodes';
import type { FetchResult } from './fetch';

function host(): PluginHost {
    return {
        storage: { get: <T,>(_k: string, f: T) => f, set: () => {}, remove: () => {} },
        store: { get: async <T,>(_k: string, f: T) => f, set: async () => true, del: async () => {}, available: async () => true, estimate: async () => null },
        commands: { run: () => {} },
    } as unknown as PluginHost;
}

const ICS = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN',
    'BEGIN:VEVENT', 'UID:h1', 'DTSTART;VALUE=DATE:20260101', 'DTEND;VALUE=DATE:20260102', 'SUMMARY:신정', 'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');
const okFetch = async (): Promise<FetchResult> => ({ ok: true, text: ICS });

let bridge: { dispose(): void } | null = null;

beforeEach(async () => {
    kv.store.clear();
    clearTypes(); clearDerived(); __resetPersistForTest(); __resetFeeds();
    await initStore(host());
    registerType({ type: 'folder', label: '폴더', icon: 'folder', container: true, create: { label: '폴더' } });
    const api = makeNodesApi('calendar-subscribe');
    // real 구독 노드 타입(record:false · createInput · open · menu · onInput)을 그대로 꽂는다.
    api.registerContributed(subscribeNodeTypes[0], { nodeTypes: subscribeNodeTypeImpl } as PluginImpl, host());
    bridge = initSubs(api);
    setCalendar(calendarModule);
});
afterEach(() => { bridge?.dispose(); bridge = null; disposeAll(); __resetFeeds(); __resetPersistForTest(); });

describe('보이는 노드 타입', () => {
    it('record 가 아니다(탐색기에 보인다)', () => {
        expect(isRecordType(SUB_TYPE)).toBe(false);
    });
    it('폴더 밑 「새로 만들기」 후보다', () => {
        expect(createCandidates('folder').map((d) => d.type)).toContain(SUB_TYPE);
    });
});

describe('새로 만들기 → 인라인 링크 입력(createInput)', () => {
    it('만들면 이름칸 자리에 「값 입력」(kind:create)이 뜨고, data.url 은 아직 비어 있다', () => {
        newNode(SUB_TYPE);
        const s = getState();
        expect(s.renamingId).toBeTruthy();
        expect(s.renameKind).toBe('create');
        const node = s.tree.nodes[s.renamingId!];
        expect(node.type).toBe(SUB_TYPE);
        expect((node.data as { url: string }).url).toBe('');
    });

    it('링크를 커밋하면 url 이 저장되고 이름이 호스트명으로 바뀐다(onInput)', () => {
        newNode(SUB_TYPE);
        const id = getState().renamingId!;
        commitRename('webcal://example.com/holidays.ics');   // onInput(kind:create) → applyLink
        const sub = getSubById(id)!;
        expect(sub.data.url).toBe('https://example.com/holidays.ics');   // webcal→https
        expect(sub.name).toBe('example.com');                            // 호스트명으로 이름
        expect(getState().renamingId).toBeNull();                        // 입력 닫힘
    });

    it('빈 값으로 커밋하면 갓 만든 빈 구독을 거둔다(휴지통)', () => {
        newNode(SUB_TYPE);
        const id = getState().renamingId!;
        commitRename('   ');
        expect(listSubs().some((s) => s.id === id)).toBe(false);
    });
});

describe('받기 — applyLink 가 lastIcs 를 채운다(주입 fetcher)', () => {
    it('링크를 넣으면 받아서 lastIcs 가 찬다', async () => {
        const id = addSub('공휴일', 'https://x/y.ics', 'warn');
        updateSub(id, { url: '' });
        applyLink(id, 'link', 'https://x/y.ics', okFetch);
        await refresh(id, okFetch);   // applyLink 의 플로팅 받기를 확정적으로 다시 — lastIcs 확인
        expect(getSubById(id)!.data.lastIcs).toBe(ICS);
    });
});

describe('메뉴 — 새로고침·파일로 갱신·링크 바꾸기·켜기/끄기', () => {
    it('항목 넷을 commandId 로 낸다', () => {
        const id = addSub('공휴일', 'https://x/y.ics');
        const entries = getType(SUB_TYPE)!.menu!(id);
        expect(entries.map((e) => (e as { commandId?: string }).commandId)).toEqual([
            'calendar-subscribe.refresh',
            'calendar-subscribe.from-file',
            'calendar-subscribe.change-link',
            'calendar-subscribe.toggle',
        ]);
    });
    it('토글 라벨은 켜짐 여부를 비춘다(끄기 ↔ 켜기)', () => {
        const id = addSub('공휴일', 'https://x/y.ics');
        expect((getType(SUB_TYPE)!.menu!(id)[3] as { label: string }).label).toBe('끄기');
        updateSub(id, { enabled: false });
        expect((getType(SUB_TYPE)!.menu!(id)[3] as { label: string }).label).toBe('켜기');
    });
});

describe('끄기 → 달력에서 빠짐', () => {
    it('끄면 달력 출처가 빠지고, 켜면 돌아온다', () => {
        const id = addSub('공휴일', 'https://x/y.ics', 'warn');
        updateSub(id, { lastIcs: ICS });
        reconcile();
        expect(registeredCount()).toBe(1);
        updateSub(id, { enabled: false });
        reconcile();
        expect(registeredCount()).toBe(0);
        updateSub(id, { enabled: true });
        reconcile();
        expect(registeredCount()).toBe(1);
    });
});

describe('새로고침 → lastIcs 갱신(주입 fetcher)', () => {
    it('성공하면 lastIcs 가 새 내용으로', async () => {
        const id = addSub('공휴일', 'https://x/y.ics');
        updateSub(id, { lastIcs: 'OLD' });
        await refresh(id, okFetch);
        expect(getSubById(id)!.data.lastIcs).toBe(ICS);
    });
});

describe('휴지통 → 사라짐 · 복원 → 돌아옴', () => {
    it('지우면 달력에서 사라지고, 복원하면 돌아온다', () => {
        const id = addSub('공휴일', 'https://x/y.ics', 'warn');
        updateSub(id, { lastIcs: ICS });
        reconcile();
        expect(registeredCount()).toBe(1);

        removeSub(id);                       // 휴지통으로
        reconcile();
        expect(listSubs().some((s) => s.id === id)).toBe(false);
        expect(registeredCount()).toBe(0);

        select(id); restoreSelected();       // 복원
        reconcile();
        expect(listSubs().some((s) => s.id === id)).toBe(true);
        expect(registeredCount()).toBe(1);
        // 데이터 유실 0 — 복원해도 캐시·색 그대로
        expect(getSubById(id)!.data.lastIcs).toBe(ICS);
        expect(getSubById(id)!.data.color).toBe('warn');
    });
});

describe('이름 바꾸기 → 출처 라벨', () => {
    it('노드 이름을 바꾸면 달력 출처 라벨이 따라온다', () => {
        const id = addSub('공휴일', 'https://x/y.ics', 'warn');
        updateSub(id, { lastIcs: ICS });
        reconcile();
        expect(listFeedSources()[0].source.label).toBe('공휴일');
        renameSub(id, '대한민국 공휴일');
        reconcile();
        expect(listFeedSources()[0].source.label).toBe('대한민국 공휴일');
    });
});

describe('옛 record 구독 데이터 유실 0', () => {
    it('record 시절 data 모양(data.name 포함)을 그대로 읽고 보인다', () => {
        // 옛 숨은 구독이 이미 깔려 있는 프로젝트 — 같은 타입 노드를 옛 data 모양으로 심는다.
        const api = getSubsApi()!;
        const oldId = api.create(api.roots.main, {
            type: SUB_TYPE,
            name: '옛 공휴일',
            data: { name: '옛 공휴일', url: 'https://old/h.ics', color: 'ok', enabled: true, lastIcs: ICS },
        });
        reconcile();
        // 이제 보이는 노드다(record 아님) · data 는 한 글자도 안 건드렸다
        const sub = getSubById(oldId)!;
        expect(sub.data.url).toBe('https://old/h.ics');
        expect(sub.data.lastIcs).toBe(ICS);
        expect(sub.data.color).toBe('ok');
        // 라벨은 노드 이름(옛 data.name 이 아니라 node.name — 둘이 같게 심었다)
        expect(listFeedSources().map((e) => e.source.label)).toContain('옛 공휴일');
        expect(registeredCount()).toBe(1);
    });
});
