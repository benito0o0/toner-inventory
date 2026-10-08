import { items, normalize, adjust, isDirty } from './inventory.js';
const storageKey = 'toner-inventory.v1';
let saved = normalize(null);
let startupError = '';
try {
  const raw = localStorage.getItem(storageKey);
  saved = normalize(raw ? JSON.parse(raw) : null);
} catch {
  startupError = '无法读取本机库存。请确认浏览器允许储存；现以 0 显示，储存前请核对数量。';
}
let draft = { ...saved };
const byId = id => document.getElementById(id);
byId('items').innerHTML = items.map(item => `
  <article class="card" style="--ink:${item.color}">
    <div class="card-top"><div class="identity"><span class="color-mark">${item.id}</span><div><h2>${item.name}</h2><span class="item-code">${item.id} · 碳粉</span></div></div><span class="item-state" id="state-${item.id}">已储存</span></div>
    <div class="quantity"><strong id="count-${item.id}" aria-live="polite">0</strong><span>支</span></div>
    <div class="saved-count" id="saved-${item.id}">已储存：0 支</div>
    <div class="controls" role="group" aria-label="${item.name}数量调整">${[-2,-1,1,2].map(delta => `<button data-id="${item.id}" data-delta="${delta}" aria-label="${item.name}${delta > 0 ? '加' : '减'}${Math.abs(delta)}支">${delta > 0 ? '+' : '−'}${Math.abs(delta)}</button>`).join('')}</div>
  </article>`).join('');
function render(message) {
  const dirty = isDirty(saved, draft);
  byId('total').textContent = items.reduce((sum, { id }) => sum + draft[id], 0).toLocaleString();
  byId('status').textContent = dirty ? '变更待储存' : '已储存';
  document.querySelector('.summary-note').classList.toggle('pending', dirty);
  byId('save').disabled = byId('cancel').disabled = !dirty;
  const changed = items.filter(({ id }) => draft[id] !== saved[id]).length;
  byId('change-title').textContent = dirty ? `${changed} 个品项有变更` : '没有待储存的变更';
  byId('change-subtitle').textContent = dirty ? '储存后才会更新正式库存' : '库存保存在本机浏览器';
  for (const { id } of items) {
    byId(`count-${id}`).textContent = draft[id].toLocaleString();
    byId(`saved-${id}`).textContent = `已储存：${saved[id].toLocaleString()} 支`;
    const diff = draft[id] - saved[id];
    byId(`state-${id}`).textContent = diff ? `待储存 ${diff > 0 ? '+' : ''}${diff}` : '已储存';
    byId(`state-${id}`).classList.toggle('changed', !!diff);
  }
  document.querySelectorAll('[data-delta]').forEach(button => {
    const delta = Number(button.dataset.delta);
    button.disabled = delta < 0 ? draft[button.dataset.id] < Math.abs(delta) : !Number.isSafeInteger(draft[button.dataset.id] + delta);
  });
  byId('notice').textContent = message || (dirty ? '变更尚未保存。你可以继续调整，或取消恢复已储存的数量。' : '数量调整会先暂存，按「储存变更」后才正式保存。');
}
byId('items').addEventListener('click', event => {
  const button = event.target.closest('[data-delta]');
  if (!button || button.disabled) return;
  draft = adjust(draft, button.dataset.id, Number(button.dataset.delta));
  render();
});
byId('cancel').addEventListener('click', () => {
  draft = { ...saved };
  render('已取消所有暂存变更，恢复到上次储存的数量。');
});
byId('save').addEventListener('click', () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(draft));
    saved = { ...draft };
    render('储存成功，库存已保存到此设备。');
  } catch {
    render('储存失败：浏览器储存空间不可用。变更仍保留在页面中，请勿关闭页面。');
  }
});
window.addEventListener('beforeunload', event => {
  if (isDirty(saved, draft)) { event.preventDefault(); event.returnValue = ''; }
});
render(startupError);
