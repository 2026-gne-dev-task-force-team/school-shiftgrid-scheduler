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

/** 쓰는 사람용 업데이트 소식(R125) — 버전(또는 날짜 묶음)마다 세 칸. 선생님 말로 적는다.
 *  `key`(날짜·내부 번호)는 화면에 그리지 않는 숨은 칸이다. */
export interface ReleaseNote {
    /** 숨은 칸 — 화면 글자로 안 나온다(날짜 묶음 식별·태스크 번호 따위) */
    key: string
    /** 묶음 제목(예: 11월 17일 소식) */
    title: string
    /** 좋아진 것 */
    improved: string[]
    /** 새로 쓸 수 있는 것 */
    added: string[]
    /** 눌러 볼 것 — 어디서 무엇을 누르면 되는지 한 줄 */
    tryIt: string[]
}

/** 최신이 위. 새 묶음은 맨 앞에 넣는다. */
export const RELEASE_NOTES: ReleaseNote[] = [
    {
        key: '2026-11-17 T-10g9',
        title: '11월 17일 소식',
        improved: [
            '자동 편성이 막히면 이유 옆에 「열기」 단추가 생겨, 고칠 화면으로 바로 갑니다.',
            '수업 칸이 하나도 없으면 편성을 돌리기 전에 먼저 알려 줍니다.',
            '방 예약에서 빈 방이 없으면 이유와 함께 특별실 관리로 가는 길을 안내합니다.',
            '위쪽 줄이 가벼워졌습니다. 탐색기·속성·알림은 탭 줄 오른쪽 끝 단추로 옮기고, 보결 아이콘은 하나로 합쳤습니다.',
        ],
        added: [
            '새 학년도·반을 처음부터 만들어 시작할 수 있습니다.',
            '새 버전이 나오면 알려 주고, 단추 한 번으로 새로 고칩니다.',
            '편성안을 예전(v1) 파일로 내보내 다른 곳에서 열 수 있습니다.',
        ],
        tryIt: [
            '편성이 막혔을 때: 막힘 안내 옆 「열기」를 눌러 보세요.',
            '새로 만들기 메뉴에서 「학년도·반」을 골라 보세요.',
            '화면 아래 「새 버전이 있습니다」가 뜨면 「새로 고침」을 눌러 보세요.',
            '방 예약 화면에서 「특별실 관리 열기」를 눌러 보세요.',
            '탭 줄 오른쪽 끝 단추로 탐색기·속성·알림을 켜고 꺼 보세요.',
            '편성안 화면에서 「v1 파일로 내보내기」를 눌러 보세요.',
        ],
    },
]
