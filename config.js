// 公開服務入口，僅供可信任團隊使用；不是 Google 憑證或私密金鑰。
export const defaultEndpoint = 'https://script.google.com/macros/s/AKfycbxa0OkiF3XgTIfa616glJFlWkZpKQUlg9MjsrMqyIz8DcH5jDH-pOTQFoDhExiWEHRZ-g/exec';
export function chooseEndpoint(saved) {
  // 保留曾使用的資料來源，避免把尚未儲存的操作送到另一份庫存。
  return saved?.endpoint || defaultEndpoint;
}
