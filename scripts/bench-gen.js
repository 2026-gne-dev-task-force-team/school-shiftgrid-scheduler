// 자동 생성 시간 재기 — 웹 워커 핵심 함수를 node 에서 그대로 돌린다(가짜 51반 · 전담 11).
// 실행: node scripts/bench-gen.js [후보 수=8] [후보당 ms=3000]
import { generate } from '../web/src/gen/core.js';
import { sampleSchool } from '../web/src/gen/sample.js';
import { makeSoftScore } from '../web/src/gen/soft-adapter.js';

const k = Number(process.argv[2] || 8);
const perMs = Number(process.argv[3] || 3000);
const input = sampleSchool();
// 시료엔 티어가 없다 — 전담(900번대)은 티어 2 · 담임(100번대 + 반 id)은 티어 3 으로 놓고 잰다
input.tiers = Object.fromEntries(input.lines.map((l) => [l.membership_id, l.membership_id >= 900 ? 2 : 3]));
const hours = input.lines.reduce((a, l) => a + l.weekly_hours, 0);
console.log(`입력: 반 ${input.classrooms.length} · 시수 줄 ${input.lines.length} · 총 시수 ${hours} · 고정/금지 ${input.pins.length} · 권장 점수 soft.js(기본 가중)`);
const r = generate(input, { k, perMs, seed: 42, softScore: makeSoftScore(input), onProgress: (p) => process.stdout.write(`  후보 ${p.done}/${p.k}: 못 놓은 시수 ${p.hard} · 진도 위반 ${p.rr}\n`) });
const best = r.candidates[0];
console.log(`전체 ${(r.ms / 1000).toFixed(2)}초 (목표 24초 안) · 최선: 못 놓은 시수 ${best.hard} · 진도 위반 ${best.rr} · 권장 점수 ${best.soft} · 칸 ${best.cells.length}`);
console.log(`후보별 [ms/권장점수]: ${r.candidates.map((c) => `${c.ms}/${c.soft}`).join(' ')}`);
process.exit(r.ms <= 24000 ? 0 : 1);
