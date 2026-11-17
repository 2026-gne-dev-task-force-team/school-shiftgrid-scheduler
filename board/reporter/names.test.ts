import { describe, expect, it } from 'vitest'
import { NAMES } from './names.mjs'

// U19 — 현황판 캐릭터 이름이 실제 사람(학생·교사) 이름으로 오해되면 안 된다. 인명 꼴이 다시 못 들어오게 막는다.
describe('캐릭터 이름 목록', () => {
  it('36개 · 겹침 없음 · 한글만', () => {
    expect(NAMES).toHaveLength(36)
    expect(new Set(NAMES).size).toBe(NAMES.length)
    for (const n of NAMES) expect(n).toMatch(/^[가-힣]+$/)
  })
  it('두 글자 + 흔한 인명 끝 글자 꼴(하준·서아…)이 없다', () => {
    const 인명끝 = /[준윤우아은현민서연진호영안린원율재라빈솔인별찬훈석태]$/
    const 사람꼴 = NAMES.filter((n) => /^[가-힣]{2}$/.test(n) && 인명끝.test(n))
    expect(사람꼴).toEqual([])
  })
  it('세 글자 이하 이름도 옛 사람 이름 표와 안 겹친다', () => {
    const 옛 = ['하준', '서윤', '도윤', '지우', '시우', '하린', '예준', '아린', '주원', '수아', '지호', '다은', '건우', '채원', '현우', '소율', '유준', '나윤', '민재', '가은', '태민', '유나', '승현', '지안', '재윤', '서아', '은우', '하윤', '이안', '세은', '우진', '연우', '선우', '보람', '한결', '새봄']
    expect(NAMES.filter((n) => 옛.includes(n))).toEqual([])
  })
})
