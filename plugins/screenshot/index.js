'use strict';

(function () {
  function fileName(p) {
    return String(p || '').split(/[\\/]/).pop() || 'screenshot.png';
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  window.Noteon.define({
    id: 'screenshot',
    mount(ctx) {
      const { root, api } = ctx;

      root.innerHTML = `
        <div class="shot">
          <div class="shot-top">
            <button class="shot-btn primary" data-act="capture">截屏</button>
            <button class="shot-btn" data-act="capture-full">全屏</button>
            <button class="shot-btn" data-act="save">保存</button>
            <button class="shot-btn" data-act="save-as">另存为</button>
            <button class="shot-btn" data-act="to-image">生成图片卡片</button>
            <label class="shot-auto"><input type="checkbox" id="autoImage"> 截屏后自动生成</label>
            <span class="shot-hint">Ctrl+S 快速保存</span>
          </div>
          <div class="shot-stage">
            <div class="shot-empty">
              <b>点「截屏」后拖框选择区域</b>
              <span>也可以点「全屏」抓整屏，再裁剪、旋转或用画笔标注</span>
            </div>
            <canvas class="shot-canvas hidden"></canvas>
            <div class="shot-crop hidden"></div>
          </div>
          <div class="shot-tools">
            <button class="shot-tool on" data-tool="crop">裁剪</button>
            <button class="shot-tool" data-tool="pen">画笔</button>
            <span class="shot-sep"></span>
            <button class="shot-tool" data-act="rotate">旋转</button>
            <button class="shot-tool" data-act="flip">翻转</button>
            <button class="shot-tool" data-act="undo">撤销</button>
            <span class="shot-sep"></span>
            <button class="shot-sw on" data-color="#ff4d6d" style="background:#ff4d6d"></button>
            <button class="shot-sw" data-color="#ffd166" style="background:#ffd166"></button>
            <button class="shot-sw" data-color="#4dd4ac" style="background:#4dd4ac"></button>
            <button class="shot-sw" data-color="#7aa2ff" style="background:#7aa2ff"></button>
            <button class="shot-sw" data-color="#ffffff" style="background:#ffffff"></button>
            <input class="shot-width" id="penWidth" type="range" min="2" max="18" value="4" title="画笔粗细">
          </div>
        </div>`;

      const stage = root.querySelector('.shot-stage');
      const view = root.querySelector('.shot-canvas');
      const vctx = view.getContext('2d');
      const empty = root.querySelector('.shot-empty');
      const cropEl = root.querySelector('.shot-crop');
      const capBtn = root.querySelector('[data-act="capture"]');
      const autoEl = root.querySelector('#autoImage');
      const widthEl = root.querySelector('#penWidth');

      let base = document.createElement('canvas');
      let bctx = base.getContext('2d');
      let hasImage = false;
      let tool = 'crop';
      let penColor = '#ff4d6d';
      let penWidth = 4;
      let penning = false;
      let lastPt = null;
      let cropping = false;
      let cropStart = null;
      let history = [];
      let busy = false;
      let lastPath = '';

      function toast(text) { api.toast(text); }

      function toPoint(e) {
        const r = view.getBoundingClientRect();
        return {
          x: (e.clientX - r.left) * (view.width / Math.max(1, r.width)),
          y: (e.clientY - r.top) * (view.height / Math.max(1, r.height)),
        };
      }

      function syncView() {
        if (!base.width || !base.height) return;
        view.width = base.width;
        view.height = base.height;
        vctx.clearRect(0, 0, base.width, base.height);
        vctx.drawImage(base, 0, 0);
        view.classList.remove('hidden');
        empty.classList.add('hidden');
        hasImage = true;
      }

      function loadIntoBase(url) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const next = document.createElement('canvas');
            next.width = img.naturalWidth;
            next.height = img.naturalHeight;
            next.getContext('2d').drawImage(img, 0, 0);
            base = next;
            bctx = base.getContext('2d');
            resolve();
          };
          img.onerror = () => reject(new Error('图片解码失败'));
          img.src = url;
        });
      }

      function pushHistory() {
        if (!base.width) return;
        try {
          history.push(base.toDataURL('image/png'));
          if (history.length > 8) history.shift();
        } catch {}
      }

      function setTool(next) {
        tool = next;
        cropEl.classList.add('hidden');
        cropping = false;
        penning = false;
        root.querySelectorAll('[data-tool="crop"], [data-tool="pen"]').forEach((b) => {
          b.classList.toggle('on', b.dataset.tool === tool);
        });
      }

      function updateCropBox(e) {
        if (!cropStart) return;
        const sr = stage.getBoundingClientRect();
        const x1 = clamp(cropStart.x, sr.left, sr.right);
        const y1 = clamp(cropStart.y, sr.top, sr.bottom);
        const x2 = clamp(e.clientX, sr.left, sr.right);
        const y2 = clamp(e.clientY, sr.top, sr.bottom);
        cropEl.style.left = Math.min(x1, x2) - sr.left + 'px';
        cropEl.style.top = Math.min(y1, y2) - sr.top + 'px';
        cropEl.style.width = Math.abs(x2 - x1) + 'px';
        cropEl.style.height = Math.abs(y2 - y1) + 'px';
      }

      function applyCrop(e) {
        if (!cropStart) return;
        const r = view.getBoundingClientRect();
        const x1 = clamp((Math.min(cropStart.x, e.clientX) - r.left) * view.width / Math.max(1, r.width), 0, base.width);
        const y1 = clamp((Math.min(cropStart.y, e.clientY) - r.top) * view.height / Math.max(1, r.height), 0, base.height);
        const x2 = clamp((Math.max(cropStart.x, e.clientX) - r.left) * view.width / Math.max(1, r.width), 0, base.width);
        const y2 = clamp((Math.max(cropStart.y, e.clientY) - r.top) * view.height / Math.max(1, r.height), 0, base.height);
        const w = Math.round(x2 - x1);
        const h = Math.round(y2 - y1);
        cropEl.classList.add('hidden');
        cropStart = null;
        cropping = false;
        if (w < 4 || h < 4) return;
        pushHistory();
        const next = document.createElement('canvas');
        next.width = w;
        next.height = h;
        next.getContext('2d').drawImage(base, Math.round(x1), Math.round(y1), w, h, 0, 0, w, h);
        base = next;
        bctx = base.getContext('2d');
        syncView();
        toast(`已裁剪 ${w} × ${h}`);
      }

      function rotate() {
        if (!hasImage) return;
        pushHistory();
        const next = document.createElement('canvas');
        next.width = base.height;
        next.height = base.width;
        const c = next.getContext('2d');
        c.translate(next.width / 2, next.height / 2);
        c.rotate(Math.PI / 2);
        c.drawImage(base, -base.width / 2, -base.height / 2);
        base = next;
        bctx = base.getContext('2d');
        syncView();
      }

      function flip() {
        if (!hasImage) return;
        pushHistory();
        const next = document.createElement('canvas');
        next.width = base.width;
        next.height = base.height;
        const c = next.getContext('2d');
        c.translate(next.width, 0);
        c.scale(-1, 1);
        c.drawImage(base, 0, 0);
        base = next;
        bctx = base.getContext('2d');
        syncView();
      }

      async function undo() {
        const url = history.pop();
        if (!url) {
          toast('没有可撤销的操作');
          return;
        }
        await loadIntoBase(url);
        syncView();
      }

      async function capture(full) {
        if (busy) return;
        busy = true;
        capBtn.disabled = true;
        try {
          const r = full ? await api.captureScreen() : await api.captureRegion();
          if (!r || r.canceled) return;
          if (!r.ok) {
            toast('截屏失败：' + ((r && r.error) || '未知错误'));
            return;
          }
          await loadIntoBase(r.dataUrl);
          history = [];
          lastPath = '';
          syncView();
          toast(full ? '全屏截图完成' : '区域截图完成');
          if (autoEl.checked) await createImage(true);
        } catch (err) {
          toast('截屏失败：' + err.message);
        } finally {
          busy = false;
          capBtn.disabled = false;
        }
      }

      async function save(as) {
        if (!hasImage) {
          toast('先截屏');
          return;
        }
        const r = await api.saveCapture(base.toDataURL('image/png'), !!as);
        if (r && r.ok) {
          lastPath = r.path;
          toast('已保存：' + r.path);
        } else if (!r || !r.canceled) {
          toast('保存失败：' + ((r && r.error) || '未知错误'));
        }
      }

      async function createImage(auto) {
        if (!hasImage) {
          toast('先截屏');
          return;
        }
        const r = await api.saveCapture(base.toDataURL('image/png'), false);
        if (!r || !r.ok) {
          toast('生成失败：' + ((r && r.error) || '未知错误'));
          return;
        }
        lastPath = r.path;
        api.openCard({
          plugin: 'image',
          title: '截图',
          state: { items: [{ src: r.path, name: fileName(r.path) }], index: 0 },
        });
        toast(auto ? '已生成图片卡片' : '已生成图片卡片');
      }

      capBtn.addEventListener('click', () => capture(false));
      root.querySelector('[data-act="capture-full"]').addEventListener('click', () => capture(true));
      root.querySelector('[data-act="save"]').addEventListener('click', () => save(false));
      root.querySelector('[data-act="save-as"]').addEventListener('click', () => save(true));
      root.querySelector('[data-act="to-image"]').addEventListener('click', () => createImage(false));
      root.querySelector('[data-act="rotate"]').addEventListener('click', rotate);
      root.querySelector('[data-act="flip"]').addEventListener('click', flip);
      root.querySelector('[data-act="undo"]').addEventListener('click', undo);

      root.querySelectorAll('[data-tool="crop"], [data-tool="pen"]').forEach((b) => {
        b.addEventListener('click', () => setTool(b.dataset.tool));
      });
      root.querySelectorAll('[data-color]').forEach((b) => {
        b.addEventListener('click', () => {
          penColor = b.dataset.color;
          root.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
        });
      });
      widthEl.addEventListener('input', () => { penWidth = Number(widthEl.value) || 4; });

      view.addEventListener('pointerdown', (e) => {
        if (!hasImage || e.button !== 0) return;
        e.preventDefault();
        if (tool === 'pen') {
          pushHistory();
          penning = true;
          lastPt = toPoint(e);
          view.setPointerCapture(e.pointerId);
        } else if (tool === 'crop') {
          cropping = true;
          cropStart = { x: e.clientX, y: e.clientY };
          updateCropBox(e);
          cropEl.classList.remove('hidden');
          view.setPointerCapture(e.pointerId);
        }
      });

      view.addEventListener('pointermove', (e) => {
        if (penning && lastPt) {
          const p = toPoint(e);
          const r = view.getBoundingClientRect();
          const scale = view.width / Math.max(1, r.width);
          vctx.strokeStyle = penColor;
          vctx.lineWidth = Math.max(1, penWidth * scale);
          vctx.lineCap = 'round';
          vctx.lineJoin = 'round';
          vctx.beginPath();
          vctx.moveTo(lastPt.x, lastPt.y);
          vctx.lineTo(p.x, p.y);
          vctx.stroke();
          lastPt = p;
        } else if (cropping) {
          updateCropBox(e);
        }
      });

      const finishPointer = (e) => {
        if (penning) {
          penning = false;
          lastPt = null;
          bctx.drawImage(view, 0, 0);
        } else if (cropping) {
          applyCrop(e);
        }
      };
      view.addEventListener('pointerup', finishPointer);
      view.addEventListener('pointercancel', () => {
        const wasPenning = penning;
        penning = false;
        cropping = false;
        lastPt = null;
        cropEl.classList.add('hidden');
        if (wasPenning) syncView();
      });

      const onKeyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          save(false);
        }
      };
      document.addEventListener('keydown', onKeyDown);

      return {
        unmount() {
          document.removeEventListener('keydown', onKeyDown);
        },
      };
    },
  });
})();
