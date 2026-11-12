// P10c — 「파일로 바꾸기」: 파일 고르기 → 검사 → 확인 → 지금 판 자동 받기 → 바꾸기 (설계 ① 12절 표 「doc 을 파일로 바꾸기」).
// 순서가 이 파일의 전부다: 검사에 막히면 확인창은 안 뜨고, 확인을 취소하면 아무것도 안 바뀌고,
// 확인하면 「지금 판 받기」가 끝난 뒤에야 새 파일을 돌려준다(= v1 이 칸을 바꾼다).
// 서버 보관 칸 `doc@<n>` 은 서버 쪽 일이라 여기 없다.
import { checkV1, hasBlocking } from '../../../shared/check'
import type { Issue } from '../../../shared/check'
import type { OpenedDoc } from './legacy/platform/types'
import type { Doc } from './legacy/types/doc'

export interface ReplaceDeps {
  /** 파일 고르기. 취소하면 null */
  pick(): Promise<OpenedDoc | null>
  /** 검사(P4 shared/check) */
  check(doc: unknown): Issue[]
  /** 막는 오류가 있을 때 알림만 한다(확인창이 아니다) */
  reject(issues: Issue[]): void | Promise<void>
  /** 「칸을 이 파일로 바꿀까요」. true 면 진행 */
  confirm(issues: Issue[], file: OpenedDoc): Promise<boolean>
  /** 지금 판 자동 받기 — 바꾸기 전에 끝나야 한다. 지금 판이 없으면 null 로 건너뛴다 */
  current(): Doc | null
  backup(doc: Doc): Promise<unknown>
}

export type ReplaceResult = 'replaced' | 'rejected' | 'cancelled' | 'no-file' | 'backup-failed'

/** 순서를 지키는 한 바퀴. 바꿀 파일은 `file` 로 함께 돌려준다 */
export async function replaceFlow(deps: ReplaceDeps): Promise<{ result: ReplaceResult; file: OpenedDoc | null }> {
  const file = await deps.pick()
  if (!file) return { result: 'no-file', file: null }
  const issues = deps.check(file.doc)
  if (hasBlocking(issues)) {
    await deps.reject(issues)
    return { result: 'rejected', file: null }
  }
  if (!(await deps.confirm(issues, file))) return { result: 'cancelled', file: null }
  const cur = deps.current()
  if (cur) {
    try {
      await deps.backup(cur)
    } catch {
      // 받기가 안 되면 안전망 없이 덮지 않는다
      return { result: 'backup-failed', file: null }
    }
  }
  return { result: 'replaced', file }
}

const MARK: Record<Issue['severity'], string> = { error: '❌', warn: '⚠️', info: 'ℹ️' }

export function issueLines(issues: Issue[]): string[] {
  return issues.map((i) => `${MARK[i.severity]} ${i.where} — ${i.message}`)
}

/** 확인창 본문(순수 문자열). 화면 확인창이 서면(③ F5) 이 줄들을 그대로 넘긴다 */
export function confirmText(issues: Issue[], file: OpenedDoc): string {
  const head = `지금 칸을 「${file.path ?? '이 파일'}」로 바꿉니다. 바꾸기 전에 지금 판을 파일로 받아 둡니다.`
  return [head, ...issueLines(issues)].join('\n')
}

/** 공용 확인창이 서기 전 임시 구현 */
export function windowDeps(
  current: () => Doc | null,
  pick: ReplaceDeps['pick'],
  backup: ReplaceDeps['backup'],
): ReplaceDeps {
  return {
    pick,
    check: checkV1,
    reject: (issues) => window.alert(['이 파일로는 바꿀 수 없습니다.', ...issueLines(issues)].join('\n')),
    confirm: async (issues, file) => window.confirm(confirmText(issues, file)),
    current,
    backup,
  }
}

/** 확인창 안에 넣을 검사 결과 목록(공용 확인창이 서면 그 안에 꽂는다) */
export function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul>
      {issueLines(issues).map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  )
}
