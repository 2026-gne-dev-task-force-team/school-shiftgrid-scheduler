/**
 * 증명 입력 다이얼로그(화면) — 증명 제공자가 「스스로 띄우는」 입력창. 🔴 색은 토큰 클래스로만(구조 검사 ①).
 *   dialog.ts 의 요청을 구독해, 요청이 뜨면 비밀번호를 받아 submit/cancel 로 닫는다.
 *   ⚠️ 전역 오버레이로 어디에 mount 하나는 호스트(앱) 몫 — 제공자는 이 부품을 낼 뿐이다(main 이 App 에 끼운다).
 */
import { useState, useSyncExternalStore } from 'react';
import { Button } from '../../pane-ui-system';
import { subscribeDialog, getPending, submitDialog, cancelDialog } from './dialog';

export function CredentialDialog() {
    const pending = useSyncExternalStore(subscribeDialog, getPending, getPending);
    if (!pending) return null;
    // 🔴 요청이 바뀌면 key 로 다시 마운트해 입력을 비운다(useEffect 로 리셋하지 않는다 — 의존성 함정 회피).
    return <PasswordPrompt key={`${pending.methodId}:${pending.userId}`} />;
}

function PasswordPrompt() {
    const [value, setValue] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/30" onClick={() => cancelDialog()}>
            <div className="w-[320px] rounded-lg border border-line bg-panel p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-[14px] font-semibold text-text">암호 확인</h3>
                <p className="text-[12px] text-muted">계속하려면 암호를 입력하세요.</p>
                <input
                    type="password"
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitDialog(value); if (e.key === 'Escape') cancelDialog(); }}
                    className="rounded border border-line bg-side text-text px-2 py-1 text-[13px]"
                />
                <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="md" onClick={() => cancelDialog()}>취소</Button>
                    <Button variant="accent" size="md" onClick={() => submitDialog(value)}>확인</Button>
                </div>
            </div>
        </div>
    );
}
