// 판 오가기 칩의 주소 — 이 파일 한 곳에만 적는다. 1.2v 는 `/v1.2/` 에 산다(R30 b — 옛 `/preview/` 는 넘겨주기라 `legacy` 로 1.2v 로 가른다).
export interface Edition { id: 'v1' | 'v12' | 'v2'; label: string; path: string; hint: string; legacy?: readonly string[] }

export const EDITIONS: readonly Edition[] = [
  { id: 'v1', label: 'v1', path: '/school-shiftgrid-scheduler/', hint: '지금 쓰는 판' },
  { id: 'v12', label: '1.2v', path: '/school-shiftgrid-scheduler/v1.2/', hint: 'v1 + 운영 앱 합치는 중', legacy: ['/school-shiftgrid-scheduler/preview/'] },
  { id: 'v2', label: 'v2', path: '/school-shiftgrid-scheduler/v2/', hint: '새 구조 연구 중' },
]

/** 지금 주소가 어느 판인가 — 더 긴 주소(하위 경로)가 먼저 맞아야 루트(v1)에 먹히지 않는다. */
export function currentEdition(pathname: string, list: readonly Edition[] = EDITIONS): Edition['id'] {
  const paths = list.flatMap((e) => [e.path, ...(e.legacy ?? [])].map((path) => ({ id: e.id, path })))
  const hit = paths.sort((a, b) => b.path.length - a.path.length).find((e) => pathname.startsWith(e.path))
  return hit?.id ?? 'v1'
}
