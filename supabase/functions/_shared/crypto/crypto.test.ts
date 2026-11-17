import { describe, expect, it } from 'vitest';
import { aadAudit, aadPart, aadProject, aadRoom, aadSub, aadUser } from './aad.ts';
import { EnvelopeError, open, openText, readKid, seal, sealText } from './envelope.ts';
import { buildKeyRing, checkKeys, KeyCheckError, parseKeys } from './keys.ts';

// 시험 키는 매번 무작위로 만든다(레포에 값을 두지 않는다).
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const newKeyLine = (kid: string) => `${kid}:${b64(crypto.getRandomValues(new Uint8Array(32)))}`;

async function ringOf(text: string) {
    return buildKeyRing(parseKeys(text));
}

const aadA = (kid: string) => aadPart('p1', 'doc', 3, kid);

describe('aad 꼴', () => {
    it('④ 2절 표대로 조립한다', () => {
        expect(aadPart('p', 'doc', 3, 'k1')).toBe('tt-ops|v1|part|p|doc|3|k1');
        expect(aadSub('p', 'i', '2026-11-17', 't', 540, 'k1', 'body')).toBe('tt-ops|v1|sub|p|i|2026-11-17|t|540|k1|body');
        expect(aadSub('p', 'i', 'd', 't', 1, 'k1', 'take').endsWith('|take')).toBe(true);
        expect(aadRoom('p', 'i', 'r', 'd', 540, 2, 't', 'k1')).toBe('tt-ops|v1|room|p|i|r|d|540|2|t|k1');
        expect(aadAudit('p', 'i', 'at', 'k1')).toBe('tt-ops|v1|audit|p|i|at|k1');
        expect(aadUser('u', 'k1')).toBe('tt-ops|v1|user|u|k1');
        expect(aadProject('p', 'k1')).toBe('tt-ops|v1|project|p|k1');
    });
    it('칸 안 | 와 빈 칸은 거부', () => {
        expect(() => aadPart('a|b', 'doc', 1, 'k1')).toThrow();
        expect(() => aadPart('', 'doc', 1, 'k1')).toThrow();
    });
});

describe('봉투 왕복', () => {
    it('봉하고 열면 같은 평문 · 바이트 배치', async () => {
        const ring = await ringOf(newKeyLine('k1'));
        const pt = crypto.getRandomValues(new Uint8Array(1000));
        const env = await seal(ring, pt, aadA);
        expect(env[0]).toBe(1);
        expect(env[1]).toBe(2);
        expect(new TextDecoder().decode(env.subarray(2, 4))).toBe('k1');
        expect(env.length).toBe(2 + 2 + 12 + 1000 + 16);
        expect(readKid(env)).toBe('k1');
        expect(await open(ring, env, aadA)).toEqual(pt);
    });
    it('글자 왕복 · iv 는 매번 다름', async () => {
        const ring = await ringOf(newKeyLine('k1'));
        const a = await sealText(ring, '보결 가나다', aadA);
        const b = await sealText(ring, '보결 가나다', aadA);
        expect(a).not.toEqual(b);
        expect(await openText(ring, a, aadA)).toBe('보결 가나다');
    });
    it('AAD 바꿔치기면 열기 실패', async () => {
        const ring = await ringOf(newKeyLine('k1'));
        const env = await sealText(ring, 'x', aadA);
        for (const other of [
            (k: string) => aadPart('p2', 'doc', 3, k),
            (k: string) => aadPart('p1', 'doc', 4, k),
            (k: string) => aadPart('p1', 'other', 3, k),
            (k: string) => aadAudit('p1', 'doc', '3', k),
        ]) {
            await expect(open(ring, env, other)).rejects.toMatchObject({ code: 'open_failed' });
        }
    });
    it('봉투 변조·잘림·모르는 kid 거부', async () => {
        const ring = await ringOf(newKeyLine('k1'));
        const env = await sealText(ring, 'x', aadA);
        const bad = env.slice();
        bad[bad.length - 1] ^= 1;
        await expect(open(ring, bad, aadA)).rejects.toBeInstanceOf(EnvelopeError);
        await expect(open(ring, env.subarray(0, 10), aadA)).rejects.toMatchObject({ code: 'bad_envelope' });
        const other = await ringOf(newKeyLine('k9'));
        await expect(open(other, env, aadA)).rejects.toMatchObject({ code: 'unknown_kid' });
    });
    it('같은 kid 에 다른 키면 열기 실패', async () => {
        const env = await sealText(await ringOf(newKeyLine('k1')), 'x', aadA);
        await expect(open(await ringOf(newKeyLine('k1')), env, aadA)).rejects.toMatchObject({ code: 'open_failed' });
    });
    it('회전: 쓰기 키는 마지막 줄, 옛 kid 봉투도 열린다', async () => {
        const k1 = newKeyLine('k1');
        const old = await sealText(await ringOf(k1), 'old', aadA);
        const ring = await ringOf(`${k1}\n${newKeyLine('k2')}\n`);
        expect(ring.writeKid).toBe('k2');
        expect(readKid(await sealText(ring, 'n', aadA))).toBe('k2');
        expect(await openText(ring, old, aadA)).toBe('old');
    });
});

const code = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (e) {
        return e instanceof KeyCheckError ? e.n : -1;
    }
    return 0;
};

describe('TT_OPS_KEYS 줄꼴 검사 넷(④ 6-1)', () => {
    const good = newKeyLine('k1');
    it('1 비밀 있음', async () => {
        for (const t of [undefined, '', '  \n ']) {
            expect(await code(checkKeys({ text: t, kidsInUse: [], sample: null }))).toBe(1);
        }
    });
    it('2 줄꼴·32바이트', async () => {
        const short = `k1:${b64(new Uint8Array(16))}`;
        const long = `k1:${b64(new Uint8Array(33))}`;
        for (const t of [short, long, 'k1', 'k1:!!!', `${good}\nzzz`, `${good}\n${good}`, `bad kid:${good.split(':')[1]}`]) {
            expect(await code(checkKeys({ text: t, kidsInUse: [], sample: null }))).toBe(2);
        }
        expect(await code(checkKeys({ text: `${good}\r\n`, kidsInUse: [], sample: null }))).toBe(0);
    });
    it('3 kids_in_use 대조', async () => {
        expect(await code(checkKeys({ text: good, kidsInUse: ['k1', 'k2'], sample: null }))).toBe(3);
        expect(await code(checkKeys({ text: good, kidsInUse: ['k1'], sample: null }))).toBe(0);
    });
    it('4 실제 열기(같은 kid 다른 키 · 빈 DB 는 건너뜀)', async () => {
        const env = await sealText(await ringOf(good), 'x', aadA);
        expect(await code(checkKeys({ text: good, kidsInUse: ['k1'], sample: { envelope: env, aadFor: aadA } }))).toBe(0);
        expect(await code(checkKeys({ text: newKeyLine('k1'), kidsInUse: ['k1'], sample: { envelope: env, aadFor: aadA } }))).toBe(4);
        expect(await code(checkKeys({ text: good, kidsInUse: ['k1'], sample: { envelope: env, aadFor: (k) => aadPart('zz', 'doc', 1, k) } }))).toBe(4);
        expect(await code(checkKeys({ text: good, kidsInUse: [], sample: null }))).toBe(0);
    });
    it('오류 메시지에 키 값이 없다', async () => {
        const val = good.split(':')[1];
        try {
            await checkKeys({ text: `k1:${val}x`, kidsInUse: [], sample: null });
        } catch (e) {
            expect(String(e)).not.toContain(val);
        }
    });
});
