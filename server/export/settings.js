// 출력 설정 — 기본값은 여기 한 곳. 기관이 org.export_settings 로 덮어쓴다(하드코딩 금지 원칙).
export const EXPORT_DEFAULTS = {
  changcheColor: '#1c4fd8', // 창체 글자색(파랑)
  specialistColor: '#d92d2d', // 전담 글자색(빨강)
  shadeColor: '#dcdcdc', // 과학실 칸 음영
  changcheNames: ['창의적체험활동', '창체'], // 창체로 볼 교과 이름·줄임말
  shadeRoomKeywords: ['과학'], // 이 낱말이 든 특별실 칸에 음영
  lunchMinutes: 40, // 급식 한 교대 길이(분)
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function mergeSettings(raw) {
  const o = { ...EXPORT_DEFAULTS };
  const s = raw && typeof raw === 'object' ? raw : {};
  for (const k of ['changcheColor', 'specialistColor', 'shadeColor']) if (typeof s[k] === 'string' && HEX.test(s[k])) o[k] = s[k];
  for (const k of ['changcheNames', 'shadeRoomKeywords']) {
    if (Array.isArray(s[k])) o[k] = s[k].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, 20);
  }
  if (Number.isInteger(s.lunchMinutes) && s.lunchMinutes >= 10 && s.lunchMinutes <= 120) o.lunchMinutes = s.lunchMinutes;
  return o;
}

export async function loadSettings(pool, orgId) {
  const { rows } = await pool.query(`SELECT export_settings FROM org WHERE id = $1 AND deleted_at IS NULL`, [orgId]);
  return mergeSettings(rows[0]?.export_settings);
}
