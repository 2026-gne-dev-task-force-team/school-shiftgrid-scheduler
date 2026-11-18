# 우리학교 시간표 (S-0 껍데기)

- 실행: `docker compose up -d --build` → http://localhost:3000
- 관리자 심기: `ADMIN_LOGIN_ID=admin DATABASE_URL=postgres://timetable:timetable-dev@127.0.0.1:55432/timetable node scripts/seed-admin.js`
- 시험: `DATABASE_URL=... npm test` (DB 없으면 기관 경계 시험은 건너뜀)
- 권한 표 한 파일: `server/permissions.js` · 스키마: `server/schema.sql`
- 설계: 볼트 「시간표 앱 간단판 설계 (2026-11-18)」
