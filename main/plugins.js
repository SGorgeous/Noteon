'use strict';

const fs = require('node:fs');
const path = require('node:path');

function safeId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(id);
}

/**
 * 插件宿主（主进程侧）
 * - 扫描 plugins/<id>/plugin.json
 * - 可选加载 plugins/<id>/main.cjs，通过 plugin:invoke 暴露 handlers
 * - 渲染进程侧只拿到 manifest 与一个受控 API
 */
class PluginHost {
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.store = opts.store || null;
    this.cardManager = null;
    this.manifests = new Map();
    this.handlers = new Map();
  }

  scan() {
    this.manifests.clear();
    this.handlers.clear();
    if (!fs.existsSync(this.dir)) return [];

    const entries = fs.readdirSync(this.dir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(this.dir, ent.name);
      const manifestPath = path.join(dir, 'plugin.json');
      if (!fs.existsSync(manifestPath)) continue;
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
      } catch (err) {
        console.error(`[plugins] ${ent.name}: plugin.json 解析失败 - ${err.message}`);
        continue;
      }
      const id = raw.id || ent.name;
      if (!safeId(id)) {
        console.error(`[plugins] ${ent.name}: 非法插件 id "${id}"`);
        continue;
      }
      const manifest = {
        id,
        name: raw.name || id,
        description: raw.description || '',
        version: raw.version || '0.0.0',
        icon: raw.icon || '',
        iconUrl: raw.icon ? `noteon-plugin://${id}/${String(raw.icon).replace(/^\/+/, '')}` : '',
        entry: raw.entry || 'index.js',
        entryUrl: `noteon-plugin://${id}/${String(raw.entry || 'index.js').replace(/^\/+/, '')}`,
        style: raw.style || '',
        styleUrl: raw.style ? `noteon-plugin://${id}/${String(raw.style).replace(/^\/+/, '')}` : '',
        hasMain: fs.existsSync(path.join(dir, 'main.cjs')),
        defaultSize: Array.isArray(raw.defaultSize) ? raw.defaultSize.map(Number) : [360, 420],
        minSize: Array.isArray(raw.minSize) ? raw.minSize.map(Number) : [220, 160],
        singleton: raw.singleton === true,
        acceptsDrop: raw.acceptsDrop !== false,
        order: Number.isFinite(raw.order) ? raw.order : 100,
        accent: typeof raw.accent === 'string' ? raw.accent : '',
        dir,
        builtin: raw.builtin !== false,
      };
      this.manifests.set(id, manifest);
      this.loadMain(manifest);
    }
    return this.list();
  }

  loadMain(manifest) {
    const mainPath = path.join(manifest.dir, 'main.cjs');
    if (!fs.existsSync(mainPath)) return;
    try {
      delete require.cache[require.resolve(mainPath)];
      const mod = require(mainPath);
      if (mod && typeof mod.handlers === 'object') {
        this.handlers.set(manifest.id, mod.handlers);
      }
      if (mod && typeof mod.activate === 'function') {
        mod.activate({ manifest, store: this.store, cards: () => this.cardManager, dir: manifest.dir });
      }
    } catch (err) {
      console.error(`[plugins] ${manifest.id}: main.cjs 加载失败 - ${err.message}`);
    }
  }

  get(id) {
    return this.manifests.get(id) || null;
  }

  list() {
    return [...this.manifests.values()]
      .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'zh-CN'))
      .map((m) => ({ ...m, dir: undefined }));
  }

  async invoke(id, fn, args, extra = {}) {
    const handlers = this.handlers.get(id);
    if (!handlers || typeof handlers[fn] !== 'function') {
      throw new Error(`插件 ${id} 没有主进程处理器 "${fn}"`);
    }
    const ctx = {
      store: this.store,
      cards: this.cardManager,
      dir: this.manifests.get(id)?.dir,
      ...extra,
    };
    return handlers[fn](args, ctx);
  }
}

module.exports = { PluginHost, safeId };
