-- 작업현황판 board 스키마 (바퀴 2 — 진짜 자료)
-- 무엇: 현황판 자료 표 12개 + 읽기 공개/쓰기 제한 정책 + Realtime 등록. 멱등(여러 번 돌려도 된다).
-- 어디서: Supabase 대시보드 → SQL Editor 에 통째로 붙여 Run 한 번.
-- 돌린 뒤: Settings → API → Exposed schemas 에 `board` 를 추가하고 저장.
-- 담백 원칙: 기기·모델·토큰 실값·사람 실명·이메일·계정 id 칸 없음. 글 칸은 board.plain() 검사를 통과해야 한다.
-- 분리 규칙: board 의 표는 다른 스키마를 가리키지 않는다(FK 도 두지 않는다 — 보고꾼이 순서 없이 넣는다).

create schema if not exists board;

-- 담백 검사: 경로(/ \)·이메일(@)·비밀 값 꼴(sk- · eyJ)이 들어 있으면 false.
create or replace function board.plain(t text) returns boolean
language sql immutable as $$
  select t is null or (t !~ '[/\\@]' and t !~* '\msk-|eyJ') -- \m = 낱말 시작(task- 같은 낱말 안쪽은 통과)
$$;

create table if not exists board.actors (
  id text primary key,
  parent_id text,
  kind text not null check (kind in ('lead','helper')),
  name text not null check (board.plain(name) and char_length(name) <= 20),
  hue int not null check (hue between 0 and 360),
  eye text not null check (board.plain(eye)),
  prop text not null check (board.plain(prop)),
  dept text not null check (dept in ('hq','make','qa')),
  team text not null check (board.plain(team)),
  role text not null check (board.plain(role)),
  state text not null check (state in ('work','idle','blocked','done')),
  task_id text,
  branch_id text,
  account text not null check (account in ('org','personal')),
  tok_per_min int not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz
);

create table if not exists board.tasks (
  id text primary key,
  title text not null check (board.plain(title) and char_length(title) <= 100),
  category text not null check (board.plain(category)),
  kind text not null check (kind in ('work','cr','bug','decide','review')),
  team text not null check (board.plain(team)),
  sprint int not null default 0,
  est_min int not null default 0,
  started_at timestamptz,
  lane_id text not null,
  "column" text not null check ("column" in ('wait','work','done')),
  reason text not null check (reason in ('new','dep','checking','blocked','review','done','closed')),
  actor_id text,
  updated_at timestamptz not null default now(),
  blocked_by text,
  block_kind text check (block_kind in ('dep','decide','check','outside'))
);

create table if not exists board.lanes (
  id text primary key,
  title text not null check (board.plain(title)),
  state text not null check (board.plain(state)),
  actor_id text
);

create table if not exists board.branches (
  id text primary key,
  title text not null check (board.plain(title)), -- 일감 제목. 실제 가지 이름 금지
  trunk boolean not null default false,
  ahead int not null default 0,
  state text not null check (state in ('live','merged')),
  actor_id text,
  task_id text,
  updated_at timestamptz not null default now()
);

create table if not exists board.services (
  id text primary key,
  name text not null check (board.plain(name)),
  state text not null check (state in ('ok','build','down','plan')),
  url text not null default '' check (url !~* 'sk-|eyJ'),
  task_id text,
  checked_at timestamptz not null default now()
);

create table if not exists board.modules (
  id text primary key,
  name text not null check (board.plain(name)),
  parent text,
  state text not null check (state in ('plan','build','built')),
  task_id text
);

create table if not exists board.goals (
  id text primary key,
  title text not null check (board.plain(title)),
  progress int not null default 0 check (progress between 0 and 100),
  state text not null check (state in ('work','pause','review','shipped')),
  sprint int not null default 0
);

