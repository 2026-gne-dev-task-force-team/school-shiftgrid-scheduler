/**
 * 구독 .ics 받기 — 브라우저 fetch 하나. 🔴 ⛔ 외부 CORS 프록시 안 쓴다(남의 서비스 의존 금지, 쥔님 2026-11-08).
 *   webcal:// 은 https:// 로 바꿔 시도 · 막히면(CORS·네트워크) 사람 말 안내(CORS_HINT)로 떨어진다 → 그 자리에서 「파일로 넣기」.
 */
import { normalizeUrl, CORS_HINT } from './model';

export type FetchResult = { ok: true; text: string } | { ok: false; error: string };

/** url 에서 .ics 텍스트를 받는다. 실패는 던지지 않고 {ok:false,error} 로 — 호출자가 상태로 남긴다. */
export async function fetchIcs(url: string): Promise<FetchResult> {
    const target = normalizeUrl(url);
    try {
        const res = await fetch(target, { redirect: 'follow' });
        if (!res.ok) return { ok: false, error: `서버가 ${res.status} 로 답했습니다. 주소를 확인해 주세요.` };
        const text = await res.text();
        if (!/BEGIN:VCALENDAR/i.test(text)) return { ok: false, error: '받은 내용이 달력(.ics) 형식이 아닙니다.' };
        return { ok: true, text };
    } catch {
        // TypeError(CORS·네트워크) — 브라우저가 직접 못 받는 주소
        return { ok: false, error: CORS_HINT };
    }
}
