// 에이전트 개인별 토큰 — 서브에이전트 기록의 usage 숫자만 합산한다(경로·글은 값에 안 싣는다).
// 「쓴 토큰」 = 새로 읽힌 입력 + 캐시에 쓴 입력 + 출력. 캐시 재읽기는 같은 문맥을 매 턴 다시 세는 것이라 뺀다.
// 같은 응답은 기록에 여러 줄로 반복되니(스트리밍) 응답 id 별로 마지막 줄 하나만 센다.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** jsonl 글 → 쓴 토큰 합(숫자 하나). 깨진 줄·usage 없는 줄은 건너뛴다. */
export function sumUsage(text) {
  const last = new Map()
  let n = 0
  for (const line of String(text).split('\n')) {
    if (!line.includes('"usage"')) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    const u = o?.message?.usage
    if (!u || o.message.role !== 'assistant') continue
    last.set(o.message.id ?? o.uuid ?? `#${n++}`, u)
  }
  let sum = 0
  for (const u of last.values()) sum += (u.input_tokens | 0) + (u.output_tokens | 0) + (u.cache_creation_input_tokens | 0)
  return sum
}

/** 프로젝트 기록 뿌리 아래 `<프로젝트>/<세션>/subagents/agent-*.jsonl` 중 최근(maxAgeMs) 것을 훑어 {도구호출 id → 쓴 토큰}. 짝은 옆 meta.json 의 toolUseId. */
export function tokensByToolUse(root, now = Date.now(), maxAgeMs = 2 * 86400e3) {
  const out = {}
  const ls = (d) => { try { return readdirSync(d, { withFileTypes: true }) } catch { return [] } }
  for (const p of ls(root)) if (p.isDirectory()) for (const s of ls(join(root, p.name))) {
    if (!s.isDirectory()) continue
    const dir = join(root, p.name, s.name, 'subagents')
    for (const f of ls(dir)) {
      if (!/^agent-.+\.meta\.json$/.test(f.name)) continue
      try {
        const log = join(dir, f.name.replace(/\.meta\.json$/, '.jsonl'))
        if (now - statSync(log).mtimeMs > maxAgeMs) continue
        const id = JSON.parse(readFileSync(join(dir, f.name), 'utf-8')).toolUseId
        if (typeof id === 'string') out[id] = sumUsage(readFileSync(log, 'utf-8'))
      } catch { /* 한 기록이 깨져도 나머지는 센다 */ }
    }
  }
  return out
}
