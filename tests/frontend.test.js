import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as inventory from '../inventory.js';
import * as cache from '../cache.js';
import {compareModels} from '../models.js';
async function harness(){
 const elements=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,addEventListener(){},querySelector(){return el('button');}});return elements.get(id);}
 el('color-mode').value='K';
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const context=vm.createContext({...inventory,...cache,compareModels,console,localStorage:storage,crypto:globalThis.crypto,defaultEndpoint:'',chooseEndpoint:()=>'',SheetBridge:class{},setInterval(){},setTimeout(){},URL,Blob,window:{addEventListener(){}},document:{hidden:false,getElementById:el,querySelectorAll:()=>[],addEventListener(){}}});
 let source=await readFile(new URL('../app.js',import.meta.url),'utf8');source=source.replace(/^import .*;\n/gm,'');vm.runInContext(source,context);
 return {context,el,run:s=>vm.runInContext(s,context)};
}
test('舊讀取不能覆蓋較新的儲存資料，無變更讀取不重建卡片',async()=>{
 const h=await harness();
 h.run(`state={...emptyState(),revision:2}; connected=true; bridge={call:()=>new Promise(resolve=>globalThis.finishRead=resolve)};`);
 const reading=h.run('refresh()');
 h.run('state={...emptyState(),revision:3}; finishRead({...emptyState(),revision:2})');
 await reading;assert.equal(h.run('state.revision'),3);
 h.el('items').innerHTML='保持原畫面';
 h.run('bridge={call:async()=>({...emptyState(),revision:3})}');await h.run('refresh()');
 assert.equal(h.el('items').innerHTML,'保持原畫面');
});
test('未確認快取不能儲存，回覆遺失保留原操作識別碼重試',async()=>{
 const h=await harness();
 h.run(`bridge={call:async()=>{throw Error('網路中斷')}}; connected=false;`);
 await h.run(`submit({id:'pending-save-0001',type:'adjust',changes:[]})`);assert.equal(h.run('pending'),null);
 h.run('connected=true');await h.run(`submit({id:'pending-save-0001',type:'adjust',changes:[]})`);
 assert.equal(h.run('pending.id'),'pending-save-0001');assert.match(h.el('notice').textContent,/未確認/);
 h.run(`bridge={call:async(action,op)=>{globalThis.retried=op;return {state:{...emptyState(),operations:{[op.id]:JSON.stringify(op)}}}}}`);
 await h.run('submit(pending)');assert.equal(h.run('retried.id'),'pending-save-0001');assert.equal(h.run('pending'),null);
 assert.match(h.el('notice').textContent,/儲存成功/);
});
test('舊後端不能新增；防止與舊品牌相同的型號重建',async()=>{
 const h=await harness();h.run(`connected=true;bridge={call:async()=>{throw Error('不應送出')}}`);
 await h.run(`submit({id:'new-model-0001',type:'add',model:'20',counts:{K:0}})`);
 assert.match(h.el('notice').textContent,/需先更新/);assert.equal(h.run('pending'),null);
 h.run(`state={...emptyState(),modelOnly:true,items:[{id:'old',brand:'舊品牌',model:'20',color:'K',count:4,version:1}]}`);
 await h.run(`submit({id:'new-model-0002',type:'add',model:'２０',counts:{K:0}})`);
 assert.match(h.el('notice').textContent,/已存在/);assert.equal(h.run('state.items[0].count'),4);
});
