-- S-fix-9a: 학교마다 다른 값은 코드가 아니라 기관 설정(org.config)에 둔다. 비면 server/orgConfig.js 의 기본값.
ALTER TABLE org ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
-- 담당 구분 목록도 기관 설정으로 — DB 가 담임/전담·비교과 두 값으로 못 박지 않는다(목록 밖은 앱이 경고로 알린다).
ALTER TABLE membership DROP CONSTRAINT IF EXISTS membership_duty_check;
-- 학기 번호도 1·2 로 못 박지 않는다(3학기제 등). 겹침은 term 유니크가 막는다.
ALTER TABLE term DROP CONSTRAINT IF EXISTS term_semester_check;
ALTER TABLE term ADD CONSTRAINT term_semester_check CHECK (semester BETWEEN 1 AND 12);
