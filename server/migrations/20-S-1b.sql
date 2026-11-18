-- S-1b: 학교 기본 · 시수표 · 고정/금지 · 규칙 수위. 멱등.
ALTER TABLE subject ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE subject ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
-- 학기: 기관×연×학기 하나(같은 것이 둘 방지)
CREATE UNIQUE INDEX IF NOT EXISTS term_uq ON term (org_id, year, semester) WHERE deleted_at IS NULL;
-- 고정·금지: 같은 칸에 같은 종류가 둘이면 안 된다(같은 것이 둘)
CREATE UNIQUE INDEX IF NOT EXISTS pin_uq ON pin (term_id, target_kind, target_id, weekday, period, kind) WHERE deleted_at IS NULL;
