// 검사 결과 꼴 — 설계 ① 11-3. 순수 타입: DOM·React·브라우저 API 금지(Deno 가 그대로 import).
/** error=❌ 막음 · warn=⚠️ 확인창에 같이 보임 · info=ℹ️ 알림 */
export type Severity = 'error' | 'warn' | 'info'

export type Issue = {
  id: string          // 규칙 id — `doc.spec-missing` 꼴. 서버 400 도 같은 id
  severity: Severity
  where: string       // 어디(칸·반·교시) — 예: `doc/specs`, `rooms/fixed[2]`
  message: string
}

/** 규칙이 돌 때 보는 입력: 덩어리의 칸들. doc 은 v1 Doc(unknown 으로 받아 방어적으로 읽는다). */
export type Ctx = { doc?: any; parts: Record<string, any> }
export type Hit = { where: string; message: string }
export type Rule = { id: string; severity: Severity; run: (c: Ctx) => Hit[] }
