-- 시험 전용 — Supabase 흉내 바닥(PGlite 위). 실 Supabase 엔 이미 있으니 마이그레이션엔 넣지 않는다.
-- 역할 셋 · auth 스키마 · auth.uid() · auth.users 최소 표 · public 새 표 기본 권한(Supabase 와 같게 ALL).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text
);

-- 실 Supabase 의 auth.uid() 와 같은 뜻: JWT sub 클레임(없으면 null)
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Supabase 기본: public 에 새로 만든 표·함수·시퀀스는 세 역할에 ALL
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
