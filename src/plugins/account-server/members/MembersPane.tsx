/**
 * 구성원·초대 판(③ F3) — 관리자가 지금 프로젝트의 구성원 역할·정지, 초대 코드 발급·취소, 명단으로 초대, 재설정 링크를 다룬다.
 *   🔴 코드·링크 원문은 만든 직후 「한 번만」 창에 보인다(복사 단추). 창을 닫으면 상태에서 지워지고, 판을 다시 열어도 다시 그리는 길이 없다
 *      (목록 응답엔 원문이 없다 · api 는 원문을 들고 있지 않다).
 *   🔴 이 판의 조작은 전부 공용 확인창(ConfirmDialog)을 거친다(13절) — 무엇을·누구 것을·되돌릴 수 있나를 한 줄씩.
 *   🔴 막는 것은 함수의 권한 검사다 — 여기 「관리자만」은 화면 가림(10-1).
 *   색은 토큰 클래스로만 · 문구는 선생님이 읽는 쉬운 말.
 */
import { useCallback, useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Checkbox, ConfirmDialog, Dialog } from '../../../pane-ui-system';
import { ROLES } from '../../../../shared/roles.ts';
import type { AccountServer } from '../session';
import { FIELD } from '../session';
import type { InviteRow, Member, MembersApi } from './api';

/** 원문 한 번 보이기 창의 내용 — 닫으면 null 로 버린다. */
type Secret =
    | { kind: 'code'; code: string; roles: string[] }
    | { kind: 'link'; link: string; who: string }
    | { kind: 'table'; rows: { name: string; code: string }[]; skipped: { linked: number; pending: number } };

interface Ask { title: string; body: string; label: string; danger?: boolean; run: () => Promise<void> }

const STATE_LABEL: Record<InviteRow['state'], string> = { pending: '기다리는 중', used: '쓰임', revoked: '취소됨', expired: '기한 지남' };
const ADMIN = '관리자';
const DEFAULT_INVITE_ROLES = ['교사'];

function copy(text: string): void {
    try { void navigator.clipboard?.writeText(text); } catch { /* 복사가 막힌 브라우저 — 글자를 직접 고르면 된다 */ }
}

