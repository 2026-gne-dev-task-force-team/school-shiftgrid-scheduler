-- 1.2v 서버 두 번째 마이그레이션 — 「한 트랜잭션이 아니다」 갈림길을 DB 에서 닫는다 (판 T-10dw)
--
-- 1. last_admin 트리거 — 프로젝트의 살아 있는 관리자가 0명이 되는 update/delete 를 막는다.
--    동시 강등(관리자 둘이 서로를 빼기)은 프로젝트 행 잠금(for no key update)으로 줄 세운 뒤 다시 세어 막는다.
-- 2. parts_put  — 판 번호(If-Match: epoch.version) 비교 · doc@n 보관 · 덮어쓰기 · 감사를 한 함수로.
-- 3. sub_register — 보결 등록 덮어쓰기(조건부 지우기 → 넣기) · 감사를 한 함수로.
-- 4. 감사 같이 쓰기 — 두 RPC 의 `p_audit jsonb`(null 이면 안 씀 · 객체 하나나 배열). 꼴은 _shared/audit.ts `DbAudit`
--    (`body_ct` 는 PostgREST 꼴 `\x<hex>` 글자).
--
-- 오류 코드 — PostgREST 는 SQLSTATE `PTxxx` 를 HTTP xxx 로 옮긴다.
--   PT409 last_admin · PT412 version_conflict · PT404 project_missing.
-- 함수는 전부 security invoker(호출자 권한 · RLS 존중). 부르는 것은 service_role 뿐이라 실행 권한도 그 역할에만 준다.

-- ── 1. last_admin ───────────────────────────────────────

create function public.tt_last_admin_guard() returns trigger
  language plpgsql set search_path = public as $$
declare
  v_left integer;
begin
  -- 살아 있는 관리자였던 줄이 그 자리를 잃을 때만 잰다(정지 · 관리자 빼기 · 지우기 · 자리 옮기기)
  if not (old.active and '관리자' = any(old.roles)) then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.active and '관리자' = any(new.roles)
     and new.project_id = old.project_id and new.user_id = old.user_id then
    return null;
  end if;
  -- 같은 프로젝트의 구성원 바꾸기를 줄 세운다 — 먼저 잡은 쪽이 끝난 뒤 새 스냅숏으로 다시 센다.
  -- (for no key update: FK 검사의 key share 와는 안 부딪힌다)
  perform 1 from public.projects where id = old.project_id for no key update;
  select count(*) into v_left from public.project_members m
   where m.project_id = old.project_id and m.active and '관리자' = any(m.roles);
  if v_left = 0 then
    raise exception 'last_admin' using errcode = 'PT409',
      detail = '마지막 관리자는 관리자 빼기·정지를 할 수 없습니다';
  end if;
  return null;
end
$$;

-- AFTER · 줄마다 — 한 문장이 여러 줄을 바꿔도 문장의 결과를 보고 센다(BEFORE 는 아직 안 바뀐 옆 줄을 센다)
create trigger project_members_last_admin
  after update or delete on public.project_members
  for each row execute function public.tt_last_admin_guard();

-- ── 4. 감사 한 줄(두 RPC 가 부른다) ──────────────────────────

create function public.tt_audit_append(p_project_id text, p_audit jsonb) returns void
  language plpgsql set search_path = public as $$
declare
  a jsonb;
begin
  if p_audit is null or jsonb_typeof(p_audit) = 'null' then
    return;
  end if;
  for a in select x from jsonb_array_elements(case when jsonb_typeof(p_audit) = 'array' then p_audit
                                                   else jsonb_build_array(p_audit) end) as t(x) loop
    if a->>'project_id' is distinct from p_project_id then
      raise exception 'audit_project_mismatch' using errcode = '22023';
    end if;
    insert into public.audit_log (id, project_id, at, module, action, target, body_ct)
    values (a->>'id', a->>'project_id', (a->>'at')::timestamptz, a->>'module', a->>'action', a->>'target',
            (a->>'body_ct')::bytea);
  end loop;
end
$$;

-- ── 2. parts_put ─────────────────────────────────────────

-- p_from = If-Match 의 version(없던 조각이면 0). p_epoch = If-Match 의 epoch.
-- p_archive_ct 가 있으면 옛 판을 `p_archive_part`(= `<part>@<p_from>`)로 먼저 남긴다 — 봉투는 이름이 AAD 에 들어가
-- 부르는 쪽이 다시 잠가 넘긴다. 같은 이름이 이미 있으면 그대로 둔다(같은 판의 같은 내용).
-- 돌려줌: 새 version. 판이 틀리면 PT412.
create function public.parts_put(
  p_project_id   text,
  p_part         text,
  p_epoch        text,
  p_from         integer,
  p_size_plain   integer,
  p_ct           bytea,
  p_archive_part text default null,
  p_archive_size integer default null,
  p_archive_ct   bytea default null,
  p_audit        jsonb default null
) returns integer
  language plpgsql security invoker set search_path = public as $$
