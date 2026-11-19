// 오늘 날짜(YYYY-MM-DD) — 이 기기의 시각대 기준. toISOString 은 UTC 라 한국 아침엔 어제가 나온다.
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
