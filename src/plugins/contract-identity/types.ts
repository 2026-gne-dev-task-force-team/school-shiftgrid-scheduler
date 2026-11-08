/**
 * 🔴 약속 「identity」 0.1 — 지금 누가 쓰고 있나 · 이걸 해도 되나.
 *   ⭐ 「약속 먼저, 모듈 나중」의 첫 손님 — 과제 플러그인은 supports: { identity } + onInterface.identity.attach 로 미리 적어 둔다.
 *      오늘은 account-local(이 기기 = 담당자 한 명)이 채우고, 나중에 account-server 가 같은 이름으로 갈아 낀다 — 소비자 무변경.
 *   ⭐ identity 가 없으면(제공자 0) 소비자는 「담당자 한 명 · 전부 허용」으로 동작한다.
 *   🔴 can() 은 화면을 가리는 것이지 막는 것이 아니다 — 진짜 보안은 서버·공유 저장소 판에서.
 *   ⛔ 비밀번호·PIN 을 이 약속으로 주고받지 않는다. 값 0 — 타입만. 소비자는 host.modules 로 identity 모듈을 받는다.
 */
import type { Disposable } from '../../pane-ui-system/plugin';

export interface CurrentUser {
    /** roster Person.id — 명부에 없는 사람(외부 관리자)이면 null. */
    personId: string | null;
    /**
     * 역할 낱말 — 🔴 roster StaffRole('teacher'·'specialist'·'instructor'·'aide'·'staff') ∪ 'admin'(담당자)이다(페이블 8).
     *    ⛔ 여기서 roster 를 import 하지 않는다(string[] 로 둔다) — 약속끼리 값 결합을 안 만든다. 권한 표는 plugin 이 contributes.permissions 로 선언.
     */
    roles: string[];
    /** 화면에 보일 이름. */
    displayName: string;
}

export interface Identity {
    /** 로그인 전이면 null. account-local 은 늘 담당자 한 명을 돌려준다. */
    current(): CurrentUser | null;
    /** 권한 낱말(플러그인이 contributes.permissions 로 선언 — 'room.approve' 등) 허용 여부. identity 없으면 소비자는 늘 참으로 본다. */
    can(action: string): boolean;
    /** 🔴 사람이 바뀌면(로그인·로그아웃·「~로 보기」 전환) 울린다 — 제공자는 __perCaller 로 구독을 소비자 scope 에 모은다. */
    onChange(listener: () => void): Disposable;
}
