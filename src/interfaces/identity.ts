/**
 * 🔴 인터페이스 「identity」 0.1.0 — 지금 누가 쓰고 있나 · 이걸 해도 되나.
 *   ⭐ 「인터페이스 먼저, 모듈 나중」의 첫 손님(쥔님 2026-11-08 12:33 *"미리 인터페이스 만들고, 각 모듈이 지원 여부 등록하고, 끼면 연동"*).
 *      과제 플러그인은 supports: { identity: '^0.1' } + lifecycle.onInterface.identity.attach 로 미리 적어 둔다.
 *      오늘은 account-local(이 기기 = 담당자 한 명)이 채우고, 나중에 account-server 가 같은 이름으로 갈아 낀다 — 소비자 무변경.
 *   ⭐ identity 가 없으면(제공자 0) 소비자는 「담당자 한 명 · 전부 허용」으로 동작한다.
 *   🔴 can() 은 화면을 가리는 것이지 막는 것이 아니다 — 진짜 보안은 서버·공유 저장소 판에서.
 *   ⛔ 비밀번호·PIN 을 이 인터페이스로 주고받지 않는다.
 *   소비자: host.modules.use<Identity>('identity') — supports 라 null 이 올 수 있다. ⛔ 값 0.
 */
import type { Subscribe } from './common';

export interface CurrentUser {
    /** roster Person.id — 명부에 없는 사람(외부 관리자)이면 null. */
    personId: string | null;
    /** 역할 낱말 — 'admin' · 'teacher' · 'aide' … 플러그인이 선언한 권한 표가 이걸 본다. */
    roles: string[];
    /** 화면에 보일 이름. */
    displayName: string;
}

export interface Identity {
    /** 로그인 전이면 null. account-local 은 늘 담당자 한 명을 돌려준다. */
    current(): CurrentUser | null;
    /** 권한 낱말(플러그인이 contributes.permissions 로 선언 — 'room.approve' 등) 허용 여부. */
    can(action: string): boolean;
    /** 사람이 바뀌면(로그인·로그아웃·「~로 보기」 전환) 울린다. */
    onChange: Subscribe;
}
