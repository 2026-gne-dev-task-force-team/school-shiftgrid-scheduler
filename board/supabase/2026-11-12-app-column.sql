-- T-9g R32 — 세 판(v1 · 1.2v · v2)이 각자 현황판을 보도록 tasks·feedback 에 app 칸을 더한다.
-- 멱등. ⛔ 이 파일은 아직 DB 에 적용하지 않았다 — 적용은 쥔님이 SQL Editor 에 붙여 Run 한 번.
-- 기본 '1.2v': 칸이 없던 옛 줄은 전부 1.2v 로 읽힌다(화면의 옛 자료 기본값과 같다).

alter table board.tasks    add column if not exists app text not null default '1.2v';
alter table board.feedback add column if not exists app text not null default '1.2v';

alter table board.tasks    drop constraint if exists tasks_app_check;
alter table board.tasks    add  constraint tasks_app_check    check (app in ('v1','1.2v','v2'));
alter table board.feedback drop constraint if exists feedback_app_check;
alter table board.feedback add  constraint feedback_app_check check (app in ('v1','1.2v','v2'));

-- 접수 화면이 app 을 같이 싣는다 — 로그인 사용자가 넣을 수 있는 칸에 app 추가.
grant insert (text, place, app) on board.feedback to authenticated;
