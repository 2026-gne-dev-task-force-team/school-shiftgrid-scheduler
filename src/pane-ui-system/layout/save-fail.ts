/**
 * 화면 설정(localStorage) 저장 실패 알림 — 조용히 삼키지 않고 한 번만 알린다(같은 label 은 세션당 1회).
 *   🔴 notify 가 pane-settings 를 import 하므로 정적 import 하면 순환 — 실패 때만 동적으로 부른다.
 */
const told = new Set<string>();

export function reportSettingsSaveFail(label: string, err?: unknown): void {
    if (told.has(label)) return;
    told.add(label);
    void import('../plugin/notify').then(({ notify }) => {
        notify('frame', {
            level: 'error', title: '화면 설정 저장 실패',
            body: `${label}을(를) 저장하지 못했습니다 — 새로고침하면 바뀐 설정이 돌아갈 수 있습니다`,
            key: `settings-save:${label}`,
        });
    }).catch(() => { /* 알림 실패는 되먹이지 않는다 */ });
    void err;
}

/** 테스트 전용 */
export function __resetSettingsSaveFailForTest(): void { told.clear(); }
