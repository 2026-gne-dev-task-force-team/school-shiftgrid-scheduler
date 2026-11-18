-- S-2: 자동 생성 · 확정. 멱등.
-- 생성 정보(순위 · 못 놓은 시수 · 진도 위반 · 복제 출처) — 표시용, 규칙 강제 아님
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS gen_info JSONB;
-- 확정본 찾기(그날 적용 중인 것) — 유일 아님(확정은 여럿이어도 된다)
CREATE INDEX IF NOT EXISTS timetable_confirmed_idx ON timetable (org_id, term_id, starts_on) WHERE status = '확정' AND deleted_at IS NULL;
