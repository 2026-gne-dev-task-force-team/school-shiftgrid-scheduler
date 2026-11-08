/**
 * 증명 입력 다이얼로그 제어 — 🔴 입력 화면은 증명 제공자가 **스스로** 띄운다(약속은 boolean 만 안다).
 *   한 번에 하나의 요청만 산다(모달). challenge 가 requestSecret 로 Promise 를 열고, 화면(CredentialDialog)이 submit/cancel 로 닫는다.
 *   🔴 ⛔ 입력값(비밀번호)은 이 파일 안에서만 산다 — 약속으로도, 노드로도 평문이 나가지 않는다(해시 비교는 core 가).
 *
 *   ⚠️ CredentialDialog(화면)를 어디에 띄우나(전역 오버레이 mount)는 호스트(앱) 몫이다 — 제공자는 다이얼로그 부품만 낸다.
 *      테스트는 core.setPrompt 로 이 다이얼로그를 건너뛴다(입력을 직접 넣는다).
 */
interface Pending {
    methodId: string;
    userId: string;
    resolve: (value: string | null) => void;
}

let pending: Pending | null = null;
const subs = new Set<() => void>();

function notify(): void { for (const s of subs) s(); }

export function subscribeDialog(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; }
export function getPending(): { methodId: string; userId: string } | null {
    return pending ? { methodId: pending.methodId, userId: pending.userId } : null;
}

/** 비밀번호를 물어보는 Promise 를 연다 — 화면이 submit/cancel 로 닫는다(없으면 영영 대기하지 않게 호스트가 다이얼로그를 띄워야 한다). */
export function requestSecret(methodId: string, userId: string): Promise<string | null> {
    // 이미 떠 있는 요청이 있으면 그걸 취소하고 새로(모달 하나).
    pending?.resolve(null);
    return new Promise<string | null>((resolve) => {
        pending = { methodId, userId, resolve: (v) => { pending = null; notify(); resolve(v); } };
        notify();
    });
}
export function submitDialog(value: string): void { pending?.resolve(value); }
export function cancelDialog(): void { pending?.resolve(null); }
