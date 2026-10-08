import { colors, emptyState, validCount, conflicts, rebase, filterLogs, readLegacy } from './inventory.js';
import { SheetBridge } from './transport.js';
const $ = id => document.getElementById(id);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const names = { K:'#293241', C:'#00a6c7', M:'#df448a', Y:'#edba32' };
const workspaceKey = 'toner-inventory.workspace.v2';
let state = emptyState(), drafts = {}, pending = null, bridge = null, connected = false, busy = false, polling = false, page = 0, endpoint = '', lastRead = '', legacyRaw = null, legacy = null, storageHealthy = true;
function message(text) { $('notice').textContent = text; }
try {
  legacyRaw = localStorage.getItem('toner-inventory.v1');
  if (legacyRaw) {
    if (!localStorage.getItem('toner-inventory.v1.backup')) localStorage.setItem('toner-inventory.v1.backup', legacyRaw);
    legacy = readLegacy(legacyRaw);
  }
  const stored = JSON.parse(localStorage.getItem(workspaceKey) || 'null');
  if (stored) { drafts = stored.drafts || {}; pending = stored.pending || null; endpoint = stored.endpoint || ''; }
} catch { storageHealthy = false; message('無法讀取或備份本機資料。為保護舊庫存，已停用寫入；請先匯出備份並檢查瀏覽器儲存權限。'); }
function persist() {
  try { localStorage.setItem(workspaceKey, JSON.stringify({ endpoint, drafts, pending })); }
  catch { storageHealthy = false; throw Error('本機無法保存待處理操作，已停止送出。請保留頁面並匯出備份。'); }
}
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV(name, rows) {
  const csv = rows.map(row => row.map(value => {
    let s = String(value ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
  download(name, '\uFEFF' + csv, 'text/csv;charset=utf-8');
}
function currentItems() { return state.items.filter(i => JSON.stringify([i.brand,i.model]) === $('model').value); }
function options(el, values, placeholder) {
  const selected = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>` + values.map(v => `<option value="${escape(v)}">${escape(v)}</option>`).join('');
  if (values.includes(selected)) el.value = selected;
}
function renderFilters() {
  const brands = [...new Set(state.items.map(i => i.brand))].sort();
  options($('brand'), brands, '全部品牌'); options($('history-brand'), brands, '全部品牌');
  $('brands-list').innerHTML = brands.map(b => `<option value="${escape(b)}"></option>`).join('');
  const models = [...new Map(state.items.filter(i => (!$('brand').value || i.brand === $('brand').value) && i.model.toLowerCase().includes($('search').value.toLowerCase())).map(i => [JSON.stringify([i.brand,i.model]), i])).values()];
  const selected = $('model').value;
  $('model').innerHTML = '<option value="">請選擇型號</option>' + models.map(i => `<option value="${escape(JSON.stringify([i.brand,i.model]))}">${escape(i.model)}</option>`).join('');
  if (models.some(i => JSON.stringify([i.brand,i.model]) === selected)) $('model').value = selected;
  else if (models.length) $('model').value = JSON.stringify([models[0].brand,models[0].model]);
}
function logHTML(logs) {
  return logs.length ? logs.map(l => `<div class="log"><small>${escape(new Date(l.time).toLocaleString('zh-TW', { timeZone:'Asia/Taipei', hour12:false }))} · ${escape(l.kind)}</small>${escape(l.model)} · ${l.color} ${colors[l.color]}　<strong>${l.delta > 0 ? '+' : ''}${l.delta}</strong> 支（${l.before} → ${l.after}）</div>`).join('') : '<p>沒有異動紀錄</p>';
}
function renderHistory() {
  const logs = filterLogs(state.logs, { start:$('start-date').value, end:$('end-date').value, brand:$('history-brand').value, model:$('history-model').value });
  page = Math.min(page, Math.max(0, Math.ceil(logs.length / 20) - 1));
  $('history-list').innerHTML = logHTML(logs.slice(page*20, (page+1)*20));
  $('page').textContent = `第 ${page+1} 頁，共 ${logs.length} 筆`;
  $('prev').disabled = page === 0; $('next').disabled = (page+1)*20 >= logs.length;
}
function renderCards() {
  const selected = currentItems();
  $('summary').textContent = selected.length ? `已選取 ${selected[0].model}，共 ${selected.length} 個顏色` : (state.items.length ? '沒有符合條件的型號' : '尚無共用品項；請在設定新增或匯入舊庫存。');
  $('items').innerHTML = selected.map(i => {
    const d = drafts[i.id], count = d ? d.base + d.delta : i.count;
    return `<article class="card" style="--ink:${names[i.color]}"><div class="identity"><span class="mark ${i.color}">${i.color}</span><h2>${colors[i.color]}色碳粉</h2></div><div class="quantity">${count}<small>支</small></div><div class="saved">最新共用庫存：${i.count} 支${d ? `<br>我的暫存：${d.delta>0?'+':''}${d.delta}（原庫存 ${d.base}）` : ''}</div>${i.count <= i.threshold ? `<span class="low">低庫存提醒：門檻 ${i.threshold} 支</span>` : ''}<div class="controls">${[-2,-1,1,2].map(delta => `<button data-item="${escape(i.id)}" data-delta="${delta}" aria-label="${i.color} ${colors[i.color]}${delta>0?'加':'減'}${Math.abs(delta)}支" ${busy || pending || !connected || !storageHealthy || !validCount(count+delta) ? 'disabled' : ''}>${delta>0?'+':'−'}${Math.abs(delta)}</button>`).join('')}</div></article>`;
  }).join('');
}
function render() {
  renderFilters(); renderCards(); renderHistory();
  $('recent').innerHTML = logHTML(state.logs.slice(-5).reverse());
  $('connection').textContent = connected ? `已連接共用資料 · 每 15 秒同步 · 上次成功讀取 ${lastRead}` : '尚未連接或連線中斷；不會把本機資料冒充共用庫存';
  const collision = conflicts(state, drafts).length;
  $('conflict').hidden = !collision;
  $('rebase').disabled = busy || !!pending || !connected;
  $('discard').disabled = busy || !!pending;
  $('save').disabled = busy || !connected || !storageHealthy || (!pending && (!Object.keys(drafts).length || !!collision));
  $('save').textContent = pending && !busy ? '重試同一筆操作' : '儲存';
  $('cancel').disabled = busy || !!pending || !Object.keys(drafts).length;
  $('draft-info').textContent = pending ? '待確認操作結果；請重試，暫勿取消或再次新增' : `${Object.keys(drafts).length} 個品項尚未儲存`;
  $('status').textContent = busy ? '儲存中…' : pending ? '結果尚未確認／儲存失敗' : !connected ? '尚未連接' : collision ? '變更衝突，請核對' : Object.keys(drafts).length ? '尚未儲存' : '共用庫存已載入';
  document.querySelectorAll('#add-form button, #threshold-form button, #migrate-form button').forEach(b => b.disabled = busy || !!pending || !connected || !storageHealthy || !!Object.keys(drafts).length);
  $('connect-form').querySelector('button').disabled = busy || !!pending || !!Object.keys(drafts).length;
}
function renderThresholds() {
  $('thresholds').innerHTML = currentItems().map(i => `<label>${i.color} ${colors[i.color]}：目前門檻 ${i.threshold}<input type="number" min="0" max="1000000000" step="1" required data-threshold="${escape(i.id)}" data-version="${i.version}" value="${i.threshold}"></label>`).join('');
}
async function refresh() {
  if (!bridge || busy || polling) return;
  polling = true;
  try {
    const source = bridge;
    const recovering = !connected;
    const next = await source.call('read');
    if (source !== bridge) return;
    if (next.schema !== 2 || !Array.isArray(next.items) || !Array.isArray(next.logs)) throw Error('共用資料格式無效');
    const changed = state.revision !== next.revision;
    if (next.revision >= state.revision) state = next; connected = true; lastRead = new Date().toLocaleTimeString('zh-TW');
    if (recovering) message(pending ? '連接成功，已讀取共用資料。仍有操作結果待確認，請重試同一筆操作。' : Object.keys(drafts).length ? '連接成功，已讀取共用資料；你的待儲存變更仍保留。' : '連接成功，已讀取共用資料。');
    if (changed && Object.keys(drafts).length) message('已收到他人更新；你的暫存內容仍保留。若有衝突，請核對後重新套用或取消。');
    render();
  } catch (e) { connected = false; message(`讀取失敗：${e.message}。暫存仍保留，將自動重試連線。`); render(); }
  finally { polling = false; }
}
async function connect(url) {
  try {
    if (bridge) bridge.close();
    bridge = new SheetBridge(url); state = emptyState(); endpoint = url; persist();
    connected = false; message('正在連接共用資料…'); render(); await refresh(); renderThresholds();
  } catch (e) { connected = false; message(e.message); render(); }
}
async function submit(operation) {
  if (busy || !bridge || !connected || !storageHealthy) return;
  busy = true;
  try {
    if (!pending) { pending = operation; persist(); }
    message('儲存中，請勿重複送出…'); render();
    const result = await bridge.call('write', pending);
    if (result.error) {
      if (result.rejected === true) { pending = null; persist(); }
      throw Error(result.error);
    }
    if (!result.state || !result.state.operations[pending.id]) throw Error('未收到正式儲存確認；請重試相同操作');
    state = result.state;
    if (pending.type === 'adjust') drafts = {};
    pending = null; persist(); lastRead = new Date().toLocaleTimeString('zh-TW');
    message('儲存成功，已寫入共用試算表。' + (result.warning || ''));
  } catch (e) { message(`儲存失敗或結果未確認：${e.message}。待儲存內容仍保留。`); }
  finally { busy = false; render(); renderThresholds(); if (!pending) await refresh(); }
}
function newOperation(type, data) { return { id: crypto.randomUUID(), type, ...data }; }
function cancel() { if (busy || pending) return; drafts = {}; try { persist(); message('已取消暫存變更，未新增正式異動紀錄。'); } catch(e) { message(e.message); } render(); }
$('items').addEventListener('click', e => {
  const button = e.target.closest('[data-item]'); if (!button || button.disabled) return;
  const id = button.dataset.item, item = state.items.find(i => i.id === id);
  const d = drafts[id] || { version:item.version, base:item.count, delta:0 };
  d.delta += Number(button.dataset.delta);
  if (d.delta) drafts[id] = d; else delete drafts[id];
  try { persist(); message('變更尚未儲存。'); } catch(e) { message(e.message); }
  render();
});
$('save').addEventListener('click', () => submit(pending || newOperation('adjust', { changes:Object.entries(drafts).map(([id,d]) => ({ id,version:d.version,delta:d.delta })) })));
$('cancel').addEventListener('click', cancel); $('discard').addEventListener('click', cancel);
$('rebase').addEventListener('click', () => { try { drafts = rebase(state,drafts); persist(); message('已確認以最新庫存重新套用，請按儲存。'); } catch(e) { message(e.message); } render(); });
$('connect-form').addEventListener('submit', e => { e.preventDefault(); connect($('endpoint').value.trim()); });
for (const id of ['brand','search']) $(id).addEventListener('input', () => { render(); renderThresholds(); });
$('model').addEventListener('change', () => { renderCards(); renderThresholds(); });
for (const id of ['start-date','end-date','history-brand','history-model']) $(id).addEventListener('input', () => { page = 0; renderHistory(); });
$('prev').addEventListener('click', () => { page--; renderHistory(); }); $('next').addEventListener('click', () => { page++; renderHistory(); });
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(s => s.hidden = s.id !== button.dataset.tab);
  document.querySelectorAll('nav button').forEach(b => { if(b.dataset.tab===button.dataset.tab)b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  if (button.dataset.tab === 'settings') renderThresholds();
}));
function initialFields() {
  $('initial-counts').innerHTML = [...$('color-mode').value].map(c => `<div><label>${c} ${colors[c]}初始數量<input data-initial="${c}" type="number" min="0" max="1000000000" step="1" value="0" required></label><label>${c} 低庫存門檻<input data-initial-threshold="${c}" type="number" min="0" max="1000000000" step="1" value="0" required></label></div>`).join('');
}
$('color-mode').addEventListener('change', initialFields);
$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const counts = Object.fromEntries([...document.querySelectorAll('[data-initial]')].map(i => [i.dataset.initial,Number(i.value)]));
  const thresholds = Object.fromEntries([...document.querySelectorAll('[data-initial-threshold]')].map(i => [i.dataset.initialThreshold,Number(i.value)]));
  submit(newOperation('add', { brand:$('new-brand').value.trim(), model:$('new-model').value.trim(), counts,thresholds }));
});
$('threshold-form').addEventListener('submit', e => { e.preventDefault(); const changes = [...document.querySelectorAll('[data-threshold]')].map(i => ({ id:i.dataset.threshold,version:Number(i.dataset.version),threshold:Number(i.value) })); if(changes.length)submit(newOperation('threshold',{changes})); });
function showLegacy() { $('legacy-preview').textContent = legacy ? '待確認的舊庫存：\n' + Object.entries(legacy).map(([c,n]) => `${c} ${colors[c]}：${n} 支`).join('\n') : '此瀏覽器沒有可用的舊庫存；可載入其他裝置匯出的檔案。'; $('migration-confirm').checked = false; }
$('legacy-download').addEventListener('click', () => { if(legacyRaw)download('舊庫存原始備份.json',legacyRaw); else message('此瀏覽器沒有舊庫存。'); });
$('legacy-file').addEventListener('change', async e => { try { const file=e.target.files[0]; if(!file)return; if(file.size>100000)throw Error('舊庫存檔案過大'); const raw=await file.text(); const parsed=readLegacy(raw); legacy=parsed; showLegacy(); } catch(e) { message(e.message); } });
$('migrate-form').addEventListener('submit', e => { e.preventDefault(); if(!legacy || !$('migration-confirm').checked)return; submit(newOperation('add',{brand:$('migration-brand').value.trim(),model:$('migration-model').value.trim(),counts:legacy,thresholds:{},migration:true})); });
$('backup').addEventListener('click', () => download('碳粉庫存完整備份.json',JSON.stringify({ exportedAt:new Date().toISOString(), lastSuccessfulRead:lastRead, state,drafts,pending, legacyOriginal:legacyRaw },null,2)));
$('inventory-csv').addEventListener('click', () => exportCSV('碳粉庫存.csv',[['品牌','型號','顏色','庫存','低庫存門檻'],...state.items.map(i=>[i.brand,i.model,`${i.color} ${colors[i.color]}`,i.count,i.threshold])]));
$('history-csv').addEventListener('click', () => exportCSV('完整異動紀錄.csv',[['時間','品牌','型號','顏色','增減','變更前','變更後','類型','操作識別碼'],...state.logs.map(l=>[l.time,l.brand,l.model,`${l.color} ${colors[l.color]}`,l.delta,l.before,l.after,l.kind,l.operationId])]));
window.addEventListener('beforeunload', e => { if(Object.keys(drafts).length || pending){e.preventDefault();e.returnValue='';} });
setInterval(refresh,15000); document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
if (legacyRaw) { try { const original = readLegacy(legacyRaw); $('legacy-home').hidden = false; $('legacy-home-counts').textContent = Object.entries(original).map(([c,n]) => `${c} ${colors[c]}：${n} 支`).join(' · '); } catch {} }
$('endpoint').value = endpoint; initialFields(); showLegacy(); render(); if(endpoint)connect(endpoint);
