-- T-9zd R71 — 카드 상세(지라 꼴)에 쓸 칸을 tasks 에 더한다. 멱등.
-- ⛔ 이 파일은 아직 DB 에 적용하지 않았다 — 적용은 쥔님이 SQL Editor 에 붙여 Run 한 번.
-- 적용 전에도 보고꾼 싣기는 멀쩡하다(싣기 SQL 이 모르는 칸을 버린다). 적용하면 다음 싣기부터 상세 칸이 찬다.
-- 칸 이름은 보고꾼 JSON 키 그대로(askedAt 만 대문자라 큰따옴표) — jsonb_populate_recordset 이 키 이름으로 맞춘다.
-- 글 칸은 서버 board.plain 도 한 번 더 건다(보고꾼 거름이 뚫려도 경로·열쇠 꼴은 서버가 막는다).

alter table board.tasks add column if not exists ask       text;
alter table board.tasks add column if not exists "askedAt" timestamptz;
alter table board.tasks add column if not exists body      text;
alter table board.tasks add column if not exists done      text;
alter table board.tasks add column if not exists links     text[];
alter table board.tasks add column if not exists history   jsonb;

alter table board.tasks drop constraint if exists tasks_detail_check;
alter table board.tasks add  constraint tasks_detail_check check (
  (ask  is null or (board.plain(ask)  and char_length(ask)  <= 2000)) and
  (body is null or (board.plain(body) and char_length(body) <= 2000)) and
  (done is null or (board.plain(done) and char_length(done) <= 2000))
);
