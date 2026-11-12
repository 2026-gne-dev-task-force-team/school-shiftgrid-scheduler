// fixtures 칸 이름 = 설계 상세 3절 · 운전 규약 8절 그대로.
export type Dept = 'hq' | 'make' | 'qa'
export type Account = 'org' | 'personal'
export interface Actor {
  id: string; parent_id: string | null; kind: 'lead' | 'helper'; name: string; hue: number; eye: string; prop: string
  dept: Dept; team: string; role: string; state: 'work' | 'idle' | 'blocked' | 'done'
  task_id: string | null; branch_id: string | null; account: Account; tok_per_min: number
  started_at: string; ended_at: string | null
}
export interface Task {
  id: string; title: string; category: string; kind: 'work' | 'cr' | 'bug' | 'decide' | 'review'; team: string; sprint: number
  est_min: number; started_at: string | null; lane_id: string; column: 'wait' | 'work' | 'done'; reason: string
  actor_id: string | null; updated_at: string
}
export interface Lane { id: string; title: string; state: string; actor_id: string | null }
export interface Branch { id: string; title: string; trunk: boolean; ahead: number; state: 'live' | 'merged'; actor_id: string | null; task_id: string | null; updated_at: string }
export interface Service { id: string; name: string; state: 'ok' | 'build' | 'down' | 'plan'; url: string; task_id: string | null; checked_at: string }
export interface Module { id: string; name: string; parent: string | null; state: 'plan' | 'build' | 'built'; task_id: string | null }
export interface Goal { id: string; title: string; progress: number; state: 'work' | 'pause' | 'review' | 'shipped'; sprint: number }
export interface BoardEvent { id: string; ts: string; kind: string; subject_type: string; subject_id: string; actor_id: string | null; text: string }
export interface Usage { account: Account; ts: string; pct_5h: number; pct_7d: number; reset_5h_at: string; reset_7d_at: string; tok_per_min: number }
export interface Run { id: string; started_at: string; ended_at: string | null; sprint: number; goal_id: string }
export interface BoardData {
  actors: Actor[]; tasks: Task[]; lanes: Lane[]; branches: Branch[]; services: Service[]; modules: Module[]
  goals: Goal[]; events: BoardEvent[]; usage: Usage[]; runs: Run[]
}
