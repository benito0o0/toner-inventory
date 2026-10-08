// 自動產生：npm run build:apps-script
const colors = { K: '黑', C: '青', M: '洋紅', Y: '黃' };
function emptyState() { return { schema: 2, revision: 0, items: [], logs: [], operations: {} }; }
function validCount(n) { return Number.isSafeInteger(n) && n >= 0 && n <= 1000000000; }
function key(brand, model, color) { return JSON.stringify([brand.trim().normalize('NFKC').toLowerCase(), model.trim().normalize('NFKC').toLowerCase(), color]); }
function applyOperation(state, op, now) {
  if (!op || typeof op.id !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(op.id)) throw Error('操作識別碼無效');
  const fingerprint = JSON.stringify(op);
  if (state.operations[op.id]) {
    if (state.operations[op.id] !== fingerprint) throw Error('同一操作識別碼不可用於不同內容');
    return state;
  }
  const next = JSON.parse(JSON.stringify(state));
  const changes = [];
  if (op.type === 'add') {
    const brand = String(op.brand || '').trim(), model = String(op.model || '').trim();
    if (!brand || !model || brand.length > 80 || model.length > 80) throw Error('品牌與型號須為 1 至 80 字');
    const codes = Object.keys(op.counts || {}).sort().join('');
    if (codes !== 'K' && codes !== 'CKMY') throw Error('型號須包含單色 K 或四色 K／C／M／Y');
    if (next.items.some(i => key(i.brand, i.model, 'K') === key(brand, model, 'K'))) throw Error('此品牌與型號已存在，不可重複建立');
    for (const color of Object.keys(op.counts)) {
      const count = op.counts[color], threshold = op.thresholds?.[color] ?? 0;
      if (!validCount(count) || !validCount(threshold)) throw Error('初始數量與門檻須為非負整數（上限十億）');
      const item = { id: `${op.id}_${color}`, brand, model, color, count, threshold, version: 1 };
      next.items.push(item);
      changes.push({ item, before: 0, after: count, kind: op.migration ? '舊資料匯入' : '新增品項' });
    }
  } else if (op.type === 'adjust' || op.type === 'threshold') {
    if (!Array.isArray(op.changes) || !op.changes.length || op.changes.length > 1000) throw Error('變更清單無效');
    const seen = new Set();
    for (const change of op.changes) {
      if (seen.has(change.id)) throw Error('變更品項重複');
      seen.add(change.id);
      const item = next.items.find(i => i.id === change.id);
      if (!item || item.version !== change.version) throw Error('CONFLICT：庫存或設定已被他人更新，請核對最新資料後重新套用變更');
      if (op.type === 'adjust') {
        if (!Number.isSafeInteger(change.delta) || change.delta === 0 || !validCount(item.count + change.delta)) throw Error('庫存不可為負數或超出上限');
        changes.push({ item, before: item.count, after: item.count + change.delta, kind: '庫存調整' });
        item.count += change.delta;
      } else {
        if (!validCount(change.threshold)) throw Error('低庫存門檻須為非負整數');
        item.threshold = change.threshold;
      }
      item.version++;
    }
  } else throw Error('不支援的操作');
  for (const c of changes) next.logs.push({ id: `${op.id}_${c.item.id}`, operationId: op.id, time: now, brand: c.item.brand, model: c.item.model, color: c.item.color, delta: c.after - c.before, before: c.before, after: c.after, kind: c.kind });
  next.revision++;
  next.operations[op.id] = fingerprint;
  return next;
}
function conflicts(state, drafts) {
  return Object.entries(drafts).filter(([id, d]) => {
    const item = state.items.find(i => i.id === id);
    return !item || item.version !== d.version;
  }).map(([id]) => id);
}
function rebase(state, drafts) {
  const result = {};
  for (const [id, d] of Object.entries(drafts)) {
    const item = state.items.find(i => i.id === id);
    if (!item || !validCount(item.count + d.delta)) throw Error('重新套用會造成負庫存或超出上限，請取消變更後重新調整');
    result[id] = { delta: d.delta, version: item.version, base: item.count };
  }
  return result;
}
function filterLogs(logs, filters) {
  return logs.filter(l => {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(l.time));
    return (!filters.start || date >= filters.start) && (!filters.end || date <= filters.end) && (!filters.brand || l.brand === filters.brand) && (!filters.model || l.model.toLowerCase().includes(filters.model.toLowerCase()));
  }).slice().reverse();
}
function readLegacy(raw) {
  const data = JSON.parse(raw);
  if (!data || !Object.keys(colors).every(c => validCount(data[c]))) throw Error('舊庫存格式無效，請保留原始備份並核對');
  return Object.fromEntries(Object.keys(colors).map(c => [c, data[c]]));
}

