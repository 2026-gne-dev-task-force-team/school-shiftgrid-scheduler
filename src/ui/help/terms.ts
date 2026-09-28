/**
 * 낱말 사전 — 화면에 남는 말의 단일 기준 (v0.2 · 2026-09-28).
 *
 *  기준은 하나다: 「초등 교무 선생님이 사전 없이 읽나」.
 *  개발 낱말(하드·소프트·규격·판·배치·티어·엔진·솔버·스냅샷·JSON·파라미터·Worker)은 화면에 남기지 않는다.
 *  문체는 「~합니다 · ~하세요」 격식체. 화면 요소 이름은 「」 하나로 통일한다.
 *  ⛔ 구어체(박다·집다·놓다·그만·됐다·띡) ⛔ 비유·감탄 ⛔ 「이렇게 생겼습니다」류 클로드 말투.
 *
 *  L  = 화면 라벨 상수. 같은 뜻은 반드시 같은 글자로 나오게 여기서만 가져다 쓴다.
 *  GLOSSARY = 「용어」 서랍과 낱말 밑줄(<Term id>)이 그리는 사전. 볼트 「시간표 짜기 v0.2 개선 명세」의 대응표와 같다.
 */

// ── 화면 라벨 ─────────────────────────────────────────────────
export const L = {
    app: '시간표 짜기',
    tagline: '초등학교 전담 시간표를 자동으로 배정하고 직접 조정하는 프로그램입니다.',

    // 7단계 (screens.ts 가 이 값을 쓴다)
    screen: {
        basic: '기초자료',
        blocks: '고정·금지',
        generate: '자동 배정',
        diagnose: '점검',
        edit: '직접 조정',
        boards: '시안',
        export: '인쇄·내보내기',
    },

    // 규칙 두 갈래
    hard: '필수 규칙',
    soft: '권장 규칙',
    hardShort: '필수',
    softShort: '권장',
    hardViolations: '필수 위반',     // "필수 위반 3건"
    softScore: '권장 점수',         // "권장 점수 1,234 (낮을수록 좋음)"
    softScoreHint: '낮을수록 좋음',

    // 기초자료
    spec: '시간 틀',
    track: '반',
    agent: '교사',
    activity: '과목',
    resource: '특별실',
    demandTable: '시수표',
    homeroom: '담임',
    homeroomName: '담임 이름',
    role: '역할',
    roles: { special: '전담', nonSubject: '비교과', homeroomPlus: '담임 겸 전담' },
    tier: '우선순위',
    tierOptions: { 1: '1 (부장·보직)', 2: '2 (일반)', 3: '3 (강사·지원인력)' },
    lunchSpec: '점심 기준',
    homeroomTracks: '담임반',
    hoursPerClass: '주당 시수',
    roomHours: '특별실 사용 시수',
    block: '연속 수업',
    cycle: '차시 순서 맞춤',
    coAgent: '함께 수업',
    grades: '적용 학년',
    capacity: '수용 수',

    // 고정·금지
    blockStates: { none: '', ban: '배정 불가', avoid: '되도록 피함', temp: '임시 불가' },
    fixedLesson: '고정 수업',
    pin: '잠금',
    pinned: '잠김',
    clearTemp: '임시 불가 모두 해제',

    // 자동 배정 · 점검 · 직접 조정
    candidates: '시간표 후보',
    candidateCount: '후보 수',
    budgetSec: '후보당 계산 시간(초)',
    keepPinned: '잠긴 수업은 그대로 둠',
    run: '자동 배정 시작',
    running: '배정 중…',
    recommended: '추천',
    unplaced: '미배정',
    useThis: '이 후보로 진행',
    autoImprove: '자동 개선',
    noMoreImprove: '더 개선되는 항목이 없습니다.',
    fixableOnly: '조정할 수 있는 항목만',
    lesson: '수업',           // 옛 「배치」
    select: '선택',
    deselect: '선택 해제',
    movePreview: '이동 미리보기',
    doMove: '이동',
    cancel: '취소',
    delete: '삭제',

    // 시안
    board: '시안',
    saveBoard: '시안 저장',
    restoreBoard: '이 시안으로 되돌리기',
    publish: '확정본으로 지정',
    published: '확정본',
    autoBoard: '자동 보관',

    // 파일 (웹/앱 구분은 platform.kind 로)
    save: '저장',
    saveWeb: '파일로 내려받기',
    saveAs: '다른 이름으로 저장',
    open: '파일 열기',
    newDoc: '새 학교 만들기',
    loadSample: '샘플 학교로 둘러보기',
    resume: '이어서 작업',
    workFile: '작업 파일',            // .shiftgrid.json
    autosavedWeb: '자동 저장됨 · 이 브라우저에만',
    changedSinceDownload: '내려받은 뒤 변경 있음',
    exportExcel: '엑셀로 내보내기',
    exportDemandExcel: '시수표 엑셀 내려받기',
    importExcel: '엑셀에서 불러오기',
    print: '인쇄',

    // 도움말
    help: '도움말',
    helpThisScreen: '이 화면',
    glossary: '용어',
    manual: '사용 설명서',
    tourAgain: '처음 안내 다시 보기',
    theme: { light: '밝은 화면', dark: '어두운 화면' },
} as const;