export function MembersPane({ session, api }: { session: AccountServer; api: MembersApi }) {
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    useEffect(() => { const d = session.onIdentityChange(redraw); return () => d.dispose(); }, [session]);
    const cur = session.current();
    const projectId = cur.kind === 'user' && typeof cur.fields?.[FIELD.projectId] === 'string' ? (cur.fields[FIELD.projectId] as string) : null;
    const isAdmin = cur.kind === 'user' && cur.roles.includes(ADMIN);

    const [members, setMembers] = useState<Member[]>([]);
    const [invites, setInvites] = useState<InviteRow[]>([]);
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState<Ask | null>(null);
    const [secret, setSecret] = useState<Secret | null>(null);
    const [editing, setEditing] = useState<{ userId: string; roles: string[] } | null>(null);
    const [newRoles, setNewRoles] = useState<string[]>(DEFAULT_INVITE_ROLES);

    const load = useCallback(async () => {
        if (!projectId || !isAdmin) return;
        const [m, i] = await Promise.all([api.listMembers(projectId), api.listInvites(projectId)]);
        if (m.ok) setMembers(m.data);
        if (i.ok) setInvites(i.data);
        if (!m.ok) setMsg(m.message); else if (!i.ok) setMsg(i.message);
    }, [api, projectId, isAdmin]);
    useEffect(() => { void load(); }, [load]);

    if (cur.kind !== 'user') return <Note>서버 계정으로 로그인하면 구성원을 볼 수 있습니다.</Note>;
    if (!projectId) return <Note>들어가 있는 프로젝트가 없습니다.</Note>;
    if (!isAdmin) return <Note>구성원·초대는 관리자만 다룰 수 있습니다.</Note>;
    const pid = projectId;

    /** 확인창을 거쳐 한 번 — 실패면 선생님 말로 안내, 성공이면 목록 새로. */
    const confirmThen = (a: Ask) => { setMsg(''); setAsk(a); };
    const runAsk = async () => {
        const a = ask;
        setAsk(null);
        if (!a || busy) return;
        setBusy(true);
        try { await a.run(); } finally { setBusy(false); }
        await load();
    };

    const who = (m: Member) => (m.personRef ? `${m.personRef} (${m.userId})` : m.userId);

    const askRoles = (m: Member, roles: string[]) => confirmThen({
        title: '역할을 바꿀까요?',
        body: `${who(m)} 의 역할을 「${m.roles.join(', ') || '없음'}」에서 「${roles.join(', ')}」(으)로 바꿉니다. 나중에 다시 바꿀 수 있습니다.`,
        label: '역할 바꾸기',
        run: async () => { const r = await api.patchMember(pid, m.userId, { roles }); if (!r.ok) setMsg(r.message); },
    });
    const askActive = (m: Member) => confirmThen(m.active ? {
        title: '이 구성원을 정지할까요?',
        body: `${who(m)} 은(는) 곧바로 이 프로젝트에 들어오지 못합니다. 「다시 켜기」로 되돌릴 수 있습니다.`,
        label: '정지',
        danger: true,
        run: async () => { const r = await api.patchMember(pid, m.userId, { active: false }); if (!r.ok) setMsg(r.message); },
    } : {
        title: '다시 켤까요?',
        body: `${who(m)} 이(가) 다시 이 프로젝트에 들어올 수 있게 됩니다.`,
        label: '다시 켜기',
        run: async () => { const r = await api.patchMember(pid, m.userId, { active: true }); if (!r.ok) setMsg(r.message); },
    });
    const askReset = (m: Member) => confirmThen({
        title: '비밀번호 재설정 링크를 만들까요?',
        body: `${who(m)} 이(가) 새 비밀번호를 정할 수 있는 링크입니다. 링크는 이번 한 번만 보이니 바로 메신저로 전해 주세요. 한 번 쓰면 더는 듣지 않습니다.`,
        label: '링크 만들기',
        run: async () => {
            const r = await api.resetLink(pid, m.userId);
            if (r.ok) setSecret({ kind: 'link', link: r.data.link, who: who(m) }); else setMsg(r.message);
        },
    });
    const askInvite = () => confirmThen({
        title: '초대 코드를 만들까요?',
        body: `역할 「${newRoles.join(', ')}」(으)로 들어오는 초대 코드를 만듭니다. 코드는 이번 한 번만 보이고 7일 뒤 기한이 지납니다. 안 쓰인 코드는 취소할 수 있습니다.`,
        label: '코드 만들기',
        run: async () => {
            const r = await api.createInvite(pid, { roles: newRoles });
            if (r.ok) setSecret({ kind: 'code', code: r.data.code, roles: r.data.roles }); else setMsg(r.message);
        },
    });
    const askFromDoc = () => confirmThen({
        title: '명단으로 초대 코드를 만들까요?',
        body: '서버에 올린 시간표의 선생님마다 교사 역할 초대 코드를 만듭니다. 이미 들어온 분·기다리는 코드가 있는 분은 건너뜁니다. 표는 이번 한 번만 보입니다.',
        label: '명단으로 만들기',
        run: async () => {
            const r = await api.invitesFromDoc(pid);
            if (r.ok) setSecret({ kind: 'table', rows: r.data.invites.map((x) => ({ name: x.name, code: x.code })), skipped: r.data.skipped });
            else setMsg(r.message);
        },
    });
    const askRevoke = (i: InviteRow) => confirmThen({
        title: '초대를 취소할까요?',
        body: `역할 「${i.roles.join(', ')}」${i.personRef ? ` · ${i.personRef}` : ''} 초대 코드를 더는 못 쓰게 합니다. 되돌릴 수 없고, 필요하면 새 코드를 만듭니다.`,
        label: '초대 취소',
        danger: true,
        run: async () => { const r = await api.revokeInvite(pid, i.id); if (!r.ok) setMsg(r.message); },
    });

    const toggleRole = (list: string[], role: string, on: boolean) => (on ? [...new Set([...list, role])] : list.filter((r) => r !== role));
    const roleBoxes = (list: string[], set: (next: string[]) => void) => (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
            {ROLES.map((r) => <Checkbox key={r} size="sm" label={r} checked={list.includes(r)} onChange={(on) => set(toggleRole(list, r, on))} />)}
        </div>
    );

    return (
        <div data-members-pane className="flex flex-col gap-4 p-3 text-small text-text overflow-auto">
            {msg && <p role="alert" data-members-msg className="text-note text-warn">{msg}</p>}

            <section className="flex flex-col gap-2">
                <h2 className="text-body font-semibold">구성원</h2>
                {members.length === 0 && <p className="text-note text-muted">구성원이 없습니다.</p>}
                {members.map((m) => (
                    <div key={m.userId} data-member-row={m.userId} className="flex flex-wrap items-center gap-2 border-b border-border py-1">
                        <span className="flex-1 truncate">{who(m)}</span>
                        <span className="text-note text-muted">{m.roles.join(', ') || '역할 없음'}</span>
                        {!m.active && <span className="text-note text-warn">정지됨</span>}
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing({ userId: m.userId, roles: [...m.roles] })}>역할</Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => askActive(m)}>{m.active ? '정지' : '다시 켜기'}</Button>
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => askReset(m)}>재설정 링크</Button>
                    </div>
                ))}
            </section>

            <section className="flex flex-col gap-2">
                <h2 className="text-body font-semibold">초대</h2>
                {roleBoxes(newRoles, setNewRoles)}
                <div className="flex flex-wrap gap-2">
                    <Button variant="accent" size="sm" disabled={busy || newRoles.length === 0} onClick={askInvite}>초대 코드 만들기</Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={askFromDoc}>명단으로 초대</Button>
                </div>
                {invites.map((i) => (
                    <div key={i.id} data-invite-row={i.id} className="flex flex-wrap items-center gap-2 border-b border-border py-1">
                        <span className="flex-1 truncate">{i.roles.join(', ')}{i.personRef ? ` · ${i.personRef}` : ''}</span>
                        <span className="text-note text-muted">{STATE_LABEL[i.state]}</span>
                        {i.state === 'pending' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => askRevoke(i)}>취소</Button>}
                    </div>
                ))}
            </section>

            {editing && (
                <Dialog
                    title="역할 고르기"
                    onClose={() => setEditing(null)}
                    footer={(
                        <>
                            <Button variant="ghost" onClick={() => setEditing(null)}>닫기</Button>
                            <Button variant="solid" disabled={editing.roles.length === 0} onClick={() => {
                                const m = members.find((x) => x.userId === editing.userId);
                                const roles = editing.roles;
                                setEditing(null);
                                if (m) askRoles(m, roles);
                            }}>다음</Button>
                        </>
                    )}
                >
                    {roleBoxes(editing.roles, (roles) => setEditing({ ...editing, roles }))}
                </Dialog>
            )}

            <ConfirmDialog
                open={!!ask}
                title={ask?.title ?? ''}
                confirmLabel={ask?.label}
                tone={ask?.danger ? 'danger' : 'accent'}
                onConfirm={() => { void runAsk(); }}
                onCancel={() => setAsk(null)}
            >
                {ask?.body}
            </ConfirmDialog>

            {secret && <SecretDialog secret={secret} onClose={() => setSecret(null)} />}
        </div>
    );
}

