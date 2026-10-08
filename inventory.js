export const colors = { K: '黑', C: '青', M: '洋紅', Y: '黃' };
export function emptyState() { return { schema: 2, revision: 0, items: [], logs: [], operations: {} }; }
export function validCount(n) { return Number.isSafeInteger(n) && n >= 0 && n <= 1000000000; }
export function key(brand, model, color) { return JSON.stringify([brand.trim().normalize('NFKC').toLowerCase(), model.trim().normalize('NFKC').toLowerCase(), color]); }
export function applyOperation(state, op, now) {
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
export function conflicts(state, drafts) {
  return Object.entries(drafts).filter(([id, d]) => {
    const item = state.items.find(i => i.id === id);
    return !item || item.version !== d.version;
  }).map(([id]) => id);
}
export function rebase(state, drafts) {
  const result = {};
  for (const [id, d] of Object.entries(drafts)) {
    const item = state.items.find(i => i.id === id);
    if (!item || !validCount(item.count + d.delta)) throw Error('重新套用會造成負庫存或超出上限，請取消變更後重新調整');
    result[id] = { delta: d.delta, version: item.version, base: item.count };
  }
  return result;
}
export function filterLogs(logs, filters) {
  return logs.filter(l => {
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date(l.time));
    return (!filters.start || date >= filters.start) && (!filters.end || date <= filters.end) && (!filters.brand || l.brand === filters.brand) && (!filters.model || l.model.toLowerCase().includes(filters.model.toLowerCase()));
  }).slice().reverse();
}
export function readLegacy(raw) {
  const data = JSON.parse(raw);
  if (!data || !Object.keys(colors).every(c => validCount(data[c]))) throw Error('舊庫存格式無效，請保留原始備份並核對');
  return Object.fromEntries(Object.keys(colors).map(c => [c, data[c]]));
}
