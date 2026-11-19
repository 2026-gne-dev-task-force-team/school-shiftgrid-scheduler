#!/bin/sh
# NAS 시연판 한 번에 띄우기. 레포 루트에서: sh scripts/ship/nas-demo-up.sh
# 비밀값은 처음 한 번 NAS 안에서 무작위로 만들어 scripts/ship/.env.demo(권한 600)에만 둔다 — 화면에 안 찍는다.
set -eu
cd "$(dirname "$0")"
ENV=.env.demo
if [ ! -f "$ENV" ]; then
  umask 077
  { echo "DB_PASSWORD=$(openssl rand -hex 24)"
    echo "SESSION_SECRET=$(openssl rand -hex 32)"
    echo "DATA_KEY=$(openssl rand -hex 32)"; } > "$ENV"
  echo "비밀값 새로 만듦: scripts/ship/$ENV (잃어버리면 암호화 칸을 못 연다 — 지우지 말 것)"
fi
VER=demo-$(git rev-parse --short HEAD)
docker build -t "school-timetable:$VER" ../..
sed "s/__VER__/$VER/" docker-compose.nas-demo.yml > .compose.demo.yml
docker compose --env-file "$ENV" -f .compose.demo.yml up -d
echo "띄움: $VER — 관리자 심기는 README.ship.md, 주소는 아래(터널이 뜨는 데 10초쯤)"
sleep 10
docker logs tt-demo-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
