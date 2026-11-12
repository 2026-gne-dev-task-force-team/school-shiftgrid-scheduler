import type { Feedback } from './lib/feedback.ts'
// fixtures 칸 이름 = 설계 상세 3절 · 운전 규약 8절 그대로.
export type Dept = 'hq' | 'make' | 'qa'
export type Account = 'org' | 'personal'
export interface Actor {
  id: string; parent_id: string | null; kind: 'lead' | 'helper'; name: string; hue: number; eye: string; prop: string
  dept: Dept; team: string; role: string; state: 'work' | 'idle' | 'blocked' | 'done'
  task_id: string | null; branch_id: string | null; account: Account; tok_per_min: number
  started_at: string; ended_at: string | null
}
export type BlockKind = 'dep' | 'decide' | 'check' | 'outside' // 막힌 까닭: 정해진 낱말만(자유 글 칸 없음)
export interface Task {
  id: string; title: string; category: string; kind: 'work' | 'cr' | 'bug' | 'decide' | 'review'; team: string; sprint: number
  est_min: number; started_at: string | null; lane_id: string; column: 'wait' | 'work' | 'done'; reason: string
  actor_id: string | null; updated_at: string
  blocked_by?: string; block_kind?: BlockKind // 막힌 일의 까닭 — 앞 일 id · 낱말
}
export interface Lane { id: string; title: string; state: string; actor_id: string | null }
export interface Branch { id: string; title: string; trunk: boolean; ahead: number; state: 'live' | 'merged'; actor_id: string | null; task_id: string | null; updated_at: string }
export interface Service { id: string; name: string; state: 'ok' | 'build' | 'down' | 'plan'; url: string; task_id: string | null; checked_at: string }
export interface Module { id: string; name: string; parent: string | null; state: 'plan' | 'build' | 'built'; task_id: string | null }
export interface Goal { id: string; title: string; progress: number; state: 'work' | 'pause' | 'review' | 'shipped'; sprint: number }
export interface BoardEvent { id: string; ts: string; kind: string; subject_type: string; subject_id: string; actor_id: string | null; text: string }
export interface Usage { account: Account; ts: string; pct_5h: number; pct_7d: number; reset_5h_at: string; reset_7d_at: string; tok_per_min: number }
export interface Run { id: string; started_at: string; ended_at: string | null; sprint: number; goal_id: string }
// 스프린트 한 줄 — began·ended 는 실기록 시각이라 일부러 *_at 이 아니다(data.ts 의 「지금」 밀기에서 빠진다).
export interface Sprint {
  id: number; title: string; goal: string; began: string; ended: string | null; task_ids: string[]
  est_min: number; actual_min: number; review: string; passed: boolean | null; missed: string; next: string
}
export interface BoardData {
  actors: Actor[]; tasks: Task[]; lanes: Lane[]; branches: Branch[]; services: Service[]; modules: Module[]
  goals: Goal[]; events: BoardEvent[]; usage: Usage[]; runs: Run[]; sprints: Sprint[]
  source?: 'mock' | 'server'; serverFeedback?: Feedback[] // loadData 가 채운다
}
