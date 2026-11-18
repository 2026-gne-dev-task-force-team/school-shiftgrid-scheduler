-- S-1c: 손으로 짜기 격자 · 처음 안내. 멱등.
-- 같은 학기에 같은 이름의 시안이 둘이면 안 된다(같은 것이 둘)
CREATE UNIQUE INDEX IF NOT EXISTS timetable_name_uq ON timetable (org_id, term_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cell_teacher_idx ON cell (timetable_id, membership_id) WHERE deleted_at IS NULL;
-- 처음 안내를 닫았는지(사람마다)
ALTER TABLE membership ADD COLUMN IF NOT EXISTS guide_done BOOLEAN NOT NULL DEFAULT FALSE;
