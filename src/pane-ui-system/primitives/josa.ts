/**
 * 조사 붙이기 — 앞 낱말의 받침에 맞춰 「을/를」「이/가」「은/는」「과/와」「으로/로」「이라/라」를 고른다.
 *   화면에 「목록를」「목록가」가 뜨던 것(R1). 이름이 바뀌는 자리에서 조사를 글자로 박지 말고 이걸 쓴다.
 *   josa('목록', '을/를') → '목록을' · josa('파일', '으로/로') → '파일로'(ㄹ 받침은 「로」).
 *   한글이 아닌 끝 글자: 숫자는 읽는 소리로, 영문·기호는 받침 없음으로 친다(노션·대부분 앱과 같은 근사).
 */
export type JosaPair = '을/를' | '이/가' | '은/는' | '과/와' | '으로/로' | '이라/라' | '이에요/예요' | '아/야';

/** 0~9 를 읽을 때 받침이 있나(영·일·삼·육·칠·팔·십 → 있음) */
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false];
/** 0~9 를 읽을 때 받침이 ㄹ 인가(일·칠·팔) */
const DIGIT_RIEUL = [false, true, false, false, false, false, false, true, true, false];

function lastChar(word: string): string {
    const t = word.replace(/[\s)\]}"'」』>]+$/u, '');
    return t.slice(-1);
}

/** 받침 정보 — none: 없음 · rieul: ㄹ 받침 · other: 그 밖의 받침 */
export function batchim(word: string): 'none' | 'rieul' | 'other' {
    const ch = lastChar(word);
    if (!ch) return 'none';
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
        const jong = (code - 0xac00) % 28;
        if (jong === 0) return 'none';
        return jong === 8 ? 'rieul' : 'other';
    }
    if (/[0-9]/.test(ch)) {
        const d = Number(ch);
        if (!DIGIT_BATCHIM[d]) return 'none';
        return DIGIT_RIEUL[d] ? 'rieul' : 'other';
    }
    return 'none';
}

/** 조사만 고른다 */
export function pickJosa(word: string, pair: JosaPair): string {
    const [withB, withoutB] = pair.split('/');
    const b = batchim(word);
    if (pair === '으로/로') return b === 'other' ? withB : withoutB;
    return b === 'none' ? withoutB : withB;
}

/** 낱말 + 조사 */
export function josa(word: string, pair: JosaPair): string {
    return word + pickJosa(word, pair);
}
