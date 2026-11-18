-- S-4a: 보조인력 근태 · 권장 17 가중 · 소규모교. 멱등.
-- 사람마다 허용 교과(보조인력이 맡을 수 있는 교과) — 같은 사람·교과가 둘이면 안 된다(같은 것이 둘)
CREATE TABLE IF NOT EXISTS attendance_allowed (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES org(id),
  membership_id BIGINT NOT NULL REFERENCES membership(id),
  subject_id    BIGINT NOT NULL REFERENCES subject(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_allowed_uq ON attendance_allowed (org_id, membership_id, subject_id) WHERE deleted_at IS NULL;

-- 같은 사람이 같은 날 근태 한 줄(같은 것이 둘 방지)
CREATE UNIQUE INDEX IF NOT EXISTS attendance_day_uq ON attendance (org_id, membership_id, on_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_month_idx ON attendance (org_id, on_date) WHERE deleted_at IS NULL;

-- 권장 17 티어 가중(기관 설정 JSON · 비면 soft.js 기본값) · 사람 티어 · 소규모교 설정
ALTER TABLE org ADD COLUMN IF NOT EXISTS soft_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE org ADD COLUMN IF NOT EXISTS small_school JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE membership ADD COLUMN IF NOT EXISTS tier INTEGER CHECK (tier IN (1,2,3));
