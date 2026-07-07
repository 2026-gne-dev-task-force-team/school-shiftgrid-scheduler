export type Category = 'teacher' | 'subject' | 'room';

export interface Resource {
  id: string;
  name: string;
  color: string;
  category: Category;
  sub?: string;
}

export const TEACHERS: Resource[] = [
  { id: 't1', name: '김민준', color: '#4F7CFF', category: 'teacher', sub: '수학' },
  { id: 't2', name: '이서연', color: '#FF6B6B', category: 'teacher', sub: '국어' },
  { id: 't3', name: '박지훈', color: '#2ECC71', category: 'teacher', sub: '과학' },
  { id: 't4', name: '최유나', color: '#9B59B6', category: 'teacher', sub: '영어' },
  { id: 't5', name: '정현우', color: '#F39C12', category: 'teacher', sub: '체육' },
  { id: 't6', name: '강수아', color: '#E91E63', category: 'teacher', sub: '음악' },
  { id: 't7', name: '윤도현', color: '#00BCD4', category: 'teacher', sub: '미술' },
  { id: 't8', name: '임지원', color: '#795548', category: 'teacher', sub: '사회' },
];

export const SUBJECTS: Resource[] = [
  { id: 's1', name: '수학', color: '#4F7CFF', category: 'subject' },
  { id: 's2', name: '국어', color: '#FF6B6B', category: 'subject' },
  { id: 's3', name: '과학', color: '#2ECC71', category: 'subject' },
  { id: 's4', name: '영어', color: '#9B59B6', category: 'subject' },
  { id: 's5', name: '체육', color: '#F39C12', category: 'subject' },
  { id: 's6', name: '음악', color: '#E91E63', category: 'subject' },
  { id: 's7', name: '미술', color: '#00BCD4', category: 'subject' },
  { id: 's8', name: '사회', color: '#795548', category: 'subject' },
];

export const ROOMS: Resource[] = [
  { id: 'r1', name: '과학실', color: '#2ECC71', category: 'room' },
  { id: 'r2', name: '체육관', color: '#F39C12', category: 'room' },
  { id: 'r3', name: '음악실', color: '#E91E63', category: 'room' },
  { id: 'r4', name: '미술실', color: '#00BCD4', category: 'room' },
  { id: 'r5', name: '컴퓨터실', color: '#607D8B', category: 'room' },
];

export const ALL_RESOURCES: Resource[] = [...TEACHERS, ...SUBJECTS, ...ROOMS];

export const DAYS = ['월', '화', '수', '목', '금'];
export const PERIODS = [1, 2, 3, 4, 5, 6];
export const CLASSES = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2'];
