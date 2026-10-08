import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
function harness(){
 const sheets=new Map();let locked=false,failPointer=false;
 class Sheet{
  constructor(){this.cells=new Map();this.rows=1000;}
  getRange(a,b,c=1,d=1){let row=a,col=b;if(a==='A1'){row=1;col=1;}
   const sheet=this;
   return {getValue:()=>sheet.cells.get(`${row},${col}`)||'',setValue(v){if(failPointer&&row===1){failPointer=false;throw Error('模擬指標寫入失敗');}sheet.cells.set(`${row},${col}`,v);},getValues:()=>Array.from({length:c},(_,i)=>Array.from({length:d},(_,j)=>sheet.cells.get(`${row+i},${col+j}`)||'')),setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>sheet.cells.set(`${row+i},${col+j}`,v)));}};
  }
  getLastRow(){return Math.max(0,...[...this.cells.keys()].map(k=>+k.split(',')[0]));}
  getMaxRows(){return this.rows;} insertRowsAfter(_,n){this.rows+=n;} setFrozenRows(){}
 }
 const ss={getId:()=> 'test-sheet',getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=new Sheet();sheets.set(n,s);return s;}};
 const props=new Map();const blob=data=>({getBytes:()=>Buffer.from(data),getDataAsString:()=>Buffer.from(data).toString()});
 const context=vm.createContext({console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss,openById:()=>ss,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:n=>props.get(n),setProperty:(n,v)=>props.set(n,v)})},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>crypto.createHash('sha256').update(v).digest(),base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>Buffer.from(s,'base64'),newBlob:blob,gzip:b=>blob(zlib.gzipSync(b.getBytes())),ungzip:b=>blob(zlib.gunzipSync(b.getBytes()))}});
 return {context,sheets,failPointer:()=>failPointer=true};
}
test('Apps Script 後端：交易快照、鎖定、失敗回復、重試及兩裝置衝突',async()=>{
 const h=harness();vm.runInContext(await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),h.context);
 const {setup,api}=h.context;setup();
 const op={id:'backend-add-0001',type:'add',brand:'品牌甲',model:'設備',counts:{K:5},thresholds:{}};
 h.failPointer();assert.throws(()=>api({action:'write',operation:op}),/模擬/);
 assert.equal(api({action:'read'}).items.length,0);
 let s=api({action:'write',operation:op}).state;
 assert.equal(s.items[0].count,5);assert.equal(api({action:'write',operation:op}).state.logs.length,1);
 const id=s.items[0].id;
 const a={id:'device-a-00001',type:'adjust',changes:[{id,version:1,delta:-4}]};
 const b={id:'device-b-00001',type:'adjust',changes:[{id,version:1,delta:-2}]};
 assert.equal(api({action:'write',operation:a}).state.items[0].count,1);
 const rejected=api({action:'write',operation:b});assert.equal(rejected.rejected,true);assert.match(rejected.error,/CONFLICT/);
 s=api({action:'read'});assert.equal(s.items[0].count,1);assert.equal(s.logs.length,2);
 assert.equal(api({action:'write',operation:a}).state.logs.length,2);
 assert.equal(h.sheets.get('完整異動檢視').getLastRow(),3);
});
test('產生的 Apps Script 核心與網頁共用相同交易程式',async()=>{
 const core=(await readFile(new URL('../inventory.js',import.meta.url),'utf8')).replace(/^export /gm,'');
 const generated=await readFile(new URL('../apps-script/Code.gs',import.meta.url),'utf8');assert.ok(generated.includes(core));
});