/** 綁定於「碳粉庫存共用資料」的 Apps Script。不可將憑證貼入此檔。 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw Error('請從試算表的擴充功能開啟 Apps Script');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('ALLOWED_ORIGIN')) props.setProperty('ALLOWED_ORIGIN', 'https://benito0o0.github.io');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const journal = getJournal_();
    if (!journal.getRange('A1').getValue()) writeState_(emptyState());
    syncViews_(readState_());
  } finally { lock.releaseLock(); }
}
function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw Error('請先由擁有者執行 setup');
  return SpreadsheetApp.openById(id);
}
function getJournal_() {
  const ss = spreadsheet_();
  return ss.getSheetByName('系統交易資料') || ss.insertSheet('系統交易資料');
}
function digest_(value) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
}
function readState_() {
  const sheet = getJournal_();
  const raw = sheet.getRange('A1').getValue();
  if (!raw) throw Error('尚未初始化；請執行 setup，勿直接刪除系統資料');
  const pointer = JSON.parse(raw);
  const encoded = sheet.getRange(pointer.row, 1, pointer.chunks, 1).getValues().map(r => r[0]).join('');
  if (digest_(encoded) !== pointer.hash) throw Error('系統資料校驗失敗，已停止寫入；請由擁有者還原備份');
  const json = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8');
  const state = JSON.parse(json);
  if (state.schema !== 2) throw Error('資料版本不符');
  return state;
}
function writeState_(state) {
  const sheet = getJournal_();
  const encoded = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(state), 'application/json')).getBytes());
  const chunks = encoded.match(/.{1,40000}/g).map(s => [s]);
  const row = Math.max(3, sheet.getLastRow() + 1);
  const required = row + chunks.length - 1;
  if (required > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), required - sheet.getMaxRows());
  sheet.getRange(row, 1, chunks.length, 1).setValues(chunks);
  SpreadsheetApp.flush();
  // 僅此單一指標寫入完成，交易才生效。先寫入的快照失敗時不會變成正式庫存。
  sheet.getRange('A1').setValue(JSON.stringify({ row, chunks: chunks.length, hash: digest_(encoded), revision: state.revision }));
  SpreadsheetApp.flush();
}
function projection_(name, rows) {
  const ss = spreadsheet_();
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getMaxRows() < rows.length) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  // 此表僅供檢視，正式資料在交易快照；不清空歷史來源。
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows.map(r => r.map(v => typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v)));
  sheet.setFrozenRows(1);
}
function syncViews_(state) {
  projection_('庫存檢視', [['品牌','設備型號','顏色','庫存','低庫存門檻','品項版本'], ...state.items.map(i => [i.brand,i.model,i.color + ' ' + colors[i.color],i.count,i.threshold,i.version])]);
  projection_('完整異動檢視', [['時間（UTC）','品牌','設備型號','顏色','增減','變更前','變更後','類型','操作識別碼'], ...state.logs.map(l => [l.time,l.brand,l.model,l.color + ' ' + colors[l.color],l.delta,l.before,l.after,l.kind,l.operationId])]);
}
function api(request) {
  if (!request || !['read','write'].includes(request.action)) throw Error('請求無效');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const state = readState_();
    if (request.action === 'read') return state;
    if (JSON.stringify(request.operation).length > 200000) return { error:'操作內容過大', rejected:true };
    let next;
    try { next = applyOperation(state, request.operation, new Date().toISOString()); }
    catch (e) { return { error:e.message, rejected:true }; }
    if (next !== state) writeState_(next);
    let warning = '';
    try { syncViews_(next); } catch (e) { warning = '正式資料已儲存，但檢視表尚未更新；下次儲存或執行 setup 可修復。'; }
    return { state:next, warning };
  } finally { lock.releaseLock(); }
}
function doGet(e) {
  const channel = String(e && e.parameter && e.parameter.channel || '');
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(channel)) return HtmlService.createHtmlOutput('請從碳粉庫存網站連接此服務。');
  const origin = PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGIN');
  if (!origin || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(origin)) throw Error('請設定有效的 ALLOWED_ORIGIN');
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.channelJSON = JSON.stringify(channel); template.originJSON = JSON.stringify(origin);
  return template.evaluate().setTitle('碳粉庫存資料連線').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
