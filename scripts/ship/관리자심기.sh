#!/usr/bin/env bash
# 시스템 관리자 첫 계정을 심는다(설치 때 한 번). 사용: ./관리자심기.sh [ID] [이름]  (비밀번호는 임시로 만들어 한 번 보여 준다)
# 다른 compose 프로젝트 이름을 쓰면 .env 에 COMPOSE_PROJECT_NAME 을 적는다.
cd "$(dirname "$0")"
docker compose exec -T -e ADMIN_LOGIN_ID="${1:-admin}" -e ADMIN_NAME="${2:-${1:-admin}}" app node scripts/seed-admin.js
