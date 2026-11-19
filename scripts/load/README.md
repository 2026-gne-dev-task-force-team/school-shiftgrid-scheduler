# 부하 시험

흐름은 둘 다 같다: 로그인 → 시간표 목록 → 보결 목록.

## node (설치 불필요)
```
DATABASE_URL=postgres://... SESSION_SECRET=... VUS=20 SECS=30 node scripts/load/node-basic.js
```
시험 기관을 만들어 쓰고 끝에 지운다. 앱은 임의 포트로 따로 띄운다. 로그인 한도는 풀어 두므로 로그인 p95 는 argon2 비용만 잰다.

## k6 (설치해야 함 · 아직 안 돌려 봤음)
```
k6 run -e BASE=http://127.0.0.1:3000 -e ORG=<기관id> -e LOGIN=<아이디> -e PASS=<비번> -e VUS=20 -e DUR=30s scripts/load/k6-basic.js
```
실서버 로그인 한도(express-rate-limit)에 걸리면 429 가 난다 — 한도를 올린 시험 앱에 쏜다.
