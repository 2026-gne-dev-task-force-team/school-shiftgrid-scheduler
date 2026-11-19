// web 빌드 뒤 dist 의 js·css·html·svg 를 .gz·.br 로 미리 압축한다(새 의존성 없이 node:zlib).
// 실행: node scripts/precompress.js [dist 폴더]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = path.resolve(process.argv[2] || 'dist');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let n = 0;
for (const f of walk(dist)) {
  if (!/\.(js|css|html|svg)$/.test(f)) continue;
  const buf = fs.readFileSync(f);
  fs.writeFileSync(f + '.gz', zlib.gzipSync(buf, { level: 9 }));
  fs.writeFileSync(f + '.br', zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
  n++;
}
console.log(`미리 압축 ${n}개 (${dist})`);
