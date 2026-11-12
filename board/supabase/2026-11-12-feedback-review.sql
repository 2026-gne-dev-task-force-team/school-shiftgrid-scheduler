-- T-9zc R40 — 불편 접수는 Inbox 에만 두고, 쥔님이 「검토」+방향 한 줄을 준 뒤에만 Board 카드가 된다.
-- 멱등. ⛔ 이 파일은 아직 DB 에 적용하지 않았다 — 적용은 쥔님이 SQL Editor 에 붙여 Run 한 번.
-- 관리자 = 로그인 토큰의 app_metadata.role = 'admin' (쥔님 계정에만 Authentication > Users 에서 그 값을 준다).

alter table board.feedback add column if not exists reviewed_at timestamptz;
alter table board.feedback add column if not exists direction   text
  check (direction is null or (char_length(btrim(direction)) between 1 and 200 and direction !~ '[\\@]' and direction !~* '\msk-|eyJ'));

-- 읽기는 board_read(전 표 공개)가 이미 연다. 쓰기: 이 두 칸만, 관리자만.
revoke update on board.feedback from authenticated;
grant update (reviewed_at, direction) on board.feedback to authenticated;

drop policy if exists board_feedback_review on board.feedback;
create policy board_feedback_review on board.feedback for update to authenticated
  using      ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
