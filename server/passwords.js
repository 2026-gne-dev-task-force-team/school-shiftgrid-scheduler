import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 흔한 비밀번호 상위 1만(SecLists 10k-most-common) — 소문자로 비교한다
const here = path.dirname(fileURLToPath(import.meta.url));
const COMMON = new Set(fs.readFileSync(path.join(here, 'common-passwords.txt'), 'utf8').split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean));

// 규칙: 8자 이상 · 흔한 1만 거부 · 그 외 강제 없음. 문제가 없으면 null, 있으면 쥔님께 보일 한국어 문장.
export function passwordProblem(pw, loginId) {
  if (typeof pw !== 'string' || pw.length < 8) return '비밀번호는 8자 이상이어야 합니다';
  if (pw.length > 200) return '비밀번호가 너무 깁니다';
  if (COMMON.has(pw.toLowerCase())) return '너무 흔한 비밀번호입니다. 다른 것으로 정해 주세요';
  if (loginId && pw.toLowerCase() === String(loginId).toLowerCase()) return 'ID 와 같은 비밀번호는 쓸 수 없습니다';
  return null;
}

// 임시 비밀번호 8자(헷갈리는 글자 뺌). 흔한 목록에 걸리면 다시 뽑는다.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function tempPassword() {
  for (;;) {
    const t = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
    if (!COMMON.has(t)) return t;
  }
}
