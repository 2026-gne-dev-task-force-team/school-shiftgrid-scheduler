-- 1.2v 서버(Supabase) 첫 마이그레이션 — 스키마 · RLS · 열 권한 (판 B1)
-- 설계: 1.2v 설계 ② Supabase 배치 2-1(스키마) · 2-2(RLS 정책 표)
--
-- 원칙
-- - 모든 표 RLS 켬. 화면(anon·authenticated)은 읽기만, 그것도 평문 열만.
-- - 쓰기는 전부 함수(service_role — RLS 를 지난다). 앱 역할엔 INSERT/UPDATE/DELETE 권한이 없다.
-- - 암호 열(*_ct · code_hash)은 열 권한에서 빠진다 → 직행 길에 아예 없다.
-- - Supabase 는 public 새 표에 anon·authenticated 에게 ALL 을 기본으로 준다(default privileges).
--   그래서 표를 만든 뒤 먼저 전부 거둬들이고(revoke all) 필요한 열만 다시 준다.

-- 0. 확장
create extension if not exists pgcrypto;

-- 1. 프로젝트(학교 시간표 한 벌)
create table public.projects (
  id          text primary key,                 -- ULID 꼴(함수가 만든다)
  name_ct     bytea not null,                   -- 학교 이름 · 암호문
  data_epoch  text not null,                    -- ETag 앞자리 · 복원 때만 바뀜 · 프로젝트별
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- 2. 구성원 (표시 이름은 여기 — auth.users 에 이름을 두지 않는다)
create table public.project_members (
  project_id  text not null references public.projects(id),
  user_id     uuid not null references auth.users(id),
  roles       text[] not null check (roles <@ array['관리자','교감','교무','보결관리자','근태담당','교사']),
  person_ref  text,                             -- 평문(UNIQUE 필요) · 사람 id
  active      boolean not null default true,
  display_ct  bytea,                            -- 표시 이름 · 암호문
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id),
  unique (project_id, person_ref)
);

-- 3. 초대 (재설정 코드는 없다 — 재설정은 Auth 몫)
create table public.invites (
  id          text primary key,
  project_id  text not null references public.projects(id),
  code_hash   bytea not null,                   -- sha256 · 원문은 응답에 한 번만
  roles       text[] not null,
  person_ref  text,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users(id),
  revoked_at  timestamptz,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- 4. 덩어리 조각
create table public.parts (
  project_id  text not null references public.projects(id),
  part        text not null,                    -- 'doc' · 'doc@<n>' · 'ops.rooms' …
  version     integer not null default 0,
  size_plain  integer not null,
  ct          bytea not null,                   -- 봉투 · 직행엔 안 보임(열 권한)
  updated_at  timestamptz not null default now(),
  primary key (project_id, part)
);

-- 5. 보결 행
create table public.sub_slot (
  id          text primary key,
  project_id  text not null references public.projects(id),
  date        date not null,
  track_name  text not null,
  start_min   integer not null,
  end_min     integer not null,
  status      text not null check (status in ('대기','확정')),
  body_ct     bytea not null,
  take_ct     bytea,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint sub_slot_uq unique (project_id, date, track_name, start_min)
);
create index sub_slot_proj_date on public.sub_slot (project_id, date);

-- 6. 특별실 예약 행
create table public.room_reservation (
  id          text primary key,
  project_id  text not null references public.projects(id),
  room_id     text not null,
  date        date not null,
  start_min   integer not null,
  end_min     integer not null,
  slot_no     integer not null,
  track_name  text not null,
  body_ct     bytea not null,
  created_at  timestamptz not null default now(),
  constraint rr_slot_uq  unique (project_id, room_id, date, start_min, slot_no),
  constraint rr_track_uq unique (project_id, room_id, date, start_min, track_name)
);

-- 7. 감사 — 추가 전용. 앱 역할엔 어떤 권한도 없다.
--    service_role 은 RLS·권한 검사를 우회하므로 「쓰기 금지」는 함수 코드가 지킨다
--    (예외: 키 회전 rewrap — 함수 admin-ops 만 암호문 열을 다시 쓴다).
create table public.audit_log (
  id          text primary key,
  project_id  text not null references public.projects(id),
  at          timestamptz not null default now(),
  module      text not null,
  action      text not null,
  target      text,
  body_ct     bytea not null
);
create index audit_proj_at on public.audit_log (project_id, at);

-- 8. 서버 메타(한 행) · server_id 는 프로젝트 ref 라 열이 없다
create table public.meta (
  one         boolean primary key default true check (one),
  db_fmt      integer not null,
  kids_in_use text[] not null default '{}'
);

-- 9. 깨우기 표(한 행)
create table public.heartbeat (
  one boolean primary key default true check (one),
  at  timestamptz not null default now()
);
insert into public.heartbeat default values;

-- 10. 도우미 — RLS 정책이 부른다(security definer · 재귀 RLS 회피)
create function public.is_member(pid text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.project_members m
                 where m.project_id = pid and m.user_id = auth.uid() and m.active)
$$;
create function public.is_admin(pid text) returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.project_members m
                 where m.project_id = pid and m.user_id = auth.uid() and m.active and '관리자' = any(m.roles))
