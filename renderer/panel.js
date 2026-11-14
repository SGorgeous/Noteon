'use strict';

(function () {
  const P = window.noteon;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const { icon } = window.NI;
  const Theme = window.NoteonTheme;

  let plugins = [];
  let cards = [];
  let settings = {};
  let refreshTimer = 0;

  const PLUGIN_ICONS = { note: 'note', text: 'text', image: 'image', folder: 'folder', web: 'web', relay: 'relay' };

  init();

  async function init() {
    bindChrome();
    bindNav();
    bindCardsTab();
    bindThemeTab();
    bindSettingsTab();

    try {
      const [pl, cd, se] = await Promise.all([P.listPlugins(), P.listCards(), P.getSettings()]);
      plugins = pl || [];
      cards = cd || [];
      settings = se || {};
      $('#ver').textContent = 'v' + (settings.version || '0.1.0');
      $('#sideVer').textContent = 'v' + (settings.version || '0.1.0');
      $('#aboutVer').textContent = settings.version || '0.1.0';
      renderPlugins();
      renderCards();
      renderTheme();
      renderSettings();
    } catch (err) {
      console.error(err);
      toast('初始化失败：' + err.message, true);
    }

    P.on('board:changed', scheduleRefresh);
    P.on('card:updated', scheduleRefresh);
    P.on('theme:changed', (payload) => {
      if (payload) {
        settings.themeId = payload.themeId;
        settings.customTheme = payload.customTheme;
        renderTheme();
      }
    });
    P.on('plugins:reloaded', (list) => {
      plugins = list || [];
      renderPlugins();
      toast('插件已重新加载');
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F5') { e.preventDefault(); refresh(); }
    });
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 120);
  }

  async function refresh() {
    try {
      [plugins, cards, settings] = await Promise.all([P.listPlugins(), P.listCards(), P.getSettings()]);
      renderPlugins();
      renderCards();
      renderSettings();
      $('#ver').textContent = 'v' + (settings.version || '0.1.0');
    } catch (err) {
      console.error(err);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 基础交互                                                            */
  /* ------------------------------------------------------------------ */

  function bindChrome() {
    $('#winMin').innerHTML = icon('minus', 14);
    $('#winMax').innerHTML = icon('square', 12);
    $('#winClose').innerHTML = icon('close', 14);
    $('#winMin').addEventListener('click', () => P.minimize());
    $('#winMax').addEventListener('click', () => P.maximize());
    $('#winClose').addEventListener('click', () => P.close());
  }

  function bindNav() {
    const icons = { cards: 'monitor', theme: 'palette', settings: 'sliders', about: 'info' };
    $$('#nav button').forEach((btn) => {
      const tab = btn.dataset.tab;
      const slot = btn.querySelector('.nic');
      if (slot) slot.innerHTML = icon(icons[tab] || 'note', 15);
      btn.addEventListener('click', () => {
        $$('#nav button').forEach((b) => b.classList.toggle('on', b === btn));
        $$('.page').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + tab));
        $('#main').scrollTop = 0;
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 卡片页                                                              */
  /* ------------------------------------------------------------------ */

  function bindCardsTab() {
    $('#showAll').addEventListener('click', () => P.showAllCards());
    $('#hideAll').addEventListener('click', () => P.hideAllCards());
    $('#pinAll').addEventListener('click', () => cards.forEach((c) => P.updateCard(c.id, { alwaysOnTop: true })));
    $('#unlockAll').addEventListener('click', () => P.unlockAll());
  }

  function renderPlugins() {
    const grid = $('#pluginGrid');
    grid.innerHTML = '';
    for (const p of plugins) {
      const tile = document.createElement('button');
      tile.className = 'plugin-tile';
      tile.style.setProperty('--c', p.accent || '#6ea8fe');
      tile.title = p.description || p.name;

      const ic = document.createElement('span');
      ic.className = 'pt-icon';
      if (p.iconUrl) {
        const img = document.createElement('img');
        img.src = p.iconUrl;
        img.alt = '';
        img.onerror = () => { ic.innerHTML = icon(PLUGIN_ICONS[p.id] || 'note', 20); };
        ic.appendChild(img);
      } else {
        ic.innerHTML = icon(PLUGIN_ICONS[p.id] || 'note', 20);
      }

      const body = document.createElement('span');
      body.className = 'pt-body';
      const name = document.createElement('span');
      name.className = 'pt-name';
      name.textContent = p.name;
      const desc = document.createElement('span');
      desc.className = 'pt-desc';
      desc.textContent = p.description || '';
      body.append(name, desc);

      const plus = document.createElement('span');
      plus.className = 'pt-plus';
      plus.textContent = '+';

      tile.append(ic, body, plus);
      tile.addEventListener('click', async () => {
        tile.disabled = true;
        try {
          await P.createCard({ plugin: p.id });
          toast('已创建「' + p.name + '」卡片');
          setTimeout(refresh, 200);
        } catch (err) {
          toast('创建失败：' + err.message, true);
        } finally {
          tile.disabled = false;
        }
      });
      grid.appendChild(tile);
    }
  }

  function subtitleOf(card) {
    const s = card.state || {};
    if (card.plugin === 'note') return (s.text || '').trim().split('\n')[0].slice(0, 90) || '空便签';
    if (card.plugin === 'text') return s.path || '未打开文件';
    if (card.plugin === 'image') return (s.items && s.items.length ? s.items.length + ' 张图片' : '未打开图片');
    if (card.plugin === 'folder') return s.path || '未映射文件夹';
    if (card.plugin === 'web') return s.url || '未打开页面';
    if (card.plugin === 'relay') return s.items && s.items.length ? s.items.length + ' 项暂存' : '暂存区是空的';
    return '';
  }

  function renderCards() {
    const list = $('#cardList');
    $('#cardCount').textContent = cards.length;
    list.innerHTML = '';
    for (const c of cards) {
      const plugin = plugins.find((p) => p.id === c.plugin);
      const row = document.createElement('div');
      row.className = 'crow';
      row.style.setProperty('--c', (plugin && plugin.accent) || '#6ea8fe');
      row.addEventListener('click', (e) => { if (!e.target.closest('.cact')) P.showCard(c.id); });
      row.addEventListener('dblclick', () => P.showCard(c.id));

      const ic = document.createElement('span');
      ic.className = 'cicon';
      if (plugin && plugin.iconUrl) {
        const img = document.createElement('img');
        img.src = plugin.iconUrl;
        img.alt = '';
        img.onerror = () => { ic.innerHTML = icon(PLUGIN_ICONS[c.plugin] || 'note', 17); };
        ic.appendChild(img);
      } else {
        ic.innerHTML = icon(PLUGIN_ICONS[c.plugin] || 'note', 17);
      }

      const main = document.createElement('div');
      main.className = 'cmain';
      const nameRow = document.createElement('div');
      nameRow.className = 'cname';
      nameRow.textContent = c.title || (plugin ? plugin.name : c.plugin);
      const sub = document.createElement('div');
      sub.className = 'csub';
      sub.textContent = subtitleOf(c) || (plugin ? plugin.name : c.plugin);
      main.append(nameRow, sub);

      if (c.alwaysOnTop) {
        const badge = document.createElement('span');
        badge.className = 'cbadge';
        badge.textContent = '置顶';
        row.appendChild(ic);
        row.append(main, badge);
      } else {
        row.append(ic, main);
      }

      const acts = document.createElement('div');
      acts.className = 'cacts';
      acts.append(
        actBtn('eye', '显示 / 聚焦', () => P.showCard(c.id)),
        actBtn('pin', c.alwaysOnTop ? '取消置顶' : '置顶', () => P.updateCard(c.id, { alwaysOnTop: !c.alwaysOnTop }), c.alwaysOnTop),
        actBtn('close', '关闭卡片', () => P.closeCard(c.id), false, true),
      );
      row.appendChild(acts);
      list.appendChild(row);
    }
  }

  function actBtn(iconName, title, onClick, active, danger) {
    const b = document.createElement('button');
    b.className = 'cact' + (danger ? ' del' : '');
    b.title = title;
    b.innerHTML = icon(iconName, 14);
    if (active) b.style.color = 'var(--p-accent)';
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  /* ------------------------------------------------------------------ */
  /* 主题页                                                              */
  /* ------------------------------------------------------------------ */

  function resolvedTheme() {
    return Theme.resolve(settings.themeId, settings.customTheme, {});
  }

  function renderTheme() {
    const grid = $('#presetGrid');
    grid.innerHTML = '';
    for (const [id, t] of Object.entries(Theme.THEMES)) {
      const b = document.createElement('button');
      b.className = 'preset' + (settings.themeId === id ? ' on' : '');
      b.style.background = t.bg;
      b.style.setProperty('--pc-fg', t.fg);
      b.style.setProperty('--pc-accent', t.accent);
      b.innerHTML = `<span class="pname">${t.name}</span><span class="pdot"></span><span class="check">${icon('check', 10)}</span>`;
      b.title = t.name;
      b.addEventListener('click', () => applySetting({ themeId: id }));
      grid.appendChild(b);
    }
    syncControls();
    applyPreview();
  }

  function syncControls() {
    const r = resolvedTheme();
    $('#accentColor').value = r.accent;
    $('#accentHex').textContent = r.accent.toUpperCase();
    $('#bgColor').value = toHex(r.bg);
    $('#bgHex').textContent = toHex(r.bg).toUpperCase();
    $('#alphaRange').value = Math.round(r.alpha * 100);
    $('#alphaVal').textContent = Math.round(r.alpha * 100) + '%';
    $('#radiusRange').value = Math.round(r.radius);
    $('#radiusVal').textContent = Math.round(r.radius) + 'px';
    $('#blurRange').value = Math.round(r.blur);
    $('#blurVal').textContent = Math.round(r.blur) + 'px';
    fillRange($('#alphaRange'));
    fillRange($('#radiusRange'));
    fillRange($('#blurRange'));
  }

  function toHex(color) {
    const [r, g, b] = Theme.parseColor(color);
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  function fillRange(el) {
    const min = Number(el.min) || 0;
    const max = Number(el.max) || 100;
    const pct = ((Number(el.value) - min) / (max - min)) * 100;
    el.style.setProperty('--fill', pct + '%');
  }

  function applyPreview() {
    const r = resolvedTheme();
    const el = $('#previewCard');
    el.style.setProperty('--bg', Theme.withAlpha(r.bg, r.alpha));
    el.style.setProperty('--fg', r.fg);
    el.style.setProperty('--muted', r.muted);
    el.style.setProperty('--border', r.border);
    el.style.setProperty('--accent', r.accent);
    el.style.setProperty('--radius', r.radius + 'px');
    el.style.setProperty('--blur', r.blur + 'px');
    el.style.setProperty('--shadow', '0 22px 50px -20px rgba(0,0,0,.65)');
  }

  function bindThemeTab() {
    const change = (patch) => applySetting(patch);

    $('#accentColor').addEventListener('input', (e) => {
      $('#accentHex').textContent = e.target.value.toUpperCase();
      change({ customTheme: { accent: e.target.value } });
    });
    $('#bgColor').addEventListener('input', (e) => {
      $('#bgHex').textContent = e.target.value.toUpperCase();
      change({ customTheme: { bg: e.target.value } });
    });
    $('#alphaRange').addEventListener('input', (e) => {
      fillRange(e.target);
      $('#alphaVal').textContent = e.target.value + '%';
      change({ customTheme: { alpha: Number(e.target.value) / 100 } });
    });
    $('#radiusRange').addEventListener('input', (e) => {
      fillRange(e.target);
      $('#radiusVal').textContent = e.target.value + 'px';
      change({ customTheme: { radius: Number(e.target.value) } });
    });
    $('#blurRange').addEventListener('input', (e) => {
      fillRange(e.target);
      $('#blurVal').textContent = e.target.value + 'px';
      change({ customTheme: { blur: Number(e.target.value) } });
    });

    $('#resetTheme').addEventListener('click', async () => {
      settings = await P.setSettings({ customTheme: {} });
      settings = { ...settings, ...(await P.getSettings()) };
      renderTheme();
      toast('已恢复预设');
    });

    $('#resetOverrides').addEventListener('click', async () => {
      await P.applyToAll({ accent: '', alpha: null, themeId: '' });
      toast('已清除所有单卡覆盖');
      setTimeout(refresh, 150);
    });
  }

  let settingTimer = 0;
  let pendingPatch = null;
  function applySetting(patch) {
    if (patch.themeId) settings.themeId = patch.themeId;
    if (patch.customTheme) settings.customTheme = { ...(settings.customTheme || {}), ...patch.customTheme };
    applyPreview();
    clearTimeout(settingTimer);
    pendingPatch = mergePatch(pendingPatch, patch);
    settingTimer = setTimeout(async () => {
      const p = pendingPatch;
      pendingPatch = null;
      try {
        const out = await P.setSettings(p);
        settings = { ...settings, ...out };
        if (patch.themeId) $$('.preset').forEach((el, i) => el.classList.toggle('on', Object.keys(Theme.THEMES)[i] === patch.themeId));
      } catch (err) {
        toast('主题保存失败：' + err.message, true);
      }
    }, 120);
  }

  function mergePatch(a, b) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) {
      if (k === 'customTheme') out.customTheme = { ...(out.customTheme || {}), ...v };
      else out[k] = v;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 设置页                                                              */
  /* ------------------------------------------------------------------ */

  function bindSettingsTab() {
    const bindSwitch = (id, key) => {
      $(id).addEventListener('change', async (e) => {
        const out = await P.setSettings({ [key]: e.target.checked });
        settings = { ...settings, ...out };
      });
    };
    bindSwitch('#setRestore', 'restoreOnStart');
    bindSwitch('#setTop', 'defaultAlwaysOnTop');
    bindSwitch('#setSnap', 'snap');
    bindSwitch('#setTaskbar', 'hideFromTaskbar');
    bindSwitch('#setPanel', 'showPanelOnStart');
    const menuModal = $('#menuModal');
    const menuList = $('#menuPlugins');
    const menuSelected = () => [...menuList.querySelectorAll('input:checked')].map((x) => x.value);

    async function openMenuEditor() {
      const info = await P.getShellMenu();
      const selected = new Set((info && info.selected) || []);
      menuList.innerHTML = '';
      for (const [id, label] of ((info && info.plugins) || [])) {
        const lab = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = id;
        cb.checked = selected.has(id);
        const span = document.createElement('span');
        span.textContent = label;
        lab.append(cb, span);
        menuList.append(lab);
      }
      menuModal.classList.remove('hidden');
    }
    function closeMenuEditor() { menuModal.classList.add('hidden'); }

    async function applyMenu(enabled) {
      const ids = menuSelected();
      const r = await P.setShellMenu({ enabled, plugins: ids });
      if (!r || !r.ok) {
        toast('右键菜单设置失败：' + ((r && r.error) || '未知错误'), true);
        return;
      }
      settings.contextMenu = !!r.enabled;
      settings.contextMenuPlugins = r.selected || ids;
      $('#setMenu').checked = !!r.enabled;
      closeMenuEditor();
      toast(r.enabled ? `已保存右键菜单（${r.selected.length} 项）` : '已关闭右键菜单');
    }

    $('#setMenu').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      const r = await P.setShellMenu({ enabled, plugins: settings.contextMenuPlugins || undefined });
      if (!r || !r.ok) {
        e.target.checked = !enabled;
        toast('右键菜单设置失败：' + ((r && r.error) || '未知错误'), true);
        return;
      }
      settings.contextMenu = !!r.enabled;
      settings.contextMenuPlugins = r.selected || null;
      e.target.checked = !!r.enabled;
      toast(r.enabled ? '已添加右键菜单（Win11 可能在「显示更多选项」里）' : '已移除右键菜单');
    });
    $('#editMenu').addEventListener('click', openMenuEditor);
    $('#menuCancel').addEventListener('click', closeMenuEditor);
    $('#menuSave').addEventListener('click', () => applyMenu(true));
    $('#menuOff').addEventListener('click', () => applyMenu(false));
    menuModal.addEventListener('click', (e) => { if (e.target === menuModal) closeMenuEditor(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menuModal.classList.contains('hidden')) closeMenuEditor();
    });

    $('#openData').addEventListener('click', () => P.openDataDir());
    $('#openPlugins').addEventListener('click', () => P.openPluginDir());
    $('#openPlugins2').addEventListener('click', () => P.openPluginDir());
    $('#openDocs').addEventListener('click', () => P.openDocs());
    $('#devtools').addEventListener('click', () => P.openDevTools());

    $('#reloadPlugins').addEventListener('click', async () => {
      const list = await P.reloadPlugins();
      plugins = list || [];
      renderPlugins();
      toast('插件已重新加载');
    });

    $('#closeAll').addEventListener('click', async () => {
      if (!cards.length) return toast('当前没有卡片');
      if (!confirm(`确定关闭全部 ${cards.length} 张卡片吗？\n卡片记录会一起删除。`)) return;
      for (const c of [...cards]) await P.closeCard(c.id);
      setTimeout(refresh, 200);
      toast('已关闭全部卡片');
    });
  }

  function renderSettings() {
    $('#setRestore').checked = !!settings.restoreOnStart;
    $('#setTop').checked = !!settings.defaultAlwaysOnTop;
    $('#setSnap').checked = !!settings.snap;
    $('#setTaskbar').checked = !!settings.hideFromTaskbar;
    $('#setPanel').checked = !!settings.showPanelOnStart;
    $('#setMenu').checked = !!settings.contextMenu;
    $('#dataDir').textContent = settings.dataDir || '—';
    $('#dataDir').title = settings.dataDir || '';
    $('#pluginDir').textContent = settings.pluginDir || '—';
    $('#pluginDir').title = settings.pluginDir || '';
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  let toastTimer = 0;
  function toast(text, isError) {
    let el = $('#p-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'p-toast';
      el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:24px', 'transform:translate(-50%,10px)',
        'padding:8px 14px', 'border-radius:8px', 'font-size:11.5px',
        'background:rgba(24,32,44,.96)', 'color:#e9eef7',
        'border:1px solid rgba(255,255,255,.1)', 'box-shadow:0 12px 34px rgba(0,0,0,.5)',
        'opacity:0', 'transition:opacity .18s ease, transform .2s ease', 'pointer-events:none',
        'z-index:99', 'max-width:70%', 'text-align:center', 'line-height:1.5',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.color = isError ? '#ffb4b4' : '#e9eef7';
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, 0)';
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translate(-50%, 10px)';
    }, 2200);
  }
})();
