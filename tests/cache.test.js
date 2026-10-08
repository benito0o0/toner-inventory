import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../inventory.js';
import {loadSnapshot,saveSnapshot} from '../cache.js';
test('依服務網址顯示上次確認的資料，完整保留庫存與歷史',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const state=applyOperation(emptyState(),{id:'snapshot-test-0001',type:'add',brand:'未分類',model:'3212',counts:{K:1}},'2026-10-09T01:00:00Z');
 assert.equal(saveSnapshot(storage,'service-a',state,'2026-10-09T01:00:00Z'),true);
 assert.deepEqual(loadSnapshot(storage,'service-a').state,state);
 assert.equal(loadSnapshot(storage,'service-b'),null);
 assert.equal(state.items[0].count,1);
});
test('損壞快取或儲存不可用時仍可回到正式讀取',()=>{
 assert.equal(loadSnapshot({getItem:()=>'{bad'},'service'),null);
 assert.equal(loadSnapshot({getItem:()=>{throw Error();}},'service'),null);
 assert.equal(saveSnapshot({setItem:()=>{throw Error();}},'service',emptyState(),new Date().toISOString()),false);
 const corrupted={endpoint:'service',savedAt:new Date().toISOString(),state:{...emptyState(),items:[{id:'bad',brand:'未分類',model:'型號',color:'K',count:-1,version:1}]}};
 assert.equal(loadSnapshot({getItem:()=>JSON.stringify(corrupted)},'service'),null);
});
