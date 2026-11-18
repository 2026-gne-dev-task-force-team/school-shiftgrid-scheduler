-- S-4b 출력: 기관별 출력 설정(색·창체 이름·음영 특별실 낱말·점심 길이). 비면 코드 기본값(server/export/settings.js)을 쓴다.
ALTER TABLE org ADD COLUMN IF NOT EXISTS export_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
