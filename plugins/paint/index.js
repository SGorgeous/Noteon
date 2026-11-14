'use strict';

(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PALETTE = ['#f4f7ff', '#12151d', '#ff6b6b', '#f0b429', '#5ad1c8', '#9b8cff', '#ff9f6b', '#7bd88f', '#8ec5ff', '#ff8fd8'];

  const ICONS = {
    brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c1.5-4 3.6-6.5 6.6-9.5l5 5C12.6 18.5 10 20 4 20z"/><path d="m13 8 3.2-3.2a2.1 2.1 0 0 1 3 3L16 11"/></svg>',
    eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m4 15 8.5-8.5a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3L12 20H7z"/><path d="M20 20H12"/></svg>',
    pick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m19.2 3.6-1.6 1.6"/><path d="m14.4 6.5 3.1 3.1"/><path d="M4 20l.9-3.7L16 5.2l2.8 2.8L7.7 19.1z"/></svg>',
    select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2.4 2.4"><rect x="4" y="4" width="16" height="16" rx="1"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 12l5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7 5 5-5 5"/><path d="M20 12h-9a6 6 0 0 0-6 6"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="m20.5 15.5-4.6-4.6-8.6 8.6"/></svg>',
    paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="5" width="10" height="16" rx="2"/><path d="M9 5V3.5h6V5"/><path d="M9 10h6M9 14h4"/></svg>',
    crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 3v15h15"/><path d="M3 6h15v15"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="1.6"/><path d="M15.5 5.5h-10a1 1 0 0 0-1 1v10"/></svg>',
    export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M5 15v4.5h14V15"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7"/><path d="M10 10.5v5.5M14 10.5v5.5"/></svg>',
  };

  window.Noteon.define({
    id: 'paint',
    async mount(ctx) {
      const { root, api } = ctx;
      document.body.classList.add('paint-mode');
      const st = api.state || {};
      let docW = clamp(Number(st.w) || 1200, 320, 4096);
      let docH = clamp(Number(st.h) || 800, 240, 4096);
      let activeIndex = 0;
      let tool = 'brush';
      let color = typeof st.color === 'string' && st.color ? st.color : '#232838';
      let brushSize = clamp(Number(st.brushSize) || 8, 1, 128);
      let brushOpacity = clamp(Number(st.brushOpacity) || 1, 0.02, 1);
      let selection = null;
      let layers = [];
      let drawing = false;
      let last = null;
      let undoStack = [];
      let redoStack = [];
      let saveTimer = 0;
      let renderRaf = 0;
      let internalClipboard = null;

      root.innerHTML = `
        <div class="paint-root">
          <div class="paint-bar">
            <div class="paint-group">
              <button class="pbtn on" data-tool="brush" title="笔刷">${ICONS.brush}</button>
              <button class="pbtn" data-tool="eraser" title="橡皮">${ICONS.eraser}</button>
              <button class="pbtn" data-tool="pick" title="吸管：在画布上取色">${ICONS.pick}</button>
              <button class="pbtn" data-tool="select" title="矩形选区">${ICONS.select}</button>
            </div>
            <div class="paint-group">
              <label class="color-wrap" title="颜色"><input class="pcolor" id="paintColor" type="color"><span></span></label>
              <label class="paint-slider" title="笔刷大小"><span>大小</span><input class="psize" id="paintSize" type="range" min="1" max="64" step="1"><b id="paintSizeVal">8</b></label>
              <label class="paint-slider" title="不透明度"><span>透明度</span><input class="psize" id="paintOpacity" type="range" min="2" max="100" step="1"><b id="paintOpacityVal">100</b></label>
            </div>
            <div class="palette" id="paintPalette"></div>
            <div class="paint-group">
              <button class="pbtn" data-act="undo" title="撤销（Ctrl+Z）">${ICONS.undo}</button>
              <button class="pbtn" data-act="redo" title="重做（Ctrl+Y）">${ICONS.redo}</button>
              <button class="pbtn" data-act="layers" title="图层面板">${ICONS.layers}</button>
            </div>
            <div class="paint-group">
              <button class="pbtn" data-act="import" title="导入图片为新图层">${ICONS.image}</button>
              <button class="pbtn" data-act="paste" title="粘贴剪贴板图片">${ICONS.paste}</button>
              <button class="pbtn" data-act="region" title="屏幕选区 → 新图层">${ICONS.crop}</button>
              <button class="pbtn" data-act="copy" title="复制选区/画面到剪贴板">${ICONS.copy}</button>
              <button class="pbtn" data-act="export" title="导出为图片卡片">${ICONS.export}</button>
            </div>
          </div>
          <div class="paint-stage">
            <div class="paint-wrap">
              <canvas id="paintView"></canvas>
              <canvas id="paintOverlay"></canvas>
            </div>
            <div class="paint-layers" id="paintLayers">
              <div class="lhead">
                <span class="ltitle">图层</span>
                <button class="pbtn" data-act="addLayer" title="新建图层">${ICONS.plus}</button>
                <button class="pbtn" data-act="delLayer" title="删除当前图层">${ICONS.trash}</button>
              </div>
              <div class="llist" id="paintLayerList"></div>
              <div class="paint-meta">
                <select class="pselect" id="paintBlend" title="混合模式">
                  <option value="source-over">正常</option>
                  <option value="multiply">正片叠底</option>
                  <option value="screen">滤色</option>
                  <option value="overlay">叠加</option>
                  <option value="darken">变暗</option>
                  <option value="lighten">变亮</option>
                </select>
              </div>
              <div class="paint-meta">
                <input class="psize" id="paintLayerOpacity" type="range" min="0" max="100" value="100" title="图层不透明度">
              </div>
            </div>
          </div>
          <div class="paint-bottom">
            <span class="paint-demo">DEMO</span>
            <span class="dot"></span>
            <span id="paintInfo"></span>
            <span style="flex:1"></span>
            <select class="pselect" id="paintCardSelect" title="从图片卡片取图"><option value="">从图片卡片…</option></select>
            <button class="pbtn" data-act="fromCard" title="导入选中的图片卡片为新图层">${ICONS.image}</button>
          </div>
        </div>`;

      const paint = root.querySelector('.paint-root');
      const view = root.querySelector('#paintView');
      const overlay = root.querySelector('#paintOverlay');
      const vctx = view.getContext('2d', { willReadFrequently: true });
      const octx = overlay.getContext('2d');
      const colorEl = root.querySelector('#paintColor');
      const sizeEl = root.querySelector('#paintSize');
      const opacityEl = root.querySelector('#paintOpacity');
      const layerPanel = root.querySelector('#paintLayers');
      const layerList = root.querySelector('#paintLayerList');
      const blendEl = root.querySelector('#paintBlend');
      const layerOpacityEl = root.querySelector('#paintLayerOpacity');
      const infoEl = root.querySelector('#paintInfo');
      const sizeVal = root.querySelector('#paintSizeVal');
      const opacityVal = root.querySelector('#paintOpacityVal');
      const cardSelect = root.querySelector('#paintCardSelect');
      const paletteEl = root.querySelector('#paintPalette');
      let pointerSeen = false;
      let lastPointerMoveAt = 0;
      let lastDevice = '';
      let stylusActive = false;
      let stylusAt = 0;
      let lastPressure = 0.5;

      view.width = docW; view.height = docH;
      overlay.width = docW; overlay.height = docH;
      colorEl.value = color;
      sizeEl.value = brushSize;
      opacityEl.value = Math.round(brushOpacity * 100);
      sizeVal.textContent = brushSize;
      opacityVal.textContent = Math.round(brushOpacity * 100);

      for (const c of PALETTE) {
        const b = document.createElement('span');
        b.className = 'pal';
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => setColor(c));
        b.dataset.color = c;
        paletteEl.appendChild(b);
      }

      api.on('stylus:input', (s) => {
        if (!s || !s.phase) return;
        stylusAt = performance.now();
        const pts = Array.isArray(s.points) && s.points.length
          ? s.points
          : [{ x: s.x, y: s.y, pressure: s.pressure }];
        const makeEvent = (pt) => ({
          clientX: Number(pt.x) || 0,
          clientY: Number(pt.y) || 0,
          button: 0,
          pointerType: 'pen',
          preventDefault() {},
        });
        if (s.phase === 'down') {
          stylusActive = true;
          pointerSeen = true;
          lastDevice = '笔';
          const first = pts[0];
          startDraw(makeEvent(first), Number(first.pressure) || 0.5);
          for (let i = 1; i < pts.length; i++) {
            moveDraw(makeEvent(pts[i]), Number(pts[i].pressure) || 0.5);
          }
        } else if (s.phase === 'move') {
          if (!stylusActive) return;
          lastPointerMoveAt = performance.now();
          for (const pt of pts) {
            moveDraw(makeEvent(pt), Number(pt.pressure) || 0.5);
          }
        } else if (s.phase === 'up') {
          stylusActive = false;
          endStroke();
        }
      });

      let areaRaf = 0;
      function reportStylusArea() {
        if (!api.setStylusArea) return;
        if (areaRaf) return;
        areaRaf = requestAnimationFrame(() => {
          areaRaf = 0;
          const r = view.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const exclude = [];
          for (const sel of ['.paint-bar', '.paint-layers', '.paint-bottom']) {
            const el = paint.querySelector(sel);
            if (!el || el.classList.contains('hidden')) continue;
            const er = el.getBoundingClientRect();
            if (er.width > 0 && er.height > 0) exclude.push({ x: er.left, y: er.top, w: er.width, h: er.height });
          }
          api.setStylusArea({ canvas: { x: r.left, y: r.top, w: r.width, h: r.height }, exclude });
        });
      }

      function setRange(el, clientX) {
        const r = el.getBoundingClientRect();
        const p = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
        el.value = String(Math.round(Number(el.min || 0) + p * (Number(el.max || 100) - Number(el.min || 0))));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      let uiDown = null;
      api.on('stylus:ui', (s) => {
        if (!s || !s.phase) return;
        const el = document.elementFromPoint(Number(s.x) || 0, Number(s.y) || 0);
        const pick = el && (el.closest('button,a,select,input,label,.cm-item,.play-row,.pal,.pbtn') || el);
        if (s.phase === 'down') {
          uiDown = { target: pick, x: Number(s.x) || 0, y: Number(s.y) || 0 };
          if (pick && pick.tagName === 'INPUT' && pick.type === 'range') setRange(pick, Number(s.x) || 0);
          return;
        }
        if (s.phase === 'move') {
          if (uiDown && uiDown.target && uiDown.target.tagName === 'INPUT' && uiDown.target.type === 'range') setRange(uiDown.target, Number(s.x) || 0);
          return;
        }
        if (s.phase !== 'up') return;
        const down = uiDown;
        uiDown = null;
        if (!pick || !down || down.target !== pick) return;
        if (pick.tagName === 'INPUT' && pick.type === 'range') {
          setRange(pick, Number(s.x) || 0);
        } else if (pick.tagName === 'SELECT') {
          pick.focus();
          try { if (pick.showPicker) pick.showPicker(); } catch { }
        } else {
          pick.click();
        }
      });

      function makeLayer(name, fill) {
        const c = document.createElement('canvas');
        c.width = docW; c.height = docH;
        const x = c.getContext('2d');
        if (fill) { x.fillStyle = fill; x.fillRect(0, 0, docW, docH); }
        return { name: name || '图层', canvas: c, ctx: x, visible: true, opacity: 1, blend: 'source-over' };
      }

      async function imageFromUrl(url) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = url;
        });
      }

      async function loadSavedLayers() {
        const saved = Array.isArray(st.layers) ? st.layers : [];
        if (!saved.length) {
          layers = [makeLayer('背景', '#ffffff'), makeLayer('绘画', null)];
          activeIndex = 1;
          return;
        }
        for (const item of saved) {
          const layer = makeLayer(item.name || '图层', null);
          layer.visible = item.visible !== false;
          layer.opacity = clamp(Number(item.opacity) || 1, 0, 1);
          layer.blend = item.blend || 'source-over';
          if (item.data) {
            try {
              const img = await imageFromUrl(item.data);
              layer.ctx.drawImage(img, 0, 0, docW, docH);
            } catch { }
          }
          layers.push(layer);
        }
        activeIndex = clamp(Number(st.active) || layers.length - 1, 0, layers.length - 1);
        if (!layers.some((l) => l.name === '背景')) layers.unshift(makeLayer('背景', '#ffffff'));
      }

      function layerData() {
        return layers.map((l) => ({
          name: l.name,
          visible: l.visible,
          opacity: l.opacity,
          blend: l.blend,
          data: l.canvas.toDataURL('image/png'),
        }));
      }

      function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          api.saveState({ w: docW, h: docH, active: activeIndex, color, brushSize, brushOpacity, layers: layerData() });
        }, 700);
      }

      function activeLayer() { return layers[activeIndex]; }

      function render() {
        if (renderRaf) return;
        renderRaf = requestAnimationFrame(() => {
          renderRaf = 0;
          vctx.clearRect(0, 0, docW, docH);
          for (const l of layers) {
            if (!l.visible) continue;
            vctx.save();
            vctx.globalAlpha = l.opacity;
            vctx.globalCompositeOperation = l.blend || 'source-over';
            vctx.drawImage(l.canvas, 0, 0);
            vctx.restore();
          }
          drawSelection();
          updateInfo();
        });
      }

      function drawSelection() {
        octx.clearRect(0, 0, docW, docH);
        if (!selection) return;
        octx.save();
        octx.strokeStyle = 'rgba(255,255,255,.95)';
        octx.lineWidth = Math.max(1, docW / 900);
        octx.setLineDash([6, 4]);
        octx.strokeRect(selection.x, selection.y, selection.w, selection.h);
        octx.strokeStyle = 'rgba(20,20,20,.8)';
        octx.lineDashOffset = 6;
        octx.strokeRect(selection.x, selection.y, selection.w, selection.h);
        octx.restore();
      }

      function updateInfo() {
        const l = activeLayer();
        infoEl.textContent = `${docW}×${docH} · ${layers.length} 层 · ${l ? l.name : ''}${lastDevice ? ' · ' + lastDevice : ''}`;
        api.setStatus(`${docW}×${docH} · ${layers.length} 层`);
      }

      function renderLayers() {
        layerList.innerHTML = '';
        for (let i = layers.length - 1; i >= 0; i--) {
          const l = layers[i];
          const row = document.createElement('div');
          row.className = 'play-row' + (i === activeIndex ? ' on' : '');
          const eye = document.createElement('button');
          eye.className = 'play-eye';
          eye.textContent = l.visible ? '◉' : '○';
          eye.title = '显示/隐藏';
          eye.addEventListener('click', (e) => { e.stopPropagation(); l.visible = !l.visible; render(); renderLayers(); scheduleSave(); });
          const name = document.createElement('span');
          name.className = 'pname';
          name.textContent = l.name;
          row.appendChild(eye);
          row.appendChild(name);
          if (i > 0) {
            const del = document.createElement('button');
            del.className = 'play-del';
            del.textContent = '×';
            del.title = '删除图层';
            del.addEventListener('click', (e) => { e.stopPropagation(); deleteLayer(i); });
            row.appendChild(del);
          }
          row.addEventListener('click', () => {
            activeIndex = i;
            renderLayers();
            syncLayerControls();
            updateInfo();
            scheduleSave();
          });
          layerList.appendChild(row);
        }
        syncLayerControls();
      }

      function syncLayerControls() {
        const l = activeLayer();
        if (!l) return;
        blendEl.value = l.blend || 'source-over';
        layerOpacityEl.value = Math.round((l.opacity ?? 1) * 100);
      }

      function addLayer(name) {
        layers.push(makeLayer(name || ('图层 ' + layers.length), null));
        activeIndex = layers.length - 1;
        renderLayers(); render(); scheduleSave();
      }

      function deleteLayer(i) {
        if (i <= 0 || layers.length <= 1) { api.toast('背景层不能删除'); return; }
        snapshot();
        layers.splice(i, 1);
        activeIndex = clamp(activeIndex, 0, layers.length - 1);
        renderLayers(); render(); scheduleSave();
      }

      function snapshot() {
        const l = activeLayer();
        if (!l) return;
        undoStack.push({ index: activeIndex, data: l.ctx.getImageData(0, 0, docW, docH) });
        if (undoStack.length > 12) undoStack.shift();
        redoStack = [];
      }

      function undo() {
        const item = undoStack.pop();
        if (!item) return;
        const l = layers[item.index];
        if (!l) return;
        l.ctx.putImageData(item.data, 0, 0);
        activeIndex = item.index;
        render(); renderLayers(); scheduleSave();
      }

      function redo() {
        // 轻量重做：保留最后一次撤销前的快照
        if (!redoStack.length) return;
        const item = redoStack.pop();
        const l = layers[item.index];
        if (!l) return;
        l.ctx.putImageData(item.data, 0, 0);
        render(); renderLayers(); scheduleSave();
      }

      function setColor(c) {
        color = c;
        colorEl.value = c;
        root.querySelectorAll('.pal').forEach((el) => el.classList.toggle('on', el.dataset.color === c));
        scheduleSave();
      }

      function setTool(next) {
        tool = next;
        root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
        view.style.cursor = tool === 'pick' ? 'crosshair' : tool === 'select' ? 'crosshair' : 'default';
      }

      function mapPoint(e) {
        const r = view.getBoundingClientRect();
        return {
          x: clamp((e.clientX - r.left) * docW / r.width, 0, docW),
          y: clamp((e.clientY - r.top) * docH / r.height, 0, docH),
        };
      }

      function strokeSegment(from, to, pressure) {
        const l = activeLayer();
        if (!l) return;
        const c = l.ctx;
        const q = Math.pow(clamp(pressure, 0.01, 1), 0.72);
        const width = Math.max(1, brushSize * (0.12 + 0.88 * q));
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        c.save();
        c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        c.globalAlpha = brushOpacity;
        c.strokeStyle = color;
        c.fillStyle = color;
        c.lineCap = 'round';
        c.lineJoin = 'round';
        if (dist < 0.25) {
          c.lineWidth = width;
          c.beginPath();
          c.arc(to.x, to.y, Math.max(0.8, width / 2), 0, Math.PI * 2);
          c.fill();
        } else {
          // 细分成小段，低采样率下也能得到圆滑、压力连续的线。
          const steps = Math.min(24, Math.max(1, Math.ceil(dist / 1.5)));
          let px = from.x, py = from.y;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const nx = from.x + (to.x - from.x) * t;
            const ny = from.y + (to.y - from.y) * t;
            c.lineWidth = Math.max(1, width * (0.72 + 0.28 * t));
            c.beginPath();
            c.moveTo(px, py);
            c.lineTo(nx, ny);
            c.stroke();
            px = nx; py = ny;
          }
        }
        c.restore();
      }

      async function addImageLayer(src, name) {
        try {
          const rec = await api.loadImage(src);
          const img = await imageFromUrl(rec.url);
          const layer = makeLayer(name || '图片', null);
          const scale = Math.min(1, docW / img.width, docH / img.height);
          const w = img.width * scale, h = img.height * scale;
          layer.ctx.drawImage(img, (docW - w) / 2, (docH - h) / 2, w, h);
          layers.push(layer);
          activeIndex = layers.length - 1;
          renderLayers(); render(); scheduleSave();
          api.toast('已导入图层：' + layer.name);
        } catch (err) {
          api.toast('导入失败：' + err.message);
        }
      }

      function copySelection() {
        const sx = selection ? Math.round(selection.x) : 0;
        const sy = selection ? Math.round(selection.y) : 0;
        const sw = selection ? Math.max(1, Math.round(selection.w)) : docW;
        const sh = selection ? Math.max(1, Math.round(selection.h)) : docH;
        const tmp = document.createElement('canvas');
        tmp.width = sw; tmp.height = sh;
        tmp.getContext('2d').drawImage(view, sx, sy, sw, sh, 0, 0, sw, sh);
        internalClipboard = tmp;
        api.writeClipboardImage(tmp.toDataURL('image/png')).then((ok) => {
          api.toast(ok ? '已复制到剪贴板' : '复制失败');
        });
      }

      async function pasteClipboard() {
        if (internalClipboard) {
          const layer = makeLayer('粘贴', null);
          const scale = Math.min(1, docW / internalClipboard.width, docH / internalClipboard.height);
          layer.ctx.drawImage(internalClipboard, 0, 0, internalClipboard.width * scale, internalClipboard.height * scale);
          layers.push(layer); activeIndex = layers.length - 1;
          renderLayers(); render(); scheduleSave();
          return;
        }
        const r = await api.readClipboardImage();
        if (!r || !r.ok) { api.toast((r && r.error) || '剪贴板没有图片'); return; }
        await addImageLayer(r.dataUrl, '粘贴');
      }

      async function importFile() {
        const files = await api.pickFiles({
          title: '导入图片',
          filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
          multi: false,
        });
        if (files && files.length) await addImageLayer(files[0], '导入');
      }

      async function captureRegion() {
        const r = await api.captureRegion();
        if (r && r.ok) await addImageLayer(r.dataUrl, '选区');
      }

      async function exportImage() {
        const data = view.toDataURL('image/png');
        const r = await api.saveCapture(data, false);
        if (!r || !r.ok) { api.toast((r && r.error) || '导出失败'); return; }
        api.openCard({
          plugin: 'image',
          title: '绘画',
          state: { items: [{ src: r.path, name: 'painting.png' }], index: 0 },
        });
      }

      async function loadCards() {
        try {
          const keep = cardSelect.value;
          const cards = await api.listCards();
          const images = (cards || []).filter((c) => c && c.plugin === 'image' && c.state && Array.isArray(c.state.items) && c.state.items.length);
          cardSelect.innerHTML = '<option value="">从图片卡片…</option>';
          for (const c of images) {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.title || (c.state.items[0].name || '图片卡片');
            cardSelect.appendChild(opt);
          }
          if (keep && [...cardSelect.options].some((o) => o.value === keep)) cardSelect.value = keep;
        } catch { }
      }

      async function importFromCard() {
        const chosen = cardSelect.value;
        await loadCards();
        if (chosen && !cardSelect.value) cardSelect.value = chosen;
        const id = cardSelect.value;
        if (!id) { api.toast('先选一张图片卡片'); return; }
        const cards = await api.listCards();
        const c = (cards || []).find((x) => x.id === id);
        if (!c || !c.state || !c.state.items || !c.state.items[0]) { api.toast('卡片里没有图片'); return; }
        await addImageLayer(c.state.items[0].src, c.title || '图片卡片');
        setTool('pick');
        api.toast('已导入，可在图片层上点击取色');
      }

      function selectTool(e) {
        const p = mapPoint(e);
        if (!selection || selection.done) {
          selection = { x: p.x, y: p.y, w: 0, h: 0, sx: p.x, sy: p.y, done: false };
        } else {
          selection.w = p.x - selection.sx;
          selection.h = p.y - selection.sy;
          if (selection.w < 0) { selection.x = p.x; selection.w = -selection.w; }
          if (selection.h < 0) { selection.y = p.y; selection.h = -selection.h; }
        }
        drawSelection();
      }

      function startDraw(e, pressure) {
        const p = mapPoint(e);
        if (tool === 'pick') {
          render();
          const r = view.getBoundingClientRect();
          const x = clamp(Math.round((e.clientX - r.left) * docW / r.width), 0, docW - 1);
          const y = clamp(Math.round((e.clientY - r.top) * docH / r.height), 0, docH - 1);
          const d = vctx.getImageData(x, y, 1, 1).data;
          setColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
          api.toast('取色 ' + color);
          setTool('brush');
          return;
        }
        if (tool === 'select') {
          selection = null;
          selectTool(e);
          selection.done = false;
          return;
        }
        if (!activeLayer()) return;
        if (activeIndex === 0) { activeIndex = 1; renderLayers(); }
        snapshot();
        drawing = true;
        last = p;
        lastPressure = pressure || 0.5;
        strokeSegment(last, last, lastPressure);
        render();
        e.preventDefault();
      }

      function moveDraw(e, pressure) {
        if (tool === 'select' && selection && !selection.done) { selectTool(e); return; }
        if (!drawing) return;
        const p = mapPoint(e);
        const target = pressure || 0.5;
        lastPressure = lastPressure * 0.28 + target * 0.72;
        strokeSegment(last, p, lastPressure);
        last = p;
        render();
        e.preventDefault();
      }

      view.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || stylusActive) return;
        pointerSeen = true;
        lastPointerMoveAt = performance.now();
        lastDevice = e.pointerType === 'pen' ? '笔' : e.pointerType === 'touch' ? '触摸' : '鼠标';
        startDraw(e, e.pressure);
        if (e.pointerId != null) {
          try { view.setPointerCapture(e.pointerId); } catch { }
        }
      });

      view.addEventListener('pointermove', (e) => {
        if (stylusActive) return;
        if (!drawing && !(tool === 'select' && selection && !selection.done)) return;
        lastPointerMoveAt = performance.now();
        moveDraw(e, e.pressure);
      });

      const endStroke = () => {
        if (tool === 'select' && selection) {
          selection.done = true;
          drawSelection();
          return;
        }
        if (!drawing) return;
        drawing = false;
        render();
        scheduleSave();
      };
      view.addEventListener('pointerup', endStroke);
      view.addEventListener('pointercancel', endStroke);

      // 某些数位板/WebView2 组合只会发 mouse 事件，兜底仍可画。
      view.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || pointerSeen || stylusActive) return;
        lastDevice = '鼠标';
        startDraw(e, 0.5);
      });
      view.addEventListener('mousemove', (e) => {
        if (stylusActive) return;
        if (!drawing && !(tool === 'select' && selection && !selection.done)) return;
        if (performance.now() - lastPointerMoveAt < 40) return;
        moveDraw(e, 0.5);
      });
      view.addEventListener('mouseup', () => {
        if (stylusActive) return;
        endStroke();
      });

      root.addEventListener('click', (e) => {
        const toolBtn = e.target.closest('[data-tool]');
        if (toolBtn) { setTool(toolBtn.dataset.tool); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        const a = act.dataset.act;
        if (a === 'undo') undo();
        else if (a === 'redo') redo();
        else if (a === 'layers') { layerPanel.classList.toggle('hidden'); reportStylusArea(); }
        else if (a === 'addLayer') addLayer();
        else if (a === 'delLayer') deleteLayer(activeIndex);
        else if (a === 'import') importFile();
        else if (a === 'paste') pasteClipboard();
        else if (a === 'region') captureRegion();
        else if (a === 'copy') copySelection();
        else if (a === 'export') exportImage();
        else if (a === 'fromCard') importFromCard();
      });

      cardSelect.addEventListener('focus', loadCards);
      cardSelect.addEventListener('mousedown', loadCards);
      colorEl.addEventListener('input', () => setColor(colorEl.value));
      sizeEl.addEventListener('input', () => { brushSize = Number(sizeEl.value); sizeVal.textContent = brushSize; scheduleSave(); });
      opacityEl.addEventListener('input', () => { brushOpacity = Number(opacityEl.value) / 100; opacityVal.textContent = opacityEl.value; scheduleSave(); });
      blendEl.addEventListener('change', () => { const l = activeLayer(); if (l) { l.blend = blendEl.value; render(); scheduleSave(); } });
      layerOpacityEl.addEventListener('input', () => { const l = activeLayer(); if (l) { l.opacity = Number(layerOpacityEl.value) / 100; render(); scheduleSave(); } });

      root.addEventListener('keydown', (e) => {
        if (e.target.matches('input, select')) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); }
        else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); }
      });

      if (typeof ResizeObserver !== 'undefined') {
        const areaRo = new ResizeObserver(reportStylusArea);
        areaRo.observe(view);
        areaRo.observe(paint);
      }

      await loadSavedLayers();
      renderLayers();
      render();
      setTool('brush');
      reportStylusArea();
      requestAnimationFrame(reportStylusArea);
      loadCards();

      if (!api.card.title) api.title('Painteon Demo');

      return {
        unmount() {
          document.body.classList.remove('paint-mode');
          clearTimeout(saveTimer);
          if (saveTimer) api.saveState({ w: docW, h: docH, active: activeIndex, color, brushSize, brushOpacity, layers: layerData() });
        },
      };
    },
  });
})();
