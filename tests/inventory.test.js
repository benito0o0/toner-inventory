import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, applyOperation, conflicts, rebase, filterLogs, readLegacy } from '../inventory.js';
const now='2026-10-09T04:00:00Z';
const add=(id='create-00001',counts={K:5,C:3,M:0,Y:2})=>({id,type:'add',brand:'品牌甲',model:'型號一',counts,thresholds:{K:2}});
const seed=()=>applyOperation(emptyState(),add(),now);
test('新增單色與四色、初始量、門檻、禁止重複與錯誤數值',()=>{
 const s=seed(); assert.equal(s.items.length,4);assert.equal(s.items[0].threshold,2);
 assert.throws(()=>applyOperation(s,add('duplicate-0001'),now),/重複/);
 const mono=applyOperation(s,{...add('mono-000001',{K:0}),model:'型號二'},now);
 assert.equal(mono.items.length,5);assert.equal(mono.items.at(-1).count,0);
 for(const counts of [{C:1},{K:-1},{K:1.5},{K:1000000001}])assert.throws(()=>applyOperation(emptyState(),add('invalid-0001',counts),now));
});
test('暫存與取消不寫入；零庫存品項保留；每個變更品項有獨立紀錄',()=>{
 const s=seed(),original=JSON.stringify(s);
 const drafts={[s.items[0].id]:{base:5,version:1,delta:-5}};
 assert.equal(JSON.stringify(s),original);delete drafts[s.items[0].id];assert.equal(s.logs.length,4);
 const next=applyOperation(s,{id:'save-0000001',type:'adjust',changes:[{id:s.items[0].id,version:1,delta:-5},{id:s.items[1].id,version:1,delta:2}]},now);
 assert.equal(next.items.length,4);assert.equal(next.items[0].count,0);assert.equal(next.logs.length,6);
 assert.deepEqual(next.logs.slice(-2).map(l=>[l.delta,l.before,l.after]),[[-5,5,0],[2,3,5]]);
 assert.equal(JSON.stringify(s),original);
});
test('兩裝置同時扣款：版本衝突阻止覆蓋，重新套用阻止負庫存，整筆交易失敗不漏記',()=>{
 const s=seed(),id=s.items[0].id;
 const a={id:'device-a-0001',type:'adjust',changes:[{id,version:1,delta:-4}]};
 const b={id:'device-b-0001',type:'adjust',changes:[{id,version:1,delta:-3}]};
 const shared=applyOperation(s,a,now);
 assert.throws(()=>applyOperation(shared,b,now),/CONFLICT/);
 const draft={[id]:{base:5,version:1,delta:-3}};
 assert.deepEqual(conflicts(shared,draft),[id]);assert.equal(draft[id].delta,-3);
 assert.throws(()=>rebase(shared,draft),/負庫存/);
 assert.throws(()=>applyOperation(shared,{...b,changes:[{id:s.items[1].id,version:1,delta:1},{id,version:1,delta:-1}]},now),/CONFLICT/);
 assert.equal(shared.items[1].count,3);assert.equal(shared.logs.length,5);
});
test('不同品項不互相覆蓋，逾時重送同一操作不重複扣庫存或紀錄',()=>{
 const s=seed();const op={id:'repeat-000001',type:'adjust',changes:[{id:s.items[0].id,version:1,delta:-1}]};
 const a=applyOperation(s,op,now),again=applyOperation(a,op,now);
 assert.equal(again,a);assert.equal(again.items[0].count,4);assert.equal(again.logs.length,5);
 assert.throws(()=>applyOperation(a,{...op,changes:[{id:s.items[0].id,version:1,delta:-2}]},now),/識別碼/);
 const b=applyOperation(a,{id:'other-0000001',type:'adjust',changes:[{id:s.items[1].id,version:1,delta:2}]},now);
 assert.equal(b.items[0].count,4);assert.equal(b.items[1].count,5);
});
test('完整歷史不截斷，臺北日期與品牌型號篩選',()=>{
 let s=seed();for(let n=0;n<30;n++)s=applyOperation(s,{id:`history-${String(n).padStart(6,'0')}`,type:'adjust',changes:[{id:s.items[0].id,version:s.items[0].version,delta:1}]},'2026-10-08T17:00:00Z');
 assert.equal(s.logs.length,34);assert.equal(s.logs.slice(-5).length,5);
 assert.equal(filterLogs(s.logs,{start:'2026-10-09',end:'2026-10-09',brand:'品牌甲',model:'型號'}).length,34);
 assert.equal(filterLogs(s.logs,{brand:'其他'}).length,0);
});
test('舊資料驗證保留所有顏色，不相加、不接受損壞或負數',()=>{
 assert.deepEqual(readLegacy('{"K":9,"C":2,"M":0,"Y":1}'),{K:9,C:2,M:0,Y:1});
 assert.throws(()=>readLegacy('{"K":-1,"C":2,"M":0,"Y":1}'));
});
