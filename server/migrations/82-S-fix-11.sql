-- S-fix-11: 직무 값 하나로 — 옛 값 '전담·비교과' 를 새 체계(기본 목록 담임·전담·비교과)의 '전담' 으로 옮긴다(지우지 않고 UPDATE).
UPDATE membership SET duty = '전담' WHERE duty = '전담·비교과';
