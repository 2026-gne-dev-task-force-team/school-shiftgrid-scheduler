import { test } from '@playwright/test';
import { seed, arm, result, med, D } from './lib';
import * as fs from 'fs';
test('p', async ({ browser }) => {
  test.setTimeout(100000);
  const ctx=await browser.newContext({viewport:{width:1280,height:800}}); const page=await ctx.newPage(); ctx.setDefaultTimeout(4000);
  await seed(page); await page.reload(); await page.locator('[data-row-id=nf01]').waitFor(); await page.waitForTimeout(1500);
  const sel=(f:number)=>`[data-row-id=nf${String(f).padStart(2,'0')}] [aria-label="펴기"], [data-row-id=nf${String(f).padStart(2,'0')}] [aria-label="접기"]`;
  const cdp=await ctx.newCDPSession(page);
  const ms:number[]=[];
  for(let i=0;i<3;i++){ const f=i+1; await arm(page,`!!document.querySelector('[data-row-id="nn${f}_1"]')`,['click']); await page.locator(sel(f)).click(); ms.push(await result(page)); await page.waitForTimeout(300); await page.locator(sel(f)).click(); await page.waitForTimeout(400); }
  console.log('MS',JSON.stringify(ms),med(ms));
  // 프로파일 1회
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval',{interval:200}); await cdp.send('Profiler.start');
  await page.locator(sel(4)).click(); await page.waitForTimeout(1500);
  const {profile}:any=await cdp.send('Profiler.stop');
  const nodes=new Map<number,any>(profile.nodes.map((n:any)=>[n.id,n])); const self=new Map<string,number>();
  profile.samples.forEach((id:number,i:number)=>{const n=nodes.get(id); const cf=n.callFrame; const k=`${cf.functionName||'(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber}`; self.set(k,(self.get(k)||0)+profile.timeDeltas[i]/1000)});
  console.log([...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,v])=>v.toFixed(0)+'ms '+k).join('\n'));
  fs.writeFileSync(D+'prof.json',JSON.stringify(profile));
});
