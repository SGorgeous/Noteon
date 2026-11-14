'use strict';

(function () {
  const shot = document.getElementById('shot');
  const mask = document.getElementById('mask');
  const hint = document.getElementById('hint');
  const sizeEl = document.getElementById('size');
  const sctx = shot.getContext('2d');
  const mctx = mask.getContext('2d');

  let sel = null;
  let start = null;
  let dragging = false;
  let ready = false;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function toImage(e) {
    const r = mask.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) * (mask.width / Math.max(1, r.width)), 0, mask.width),
      y: clamp((e.clientY - r.top) * (mask.height / Math.max(1, r.height)), 0, mask.height),
    };
  }

  function render() {
    const w = mask.width;
    const h = mask.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = 'rgba(2, 6, 12, 0.56)';
    mctx.fillRect(0, 0, w, h);

    if (sel && sel.w > 0 && sel.h > 0) {
      // 把选区从暗色遮罩里挖出来，露出下面那张截图
      mctx.clearRect(sel.x, sel.y, sel.w, sel.h);
      mctx.strokeStyle = '#5ad1c8';
      mctx.lineWidth = Math.max(1.5, w / 1500);
      mctx.strokeRect(sel.x + 0.5, sel.y + 0.5, Math.max(0, sel.w - 1), Math.max(0, sel.h - 1));

      const r = mask.getBoundingClientRect();
      const sx = r.width / Math.max(1, w);
      const sy = r.height / Math.max(1, h);
      const left = r.left + sel.x * sx;
      let top = r.top + sel.y * sy - 30;
      if (top < 6) top = r.top + sel.y * sy + sel.h * sy + 8;
      sizeEl.textContent = Math.round(sel.w) + ' × ' + Math.round(sel.h);
      sizeEl.style.left = Math.round(clamp(left, 6, window.innerWidth - 90)) + 'px';
      sizeEl.style.top = Math.round(clamp(top, 6, window.innerHeight - 26)) + 'px';
      sizeEl.classList.remove('hidden');
    } else {
      sizeEl.classList.add('hidden');
    }
  }

  function reset() {
    sel = null;
    start = null;
    dragging = false;
    hint.classList.remove('hidden');
    render();
  }

  window.region.onImage(({ dataUrl }) => {
    const img = new Image();
    img.onload = () => {
      shot.width = img.naturalWidth;
      shot.height = img.naturalHeight;
      mask.width = img.naturalWidth;
      mask.height = img.naturalHeight;
      sctx.drawImage(img, 0, 0);
      ready = true;
      render();
    };
    img.src = dataUrl;
  });

  mask.addEventListener('pointerdown', (e) => {
    if (!ready || e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    start = toImage(e);
    sel = { x: start.x, y: start.y, w: 0, h: 0 };
    hint.classList.add('hidden');
    mask.setPointerCapture(e.pointerId);
    render();
  });

  mask.addEventListener('pointermove', (e) => {
    if (!dragging || !start) return;
    const p = toImage(e);
    sel = {
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    };
    render();
  });

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    if (sel && sel.w >= 4 && sel.h >= 4) {
      window.region.done({
        x: Math.round(sel.x),
        y: Math.round(sel.y),
        w: Math.round(sel.w),
        h: Math.round(sel.h),
      });
    } else {
      reset();
    }
  };

  mask.addEventListener('pointerup', finish);
  mask.addEventListener('pointercancel', reset);

  const cancel = () => window.region.cancel();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancel();
  });
})();