// ── 용어 사전 ─────────────────────────────────────────────────
export interface GlossaryEntry {
    id: string;
    word: string;          // 화면에 쓰는 낱말
    also?: string[];       // 같은 뜻으로 쓰이던 다른 말(검색용 · 화면엔 안 나온다)
    short: string;         // 한 문장 (밑줄 팝오버)
    long?: string;         // 두세 문장 (용어 서랍)
    screens?: (keyof typeof L.screen)[];
}

export const GLOSSARY: GlossaryEntry[] = [
    { id: 'hard', word: '필수 규칙', also: ['하드', '하드 규칙'],
        short: '반드시 지켜야 하는 규칙입니다. 하나라도 어기면 시간표가 성립하지 않습니다.',
        long: '같은 반에 수업 둘, 같은 교사가 같은 시각에 두 반, 특별실 정원 초과, 배정 불가 칸 사용, 시수 부족·초과가 여기에 속합니다. 「필수 위반 0건」이 되어야 인쇄할 수 있는 시간표입니다.',
        screens: ['diagnose', 'edit', 'generate'] },
    { id: 'soft', word: '권장 규칙', also: ['소프트', '소프트 규칙', '벌점'],
        short: '되도록 지키면 좋은 규칙입니다. 어긴 정도를 점수로 보여 주고, 낮을수록 좋습니다.',
        long: '연속 수업 제한, 공강 줄이기, 오전·오후 균형, 요일 시수 균형 같은 것입니다. 점수는 어긴 건수에 규칙의 무게와 교사 우선순위를 곱해 더한 값입니다. 0이 되지 않아도 시간표는 성립합니다.',
        screens: ['diagnose', 'edit', 'generate'] },
    { id: 'spec', word: '시간 틀', also: ['규격'],
        short: '하루의 교시 수·수업 시각·점심 위치를 정한 틀입니다. 학년군마다 하나씩 둡니다.',
        long: '1·2학년은 5교시, 3·4학년은 6교시처럼 학년마다 교시 수와 점심 시각이 다릅니다. 교사·특별실이 겹치는지는 교시 번호가 아니라 실제 시각으로 판정하므로 시간 틀이 시각을 정합니다. 「적용 학년」을 지정하면 반을 만들 때 자동으로 연결됩니다.',
        screens: ['basic'] },
    { id: 'demand', word: '시수표', also: ['수요', 'Demand'],
        short: '「어느 교사가 · 어느 학년 어느 반에 · 어느 과목을 · 주 몇 시간」을 적는 표입니다. 자동 배정의 유일한 입력입니다.',
        long: '한 줄에 교사·과목·학년·반·주당 시수를 적습니다. 반 칸에 여러 반을 고르면 반마다 한 줄씩 펼쳐집니다. 교사 칸에서 「담임」을 고르면 그 반 담임의 수업으로 들어갑니다(특별실이 필요한 담임 수업만 적습니다).',
        screens: ['basic'] },
    { id: 'homeroom', word: '담임', also: ['담임 교사', 'homeroom'],
        short: '이 프로그램에서 담임은 사람이 아니라 반의 속성입니다. 반의 빈 칸은 모두 담임 수업으로 봅니다.',
        long: '담임을 교사 명부에 넣지 않습니다. 반 탭의 「담임 이름」에 이름만 적고, 체육관·컴퓨터실처럼 특별실이 필요한 담임 수업만 시수표에서 교사를 「담임」으로 골라 적습니다. 담임이면서 다른 반 전담도 맡는 분은 「담임 겸 전담」으로 교사 탭에 넣고 담임반을 연결합니다.',
        screens: ['basic'] },
    { id: 'homeroomPlus', word: '담임 겸 전담',
        short: '자기 반 담임이면서 다른 반의 전담 수업도 맡는 교사입니다.',
        long: '교사 탭에 사람으로 넣고 「담임반」을 연결합니다. 자기 반에 다른 교사의 수업이 들어와 있는 시각에만 다른 반 수업을 할 수 있다는 필수 규칙이 자동으로 적용됩니다.',
        screens: ['basic', 'diagnose'] },
    { id: 'tier', word: '우선순위', also: ['티어', 'tier'],
        short: '교사의 희망을 얼마나 무겁게 볼지 정하는 등급입니다. 1 부장·보직, 2 일반, 3 강사·지원인력.',
        long: '권장 규칙의 점수 계산에만 쓰이고 필수 규칙과는 무관합니다. 「되도록 피함」 칸을 어겼을 때 1순위 교사는 2순위보다 훨씬 큰 점수가 붙어, 자동 배정이 먼저 배려합니다.',
        screens: ['basic'] },
    { id: 'coAgent', word: '함께 수업', also: ['협력수업', '보조인력', 'coteach'],
        short: '두 교사가 한 반 한 칸에 함께 들어가는 수업입니다(원어민+영어 전담, 스포츠강사+체육 전담).',
        long: '시수표의 「함께 수업」 칸에 둘째 교사를 고릅니다. 두 교사가 모두 비는 칸에만 배정되고, 겹침·배정 불가 칸은 두 교사 각각 검사합니다. 인쇄물에는 두 이름이 함께 나옵니다.',
        screens: ['basic'] },
    { id: 'block', word: '연속 수업', also: ['연강', '블록 수업', '연차시'],
        short: '같은 날 붙여서 하는 수업입니다. 「2」는 2시간 연속, 「2,2」는 2시간씩 두 번입니다.',
        long: '연속 수업은 같은 반·같은 날·이어지는 교시에 놓이고 사이에 점심이 끼지 않습니다. 이 묶음을 옮길 때는 묶음이 함께 움직여야 하므로 갈 수 있는 칸이 줄어듭니다.',
        screens: ['basic', 'edit'] },
    { id: 'cycle', word: '차시 순서 맞춤', also: ['순배', '라운드로빈'],
        short: '같은 교사·학년·과목에서 모든 반이 1차시를 마친 뒤에 2차시를 시작하게 맞춥니다.',
        long: '한 학년의 여러 반이 같은 진도로 나가야 하는 과목에 켭니다. 판정은 차시 번호가 아니라 실제 시각 순서로 합니다.',
        screens: ['basic'] },
    { id: 'blockState', word: '배정 불가 · 되도록 피함 · 임시 불가', also: ['배정금지', '회피', '임시금지', '금지칸'],
        short: '교사·반·특별실이 특정 요일·시각에 수업을 받을 수 없거나 피하고 싶을 때 칸에 표시합니다.',
        long: '「배정 불가」는 필수 규칙으로 절대 넣지 않습니다(부장회의·원어민 타교 출강). 「되도록 피함」은 권장 규칙으로 점수만 붙습니다. 「임시 불가」는 작업 중에만 막아 두고 나중에 한꺼번에 풉니다. 교사·특별실의 표시는 교시가 아니라 시각으로 저장됩니다.',
        screens: ['blocks'] },
    { id: 'fixed', word: '고정 수업',
        short: '창체·동아리·도움반 국어처럼 반의 칸을 미리 차지하는 수업입니다. 자동 배정이 건너뜁니다.',
        screens: ['blocks', 'edit'] },
    { id: 'pin', word: '잠금', also: ['이동금지', 'pin'],
        short: '사람이 정한 수업을 자동 배정과 자동 개선이 옮기지 못하게 합니다.',
        long: '직접 조정 화면에서 수업을 선택하고 「잠금」을 누릅니다. 잠긴 수업은 📌 표시가 붙고, 자동 배정을 다시 돌려도 그 자리에 남습니다.',
        screens: ['edit', 'blocks', 'generate'] },
    { id: 'candidate', word: '시간표 후보', also: ['후보'],
        short: '자동 배정이 만든 시간표 여러 장입니다. 그중 하나를 사람이 고릅니다.',
        long: '후보마다 필수 위반 수·권장 점수·미배정 시수가 표시됩니다. 「추천」은 그 가운데 점수가 가장 좋은 것이지만, 선택은 사용자가 합니다.',
        screens: ['generate'] },
    { id: 'budget', word: '후보당 계산 시간', also: ['예산'],
        short: '후보 한 장을 만드는 데 쓰는 시간(초)입니다. 길수록 좋은 시간표가 나오지만 오래 걸립니다.',
        screens: ['generate'] },
    { id: 'unplaced', word: '미배정',
        short: '시수표에 적었지만 아직 시간표에 놓이지 않은 시간입니다. 자동 배정 전에는 모두 미배정이 정상입니다.',
        screens: ['generate', 'basic'] },
    { id: 'autoImprove', word: '자동 개선', also: ['자동 조정'],
        short: '지금 시간표를 최대한 유지하면서 규칙 위반만 줄입니다. 처음부터 다시 짜지 않습니다.',
        screens: ['diagnose'] },
    { id: 'fixable', word: '조정할 수 있는 항목', also: ['고칠 수 있는 것', 'fixable'],
        short: '사람이 옮겨서 해결할 여지가 있는 위반입니다. 구조적으로 어쩔 수 없는 것은 따로 표시됩니다.',
        screens: ['diagnose'] },
    { id: 'board', word: '시안', also: ['판', 'Board', '작업저장'],
        short: '지금 시간표 전체를 이름을 붙여 보관한 것입니다. 여러 시안을 비교해 하나를 확정본으로 지정합니다.',
        long: '「1차 시안」「부장 회의 반영」처럼 이름을 붙여 저장합니다. 자동 배정·자동 개선·되돌리기 때는 자동 보관 시안이 저절로 쌓입니다. 어느 시안으로든 되돌릴 수 있습니다.',
        screens: ['boards'] },
    { id: 'published', word: '확정본', also: ['공개본'],
        short: '여러 시안 가운데 학교에 배부할 것으로 정한 시안입니다.',
        screens: ['boards'] },
    { id: 'workFile', word: '작업 파일', also: ['JSON', '.shiftgrid.json'],
        short: '학교 하나의 자료·시간표·시안 전부를 담은 파일(.shiftgrid.json)입니다. 다른 컴퓨터에서 열 수 있습니다.',
        long: '웹 버전에서는 「파일로 내려받기」로 컴퓨터에 저장합니다. 브라우저 자동 저장은 이 브라우저에만 남고, 브라우저 자료를 지우면 사라지므로 작업 파일을 꼭 내려받아 두세요.',
        screens: ['export'] },
    { id: 'capacity', word: '수용 수',
        short: '특별실에 같은 시각에 들어갈 수 있는 반의 수입니다. 과학실이 2개면 2입니다.',
        screens: ['basic'] },
    { id: 'lunchSpec', word: '점심 기준',
        short: '이 교사가 점심을 맞춰야 하는 시간 틀입니다. 급식지도 등으로 특정 학년 점심에 맞춰야 할 때 지정합니다.',
        screens: ['basic'] },
];

export const glossaryById = (id: string): GlossaryEntry | undefined => GLOSSARY.find((g) => g.id === id);
