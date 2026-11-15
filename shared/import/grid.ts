/** 학급 표 공통 — 요일 줄·열 주인 찾기. ops-days·ops-room 불러오기가 같이 쓴다. */
export const DAYS = ['월', '화', '수', '목', '금']

export interface RowInfo { label: string; owner?: string; start: string | null; reason: string; options?: { start: string; grades: number[] }[]; hasContent?: boolean }

/** 요일 줄(월~금이 다섯 번 이상 나오는 첫 줄, 위쪽 4줄 안) */
export function findDayRow(g: string[][]): number {
  for (let r = 0; r < Math.min(4, g.length); r++) if (g[r].filter((x) => DAYS.includes(x.trim())).length >= 5) return r
  return -1
}

/** 열마다 (주인 머리 글자, 요일). 주인 머리는 요일 줄 바로 위 줄에서 왼쪽으로 가장 가까운 글자(병합 칸) */
export function gridColumns(g: string[][], dayRow: number): ({ key: string; dayIndex: number } | null)[] {
  const head = dayRow > 0 ? g[dayRow - 1] : []
  return g[dayRow].map((v, c) => {
    const di = DAYS.indexOf(v.trim())
    if (c === 0 || di < 0) return null
    let key = ''
    for (let k = c; k >= 1; k--) if (head[k]?.trim()) { key = head[k].trim(); break }
    return { key: key || '열' + Math.ceil(c / 5), dayIndex: di }
  })
}
