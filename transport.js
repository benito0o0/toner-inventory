export class SheetBridge {
  constructor(endpoint) {
    const url = new URL(endpoint);
    if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) throw Error('請使用有效的 Apps Script /exec 部署網址');
    this.url = url; this.requests = new Map(); this.closed = false;
    this.listener = event => {
      const msg = event.data;
      let host; try { host = new URL(event.origin).hostname; } catch { return; }
      if (!msg || msg.channel !== this.channel || !(host === 'script.google.com' || host.endsWith('.googleusercontent.com'))) return;
      if (msg.type === 'ready' && !this.peer) {
        this.peer = event.source; this.origin = event.origin;
        clearTimeout(this.readyTimer); this.readyResolve();
      }
      if (event.source !== this.peer || event.origin !== this.origin) return;
      const request = this.requests.get(msg.requestId);
      if (!request) return;
      clearTimeout(request.timer); this.requests.delete(msg.requestId);
      if (msg.error) request.reject(Error(msg.error)); else request.resolve(msg.result);
    };
    window.addEventListener('message', this.listener); this.start();
  }
  start() {
    if (this.frame) this.frame.remove();
    this.peer = null; this.origin = null; this.failed = false;
    this.channel = crypto.randomUUID();
    const url = new URL(this.url); url.searchParams.set('channel', this.channel);
    this.frame = document.createElement('iframe');
    this.frame.hidden = true; this.frame.title = '共用庫存資料連線'; this.frame.src = url.href;
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve; this.readyReject = reject;
      this.readyTimer = setTimeout(() => {
        this.failed = true;
        reject(Error('連線逾時；請確認網站網址、部署權限與允許的網站來源'));
      }, 25000);
    });
    // 連線可能在背景等待，避免沒有呼叫者時產生未處理的 Promise 拒絕。
    this.ready.catch(() => {});
    document.body.append(this.frame);
  }
  async call(action, operation) {
    if (this.closed) throw Error('連線已關閉');
    if (this.failed && this.requests.size === 0) this.start();
    await this.ready;
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.requests.delete(requestId); this.failed = true; reject(Error('請求逾時，結果尚未確認；請以相同操作重試，勿重複新增')); }, 30000);
      this.requests.set(requestId, { resolve, reject, timer });
      this.peer.postMessage({ channel: this.channel, requestId, action, operation }, this.origin);
    });
  }
  close() {
    this.closed = true; this.readyReject(Error('連線已關閉'));
    clearTimeout(this.readyTimer); window.removeEventListener('message', this.listener); this.frame.remove();
    for (const r of this.requests.values()) { clearTimeout(r.timer); r.reject(Error('連線已關閉')); }
    this.requests.clear();
  }
}
