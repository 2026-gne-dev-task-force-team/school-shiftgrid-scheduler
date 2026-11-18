-- 우리학교 시간표 스키마 (S-0). 여러 번 돌려도 안전하다(IF NOT EXISTS).
-- 원칙: 앱이 거부하는 건 보안뿐. DB 가 거부하는 건 「같은 것이 둘」(유일 제약)뿐이다.
-- 교사 겹침·특별실 겹침은 DB 로 막지 않는다. 지우기는 deleted_at 표시 삭제.
-- 모든 기관 데이터 표에는 org_id 가 있다(학기 딸린 표는 term_id 도).

-- ── 기관·사람 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  ilgoa_name    TEXT,                                  -- 아이좋아 표기(이름이 다를 때 맞추는 칸)
  org_code      TEXT,                                  -- 선택
  kind          TEXT NOT NULL CHECK (kind IN ('교육청','초','중')),
  status        TEXT NOT NULL DEFAULT '사용' CHECK (status IN ('사용','중지')),
  period_config JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 학년별 교시 수·점심 시각
  rule_levels   JSONB NOT NULL DEFAULT '{}'::jsonb,    -- 규칙 수위: 알림/경고/재확인/끔
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS org_name_uq ON org (name) WHERE deleted_at IS NULL;

-- 사람 하나. 기관에 매이지 않는다.
CREATE TABLE IF NOT EXISTS app_user (
  id                   BIGSERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  login_id             TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  status               TEXT NOT NULL DEFAULT '사용' CHECK (status IN ('사용','잠김')),
  failed_count         INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_login_uq ON app_user (lower(login_id));

-- 소속 한 줄 = 명단 한 줄. 겸임은 줄 둘.
CREATE TABLE IF NOT EXISTS membership (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES org(id),
  user_id    BIGINT NOT NULL REFERENCES app_user(id),
  role       TEXT NOT NULL CHECK (role IN ('시스템관리자','기관관리자','교직원','보기만')),
  duty       TEXT CHECK (duty IN ('담임','전담·비교과')),
  status     TEXT NOT NULL DEFAULT '사용' CHECK (status IN ('사용','숨김')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id, org_id)
);

-- express-session(connect-pg-simple) 이 쓰는 표
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

-- ── 학기 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS term (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES org(id),
  year       INTEGER NOT NULL,
  semester   INTEGER NOT NULL CHECK (semester IN (1,2)),
  status     TEXT NOT NULL DEFAULT '진행' CHECK (status IN ('진행','보관')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS classroom (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES org(id),
  term_id       BIGINT NOT NULL REFERENCES term(id),
  grade         INTEGER NOT NULL,
  class_no      INTEGER NOT NULL,
  homeroom_membership_id BIGINT REFERENCES membership(id),
  student_count INTEGER,                                -- 선택
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS classroom_uq ON classroom (term_id, grade, class_no) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS subject (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES org(id),
  name       TEXT NOT NULL,
  color      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS subject_uq ON subject (org_id, name) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS special_room (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES org(id),
  name       TEXT NOT NULL,
  purpose    TEXT NOT NULL DEFAULT '수업용' CHECK (purpose IN ('수업용','예약용')),
  capacity   INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS special_room_uq ON special_room (org_id, name) WHERE deleted_at IS NULL;

-- ── 편성 재료 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teaching_load (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES org(id),
  term_id         BIGINT NOT NULL REFERENCES term(id),
  membership_id   BIGINT REFERENCES membership(id),
  subject_id      BIGINT REFERENCES subject(id),
  classroom_id    BIGINT REFERENCES classroom(id),      -- NULL = 「전체」
  weekly_hours    INTEGER NOT NULL DEFAULT 0,
  sync_progress   BOOLEAN NOT NULL DEFAULT FALSE,       -- 진도 맞춤
  special_room_id BIGINT REFERENCES special_room(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS pin (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES org(id),
  term_id       BIGINT NOT NULL REFERENCES term(id),
  target_kind   TEXT NOT NULL CHECK (target_kind IN ('교사','반','특별실')),
  target_id     BIGINT NOT NULL,
  weekday       INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period        INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('고정','금지')),
  subject_id    BIGINT REFERENCES subject(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- ── 시간표 ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES org(id),
  term_id       BIGINT NOT NULL REFERENCES term(id),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT '시안' CHECK (status IN ('시안','확정')),
  starts_on     DATE,                                   -- 적용 시작일. 확정은 여럿이어도 된다
  violations    JSONB NOT NULL DEFAULT '[]'::jsonb,     -- 규칙 위반 목록(거부 아님, 표시용)
  created_by    BIGINT REFERENCES membership(id),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cell (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES org(id),
  timetable_id    BIGINT NOT NULL REFERENCES timetable(id),
  classroom_id    BIGINT NOT NULL REFERENCES classroom(id),
  weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period          INTEGER NOT NULL,
  subject_id      BIGINT REFERENCES subject(id),
  membership_id   BIGINT REFERENCES membership(id),     -- 교사
  special_room_id BIGINT REFERENCES special_room(id),
  deleted_at      TIMESTAMPTZ
);
-- 같은 시안 안 「반×요일×교시」 칸은 하나
CREATE UNIQUE INDEX IF NOT EXISTS cell_slot_uq ON cell (timetable_id, classroom_id, weekday, period) WHERE deleted_at IS NULL;

-- ── 운영 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS substitute (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT NOT NULL REFERENCES org(id),
  term_id           BIGINT NOT NULL REFERENCES term(id),
  absent_membership_id BIGINT NOT NULL REFERENCES membership(id),
  on_date           DATE NOT NULL,
  period            INTEGER NOT NULL,
  classroom_id      BIGINT REFERENCES classroom(id),
  reason_kind       TEXT,
  reason_enc        TEXT,                               -- 암호화 칸(사유 글)
  status            TEXT NOT NULL DEFAULT '열림' CHECK (status IN ('열림','맡음','취소')),
  taken_membership_id BIGINT REFERENCES membership(id), -- 맡은 사람은 한 칸 = 한 명
  taken_outside_name  TEXT,                             -- 명단 밖 이름
  grade_ab          TEXT CHECK (grade_ab IN ('A','B','C','D')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS booking (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES org(id),
  special_room_id BIGINT NOT NULL REFERENCES special_room(id),
  on_date         DATE NOT NULL,
  period          INTEGER NOT NULL,
  membership_id   BIGINT NOT NULL REFERENCES membership(id),
  classroom_id    BIGINT REFERENCES classroom(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attendance (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES org(id),
  term_id         BIGINT NOT NULL REFERENCES term(id),
  membership_id   BIGINT NOT NULL REFERENCES membership(id),
  on_date         DATE NOT NULL,
  hours           NUMERIC(4,1) NOT NULL DEFAULT 0,
  allowed_subject TEXT,
  memo_enc        TEXT,                                 -- 암호화 칸(메모)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS month_close (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES org(id),
  ym            CHAR(7) NOT NULL,                       -- YYYY-MM
  closed_by     BIGINT REFERENCES membership(id),
  closed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS month_close_uq ON month_close (org_id, ym) WHERE deleted_at IS NULL;

-- ── 기록 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  org_id     BIGINT REFERENCES org(id),
  user_id    BIGINT REFERENCES app_user(id),
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  action     TEXT NOT NULL,
  table_name TEXT,
  row_id     BIGINT,
  before     JSONB,
  after      JSONB,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log (org_id, at DESC);

-- 보결 「맡기」 동시 클릭은 먼저 누른 쪽: UPDATE ... WHERE id=$1 AND org_id=$2 AND status='열림' (S-3 에서 트랜잭션)
