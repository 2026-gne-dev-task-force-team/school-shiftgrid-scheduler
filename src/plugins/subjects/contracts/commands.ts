/**
 * 🔴 subjects 조각이 내놓는 명령 id — 다른 조각은 명령을 글자로 부르지 말고 약속 모듈로 받은 이 상수로 부른다(톱니 cmdIdString).
 *   ⭐ 값은 순수 글자 상수뿐(함수 0). 값은 host.modules.use<..>('subjects').cmd.open 으로 받는다(남의 contracts 값 import ⛔).
 *   ⚠️ 매니페스트(index.ts contributes.commands)의 id 와 한 벌이어야 한다.
 */
export const CMD = {
    open: 'subjects.open',
} as const;
