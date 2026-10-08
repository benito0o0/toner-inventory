const collator = new Intl.Collator('zh-TW', { numeric: true, sensitivity: 'base' });
export function compareModels(a, b) {
  const left = String(a).normalize('NFKC');
  const right = String(b).normalize('NFKC');
  const leftDigits = (left.match(/[0-9]/g) || []).join('');
  const rightDigits = (right.match(/[0-9]/g) || []).join('');
  if (!leftDigits || !rightDigits) {
    if (!!leftDigits !== !!rightDigits) return leftDigits ? -1 : 1;
    return collator.compare(left, right);
  }
  if (leftDigits.length !== rightDigits.length) return leftDigits.length - rightDigits.length;
  const leftValue = BigInt(leftDigits), rightValue = BigInt(rightDigits);
  if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  return collator.compare(left, right);
}
