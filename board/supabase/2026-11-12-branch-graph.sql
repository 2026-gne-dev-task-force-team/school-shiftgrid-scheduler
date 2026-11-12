-- T-9zi R14 — 세로 커밋 그래프용: 줄기 행(branches)에 최근 커밋·부모 관계를 json 으로 싣는 칸. 멱등.
-- ⛔ 이 파일은 아직 DB 에 적용하지 않았다 — 적용은 쥔님이 SQL Editor 에 붙여 Run 한 번.
-- 적용 전에도 보고꾼 싣기는 멀쩡하다(싣기 SQL 이 모르는 칸 graph 를 버린다) · 판은 칸이 비면 가지 정보만으로 얼개를 그린다.
-- 꼴: [{ sha, parents:[sha…], subject, at, refs:[{ name, branch_id }] }] — 새것→옛것, 짧은 해시.

alter table board.branches add column if not exists graph jsonb;
