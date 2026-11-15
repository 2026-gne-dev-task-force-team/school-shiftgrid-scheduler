/** 시간 틀 어댑터 — 🔴 진짜 시간표 번들 로더(T-10n)가 붙을 자리는 이 파일 한 곳이다. 지금은 가짜(시험용 마법학교 틀). */
import type { DaysPart } from '../types';
import type { TimeFrame } from './frame';
import { magicFrame } from './magicFrame';

export function daysFrame(_part: DaysPart | null): TimeFrame { return magicFrame(); }