$$;
-- 함수 실행 권한은 PUBLIC 에도 기본으로 붙는다 — anon 만 거두면 PUBLIC 경유로 여전히 부를 수 있어 PUBLIC 까지 거둔다.
revoke execute on function public.is_member(text), public.is_admin(text) from public, anon;
grant  execute on function public.is_member(text), public.is_admin(text) to authenticated, service_role;

-- 11. RLS 켜기 — 모든 표
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.invites          enable row level security;
alter table public.parts            enable row level security;
alter table public.sub_slot         enable row level security;
alter table public.room_reservation enable row level security;
alter table public.audit_log        enable row level security;
alter table public.meta             enable row level security;
alter table public.heartbeat        enable row level security;

-- 12. 표 권한 — 기본 ALL 을 앱 역할에서 모두 거둔다(쓰기 0 · 암호 열 0)
revoke all on table
  public.projects, public.project_members, public.invites, public.parts, public.sub_slot,
  public.room_reservation, public.audit_log, public.meta, public.heartbeat
from anon, authenticated;

-- 13. 열 권한 — 읽기만, 평문 열만
grant select on public.heartbeat to anon, authenticated;
grant select (id, data_epoch, created_by, created_at)
  on public.projects to authenticated;                                      -- name_ct 제외
grant select (project_id, user_id, roles, person_ref, active, created_at)
  on public.project_members to authenticated;                               -- display_ct 제외
grant select (id, project_id, roles, person_ref, expires_at, used_at, used_by, revoked_at, created_by, created_at)
  on public.invites to authenticated;                                       -- code_hash 제외
grant select (project_id, part, version, size_plain, updated_at)
  on public.parts to authenticated;                                         -- ct 제외
grant select (id, project_id, date, track_name, start_min, end_min, status, created_at, updated_at)
  on public.sub_slot to authenticated;                                      -- body_ct·take_ct 제외
grant select (id, project_id, room_id, date, start_min, end_min, slot_no, track_name, created_at)
  on public.room_reservation to authenticated;                              -- body_ct 제외
-- audit_log · meta : 앱 역할 권한 없음(관리자도 함수로)

-- 14. RLS 정책 — 읽기만. 쓰기 정책은 두지 않는다(권한도 없다).
create policy heartbeat_read on public.heartbeat
  for select to anon, authenticated using (true);
create policy projects_read on public.projects
  for select to authenticated using (public.is_member(id));
create policy members_read on public.project_members
  for select to authenticated using (user_id = auth.uid() or public.is_admin(project_id));
create policy invites_read on public.invites
  for select to authenticated using (public.is_admin(project_id));
create policy parts_read on public.parts
  for select to authenticated using (public.is_member(project_id));
create policy sub_slot_read on public.sub_slot
  for select to authenticated using (public.is_member(project_id));
create policy room_reservation_read on public.room_reservation
  for select to authenticated using (public.is_member(project_id));
