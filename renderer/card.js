'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);
  const host = $('#host');
  const bar = $('#bar');
  const titleEl = $('#title');
  const picon = $('#picon');
  const toastEl = $('#toast');
  const statusEl = $('#status');
  const statusText = $('#statusText');
  const btnHide = $('#btnHide');
  const btnPin = $('#btnPin');
  const btnFull = $('#btnFull');
  const btnMini = $('#btnMini');
  const btnMore = $('#btnMore');
  const btnClose = $('#btnClose');

  let info = null;
  let card = null;
  let manifest = null;
  let theme = null;
  let instance = null;
  let def = null;

  const defs = new Map();
  const dropHandlers = new Set();
  const themeHandlers = new Set();
  const updateHandlers = new Set();

  window.Noteon = {
    define(pluginDef) {
      if (pluginDef && pluginDef.id) defs.set(pluginDef.id, pluginDef);
    },
  };

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */

  const Util = {
    escapeHtml(s) {
      return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    formatSize(bytes) {
      const n = Number(bytes) || 0;
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(n < 10485760 ? 1 : 0) + ' MB';
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    },
    formatTime(ms) {
      if (!ms) return '';
      const d = new Date(ms);
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },
    ext(name) {
      const s = String(name || '');
      const m = s.match(/\.([a-zA-Z0-9]+)$/);
      return m ? m[1].toLowerCase() : '';
    },
    kind(name) {
      const e = Util.ext(name);
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'svg'].includes(e)) return 'image';
      if (['html', 'htm'].includes(e)) return 'web';
      if (['txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'css', 'scss', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'py', 'c', 'h', 'cpp', 'cs', 'java', 'go', 'rs', 'sh', 'bat', 'ps1', 'toml', 'sql', 'gitignore'].includes(e)) return 'text';
      if (['pdf'].includes(e)) return 'pdf';
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'archive';
      if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(e)) return 'video';
      if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(e)) return 'audio';
      return 'file';
    },
    iconFor(name, isDir) {
      if (isDir) return 'folder';
      switch (Util.kind(name)) {
        case 'image': return 'fileImage';
        case 'text': return 'fileText';
        case 'web': return 'web';
        case 'audio': return 'note';
        case 'video': return 'image';
        default: return 'file';
      }
    },
    message(html, icon) {
      return `<div class="empty">${icon ? `<div class="big">${window.NI.icon(icon, 22)}</div>` : ''}${html}</div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* 启动                                                                */
  /* ------------------------------------------------------------------ */

  boot();

  async function boot() {
    try {
      info = await window.noteon.cardGet();
      if (!info || !info.card) {
        fatal('卡片数据丢失，请关闭后重新创建。');
        return;
      }
      card = info.card;
      manifest = info.manifest;
      theme = window.NoteonTheme.resolve(info.theme.themeId, info.theme.customTheme, card);
      window.NoteonTheme.apply(document.documentElement, theme);

      renderChrome();
      bindWindow();
      bindEvents();

      if (manifest.styleUrl) {
        await new Promise((resolve) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = manifest.styleUrl;
          link.onload = resolve;
          link.onerror = resolve;
          document.head.appendChild(link);
        });
      }

      await loadScript(manifest.entryUrl);
      def = defs.get(card.plugin);
      if (!def) throw new Error(`插件 "${card.plugin}" 没有注册（检查 ${manifest.entry} 是否调用了 Noteon.define）`);

      const root = document.createElement('div');
      root.className = `plugin plugin-${card.plugin}`;
      host.appendChild(root);

      const ctx = buildContext(root);
      instance = await def.mount(ctx);
      document.body.classList.add('ready');
    } catch (err) {
      console.error('[card] 启动失败', err);
      fatal(err.message || String(err));
    }
  }

  function fatal(message) {
    document.body.classList.add('ready');
    host.innerHTML = `<div class="boot-error">
      <div>${window.NI.icon('info', 26)}</div>
      <div>${Util.escapeHtml(message)}</div>
      <button class="btn ghost" onclick="location.reload()">重新加载</button>
    </div>`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('插件脚本加载失败：' + src));
      document.head.appendChild(s);
    });
  }

  function screenPoint(e) {
    if (e.screenX || e.screenY) return { x: e.screenX, y: e.screenY };
    return { x: Math.round(window.screenX + e.clientX), y: Math.round(window.screenY + e.clientY) };
  }

  /* ------------------------------------------------------------------ */
  /* 外壳                                                                */
  /* ------------------------------------------------------------------ */

  function renderChrome() {
    btnHide.innerHTML = window.NI.icon('eyeOff', 14);
    btnHide.title = '隐藏卡片（从托盘或控制台恢复）';
    btnPin.innerHTML = window.NI.icon('pin', 14);
    btnFull.innerHTML = window.NI.icon('fit', 14);
    btnMini.innerHTML = window.NI.icon('square', 14);
    btnMore.innerHTML = window.NI.icon('dots', 14);
    btnClose.innerHTML = window.NI.icon('close', 14);
    btnFull.title = '全屏显示（再点一次恢复）';
    btnMini.title = '小窗模式';
    btnPin.title = card.alwaysOnTop ? '已置顶（点击取消）' : '置顶窗口';
    btnPin.classList.toggle('active', !!card.alwaysOnTop);

    picon.innerHTML = '';
    if (manifest.iconUrl) {
      const img = document.createElement('img');
      img.src = manifest.iconUrl;
      img.alt = '';
      img.onerror = () => { picon.innerHTML = window.NI.icon('note', 14); };
      picon.appendChild(img);
    } else {
      picon.innerHTML = window.NI.icon('note', 14);
    }
    updateTitle();
  }

  function updateTitle() {
    titleEl.textContent = card.title || (manifest ? manifest.name : 'Noteon');
  }

  function applyTheme() {
    theme = window.NoteonTheme.resolve(info.theme.themeId, info.theme.customTheme, card);
    window.NoteonTheme.apply(document.documentElement, theme);
    btnPin.classList.toggle('active', !!card.alwaysOnTop);
    btnPin.title = card.alwaysOnTop ? '已置顶（点击取消）' : '置顶窗口';
    for (const fn of themeHandlers) {
      try { fn(theme); } catch (err) { console.error(err); }
    }
  }

  function bindWindow() {
    /* ---- 拖动 ---- */
    let dragging = false;
    let last = { x: 0, y: 0 };
    let raf = 0;

    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.tools, button, [contenteditable="true"]')) return;
      e.preventDefault();
      dragging = true;
      bar.classList.add('dragging');
      bar.setPointerCapture(e.pointerId);
      last = screenPoint(e);
      window.noteon.dragStart(last);
    });
    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      last = screenPoint(e);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        window.noteon.dragMove(last);
      });
    });
    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('dragging');
      window.noteon.dragEnd();
    };
    bar.addEventListener('pointerup', stopDrag);
    bar.addEventListener('pointercancel', stopDrag);
    bar.addEventListener('lostpointercapture', stopDrag);

    /* ---- 缩放 ---- */
    for (const handle of document.querySelectorAll('.rh')) {
      let active = false;
      let point = { x: 0, y: 0 };
      let raf2 = 0;
      const edge = handle.dataset.edge;
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        active = true;
        handle.setPointerCapture(e.pointerId);
        point = screenPoint(e);
        window.noteon.resizeStart(edge, point);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!active) return;
        point = screenPoint(e);
        if (raf2) return;
        raf2 = requestAnimationFrame(() => {
          raf2 = 0;
          window.noteon.resizeMove(point);
        });
      });
      const stop = () => {
        if (!active) return;
        active = false;
        window.noteon.resizeEnd();
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      handle.addEventListener('lostpointercapture', stop);
    }

    /* ---- 按钮 ---- */
    btnPin.addEventListener('click', async () => {
      card = await window.noteon.updateCard({ alwaysOnTop: !card.alwaysOnTop }) || card;
      applyTheme();
      toast(card.alwaysOnTop ? '已置顶' : '已取消置顶');
    });
    btnHide.addEventListener('click', () => window.noteon.hide());
    btnClose.addEventListener('click', () => window.noteon.close());
    btnMore.addEventListener('click', openCardMenu);
    btnFull.addEventListener('click', async () => {
      const full = await window.noteon.fullscreen();
      btnFull.classList.toggle('active', !!full);
    });
    btnMini.addEventListener('click', async () => {
      await window.noteon.smallWindow();
      btnFull.classList.remove('active');
    });

    /* ---- 标题重命名 ---- */
    titleEl.addEventListener('dblclick', () => startRename());
  }

  function startRename() {
    if (titleEl.isContentEditable) return;
    const original = card.title || manifest.name;
    titleEl.textContent = original;
    titleEl.contentEditable = 'true';
    titleEl.classList.add('editing');
    titleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = async (save) => {
      titleEl.contentEditable = 'false';
      titleEl.classList.remove('editing');
      const value = titleEl.textContent.trim();
      if (save && value && value !== original) {
        card = await window.noteon.updateCard({ title: value }) || card;
      }
      updateTitle();
    };
    titleEl.addEventListener('blur', () => finish(true), { once: true });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); titleEl.textContent = original; finish(false); }
    });
  }

  function showCardMenu(items) {
    const menu = document.querySelector('#cardMenu');
    return new Promise((resolve) => {
      const close = (value) => {
        menu.classList.add('hidden');
        menu.innerHTML = '';
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', esc, true);
        resolve(value || null);
      };
      const outside = (e) => { if (!menu.contains(e.target)) close(null); };
      const esc = (e) => { if (e.key === 'Escape') close(null); };

      const build = (parent, list) => {
        for (const item of list || []) {
          if (item.type === 'separator') {
            const sep = document.createElement('div');
            sep.className = 'cm-sep';
            parent.appendChild(sep);
            continue;
          }
          const row = document.createElement('div');
          row.className = 'cm-item';
          if (item.enabled === false) row.classList.add('disabled');
          const check = document.createElement('span');
          check.className = 'cm-check';
          check.textContent = item.type === 'checkbox' && item.checked ? '✓' : '';
          const label = document.createElement('span');
          label.className = 'cm-label';
          label.textContent = item.label || '';
          row.appendChild(check);
          row.appendChild(label);
          if (item.submenu) {
            const arrow = document.createElement('span');
            arrow.className = 'cm-arrow';
            arrow.textContent = '›';
            row.appendChild(arrow);
            const sub = document.createElement('div');
            sub.className = 'cm-sub';
            build(sub, item.submenu);
            row.appendChild(sub);
            const placeSub = () => {
              requestAnimationFrame(() => {
                if (!sub.classList.contains('open') && !row.classList.contains('open') && !row.matches(':hover')) return;
                const r = sub.getBoundingClientRect();
                sub.classList.toggle('left', r.right > window.innerWidth - 8);
                const rr = sub.getBoundingClientRect();
                let shift = 0;
                if (rr.bottom > window.innerHeight - 8) shift = window.innerHeight - 8 - rr.bottom;
                if (rr.top + shift < 8) shift = 8 - rr.top;
                sub.style.top = (-6 + shift) + 'px';
              });
            };
            row.addEventListener('mouseenter', placeSub);
            row.addEventListener('click', (e) => {
              e.stopPropagation();
              const open = row.classList.contains('open');
              menu.querySelectorAll('.cm-item.open').forEach((el) => el.classList.remove('open'));
              row.classList.toggle('open', !open);
              placeSub();
            });
          } else {
            row.addEventListener('click', () => {
              if (item.enabled === false) return;
              close(item.id || null);
            });
          }
          parent.appendChild(row);
        }
      };

      build(menu, items);
      menu.classList.remove('hidden');
      menu.style.left = '8px';
      menu.style.top = '48px';
      const rect = btnMore.getBoundingClientRect();
      requestAnimationFrame(() => {
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - menu.offsetWidth - margin);
        menu.style.left = Math.max(margin, Math.min(rect.right - menu.offsetWidth, maxLeft)) + 'px';
        menu.classList.toggle('left-sub', rect.right > window.innerWidth / 2);
        let top = rect.bottom + 6;
        if (top + menu.offsetHeight > window.innerHeight - margin) top = Math.max(margin, rect.top - menu.offsetHeight - 6);
        menu.style.top = top + 'px';
      });
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
      document.addEventListener('keydown', esc, true);
    });
  }

  async function openCardMenu() {
    const currentTheme = card.themeId || info.theme.themeId;
    const currentAlpha = Math.round((Number.isFinite(card.alpha) ? card.alpha : theme.alpha) * 100);
    const themeItems = Object.entries(window.NoteonTheme.THEMES).map(([id, t]) => ({
      id: 'theme:' + id, label: t.name, type: 'checkbox', checked: currentTheme === id,
    }));
    const alphaItems = [100, 95, 90, 85, 80, 70, 60].map((v) => ({
      id: 'alpha:' + v, label: v + '%', type: 'checkbox', checked: currentAlpha === v,
    }));
    const items = [
      { id: 'pin', label: '窗口置顶', type: 'checkbox', checked: !!card.alwaysOnTop },
      { id: 'desktop', label: '桌面模式（不置顶）', type: 'checkbox', checked: !!card.desktop },
      ...(card.plugin === 'web' ? [] : [{ id: 'lock', label: '鼠标穿透（锁定）', type: 'checkbox', checked: !!card.locked }]),
      { type: 'separator' },
      { label: '主题', submenu: themeItems },
      { label: '不透明度', submenu: alphaItems },
      { type: 'separator' },
      { id: 'rename', label: '重命名' },
      { id: 'reload', label: '重新加载卡片' },
      { id: 'devtools', label: '开发者工具' },
      { type: 'separator' },
      { id: 'close', label: '关闭卡片' },
    ];
    const picked = await showCardMenu(items);
    if (!picked) return;
    if (picked === 'pin') {
      card = await window.noteon.updateCard({ alwaysOnTop: !card.alwaysOnTop }) || card;
      applyTheme();
    } else if (picked === 'desktop') {
      const next = !card.desktop;
      const res = await window.noteon.updateCard({ desktop: next });
      if (!res) {
        toast('嵌入桌面失败（仅 Windows 可用）', true);
      } else {
        card = res;
        applyTheme();
        toast(res.desktop ? '已进入桌面模式；可从托盘「全部取消桌面模式」恢复' : '已取消桌面模式');
      }
    } else if (picked === 'lock') {
      toast('已开启鼠标穿透，可在托盘菜单「解除全部鼠标穿透」恢复');
      setTimeout(() => window.noteon.updateCard({ locked: true }), 800);
      card = { ...card, locked: true };
    } else if (picked === 'rename') {
      startRename();
    } else if (picked === 'reload') {
      location.reload();
    } else if (picked === 'devtools') {
      window.noteon.openDevTools();
    } else if (picked === 'close') {
      window.noteon.close();
    } else if (picked.startsWith('theme:')) {
      card = await window.noteon.updateCard({ themeId: picked.slice(6) }) || card;
      applyTheme();
      toast('主题：' + window.NoteonTheme.THEMES[picked.slice(6)].name);
    } else if (picked.startsWith('alpha:')) {
      const alpha = Number(picked.slice(6)) / 100;
      card = await window.noteon.updateCard({ alpha }) || card;
      applyTheme();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 事件                                                                */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    window.noteon.on('theme:changed', (payload) => {
      if (!payload) return;
      info.theme = { themeId: payload.themeId, customTheme: payload.customTheme };
      applyTheme();
      if (payload.settings) info.settings = payload.settings;
    });
    window.noteon.on('card:updated', (payload) => {
      if (!payload || payload.id !== card.id) return;
      card = { ...card, ...payload };
      updateTitle();
      applyTheme();
      for (const fn of updateHandlers) {
        try { fn(card); } catch (err) { console.error(err); }
      }
    });
    window.noteon.on('plugins:reloaded', () => location.reload());

    host.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files || []);
      const paths = files.map((f) => window.noteon.getPathForFile(f)).filter(Boolean);
      if (!paths.length) return;
      if (dropHandlers.size === 0) {
        if (paths.length === 1) window.noteon.openFile(paths[0]);
        return;
      }
      for (const fn of dropHandlers) {
        try { fn(paths, e); } catch (err) { console.error(err); }
      }
    });

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        window.noteon.close();
      }
      if (mod && e.key.toLowerCase() === 'h') {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
        if (!typing) {
          e.preventDefault();
          window.noteon.hide();
        }
      }
      if (e.key === 'Escape' && titleEl.isContentEditable) titleEl.blur();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 上下文                                                              */
  /* ------------------------------------------------------------------ */

  function buildContext(root) {
    let toastTimer = 0;

    const api = {
      get card() { return card; },
      get manifest() { return manifest; },
      get theme() { return theme; },
      get state() { return card.state || {}; },

      title(text) {
        card = { ...card, title: text };
        updateTitle();
        return window.noteon.updateCard({ title: text });
      },
      close() { return window.noteon.close(); },
      hide() { return window.noteon.hide(); },
      setImmersive(on) { document.body.classList.toggle('immersive', !!on); },
      isImmersive() { return document.body.classList.contains('immersive'); },
      openCard(opts) { return window.noteon.openCard(opts); },
      openFile(p) { return window.noteon.openFile(p); },
      showCard(id) { return window.noteon.showCard(id); },
      listCards() { return window.noteon.listCards(); },

      saveState(patch) {
        card.state = { ...(card.state || {}), ...(patch || {}) };
        return window.noteon.saveState(patch || {});
      },

      pickFolder() { return window.noteon.pickFolder(); },
      pickFiles(opts) { return window.noteon.pickFiles(opts); },
      saveFileDialog(opts) { return window.noteon.saveFileDialog(opts); },
      messageBox(opts) { return window.noteon.messageBox(opts); },
      readDir(dir, hidden) { return window.noteon.readDir(dir, hidden); },
      readText(p, max) { return window.noteon.readText(p, max); },
      writeText(p, text) { return window.noteon.writeText(p, text); },
      stat(p) { return window.noteon.stat(p); },
      exists(p) { return window.noteon.exists(p); },
      copyInto(paths, dest) { return window.noteon.copyInto(paths, dest); },
      listDrives() { return window.noteon.listDrives(); },
      reveal(p) { return window.noteon.reveal(p); },
      openPath(p) { return window.noteon.openPath(p); },
      openUrl(u) { return window.noteon.openUrl(u); },
      copy(text) { return window.noteon.copyText(text); },
      setStylusArea(area) { return window.noteon.setStylusArea(area); },
      readClipboardImage() { return window.noteon.readClipboardImage(); },
      writeClipboardImage(data) { return window.noteon.writeClipboardImage(data); },
      readClipboardText() { return window.noteon.readClipboardText(); },
      writeClipboardText(text) { return window.noteon.writeClipboardText(text); },
      dragFile(p) { return window.noteon.dragFile(p); },
      menu(items, x, y) { return window.noteon.menu(items, x, y); },
      invoke(fn, args) { return window.noteon.invoke(fn, args); },
      pluginSettings() { return window.noteon.pluginSettings(); },
      savePluginSettings(patch) { return window.noteon.savePluginSettings(patch); },
      openDevTools() { return window.noteon.openDevTools(); },
      on(channel, cb) { return window.noteon.on(channel, cb); },

      webMount(rect) { return window.noteon.webMount(rect); },
      webBounds(rect) { return window.noteon.webBounds(rect); },
      webLoad(url, rect) { return window.noteon.webLoad(url, rect); },
      webAction(action) { return window.noteon.webAction(action); },
      webZoom(factor) { return window.noteon.webZoom(factor); },
      webVisible(visible) { return window.noteon.webVisible(visible); },
      webDevTools() { return window.noteon.webDevTools(); },
      webDestroy() { return window.noteon.webDestroy(); },

      captureScreen() { return window.noteon.captureScreen(); },
      captureRegion() { return window.noteon.captureRegion(); },
      saveCapture(dataUrl, saveAs) { return window.noteon.saveCapture(dataUrl, saveAs); },

      async loadImage(src) {
        const r = await window.noteon.loadImage(src);
        if (!r || !r.ok) throw new Error((r && r.error) || '图片加载失败');
        let blob;
        if (r.dataUrl) {
          const m = String(r.dataUrl).match(/^data:([^;]+);base64,(.*)$/s);
          if (!m) throw new Error('图片数据无效');
          const bin = atob(m[2]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          blob = new Blob([arr], { type: m[1] || 'image/png' });
        } else {
          blob = new Blob([r.bytes], { type: r.mime || 'image/png' });
        }
        const url = URL.createObjectURL(blob);
        try {
          const dim = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => reject(new Error('图片解码失败：' + (r.name || src)));
            img.src = url;
          });
          return { url, width: dim.w, height: dim.h, name: r.name, path: r.path, mime: r.mime, size: r.size, revoke: () => URL.revokeObjectURL(url) };
        } catch (err) {
          URL.revokeObjectURL(url);
          throw err;
        }
      },

      toast,
      setStatus(text) {
        if (!text) {
          statusEl.classList.add('hidden');
          return;
        }
        statusText.textContent = text;
        statusEl.classList.remove('hidden');
      },
      onDrop(fn) {
        dropHandlers.add(fn);
        return () => dropHandlers.delete(fn);
      },
      onTheme(fn) {
        themeHandlers.add(fn);
        return () => themeHandlers.delete(fn);
      },
      onCardUpdate(fn) {
        updateHandlers.add(fn);
        return () => updateHandlers.delete(fn);
      },
    };

    return {
      card,
      manifest,
      root,
      api,
      get theme() { return theme; },
      util: Util,
      icon: (name, size) => window.NI.icon(name, size),
      onDrop: api.onDrop,
      onTheme: api.onTheme,
      onCardUpdate: api.onCardUpdate,
    };
  }

  function toast(text, ms = 1800) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  window.NoteonUtil = Util;
})();