create table if not exists board.events (
  id text primary key,
  ts timestamptz not null default now(),
  kind text not null check (kind in ('actor.spawn','actor.end','actor.state','task.move','task.reject',
    'branch.create','branch.commit','branch.push','branch.merge','service.state','module.state',
    'goal.progress','release','feedback.add')),
  subject_type text not null check (board.plain(subject_type)),
  subject_id text not null,
  actor_id text,
  text text not null check (board.plain(text) and char_length(text) <= 200)
);

create table if not exists board.usage (
  account text not null check (account in ('org','personal')),
  ts timestamptz not null,
  pct_5h numeric not null,
  pct_7d numeric not null,
  reset_5h_at timestamptz not null,
  reset_7d_at timestamptz not null,
  tok_per_min int not null default 0,
  primary key (account, ts)
);

create table if not exists board.runs (
  id text primary key,
  started_at timestamptz not null,
  ended_at timestamptz,
  sprint int not null default 0,
  goal_id text
);

-- 스프린트 한 줄 (types.ts 의 Sprint). task_ids 는 tasks.id 모음(FK 없음). began·ended 는 실기록 시각.
create table if not exists board.sprints (
  id int primary key,
  title text not null check (board.plain(title) and char_length(title) <= 100),
  goal text not null default '' check (board.plain(goal) and char_length(goal) <= 200),
  began timestamptz not null,
  ended timestamptz,
  task_ids text[] not null default '{}',
  est_min int not null default 0,
  actual_min int not null default 0,
  review text not null default '' check (board.plain(review) and char_length(review) <= 200),
  passed boolean, -- null = 검수 대기
  missed text not null default '' check (board.plain(missed) and char_length(missed) <= 200),
  next text not null default '' check (board.plain(next) and char_length(next) <= 200)
);

-- 불편 접수 (feedback.ts 의 Feedback: id · text · where · ts). `where` 는 예약어라 place.
create table if not exists board.feedback (
  id text primary key default ('fb' || (extract(epoch from clock_timestamp()) * 1000)::bigint),
  -- 사람 글이라 「3/4교시」 같은 / 는 받는다(plain 대신 @·\·비밀 꼴만 거른다).
  text text not null check (char_length(btrim(text)) between 1 and 200 and text !~ '[\\@]' and text !~* '\msk-|eyJ'),
  place text not null default '' check (char_length(place) <= 30 and board.plain(place)),
  ts timestamptz not null default now()
);

-- RLS 켜기
alter table board.actors   enable row level security;
alter table board.tasks    enable row level security;
alter table board.lanes    enable row level security;
alter table board.branches enable row level security;
alter table board.services enable row level security;
alter table board.modules  enable row level security;
alter table board.goals    enable row level security;
alter table board.events   enable row level security;
alter table board.usage    enable row level security;
alter table board.runs     enable row level security;
alter table board.sprints  enable row level security;
alter table board.feedback enable row level security;

-- 읽기: 전 표 공개
do $$
declare t text;
begin
  foreach t in array array['actors','tasks','lanes','branches','services','modules','goals','events','usage','runs','sprints','feedback'] loop
    execute format('drop policy if exists board_read on board.%I', t);
    execute format('create policy board_read on board.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- 쓰기: feedback 만 authenticated insert. 나머지는 정책 없음 = service_role 만(RLS 우회).
drop policy if exists board_feedback_insert on board.feedback;
create policy board_feedback_insert on board.feedback for insert to authenticated with check (true);

grant usage on schema board to anon, authenticated, service_role;
grant select on all tables in schema board to anon, authenticated;
grant all on all tables in schema board to service_role;
grant insert (text, place) on board.feedback to authenticated; -- id·ts 는 기본값

-- Realtime (이미 등록돼 있으면 건너뜀)
do $$
declare t text;
begin
  foreach t in array array['tasks','events','feedback'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'board' and tablename = t) then
      execute format('alter publication supabase_realtime add table board.%I', t);
    end if;
  end loop;
end $$;

-- 철수 (쥔님이 친다):
--   alter publication supabase_realtime drop table board.tasks, board.events, board.feedback;
--   drop schema board cascade;
--   그다음 Settings → API → Exposed schemas 에서 board 를 뺀다.
