// 기기 → 종족 짝(R74·T-10ca). 쥔님 판정(11-16): 공개돼도 상관없으니 기기·종족을 그냥 띄운다.
// 기기 이름 = 레인 폴더 `현황판 관리/캐릭터/<기기>.json` 의 파일 이름(맥 · 업무PC · 씽크패드 · NAS). 그 밖·모름은 값 없음(= 사람, 소품 없음).
export const RACE_OF_DEVICE = { 맥: 'elf', 업무PC: 'dwarf', 씽크패드: 'orc', NAS: 'ghost' }
const key = (d) => String(d ?? '').replace(/\s+/g, '').toLowerCase()
const TABLE = new Map(Object.entries(RACE_OF_DEVICE).map(([k, v]) => [key(k), v]).concat([['thinkpad', 'orc']]))
/** 기기 이름 → race 값. 짝이 없으면 undefined(칸을 싣지 않는다 = 사람). */
export const raceOfDevice = (device) => TABLE.get(key(device))
