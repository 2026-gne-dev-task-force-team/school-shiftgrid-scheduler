// 덩어리(Bundle) 꼴 — 설계 ① 3절. 순수 타입: DOM·React·브라우저 API 금지(Deno 가 그대로 import).
// shortcut: 칸 안쪽 꼴(Doc·Room …)은 P3 검사 규칙 몫이라 여기선 unknown — 칸 이름 목록만 고정한다.
export const PART_NAMES = ['doc', 'rooms', 'calendar', 'changes', 'fixed', 'classSubjects', 'aux', 'settings'] as const
export type PartName = (typeof PART_NAMES)[number]

export type Bundle = {
  bundleVersion: 1
  parts: Partial<Record<PartName, unknown>>
  versions: Record<string, string>
}

/** 판별 넷: 덩어리 · v1 파일 · 빈 JSON · 깨진 JSON */
export type SniffResult =
  | { kind: 'bundle'; bundle: Bundle }
  | { kind: 'v1'; raw: Record<string, unknown> }   // bundleVersion 없는 객체 — migrateDoc 에 먹일 후보
  | { kind: 'empty' }
  | { kind: 'broken'; reason: string }
