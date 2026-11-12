import type { Bundle } from '../bundle/types.ts'
import { RULES } from './rules.ts'
import type { Ctx, Issue } from './types.ts'

export type { Ctx, Issue, Rule, Severity } from './types.ts'
export { RULES } from './rules.ts'

export function runRules(ctx: Ctx): Issue[] {
  return RULES.flatMap((r) => r.run(ctx).map((h) => ({ id: r.id, severity: r.severity, ...h })))
}

/** 덩어리의 칸 전부 검사. 칸이 없으면 그 칸 규칙은 건너뛴다. */
export function checkBundle(b: Pick<Bundle, 'parts'>): Issue[] {
  return runRules({ doc: (b.parts.doc as any)?.doc, parts: b.parts as Record<string, any> })
}

/** v1 파일(`sniff` 가 kind:'v1' 로 돌려준 raw) — doc 규칙만 돈다. */
export function checkV1(raw: unknown): Issue[] {
  return runRules({ doc: raw, parts: {} })
}

export const hasBlocking = (issues: Issue[]) => issues.some((i) => i.severity === 'error')
