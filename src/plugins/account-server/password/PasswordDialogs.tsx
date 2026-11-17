/**
 * 비밀번호 창들(③ F4·F6) — 상태바 자리에 붙지만 평소엔 아무것도 안 그린다. 명령(비번 바꾸기·재설정 메일)이나 재설정 링크 착지 때만 뜬다.
 *   🔴 프레임 거부 — 남의 창(iframe) 안이면 입력칸을 그리지 않고 안내만(③ 6절 2번 「top!==self 면 안 그림」).
 *   🔴 색은 토큰 클래스로만 · 확인은 ConfirmDialog(새 확인창 안 만든다).
 */
import { useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, ConfirmDialog, Dialog, TextInput } from '../../../pane-ui-system';
import { MIN_PASSWORD } from '../session';
import { isFramed, type PasswordOps } from './password';
import type { Recovery } from './recovery';
import type { PasswordUi } from './ui';


function useSub(sub: { onChange(fn: () => void): { dispose(): void } }) {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => { const d = sub.onChange(redraw); return () => d.dispose(); }, [sub]);
}

const FRAMED_TEXT = '비밀번호 화면은 다른 누리집 안에서는 열지 않습니다. 앱 주소를 주소창에 직접 넣어 여세요.';

/** 남의 창 안이면 입력 대신 안내 한 줄. */
function FrameGuard({ framed, children }: { framed: boolean; children: ReactNode }) {
    if (framed) return <p role="alert" data-pw-framed className="text-note text-warn">{FRAMED_TEXT}</p>;
    return <>{children}</>;
}

const Msg = ({ text, ok }: { text: string; ok?: boolean }) => text
    ? <p role={ok ? 'status' : 'alert'} data-pw-msg className={`text-note ${ok ? 'text-muted' : 'text-warn'}`}>{text}</p>
    : null;

export function PasswordDialogs({ ui, ops, recovery, signedIn, framed = isFramed() }: {
    ui: PasswordUi;
    ops: PasswordOps;
    recovery: Recovery;
    signedIn: () => boolean;
    /** 시험용 — 기본은 지금 창을 잰다. */
    framed?: boolean;
}) {
    useSub(ui);
    useSub(recovery);
    const view = ui.view();
    const rs = recovery.state();
    return (
        <>
            {view === 'change' && <ChangeDialog ops={ops} framed={framed} signedIn={signedIn()} onClose={ui.close} onForgot={() => ui.open('reset')} />}
            {view === 'reset' && <ResetDialog ops={ops} framed={framed} onClose={ui.close} />}
            {(rs === 'ready' || rs === 'done' || rs === 'link-error') && (
                <RecoveryDialog recovery={recovery} framed={framed} onResend={() => { recovery.dismiss(); ui.open('reset'); }} />
            )}
        </>
    );
}

function ChangeDialog({ ops, framed, signedIn, onClose, onForgot }: { ops: PasswordOps; framed: boolean; signedIn: boolean; onClose: () => void; onForgot: () => void }) {
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(false);
    const [done, setDone] = useState(false);

    const run = async () => {
        setAsk(false);
        if (busy) return;
        setBusy(true);
        const r = await ops.changePassword(cur, next, again);
        setBusy(false);
        setCur(''); setNext(''); setAgain('');
        if (r.ok) { setDone(true); setMsg('비밀번호를 바꿨습니다. 다른 기기는 모두 로그아웃됩니다.'); return; }
        setMsg(r.message);
    };

    return (
        <>
            <Dialog open title="비밀번호 바꾸기" onClose={onClose} footer={done || framed || !signedIn
                ? <Button variant="solid" onClick={onClose}>닫기</Button>
                : (
                    <>
                        <Button variant="ghost" onClick={onForgot}>지금 비밀번호를 잊었어요</Button>
                        <Button variant="solid" tone="accent" disabled={busy} onClick={() => setAsk(true)}>바꾸기</Button>
                    </>
                )}>
                <FrameGuard framed={framed}>
                    {!signedIn && <p className="text-note text-muted">로그인한 뒤에 비밀번호를 바꿀 수 있습니다.</p>}
                    {signedIn && !done && (
                        <div data-pw-change className="flex flex-col gap-2">
                            <TextInput autoFocus type="password" aria-label="지금 비밀번호" placeholder="지금 비밀번호" autoComplete="current-password"
                                value={cur} onChange={(e) => setCur(e.target.value)} />
                            <TextInput type="password" aria-label="새 비밀번호" placeholder={`새 비밀번호(${MIN_PASSWORD}자 이상)`} autoComplete="new-password"
                                value={next} onChange={(e) => setNext(e.target.value)} />
                            <TextInput type="password" aria-label="새 비밀번호 다시" placeholder="새 비밀번호 다시" autoComplete="new-password"
                                value={again} onChange={(e) => setAgain(e.target.value)} onEnter={() => setAsk(true)} />
                        </div>
                    )}
                    <Msg text={msg} ok={done} />
                </FrameGuard>
            </Dialog>
            <ConfirmDialog open={ask} title="비밀번호를 바꿀까요?" confirmLabel="바꾸기" onConfirm={() => { void run(); }} onCancel={() => setAsk(false)}>
                바꾸면 이 기기 말고 다른 기기에서는 모두 로그아웃됩니다. 옛 비밀번호로는 돌아갈 수 없습니다.
            </ConfirmDialog>
        </>
    );
}

