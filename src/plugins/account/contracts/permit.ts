/**
 * 🔴 약속 「permit」 0.1 — **판정**. 갈아 끼는 자리 셋(누구 / 증명 / 판정) 중 마지막(쥔님 2026-11-08 15:06).
 *   ⭐ 「이걸 해도 되나」만 안다(identity 에서 갈라냈다) — 권한 낱말은 각 플러그인이 contributes.permissions 로 선언하고,
 *      누가 무엇을 할 수 있나는 사람이 정책 화면에서 조립한다(바닥 정책 0 · 쥔님 14:54).
 *   🔴 can() 은 화면을 **가릴** 뿐 막지 않는다 — 실수 방지가 목적이고, 진짜 보안은 서버·공유 저장소 판에서(쥔님 14:47).
 *   ⭐ 마스터면 can() 은 항상 true(체계 밖 수정자 · 모든 꼬인 것을 푸는 최후의 문).
 *
 *   소비자: supports: { permit: '^0.1' } + onInterface.permit.attach 로 미리 적어 둔다.
 */
import type { Disposable } from '../../../pane-ui-system/plugin';

export interface Permit {
    /** 그 권한 낱말('<pluginId>.<name>')을 지금 사람이 가졌나 — 화면 가리기용. 마스터면 항상 true. */
    can(permission: string): boolean;
    /** 판정이 바뀌면(사람·역할·정책이 바뀌면) 울린다. */
    onChange(listener: () => void): Disposable;
}
