/* Noteon 主题定义 —— 卡片与控制台共用 */
(function () {
  const THEMES = {
    ink: {
      name: '墨夜', scheme: 'dark', bg: '#12161d', fg: '#e8eef7', muted: '#8b98a9',
      border: 'rgba(255,255,255,0.09)', accent: '#6ea8fe', alpha: 0.94, blur: 22, radius: 14,
      glow: 'rgba(110,168,254,0.16)',
    },
    mist: {
      name: '雾白', scheme: 'light', bg: '#f6f8fc', fg: '#1b2430', muted: '#6b7a8f',
      border: 'rgba(15,23,42,0.10)', accent: '#3b6cf6', alpha: 0.93, blur: 20, radius: 14,
      glow: 'rgba(59,108,246,0.12)',
    },
    paper: {
      name: '纸页', scheme: 'light', bg: '#fbf4e6', fg: '#3b3226', muted: '#8b7a60',
      border: 'rgba(120,96,64,0.16)', accent: '#b9773a', alpha: 0.97, blur: 6, radius: 10,
      glow: 'rgba(185,119,58,0.12)',
    },
    aurora: {
      name: '极光', scheme: 'dark', bg: '#0a1526', fg: '#dbe7ff', muted: '#7f93b8',
      border: 'rgba(124,241,216,0.16)', accent: '#5eead4', alpha: 0.86, blur: 28, radius: 16,
      glow: 'rgba(94,234,212,0.15)',
    },
    sakura: {
      name: '樱粉', scheme: 'light', bg: '#fff1f5', fg: '#43222e', muted: '#a4748a',
      border: 'rgba(200,100,140,0.16)', accent: '#e8638f', alpha: 0.94, blur: 18, radius: 16,
      glow: 'rgba(232,99,143,0.14)',
    },
    forest: {
      name: '林间', scheme: 'dark', bg: '#101b16', fg: '#e3f2e8', muted: '#8aa696',
      border: 'rgba(160,220,180,0.14)', accent: '#7bd88f', alpha: 0.93, blur: 20, radius: 14,
      glow: 'rgba(123,216,143,0.14)',
    },
  };

  function parseColor(input) {
    const s = String(input || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    }
    if (/^#[0-9a-f]{6}$/i.test(s)) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
    }
    if (/^#[0-9a-f]{8}$/i.test(s)) {
      return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), parseInt(s.slice(7, 9), 16) / 255];
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(',').map((x) => parseFloat(x));
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
    }
    return [30, 36, 48, 1];
  }

  function withAlpha(color, alpha) {
    const [r, g, b, a] = parseColor(color);
    const al = Math.max(0, Math.min(1, alpha === undefined ? a : alpha));
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${al})`;
  }

  function mix(a, b, t) {
    const A = parseColor(a);
    const B = parseColor(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)}, ${Math.round(A[1] + (B[1] - A[1]) * t)}, ${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  }

  function pick(themeId) {
    return THEMES[themeId] || THEMES.ink;
  }

  /** 解析一张卡片最终生效的主题 */
  function resolve(globalThemeId, customTheme, card) {
    const base = pick((card && card.themeId) || globalThemeId);
    const merged = { ...base, ...(customTheme || {}) };
    if (!merged.accent) merged.accent = base.accent;
    if (!merged.bg) merged.bg = base.bg;
    if (!Number.isFinite(merged.alpha)) merged.alpha = base.alpha;
    if (!Number.isFinite(merged.radius)) merged.radius = base.radius;
    if (!Number.isFinite(merged.blur)) merged.blur = base.blur;
    if (card && card.accent) merged.accent = card.accent;
    if (card && Number.isFinite(card.alpha)) merged.alpha = card.alpha;
    return merged;
  }

  function apply(el, t) {
    const root = el || document.documentElement;
    const style = root.style;
    style.setProperty('--bg', withAlpha(t.bg, t.alpha));
    style.setProperty('--bg-solid', t.bg);
    style.setProperty('--fg', t.fg);
    style.setProperty('--muted', t.muted);
    style.setProperty('--border', t.border);
    style.setProperty('--accent', t.accent);
    style.setProperty('--accent-soft', withAlpha(t.accent, 0.16));
    style.setProperty('--accent-line', withAlpha(t.accent, 0.45));
    style.setProperty('--glow', t.glow || withAlpha(t.accent, 0.14));
    style.setProperty('--radius', (t.radius || 14) + 'px');
    style.setProperty('--blur', (t.blur || 18) + 'px');
    style.setProperty('--panel', withAlpha(t.bg, Math.min(1, (t.alpha || 0.9) + 0.04)));
    style.setProperty('--hover', t.scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.055)');
    style.setProperty('--active', t.scheme === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.10)');
    style.setProperty('--sheen', t.scheme === 'dark'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0) 38%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 42%)');
    style.setProperty('--shadow', t.scheme === 'dark'
      ? '0 24px 60px -18px rgba(0,0,0,0.75), 0 2px 8px rgba(0,0,0,0.35)'
      : '0 22px 50px -20px rgba(20,32,60,0.45), 0 2px 8px rgba(20,32,60,0.10)');
    document.documentElement.dataset.scheme = t.scheme;
  }

  window.NoteonTheme = { THEMES, resolve, apply, withAlpha, parseColor, mix, pick };
})();
