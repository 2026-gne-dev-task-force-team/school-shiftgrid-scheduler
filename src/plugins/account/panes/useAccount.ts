/**
 * 계정 설정 패널 공용 훅 — 세션·역할·사용자·정책이 바뀌면 다시 그린다. 🔴 core 가 유일한 상태 원본(패널은 읽고 조작만).
 *   권한 낱말·꽂힌 칸은 listPlugins() 로 모은다(설정 플러그인 선례 — 켜진 플러그인들의 선언을 모음).
 */
import { useEffect, useState } from 'react';
import { listPlugins } from '../../../pane-ui-system/plugin';
import { onIdentityChange, onPermitChange } from '../core';

/** 세 가지 변화(누구·판정·데이터)에 다시 그리게 버전을 올린다. */
export function useAccountVersion(): number {
    const [v, setV] = useState(0);
    useEffect(() => {
        const bump = () => setV((x) => x + 1);
        const d1 = onIdentityChange(bump);
        const d2 = onPermitChange(bump);
        return () => { d1.dispose(); d2.dispose(); };
    }, []);
    return v;
}

/** 켜진 플러그인들이 선언한 권한 낱말 모음(고정 목록 없음). */
export function allPermissions(): { id: string; title: string }[] {
    return listPlugins().filter((p) => p.enabled && !p.blocked).flatMap((p) => p.permissions);
}
/** 켜진 플러그인들이 꽂은 사용자 칸 모음. */
export function allUserFields(): { id: string; title: string; editor?: string }[] {
    return listPlugins().filter((p) => p.enabled && !p.blocked).flatMap((p) => p.userFields);
}
/** 켜진 플러그인들이 꽂은 역할 칸 모음. */
export function allRoleFields(): { id: string; title: string; editor?: string }[] {
    return listPlugins().filter((p) => p.enabled && !p.blocked).flatMap((p) => p.roleFields);
}
