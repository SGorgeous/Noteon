'use strict';

(function () {
  function isLocalPath(s) {
    return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^\//.test(s);
  }

  function normalizeInput(input) {
    var s = String(input || '').trim();
    if (!s) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    if (isLocalPath(s)) return s;
    return 'http://' + s;
  }

  window.Noteon.define({
    id: 'web',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};
      let currentUrl = typeof st.url === 'string' ? st.url : '';
      let mounted = false;
      let loading = false;
      let zoom = Number.isFinite(st.zoom) ? st.zoom : 1;
      let saveTimer = 0;

      root.innerHTML = `
        <div class="wbar">
          <button class="wbtn" data-act="back" title="后退">${ctx.icon('chevronLeft', 14)}</button>
          <button class="wbtn" data-act="forward" title="前进">${ctx.icon('chevronRight', 14)}</button>
          <button class="wbtn" data-act="reload" title="刷新">${ctx.icon('refresh', 14)}</button>
          <input class="url" spellcheck="false" placeholder="输入网址，或拖入本地 HTML / 图片">
          <button class="wbtn" data-act="go" title="打开">${ctx.icon('arrowRight', 14)}</button>
          <button class="wbtn" data-act="external" title="用系统浏览器打开">${ctx.icon('external', 14)}</button>
          <button class="wbtn" data-act="more" title="更多">${ctx.icon('dots', 14)}</button>
        </div>
        <div class="wbody">
          <div class="web-host">
            <div class="welcome">
              <div class="big">${ctx.icon('web', 26)}</div>
              <div>在上面的地址栏输入网址<br>或把 HTML 文件 / 图片拖进来</div>
              <button class="btn ghost" data-act="local">打开本地 HTML</button>
            </div>
            <div class="err hidden"></div>
          </div>
          <div class="wstatus">
            <span class="st" data-role="status">就绪</span>
            <span class="u" data-role="url"></span>
          </div>
        </div>`;

      const urlInput = root.querySelector('.url');
      const host = root.querySelector('.web-host');
      const welcome = root.querySelector('.welcome');
      const errEl = root.querySelector('.err');
      const statusEl = root.querySelector('[data-role="status"]');
      const urlEl = root.querySelector('[data-role="url"]');
      const btnBack = root.querySelector('[data-act="back"]');
      const btnForward = root.querySelector('[data-act="forward"]');
      const btnReload = root.querySelector('[data-act="reload"]');

      function viewRect() {
        const r = host.getBoundingClientRect();
        return {
          x: Math.round(r.left) + 1,
          y: Math.round(r.top),
          width: Math.max(1, Math.round(r.width) - 2),
          height: Math.max(1, Math.round(r.height)),
        };
      }

      function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (currentUrl) api.saveState({ url: currentUrl, zoom });
        }, 400);
      }

      function showError(err) {
        errEl.classList.remove('hidden');
        welcome.classList.add('hidden');
        let msg = '未知错误';
        if (typeof err.description === 'string') msg = err.description;
        else if (err.description && typeof err.description.message === 'string') msg = err.description.message;
        else if (err.description) { try { msg = JSON.stringify(err.description); } catch { msg = String(err.description); } }
        errEl.innerHTML = `
          <div class="big">${ctx.icon('info', 22)}</div>
          <div class="title">网页加载失败</div>
          <div>${util.escapeHtml(msg)}${err.code ? ` <span style="opacity:.6">(${err.code})</span>` : ''}</div>
          <div class="actions">
            <button class="btn ghost" data-act="retry">重试</button>
            <button class="btn ghost" data-act="browser">用浏览器打开</button>
          </div>`;
        errEl.querySelector('[data-act="retry"]').addEventListener('click', () => go(currentUrl, true));
        errEl.querySelector('[data-act="browser"]').addEventListener('click', openExternal);
      }

      function hideError() {
        errEl.classList.add('hidden');
        errEl.innerHTML = '';
      }

      function applyState(s) {
        if (!s) return;
        if (s.url !== undefined) {
          currentUrl = s.url;
          if (document.activeElement !== urlInput) urlInput.value = currentUrl;
        }
        loading = !!s.loading;
        btnBack.disabled = !s.canGoBack;
        btnForward.disabled = !s.canGoForward;
        if (s.title && !api.card.title) api.title(s.title);

        if (s.error) {
          showError(s.error);
          statusEl.textContent = '加载失败';
          urlEl.textContent = s.url || '';
          urlEl.title = s.url || '';
          return;
        }
        hideError();
        if (currentUrl) {
          welcome.classList.add('hidden');
          statusEl.textContent = loading ? '正在加载…' : (s.title || '已加载');
          urlEl.textContent = currentUrl;
          urlEl.title = currentUrl;
          scheduleSave();
        } else {
          welcome.classList.remove('hidden');
          statusEl.textContent = '就绪';
          urlEl.textContent = '';
        }
      }

      async function go(input, force) {
        const value = normalizeInput(input);
        if (value && urlInput.value !== value) urlInput.value = value;
        if (!value) return;
        if (mounted && !force && value === currentUrl) return;
        welcome.classList.add('hidden');
        hideError();
        statusEl.textContent = '正在加载…';
        mounted = true;
        const res = await api.webLoad(value, viewRect());
        if (res && res.ok === false) {
          showError({ description: res.error || '加载失败' });
          api.webVisible(false);
          return;
        }
        if (res) applyState(res);
        api.webVisible(true);
        api.webZoom(zoom);
      }

      async function openExternal() {
        const u = currentUrl;
        if (!u) return api.toast('还没有打开页面');
        if (isLocalPath(u)) api.openPath(u);
        else api.openUrl(u);
      }

      async function openLocal() {
        const files = await api.pickFiles({ filters: [{ name: '网页', extensions: ['html', 'htm'] }], multi: false });
        if (files && files[0]) go(files[0], true);
      }

      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go(urlInput.value, true);
          urlInput.blur();
        }
        if (e.key === 'Escape') urlInput.blur();
      });
      urlInput.addEventListener('focus', () => urlInput.select());

      btnBack.addEventListener('click', () => api.webAction('back'));
      btnForward.addEventListener('click', () => api.webAction('forward'));
      btnReload.addEventListener('click', () => {
        if (currentUrl) api.webAction('reload');
        else go(urlInput.value, true);
      });
      root.querySelector('[data-act="go"]').addEventListener('click', () => go(urlInput.value, true));
      root.querySelector('[data-act="external"]').addEventListener('click', openExternal);
      root.querySelector('[data-act="local"]').addEventListener('click', openLocal);

      root.querySelector('[data-act="more"]').addEventListener('click', async () => {
        const picked = await api.menu([
          { id: 'local', label: '打开本地 HTML…' },
          { id: 'external', label: '用系统浏览器打开当前页' },
          { type: 'separator' },
          { id: 'zoom100', label: '缩放 100%' },
          { id: 'zoom125', label: '缩放 125%' },
          { id: 'zoom150', label: '缩放 150%' },
          { type: 'separator' },
          { id: 'reload', label: '刷新页面' },
          { id: 'devtools', label: '网页开发者工具' },
        ]);
        if (!picked) return;
        if (picked === 'local') openLocal();
        else if (picked === 'external') openExternal();
        else if (picked === 'reload') api.webAction('reload');
        else if (picked === 'devtools') api.webDevTools();
        else if (picked.startsWith('zoom')) {
          zoom = Number(picked.replace('zoom', '')) / 100;
          api.webZoom(zoom);
          api.saveState({ zoom });
          api.toast('网页缩放 ' + Math.round(zoom * 100) + '%');
        }
      });

      let boundsRaf = 0;
      const ro = new ResizeObserver(() => {
        if (!mounted) return;
        if (boundsRaf) return;
        boundsRaf = requestAnimationFrame(() => {
          boundsRaf = 0;
          api.webBounds(viewRect());
        });
      });
      ro.observe(host);

      api.on('web:state', (s) => {
        if (!s) return;
        if (s.cardId && s.cardId !== api.card.id) return;
        applyState(s);
        if (s.error) api.webVisible(false);
      });

      ctx.onDrop((paths, event) => {
        if (paths && paths.length) {
          if (paths.length === 1) go(paths[0], true);
          else paths.forEach((p) => api.openFile(p));
          return;
        }
        try {
          const t = event?.dataTransfer?.getData('text/uri-list') || event?.dataTransfer?.getData('text/plain');
          if (t && /^https?:/i.test(t.trim())) go(t.trim(), true);
        } catch {}
      });

      if (currentUrl) {
        urlInput.value = currentUrl;
        requestAnimationFrame(() => go(currentUrl, true));
      } else {
        urlInput.focus();
      }

      return {
        unmount() {
          ro.disconnect();
          clearTimeout(saveTimer);
          if (currentUrl) api.saveState({ url: currentUrl, zoom });
          api.webDestroy();
        },
      };
    },
  });
})();
