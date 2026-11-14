'use strict';

const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const { makeId } = require('./store');

class CardManager {
  constructor(opts) {
    this.store = opts.store;
    this.plugins = opts.plugins;
    this.root = opts.root;
    this.smoke = opts.smoke === true;
    this.windows = new Map();      // cardId -> BrowserWindow
    this.byWebContents = new Map(); // webContents.id -> cardId
    this._saveTimers = new Map();
    this._closed = false;
  }

  manifestOf(card) {
    return this.plugins.get(card.plugin);
  }

  listCards() {
    return this.store.cards.map((c) => this.publicCard(c));
  }

  publicCard(c) {
    const m = this.manifestOf(c);
    return {
      id: c.id,
      plugin: c.plugin,
      pluginName: m ? m.name : c.plugin,
      title: c.title || (m ? m.name : '卡片'),
      state: c.state || {},
      alwaysOnTop: !!c.alwaysOnTop,
      locked: !!c.locked,
      alpha: c.alpha,
      accent: c.accent || '',
      themeId: c.themeId || '',
      bounds: { x: c.x, y: c.y, width: c.w, height: c.h },
      createdAt: c.createdAt,
    };
  }

  defaultBounds(manifest, opts = {}) {
    const size = (manifest && manifest.defaultSize) || [360, 420];
    const w = Math.round(Math.min(Math.max(size[0] || 360, 240), 1600));
    const h = Math.round(Math.min(Math.max(size[1] || 420, 180), 1200));
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const area = display.workArea;
    const offset = (this.store.cards.length % 6) * 28;
    let x = Math.round(area.x + (area.width - w) / 2 + offset - 60);
    let y = Math.round(area.y + (area.height - h) / 2 + offset - 40);
    if (opts.bounds && Number.isFinite(opts.bounds.x)) {
      x = Math.round(opts.bounds.x);
      y = Math.round(opts.bounds.y);
    }
    return { x, y, w: Number.isFinite(opts.bounds?.w) ? opts.bounds.w : w, h: Number.isFinite(opts.bounds?.h) ? opts.bounds.h : h };
  }

