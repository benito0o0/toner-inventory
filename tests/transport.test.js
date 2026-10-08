import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SheetBridge } from '../transport.js';
test('握手逾時後重新建立連線；舊通道訊息被忽略；讀取與重試不修改操作內容', async () => {
 const original = { window:globalThis.window, document:globalThis.document, setTimeout:globalThis.setTimeout, clearTimeout:globalThis.clearTimeout };
 let listener, next=0;const timers=new Map(),frames=[];
 globalThis.window={addEventListener:(_,f)=>listener=f,removeEventListener(){}};
 globalThis.document={createElement:()=>({remove(){this.removed=true;}}),body:{append:f=>frames.push(f)}};
 globalThis.setTimeout=f=>{timers.set(++next,f);return next;};globalThis.clearTimeout=id=>timers.delete(id);
 try {
  const bridge=new SheetBridge('https://script.google.com/macros/s/example/exec');
  const first=bridge.call('read');const oldChannel=bridge.channel;timers.get(bridge.readyTimer)();
  await assert.rejects(first,/逾時/);
  const retry=bridge.call('read');assert.equal(frames.length,2);assert.equal(frames[0].removed,true);assert.notEqual(bridge.channel,oldChannel);
  let sent;const peer={postMessage:msg=>{sent=msg;}};const origin='https://test.googleusercontent.com';
  listener({origin,source:peer,data:{channel:oldChannel,type:'ready'}});assert.equal(bridge.peer,null);
  listener({origin,source:peer,data:{channel:bridge.channel,type:'ready'}});await Promise.resolve();
  assert.equal(sent.action,'read');listener({origin,source:peer,data:{channel:bridge.channel,requestId:sent.requestId,result:{revision:0}}});
  assert.deepEqual(await retry,{revision:0});
  const operation={id:'same-operation-0001',type:'adjust',changes:[]};const write=bridge.call('write',operation);await Promise.resolve();assert.equal(sent.operation,operation);
  listener({origin,source:peer,data:{channel:bridge.channel,requestId:sent.requestId,result:{state:{revision:1}}}});await write;
  bridge.close();await assert.rejects(bridge.call('read'),/關閉/);
 } finally {for(const [k,v]of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
