'use strict';

(function () {
  function baseName(p) {
    const s = String(p || '').replace(/[\\/]+$/, '');
    return s.split(/[\\/]/).pop() || s || '文件夹';
  }
  function parentOf(p) {
    const s = String(p || '').replace(/[\\/]+$/, '');
    if (/^[a-zA-Z]:$/.test(s)) return s + '\\';
    const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
    if (i < 0) return '';
    const parent = s.slice(0, i);
    if (/^[a-zA-Z]:$/.test(parent)) return parent + '\\';
    return parent || s.slice(0, i + 1);
  }

  window.Noteon.define({
    id: 'folder',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};
      let dir = typeof st.path === 'string' ? st.path : '';
      let showHidden = !!st.showHidden;
      let sort = ['name', 'mtime', 'size'].includes(st.sort) ? st.sort : 'name';
      let iconSize = ['sm', 'md', 'lg'].includes(st.iconSize) ? st.iconSize : 'md';
      let entries = [];
      let selectedPath = '';
      let loadToken = 0;

      root.tabIndex = 0;
      root.innerHTML = `
        <div class="fbar">
          <span class="fpath" title="">未映射文件夹</span>
          <button class="fbtn" data-act="up" title="上一级">${ctx.icon('arrowLeft', 13)}</button>
          <button class="fbtn" data-act="refresh" title="刷新">${ctx.icon('refresh', 13)}</button>
          <button class="fbtn" data-act="pick" title="选择文件夹">${ctx.icon('folderOpen', 13)}</button>
          <button class="fbtn" data-act="reveal" title="在资源管理器中打开">${ctx.icon('external', 13)}</button>
          <button class="fbtn fsize" data-size="sm" title="小图标">小</button>
          <button class="fbtn fsize" data-size="md" title="中图标">中</button>
          <button class="fbtn fsize" data-size="lg" title="大图标">大</button>
          <button class="fbtn" data-act="more" title="更多">${ctx.icon('dots', 13)}</button>
        </div>
        <div class="flist"></div>`;

      const pathEl = root.querySelector('.fpath');
      const list = root.querySelector('.flist');

      function updateStatus() {
        if (!dir) return api.setStatus('');
        const files = entries.filter((e) => !e.isDir).length;
        const dirs = entries.length - files;
        api.setStatus(`${util.formatSize(entries.filter((e) => !e.isDir).reduce((a, b) => a + (b.size || 0), 0))} · ${files} 个文件 · ${dirs} 个文件夹`);
      }

      function sortEntries(listIn) {
        return listIn.slice().sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          if (sort === 'mtime') return (b.mtime || 0) - (a.mtime || 0);
          if (sort === 'size') return (b.size || 0) - (a.size || 0);
          return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
        });
      }

      function renderEmpty(message) {
        entries = [];
        updateStatus();
        const drives = [];
        list.innerHTML = `<div class="empty" style="height:100%">
          <div class="big">${ctx.icon('folder', 22)}</div>
          <div>${message || '选择一个文件夹，钉在这里'}${message ? '' : '<br><span style="opacity:.7">也可以直接把文件拖进卡片</span>'}</div>
          ${message ? '' : '<button class="btn ghost" data-act="pick-empty" style="margin-top:2px">选择文件夹</button><div class="drives"></div>'}
        </div>`;
        const btn = list.querySelector('[data-act="pick-empty"]');
        if (btn) btn.addEventListener('click', pickFolder);
        const driveWrap = list.querySelector('.drives');
        if (driveWrap) {
          api.listDrives().then((ds) => {
            for (const d of ds) {
              const b = document.createElement('button');
              b.className = 'drive';
              b.textContent = d;
              b.addEventListener('click', () => load(d));
              driveWrap.appendChild(b);
            }
          });
        }
      }

      function render() {
        if (!dir) return renderEmpty();
        pathEl.textContent = dir;
        pathEl.title = dir;
        list.className = 'flist size-' + iconSize;
        root.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === iconSize));
        if (!entries.length) {
          list.innerHTML = `<div class="empty" style="height:100%">
            <div class="big">${ctx.icon('folderOpen', 22)}</div>
            <div>这个文件夹是空的<br><span style="opacity:.7">拖文件进来可以复制到此处</span></div>
          </div>`;
        } else {
          const frag = document.createDocumentFragment();
          const shown = sortEntries(entries).slice(0, 800);
          for (const ent of shown) {
            const kind = ent.isDir ? 'dir' : util.kind(ent.name);
            const row = document.createElement('div');
            row.className = 'frow' + (ent.path === selectedPath ? ' sel' : '');
            row.dataset.path = ent.path;
            row.draggable = true;

            const ic = document.createElement('span');
            ic.className = 'ficon ' + (ent.isDir ? 'dir' : (kind === 'image' ? 'img' : kind === 'text' ? 'txt' : kind === 'web' ? 'web' : ''));
            ic.innerHTML = ctx.icon(ent.isDir ? 'folder' : util.iconFor(ent.name, false), 15);

            const nm = document.createElement('span');
            nm.className = 'fname';
            nm.textContent = ent.name;

            const meta = document.createElement('span');
            meta.className = 'fmeta';
            meta.textContent = ent.isDir ? '' : util.formatSize(ent.size);

            row.append(ic, nm, meta);
            row.addEventListener('click', () => {
              selectedPath = ent.path;
              list.querySelectorAll('.frow.sel').forEach((r) => r.classList.remove('sel'));
              row.classList.add('sel');
            });
            row.addEventListener('dblclick', () => openEntry(ent));
            row.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              selectedPath = ent.path;
              list.querySelectorAll('.frow.sel').forEach((r) => r.classList.remove('sel'));
              row.classList.add('sel');
              rowMenu(e, ent);
            });
            row.addEventListener('dragstart', (e) => {
              e.preventDefault();
              api.dragFile(ent.path);
            });
            frag.appendChild(row);
          }
          if (entries.length > shown.length) {
            const more = document.createElement('div');
            more.className = 'fdrop';
            more.textContent = `只显示前 ${shown.length} 项，共 ${entries.length} 项`;
            frag.appendChild(more);
          }
          list.innerHTML = '';
          list.appendChild(frag);
        }
        updateStatus();
      }

      async function load(p, opts = {}) {
        if (!p) return renderEmpty();
        const token = ++loadToken;
        const r = await api.readDir(p, showHidden);
        if (token !== loadToken) return;
        if (!r.ok) {
          if (!opts.silent) api.toast('无法读取：' + r.error);
          renderEmpty('无法读取这个文件夹<br><span style="opacity:.7">' + util.escapeHtml(r.error) + '</span>');
          return;
        }
        dir = r.path;
        entries = r.entries || [];
        selectedPath = '';
        if (!api.card.title) api.title(baseName(dir));
        api.saveState({ path: dir });
        render();
      }

      async function openEntry(ent) {
        if (ent.isDir) return load(ent.path);
        const r = await api.openFile(ent.path);
        if (!r || !r.ok) api.toast(r && r.error ? r.error : '打开失败');
      }

      async function pickFolder() {
        const p = await api.pickFolder();
        if (p) load(p);
      }

      async function up() {
        const parent = parentOf(dir);
        if (parent) load(parent);
      }

      async function rowMenu(e, ent) {
        const picked = await api.menu([
          { id: 'open', label: ent.isDir ? '进入文件夹' : '在新卡片中打开' },
          { id: 'external', label: '用系统默认程序打开' },
          { id: 'reveal', label: '在资源管理器中显示' },
          { type: 'separator' },
          { id: 'copyPath', label: '复制路径' },
          { id: 'copyTo', label: '复制到…' },
        ], e.clientX, e.clientY);
        if (!picked) return;
        if (picked === 'open') openEntry(ent);
        else if (picked === 'external') api.openPath(ent.path);
        else if (picked === 'reveal') api.reveal(ent.path);
        else if (picked === 'copyPath') { api.copy(ent.path); api.toast('路径已复制'); }
        else if (picked === 'copyTo') {
          const dest = await api.pickFolder();
          if (!dest) return;
          const r = await api.copyInto([ent.path], dest);
          api.toast(r.ok ? '已复制到 ' + dest : '复制失败：' + r.error);
        }
      }

      root.querySelector('[data-act="up"]').addEventListener('click', up);
      root.querySelector('[data-act="refresh"]').addEventListener('click', () => dir && load(dir));
      root.querySelector('[data-act="pick"]').addEventListener('click', pickFolder);
      root.querySelector('[data-act="reveal"]').addEventListener('click', () => dir && api.reveal(dir));
      root.querySelectorAll('[data-size]').forEach((btn) => btn.addEventListener('click', () => {
        iconSize = btn.dataset.size;
        api.saveState({ iconSize });
        render();
      }));
      root.querySelector('[data-act="more"]').addEventListener('click', async () => {
        const picked = await api.menu([
          { id: 'hidden', label: '显示隐藏文件', type: 'checkbox', checked: showHidden },
          {
            label: '排序',
            submenu: [
              { id: 'sort:name', label: '名称', type: 'checkbox', checked: sort === 'name' },
              { id: 'sort:mtime', label: '修改时间', type: 'checkbox', checked: sort === 'mtime' },
              { id: 'sort:size', label: '大小', type: 'checkbox', checked: sort === 'size' },
            ],
          },
          {
            label: '图标大小',
            submenu: [
              { id: 'size:sm', label: '小', type: 'checkbox', checked: iconSize === 'sm' },
              { id: 'size:md', label: '中', type: 'checkbox', checked: iconSize === 'md' },
              { id: 'size:lg', label: '大', type: 'checkbox', checked: iconSize === 'lg' },
            ],
          },
          { type: 'separator' },
          { id: 'change', label: '更换映射文件夹' },
          { id: 'refresh', label: '刷新' },
        ]);
        if (!picked) return;
        if (picked === 'hidden') { showHidden = !showHidden; api.saveState({ showHidden }); if (dir) load(dir); }
        else if (picked.startsWith('sort:')) { sort = picked.slice(5); api.saveState({ sort }); render(); }
        else if (picked.startsWith('size:')) { iconSize = picked.slice(5); api.saveState({ iconSize }); render(); }
        else if (picked === 'change') pickFolder();
        else if (picked === 'refresh' && dir) load(dir);
      });

      document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (e.key === 'F5') { e.preventDefault(); if (dir) load(dir); }
        else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowUp')) { e.preventDefault(); up(); }
        else if (e.key === 'Enter' && selectedPath) {
          const ent = entries.find((x) => x.path === selectedPath);
          if (ent) openEntry(ent);
        }
      });

      ctx.onDrop(async (paths) => {
        if (!dir) { api.toast('先选择一个文件夹'); return; }
        const r = await api.copyInto(paths, dir);
        if (r.ok) {
          api.toast(`已复制 ${r.copied.length} 项到当前文件夹`);
          load(dir, { silent: true });
        } else {
          api.toast('复制失败：' + r.error);
        }
      });

      if (dir) load(dir, { silent: true });
      else renderEmpty();
      setTimeout(() => root.focus(), 50);

      return {
        unmount() {
          api.setStatus('');
        },
      };
    },
  });
})();
