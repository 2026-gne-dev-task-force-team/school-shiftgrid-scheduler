export const D='/Users/mellbrown/Desktop/gne-dev-task/sg-gf/qa-eve/gf/';
export function makeNodes(){
  const nodes:any[]=[]; const rootKids:string[]=[];
  const tk='f_title', nk='f_num';
  for(let f=1;f<=10;f++){
    const fid='nf'+String(f).padStart(2,'0'); const kids:string[]=[];
    for(let i=1;i<=98;i++){ const id=`nn${f}_${i}`; kids.push(id); nodes.push({id,type:'page.page',name:`노트 F${String(f).padStart(2,'0')}-${String(i).padStart(3,'0')}`,children:[]}); }
    nodes.push({id:fid,type:'folder',name:`폴더F${String(f).padStart(2,'0')}`,children:kids,collapsed:true}); rootKids.push(fid);
  }
  const rows:string[]=[];
  for(let i=1;i<=1000;i++){ const id='nr'+i; rows.push(id);
    nodes.push({id,type:'collection.row',name:`행${String(i).padStart(4,'0')}`,children:[],data:{v:1,values:{[tk]:`행${String(i).padStart(4,'0')}`,[nk]:i},created:'2026-11-10T20:47',updated:'2026-11-10T20:47',seq:i}}); }
  nodes.push({id:'ncoll',type:'collection.db',name:'큰컬렉션',children:rows,data:{v:1,fields:[{key:tk,label:'제목',type:'text',locked:true},{key:nk,label:'수',type:'number'}],titleKey:tk,views:[{id:'v_main',name:'표',kind:'table',filter:{and:[]},sorts:[],columns:[{key:tk},{key:nk}]}],seq:1001}});
  rootKids.push('ncoll');
  nodes.push({id:'ncal',type:'calendar.store',name:'기본',children:['nev']});
  nodes.push({id:'nev',type:'calendar.event',name:'매일 반복',children:[],data:{values:{when:{start:'2024-01-01T10:00',end:'2024-01-01T11:00',pattern:{rules:[{freq:'daily',until:'2026-12-31'}]}}}}});
  rootKids.push('ncal');
  nodes.push({id:'root',type:'folder',name:'루트',children:rootKids});
  nodes.push({id:'trash',type:'folder',name:'휴지통',children:[]});
  nodes.push({id:'__meta',root:'root',trash:'trash',rev:1});
  return nodes;
}
export async function seed(page:any){
  await page.goto('/'); await page.waitForTimeout(2500);
  const nodes=makeNodes();
  await page.evaluate((nodes:any[])=>new Promise<void>((res,rej)=>{const q=indexedDB.open('shiftgrid.v2.kv');q.onerror=()=>rej(q.error);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('nodes','readwrite');const s=tx.objectStore('nodes');s.clear();nodes.forEach(n=>s.put(n));tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>rej(tx.error)}}),nodes);
  return nodes.length;
}
// 입력 이벤트 시각(캡처)부터 조건 충족 + 두 프레임 뒤까지 — 반환은 window.__res
export async function arm(page:any,pred:string,types:string[]){
  await page.evaluate(([pred,types]:[string,string[]])=>{
    (window as any).__res=null; const w:any=window; const fn=new Function('return ('+pred+')');
    const poll=()=>{ if(fn()) requestAnimationFrame(()=>requestAnimationFrame(()=>{w.__res=performance.now()-w.__t0})); else requestAnimationFrame(poll) };
    const h=(e:Event)=>{ w.__t0=e.timeStamp; types.forEach(t=>removeEventListener(t,h,true)); poll() };
    types.forEach(t=>addEventListener(t,h,true));
  },[pred,types]);
}
export async function result(page:any,ms=8000){
  await page.waitForFunction(()=>(window as any).__res!=null,null,{timeout:ms}).catch(()=>{});
  return page.evaluate(()=>(window as any).__res);
}
export const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
export const heap=(page:any)=>page.evaluate(()=>Math.round((performance as any).memory.usedJSHeapSize/1048576*10)/10);
