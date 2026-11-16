// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { plainLog, wheelTitle, named, eventText } from './code-tag.ts'
import { actorChip } from '../lib/actor.ts'

const show = (xs: (string | HTMLElement)[]) => xs.map((x) => (typeof x === 'string' ? x : `[${x.textContent}]`)).join('')

describe('code-tag', () => {
  it('plainLog — 응답 번호는 꼬리표로', () => {
    expect(show(plainLog('자료 싣기 · 성공 · 응답 201'))).toBe('자료 싣기 · 성공[응답 201]')
    expect(show(plainLog('그냥 글'))).toBe('그냥 글')
    expect(show(plainLog('P10a 입구 · HTTP 500'))).toBe('입구[P10a][HTTP 500]')
  })
  it('plainLog — 세 자리 아닌 숫자·일반 토막은 그대로', () => {
    expect(show(plainLog('응답 20 · 확인'))).toBe('응답 20 · 확인')
  })
  it('wheelTitle — 시각·비율은 꼬리표, 뜻은 앞에', () => {
    expect(show(wheelTitle('현황판 품질 18:02 묶음 · 앱 1:2'))).toBe('현황판 품질 묶음[18:02][앱 1:2]')
    expect(show(wheelTitle('자료 나르기'))).toBe('자료 나르기')
  })
  it('named — 코드는 꼬리표', () => expect(show(named('P10a iframe 입구'))).toBe('iframe 입구[P10a]'))
  it('actorChip — 번호는 따로, 제목이 있으면 이름표에 그대로', () => {
    const a = { name: 'x', role: '시험', task_id: 'T-7z' }
    expect(actorChip(a)).toEqual({ label: '시험팀', tag: 'T-7z' })
    expect(actorChip(a, [], [{ id: 'T-7z', title: 'T-7z (R5) 칸 연결' }])).toEqual({ label: '시험팀 칸 연결', tag: 'T-7z' })
    expect(actorChip({ name: 'x', role: '지휘' })).toEqual({ label: '지휘', tag: '' })
  })
  it('R90 — 이름표에 번호 두 번·번호 아닌 꼬리 없음', () => {
    const a = { name: 'x', role: '자료', task_id: 'T-8p1' }
    expect(actorChip(a, [], [{ id: 'T-8p1', title: 'T-8p1 자료 나르기 T-8p1 · T-8p1' }])).toEqual({ label: '자료팀 자료 나르기', tag: 'T-8p1' })
    expect(actorChip(a, [], [{ id: 'T-8p1', title: 'T-8p1 자료 나르기 28' }]).label).toBe('자료팀 자료 나르기')
    expect(actorChip({ name: 'x', role: '자료', task_id: '28' })).toEqual({ label: '자료팀', tag: '' })
  })
  it('R90 — 가지 이름만 있는 줄은 뜻으로', () => {
    expect(eventText('main 끝')).toBe('줄기에 합침')
    expect(eventText('p-T-10bu 끝')).toBe('가지를 줄기에 합침')
    expect(eventText('벽 세우기 일 끝')).toBe('벽 세우기 일 끝')
  })
})
