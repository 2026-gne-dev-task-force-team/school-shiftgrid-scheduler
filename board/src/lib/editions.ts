// 판 오가기 칩의 주소 — 이 파일 한 곳에만 적는다. 1.2v 를 `/preview/` 에서 `/v1.2/` 로 옮길 때(R30 b) path 한 줄만 바꾼다.
export interface Edition { id: 'v1' | 'v12' | 'v2'; label: string; path: string; hint: string }

export const EDITIONS: readonly Edition[] = [
  { id: 'v1', label: 'v1', path: '/school-shiftgrid-scheduler/', hint: '지금 쓰는 판' },
  { id: 'v12', label: '1.2v', path: '/school-shiftgrid-scheduler/preview/', hint: 'v1 + 운영 앱 합치는 중' },
  { id: 'v2', label: 'v2', path: '/school-shiftgrid-scheduler/v2/', hint: '새 구조 연구 중' },
]

/** 지금 주소가 어느 판인가 — 더 긴 주소(하위 경로)가 먼저 맞아야 루트(v1)에 먹히지 않는다. */
export function currentEdition(pathname: string, list: readonly Edition[] = EDITIONS): Edition['id'] {
  const hit = [...list].sort((a, b) => b.path.length - a.path.length).find((e) => pathname.startsWith(e.path))
  return hit?.id ?? 'v1'
}