  ensureOnScreen(card) {
    const rect = { x: card.x, y: card.y, width: card.w, height: card.h };
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const a = d.workArea;
      const ix = Math.max(0, Math.min(rect.x + rect.width, a.x + a.width) - Math.max(rect.x, a.x));
      const iy = Math.max(0, Math.min(rect.y + rect.height, a.y + a.height) - Math.max(rect.y, a.y));
      return ix * iy > 2000;
    });
    if (!visible) {
      const area = screen.getPrimaryDisplay().workArea;
      card.x = Math.round(area.x + (area.width - card.w) / 2);
      card.y = Math.round(area.y + (area.height - card.h) / 2);
    }
  }

  create(opts = {}) {
    const manifest = this.plugins.get(opts.plugin) || this.plugins.get('note');
    if (!manifest) throw new Error('没有任何可用插件');
    const bounds = this.defaultBounds(manifest, opts);
    const card = this.store.addCard({
      id: makeId(),
      plugin: manifest.id,
      title: opts.title || '',
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      alwaysOnTop: opts.alwaysOnTop !== undefined ? !!opts.alwaysOnTop : !!this.store.settings.defaultAlwaysOnTop,
      alpha: Number.isFinite(opts.alpha) ? opts.alpha : null,
      themeId: opts.themeId || '',
      accent: opts.accent || '',
      state: opts.state || {},
    });
    this.openWindow(card, { focus: opts.focus !== false, inactive: opts.inactive === true });
    return this.publicCard(card);
  }

  openWindow(card, opts = {}) {
    if (this.windows.has(card.id)) {
      const w = this.windows.get(card.id);
      if (opts.focus) { w.show(); w.focus(); }
      return w;
    }
    this.ensureOnScreen(card);
    const manifest = this.manifestOf(card);
    const min = (manifest && manifest.minSize) || [220, 160];
    const win = new BrowserWindow({
      x: card.x,
      y: card.y,
      width: card.w,
      height: card.h,
      minWidth: Math.max(180, min[0] || 220),
      minHeight: Math.max(120, min[1] || 160),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      thickFrame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: !!this.store.settings.hideFromTaskbar,
      show: false,
      acceptFirstMouse: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload-card.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        webviewTag: true,
        backgroundThrottling: false,
      },
    });

    this.windows.set(card.id, win);
    this.byWebContents.set(win.webContents.id, card.id);

    win.setAlwaysOnTop(!!card.alwaysOnTop, 'floating');
    if (card.locked) win.setIgnoreMouseEvents(true, { forward: true });

    win.once('ready-to-show', () => {
      if (opts.inactive || this.smoke) win.showInactive();
      else win.show();
      if (opts.focus && !this.smoke) win.focus();
    });

    win.on('move', () => this.captureBounds(card.id));
    win.on('resize', () => this.captureBounds(card.id));

    win.on('closed', () => {
      this.windows.delete(card.id);
      this.byWebContents.delete(card.id);
      for (const [wcId, cid] of this.byWebContents) {
        if (cid === card.id) this.byWebContents.delete(wcId);
      }
      if (!this._closed) {
        this.store.removeCard(card.id);
        this.broadcast('board:changed', this.listCards());
      }
    });

    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[card] 渲染进程退出', card.id, details.reason);
    });

    win.loadFile(path.join(this.root, 'renderer', 'card.html'), { query: { id: card.id } });
    return win;
  }

  captureBounds(id) {
    const win = this.windows.get(id);
    const card = this.store.getCard(id);
    if (!win || !card || win.isDestroyed()) return;
    if (this._saveTimers.has(id)) clearTimeout(this._saveTimers.get(id));
    this._saveTimers.set(id, setTimeout(() => {
      this._saveTimers.delete(id);
      try {
        const b = win.getBounds();
        this.store.updateCard(id, { x: b.x, y: b.y, w: b.width, h: b.height });
      } catch {}
    }, 220));
  }

  getById(id) { return this.windows.get(id) || null; }

  cardIdOfWebContents(wc) {
    return this.byWebContents.get(wc.id) || null;
  }

  show(id) {
    const card = this.store.getCard(id);
    if (card) this.ensureOnScreen(card);
    const win = this.windows.get(id);
    if (!win) {
      if (!card) return false;
      this.openWindow(card, { focus: true });
      return true;
    }
    if (card) win.setPosition(card.x, card.y, false);
    win.show();
    win.moveTop();
    win.focus();
    return true;
  }

  close(id) {
    const win = this.windows.get(id);
    if (!win) {
      this.store.removeCard(id);
      return true;
    }
    win.close();
    return true;
  }

  update(id, patch) {
    const card = this.store.updateCard(id, patch);
    if (!card) return null;
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) {
      if (patch.alwaysOnTop !== undefined) win.setAlwaysOnTop(!!patch.alwaysOnTop, 'floating');
      if (patch.locked !== undefined) {
        if (patch.locked) win.setIgnoreMouseEvents(true, { forward: true });
        else win.setIgnoreMouseEvents(false);
      }
      if (patch.title !== undefined) win.setTitle(patch.title || '');
    }
    this.broadcast('card:updated', this.publicCard(card));
    return this.publicCard(card);
  }

  setAllAlwaysOnTop(value) {
    for (const card of this.store.cards) {
      this.store.updateCard(card.id, { alwaysOnTop: !!value });
      const win = this.windows.get(card.id);
      if (win) win.setAlwaysOnTop(!!value, 'floating');
    }
    this.broadcast('card:updated', null);
    this.broadcast('board:changed', this.listCards());
  }

  unlockAll() {
    for (const card of this.store.cards) {
      this.store.updateCard(card.id, { locked: false });
      const win = this.windows.get(card.id);
      if (win) win.setIgnoreMouseEvents(false);
    }
    this.broadcast('card:updated', null);
    this.broadcast('board:changed', this.listCards());
  }

  hideAll() {
    for (const win of this.windows.values()) win.hide();
  }

  showAll() {
    let first = null;
    for (const card of this.store.cards) {
      this.ensureOnScreen(card);
      let win = this.windows.get(card.id);
      if (!win) win = this.openWindow(card, { inactive: true });
      if (win) {
        win.showInactive();
        win.moveTop();
        if (!first) first = win;
      }
    }
    // 把第一张卡片提到最前，控制台会自动失焦、让出置顶
    if (first && !first.isDestroyed()) first.focus();
  }

  broadcast(channel, payload) {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  send(id, channel, payload) {
    const win = this.windows.get(id);
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  restore() {
    for (const card of this.store.cards) {
      this.openWindow(card, { focus: false, inactive: true });
    }
  }

  shutdown() {
    this._closed = true;
    for (const t of this._saveTimers.values()) clearTimeout(t);
    this._saveTimers.clear();
  }
}

module.exports = { CardManager };