function ResetDialog({ ops, framed, onClose }: { ops: PasswordOps; framed: boolean; onClose: () => void }) {
    const [email, setEmail] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [sent, setSent] = useState(false);

    const send = async () => {
        if (busy) return;
        setBusy(true);
        const r = await ops.sendResetMail(email);
        setBusy(false);
        if (r.ok) { setSent(true); setMsg('가입된 주소라면 재설정 메일이 갑니다. 메일의 링크를 눌러 새 비밀번호를 정하세요.'); return; }
        setMsg(r.message);
    };

    return (
        <Dialog open title="비밀번호 재설정 메일" onClose={onClose} footer={sent || framed
            ? <Button variant="solid" onClick={onClose}>닫기</Button>
            : (
                <>
                    <Button variant="ghost" onClick={onClose}>취소</Button>
                    <Button variant="solid" tone="accent" disabled={busy} onClick={() => { void send(); }}>메일 보내기</Button>
                </>
            )}>
            <FrameGuard framed={framed}>
                {!sent && (
                    <div data-pw-reset className="flex flex-col gap-2">
                        <p className="text-note text-muted">가입한 이메일로 재설정 링크를 보냅니다.</p>
                        <TextInput autoFocus type="email" aria-label="이메일" placeholder="이메일" autoComplete="username"
                            value={email} onChange={(e) => setEmail(e.target.value)} onEnter={() => { void send(); }} />
                    </div>
                )}
                <Msg text={msg} ok={sent} />
            </FrameGuard>
        </Dialog>
    );
}

function RecoveryDialog({ recovery, framed, onResend }: { recovery: Recovery; framed: boolean; onResend: () => void }) {
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const rs = recovery.state();
    const close = () => recovery.dismiss();

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        const r = await recovery.submit(next, again);
        setBusy(false);
        setNext(''); setAgain('');
        setMsg(r.ok ? '' : r.message);
    };

    if (rs === 'link-error') {
        return (
            <Dialog open title="재설정 링크를 쓸 수 없습니다" onClose={close} footer={(
                <>
                    <Button variant="ghost" onClick={close}>닫기</Button>
                    <Button variant="solid" onClick={onResend}>재설정 메일 다시 보내기</Button>
                </>
            )}>
                <p role="alert" data-pw-link-error className="text-note text-warn">링크가 이미 쓰였거나 기한이 지났습니다. 재설정 메일을 새로 받아 주세요.</p>
            </Dialog>
        );
    }
    return (
        <Dialog open title="새 비밀번호 정하기" onClose={close} footer={rs === 'done' || framed
            ? <Button variant="solid" onClick={close}>닫기</Button>
            : <Button variant="solid" tone="accent" disabled={busy} onClick={() => { void submit(); }}>새 비밀번호로 바꾸기</Button>}>
            <FrameGuard framed={framed}>
                {rs === 'ready' && (
                    <div data-pw-recovery className="flex flex-col gap-2">
                        <p className="text-note text-muted">재설정 메일의 링크로 들어왔습니다. 새 비밀번호를 정하세요.</p>
                        <TextInput autoFocus type="password" aria-label="새 비밀번호" placeholder={`새 비밀번호(${MIN_PASSWORD}자 이상)`} autoComplete="new-password"
                            value={next} onChange={(e) => setNext(e.target.value)} />
                        <TextInput type="password" aria-label="새 비밀번호 다시" placeholder="새 비밀번호 다시" autoComplete="new-password"
                            value={again} onChange={(e) => setAgain(e.target.value)} onEnter={() => { void submit(); }} />
                    </div>
                )}
                {rs === 'done' && <Msg ok text="비밀번호를 바꿨습니다. 다른 기기는 모두 로그아웃됩니다." />}
                <Msg text={msg} />
            </FrameGuard>
        </Dialog>
    );
}
