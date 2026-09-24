/**
 * 샘플 학교 — 처음 켰을 때 「이렇게 생겼습니다」를 보여주는 지어낸 초등학교.
 * ⛔ 실명 금지 (공개 레포). ⚠️ 지금은 빈 학교를 돌려주는 스텁이다. 껍데기 판이 채운다.
 */
import { emptyDoc, type Doc } from '../types/doc';

export function sampleDoc(): Doc {
    return emptyDoc('샘플초등학교', '2026학년도 2학기');
}
