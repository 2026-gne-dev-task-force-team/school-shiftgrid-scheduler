-- S-fix-3: 교과 프리셋 열쇠(preset_key). 「프리셋 다시 불러오기」가 이름이 아니라 이 열쇠로 맞춘다(이름을 바꿔도 중복으로 안 들어감).
ALTER TABLE subject ADD COLUMN IF NOT EXISTS preset_key TEXT;
-- 옛 기본 교과에 열쇠 달기: 기관마다 같은 이름 줄 하나(살아 있는 것 먼저 · 가장 오래된 것)에만. 여러 번 돌려도 같다.
UPDATE subject s SET preset_key = s.name
  FROM (
    SELECT DISTINCT ON (org_id, name) id FROM subject
     WHERE is_default AND preset_key IS NULL
       AND name IN ('국어','수학','사회','과학','도덕','체육','음악','미술','영어','실과','창의적체험활동','통합교과','안전한 생활','자율·동아리')
       AND NOT EXISTS (SELECT 1 FROM subject k WHERE k.org_id = subject.org_id AND k.preset_key = subject.name)
     ORDER BY org_id, name, (deleted_at IS NULL) DESC, id
  ) pick
 WHERE s.id = pick.id;
CREATE INDEX IF NOT EXISTS subject_preset_key_idx ON subject (org_id, preset_key) WHERE preset_key IS NOT NULL;
