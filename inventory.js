export const items = [
  { id: 'K', name: '黑色', color: '#293241' },
  { id: 'C', name: '青色', color: '#00a6c7' },
  { id: 'M', name: '洋红色', color: '#df448a' },
  { id: 'Y', name: '黄色', color: '#edba32' },
];
export function normalize(value) {
  return Object.fromEntries(items.map(({ id }) => [id,
    Number.isSafeInteger(value?.[id]) && value[id] >= 0 ? value[id] : 0]));
}
export function adjust(counts, id, delta) {
  if (!items.some(item => item.id === id)) return { ...counts };
  const next = counts[id] + delta;
  return { ...counts, [id]: Number.isSafeInteger(next) ? Math.max(0, next) : counts[id] };
}
export function isDirty(saved, draft) {
  return items.some(({ id }) => saved[id] !== draft[id]);
}
