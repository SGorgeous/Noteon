'use strict';

(function () {
  const TEXT_FILTERS = [{ name: '文本 / 代码', extensions: ['txt', 'md', 'markdown', 'json', 'js', 'mjs', 'cjs', 'ts', 'css', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'log', 'csv', 'py', 'c', 'h', 'cpp', 'cs', 'java', 'go', 'rs', 'sh', 'bat', 'ps1', 'toml', 'sql'] }, { name: '所有文件', extensions: ['*'] }];

  window.Noteon.define({
    id: 'text',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};
      let filePath = typeof st.path === 'string' ? st.path : '';
      let fontSize = Number(st.fontSize) || 12.5;
      let wrap = st.wrap !== false;
      let savedText = '';
      let eol = '\n';
      let saveTimer = 0;
      let loading = false;

      root.innerHTML = `
        <div class="tbar">
          <span class="tname">未打开文件</span>
          <span class="tdot" title="有未保存修改"></span>
          <span class="tspacer"></span>
          <button class="tbtn" data-act="open" title="打开文本文件"></button>
          <button class="tbtn" data-act="reload" title="从磁盘重新加载">${ctx.icon('refresh', 13)}</button>
          <button class="tbtn" data-act="save" title="保存 (Ctrl+S)">${ctx.icon('save', 13)}</button>
          <button class="tbtn" data-act="wrap" title="自动换行">换行</button>
          <button class="tbtn" data-act="font" title="切换字号">Aa</button>
        </div>
        <div class="tbody">
          <div class="empty" data-role="empty">
            <div class="big">${ctx.icon('fileText', 22)}</div>
            <div>把 txt / md / 代码文件拖进来<br>或者 <button class="linkbtn" data-act="open-empty">选择文件</button></div>
          </div>
          <textarea class="tarea hidden" spellcheck="false" placeholder="在这里输入…"></textarea>
        </div>
        <div class="tfoot hidden" data-role="foot">
          <span data-role="meta"></span>
          <span class="path" data-role="path"></span>
        </div>`;

      const ta = root.querySelector('.tarea');
      const empty = root.querySelector('[data-role="empty"]');
      const foot = root.querySelector('[data-role="foot"]');
      const meta = root.querySelector('[data-role="meta"]');
      const pathEl = root.querySelector('[data-role="path"]');
      const dot = root.querySelector('.tdot');
      const nameEl = root.querySelector('.tname');
      const btnWrap = root.querySelector('[data-act="wrap"]');
      const btnOpen = root.querySelector('[data-act="open"]');

      btnOpen.innerHTML = ctx.icon('folderOpen', 13);
      ta.style.fontSize = fontSize + 'px';
      btnWrap.classList.toggle('on', wrap);
      ta.wrap = wrap ? 'soft' : 'off';

      function baseName(p) {
        return String(p || '').split(/[\\/]/).pop() || 'untitled.txt';
      }

      function isDirty() {
        return !loading && filePath && ta.value !== savedText;
      }

      function refreshMeta() {
        const chars = ta.value.length;
        const lines = ta.value ? ta.value.split('\n').length : 0;
        const dirty = isDirty();
        dot.classList.toggle('on', dirty);
        meta.textContent = filePath
          ? `${dirty ? '未保存' : '已保存'} · ${lines} 行 · ${chars} 字符`
          : '';
        pathEl.textContent = filePath || '';
        pathEl.title = filePath || '';
      }

      async function doSave(notify = true) {
        clearTimeout(saveTimer);
        if (!filePath) return saveAs();
        const out = eol === '\r\n' ? ta.value.replace(/\n/g, '\r\n') : ta.value;
        const r = await api.writeText(filePath, out);
        if (!r.ok) {
          api.toast('保存失败：' + r.error);
          return;
        }
        savedText = ta.value;
        refreshMeta();
        if (notify) api.toast('已保存');
      }

      async function saveAs() {
        const target = await api.saveFileDialog({
          defaultPath: filePath || baseName(filePath),
          filters: [{ name: '文本文件', extensions: ['txt', 'md'] }],
        });
        if (!target) return;
        const out = eol === '\r\n' ? ta.value.replace(/\n/g, '\r\n') : ta.value;
        const r = await api.writeText(target, out);
        if (!r.ok) { api.toast('保存失败：' + r.error); return; }
        filePath = target;
        savedText = ta.value;
        nameEl.textContent = baseName(filePath);
        nameEl.title = filePath;
        if (!api.card.title) api.title(baseName(filePath));
        await api.saveState({ path: filePath });
        refreshMeta();
        api.toast('已保存');
      }

      async function load(path) {
        if (!path) return;
        loading = true;
        const r = await api.readText(path, 8 * 1024 * 1024);
        loading = false;
        if (!r || !r.ok) {
          empty.classList.remove('hidden');
          ta.classList.add('hidden');
          foot.classList.add('hidden');
          empty.innerHTML = `<div class="big">${ctx.icon('info', 22)}</div><div>无法打开这个文件<br><span style="opacity:.75">${util.escapeHtml((r && r.error) || '未知错误')}</span></div>`;
          nameEl.textContent = baseName(path);
          nameEl.title = path;
          api.toast('打开失败');
          return;
        }
        filePath = path;
        eol = String(r.text || '').includes('\r\n') ? '\r\n' : '\n';
        savedText = String(r.text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        ta.value = savedText;
        ta.classList.remove('hidden');
        empty.classList.add('hidden');
        foot.classList.remove('hidden');
        nameEl.textContent = baseName(path);
        nameEl.title = path;
        if (!api.card.title) api.title(baseName(path));
        refreshMeta();
        await api.saveState({ path });
      }

      function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { if (filePath) doSave(false); }, 1200);
      }

      refreshMeta();
      if (filePath) load(filePath);

      ta.addEventListener('input', () => {
        refreshMeta();
        scheduleSave();
      });

      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          doSave(true);
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          ta.value = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + 2;
          refreshMeta();
          scheduleSave();
        }
      });

      root.querySelector('[data-act="open"]').addEventListener('click', async () => {
        const files = await api.pickFiles({ filters: TEXT_FILTERS, multi: false });
        if (files && files[0]) {
          if (isDirty()) await doSave(false);
          load(files[0]);
        }
      });

      root.querySelector('[data-act="open-empty"]').addEventListener('click', () => {
        root.querySelector('[data-act="open"]').click();
      });

      root.querySelector('[data-act="reload"]').addEventListener('click', async () => {
        if (!filePath) return api.toast('还没有打开文件');
        if (isDirty()) {
          const r = await api.messageBox({ message: '放弃未保存的修改并重新加载？', buttons: ['重新加载', '取消'] });
          if (r !== 0) return;
        }
        load(filePath);
      });

      root.querySelector('[data-act="save"]').addEventListener('click', () => doSave(true));

      btnWrap.addEventListener('click', () => {
        wrap = !wrap;
        ta.wrap = wrap ? 'soft' : 'off';
        btnWrap.classList.toggle('on', wrap);
        api.saveState({ wrap });
      });

      root.querySelector('[data-act="font"]').addEventListener('click', () => {
        const sizes = [11, 12.5, 14, 16, 18, 21, 24];
        let idx = sizes.findIndex((s) => s >= fontSize);
        idx = (idx + 1 + sizes.length) % sizes.length;
        fontSize = sizes[idx];
        ta.style.fontSize = fontSize + 'px';
        api.saveState({ fontSize });
        api.toast('字号 ' + fontSize + 'px');
      });

      ctx.onDrop((paths) => {
        if (paths[0]) {
          if (isDirty()) doSave(false);
          load(paths[0]);
        }
      });

      return {
        unmount() {
          clearTimeout(saveTimer);
          if (isDirty()) doSave(false);
        },
      };
    },
  });
})();
