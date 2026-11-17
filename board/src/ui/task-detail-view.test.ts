// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { taskDetailView } from './task-detail-view.ts'
import type { TaskDetailModel } from '../lib/task-detail.ts'
import type { Task } from '../types.ts'

const css = readFileSync(resolve(__dirname, '../style.css'), 'utf8')
const model: TaskDetailModel = { main: [], side: [['유형', '🔨 기능']], links: [{ id: 'l-e75ded-T-N1', title: '긴 제목' }], history: [] }
const task = (id: string): Task => ({ id, title: '제목', category: '코드', kind: 'work', team: '코드', sprint: 0, est_min: 0, started_at: null, lane_id: 'l-e75ded', column: 'work', reason: 'new', actor_id: null, updated_at: '' })

it('상세 번호 꼬리표는 레인 속 id 대신 사람이 읽는 표 번호', () => {
  const el = taskDetailView(model, task('l-e75ded-T-N1'), [], () => {})
  expect(el.querySelector('.tid')?.textContent).toBe('T-N1')
})
it('번호를 못 읽는 중복 카드는 번호 꼬리표를 안 그린다', () => {
  const el = taskDetailView(model, task('l-e75ded-86976f7e'), [], () => {})
  expect(el.querySelector('.tid')).toBeNull()
})
it('연결 태스크 칩도 속 id 대신 표 번호를 쓴다', () => {
  const el = taskDetailView(model, task('T-1a'), [], () => {})
  expect(el.querySelector('.td-link')?.textContent).toBe('T-N1 긴 제목')
})
it('연결 칩 CSS 는 패널 폭 안에서 줄바꿈한다(390px 가로 넘침 방지)', () => {
  const link = css.match(/\.td-link \{([^}]*)\}/)![1]!
  expect(link).toContain('max-width: 100%')
  expect(link).toMatch(/overflow-wrap: anywhere|word-break/)
  expect(css).toMatch(/\.td-side \{[^}]*minmax\(0, 1fr\)/)
})
