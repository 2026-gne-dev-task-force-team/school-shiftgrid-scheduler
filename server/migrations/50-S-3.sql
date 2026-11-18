-- S-3: 보결 · 특별실 예약. 멱등. DB 가 막는 건 「같은 것이 둘」뿐(교사·특별실 겹침은 경고로만).
ALTER TABLE substitute ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT FALSE;
-- 같은 교사가 같은 날 같은 교시 같은 반으로 보결을 두 번 올린 것(취소 제외)
CREATE UNIQUE INDEX IF NOT EXISTS substitute_slot_uq
  ON substitute (org_id, term_id, absent_membership_id, on_date, period, COALESCE(classroom_id, 0))
  WHERE deleted_at IS NULL AND status <> '취소';
CREATE INDEX IF NOT EXISTS substitute_date_idx ON substitute (org_id, on_date) WHERE deleted_at IS NULL;
-- 같은 사람이 같은 특별실 같은 날 같은 교시를 두 번 예약한 것
CREATE UNIQUE INDEX IF NOT EXISTS booking_same_uq
  ON booking (org_id, special_room_id, on_date, period, membership_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS booking_date_idx ON booking (org_id, on_date) WHERE deleted_at IS NULL;
-- 특별실 고정 칸 잠금(요일×교시) — 관리자가 건다
CREATE TABLE IF NOT EXISTS room_lock (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES org(id),
  special_room_id BIGINT NOT NULL REFERENCES special_room(id),
  weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period          INTEGER NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS room_lock_uq ON room_lock (special_room_id, weekday, period) WHERE deleted_at IS NULL;
