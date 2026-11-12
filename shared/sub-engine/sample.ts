import type { CandInput } from './candidates'

export function sample(): CandInput {
  return {
    tracks: [
      { name: '1-1', grade: 1, lunch: { startMin: 730, endMin: 780 }, lessons: [
        { startMin: 540, endMin: 580, subject: '영어', coIds: [], teacherIds: ['S1'] },
        { startMin: 590, endMin: 630, subject: '국어', coIds: [] },
      ] },
      { name: '3-1', grade: 3, lunch: { startMin: 780, endMin: 830 }, lessons: [
        { startMin: 540, endMin: 580, subject: '체육', coIds: ['aux:9'], teacherIds: [] },
        { startMin: 590, endMin: 630, subject: '음악', coIds: [], teacherIds: ['S2'] },
      ] },
    ],
    people: [
      { id: 'homeroom:1-1', name: '김일', kind: '담임' },
      { id: 'homeroom:3-1', name: '이삼', kind: '담임' },
      { id: 'S1', name: '영어전담', kind: '전담' },
      { id: 'S2', name: '음악전담', kind: '전담' },
      { id: 'N1', name: '사서', kind: '비교과' },
      { id: 'vp', name: '교감샘', kind: '교감' },
      { id: 'aux:9', name: '튜터', kind: '보조' },
    ],
    busy: [], absent: [], taken: [],
  }
}
