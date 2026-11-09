/**
 * 사용자·역할 노드의 속성 칸 — 편집 탭과 같은 편집기(UserEditor·RoleEditor)를 오른쪽 「속성」 패널에 담는다.
 *   🔴 칸은 계정 꾸러미가 낸다(contributes.properties · target = USER_TYPE·ROLE_TYPE). ⛔ 비밀 노드엔 칸을 안 낸다(값 노출 금지).
 */
import type { PropertiesPaneProps } from '../../../pane-ui-system/plugin';
import { useAccountVersion } from './useAccount';
import { USER_TYPE } from '../nodes';
import { UserEditor } from './UserEditor';
import { RoleEditor } from './RoleEditor';

export function AccountProps({ target }: PropertiesPaneProps) {
    useAccountVersion();
    return target.type === USER_TYPE ? <UserEditor userId={target.id} /> : <RoleEditor roleId={target.id} />;
}
