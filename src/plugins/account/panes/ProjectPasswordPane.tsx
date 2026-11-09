/**
 * 설정 「계정 ▸ 프로젝트 암호」 — 마스터만 걸고 바꾸고 해제한다. 🔴 저장은 해시(평문 0) · 잊으면 복구 수단 없음(경고 한 줄).
 *   색은 토큰 클래스로만(구조 검사 ①).
 */
import { useState } from 'react';
import { Button, Select } from '../../../pane-ui-system';
import { getCurrent, hasProjectPassword, setProjectPassword, getKeepMinutes, setKeepMinutes } from '../core';
import { useAccountVersion } from './useAccount';

export function ProjectPasswordPane() {
    useAccountVersion();
    const cur = getCurrent();
    const has = hasProjectPassword();
    const [oldPw, setOldPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [msg, setMsg] = useState('');

    const isMaster = cur.kind === 'master';

    const apply = async () => {
        const ok = await setProjectPassword(oldPw, newPw);
        setMsg(ok ? (newPw === '' ? '암호를 해제했습니다.' : '암호를 저장했습니다.') : '실패 — 현재 암호가 맞는지 확인하세요.');
        if (ok) { setOldPw(''); setNewPw(''); }
    };
    const remove = async () => {
        const ok = await setProjectPassword(oldPw, '');
        setMsg(ok ? '암호를 해제했습니다.' : '실패 — 현재 암호가 맞는지 확인하세요.');
        if (ok) { setOldPw(''); setNewPw(''); }
    };

    // 로그인 유지(P4d A2) — 기기별이라 누구나 고른다. 기한이 지나면 다음에 열 때 손님으로 시작한다.
    const [keep, setKeep] = useState(() => String(getKeepMinutes()));
    const keepRow = (
        <label className="flex items-center gap-2 text-small text-muted">
            로그인 유지
            <Select value={keep} options={KEEP_OPTIONS}
                onChange={(e) => { setKeep(e.target.value); setKeepMinutes(Number(e.target.value)); }} />
        </label>
    );

    if (!isMaster) {
        return (
            <div className="flex flex-col gap-3">
                {keepRow}
                <p className="text-[12px] text-muted">프로젝트 암호는 마스터만 바꿀 수 있습니다.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {keepRow}
            <p className="text-[12px] text-muted leading-relaxed">
                {has ? '프로젝트 암호가 걸려 있습니다.' : '프로젝트 암호가 없습니다 — 걸면 로그인 유지 기한이 지난 뒤 열 때 손님으로 시작하고, 이 암호로 마스터에 들어옵니다.'}
            </p>
            <p className="text-[12px] text-warn leading-relaxed">⚠️ 암호를 잊으면 되돌릴 방법이 없습니다(복구 수단 없음).</p>

            {has && (
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                    현재 암호
                    <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)}
                        className="rounded border border-line bg-side text-text px-2 py-1 text-[13px]" />
                </label>
            )}
            <label className="flex flex-col gap-1 text-[12px] text-muted">
                {has ? '새 암호' : '암호'}
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    className="rounded border border-line bg-side text-text px-2 py-1 text-[13px]" />
            </label>

            <div className="flex items-center gap-2">
                <Button variant="accent" size="md" onClick={apply}>{has ? '암호 바꾸기' : '암호 걸기'}</Button>
                {has && <Button variant="ghost" size="md" onClick={remove}>암호 해제</Button>}
            </div>
            {msg && <p className="text-[12px] text-text">{msg}</p>}
        </div>
    );
}

/** 로그인 유지 기한 고르기(분) — 0 은 새로고침하면 풀림. */
const KEEP_OPTIONS = [
    { value: '0', label: '안 함(새로고침하면 풀림)' },
    { value: '60', label: '1시간' },
    { value: '480', label: '8시간' },
    { value: '1440', label: '하루' },
    { value: '10080', label: '7일' },
];
