'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = {
  themeId: 'ink',
  customTheme: {},          // 覆盖预设里的字段
  defaultAlwaysOnTop: true,
  restoreOnStart: true,
  snap: true,
  hideFromTaskbar: true,
  showPanelOnStart: false,
  contextMenu: null,
};

function makeId(prefix = 'c') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10);
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = this.blank();
    this._timer = null;
    this._writing = false;
  }

  blank() {
    return {
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      settings: { ...DEFAULT_SETTINGS },
      pluginSettings: {},
      cards: [],
    };
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        this.data = this.normalize(parsed);
      } else {
        this.data = this.blank();
      }
    } catch (err) {
      console.error('[store] 读取配置失败，使用默认值:', err.message);
      try {
        if (fs.existsSync(this.file)) {
          fs.copyFileSync(this.file, this.file + '.broken-' + Date.now());
        }
      } catch {}
      this.data = this.blank();
    }
    return this.data;
  }

  normalize(parsed) {
    const data = { ...this.blank(), ...(parsed || {}) };
    data.settings = { ...DEFAULT_SETTINGS, ...(parsed?.settings || {}) };
    if (data.settings.customTheme == null || typeof data.settings.customTheme !== 'object') {
      data.settings.customTheme = {};
    }
    data.pluginSettings = (parsed && typeof parsed.pluginSettings === 'object' && parsed.pluginSettings) || {};
    data.cards = Array.isArray(parsed?.cards) ? parsed.cards.filter(Boolean).map((c) => this.normalizeCard(c)) : [];
    return data;
  }

  normalizeCard(c) {
    const out = {
      id: typeof c.id === 'string' && c.id ? c.id : makeId(),
      plugin: typeof c.plugin === 'string' && c.plugin ? c.plugin : 'note',
      title: typeof c.title === 'string' ? c.title : '',
      x: Number.isFinite(c.x) ? Math.round(c.x) : 160,
      y: Number.isFinite(c.y) ? Math.round(c.y) : 160,
      w: Number.isFinite(c.w) ? Math.max(160, Math.round(c.w)) : 360,
      h: Number.isFinite(c.h) ? Math.max(120, Math.round(c.h)) : 420,
      alwaysOnTop: c.alwaysOnTop !== false,
      locked: c.locked === true,
      alpha: Number.isFinite(c.alpha) ? Math.min(1, Math.max(0.2, c.alpha)) : null,
      accent: typeof c.accent === 'string' ? c.accent : '',
      themeId: typeof c.themeId === 'string' ? c.themeId : '',
      state: c.state && typeof c.state === 'object' ? c.state : {},
      createdAt: Number.isFinite(c.createdAt) ? c.createdAt : Date.now(),
      updatedAt: Number.isFinite(c.updatedAt) ? c.updatedAt : Date.now(),
    };
    if (!out.title) out.title = '';
    return out;
  }

  get settings() { return this.data.settings; }
  get cards() { return this.data.cards; }

  getCard(id) { return this.data.cards.find((c) => c.id === id) || null; }

  addCard(card) {
    const c = this.normalizeCard(card);
    this.data.cards.push(c);
    this.touch();
    return c;
  }

  updateCard(id, patch) {
    const c = this.getCard(id);
    if (!c) return null;
    const allowed = ['title', 'x', 'y', 'w', 'h', 'alwaysOnTop', 'locked', 'alpha', 'accent', 'themeId', 'plugin'];
    for (const k of allowed) {
      if (patch[k] !== undefined) c[k] = patch[k];
    }
    c.updatedAt = Date.now();
    this.touch();
    return c;
  }

  mergeState(id, patch) {
    const c = this.getCard(id);
    if (!c) return null;
    c.state = { ...(c.state || {}), ...(patch || {}) };
    c.updatedAt = Date.now();
    this.touch();
    return c;
  }

  removeCard(id) {
    const i = this.data.cards.findIndex((c) => c.id === id);
    if (i >= 0) {
      this.data.cards.splice(i, 1);
      this.touch();
      return true;
    }
    return false;
  }

  getPluginSettings(id) {
    return this.data.pluginSettings[id] || {};
  }

  mergePluginSettings(id, patch) {
    this.data.pluginSettings[id] = { ...(this.data.pluginSettings[id] || {}), ...(patch || {}) };
    this.touch();
    return this.data.pluginSettings[id];
  }

  touch() {
    this.data.updatedAt = Date.now();
    this._schedule();
  }

  _schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this.flush();
    }, 260);
  }

  flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const json = JSON.stringify(this.data, null, 2);
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 写入配置失败:', err.message);
    }
  }
}

module.exports = { Store, DEFAULT_SETTINGS, makeId };
