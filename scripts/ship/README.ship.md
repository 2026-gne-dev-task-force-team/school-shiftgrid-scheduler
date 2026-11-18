# 우리학교 시간표 — 설치 (배포본 __VER__)

필요한 것: Docker + `docker compose`(v2). 인터넷은 필요 없다(이미지가 tar 에 다 들어 있다).
이 폴더 안에서 순서대로 친다.

1. 이미지 넣기: `docker load -i school-timetable.tar`
2. 비밀값 만들기(무작위, 한 번만): `cp .env.example .env` 한 뒤 `.env.example` 맨 위에 적힌 `sed` 한 줄을 그대로 친다.
   - `DATA_KEY` 는 잃으면 암호화된 글을 못 연다 → `.env` 를 따로 보관.
   - http 로만 시험하면 `.env` 에 `COOKIE_SECURE=false`. 운영은 HTTPS 라 기본(true) 그대로.
3. 띄우기: `docker compose up -d` (앱이 시작할 때 스키마를 스스로 적용한다. `schema.sql` 은 참고용)
4. 관리자 심기: `./관리자심기.sh admin 이름` → 화면에 나온 임시 비밀번호를 적어 둔다.
5. 브라우저로 `http://서버주소:3000`(기본은 서버 안에서만 열림 → 앞단 HTTPS 프록시 뒤에 둔다. 직접 열려면 `.env` 의 `BIND=0.0.0.0`) → 로그인 화면에서 기관 「교육청」 + ID + 임시 비밀번호 → 비밀번호 바꾸기.

## 백업 · 복원 (한 줄씩)
- 백업: `docker compose exec -T db pg_dump -U timetable timetable | gzip > 백업-$(date +%F).sql.gz`
- 복원(빈 DB 에): `gunzip -c 백업-날짜.sql.gz | docker compose exec -T db psql -U timetable timetable`
- `.env`(특히 `DATA_KEY`)도 같이 보관한다.

## 업데이트
새 배포본 폴더에서 `docker load -i school-timetable.tar` → **옛 `.env` 를 새 폴더로 복사** → `docker compose up -d`(이미지 이름이 바뀌면 새 것으로 다시 만들어진다. 데이터 볼륨은 그대로). 먼저 백업을 뜬다.

## 그 밖
- 로그: `docker compose logs -f app` · 멈춤: `docker compose down`(볼륨은 남음. `-v` 를 붙이면 DB 가 지워진다).
- 한 서버에 다른 앱이 있어 이름이 겹치면 `.env` 에 `COMPOSE_PROJECT_NAME=...` 과 `APP_PORT=...` 를 준다.
