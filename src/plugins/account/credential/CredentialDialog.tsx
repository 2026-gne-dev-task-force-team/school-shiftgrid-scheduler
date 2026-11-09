/**
 * 증명 입력 다이얼로그(화면) — 증명 제공자가 「스스로 띄우는」 입력창. 🔴 색은 토큰 클래스로만(구조 검사 ①).
 *   dialog.ts 의 요청을 구독해, 요청이 뜨면 비밀번호를 받아 submit/cancel 로 닫는다.
 *   ⚠️ 전역 오버레이로 어디에 mount 하나는 호스트(앱) 몫 — 제공자는 이 부품을 낼 뿐이다(main 이 App 에 끼운다).
 */
import { useState, useSyncExternalStore } from 'react';
import { Button, Dialog, TextInput } from '../../../pane-ui-system';
import { subscribeDialog, getPending, submitDialog, cancelDialog } from './dialog';

export function CredentialDialog() {
    const pending = useSyncExternalStore(subscribeDialog, getPending, getPending);
    if (!pending) return null;
    // 🔴 요청이 바뀌면 key 로 다시 마운트해 입력을 비운다(useEffect 로 리셋하지 않는다 — 의존성 함정 회피).
    return <PasswordPrompt key={`${pending.methodId}:${pending.userId}`} />;
}

/** 공통 Dialog — 오버레이·Esc(층 줄)·초점 가두기·초기 초점·열고 닫는 전환을 그쪽이 맡는다. 바깥 클릭·Esc = 취소. */
function PasswordPrompt() {
    const [value, setValue] = useState('');
    return (
        <Dialog title="암호 확인" width={320} onClose={() => cancelDialog()}
            footer={(
                <>
                    <Button variant="ghost" size="md" onClick={() => cancelDialog()}>취소</Button>
                    <Button variant="accent" size="md" onClick={() => submitDialog(value)}>확인</Button>
                </>
            )}>
            <div className="flex flex-col gap-3">
                <p className="text-small text-muted">계속하려면 암호를 입력하세요.</p>
                <TextInput type="password" autoFocus aria-label="암호" autoComplete="off" value={value}
                    onChange={(e) => setValue(e.target.value)} onEnter={(v) => submitDialog(v)} />
            </div>
        </Dialog>
    );
}
