import type { Module } from '../types.ts'

export type Line = 'ghost' | 'scaffold' | 'solid'
/** 계획=유령 선(점선·흐림) · 짓는 중=비계(빗금) · 지음=실선. */
export const lineOf = (s: Module['state']): Line => (s === 'plan' ? 'ghost' : s === 'build' ? 'scaffold' : 'solid')

export interface House { root: Module; rooms: Module[] }
/** parent 가 없는 것이 집, 그 밑이 방. 방이 없는 집은 자기 한 칸이 방이다. */
export function groupHouses(mods: Module[]): House[] {
  const ids = new Set(mods.map((m) => m.id))
  return mods.filter((m) => !m.parent || !ids.has(m.parent)).map((root) => {
    const kids = mods.filter((m) => m.parent === root.id)
    return { root, rooms: kids.length ? kids : [root] }
  })
}
export const roomCount = (hs: House[]) => ({ total: hs.flatMap((x) => x.rooms).length, built: hs.flatMap((x) => x.rooms).filter((r) => r.state === 'built').length })

export const clampZoom = (z: number) => Math.min(3, Math.max(0.5, z))

/** 접수 뒤 다시 그릴 때 보던 탭을 되살린다 — 범위를 벗어나면 0. */
export const restoreTab = (saved: number, count: number) => (Number.isInteger(saved) && saved >= 0 && saved < count ? saved : 0)
