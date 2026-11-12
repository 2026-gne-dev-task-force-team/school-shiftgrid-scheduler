-- T-9zf R73 — 태스크 대상 꼬리표(현황판 · 1.2v 앱 · v1 · v2 · 장치 · 검수 · 미분류)를 tasks 에 더한다. 멱등.
-- ⛔ 이 파일은 아직 DB 에 적용하지 않았다 — 적용은 쥔님이 SQL Editor 에 붙여 Run 한 번.
-- 적용 전에도 보고꾼 싣기는 멀쩡하다(싣기 SQL 이 모르는 칸 target 을 버린다). 적용하면 다음 싣기부터 칸이 찬다.
-- 유형은 새 칸이 아니다 — 이미 있는 kind(work·cr·bug·decide·review)가 그 값이다.

alter table board.tasks add column if not exists target text;

alter table board.tasks drop constraint if exists tasks_target_check;
alter table board.tasks add  constraint tasks_target_check check (
  target is null or target in ('현황판','1.2v 앱','v1','v2','장치','검수','미분류')
);
