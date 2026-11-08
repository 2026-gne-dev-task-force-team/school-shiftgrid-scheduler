/**
 * 🔴 약속 「credential」 0.1 — **증명**. 갈아 끼는 자리 셋(누구 / 증명 / 판정) 중 가운데(쥔님 2026-11-08 15:06).
 *   ⭐ 쥔님(14:54): *"실제로 자격증명 하는 방식도. 나중에 변경오면 다 갈아 낄 수 있어야"* → 증명 방식은 독립 자리다.
 *   ⭐ 입력 화면은 **증명 제공자가 스스로 띄운다** — 약속은 「물어보고 통과 여부만」 안다.
 *   🔴 ⛔ 비밀번호·PIN 을 약속의 인자·반환으로 주고받지 않는다 — challenge 는 boolean 만 돌려준다(값은 제공자 안에서만 산다).
 *
 *   소비자(계정 제공자): supports: { credential: '^0.1' } — 증명 제공자가 0이어도 켜진다(그때 verified 는 false 로 남는다).
 *   오늘은 credential-local(이름+암호)이 채우고, 나중에 누리집·구글 로그인이 같은 이름으로 갈아 낀다.
 */

/** 증명 방법 한 줄 — 제공자가 내놓는 길(예: 이름+암호). title 은 사람에게 보일 이름. */
export interface CredentialMethod {
    id: string;
    title: string;
}

export interface Credential {
    /** 이 제공자가 내놓는 증명 방법들 — 소비자는 보통 첫 방법을 쓴다. */
    methods(): CredentialMethod[];
    /**
     * 그 사람(userId)을 그 방법(methodId)으로 증명한다 — 입력 화면은 제공자가 스스로 띄운다.
     *   통과면 true, 아니면(틀림·취소) false. 🔴 ⛔ 비밀번호를 인자로 받지 않는다(제공자가 자기 화면에서 받는다).
     */
    challenge(methodId: string, userId: string): Promise<boolean>;
}
