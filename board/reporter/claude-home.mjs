// 「~/.claude/…」 설정 경로 → 홈의 `.claude` 와 `.claude-*`(계정 프로필 폴더) 형제들의 같은 상대경로 중 실제로 있는 것들.
// 이유: 지금 세션이 어느 프로필로 도는지에 따라 한도·문지기 파일이 `.claude-b` 에 쓰인다(config 는 `~/.claude/…` 로 고정). config 는 안 고치고 코드가 고른다.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, sep } from 'node:path'

const mtimeOf = (p) => { try { return statSync(p).mtimeMs } catch { return 0 } }

/** 후보 경로 전부(있든 없든) — `~/.claude/` 아래 경로면 `.claude-*` 형제 프로필의 같은 상대경로까지. 아니면 [p]. */
export function claudeCandidates(p, { home = homedir(), list = readdirSync } = {}) {
  if (!p) return []
  const base = join(home, '.claude') + sep
  if (!String(p).startsWith(base)) return [p]
  const rel = String(p).slice(base.length)
  let names = ['.claude']
  try { names = list(home).filter((n) => n === '.claude' || /^\.claude-[\w-]+$/.test(n)) } catch { /* 홈을 못 읽으면 원 경로만 */ }
  return [...new Set([p, ...names.map((n) => join(home, n, rel))])]
}

/** 있는 파일들(mtime 오래된 것 → 최신). 없으면 []. */
export function claudeVariants(p, { exists = existsSync, mtime = mtimeOf, ...o } = {}) {
  return claudeCandidates(p, o).filter((x) => exists(x)).map((x) => [x, mtime(x)]).sort((a, b) => a[1] - b[1]).map(([x]) => x)
}

/** mtime 최신 하나(없으면 null). */
export const newestOf = (p, opts) => claudeVariants(p, opts).at(-1) ?? null
