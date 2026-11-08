/**
 * 레코드 뷰 연습장 — 공통 목록 화면 부품을 눈으로 만져 보는 자리.
 *   🔴 이 뷰가 자료를 쥔다(연습용) — 바꾼 내용은 저장하지 않는다(새로 열면 처음으로). 보기 상태(정렬·필터·숨긴 칸·칸 폭)만 남는다.
 *   ⛔ 색은 토큰 클래스만(구조 검사 ①) · 실명은 안 쓴다(가짜 이름 — 홍길동·성춘향…).
 */
import { useRef, useState } from 'react';
import { RecordView } from '../../../pane-ui-system';
import type { RecordCellValue, RecordField } from '../../../pane-ui-system';

/** 교직원 비슷한 가짜 자료 — 칸 여섯(글자·고르기·여러 개·날짜·체크) */
const START_FIELDS: RecordField[] = [
    { key: 'name', label: '이름', type: 'text', width: 110 },
    { key: 'dept', label: '부서', type: 'select', width: 120, options: [
        { value: 'admin', label: '행정지원과', color: 'blue' },
        { value: 'edu', label: '교육지원과', color: 'green' },
        { value: 'fin', label: '재무과', color: 'orange' },
    ] },
    { key: 'rank', label: '직급', type: 'select', width: 90, options: [
        { value: 'g7', label: '7급', color: 'purple' },
        { value: 'g8', label: '8급', color: 'teal' },
        { value: 'g9', label: '9급', color: 'pink' },
    ] },
    { key: 'duties', label: '담당업무', type: 'multi', width: 200, options: [
        { value: 'pc', label: '전산', color: 'blue' },
        { value: 'doc', label: '문서', color: 'brown' },
        { value: 'budget', label: '예산', color: 'orange' },
        { value: 'edu', label: '교육', color: 'green' },
    ] },
    { key: 'joined', label: '임용일', type: 'date', width: 130 },
    { key: 'score', label: '점수', type: 'number', width: 80 },
    { key: 'active', label: '재직', type: 'check', width: 60 },
];

interface Person {
    id: string;
    name: string;
    dept: string;
    rank: string;
    duties: string[];
    joined: string;
    score: number | null;
    active: boolean;
}

const START_ROWS: Person[] = [
    { id: 'p1', name: '홍길동', dept: 'admin', rank: 'g8', duties: ['pc', 'doc'], joined: '2019-03-02', score: 88, active: true },
    { id: 'p2', name: '성춘향', dept: 'edu', rank: 'g7', duties: ['edu'], joined: '2015-09-01', score: 92, active: true },
    { id: 'p3', name: '이몽룡', dept: 'fin', rank: 'g9', duties: ['budget', 'doc'], joined: '2022-01-10', score: null, active: true },
    { id: 'p4', name: '임꺽정', dept: 'admin', rank: 'g9', duties: [], joined: '2021-07-15', score: 74, active: false },
    { id: 'p5', name: '전우치', dept: 'edu', rank: 'g8', duties: ['pc', 'edu'], joined: '2018-05-20', score: 81, active: true },
    { id: 'p6', name: '심청', dept: 'fin', rank: 'g7', duties: ['budget'], joined: '2013-11-03', score: 95, active: false },
];

let seq = 0;

export function PlaygroundView() {
    const [fields, setFields] = useState<RecordField[]>(START_FIELDS);
    const [rows, setRows] = useState<Person[]>(START_ROWS);
    const addSeq = useRef(0);

    const onCellChange = (id: string, key: string, value: RecordCellValue) => {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    };
    const onAddRecord = () => {
        const id = `new${addSeq.current++}_${seq++}`;
        setRows((rs) => [...rs, { id, name: '', dept: '', rank: '', duties: [], joined: '', score: null, active: false }]);
    };
    const onDeleteRecords = (ids: string[]) => {
        const kill = new Set(ids);
        setRows((rs) => rs.filter((r) => !kill.has(r.id)));
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex flex-col gap-0.5 px-3 pt-3 pb-2 shrink-0">
                <span className="font-medium text-text">레코드 뷰 연습장</span>
                <span className="text-[12px] text-muted">
                    셀을 눌러 고치고, 체크 칸은 눌러 켜고, 고르기·날짜 칸은 눌러 메뉴에서 고릅니다.
                    위 막대로 검색·필터·정렬·칸 숨기기를, 칸 머리 「⋯」로 정렬·이름·타입·삭제를, 오른쪽 끝을 끌어 칸 폭을 바꿉니다.
                    바꾼 자료는 저장되지 않지만, 보기 상태(정렬·필터·숨긴 칸)는 새로 고쳐도 남습니다.
                </span>
            </div>
            <div className="flex-1 min-h-0">
                <RecordView<Person>
                    fields={fields}
                    records={rows}
                    getId={(r) => r.id}
                    viewKey="playground.list"
                    onCellChange={onCellChange}
                    onAddRecord={onAddRecord}
                    onDeleteRecords={onDeleteRecords}
                    onOpenRecord={(id) => window.alert(`열기: ${id}`)}
                    onFieldsChange={setFields}
                />
            </div>
        </div>
    );
}
