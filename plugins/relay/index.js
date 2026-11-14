'use strict';

(function () {
  function baseName(p) {
    return String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(p || '');
  }

  window.Noteon.define({
    id: 'relay',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};
      let items = Array.isArray(st.items)
        ? st.items.filter((x) => x && x.path).map((x) => ({ path: x.path, name: x.name || baseName(x.path), size: x.size || 0, isDir: !!x.isDir }))
        : [];

      root.innerHTML = `
        <div class="rbar">
          <span class="rtitle">暂存区</span>
          <button class="rbtn" data-act="add" title="添加文件">${ctx.icon('plus', 13)}</button>
          <button class="rbtn" data-act="copyall" title="复制全部路径">${ctx.icon('copy', 13)}</button>
          <button class="rbtn" data-act="more" title="更多">${ctx.icon('dots', 13)}</button>
        </div>
        <div class="rlist"></div>`;

      const list = root.querySelector('.rlist');

      const save = () => api.saveState({ items });

      function updateStatus() {
        if (!items.length) return api.setStatus('拖入文件暂存 · 拖出到任意位置');
        const total = items.reduce((a, b) => a + (b.size || 0), 0);
        api.setStatus(`${items.length} 项 · ${util.formatSize(total)} · 拖住条目可拖出`);
      }

      function render() {
        if (!items.length) {
          list.innerHTML = `<div class="dropzone">
            <div class="big">${ctx.icon('relay', 24)}</div>
            <div>把文件拖到这里暂存<br><span style="opacity:.65">再按住条目拖到桌面 / 聊天窗口 / 其他软件</span></div>
          </div>`;
          updateStatus();
          return;
        }
        list.innerHTML = '';
        items.forEach((item, i) => {
          const kind = item.isDir ? 'dir' : util.kind(item.name);
          const row = document.createElement('div');
          row.className = 'rrow';
          row.draggable = true;
          row.title = item.path;
          row.innerHTML = `
            <span class="ricon ${kind === 'image' ? 'img' : kind === 'text' ? 'txt' : kind === 'web' ? 'web' : ''}">${ctx.icon(item.isDir ? 'folder' : util.iconFor(item.name, false), 14)}</span>
            <span class="rmain">
              <span class="rname"></span>
              <span class="rsub"></span>
            </span>
            <button class="rmore" title="操作">${ctx.icon('dots', 13)}</button>`;
          row.querySelector('.rname').textContent = item.name;
          row.querySelector('.rsub').textContent = item.isDir ? '文件夹' : util.formatSize(item.size) + ' · ' + item.path;
          row.addEventListener('dragstart', (e) => {
            e.preventDefault();
            api.dragFile(item.path);
          });
          row.addEventListener('dblclick', () => openItem(item));
          row.querySelector('.rmore').addEventListener('click', (e) => {
            e.stopPropagation();
            itemMenu(e, item, i);
          });
          list.appendChild(row);
        });
        updateStatus();
      }

      async function openItem(item) {
        const r = await api.openFile(item.path);
        if (!r || !r.ok) api.toast((r && r.error) || '打开失败');
      }

      async function itemMenu(e, item, i) {
        const picked = await api.menu([
          { id: 'open', label: '打开' },
          { id: 'reveal', label: '在资源管理器中显示' },
          { id: 'copy', label: '复制路径' },
          { type: 'separator' },
          { id: 'remove', label: '从暂存区移除' },
        ], e.clientX, e.clientY);
        if (!picked) return;
        if (picked === 'open') openItem(item);
        else if (picked === 'reveal') api.reveal(item.path);
        else if (picked === 'copy') { api.copy(item.path); api.toast('路径已复制'); }
        else if (picked === 'remove') { items.splice(i, 1); save(); render(); }
      }

      function addPaths(paths) {
        let added = 0;
        for (const p of paths || []) {
          if (items.some((x) => x.path === p)) continue;
          items.push({ path: p, name: baseName(p), size: 0, isDir: false });
          added += 1;
        }
        if (!added) {
          api.toast('这些文件已经在暂存区了');
          return;
        }
        save();
        render();
        api.toast(`已暂存 ${added} 项`);
      }

      root.querySelector('[data-act="add"]').addEventListener('click', async () => {
        const files = await api.pickFiles({ filters: [{ name: '所有文件', extensions: ['*'] }] });
        if (files && files.length) addPaths(files);
      });

      root.querySelector('[data-act="copyall"]').addEventListener('click', () => {
        if (!items.length) return api.toast('暂存区是空的');
        api.copy(items.map((x) => x.path).join('\n'));
        api.toast(`已复制 ${items.length} 条路径`);
      });

      root.querySelector('[data-act="more"]').addEventListener('click', async () => {
        const picked = await api.menu([
          { id: 'add', label: '添加文件…' },
          { id: 'prune', label: '清理不存在的条目' },
          { type: 'separator' },
          { id: 'clear', label: '清空暂存区', enabled: items.length > 0 },
        ]);
        if (!picked) return;
        if (picked === 'add') root.querySelector('[data-act="add"]').click();
        else if (picked === 'clear') { items = []; save(); render(); }
        else if (picked === 'prune') {
          const keep = [];
          for (const it of items) {
            if (await api.exists(it.path)) keep.push(it);
          }
          const removed = items.length - keep.length;
          items = keep;
          save();
          render();
          api.toast(removed ? `已清理 ${removed} 条` : '没有失效条目');
        }
      });

      ctx.onDrop((paths) => addPaths(paths));

      render();
      return { unmount() { api.setStatus(''); } };
    },
  });
})();
