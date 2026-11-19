import pg from 'pg';
import fs from 'node:fs';

// bigint(id 등)는 pg 가 문자열로 주는데, 우리 id 는 안전 정수 범위 안이라 숫자로 받는다(비교가 어긋나던 뿌리).
pg.types.setTypeParser(20, (v) => (v == null ? v : Number(v)));

// DATE(1082)는 pg 가 서버 시각대 자정 Date 로 만들어 JSON 에서 UTC 로 하루 어긋난다(확정 날짜 11-19 → 11-18). 날짜는 문자열 그대로 쓴다.
pg.types.setTypeParser(1082, (v) => v);

// 비밀값은 환경변수보다 파일(권한 600)을 우선한다. NAME_FILE 이 있으면 그 파일 내용.
export function secret(name, fallback) {
  const f = process.env[`${name}_FILE`];
  if (f) return fs.readFileSync(f, 'utf8').trim();
  return process.env[name] ?? fallback;
}

export function databaseUrl() {
  const url = secret('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL 이 없다');
  return url;
}

export function createPool() {
  return new pg.Pool({ connectionString: databaseUrl(), max: 10 });
}
