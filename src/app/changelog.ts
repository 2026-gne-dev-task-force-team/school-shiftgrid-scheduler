/** 업데이트 이력 — 빌드 때 git 로그에서 뽑은 changelog.json 을 앱이 읽는다(R79).
 *  파서는 의존 없는 순수 함수라 vite.config.ts 도 같이 쓴다. 공개 배포본에 실리니 경로·시크릿 꼴은 거른다. */
export interface ChangelogEntry {
    /** 짧은 커밋 해시(판 번호) */
    build: string
    /** 커밋 시각(ISO) */
    at: string
    /** 태스크 번호 — 예 T-10bt (없으면 빈 문자열) */
    task: string
    /** 요청 번호 — 예 R79 */
    req: string
    kind: 'fix' | 'feat'
    /** 한 줄 설명 */
    text: string
}

const HEAD = /^(T-[0-9A-Za-z]+(?:[·,][ ]?T?-?[0-9A-Za-z]+)*)(?:\(([^)]*)\))?[:：]?\s*(.*)$/
const FIX_WORDS = /고침|고친|결함|오류|버그|흔들림|오탐|깨짐|안 ?되|잘림|겹침|수정/
// 내부 경로·토큰 꼴 — 줄 전체를 버리지 않고 그 낱말만 가린다
const PRIVATE = [/[A-Za-z]:[\\/][^\s]*/g, /(?:~|\/Users|\/home)\/[^\s]*/g, /\b(?:ghp|gho|sk|xox[bp])[-_][A-Za-z0-9_-]{16,}/g]

export function scrub(s: string): string {
    return PRIVATE.reduce((t, re) => t.replace(re, '…'), s)
}

/** `git log --format=%h%x09%aI%x09%s` 출력 → 이력. 머지 커밋·태스크 번호 없는 커밋은 뺀다. */
export function parseLog(raw: string, limit = 60): ChangelogEntry[] {
    const out: ChangelogEntry[] = []
    for (const line of raw.split(/\r?\n/)) {
        const [build, at, ...rest] = line.split('\t')
        const subject = rest.join('\t').trim()
        if (!build || !at || !subject || /^Merge /.test(subject)) continue
        const m = HEAD.exec(subject)
        if (!m) continue
        const text = scrub(m[3]).trim()
        if (!text) continue
        out.push({ build, at, task: m[1], req: m[2] ?? '', kind: FIX_WORDS.test(text) ? 'fix' : 'feat', text })
        if (out.length >= limit) break
    }
    return out
}
