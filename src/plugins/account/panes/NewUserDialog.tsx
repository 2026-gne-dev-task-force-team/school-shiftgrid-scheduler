/**
 * 「새 사용자」 폼(W14) — 이름·아이디·자격증명 종류·초기 비밀번호(선택)·활성.
 *   초기 비밀번호를 넣으면 「설정됨」, 비우면 「설정 대기」(그 사람이 처음 들어올 때 정한다).
 *   Enter = 만들기 · Esc = 닫기(Dialog) · 이름 칸 자동 초점(Dialog 의 초기 초점 — 자식 autoFocus 를 존중) · 빈칸·아이디 중복은 칸 아래 메시지.
 *   🔴 비밀번호는 이 폼 상태에만 잠깐 있다가 엔진(증명 부품)으로 넘어간다 — 알림·칸 값에 안 남긴다.
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, Field, Select, TextInput, Toggle, isImeEnter } from '../../../pane-ui-system';
import { createUserWithLogin, credentialMethods } from '../core';

export function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
    const methods = credentialMethods();
    const [name, setName] = useState('');
    const [loginId, setLoginId] = useState('');
    const [method, setMethod] = useState(methods[0]?.id ?? '');
    const [pw, setPw] = useState('');
    const [active, setActive] = useState(true);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async (e?: FormEvent) => {
        e?.preventDefault();
        if (busy) return;
        if (!name.trim()) { setMsg('이름을 입력하세요.'); return; }
        if (!loginId.trim()) { setMsg('아이디를 입력하세요.'); return; }
        setBusy(true);
        const r = await createUserWithLogin({ name, loginId, credMethod: method, password: pw || undefined, active });
        setBusy(false);
        if (r.ok) { onCreated(r.id, name.trim()); return; }
        setMsg(r.reason === 'taken' ? `「${loginId.trim()}」 아이디는 이미 있습니다 — 다른 아이디를 쓰세요.`
            : r.reason === 'name' ? '이름을 입력하세요.'
                : r.reason === 'loginId' ? '아이디를 입력하세요.'
                    : '사용자를 만들 수 없습니다 — 계정(사용자 폴더)이 있는지 확인하세요.');
    };
    const edit = (set: (v: string) => void) => (e: { target: { value: string } }) => { set(e.target.value); setMsg(''); };

    return (
        <Dialog title="새 사용자" onClose={onClose} width={360}
            footer={(
                <>
                    <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
                    <Button variant="accent" size="sm" disabled={busy} onClick={() => submit()} data-acc-create>만들기</Button>
                </>
            )}>
            <form onSubmit={submit}
                // Enter = 만들기(입력 칸에서 · 한글 조합 중 Enter 는 넘긴다)
                onKeyDown={(e) => { if (e.key === 'Enter' && !isImeEnter(e) && e.target instanceof HTMLInputElement) { e.preventDefault(); void submit(); } }}
                className="flex flex-col gap-2 text-small text-text" data-acc-new-user>
                <Field label="이름">
                    <TextInput autoFocus aria-label="이름" value={name} onChange={edit(setName)} />
                </Field>
                <Field label="아이디">
                    <TextInput aria-label="아이디" autoComplete="off" value={loginId} onChange={edit(setLoginId)} />
                </Field>
                <Field label="자격증명 종류">
                    <Select aria-label="자격증명 종류" value={method} onChange={(e) => setMethod(e.target.value)}
                        options={methods.map((m) => ({ value: m.id, label: m.title }))} />
                </Field>
                <Field label="초기 비밀번호" hint="비우면 처음 들어올 때 본인이 정합니다">
                    <TextInput type="password" aria-label="초기 비밀번호" autoComplete="new-password" value={pw} onChange={edit(setPw)} />
                </Field>
                <div className="flex items-center justify-between">
                    <span>활성</span>
                    <Toggle on={active} onToggle={setActive} label="활성" />
                </div>
                {msg && <p role="alert" data-acc-msg className="text-note text-warn">{msg}</p>}
            </form>
        </Dialog>
    );
}
