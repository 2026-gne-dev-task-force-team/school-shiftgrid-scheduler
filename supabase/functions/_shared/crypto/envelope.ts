// ④ 2절 봉투 — AES-256-GCM. Web Crypto 만 쓴다(Deno·Node 공용).
// 봉투 바이트: 0x01 | kid 길이(1) | kid | iv(12) | 암호문+태그(16)
// 키·AAD 는 인자로 받는다 — 환경변수는 keys.ts 의 loadKeyText 하나만 읽는다.

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/** Web Crypto 가 받는 바이트 열(SharedArrayBuffer 아님) */
export type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface KeyRing {
    /** 쓰기 키 kid (TT_OPS_KEYS 의 마지막 줄) */
    writeKid: string;
    /** kid → AES 키(가져온 CryptoKey) */
    keys: ReadonlyMap<string, CryptoKey>;
}

/** AAD 는 kid 가 들어가므로 봉투 안 kid 를 받아 조립하는 함수로 받는다(aad.ts 의 함수를 감싸서 넘김). */
export type AadFor = (kid: string) => string;

export type EnvelopeErrorCode = 'bad_envelope' | 'unknown_kid' | 'open_failed';

export class EnvelopeError extends Error {
    readonly code: EnvelopeErrorCode;
    constructor(code: EnvelopeErrorCode) {
        super(code);
        this.name = 'EnvelopeError';
        this.code = code;
    }
}

/** 쓰기 키로 잠근다. iv 는 호출마다 새로 무작위. */
export async function seal(ring: KeyRing, plaintext: Bytes, aadFor: AadFor): Promise<Bytes> {
    const kid = ring.writeKid;
    const key = ring.keys.get(kid);
    if (!key) throw new EnvelopeError('unknown_kid');
    const kidBytes = enc.encode(kid);
    if (kidBytes.length === 0 || kidBytes.length > 255) throw new EnvelopeError('bad_envelope');
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: enc.encode(aadFor(kid)), tagLength: TAG_LEN * 8 },
        key, plaintext,
    ));
    const out = new Uint8Array(2 + kidBytes.length + IV_LEN + ct.length);
    out[0] = VERSION;
    out[1] = kidBytes.length;
    out.set(kidBytes, 2);
    out.set(iv, 2 + kidBytes.length);
    out.set(ct, 2 + kidBytes.length + IV_LEN);
    return out;
}

function parseHead(envelope: Bytes) {
    if (envelope.length < 2 || envelope[0] !== VERSION) throw new EnvelopeError('bad_envelope');
    const kidLen = envelope[1];
    const ivStart = 2 + kidLen;
    const ctStart = ivStart + IV_LEN;
    if (kidLen === 0 || envelope.length < ctStart + TAG_LEN) throw new EnvelopeError('bad_envelope');
    let kid: string;
    try {
        kid = new TextDecoder('utf-8', { fatal: true }).decode(envelope.subarray(2, ivStart));
    } catch {
        throw new EnvelopeError('bad_envelope');
    }
    return { kid, iv: envelope.subarray(ivStart, ctStart), ct: envelope.subarray(ctStart) };
}

/** 봉투 머리에서 kid 만 읽는다(kids 집계용). 꼴이 틀리면 bad_envelope. */
export function readKid(envelope: Bytes): string {
    return parseHead(envelope).kid;
}

/** 열기. AAD·키·봉투가 하나라도 안 맞으면 open_failed. */
export async function open(ring: KeyRing, envelope: Bytes, aadFor: AadFor): Promise<Bytes> {
    const { kid, iv, ct } = parseHead(envelope);
    const key = ring.keys.get(kid);
    if (!key) throw new EnvelopeError('unknown_kid');
    try {
        return new Uint8Array(await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData: enc.encode(aadFor(kid)), tagLength: TAG_LEN * 8 },
            key, ct,
        ));
    } catch {
        throw new EnvelopeError('open_failed');
    }
}

export const sealText = (ring: KeyRing, text: string, aadFor: AadFor) => seal(ring, new Uint8Array(enc.encode(text)), aadFor);
export const openText = async (ring: KeyRing, envelope: Bytes, aadFor: AadFor) =>
    dec.decode(await open(ring, envelope, aadFor));
