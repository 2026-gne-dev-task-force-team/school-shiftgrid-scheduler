/** 시간 틀 어댑터 — 앱이 들고 있는 번들(shared/bundle)에서 진짜 시간 틀을 만든다. 번들·시간표가 없으면(새 학교) 시험용 마법학교 틀로 돈다. */
import { frameInputFromBundle } from '../../../../shared/bundle/frame.ts';
import { getBundle } from '../../../../shared/bundle/store.ts';
import type { Bundle } from '../../../../shared/bundle/types.ts';
import type { DaysPart } from '../types';
import { TimeFrame } from './frame';
import { magicFrame } from './magicFrame';

export function daysFrame(_part: DaysPart | null, bundle: Bundle | null = getBundle(), date?: string): TimeFrame {
    const input = frameInputFromBundle(bundle, date);
    return input ? new TimeFrame(input) : magicFrame();
}
