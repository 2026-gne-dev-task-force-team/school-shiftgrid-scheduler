import { useState, useRef, useEffect } from 'react';
import {
  ALL_RESOURCES, TEACHERS, SUBJECTS, ROOMS, DAYS, PERIODS, CLASSES,
  buildSampleGrid,
  type Resource,
} from '../data/sampleData';

// ── 타입 ──────────────────────────────────────────────────────
interface CellEntry {
  resource: Resource;
}

type GridKey = string; // `${classId}-${day}-${period}`
type Grid = Record<GridKey, CellEntry[]>;

// ── 유틸 ─────────────────────────────────────────────────────
const cellKey = (cls: string, day: string, period: number) => `${cls}-${day}-${period}`;

const categoryLabel: Record<Resource['category'], string> = {
  teacher: '교사',
  subject: '교과',
  room: '특별실',
};

const categoryBg: Record<Resource['category'], string> = {
  teacher: 'bg-blue-50 border-blue-200',
  subject: 'bg-purple-50 border-purple-200',
  room: 'bg-emerald-50 border-emerald-200',
};

// ── 칩 컴포넌트 ───────────────────────────────────────────────
function Chip({ entry, onRemove }: { entry: CellEntry; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap max-w-full"
      style={{ backgroundColor: entry.resource.color }}
    >
      {entry.resource.name}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="opacity-70 hover:opacity-100 leading-none"
      >
        ×
      </button>
    </span>
  );
}

// ── 자동완성 드롭다운 ─────────────────────────────────────────
function Autocomplete({
  query,
  onSelect,
  onClose,
}: {
  query: string;
  onSelect: (r: Resource) => void;
  onClose: () => void;
}) {
  const q = query.trim().toLowerCase();
  const results = q
    ? ALL_RESOURCES.filter((r) => r.name.includes(q) || (r.sub ?? '').includes(q))
    : ALL_RESOURCES.slice(0, 12);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (results.length === 0) return null;

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
      {results.map((r) => (
        <button
          key={r.id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(r); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left"
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: r.color }}
          />
          <span className="font-medium text-slate-800">{r.name}</span>
          <span className="ml-auto text-xs text-slate-400">{categoryLabel[r.category]}</span>
        </button>
      ))}
    </div>
  );
}

// ── 셀 컴포넌트 ───────────────────────────────────────────────
function Cell({
  entries,
  onAdd,
  onRemove,
  onDrop,
}: {
  entries: CellEntry[];
  onAdd: (r: Resource) => void;
  onRemove: (idx: number) => void;
  onDrop: (r: Resource) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSelect = (r: Resource) => {
    onAdd(r);
    setQuery('');
    setEditing(false);
  };

  return (
    <div
      className={`relative min-h-[56px] p-1 border border-slate-200 rounded cursor-pointer transition-colors
        ${dragOver ? 'bg-blue-50 border-blue-400' : 'hover:bg-slate-50'}`}
      onClick={() => setEditing(true)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('resourceId');
        const r = ALL_RESOURCES.find((x) => x.id === id);
        if (r) onDrop(r);
      }}
    >
      <div className="flex flex-col items-start gap-0.5">
        {entries.map((entry, i) => (
          <Chip key={i} entry={entry} onRemove={() => onRemove(i)} />
        ))}
      </div>

      {editing && (
        <div className="relative mt-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => { setEditing(false); setQuery(''); }}
            placeholder="검색..."
            className="w-full text-xs border border-blue-300 rounded px-2 py-1 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
          <Autocomplete
            query={query}
            onSelect={handleSelect}
            onClose={() => { setEditing(false); setQuery(''); }}
          />
        </div>
      )}
    </div>
  );
}

// ── 왼쪽 사이드바 ─────────────────────────────────────────────
function LeftPanel({
  selectedClass,
  onSelectClass,
}: {
  selectedClass: string;
  onSelectClass: (c: string) => void;
}) {
  return (
    <aside className="w-36 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col">
      <div className="px-3 py-3 border-b border-slate-200">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">학반</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {CLASSES.map((cls) => (
          <button
            key={cls}
            onClick={() => onSelectClass(cls)}
            className={`w-full text-left px-3 py-2 text-sm transition-colors
              ${selectedClass === cls
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {cls}반
          </button>
        ))}
      </div>
    </aside>
  );
}

// ── 오른쪽 리소스 패널 ────────────────────────────────────────
function RightPanel() {
  const sections = [
    { label: '교사', items: TEACHERS },
    { label: '교과', items: SUBJECTS },
    { label: '특별실', items: ROOMS },
  ];

  return (
    <aside className="w-44 flex-shrink-0 bg-slate-50 border-l border-slate-200 flex flex-col overflow-y-auto">
      {sections.map(({ label, items }) => (
        <div key={label}>
          <div className="px-3 py-2 border-b border-slate-200 bg-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
          </div>
          {items.map((r) => (
            <div
              key={r.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('resourceId', r.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-grab active:cursor-grabbing
                border-b border-slate-100 hover:bg-white ${categoryBg[r.category]}`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-slate-800 font-medium truncate">{r.name}</span>
              {r.sub && <span className="ml-auto text-xs text-slate-400">{r.sub}</span>}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

// ── 메인 에디터 ───────────────────────────────────────────────
export default function TimetableEditor() {
  const [selectedClass, setSelectedClass] = useState(CLASSES[0]);
  const [grid, setGrid] = useState<Grid>(() => buildSampleGrid());

  const getEntries = (day: string, period: number): CellEntry[] =>
    grid[cellKey(selectedClass, day, period)] ?? [];

  const addEntry = (day: string, period: number, r: Resource) => {
    const key = cellKey(selectedClass, day, period);
    setGrid((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), { resource: r }],
    }));
  };

  const removeEntry = (day: string, period: number, idx: number) => {
    const key = cellKey(selectedClass, day, period);
    setGrid((prev) => {
      const next = [...(prev[key] ?? [])];
      next.splice(idx, 1);
      return { ...prev, [key]: next };
    });
  };

  return (
    <div className="h-screen flex flex-col bg-white text-slate-800">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white">
        <h1 className="text-base font-bold text-slate-800">시간표 에디터</h1>
        <span className="text-sm text-slate-500">{selectedClass}반 시간표</span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽 학반 목록 */}
        <LeftPanel selectedClass={selectedClass} onSelectClass={setSelectedClass} />

        {/* 가운데 그리드 */}
        <main className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-12 py-2 text-xs text-slate-400 font-medium">교시</th>
                {DAYS.map((day) => (
                  <th key={day} className="py-2 text-xs font-semibold text-slate-600 text-center">
                    {day}요일
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((period) => (
                <tr key={period}>
                  <td className="text-center text-xs text-slate-400 font-medium py-1 pr-2">
                    {period}교시
                  </td>
                  {DAYS.map((day) => (
                    <td key={day} className="p-1">
                      <Cell
                        entries={getEntries(day, period)}
                        onAdd={(r) => addEntry(day, period, r)}
                        onRemove={(idx) => removeEntry(day, period, idx)}
                        onDrop={(r) => addEntry(day, period, r)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </main>

        {/* 오른쪽 리소스 패널 */}
        <RightPanel />
      </div>
    </div>
  );
}
