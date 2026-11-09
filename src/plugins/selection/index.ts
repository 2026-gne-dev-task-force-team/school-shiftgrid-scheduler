/**
 * 선택 알림 플러그인 — selection 약속을 들고 와 채운다(화면 없음). 마지막 하나만 쥔다.
 */
import { definePlugin } from '../../pane-ui-system/plugin';
import { manifest } from './manifest';
import type { SelectionApi, SelectionTarget } from './contracts/selection';

let current: SelectionTarget | null = null;
const listeners = new Set<() => void>();

export const selectionApi: SelectionApi = {
    set(target) {
        if (current?.type === target?.type && current?.id === target?.id) return;   // 같은 것 재알림은 조용히
        current = target;
        for (const l of listeners) l();
    },
    get: () => current,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export const selectionPlugin = definePlugin({
    manifest: {
        ...manifest,
        provides: { selection: '0.1.0' },
        contributes: {
            interfaces: [{ name: 'selection', version: '0.1.0', label: '선택 알림', desc: '지금 고른 것' }],
        },
    },
    modules: { selection: selectionApi },
    // 꺼지면 쥔 것을 놓는다(다시 켜면 빈 채로 시작).
    deactivate() { current = null; for (const l of listeners) l(); },
});

export default selectionPlugin;
