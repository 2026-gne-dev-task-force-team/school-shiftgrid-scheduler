-- S-2b: 시수표 줄의 연강(붙여 두는 시수) 칸. 1 = 낱개 · 2 = 두 시수씩 붙여서. 멱등.
ALTER TABLE teaching_load ADD COLUMN IF NOT EXISTS block INT NOT NULL DEFAULT 1;
