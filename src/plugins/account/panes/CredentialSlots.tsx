/**
 * 자격증명 슬롯 — 사용자 레코드 페이지 아래(P4d A3 · 쥔님 2026-11-09 「슬롯을 미리 깔고 첫 슬롯은 비밀번호로」).
 *   슬롯 = 증명 방법 하나(methods 목록이 늘면 슬롯도 는다). 오늘은 「비밀번호」 하나 — 바로 걸 수 있다.
 *   🔴 입력값은 이 화면 안에서만 산다 → setSecret 이 해시로 바꿔 싣는다(평문 0). 걸고 빼기는 마스터·증명된 본인만(canManageCredential).
 */
import { useState } from 'react';
import { Button, TextInput } from '../../../pane-ui-system';
import { canManageCredential } from '../core';
import { setSecret, clearSecret, hasUserSecret, PASSWORD_METHOD } from '../credential';
import { useAccountVersion } from './useAccount';

export function CredentialSlots({ userId }: { userId: string }) {
    useAccountVersion();   // 비밀 노드가 바뀌면 상태 글을 다시 센다
    const manage = canManageCredential(userId);
    return (
        <section className="flex flex-col gap-1 px-2" data-credential-slots>
            <h4 className="text-small text-muted">자격증명</h4>
            <PasswordSlot userId={userId} manage={manage} />
            {!manage && <p className="text-note text-muted">마스터나 증명된 본인만 걸고 뺄 수 있습니다.</p>}
        </section>
    );
}

function PasswordSlot({ userId, manage }: { userId: string; manage: boolean }) {
    const has = hasUserSecret(userId);
    const [editing, setEditing] = useState(false);
    const [pw, setPw] = useState('');
    const save = async () => {
        if (!pw) return;
        await setSecret(userId, pw);
        setPw(''); setEditing(false);
    };
    const cancel = () => { setPw(''); setEditing(false); };
    return (
        <div className="flex flex-wrap items-center gap-2 py-1" data-slot={PASSWORD_METHOD.id}>
            <span className="w-32 text-small text-text">{PASSWORD_METHOD.title}</span>
            {editing ? (
                <>
                    <TextInput type="password" autoFocus value={pw} aria-label="새 비밀번호" className="flex-1 min-w-0"
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') cancel(); }} />
                    <Button variant="ghost" size="sm" onClick={cancel}>취소</Button>
                    <Button variant="accent" size="sm" onClick={() => void save()} disabled={!pw} disabledReason="먼저 비밀번호를 입력하세요.">저장</Button>
                </>
            ) : (
                <>
                    <span className="flex-1 text-small text-muted">{has ? '걸려 있음' : '비어 있음'}</span>
                    {manage && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{has ? '바꾸기' : '걸기'}</Button>}
                    {manage && has && <Button variant="ghost" size="sm" onClick={() => clearSecret(userId)}>빼기</Button>}
                </>
            )}
        </div>
    );
}