/** 원문 한 번 보이기 — 닫으면 부모가 상태를 버린다. */
function SecretDialog({ secret, onClose }: { secret: Secret; onClose: () => void }) {
    const title = secret.kind === 'link' ? '비밀번호 재설정 링크' : secret.kind === 'code' ? '새 초대 코드' : '명단 초대 코드';
    const all = secret.kind === 'table' ? secret.rows.map((r) => `${r.name}\t${r.code}`).join('\n') : secret.kind === 'code' ? secret.code : secret.link;
    return (
        <Dialog
            title={title}
            onClose={onClose}
            width={420}
            footer={(
                <>
                    <Button variant="ghost" onClick={() => copy(all)}>복사</Button>
                    <Button variant="solid" onClick={onClose}>닫기</Button>
                </>
            )}
        >
            <div data-secret className="flex flex-col gap-2 text-small text-text">
                <p className="text-note text-warn">이 창을 닫으면 다시 볼 수 없습니다. 지금 복사해 전해 주세요.</p>
                {secret.kind === 'code' && (
                    <>
                        <p className="text-note text-muted">역할: {secret.roles.join(', ')}</p>
                        <code className="select-all break-all text-body">{secret.code}</code>
                    </>
                )}
                {secret.kind === 'link' && (
                    <>
                        <p className="text-note text-muted">{secret.who}</p>
                        <code className="select-all break-all">{secret.link}</code>
                    </>
                )}
                {secret.kind === 'table' && (
                    <>
                        {secret.rows.length === 0 && <p className="text-note text-muted">새로 만들 사람이 없습니다.</p>}
                        {secret.rows.map((r, n) => (
                            <div key={n} className="flex gap-3"><span className="flex-1">{r.name}</span><code className="select-all">{r.code}</code></div>
                        ))}
                        <p className="text-note text-muted">건너뜀: 이미 들어옴 {secret.skipped.linked} · 기다리는 코드 있음 {secret.skipped.pending}</p>
                    </>
                )}
            </div>
        </Dialog>
    );
}

const Note = ({ children }: { children: ReactNode }) => <p data-members-pane className="p-3 text-small text-muted">{children}</p>;