declare
  v_epoch text;
  v_cur   integer;
begin
  -- 복원(data_epoch 바꾸기)과 줄 세운다
  select data_epoch into v_epoch from public.projects where id = p_project_id for share;
  if not found then
    raise exception 'project_missing' using errcode = 'PT404';
  end if;
  if v_epoch is distinct from p_epoch then
    raise exception 'version_conflict' using errcode = 'PT412', detail = 'epoch';
  end if;
  select version into v_cur from public.parts where project_id = p_project_id and part = p_part for update;
  if not found then
    v_cur := 0;
  end if;
  if v_cur <> p_from then
    raise exception 'version_conflict' using errcode = 'PT412', detail = v_cur::text;
  end if;

  if p_archive_ct is not null then
    if p_from = 0 or p_archive_part is distinct from p_part || '@' || p_from then
      raise exception 'archive_name_mismatch' using errcode = '22023';
    end if;
    insert into public.parts (project_id, part, version, size_plain, ct)
    values (p_project_id, p_archive_part, p_from, p_archive_size, p_archive_ct)
    on conflict (project_id, part) do nothing;
  end if;

  if p_from = 0 then
    insert into public.parts (project_id, part, version, size_plain, ct)
    values (p_project_id, p_part, 1, p_size_plain, p_ct)
    on conflict (project_id, part) do nothing;
    if not found then  -- 그 사이 다른 쪽이 첫 쓰기를 했다
      raise exception 'version_conflict' using errcode = 'PT412', detail = 'first';
    end if;
  else
    update public.parts set version = p_from + 1, size_plain = p_size_plain, ct = p_ct, updated_at = now()
     where project_id = p_project_id and part = p_part and version = p_from;
  end if;

  perform public.tt_audit_append(p_project_id, p_audit);
  return p_from + 1;
end
$$;

-- ── 3. sub_register ──────────────────────────────────────

-- p_rows   : sub_slot 줄 배열(DbSlot 꼴 · body_ct/take_ct 는 `\x<hex>`)
-- p_replace: [{id, updatedAt}] — 그대로일 때만 지운다
-- 돌려줌: 'ok' | 'conflict'(지울 줄이 그 사이 바뀜 · 유일 위반 23505). conflict 면 아무것도 안 남는다(하위 트랜잭션 되감기).
create function public.sub_register(
  p_project_id text,
  p_rows       jsonb,
  p_replace    jsonb default '[]',
  p_audit      jsonb default null
) returns text
  language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
begin
  if exists (select 1 from jsonb_array_elements(p_rows) as t(x) where x->>'project_id' is distinct from p_project_id) then
    raise exception 'row_project_mismatch' using errcode = '22023';
  end if;
  begin
    for r in select x from jsonb_array_elements(coalesce(p_replace, '[]')) as t(x) loop
      delete from public.sub_slot
       where project_id = p_project_id and id = r->>'id' and updated_at = (r->>'updatedAt')::timestamptz;
      if not found then
        raise exception 'register_race' using errcode = 'PT409';
      end if;
    end loop;
    insert into public.sub_slot (id, project_id, date, track_name, start_min, end_min, status, body_ct, take_ct, created_at, updated_at)
    select x->>'id', x->>'project_id', (x->>'date')::date, x->>'track_name', (x->>'start_min')::integer,
           (x->>'end_min')::integer, x->>'status', (x->>'body_ct')::bytea, (x->>'take_ct')::bytea,
           coalesce((x->>'created_at')::timestamptz, now()), coalesce((x->>'updated_at')::timestamptz, now())
      from jsonb_array_elements(p_rows) as t(x);
  exception
    when unique_violation or sqlstate 'PT409' then
      return 'conflict';
  end;
  -- 감사는 되감기 칸 밖 — 감사 줄의 실패(같은 id 등)를 등록 경합으로 삼키지 않는다
  perform public.tt_audit_append(p_project_id, p_audit);
  return 'ok';
end
$$;

-- ── 실행 권한 — service_role 만 ─────────────────────────────
-- (Supabase 는 public 새 함수에 anon·authenticated 실행 권한을 기본으로 준다 → PUBLIC 까지 거둔다)
revoke execute on function
  public.tt_last_admin_guard(),
  public.tt_audit_append(text, jsonb),
  public.parts_put(text, text, text, integer, integer, bytea, text, integer, bytea, jsonb),
  public.sub_register(text, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function
  public.tt_audit_append(text, jsonb),
  public.parts_put(text, text, text, integer, integer, bytea, text, integer, bytea, jsonb),
  public.sub_register(text, jsonb, jsonb, jsonb)
to service_role;
