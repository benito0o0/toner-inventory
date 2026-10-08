const cacheKey = 'toner-inventory.shared-snapshot.v1';
export function loadSnapshot(storage, endpoint) {
  try {
    const raw = storage.getItem(cacheKey);
    if (raw && raw.length > 500000) return null;
    const value = JSON.parse(raw || 'null');
    const state = value?.state;
    if (value?.endpoint !== endpoint || !Number.isFinite(Date.parse(value.savedAt)) || state?.schema !== 2 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.items) || !Array.isArray(state.logs) || !state.operations || typeof state.operations !== 'object') return null;
    if (!state.items.every(i => typeof i.id === 'string' && typeof i.brand === 'string' && typeof i.model === 'string' && ['K','C','M','Y'].includes(i.color) && Number.isSafeInteger(i.count) && i.count >= 0 && i.count <= 1000000000 && Number.isSafeInteger(i.version) && i.version >= 1)) return null;
    if (!state.logs.every(l => typeof l.brand === 'string' && typeof l.model === 'string' && ['K','C','M','Y'].includes(l.color) && Number.isFinite(Date.parse(l.time)) && Number.isSafeInteger(l.delta) && Number.isSafeInteger(l.before) && l.before >= 0 && Number.isSafeInteger(l.after) && l.after >= 0)) return null;
    return value;
  } catch { return null; }
}
export function saveSnapshot(storage, endpoint, state, savedAt) {
  try { const raw = JSON.stringify({ endpoint, state, savedAt }); if (raw.length > 500000) return false; storage.setItem(cacheKey, raw); return true; }
  catch { return false; } // 顯示快取是選用的，不影響正式交易確認或待處理操作。
}
