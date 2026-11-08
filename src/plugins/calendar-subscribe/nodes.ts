/**
 * 구독 ↔ 노드 타입 — 구독 하나를 **탐색기에 보이는 노드**로 선언한다(쥔님 2026-11-08: "구독도 노드로 해주지").
 *   본보기는 달력의 저장소 노드(calendar/nodes.ts·index.ts 의 nodeTypes·create·menu·open) — 같은 관례로.
 *   🔴 옛 판은 record(탐색기에 안 보임) + 설정 판에서만 관리였다. 이번에 record 를 풀어 보이는 노드로 바꿨다:
 *      같은 타입 이름(SUB_TYPE)을 그대로 쓰며 record 만 풀었다 → 이미 깔린 숨은 구독도 그 자리에서 보이게 되고
 *      data(링크·색·lastIcs·켜짐)는 한 글자도 안 건드린다(데이터 유실 0). 아래가 그 「선언·동작」 자리다.
 *
 * ⛔ 탐색기 인라인 입력은 「만들 때 링크」·「링크 바꾸기」 둘 다 탐색기가 쥔다(NodeTypeDef.createInput·NodesApi.promptInput)
 *    — window.prompt/confirm 없이, 한글 조합 Enter 도 탐색기 입력이 이미 가린다(isComposing||keyCode===229).
 */
import type { NodeTypeContribution, PluginHost, MenuEntry } from '../../pane-ui-system/plugin';
import type { NodeTypeImplFns } from '../project-explorer/contracts/nodes';
import { normalizeUrl } from './model';
import { SUB_TYPE, getSubsApi, getSubById, updateSub, removeSub } from './subscriptions';
import { refresh } from './controller';
import { fetchIcs, type FetchResult } from './fetch';

export { SUB_TYPE };

// ── 우클릭 메뉴가 가리킨 구독 — menu(host,id) 가 그릴 때 잡아 둔다(달력 nodes.ts setMenuTarget 과 같은 결). ──
//    🔴 ContextMenu 는 commandId 만 넘기고 인자를 안 싣는다 → 명령(새로고침·끄기·링크 바꾸기·파일로 갱신)이 이 대상을 쓴다.
let menuTargetId: string | null = null;
export function setMenuTarget(id: string): void { menuTargetId = id; }
export function getMenuTarget(): string | null { return menuTargetId; }

/** 링크에서 기본 이름을 뽑는다(호스트명) — 못 뽑으면 '구독 캘린더'. 생성 때 한 번 쓰고, 이후엔 노드 이름바꾸기가 쥔다. */
function deriveLabel(url: string): string {
    try { return new URL(url).hostname || '구독 캘린더'; } catch { return '구독 캘린더'; }
}

/**
 * 인라인 입력이 커밋한 링크를 구독에 반영 — 생성(kind:'create')·링크 바꾸기(kind:'link') 공용.
 *   · 빈 값: 생성이면 갓 만든 빈 노드를 거둔다(휴지통) · 링크 바꾸기면 그대로 둔다.
 *   · 링크: url 저장(생성이면 이름도 호스트명으로) → 받기(fetch) → lastIcs 갱신 → 달력 다시 그림.
 *   🔴 fetcher 주입 가능(테스트) · 받기는 브라우저 네트워크에서만 실제로 돈다(막히면 lastError + 「파일로 갱신」 안내).
 */
export function applyLink(id: string, kind: string, value: string, fetcher: (url: string) => Promise<FetchResult> = fetchIcs): void {
    const v = value.trim();
    if (!v) { if (kind === 'create') removeSub(id); return; }
    const url = normalizeUrl(v);
    updateSub(id, { url });
    if (kind === 'create') getSubsApi()?.rename(id, deriveLabel(url));
    void refresh(id, fetcher);
}

/** 구독 노드 우클릭 메뉴 — 새로고침·파일로 갱신·링크 바꾸기·켜기/끄기. 지우기는 노드 시스템 휴지통 그대로(탐색기가 붙인다). */
function subMenu(id: string): MenuEntry[] {
    setMenuTarget(id);
    const enabled = getSubById(id)?.data.enabled ?? true;
    return [
        { label: '새로고침', icon: 'redo', commandId: 'calendar-subscribe.refresh' },
        { label: '파일로 갱신(.ics)', icon: 'upload', commandId: 'calendar-subscribe.from-file' },
        { label: '링크 바꾸기', icon: 'edit', commandId: 'calendar-subscribe.change-link' },
        { label: enabled ? '끄기' : '켜기', icon: enabled ? 'eyeOff' : 'eye', commandId: 'calendar-subscribe.toggle' },
    ];
}

/**
 * 타입 하나를 contributes.nodeTypes 로 적는다 — 보이는 노드(record 없음) · 만들 때 링크 입력(createInput) · 열면 달력 탭.
 *   create.under: 폴더 밑(루트 포함 — 루트도 folder 타입). 달력 저장소와 같은 자리(폴더 아래 등).
 *   함수(open·menu·createInit·onInput)는 impl 'sub' 가 가리킨다.
 */
export const subscribeNodeTypes: NodeTypeContribution<'sub'>[] = [
    {
        type: SUB_TYPE, label: '구독 캘린더', icon: 'calendar',
        openable: true,
        create: { label: '구독 캘린더', under: ['folder'] },
        createInput: { placeholder: '구독할 달력 링크(.ics · https:// 또는 webcal://)' },
        impl: 'sub',
    },
];

/**
 * 🔴 노드 타입 함수 묶음 — contributes.nodeTypes 의 impl 'sub' 가 가리킨다(레지스트라가 host 를 꽂아 NodeTypeDef 로 조립).
 *   · open — 열면 달력 탭(구독 일정은 달력 위에 겹쳐 그려진다) · menu — 우클릭 항목 넷.
 *   · createInit — 갓 만든 구독의 초기 data(켜짐 · 링크는 곧 인라인 입력으로 채운다) · 이름은 입력 전까지 '구독 캘린더'.
 *   · onInput — 인라인 입력(생성·링크 바꾸기)의 커밋값을 링크로 반영.
 */
export const subscribeNodeTypeImpl = {
    sub: {
        open: (host: PluginHost, _id: string) => { host.commands.run('calendar.open'); },
        menu: (_host: PluginHost, id: string) => subMenu(id),
        createInit: () => ({ name: '구독 캘린더', data: { url: '', enabled: true } }),
        onInput: (_host: PluginHost, id: string, kind: string, value: string) => applyLink(id, kind, value),
    } satisfies NodeTypeImplFns,
};
