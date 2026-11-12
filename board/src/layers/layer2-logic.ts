// 2층 원통 — 화면 좌표·각도 계산(순수). 그리기·이벤트는 layer2-branches.ts.
export interface Proj { id: string; y: number; cos: number }
export interface Seg { id: string; x1: number; x2: number; y: number; cos: number }

/** 가지 n개를 원통에 고르게 얹는다. y = r·sinθ(화면 가운데 기준) · cos = 앞(+)/뒤(−). */
export function project(ids: string[], rot: number, r: number): Proj[] {
  return ids.map((id, i) => {
    const th = rot + (i * 2 * Math.PI) / ids.length
    return { id, y: r * Math.sin(th), cos: Math.cos(th) }
  })
}

/** 누르기 판정: 앞면(cos>0) 가지만 · 여럿이 겹치면 가장 앞(cos 큰 것). tol 은 앞면 기준 반높이(px), 뒤로 갈수록 좁아진다. */
export function hitTest(segs: Seg[], px: number, py: number, tol = 14): string | null {
  let best: Seg | null = null
  for (const s of segs) {
    if (s.cos <= 0) continue
    if (px < s.x1 || px > s.x2 || Math.abs(py - s.y) > tol * s.cos + 4) continue
    if (!best || s.cos > best.cos) best = s
  }
  return best ? best.id : null
}

/** 라벨을 쓸 가지: 앞쪽(cos 큰 순) max 개만. 폰은 5. */
export function labelIds(ps: Proj[], max = 5): Set<string> {
  return new Set([...ps].filter((p) => p.cos > 0).sort((a, b) => b.cos - a.cos).slice(0, max).map((p) => p.id))
}
