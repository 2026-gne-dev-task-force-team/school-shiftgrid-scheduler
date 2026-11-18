#!/usr/bin/env bash
# 배포본 묶음 dist-ship/ 을 만든다. 사용: bash scripts/ship.sh
#   PLATFORM=linux/amd64 bash scripts/ship.sh   (서버가 맥과 다른 CPU 일 때 앱 이미지만 그 CPU 로 빌드)
# 묶음: school-timetable.tar(앱+postgres 이미지) · docker-compose.yml · .env.example · schema.sql · 관리자심기.sh · README.md
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER="${DOCKER:-docker}"; command -v "$DOCKER" >/dev/null || DOCKER=/usr/local/bin/docker
VER=$(grep -m1 '"version"' package.json | sed 's/.*: *"\(.*\)".*/\1/')
IMG="school-timetable:$VER"
OUT=dist-ship
START=$(date +%s)

rm -rf "$OUT" && mkdir -p "$OUT"

echo "== 앱 이미지 빌드 $IMG (웹 빌드 포함)"
"$DOCKER" build ${PLATFORM:+--platform "$PLATFORM"} -t "$IMG" .

echo "== postgres:16 이미지 확보(오프라인 설치용으로 tar 에 같이 넣는다)"
"$DOCKER" image inspect postgres:16 >/dev/null 2>&1 || "$DOCKER" pull postgres:16
ARCH_APP=$("$DOCKER" image inspect "$IMG" --format '{{.Architecture}}')
ARCH_PG=$("$DOCKER" image inspect postgres:16 --format '{{.Architecture}}')
[ "$ARCH_APP" = "$ARCH_PG" ] || echo "!! 경고: 앱($ARCH_APP)과 postgres($ARCH_PG) CPU 가 다르다. 서버 CPU 에 맞는 postgres:16 을 받아 두고 다시 돌린다."

echo "== docker save"
"$DOCKER" save -o "$OUT/school-timetable.tar" "$IMG" postgres:16

echo "== 스키마 sql 이어 붙이기(참고용·수동 적용용. 앱은 시작 때 스스로 migrate 한다)"
{
  echo "-- 우리학교 시간표 스키마 $VER (server/schema.sql + server/migrations/*.sql, 멱등)"
  cat server/schema.sql
  for f in $(ls server/migrations/*.sql | sort); do echo; echo "-- $f"; cat "$f"; done
} > "$OUT/schema.sql"

echo "== compose · .env.example · 관리자 스크립트 · README"
sed "s/__VER__/$VER/g" scripts/ship/docker-compose.ship.yml > "$OUT/docker-compose.yml"
cp scripts/ship/env.example "$OUT/.env.example"
cp scripts/ship/관리자심기.sh "$OUT/관리자심기.sh" && chmod +x "$OUT/관리자심기.sh"
sed "s/__VER__/$VER/g" scripts/ship/README.ship.md > "$OUT/README.md"

echo "== 완료: $(du -sh "$OUT/school-timetable.tar" | cut -f1) tar · $(( $(date +%s) - START ))초"
ls -l "$OUT"
