import { can } from './permissions.js';

// 세션 로그인만 확인
export function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다' });
  if (req.session.mustChange && !req.path.startsWith('/password')) {
    return res.status(403).json({ error: '비밀번호를 먼저 바꿔 주세요', mustChange: true });
  }
  next();
}

// 세 번 거른다: ① 세션의 기관 = 요청의 기관 ② 이 역할이 이 동작을 하나 ③ (내 것인가는 각 경로에서)
// 하나라도 틀리면 404 — 남의 기관에 뭐가 있는지 알려 주지 않는다.
export function requireOrgAction(action) {
  return (req, res, next) => {
    const orgId = String(req.params.orgId);
    if (!req.session.userId || String(req.session.orgId) !== orgId) return res.status(404).json({ error: '없습니다' });
    if (!can(req.session.role, action)) return res.status(404).json({ error: '없습니다' });
    if (req.session.mustChange) return res.status(403).json({ error: '비밀번호를 먼저 바꿔 주세요', mustChange: true });
    req.orgId = req.session.orgId; // 이후 쿼리는 URL 이 아니라 세션의 기관을 쓴다
    next();
  };
}

// 기관 밖(교육청) 동작
export function requireSystemAction(action) {
  return (req, res, next) => {
    if (!req.session.userId || !can(req.session.role, action)) return res.status(404).json({ error: '없습니다' });
    next();
  };
}
