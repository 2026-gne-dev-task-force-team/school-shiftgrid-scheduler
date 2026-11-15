/** 시간 틀 어댑터 — 🔴 진짜 시간표 번들 로더가 붙을 자리는 이 파일 한 곳이다. 지금은 가짜(시험용 마법학교 틀). */
import { magicFrame } from '../../../../shared/import/magicFrame.ts';
import type { TimeFrame } from '../../../../shared/import/frame.ts';

export function roomFrame(): TimeFrame { return magicFrame(); }
