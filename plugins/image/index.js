'use strict';

(function () {
  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico', 'svg'];

  function baseName(p) {
    return String(p || '').split(/[\\/]/).pop() || 'image';
  }
  function isImage(src) {
    if (/^data:image\//i.test(src)) return true;
    if (/^https?:\/\//i.test(src)) return /\.(png|jpe?g|gif|webp|bmp|avif|ico|svg)(\?|$)/i.test(src) || true;
    const m = String(src).match(/\.([a-z0-9]+)$/i);
    return !!m && IMAGE_EXT.includes(m[1].toLowerCase());
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.Noteon.define({
    id: 'image',
    mount(ctx) {
      const { root, api, util } = ctx;
      const st = api.state || {};

      let items = Array.isArray(st.items) ? st.items.filter((x) => x && x.src).map((x) => ({ src: x.src, name: x.name || baseName(x.src) })) : [];
      let index = clamp(Number(st.index) || 0, 0, Math.max(0, items.length - 1));
      let bg = ['checker', 'dark', 'light'].includes(st.bg) ? st.bg : 'checker';
      let grid = !!st.grid;
      let flip = !!st.flip;
      let split = !!st.split;
      let splitPos = Number.isFinite(st.splitPos) ? clamp(st.splitPos, 0.05, 0.95) : 0.5;
      let pixelated = !!st.pixelated;
      let zoom = Number.isFinite(st.zoom) && st.zoom > 0 ? st.zoom : 0;
      let panX = Number.isFinite(st.panX) ? st.panX : 0;
      let panY = Number.isFinite(st.panY) ? st.panY : 0;
      let fitMode = !(Number.isFinite(st.zoom) && st.zoom > 0);
      let current = null;
      let lastColor = typeof st.color === 'string' ? st.color : '';

      const cache = new Map();
      let loadToken = 0;
      let saveTimer = 0;

      root.innerHTML = `
        <div class="stage bg-${bg}">
          <div class="layer layer-a"><img class="img-a" draggable="false" alt=""></div>
          <div class="layer layer-b"><img class="img-b" draggable="false" alt=""></div>
          <div class="grid-overlay ${grid ? 'on' : ''}"></div>
          <div class="split-line ${split ? '' : 'hidden'}"></div>
          <div class="namechip"><span class="nm"></span><span class="cnt"></span></div>
          <div class="thumbs ${items.length > 1 ? '' : 'hidden'}"></div>
          <div class="bar">
            <button class="ib" data-act="open" title="打开图片">${ctx.icon('folderOpen', 14)}</button>
            <button class="ib" data-act="fit" title="适应窗口">${ctx.icon('fit', 14)}</button>
            <button class="ib" data-act="one" title="原始大小 1:1">1:1</button>
            <span class="sep"></span>
            <button class="ib" data-act="zoomout" title="缩小">−</button>
            <button class="ib zoombar" data-act="zoomlabel" title="点击适应窗口">—</button>
            <button class="ib" data-act="zoomin" title="放大">+</button>
            <span class="sep"></span>
            <button class="ib" data-act="split" title="对比（左 当前 / 右 下一张）">${ctx.icon('split', 14)}</button>
            <button class="ib" data-act="pick" title="吸管取色">${ctx.icon('eyedropper', 14)}</button>
            <span class="swatch"></span>
            <button class="ib" data-act="more" title="更多">${ctx.icon('dots', 14)}</button>
          </div>
          <div class="empty hidden">
            <div class="big">${ctx.icon('image', 26)}</div>
            <div>把图片拖进来，或从文件夹打开</div>
            <button class="bigbtn" data-act="open-empty">打开图片</button>
            <div class="hint">支持 png / jpg / gif / webp / svg，可多选</div>
          </div>
        </div>`;

      const stage = root.querySelector('.stage');
      const imgA = root.querySelector('.img-a');
      const imgB = root.querySelector('.img-b');
      const layerB = root.querySelector('.layer-b');
      const line = root.querySelector('.split-line');
      const thumbs = root.querySelector('.thumbs');
      const empty = root.querySelector('.empty');
      const nameEl = root.querySelector('.namechip .nm');
      const countEl = root.querySelector('.namechip .cnt');
      const zoomLabel = root.querySelector('[data-act="zoomlabel"]');
      const swatch = root.querySelector('.swatch');
      const gridOverlay = root.querySelector('.grid-overlay');
      const btnSplit = root.querySelector('[data-act="split"]');
      const btnPick = root.querySelector('[data-act="pick"]');

      let picking = false;
      let sampleCanvas = null;

      /* ---------------- 数据 / 状态 ---------------- */

      const scheduleSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          api.saveState({ items, index, bg, grid, flip, split, splitPos, pixelated, zoom, panX, panY, color: lastColor });
        }, 400);
      };

      function acquire(item) {
        if (!item) return Promise.reject(new Error('没有图片'));
        if (cache.has(item.src)) return cache.get(item.src);
        const p = api.loadImage(item.src).then((rec) => {
          rec.item = item;
          return rec;
        });
        cache.set(item.src, p);
        p.catch(() => cache.delete(item.src));
        return p;
      }

      /* ---------------- 视图 ---------------- */

      function applyTransform() {
        const sx = flip ? -zoom : zoom;
        const transform = `translate(${panX}px, ${panY}px) scale(${sx}, ${zoom})`;
        imgA.style.transform = transform;
        imgB.style.transform = transform;
        zoomLabel.textContent = Math.round(zoom * 100) + '%';
      }

      function fitView() {
        if (!current) return;
        const rect = stage.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bottomUI = items.length > 1 ? 108 : 46;
        const availW = Math.max(60, rect.width - 24);
        const availH = Math.max(60, rect.height - bottomUI - 16);
        const s = Math.min(availW / current.width, availH / current.height);
        zoom = clamp(s, 0.02, 40);
        panX = 0;
        panY = -bottomUI / 2;
        fitMode = true;
        applyTransform();
        scheduleSave();
      }

      function oneToOne() {
        zoom = 1;
        panX = 0;
        panY = 0;
        fitMode = false;
        applyTransform();
        scheduleSave();
      }

      function zoomAt(clientX, clientY, factor) {
        if (!current) return;
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const z2 = clamp(zoom * factor, 0.02, 40);
        if (Math.abs(z2 - zoom) < 1e-6) return;
        const px = clientX - cx;
        const py = clientY - cy;
        panX = px - (px - panX) * (z2 / zoom);
        panY = py - (py - panY) * (z2 / zoom);
        zoom = z2;
        fitMode = false;
        applyTransform();
        scheduleSave();
      }

      function zoomCenter(factor) {
        const rect = stage.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
      }

      function updateStageClass() {
        stage.classList.remove('bg-checker', 'bg-dark', 'bg-light');
        stage.classList.add('bg-' + bg);
        stage.classList.toggle('pixelated', pixelated);
        gridOverlay.classList.toggle('on', grid);
        btnSplit.classList.toggle('on', split);
        btnPick.classList.toggle('on', picking);
        if (lastColor) {
          swatch.classList.add('on');
          swatch.style.background = lastColor;
          swatch.title = lastColor;
        } else {
          swatch.classList.remove('on');
        }
      }

      async function showCurrent(resetView) {
        if (!items.length) {
          empty.classList.remove('hidden');
          nameEl.textContent = '';
          countEl.textContent = '';
          thumbs.classList.add('hidden');
          current = null;
          updateSplit();
          return;
        }
        empty.classList.add('hidden');
        index = clamp(index, 0, items.length - 1);
        const item = items[index];
        const token = ++loadToken;
        try {
          const rec = await acquire(item);
          if (token !== loadToken) return;
          current = rec;
          imgA.src = rec.url;
          imgA.alt = item.name;
          nameEl.textContent = item.name;
          nameEl.title = item.src;
          countEl.textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
          if (resetView || fitMode || !zoom) {
            requestAnimationFrame(() => fitView());
          } else {
            applyTransform();
          }
          rebuildThumbs();
          updateSplit();
          updateStageClass();
          if (!api.card.title) api.title(item.name);
          scheduleSave();
        } catch (err) {
          if (token !== loadToken) return;
          api.toast('图片加载失败：' + err.message);
          current = null;
          empty.classList.remove('hidden');
          empty.innerHTML = `<div class="big">${ctx.icon('info', 26)}</div><div>无法加载这张图片<br><span style="opacity:.7">${util.escapeHtml(err.message)}</span></div><button class="bigbtn" data-act="open-empty">换一张</button>`;
        }
      }

      async function updateSplit() {
        const canSplit = split && items.length > 1;
        line.classList.toggle('hidden', !canSplit);
        layerB.style.display = canSplit ? 'flex' : 'none';
        if (!canSplit) return;
        line.style.left = splitPos * 100 + '%';
        layerB.style.clipPath = `inset(0 0 0 ${splitPos * 100}%)`;
        const nextItem = items[(index + 1) % items.length];
        if (!nextItem) return;
        try {
          const rec = await acquire(nextItem);
          imgB.src = rec.url;
          imgB.alt = nextItem.name;
        } catch {
          imgB.removeAttribute('src');
        }
      }

      function rebuildThumbs() {
        if (items.length <= 1) {
          thumbs.classList.add('hidden');
          return;
        }
        thumbs.classList.remove('hidden');
        thumbs.innerHTML = '';
        items.forEach((item, i) => {
          const el = document.createElement('div');
          el.className = 'th' + (i === index ? ' on' : '');
          el.title = item.name;
          const img = document.createElement('img');
          img.alt = '';
          el.appendChild(img);
          el.addEventListener('click', () => {
            index = i;
            showCurrent(false);
          });
          thumbs.appendChild(el);
          acquire(item).then((rec) => { img.src = rec.url; }).catch(() => {
            el.style.background = 'rgba(255,255,255,.08)';
          });
        });
      }

      /* ---------------- 打开 / 添加 ---------------- */

      function addItems(paths, urls) {
        const added = [];
        for (const p of paths || []) {
          if (!isImage(p)) continue;
          added.push({ src: p, name: baseName(p) });
        }
        for (const u of urls || []) {
          if (/^https?:\/\//i.test(u)) added.push({ src: u, name: baseName(u.split('?')[0]) || '网络图片' });
        }
        if (!added.length) {
          api.toast('没有识别到图片文件');
          return false;
        }
        const start = items.length;
        items = items.concat(added);
        index = start;
        showCurrent(true);
        return true;
      }

      async function openDialog() {
        const files = await api.pickFiles({
          filters: [{ name: '图片', extensions: IMAGE_EXT }, { name: '所有文件', extensions: ['*'] }],
        });
        if (files && files.length) addItems(files);
      }

      /* ---------------- 吸管 ---------------- */

      function sampleAt(clientX, clientY) {
        if (!current) return;
        const rect = stage.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 + panX;
        const cy = rect.top + rect.height / 2 + panY;
        let x = (clientX - cx) / zoom + current.width / 2;
        if (flip) x = current.width - x;
        const y = (clientY - cy) / zoom + current.height / 2;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || iy < 0 || ix >= current.width || iy >= current.height) {
          api.toast('点在图片外面了');
          return;
        }
        if (!sampleCanvas) sampleCanvas = document.createElement('canvas');
        if (sampleCanvas.width !== current.width || sampleCanvas.height !== current.height) {
          sampleCanvas.width = current.width;
          sampleCanvas.height = current.height;
        }
        const c2d = sampleCanvas.getContext('2d', { willReadFrequently: true });
        c2d.clearRect(0, 0, current.width, current.height);
        c2d.drawImage(imgA, 0, 0, current.width, current.height);
        const d = c2d.getImageData(ix, iy, 1, 1).data;
        const hex = '#' + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
        lastColor = hex;
        updateStageClass();
        api.copy(hex);
        api.toast(`已复制颜色 ${hex}`);
        scheduleSave();
      }

      /* ---------------- 交互 ---------------- */

      let panning = false;
      let panStart = null;
      let panOrigin = null;
      let moved = false;

      stage.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.bar, .thumbs, .split-line, .empty')) return;
        if (!current) return;
        panning = true;
        moved = false;
        panStart = { x: e.screenX, y: e.screenY };
        panOrigin = { x: panX, y: panY };
        stage.classList.add('panning');
        stage.setPointerCapture(e.pointerId);
      });

      stage.addEventListener('pointermove', (e) => {
        if (!panning) return;
        const dx = e.screenX - panStart.x;
        const dy = e.screenY - panStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        panX = panOrigin.x + dx;
        panY = panOrigin.y + dy;
        fitMode = false;
        applyTransform();
      });

      const endPan = (e) => {
        if (!panning) return;
        panning = false;
        stage.classList.remove('panning');
        if (moved) scheduleSave();
        else if (picking) sampleAt(e.clientX, e.clientY);
      };
      stage.addEventListener('pointerup', endPan);
      stage.addEventListener('pointercancel', () => { panning = false; stage.classList.remove('panning'); });

      stage.addEventListener('wheel', (e) => {
        if (!current) return;
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0016);
        zoomAt(e.clientX, e.clientY, factor);
      }, { passive: false });

      stage.addEventListener('dblclick', (e) => {
        if (e.target.closest('.bar, .thumbs, .split-line, .empty')) return;
        if (!current) return;
        if (Math.abs(zoom - 1) < 0.02) fitView();
        else oneToOne();
      });

      /* ---- 分割线 ---- */
      let splitDrag = false;
      line.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        splitDrag = true;
        line.setPointerCapture(e.pointerId);
      });
      line.addEventListener('pointermove', (e) => {
        if (!splitDrag) return;
        const rect = stage.getBoundingClientRect();
        splitPos = clamp((e.clientX - rect.left) / rect.width, 0.05, 0.95);
        line.style.left = splitPos * 100 + '%';
        layerB.style.clipPath = `inset(0 0 0 ${splitPos * 100}%)`;
      });
      const stopSplit = () => { if (splitDrag) { splitDrag = false; scheduleSave(); } };
      line.addEventListener('pointerup', stopSplit);
      line.addEventListener('pointercancel', stopSplit);

      /* ---- 工具栏 ---- */
      root.querySelectorAll('[data-act="open"]').forEach((b) => b.addEventListener('click', openDialog));
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-act="open-empty"]')) openDialog();
      });
      root.querySelector('[data-act="fit"]').addEventListener('click', fitView);
      root.querySelector('[data-act="one"]').addEventListener('click', oneToOne);
      root.querySelector('[data-act="zoomlabel"]').addEventListener('click', fitView);
      root.querySelector('[data-act="zoomin"]').addEventListener('click', () => zoomCenter(1.25));
      root.querySelector('[data-act="zoomout"]').addEventListener('click', () => zoomCenter(0.8));
      root.querySelector('[data-act="split"]').addEventListener('click', () => {
        if (items.length < 2) {
          api.toast('对比需要至少两张图片，先再拖一张进来');
          return;
        }
        split = !split;
        updateStageClass();
        updateSplit();
        scheduleSave();
        api.toast(split ? '对比：左 当前 / 右 下一张' : '已关闭对比');
      });
      root.querySelector('[data-act="pick"]').addEventListener('click', () => {
        picking = !picking;
        updateStageClass();
        api.toast(picking ? '吸管已开启：点图片任意位置取色' : '吸管已关闭');
      });

      root.querySelector('[data-act="more"]').addEventListener('click', async () => {
        const picked = await api.menu([
          { id: 'grid', label: '三分网格', type: 'checkbox', checked: grid },
          { id: 'flip', label: '水平翻转', type: 'checkbox', checked: flip },
          { id: 'pixel', label: '像素化显示', type: 'checkbox', checked: pixelated },
          {
            label: '背景',
            submenu: [
              { id: 'bg:checker', label: '棋盘格', type: 'checkbox', checked: bg === 'checker' },
              { id: 'bg:dark', label: '深色', type: 'checkbox', checked: bg === 'dark' },
              { id: 'bg:light', label: '浅色', type: 'checkbox', checked: bg === 'light' },
            ],
          },
          { type: 'separator' },
          { id: 'reload', label: '重新载入当前图片' },
          { id: 'reveal', label: '在资源管理器中显示', enabled: !!current?.path },
          { id: 'copy', label: '复制颜色值', enabled: !!lastColor },
          { type: 'separator' },
          { id: 'remove', label: '移除当前图片', enabled: items.length > 0 },
          { id: 'clear', label: '清空全部', enabled: items.length > 0 },
        ]);
        if (!picked) return;
        if (picked === 'grid') { grid = !grid; updateStageClass(); scheduleSave(); }
        else if (picked === 'flip') { flip = !flip; applyTransform(); scheduleSave(); }
        else if (picked === 'pixel') { pixelated = !pixelated; updateStageClass(); scheduleSave(); }
        else if (picked.startsWith('bg:')) { bg = picked.slice(3); updateStageClass(); scheduleSave(); }
        else if (picked === 'reload') {
          if (!items[index]) return;
          cache.delete(items[index].src);
          showCurrent(true);
        } else if (picked === 'reveal') {
          if (current?.path) api.reveal(current.path);
        } else if (picked === 'copy') {
          if (lastColor) { api.copy(lastColor); api.toast('已复制 ' + lastColor); }
        } else if (picked === 'remove') {
          items.splice(index, 1);
          if (index >= items.length) index = Math.max(0, items.length - 1);
          current = null;
          showCurrent(true);
          scheduleSave();
        } else if (picked === 'clear') {
          for (const rec of cache.values()) {
            Promise.resolve(rec).then((r) => r.revoke && r.revoke()).catch(() => {});
          }
          cache.clear();
          items = [];
          current = null;
          imgA.removeAttribute('src');
          imgB.removeAttribute('src');
          showCurrent(true);
          scheduleSave();
        }
      });

      ctx.onDrop((paths, event) => {
        const urls = [];
        try {
          const uri = event?.dataTransfer?.getData('text/uri-list') || event?.dataTransfer?.getData('text/plain') || '';
          for (const u of uri.split(/\r?\n/)) {
            if (/^https?:\/\//i.test(u.trim())) urls.push(u.trim());
          }
        } catch {}
        if (paths.length) addItems(paths);
        else if (urls.length) addItems([], urls);
      });

      const ro = new ResizeObserver(() => {
        if (fitMode && current) requestAnimationFrame(fitView);
      });
      ro.observe(stage);

      updateStageClass();
      if (items.length) showCurrent(!zoom);
      else showCurrent(true);

      return {
        unmount() {
          ro.disconnect();
          clearTimeout(saveTimer);
          api.saveState({ items, index, bg, grid, flip, split, splitPos, pixelated, zoom, panX, panY, color: lastColor });
          for (const rec of cache.values()) {
            Promise.resolve(rec).then((r) => r.revoke && r.revoke()).catch(() => {});
          }
        },
      };
    },
  });
})();
