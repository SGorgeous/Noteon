'use strict';

const path = require('node:path');
const { WebContentsView, shell } = require('electron');

function toLoadUrl(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^(https?|file|noteon-file|about):/i.test(s)) return s;
  if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/')) {
    return 'noteon-file:///' + encodeURI(s.replace(/\\/g, '/'));
  }
  return 'https://' + s;
}

function fromLoadUrl(url) {
  if (!url || !url.startsWith('noteon-file://')) return url || '';
  try {
    const u = new URL(url);
    let p = decodeURIComponent(u.pathname || '');
    if (/^[a-zA-Z]$/.test(u.hostname)) p = u.hostname.toUpperCase() + ':' + (p.startsWith('/') ? p : '/' + p);
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
    return p.replace(/\//g, '\\');
  } catch {
    return url;
  }
}

/**
 * 网页卡片的内容层。
 * `<webview>` 在这台机器的 Electron/Chromium 上高度会卡在 150px，
 * 所以改用 WebContentsView：由主进程托管，渲染进程只负责工具栏与状态条。
 */
class WebViewManager {
  constructor(opts) {
    this.cards = opts.cards;
    this.views = new Map();
  }

  ensure(cardId) {
    const existing = this.views.get(cardId);
    if (existing && !existing.view.webContents.isDestroyed()) return existing;
    const win = this.cards.getById(cardId);
    if (!win || win.isDestroyed()) return null;

    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    try { view.setBackgroundColor('#10141b'); } catch {}
    win.contentView.addChildView(view);

    const wc = view.webContents;
    const send = (payload) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('web:state', { cardId, ...this.stateOf(entry), ...payload });
      }
    };
    const entry = { cardId, win, view, send, loading: false, error: null, title: '' };
    this.views.set(cardId, entry);

    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    wc.on('did-start-loading', () => {
      entry.loading = true;
      entry.error = null;
      send({});
    });
    wc.on('did-stop-loading', () => {
      entry.loading = false;
      send({});
    });
    wc.on('did-navigate', () => send({}));
    wc.on('did-navigate-in-page', () => send({}));
    wc.on('page-title-updated', (_e, title) => {
      entry.title = title || '';
      send({});
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (code === -3 || !isMainFrame) return;
      entry.loading = false;
      entry.error = { code, description: desc || '加载失败', url };
      try { view.setVisible(false); } catch {}
      send({});
    });
    wc.on('render-process-gone', () => {
      entry.error = { code: -1, description: '网页进程退出', url: '' };
      send({});
    });

    win.once('closed', () => this.destroy(cardId));
    return entry;
  }

  stateOf(entry) {
    const wc = entry.view.webContents;
    let canGoBack = false;
    let canGoForward = false;
    try {
      if (wc.navigationHistory) {
        canGoBack = wc.navigationHistory.canGoBack();
        canGoForward = wc.navigationHistory.canGoForward();
      } else {
        canGoBack = wc.canGoBack();
        canGoForward = wc.canGoForward();
      }
    } catch {}
    let url = '';
    try { url = wc.getURL(); } catch {}
    return {
      url: fromLoadUrl(url),
      loadUrl: url,
      title: entry.title,
      loading: entry.loading,
      error: entry.error,
      canGoBack,
      canGoForward,
    };
  }

  mount(cardId, rect) {
    const entry = this.ensure(cardId);
    if (!entry) return null;
    if (rect) this.setBounds(cardId, rect);
    return this.stateOf(entry);
  }

  setBounds(cardId, rect) {
    const entry = this.views.get(cardId);
    if (!entry || entry.view.webContents.isDestroyed()) return false;
    const r = {
      x: Math.max(0, Math.round(rect.x || 0)),
      y: Math.max(0, Math.round(rect.y || 0)),
      width: Math.max(1, Math.round(rect.width || 1)),
      height: Math.max(1, Math.round(rect.height || 1)),
    };
    try {
      entry.view.setBounds(r);
      entry.view.setVisible(r.height > 2 && r.width > 2);
    } catch {}
    return true;
  }

  async load(cardId, input, opts = {}) {
    const entry = this.ensure(cardId);
    if (!entry) return { ok: false, error: '卡片窗口不存在' };
    const url = toLoadUrl(input);
    if (!url) return { ok: false, error: '空地址' };
    if (!/^(https?|noteon-file|file|about):/i.test(url)) {
      return { ok: false, error: '不支持的协议' };
    }
    entry.error = null;
    entry.loading = true;
    try { entry.view.setVisible(true); } catch {}
    this.views.set(cardId, entry);
    try {
      await entry.view.webContents.loadURL(url);
      return { ok: true, ...this.stateOf(entry) };
    } catch (err) {
      entry.loading = false;
      entry.error = { code: -1, description: err.message || '加载失败', url };
      return { ok: false, error: entry.error.description, ...this.stateOf(entry) };
    }
  }

  action(cardId, action) {
    const entry = this.views.get(cardId);
    if (!entry) return false;
    const wc = entry.view.webContents;
    try {
      if (action === 'back') {
        if (wc.navigationHistory && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
        else if (wc.canGoBack && wc.canGoBack()) wc.goBack();
      } else if (action === 'forward') {
        if (wc.navigationHistory && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
        else if (wc.canGoForward && wc.canGoForward()) wc.goForward();
      } else if (action === 'reload') {
        wc.reload();
      } else if (action === 'stop') {
        wc.stop();
      }
      return true;
    } catch {
      return false;
    }
  }

  setZoom(cardId, factor) {
    const entry = this.views.get(cardId);
    if (!entry) return false;
    try {
      entry.view.webContents.setZoomFactor(Math.min(3, Math.max(0.3, Number(factor) || 1)));
      return true;
    } catch { return false; }
  }

  setVisible(cardId, visible) {
    const entry = this.views.get(cardId);
    if (!entry) return false;
    try { entry.view.setVisible(!!visible); return true; } catch { return false; }
  }

  devtools(cardId) {
    const entry = this.views.get(cardId);
    if (!entry) return false;
    try { entry.view.webContents.openDevTools({ mode: 'detach' }); return true; } catch { return false; }
  }

  destroy(cardId) {
    const entry = this.views.get(cardId);
    if (!entry) return;
    this.views.delete(cardId);
    try {
      if (entry.win && !entry.win.isDestroyed()) entry.win.contentView.removeChildView(entry.view);
    } catch {}
    try { entry.view.webContents.close(); } catch {}
  }

  destroyAll() {
    for (const id of [...this.views.keys()]) this.destroy(id);
  }
}

module.exports = { WebViewManager, toLoadUrl, fromLoadUrl };
