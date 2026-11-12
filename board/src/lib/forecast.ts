// 「다 쓰는 데 걸릴 시간」 = 최근 구간 기울기로 계산(DB 에 안 박는다). 늘지 않으면 null.
export function etaMinutes(pctNow: number, pctPrev: number, dtMin: number): number | null {
  const slope = (pctNow - pctPrev) / dtMin
  return slope > 0 ? Math.max(0, (100 - pctNow) / slope) : null
}

export function fmtDur(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}시간 ${m % 60}분` : `${h}시간`
  return h % 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${Math.floor(h / 24)}일`
}
