// 真實 Chromium＋模擬共用 API；不代表 Google Apps Script 已部署驗證。
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { emptyState, applyOperation } from '../inventory.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let state = emptyState(), loseResponse = false, simultaneousGate = null;
const api = http.createServer(async (req,res) => {
 res.setHeader('Access-Control-Allow-Origin','*');
 if(req.url==='/read'){res.end(JSON.stringify(state));return;}
 let body='';for await(const chunk of req)body+=chunk;
 try{const op=JSON.parse(body);if(simultaneousGate){const gate=simultaneousGate;gate.remaining--;if(!gate.remaining){simultaneousGate=null;gate.release();}await gate.promise;}state=applyOperation(state,op,new Date().toISOString());if(loseResponse){loseResponse=false;res.writeHead(503);res.end('模擬儲存完成後回覆中斷');return;}res.end(JSON.stringify({state}));}
 catch(e){res.end(JSON.stringify({error:e.message,rejected:true}));}
});
await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
const apiURL=`http://127.0.0.1:${api.address().port}`;
const staticFiles=['index.html','style.css','app.js','inventory.js','config.js'];
const files=Object.fromEntries(await Promise.all(staticFiles.map(async f=>[f,await readFile(new URL('../'+f,import.meta.url),'utf8')])));
const web=http.createServer((req,res)=>{const f=req.url==='/'?'index.html':req.url.slice(1).split('?')[0];if(!files[f]){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(files[f]);});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${web.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const contexts=await Promise.all([browser.newContext({viewport:{width:390,height:844}}),browser.newContext({viewport:{width:1280,height:900}})]);
 const pages=await Promise.all(contexts.map(c=>c.newPage()));const[a,b]=pages;
 for(const p of pages){
  await p.route('**/transport.js*',route=>route.fulfill({contentType:'text/javascript',body:`export class SheetBridge {async call(action,op){const r=await fetch('${apiURL}/'+action,{method:action==='read'?'GET':'POST',body:action==='read'?undefined:JSON.stringify(op)});return r.json();}close(){}}`}));
  await p.goto(url);
  await p.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('已連接'));
  assert.match(await p.locator('#notice').textContent(),/連接成功/);
  assert.equal(await p.locator('#threshold-form, [data-initial-threshold], .low').count(),0);
 }
 await a.evaluate(()=>localStorage.setItem('toner-inventory.v1',JSON.stringify({K:5,C:2,M:0,Y:1})));
 await a.reload();await assert.equal(await a.evaluate(()=>localStorage.getItem('toner-inventory.v1.backup')),JSON.stringify({K:5,C:2,M:0,Y:1}));
 for(const p of pages){await p.locator('nav [data-tab="settings"]').click();await p.locator('#connect-form').evaluate(f=>f.closest('details').open=true);await p.locator('#endpoint').fill('https://script.google.com/macros/s/test/exec');await p.locator('#connect-form button').click();await p.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('已連接'));}
 await a.locator('#migration-model').fill('四色設備');await a.locator('#migration-confirm').check();await a.locator('#migrate-form button').click();await a.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(state.items.length,4);assert.equal(state.items[0].count,5);
 await a.locator('nav [data-tab="home"]').click();
 // 未儲存就取消，不產生正式紀錄。
 const k=state.items.find(i=>i.color==='K').id;
 await a.locator(`[data-item="${k}"][data-delta="2"]`).click();assert.equal(state.items[0].count,5);
 await a.locator('#cancel').click();assert.equal(state.logs.length,4);
 // 第二裝置透過 15 秒輪詢自動讀到新項目。
 await b.locator('nav [data-tab="home"]').click();await b.waitForSelector(`[data-item="${k}"]`,{timeout:20000});
 await a.locator(`[data-item="${k}"][data-delta="-2"]`).click();
 await b.locator(`[data-item="${k}"][data-delta="-1"]`).click();
 await a.locator('#save').click();await a.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 await b.waitForFunction(()=>!document.querySelector('#conflict').hidden,{timeout:20000});
 assert.equal(await b.locator(`[data-item="${k}"]`).count(),4);
 assert.match(await b.locator('#items').textContent(),/我的暫存：-1/);
 await b.locator('#rebase').click();await b.locator('#save').click();await b.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(state.items[0].count,2);assert.equal(state.logs.length,6);
 // 同時儲存：兩裝置版本相同，只有一筆成功，其餘保留衝突暫存。
 await a.waitForFunction(id=>document.querySelector('[data-item="'+id+'"]').closest('.card').querySelector('.saved').textContent.includes('最新共用庫存：2 支'),k,{timeout:20000});
 await a.locator(`[data-item="${k}"][data-delta="1"]`).click();await b.locator(`[data-item="${k}"][data-delta="1"]`).click();
 let release;const promise=new Promise(resolve=>release=resolve);simultaneousGate={remaining:2,promise,release};
 await Promise.all([a.locator('#save').click(),b.locator('#save').click()]);
 await new Promise(resolve=>setTimeout(resolve,500));
 assert.equal(state.items[0].count,3);assert.equal(state.logs.length,7);
 const failed=await a.locator('#conflict').isVisible()?a:b;
 await failed.locator('#discard').click();
 // 模擬伺服器已提交但網路回覆遺失；重試原識別碼不可新增第二筆。
 const success=failed===a?b:a;await success.locator(`[data-item="${k}"][data-delta="1"]`).click();loseResponse=true;await success.locator('#save').click();
 await success.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存失敗'));
 assert.equal(state.items[0].count,4);const logCount=state.logs.length;
 assert.equal(await success.locator('#cancel').isDisabled(),true);
 await success.reload();await success.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('已連接'));
 assert.equal(await success.locator('#cancel').isDisabled(),true);
 await success.locator('#save').click();await success.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(state.items[0].count,4);assert.equal(state.logs.length,logCount);
 // 零庫存保留、最近五筆／完整歷史。
 for(let n=0;n<2;n++)await success.locator(`[data-item="${k}"][data-delta="-2"]`).click();
 await success.locator('#save').click();await success.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(state.items.length,4);assert.equal(state.items[0].count,0);
 assert.equal(await success.locator('.low').count(),0);
 assert.equal(await success.locator(`[data-item="${k}"][data-delta="-1"]`).isDisabled(),true);
 assert.equal(await success.locator('#recent .log').count(),5);
 await success.locator('nav [data-tab="history"]').click();assert.equal(await success.locator('#history-list .log').count(),state.logs.length);
 await success.locator('#history-model').fill('不存在');assert.equal(await success.locator('#history-list .log').count(),0);
 // 新增單色與防重複，選取型號保持不變。
 await success.locator('nav [data-tab="settings"]').click();await success.locator('#new-model').fill('單色設備');await success.locator('#add-form button').click();await success.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(state.items.length,5);await success.locator('#add-form button').click();await success.waitForFunction(()=>document.querySelector('#notice').textContent.includes('重複'));assert.equal(state.items.length,5);
 // 匯出備份包含全部歷史，未清除舊瀏覽器資料。
 const exported=success.waitForEvent('download');await success.locator('#backup').click();const download=await exported;const stream=await download.createReadStream();let text='';for await(const c of stream)text+=c;assert.equal(JSON.parse(text).state.logs.length,state.logs.length);
 assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('toner-inventory.v1')).K),5);
 await a.locator('nav [data-tab="home"]').click();await a.screenshot({path:'/tmp/toner-mobile.png',fullPage:true});
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 // 使用真正 transport.js 和巢狀 iframe 驗證橋接握手／回覆；Google 執行環境仍為測試替身。
 const bridgeContext=await browser.newContext({viewport:{width:390,height:844}});
 const bridgePage=await bridgeContext.newPage();
 const core=(await readFile(new URL('../inventory.js',import.meta.url),'utf8')).replace(/^export /gm,'');
 const bridgeTemplate=await readFile(new URL('../apps-script/Bridge.html',import.meta.url),'utf8');
 await bridgePage.route('**/transport.js*',route=>readFile(new URL('../transport.js',import.meta.url),'utf8').then(body=>route.fulfill({contentType:'text/javascript',body})));
 await bridgePage.route('https://script.google.com/macros/s/*/exec*',route=>{
  const channel=new URL(route.request().url()).searchParams.get('channel');
  route.fulfill({contentType:'text/html',body:`<iframe src="https://mock.googleusercontent.com/bridge?channel=${channel}"></iframe>`});
 });
 await bridgePage.route('https://mock.googleusercontent.com/bridge*',route=>{
  const channel=new URL(route.request().url()).searchParams.get('channel');
  const shim=`<script>${core}
let shared=emptyState();const runner={withSuccessHandler(f){this.success=f;return this;},withFailureHandler(f){this.failure=f;return this;},api(req){try{let result;if(req.action==='read')result=shared;else{shared=applyOperation(shared,req.operation,new Date().toISOString());result={state:shared};}this.success(result);}catch(e){this.failure(e);}}};window.google={script:{run:runner}};</script>`;
  const body=bridgeTemplate.replace('<?!= channelJSON ?>',JSON.stringify(channel)).replace('<?!= originJSON ?>',JSON.stringify(url)).replace('<script>',shim+'<script>');
  route.fulfill({contentType:'text/html',body});
 });
 await bridgePage.goto(url);await bridgePage.locator('nav [data-tab="settings"]').click();
 await bridgePage.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('已連接'));
 assert.match(await bridgePage.locator('#notice').textContent(),/連接成功/);
 await bridgePage.locator('#new-model').fill('黑白設備');await bridgePage.locator('#add-form button').click();await bridgePage.waitForFunction(()=>document.querySelector('#notice').textContent.includes('儲存成功'));
 assert.equal(await bridgePage.evaluate(()=>document.querySelector('#model').options.length),2);
 await bridgeContext.close();
 const freshContext=await browser.newContext();const freshPage=await freshContext.newPage();
 await freshPage.route('**/transport.js*',route=>route.fulfill({contentType:'text/javascript',body:`export class SheetBridge {async call(action,op){const r=await fetch('${apiURL}/'+action,{method:action==='read'?'GET':'POST',body:action==='read'?undefined:JSON.stringify(op)});return r.json();}close(){}}`}));
 await freshPage.goto(url);await freshPage.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('已連接'));
 assert.equal(await freshPage.locator('#model option').count(),3);await freshContext.close();
 console.log('瀏覽器測試通過：手機排版、舊資料備份與遷移、新增與重複檢查、取消、零庫存、15 秒雙裝置同步、暫存衝突、同時儲存、逾時冪等重試、完整歷史與匯出。Google 橋接使用模擬服務，尚待實際部署驗證。');
}finally{await browser.close();await new Promise(r=>api.close(r));await new Promise(r=>web.close(r));}
