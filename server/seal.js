import crypto from 'node:crypto';
import { secret } from './db.js';

// DB 에 두는 글(보결 사유·근태 메모)을 AES-256-GCM 으로 암호화하는 도구 — 이것 하나만 쓴다.
// 열쇠 근원은 DATA_KEY(파일 우선). 없으면 시험·개발용으로 SESSION_SECRET 첫 값, 그것도 없으면 'test-secret'.
// 새 저장 꼴: v2:<iv>:<tag>:<암호문> (base64url). 옛 v1 꼴은 읽지 않는다(거부).
const base = () => secret('DATA_KEY') || (secret('SESSION_SECRET') || '').split(',')[0] || 'test-secret';
const hk = (b) => Buffer.from(crypto.hkdfSync('sha256', b, 'school-timetable', 'secretbox-v1', 32));


const newKey = () => hk(base());

export function seal(text) {
  if (text == null || text === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', newKey(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v2', iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join(':');
}

function open(key, iv, tag, enc) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

export function unseal(blob) {
  if (!blob) return null;
  const [v, iv, tag, enc] = String(blob).split(':');
  if (v !== 'v2') return null; // v2 한 형식만
  try { return open(newKey(), iv, tag, enc); } catch { /* 깨짐 */ }
  return null; // 열쇠가 바뀌었거나 깨짐 — 글만 못 읽을 뿐 나머지는 산다
}
