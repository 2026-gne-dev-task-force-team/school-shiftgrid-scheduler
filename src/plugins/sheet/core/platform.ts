/** 단축키 안내에 쓰는 보조키 이름 — 맥은 ⌘, 그 밖은 Ctrl(학교 윈도우 PC 엔 ⌘ 가 없다). 엔진 안에서 판단한다. */
export const MOD: string =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
        ? '⌘'
        : 'Ctrl';
