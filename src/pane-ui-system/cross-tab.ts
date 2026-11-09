/**
 * 탭 간 경고 — 같은 프로젝트(= 같은 DB)를 다른 탭이 썼다고 알린다. 🔴 동기화는 하지 않는다(경고만).
 *   쓰기 완료 때 announceWrite(id) 로 채널에 쏘고, 다른 탭이 같은 id 를 받으면 한 번만 알림을 띄운다.
 *   BroadcastChannel 이 없으면(옛 환경·node) 조용히 꺼진다.
 */
import { notify } from './plugin/notify';

let channel: BroadcastChannel | null = null;
let channelFor = '';
let warned = false;

function chan(projectId: string): BroadcastChannel | null {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (channel && channelFor === projectId) return channel;
    try { channel?.close(); } catch { /* 무시 */ }
    channelFor = projectId;
    channel = new BroadcastChannel('cross-tab:' + projectId);
    channel.onmessage = (ev: MessageEvent) => {
        if (ev.data?.projectId !== projectId || warned) return;
        warned = true;   // 반복 알림 한 번만
        notify('app', {
            level: 'warn', key: 'cross-tab-write', timeout: 0,
            title: '다른 탭에서 이 프로젝트가 바뀌었습니다 — 새로고침',
        });
    };
    return channel;
}

/** DB 를 열 때 한 번 — 수신을 시작한다. */
export function watchOtherTabs(projectId: string): void { chan(projectId); }

/** 쓰기가 끝났다고 다른 탭에 알린다. */
export function announceWrite(projectId: string): void {
    try { chan(projectId)?.postMessage({ projectId }); } catch { /* 경고용이라 실패해도 무시 */ }
}

export function __resetCrossTabForTest(): void {
    try { channel?.close(); } catch { /* 무시 */ }
    channel = null; channelFor = ''; warned = false;
}
