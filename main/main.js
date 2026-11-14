'use strict';

const { app, BrowserWindow, ipcMain, protocol, screen, Tray, Menu, nativeImage, dialog, shell, clipboard, session, globalShortcut, desktopCapturer } = require('electron');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const { Store } = require('./store');
const { PluginHost } = require('./plugins');
const { CardManager } = require('./cards');
const { WebViewManager } = require('./webviews');
const shellMenu = require('./shellmenu');

const ROOT = path.join(__dirname, '..');
const SMOKE = process.argv.includes('--smoke') || process.env.NOTEON_SMOKE === '1';
const DEMO = process.argv.includes('--demo');
const ASSETS = path.join(ROOT, 'assets');
const DATA_DIR = app.isPackaged
  ? path.join(path.dirname(process.execPath), 'data')
  : path.join(ROOT, 'data');


const LAUNCH_PLUGINS = ['note', 'text', 'screenshot', 'image', 'folder', 'web', 'relay'];

function parseNewArgs(argv) {
  const args = (argv || []).slice(1);
  let plugin = '';
  let p = '';
  let newSeen = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--new') { newSeen = true; continue; }
    if (a === '--path') {
      for (let j = i + 1; j < args.length; j++) {
        const v = args[j];
        if (path.win32.isAbsolute(v)) { p = v; break; }
      }
      continue;
    }
    // Electron 会把 Chromium 开关插在 --new 和值之间，所以按已知插件名找，而不是取下一个 token
    if (newSeen && LAUNCH_PLUGINS.includes(a)) plugin = a;
  }
  if (!newSeen) return null;
  return { plugin: plugin || 'note', path: p };
}

let pendingLaunch = parseNewArgs(process.argv);

function shellMenuOptions() {
  return {
    packaged: app.isPackaged,
    execPath: process.execPath,
    appPath: ROOT,
    icon: app.isPackaged ? process.execPath : path.join(ASSETS, 'icon.ico'),
  };
}

function createFromLaunch(req) {
  if (!req) return;
  if (!cards || !plugins) { pendingLaunch = req; return; }
  const pluginId = plugins.get(req.plugin) ? req.plugin : 'note';
  const state = {};
  if (req.path && pluginId === 'folder') {
    try { if (fs.statSync(req.path).isDirectory()) state.path = req.path; } catch {}
  }
  const cursor = screen.getCursorScreenPoint();
  try {
    cards.create({
      plugin: pluginId,
      state,
      bounds: { x: cursor.x - 140, y: cursor.y - 80 },
      focus: true,
    });
  } catch (err) {
    console.error('[launch] 新建卡片失败:', err.message);
    openPanel();
  }
}

function contextMenuIds() {
  const all = shellMenu.PLUGINS.map(([id]) => id);
  const saved = Array.isArray(store.settings.contextMenuPlugins) ? store.settings.contextMenuPlugins : all;
  return all.filter((id) => saved.includes(id));
}

function syncShellMenu() {
  if (SMOKE || DEMO) return;
  if (store.settings.contextMenu == null) {
    store.settings.contextMenu = app.isPackaged;
    store.touch();
  }
  const ids = contextMenuIds();
  try {
    if (store.settings.contextMenu && ids.length) {
      if (!shellMenu.isCurrent(shellMenuOptions(), ids)) shellMenu.install(shellMenuOptions(), ids);
    } else {
      shellMenu.uninstall();
    }
  } catch (err) { console.warn('[shellmenu] 安装失败:', err.message); }
}

app.setName('Noteon');
if (SMOKE || DEMO) {
  const os = require('node:os');
  const smokeData = path.join(os.tmpdir(), `noteon-${SMOKE ? 'smoke' : 'demo'}-${process.pid}`);
  try { fs.rmSync(smokeData, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(smokeData, { recursive: true });
  app.setPath('userData', smokeData);
} else {
  // 便携模式：所有数据都放在程序目录的 data/ 下，不写到 C 盘
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (err) { console.error('[data] 无法创建数据目录:', err.message); }
  app.setPath('userData', DATA_DIR);
  try { app.setPath('sessionData', DATA_DIR); } catch {}
  try { app.setPath('crashDumps', path.join(DATA_DIR, 'Crashpad')); } catch {}
}

/** 把旧版 AppData/Noteon 的卡片迁移到程序目录，并清掉 C 盘上的旧目录。 */
function migrateLegacyData(targetDir) {
  try {
    const legacyDir = path.join(app.getPath('appData'), 'Noteon');
    if (path.resolve(legacyDir) === path.resolve(targetDir)) return;
    if (!fs.existsSync(legacyDir)) return;
    fs.mkdirSync(targetDir, { recursive: true });
    const oldBoard = path.join(legacyDir, 'board.json');
    const newBoard = path.join(targetDir, 'board.json');
    if (fs.existsSync(oldBoard) && !fs.existsSync(newBoard)) {
      fs.copyFileSync(oldBoard, newBoard);
      console.log('[data] 旧卡片数据已迁移到', newBoard);
    }
    fs.rmSync(legacyDir, { recursive: true, force: true });
    console.log('[data] 已清理旧的数据目录:', legacyDir);
  } catch (err) {
    console.warn('[data] 旧数据迁移未完成:', err.message);
  }
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'noteon-file',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true },
  },
  {
    scheme: 'noteon-plugin',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
  const req = parseNewArgs(argv);
  if (req) createFromLaunch(req);
  else openPanel();
});
  app.whenReady().then(boot).catch((err) => {
    console.error('[boot] 启动失败', err);
    app.quit();
  });
}

let store = null;
let plugins = null;
let cards = null;
let webViews = null;
let panelWin = null;
let tray = null;
let quitting = false;
const consoleLines = [];

/* ------------------------------------------------------------------ */
/* 静态资源协议                                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
};

function fileResponse(p) {
  try {
    const stat = fs.statSync(p);
    if (!stat.isFile()) return new Response('Not a file', { status: 404 });
    if (stat.size > 512 * 1024 * 1024) return new Response('File too large', { status: 413 });
    const buf = fs.readFileSync(p);
    const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
    return new Response(buf, { status: 200, headers: { 'content-type': type, 'access-control-allow-origin': '*', 'cache-control': 'no-cache' } });
  } catch (err) {
    return new Response('Not found: ' + err.message, { status: 404, headers: { 'access-control-allow-origin': '*' } });
  }
}

function decodeFileUrl(url) {
  const u = new URL(url);
  let p = decodeURIComponent(u.pathname || '');
  // Chromium 会把 noteon-file:///C:/x 规范化成 noteon-file://c/x（盘符变成 host）
  if (/^[a-zA-Z]$/.test(u.hostname)) p = u.hostname.toUpperCase() + ':' + (p.startsWith('/') ? p : '/' + p);
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
  return path.normalize(p);
}

function registerProtocols() {
  protocol.handle('noteon-file', (req) => fileResponse(decodeFileUrl(req.url)));

  protocol.handle('noteon-plugin', (req) => {
    const u = new URL(req.url);
    const id = u.hostname;
    const manifest = plugins && plugins.get(id);
    if (!manifest) return new Response('Unknown plugin', { status: 404 });
    const rel = decodeURIComponent(u.pathname || '').replace(/^\/+/, '');
    const target = path.resolve(manifest.dir, rel);
    if (!target.startsWith(path.resolve(manifest.dir) + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return fileResponse(target);
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  registerProtocols();
  if (!SMOKE && !DEMO) migrateLegacyData(app.getPath('userData'));
  store = new Store(path.join(app.getPath('userData'), 'board.json'));
  store.load();
  syncShellMenu();
  plugins = new PluginHost(path.join(ROOT, 'plugins'), { store });
  plugins.scan();
  cards = new CardManager({ store, plugins, root: ROOT, smoke: SMOKE });
  plugins.cardManager = cards;
  webViews = new WebViewManager({ cards });

  registerIpc();
  setupSession();
  buildTray();
  registerGlobalShortcuts();

  const firstRun = store.cards.length === 0;
  const launch = pendingLaunch;
  pendingLaunch = null;

  if (store.settings.restoreOnStart && store.cards.length) {
    cards.restore();
  } else if (!launch && !SMOKE && !DEMO && store.cards.length === 0) {
    const area = screen.getPrimaryDisplay().workArea;
    cards.create({
      plugin: 'note',
      title: '欢迎使用 Noteon',
      bounds: { x: area.x + 60, y: area.y + 90 },
      state: {
        text: [
          '# 你好，Noteon',
          '',
          '这是一张**桌面便签**，也是一个卡片容器。',
          '',
          '- 拖标题栏移动，拖左右边 / 底角缩放',
          '- 右上角 📌 可置顶 / 取消置顶',
          '- `+` 里可以换主题、调透明度、开启鼠标穿透',
          '',
          '从托盘菜单或控制台新建卡片：',
          '文件夹映射 · 图片 · 截屏 · 文本 · 网页 · 文件中转',
        ].join('\n'),
        fontSize: 14,
      },
    });
  }

  if (launch) createFromLaunch(launch);
  else if (!SMOKE && (firstRun || store.settings.showPanelOnStart)) openPanel();
  if (SMOKE) setTimeout(() => { runSmoke().catch((err) => { console.error('[smoke] 失败', err); app.exit(1); }); }, 350);
  else if (DEMO) setTimeout(runDemo, 350);

  app.on('activate', () => openPanel());
}

function setupSession() {
  // 网页卡片里的弹窗一律交给系统浏览器，避免冒出无边框小窗
  app.on('web-contents-created', (_e, contents) => {
    if (contents.getType() === 'webview') {
      contents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
    }
    contents.on('console-message', (event) => {
      if (!SMOKE) return;
      const level = event && event.level !== undefined ? event.level : 0;
      const message = event && event.message !== undefined ? event.message : '';
      const line = event && event.lineNumber !== undefined ? event.lineNumber : 0;
      const sourceId = event && event.sourceId !== undefined ? event.sourceId : '';
      consoleLines.push(`[${level}] ${message} (${sourceId}:${line})`);
    });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'clipboard-read' || permission === 'fullscreen');
  });
}

/* ------------------------------------------------------------------ */
/* 面板 / 托盘                                                         */
/* ------------------------------------------------------------------ */

function openPanel() {
  if (panelWin && !panelWin.isDestroyed()) {
    if (panelWin.isMinimized()) panelWin.restore();
    panelWin.show();
    panelWin.focus();
    return panelWin;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const panelW = Math.min(1000, area.width - 40);
  const panelH = Math.min(720, area.height - 40);
  panelWin = new BrowserWindow({
    x: area.x + area.width - panelW - 20,
    y: area.y + 20,
    width: panelW,
    height: panelH,
    minWidth: 860,
    minHeight: 580,
    frame: false,
    show: false,
    backgroundColor: '#0b0f15',
    title: 'Noteon',
    icon: path.join(ASSETS, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-panel.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  panelWin.loadFile(path.join(ROOT, 'renderer', 'panel.html'));
  panelWin.setAlwaysOnTop(true, 'floating');
  panelWin.on('focus', () => { if (panelWin) panelWin.setAlwaysOnTop(true, 'floating'); });
  panelWin.on('blur', () => { if (panelWin && !panelWin.isDestroyed()) panelWin.setAlwaysOnTop(false); });
  panelWin.once('ready-to-show', () => panelWin.show());
  panelWin.on('closed', () => { panelWin = null; });
  return panelWin;
}

function registerGlobalShortcuts() {
  try {
    const ok = globalShortcut.register('Control+Alt+N', () => {
      if (!cards) return;
      cards.showAll();
      cards.tileAll();
    });
    if (!ok) console.warn('[shortcut] Control+Alt+N 注册失败，可能被占用');
    else console.log('[shortcut] Control+Alt+N registered');
  } catch (err) {
    console.warn('[shortcut]', err.message);
  }
}

function buildTray() {
  const iconPath = path.join(ASSETS, 'tray.png');
  let image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(path.join(ASSETS, 'icon.png'));
  }
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip('Noteon · 桌面便签');
  rebuildTrayMenu();
  tray.on('click', () => openPanel());
  tray.on('double-click', () => openPanel());
}

function rebuildTrayMenu() {
  if (!tray) return;
  const list = plugins ? plugins.list() : [];
  const template = [
    { label: '控制台', click: () => openPanel() },
    { type: 'separator' },
    {
      label: '新建卡片',
      submenu: list.map((m) => ({ label: m.name, click: () => createCardAndShow(m.id) })),
    },
    { type: 'separator' },
    { label: '显示全部卡片', click: () => cards.showAll() },
    { label: '显示全部并排列（Ctrl+Alt+N）', click: () => { cards.showAll(); cards.tileAll(); } },
    { label: '隐藏全部卡片', click: () => cards.hideAll() },
    { label: '全部桌面模式', click: () => cards.setAllDesktop(true) },
    { label: '全部取消桌面模式', click: () => cards.unembedAll() },
    { label: '全部置顶', click: () => cards.setAllAlwaysOnTop(true) },
    { label: '取消全部置顶', click: () => cards.setAllAlwaysOnTop(false) },
    { label: '解除全部鼠标穿透', click: () => cards.unlockAll() },
    { type: 'separator' },
    { label: '退出 Noteon', click: () => quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createCardAndShow(pluginId, extra = {}) {
  const card = cards.create({ plugin: pluginId, ...extra });
  return card;
}

function quit() {
  quitting = true;
  if (store) store.flush();
  if (cards) cards.shutdown();
  if (webViews) webViews.destroyAll();
  app.quit();
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function cardFromEvent(event) {
  const id = cards.cardIdOfWebContents(event.sender);
  if (!id) return null;
  return { id, card: store.getCard(id) };
}

function themePayload() {
  return {
    themeId: store.settings.themeId,
    customTheme: store.settings.customTheme,
  };
}

function registerIpc() {
  /* ---- 卡片身份 ---- */
  ipcMain.handle('card:get', (event) => {
    const found = cardFromEvent(event);
    if (!found) return null;
    const card = found.card;
    const manifest = plugins.get(card.plugin);
    return {
      card: cards.publicCard(card),
      manifest,
      theme: themePayload(),
      settings: store.settings,
      pluginSettings: store.getPluginSettings(card.plugin),
    };
  });

  ipcMain.handle('card:update', (event, patch) => {
    const found = cardFromEvent(event);
    if (!found || !patch || typeof patch !== 'object') return null;
    const allowed = ['title', 'alwaysOnTop', 'desktop', 'locked', 'alpha', 'accent', 'themeId'];
    const clean = {};
    for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k];
    return cards.update(found.id, clean);
  });

  ipcMain.handle('card:state', (event, patch) => {
    const found = cardFromEvent(event);
    if (!found || !patch || typeof patch !== 'object') return null;
    store.mergeState(found.id, patch);
    return { ok: true };
  });

  ipcMain.handle('card:hide', (event) => {
    const found = cardFromEvent(event);
    if (!found) return false;
    return cards.hide(found.id);
  });

  ipcMain.handle('card:close', (event) => {
    const found = cardFromEvent(event);
    if (!found) return false;
    cards.close(found.id);
    return true;
  });

  ipcMain.handle('card:create', (event, opts) => {
    const out = cards.create({
      plugin: opts?.plugin || 'note',
      title: opts?.title || '',
      state: opts?.state || {},
      bounds: opts?.bounds,
      focus: true,
    });
    return out;
  });

  ipcMain.handle('card:list', () => cards.listCards());
  ipcMain.handle('card:show', (_e, id) => cards.show(id));
  ipcMain.handle('card:updateById', (_e, { id, patch }) => cards.update(id, patch || {}));
  ipcMain.handle('card:closeById', (_e, id) => cards.close(id));
  ipcMain.handle('cards:show-all', () => { cards.showAll(); return true; });
  ipcMain.handle('cards:hide-all', () => { cards.hideAll(); return true; });
  ipcMain.handle('cards:unlock-all', () => { cards.unlockAll(); return true; });

  /* ---- 网页内容层（WebContentsView） ---- */
  ipcMain.handle('web:mount', (event, { rect } = {}) => {
    const found = cardFromEvent(event);
    if (!found) return null;
    return webViews.mount(found.id, rect);
  });
  ipcMain.handle('web:set-bounds', (event, rect) => {
    const found = cardFromEvent(event);
    return found ? webViews.setBounds(found.id, rect) : false;
  });
  ipcMain.handle('web:load', (event, { url, rect } = {}) => {
    const found = cardFromEvent(event);
    if (!found) return { ok: false, error: '未知卡片' };
    if (rect) webViews.mount(found.id, rect);
    return webViews.load(found.id, url);
  });
  ipcMain.handle('web:action', (event, action) => {
    const found = cardFromEvent(event);
    return found ? webViews.action(found.id, String(action)) : false;
  });
  ipcMain.handle('web:zoom', (event, factor) => {
    const found = cardFromEvent(event);
    return found ? webViews.setZoom(found.id, factor) : false;
  });
  ipcMain.handle('web:visible', (event, visible) => {
    const found = cardFromEvent(event);
    return found ? webViews.setVisible(found.id, visible) : false;
  });
  ipcMain.handle('web:devtools', (event) => {
    const found = cardFromEvent(event);
    return found ? webViews.devtools(found.id) : false;
  });
  ipcMain.handle('web:destroy', (event) => {
    const found = cardFromEvent(event);
    if (!found) return false;
    webViews.destroy(found.id);
    return true;
  });

  /* ---- 窗口几何 ---- */
  /* ---- 窗口拖动（坐标由渲染进程上报，位置/尺寸按物理像素网格对齐） ---- */
  let drag = null;
  let resize = null;

  function displayGridFor(pt) {
    const point = pt && Number.isFinite(pt.x) ? pt : screen.getCursorScreenPoint();
    return dipGrid(screen.getDisplayNearestPoint(point).scaleFactor);
  }

  ipcMain.on('win:drag-start', (event, pt) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const b = win.getBounds();
    const grid = displayGridFor(pt);
    const width = Math.max(120, alignDip(b.width, grid));
    const height = Math.max(120, alignDip(b.height, grid));
    if (width !== b.width || height !== b.height) {
      win.setBounds({ x: b.x, y: b.y, width, height }, false);
    }
    drag = {
      win,
      id: cards.cardIdOfWebContents(event.sender),
      start: { x: b.x, y: b.y },
      width,
      height,
      cursor: { x: Number(pt && pt.x) || 0, y: Number(pt && pt.y) || 0 },
      x: b.x,
      y: b.y,
    };
  });

  ipcMain.on('win:drag-move', (event, pt) => {
    if (!drag || drag.win.isDestroyed() || !pt) return;
    if (BrowserWindow.fromWebContents(event.sender) !== drag.win) return;
    const grid = displayGridFor(pt);
    let x = drag.start.x + pt.x - drag.cursor.x;
    let y = drag.start.y + pt.y - drag.cursor.y;
    if (store.settings.snap) {
      ({ x, y } = snapBounds(drag.width, drag.height, x, y, drag.id, pt));
    }
    x = alignDip(x, grid);
    y = alignDip(y, grid);
    if (x === drag.x && y === drag.y) return;
    drag.x = x;
    drag.y = y;
    // 固定宽高，避免 setBounds 在非整数缩放下顺手改 1px 并累积
    drag.win.setBounds({ x, y, width: drag.width, height: drag.height }, false);
  });

  ipcMain.on('win:drag-end', () => {
    if (drag && !drag.win.isDestroyed()) {
      store.updateCard(drag.id, { x: drag.x, y: drag.y, w: drag.width, h: drag.height });
    }
    drag = null;
  });

  /* ---- 窗口缩放 ---- */
  ipcMain.on('win:resize-start', (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const b = win.getBounds();
    const cid = cards.cardIdOfWebContents(event.sender);
    const c = cid && store.getCard(cid);
    const m = c && plugins.get(c.plugin);
    resize = {
      win,
      id: cid,
      edge: String(payload.edge || ''),
      start: b,
      cursor: { x: Number(payload.x) || 0, y: Number(payload.y) || 0 },
      min: (m && m.minSize) || [220, 160],
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
    };
  });

  ipcMain.on('win:resize-move', (event, pt) => {
    if (!resize || resize.win.isDestroyed() || !pt) return;
    if (BrowserWindow.fromWebContents(event.sender) !== resize.win) return;
    const s = resize.start;
    const dx = pt.x - resize.cursor.x;
    const dy = pt.y - resize.cursor.y;
    const grid = displayGridFor(pt);
    let { x, y, width, height } = s;
    if (resize.edge.includes('e')) width = s.width + dx;
    if (resize.edge.includes('s')) height = s.height + dy;
    if (resize.edge.includes('w')) { width = s.width - dx; x = s.x + dx; }
    if (resize.edge.includes('n')) { height = s.height - dy; y = s.y + dy; }
    width = Math.max(resize.min[0] || 220, alignDip(width, grid));
    height = Math.max(resize.min[1] || 160, alignDip(height, grid));
    if (resize.edge.includes('w')) x = s.x + (s.width - width);
    if (resize.edge.includes('n')) y = s.y + (s.height - height);
    const bx = alignDip(Math.round(x), grid);
    const by = alignDip(Math.round(y), grid);
    if (bx === resize.x && by === resize.y && width === resize.w && height === resize.h) return;
    resize.x = bx;
    resize.y = by;
    resize.w = width;
    resize.h = height;
    resize.win.setBounds({ x: bx, y: by, width, height }, false);
  });

  ipcMain.on('win:resize-end', () => {
    if (resize && resize.win && !resize.win.isDestroyed()) {
      store.updateCard(resize.id, { x: resize.x, y: resize.y, w: resize.w, h: resize.h });
    }
    resize = null;
  });

  ipcMain.on('win:focus', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.focus();
  });

  /* ---- 面板 ---- */
  ipcMain.handle('panel:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.handle('panel:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
  ipcMain.handle('panel:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  ipcMain.handle('shellmenu:set', (_e, cfg) => {
    try {
      const opts = (cfg && typeof cfg === 'object') ? cfg : { enabled: !!cfg };
      const all = shellMenu.PLUGINS.map(([id]) => id);
      const wanted = Array.isArray(opts.plugins) ? opts.plugins : contextMenuIds();
      const ids = all.filter((id) => wanted.includes(id));
      const enabled = !!opts.enabled && ids.length > 0;
      store.settings.contextMenu = enabled;
      store.settings.contextMenuPlugins = ids;
      store.touch();
      if (enabled) shellMenu.install(shellMenuOptions(), ids);
      else shellMenu.uninstall();
      return { ok: true, enabled, selected: ids, plugins: shellMenu.PLUGINS };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('shellmenu:get', () => ({
    enabled: !!store.settings.contextMenu,
    installed: shellMenu.isInstalled(),
    plugins: shellMenu.PLUGINS,
    selected: contextMenuIds(),
  }));

  /* ---- 插件 ---- */
  ipcMain.handle('plugins:list', () => plugins.list());
  ipcMain.handle('plugins:reload', () => {
    const list = plugins.scan();
    rebuildTrayMenu();
    cards.broadcast('plugins:reloaded', list);
    for (const win of cards.windows.values()) {
      if (!win.isDestroyed()) win.webContents.reload();
    }
    return list;
  });
  ipcMain.handle('plugin:invoke', async (event, { fn, args } = {}) => {
    const found = cardFromEvent(event);
    if (!found) throw new Error('未知卡片');
    return plugins.invoke(found.card.plugin, String(fn), args, { sender: event.sender });
  });
  ipcMain.handle('plugin:settings:get', (event) => {
    const found = cardFromEvent(event);
    return found ? store.getPluginSettings(found.card.plugin) : {};
  });
  ipcMain.handle('plugin:settings:set', (event, patch) => {
    const found = cardFromEvent(event);
    if (!found) return null;
    const out = store.mergePluginSettings(found.card.plugin, patch || {});
    cards.broadcast('plugin:settings:changed', { plugin: found.card.plugin, settings: out });
    return out;
  });

  /* ---- 设置 ---- */
  ipcMain.handle('settings:get', () => ({ ...store.settings, dataDir: app.getPath('userData'), pluginDir: path.join(ROOT, 'plugins'), version: app.getVersion() }));
  ipcMain.handle('settings:set', (event, patch) => {
    if (!patch || typeof patch !== 'object') return store.settings;
    const allowed = ['themeId', 'customTheme', 'defaultAlwaysOnTop', 'restoreOnStart', 'snap', 'hideFromTaskbar', 'showPanelOnStart'];
    for (const k of allowed) {
      if (patch[k] === undefined) continue;
      if (k === 'customTheme') store.settings.customTheme = { ...store.settings.customTheme, ...patch[k] };
      else store.settings[k] = patch[k];
    }
    store.touch();
    cards.broadcast('theme:changed', { ...themePayload(), settings: store.settings });
    return { ...store.settings };
  });
  ipcMain.handle('settings:apply-to-all', (_e, patch) => {
    if (patch && typeof patch === 'object') {
      for (const c of store.cards) {
        const clean = {};
        for (const k of ['alpha', 'accent', 'themeId']) if (patch[k] !== undefined) clean[k] = patch[k];
        if (Object.keys(clean).length) store.updateCard(c.id, clean);
      }
      cards.broadcast('card:updated', null);
      cards.broadcast('board:changed', cards.listCards());
    }
    return cards.listCards();
  });

  /* ---- 文件 / 对话框 ---- */
  ipcMain.handle('dialog:pick-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:pick-files', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', ...(opts.multi === false ? [] : ['multiSelections'])],
      filters: Array.isArray(opts.filters) ? opts.filters : [{ name: '所有文件', extensions: ['*'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:save-file', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: opts.defaultPath || undefined,
      filters: Array.isArray(opts.filters) ? opts.filters : undefined,
    });
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('dialog:message', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showMessageBox(win, {
      type: opts.type || 'question',
      title: opts.title || 'Noteon',
      message: opts.message || '',
      detail: opts.detail || '',
      buttons: Array.isArray(opts.buttons) ? opts.buttons : ['确定', '取消'],
      defaultId: 0,
      cancelId: Array.isArray(opts.buttons) ? opts.buttons.length - 1 : 1,
      noLink: true,
    });
    return r.response;
  });

  ipcMain.handle('fs:read-dir', async (_e, { dir, showHidden } = {}) => {
    try {
      const full = path.resolve(String(dir));
      const names = await fsp.readdir(full, { withFileTypes: true });
      const entries = [];
      for (const ent of names) {
        if (!showHidden && ent.name.startsWith('.')) continue;
        const p = path.join(full, ent.name);
        let size = 0;
        let mtime = 0;
        try {
          const st = await fsp.stat(p);
          size = st.size;
          mtime = st.mtimeMs;
        } catch {}
        entries.push({
          name: ent.name,
          path: p,
          isDir: ent.isDirectory(),
          ext: ent.isDirectory() ? '' : path.extname(ent.name).toLowerCase(),
          size,
          mtime,
        });
      }
      entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-CN', { numeric: true }) : a.isDir ? -1 : 1));
      return { ok: true, path: full, entries };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('fs:read-text', async (_e, { path: p, maxBytes } = {}) => {
    try {
      const full = path.resolve(String(p));
      const limit = Number.isFinite(maxBytes) ? maxBytes : 8 * 1024 * 1024;
      const st = await fsp.stat(full);
      if (!st.isFile()) throw new Error('不是文件');
      if (st.size > limit) throw new Error(`文件过大（${(st.size / 1048576).toFixed(1)} MB），请用外部编辑器打开`);
      const buf = await fsp.readFile(full);
      let text;
      if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
        text = buf.slice(2).toString('utf16le');
      } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
        const swapped = Buffer.from(buf.slice(2));
        swapped.swap16();
        text = swapped.toString('utf16le');
      } else {
        text = buf.toString('utf8').replace(/^\uFEFF/, '');
      }
      return { ok: true, text, size: st.size, mtime: st.mtimeMs, path: full };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('fs:write-text', async (_e, { path: p, text } = {}) => {
    try {
      const full = path.resolve(String(p));
      await fsp.mkdir(path.dirname(full), { recursive: true });
      const tmp = full + '.noteon-tmp';
      await fsp.writeFile(tmp, String(text ?? ''), 'utf8');
      await fsp.rename(tmp, full);
      return { ok: true, path: full };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('fs:stat', async (_e, { path: p } = {}) => {
    try {
      const st = await fsp.stat(path.resolve(String(p)));
      return { ok: true, isDir: st.isDirectory(), size: st.size, mtime: st.mtimeMs };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('fs:exists', async (_e, { path: p } = {}) => {
    try { await fsp.access(path.resolve(String(p))); return true; } catch { return false; }
  });

  ipcMain.handle('fs:copy-into', async (_e, { paths: list, dest } = {}) => {
    try {
      const dir = path.resolve(String(dest));
      await fsp.mkdir(dir, { recursive: true });
      const copied = [];
      for (const src of list || []) {
        const from = path.resolve(String(src));
        const base = path.basename(from);
        let target = path.join(dir, base);
        let n = 1;
        while (fs.existsSync(target)) {
          const ext = path.extname(base);
          const stem = path.basename(base, ext);
          target = path.join(dir, `${stem} (${n++})${ext}`);
        }
        await fsp.cp(from, target, { recursive: true, errorOnExist: false });
        copied.push(target);
      }
      return { ok: true, copied };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('fs:list-drives', async () => {
    if (process.platform !== 'win32') return [];
    const out = [];
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      const p = letter + ':\\';
      try { await fsp.access(p); out.push(p); } catch {}
    }
    return out;
  });

  ipcMain.handle('shell:open-path', async (_e, p) => {
    const full = String(p || '');
    if (!full) return { ok: false, error: '空路径' };
    if (/^https?:/i.test(full)) { await shell.openExternal(full); return { ok: true }; }
    const err = await shell.openPath(full);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('shell:reveal', (_e, p) => {
    const full = path.resolve(String(p));
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) shell.openPath(full);
      else shell.showItemInFolder(full);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('shell:open-url', async (_e, url) => {
    const u = String(url || '');
    if (!/^(https?:|mailto:)/i.test(u)) return { ok: false, error: '只允许 http/https/mailto' };
    await shell.openExternal(u);
    return { ok: true };
  });

  ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text ?? '')); return true; });

  ipcMain.handle('file:drag', (event, { path: p } = {}) => {
    try {
      const iconPath = path.join(ASSETS, 'drag.png');
      const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
      event.sender.startDrag({ file: path.resolve(String(p)), icon });
      return true;
    } catch (err) {
      return false;
    }
  });

  async function grabDisplay() {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sf = display.scaleFactor || 1;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.max(1, Math.round(display.size.width * sf)),
        height: Math.max(1, Math.round(display.size.height * sf)),
      },
      fetchWindowIcons: false,
    });
    const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
    if (!source || !source.thumbnail || source.thumbnail.isEmpty()) throw new Error('没有拿到屏幕画面');
    return { display, image: source.thumbnail };
  }

  function openRegionSelector(display, dataUrl) {
    return new Promise((resolve) => {
      let settled = false;
      let overlay = null;
      let timer = 0;
      const cleanup = () => {
        ipcMain.removeListener('region:done', onDone);
        ipcMain.removeListener('region:cancel', onCancel);
        if (timer) clearTimeout(timer);
      };
      const finish = (rect) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (overlay && !overlay.isDestroyed()) overlay.close();
        resolve(rect);
      };
      const onDone = (e, rect) => {
        if (!overlay || e.sender !== overlay.webContents) return;
        if (!rect || !(Number(rect.w) > 0) || !(Number(rect.h) > 0)) return finish(null);
        finish(rect);
      };
      const onCancel = (e) => {
        if (!overlay || e.sender !== overlay.webContents) return;
        finish(null);
      };
      ipcMain.on('region:done', onDone);
      ipcMain.on('region:cancel', onCancel);
      overlay = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        show: false,
        frame: false,
        transparent: false,
        backgroundColor: '#05070b',
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        enableLargerThanScreen: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload-region.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      overlay.setMenuBarVisibility(false);
      overlay.setAlwaysOnTop(true, 'screen-saver');
      overlay.once('closed', () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(null);
        }
      });
      overlay.webContents.once('did-finish-load', () => {
        if (settled) return;
        overlay.webContents.send('region:image', { dataUrl });
        overlay.show();
        overlay.focus();
      });
      overlay.webContents.once('render-process-gone', () => finish(null));
      overlay.loadFile(path.join(ROOT, 'renderer', 'region.html')).catch(() => finish(null));
      timer = setTimeout(() => finish(null), 120000);
    });
  }

  ipcMain.handle('screen:capture', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const panelWasVisible = !!(panelWin && !panelWin.isDestroyed() && panelWin.isVisible());
    try {
      if (panelWasVisible) panelWin.hide();
      if (win && !win.isDestroyed()) win.hide();
      await new Promise((r) => setTimeout(r, 260));
      const { image } = await grabDisplay();
      const size = image.getSize();
      return { ok: true, dataUrl: image.toDataURL(), width: size.width, height: size.height };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (win && !win.isDestroyed()) { win.show(); win.focus(); }
      if (panelWasVisible && panelWin && !panelWin.isDestroyed()) panelWin.showInactive();
    }
  });

  ipcMain.handle('screen:capture-region', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const panelWasVisible = !!(panelWin && !panelWin.isDestroyed() && panelWin.isVisible());
    try {
      if (panelWasVisible) panelWin.hide();
      if (win && !win.isDestroyed()) win.hide();
      await new Promise((r) => setTimeout(r, 260));
      const { display, image } = await grabDisplay();
      const rect = await openRegionSelector(display, image.toDataURL());
      if (!rect) return { ok: false, canceled: true };
      const size = image.getSize();
      const x = Math.max(0, Math.min(size.width - 1, Math.round(rect.x)));
      const y = Math.max(0, Math.min(size.height - 1, Math.round(rect.y)));
      const w = Math.max(1, Math.min(size.width - x, Math.round(rect.w)));
      const h = Math.max(1, Math.min(size.height - y, Math.round(rect.h)));
      const cropped = image.crop({ x, y, width: w, height: h });
      return { ok: true, dataUrl: cropped.toDataURL(), width: w, height: h };
    } catch (err) {
      return { ok: false, error: err.message };
    } finally {
      if (win && !win.isDestroyed()) { win.show(); win.focus(); }
      if (panelWasVisible && panelWin && !panelWin.isDestroyed()) panelWin.showInactive();
    }
  });

  ipcMain.handle('capture:save', async (event, { dataUrl, saveAs } = {}) => {
    try {
      const m = String(dataUrl || '').match(/^data:image\/([a-z0-9+.-]+);base64,(.*)$/is);
      if (!m) throw new Error('图片数据无效');
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const buf = Buffer.from(m[2], 'base64');
      const dir = path.join(app.getPath('userData'), 'shots');
      await fsp.mkdir(dir, { recursive: true });
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`;
      let target = path.join(dir, `Noteon-${stamp}.${ext}`);
      if (saveAs) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const picked = await dialog.showSaveDialog(win, {
          defaultPath: target,
          filters: [{ name: '图片', extensions: ['png', 'jpg'] }],
        });
        if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
        target = picked.filePath;
      }
      await fsp.writeFile(target, buf);
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('image:load', async (event, { src } = {}) => {
    try {
      let local = String(src || '');
      if (/^https?:\/\//i.test(local)) {
        local = await downloadToCache(local);
      }
      if (local.startsWith('data:')) {
        const m = local.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
        if (!m) throw new Error('无法解析 data URL');
        const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
        return { ok: true, bytes: buf, mime: m[1] || 'image/png', name: 'inline' };
      }
      const full = path.resolve(local);
      const st = await fsp.stat(full);
      if (st.size > 160 * 1024 * 1024) throw new Error('图片超过 160 MB');
      const buf = await fsp.readFile(full);
      return { ok: true, bytes: buf, mime: MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', path: full, name: path.basename(full), size: st.size };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:open-data-dir', () => { shell.openPath(app.getPath('userData')); });
  ipcMain.handle('app:open-plugin-dir', () => { shell.openPath(path.join(ROOT, 'plugins')); });
  ipcMain.handle('app:open-docs', () => { shell.openPath(path.join(ROOT, 'docs')); });
  ipcMain.handle('app:open-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.openDevTools({ mode: 'detach' });
  });

  /* ---- 原生菜单 ---- */
  ipcMain.handle('menu:popup', (event, { items, x, y } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !Array.isArray(items)) return null;
    return new Promise((resolve) => {
      let picked = null;
      const toTemplate = (arr) => arr.map((it) => {
        if (it.type === 'separator') return { type: 'separator' };
        if (it.submenu) return { label: it.label, submenu: toTemplate(it.submenu) };
        return {
          label: it.label,
          type: it.type === 'checkbox' ? 'checkbox' : 'normal',
          checked: !!it.checked,
          enabled: it.enabled !== false,
          accelerator: it.accelerator || undefined,
          click: () => { picked = it.id; },
        };
      });
      const menu = Menu.buildFromTemplate(toTemplate(items));
      menu.popup({ window: win, x: Number.isFinite(x) ? x : undefined, y: Number.isFinite(y) ? y : undefined, callback: () => resolve(picked) });
    });
  });

  /* ---- 文件关联打开 ---- */
  ipcMain.handle('card:open-file', async (_e, p) => {
    const full = path.resolve(String(p));
    let st;
    try { st = await fsp.stat(full); } catch { return { ok: false, error: '文件不存在' }; }
    if (st.isDirectory()) return { ok: false, error: '是文件夹' };
    const ext = path.extname(full).toLowerCase();
    const imageExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.ico', '.svg']);
    const textExt = new Set(['.txt', '.md', '.markdown', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.html', '.htm', '.xml', '.yml', '.yaml', '.ini', '.log', '.csv', '.py', '.c', '.h', '.cpp', '.cs', '.java', '.go', '.rs', '.sh', '.bat', '.ps1', '.toml', '.sql']);
    let plugin = null;
    if (imageExt.has(ext)) plugin = 'image';
    else if (ext === '.html' || ext === '.htm') plugin = 'web';
    else if (textExt.has(ext)) plugin = 'text';
    if (!plugin) {
      const err = await shell.openPath(full);
      return err ? { ok: false, error: err } : { ok: true, external: true };
    }
    const state = plugin === 'web' ? { url: full } : plugin === 'image' ? { items: [{ src: full, name: path.basename(full) }] } : { path: full };
    cards.create({ plugin, state, title: path.basename(full) });
    return { ok: true, plugin };
  });
}

/* ------------------------------------------------------------------ */
/* 拖动吸附                                                            */
/* ------------------------------------------------------------------ */

function dipGrid(scale) {
  const s = Number(scale) || 1;
  for (let b = 1; b <= 64; b++) {
    if (Math.abs(s * b - Math.round(s * b)) < 0.001) return b;
  }
  return 1;
}

function alignDip(v, grid) {
  return Math.round(v / Math.max(1, grid)) * Math.max(1, grid);
}

function snapBounds(w, h, x, y, selfId, cursor) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(cursor?.x ?? x), y: Math.round(cursor?.y ?? y) });
  const area = display.workArea;
  const gap = 10;
  if (Math.abs(x - area.x) < gap) x = area.x;
  if (Math.abs(y - area.y) < gap) y = area.y;
  if (Math.abs(x + w - (area.x + area.width)) < gap) x = area.x + area.width - w;
  if (Math.abs(y + h - (area.y + area.height)) < gap) y = area.y + area.height - h;

  if (cards) {
    for (const c of store.cards) {
      if (c.id === selfId) continue;
      const cx = c.x, cy = c.y, cw = c.w, ch = c.h;
      // 左边/右边对齐
      if (Math.abs(x - cx) < gap) x = cx;
      if (Math.abs(x + w - (cx + cw)) < gap) { x = cx + cw - w; }
      if (Math.abs(cx - (x + w)) < gap) x = cx - w;
      // 顶/底对齐
      if (Math.abs(y - cy) < gap) y = cy;
      if (Math.abs(y + h - (cy + ch)) < gap) y = cy + ch - h;
      if (Math.abs(cy - (y + h)) < gap) y = cy - h;
    }
  }
  return { x, y };
}

/* ------------------------------------------------------------------ */
/* 下载远程图片                                                        */
/* ------------------------------------------------------------------ */

async function downloadToCache(url) {
  const cacheDir = path.join(app.getPath('userData'), 'cache');
  await fsp.mkdir(cacheDir, { recursive: true });
  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  let ext = '.img';
  try {
    const u = new URL(url);
    ext = path.extname(u.pathname) || '.img';
  } catch {}
  if (!/^\.[a-z0-9]{1,5}$/i.test(ext)) ext = '.img';
  const target = path.join(cacheDir, hash + ext);
  if (fs.existsSync(target) && (await fsp.stat(target)).size > 0) return target;
  const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'Noteon/0.1' } });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 160 * 1024 * 1024) throw new Error('远程图片过大');
  await fsp.writeFile(target, buf);
  return target;
}

/* ------------------------------------------------------------------ */
/* 冒烟测试                                                            */
/* ------------------------------------------------------------------ */

function demoSpecs() {
  const data = path.join(ROOT, 'out', 'smoke-data');
  const sampleText = path.join(data, 'sample.txt');
  const sampleMd = path.join(data, 'notes.md');
  const folder = path.join(data, 'folder');
  const img1 = path.join(data, 'ref-a.png');
  const img2 = path.join(data, 'ref-b.png');
  const page = path.join(data, 'page.html');
  return [
    { plugin: 'note', title: '便签', state: { text: '# 今日计划\n\n- [x] 桌面便签\n- [ ] 图片\n- [ ] 文件夹映射\n\n> 点右上角 + 换主题、调透明度。\n\n`Ctrl+W` 关闭卡片。', fontSize: 14 } },
    { plugin: 'text', title: 'sample.txt', state: { path: sampleText, fontSize: 13 } },
    { plugin: 'image', title: '绘画参考', state: { items: [{ src: img1, name: 'ref-a.png' }, { src: img2, name: 'ref-b.png' }], index: 0 } },
    { plugin: 'screenshot', title: '截屏', state: {} },
    { plugin: 'folder', title: '文件夹映射', state: { path: folder } },
    { plugin: 'web', title: '网页预览', state: { url: page } },
    { plugin: 'relay', title: '文件中转', state: { items: [{ path: sampleText, name: 'sample.txt', size: 1024, isDir: false }, { path: sampleMd, name: 'notes.md', size: 2048, isDir: false }] } },
  ];
}

function createDemoCards() {
  const created = [];
  let i = 0;
  for (const spec of demoSpecs()) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const card = cards.create({
      plugin: spec.plugin,
      title: spec.title,
      state: spec.state,
      focus: false,
      inactive: true,
      bounds: { x: 24 + col * 528, y: 24 + row * 500, w: 504, h: 476 },
      alwaysOnTop: true,
    });
    created.push(card);
    i += 1;
  }
  return created;
}

function openDemoPanel() {
  const panel = openPanel();
  if (panel) panel.setBounds({ x: 1600, y: 30, width: 1000, height: 720 });
  return panel;
}

async function runSmoke() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let outDir = path.join(ROOT, 'out', 'smoke');
  try {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
  } catch (err) {
    console.warn('[smoke] out/smoke 被占用，改用独立目录:', err.message);
    outDir = path.join(ROOT, 'out', 'smoke-' + Date.now());
    fs.mkdirSync(outDir, { recursive: true });
  }
  const created = createDemoCards();
  const panel = openDemoPanel();

  await new Promise((r) => setTimeout(r, 4200));

  const shots = [];
  for (const card of created) {
    const win = cards.getById(card.id);
    if (!win || win.isDestroyed()) continue;
    try {
      const img = await win.webContents.capturePage();
      const file = path.join(outDir, `${card.plugin}.png`);
      fs.writeFileSync(file, img.toPNG());
      shots.push({ plugin: card.plugin, file, size: img.getSize() });
    } catch (err) {
      shots.push({ plugin: card.plugin, error: err.message });
    }
  }
  if (panel && !panel.isDestroyed()) {
    try {
      const img = await panel.webContents.capturePage();
      const file = path.join(outDir, 'panel.png');
      fs.writeFileSync(file, img.toPNG());
      shots.push({ plugin: 'panel', file, size: img.getSize() });
      await panel.webContents.executeJavaScript(`document.querySelector('[data-tab="theme"]').click()`);
      await new Promise((r) => setTimeout(r, 500));
      const img2 = await panel.webContents.capturePage();
      const file2 = path.join(outDir, 'panel-theme.png');
      fs.writeFileSync(file2, img2.toPNG());
      shots.push({ plugin: 'panel-theme', file: file2, size: img2.getSize() });
    } catch (err) {
      shots.push({ plugin: 'panel', error: err.message });
    }
  }

  // 网页内容层是 WebContentsView，不会出现在窗口的 capturePage 里，单独抓一张
  if (webViews) {
    for (const entry of webViews.views.values()) {
      try {
        const img = await entry.view.webContents.capturePage();
        const file = path.join(outDir, 'web-content.png');
        fs.writeFileSync(file, img.toPNG());
        shots.push({ plugin: 'web-content', file, size: img.getSize() });
        break;
      } catch (err) {
        shots.push({ plugin: 'web-content', error: err.message });
      }
    }
  }

  // 图片分割对比
  try {
    const imgCard = created.find((c) => c.plugin === 'image');
    const imgWin = imgCard && cards.getById(imgCard.id);
    if (imgWin) {
      await imgWin.webContents.executeJavaScript(`document.querySelector('[data-act="split"]').click()`);
      await new Promise((r) => setTimeout(r, 2400));
      const img = await imgWin.webContents.capturePage();
      const file = path.join(outDir, 'image-split.png');
      fs.writeFileSync(file, img.toPNG());
      shots.push({ plugin: 'image-split', file, size: img.getSize() });
    }
  } catch (err) {
    shots.push({ plugin: 'image-split', error: err.message });
  }

  // 图片插件：双击隐藏 UI、右键取色、双击右键复制
  const imageTest = {};
  try {
    const imgCard = created.find((c) => c.plugin === 'image');
    const imgWin = imgCard && cards.getById(imgCard.id);
    if (imgWin) {
      await imgWin.webContents.executeJavaScript(`document.querySelector('[data-act="split"]').click()`);
      await wait(300);
      await wait(700);
      imageTest.immersive = await imgWin.webContents.executeJavaScript(`
        (() => {
          const stage = document.querySelector('.stage');
          const r = stage.getBoundingClientRect();
          const ev = (t, x, y) => stage.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y }));
          ev('dblclick', r.left + r.width / 2, r.top + r.height / 2);
          return document.body.classList.contains('immersive');
        })()
      `);
      await wait(500);
      const img = await imgWin.webContents.capturePage();
      const file = path.join(outDir, 'image-only.png');
      fs.writeFileSync(file, img.toPNG());
      shots.push({ plugin: 'image-only', file, size: img.getSize() });
      await imgWin.webContents.executeJavaScript(`
        (() => {
          const stage = document.querySelector('.stage');
          const r = stage.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const ev = (t) => stage.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y }));
          ev('contextmenu'); ev('contextmenu');
        })()
      `);
      await wait(400);
      const clip = String(await clipboard.readText());
      imageTest.clipboard = clip;
      imageTest.clipboardType = typeof clip;
      imageTest.hex = /^[0-9A-F]{6}$/.test(clip);
      imageTest.restored = await imgWin.webContents.executeJavaScript(`
        (() => {
          const stage = document.querySelector('.stage');
          stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return !document.body.classList.contains('immersive');
        })()
      `);
    }
  } catch (err) {
    imageTest.error = err.message;
  }
  console.log('[smoke] image', JSON.stringify(imageTest));

  // 截屏插件：实际抓取一次屏幕（会隐藏截屏卡片和面板）
  const shotTest = {};
  try {
    const sc = created.find((c) => c.plugin === 'screenshot');
    const sw = sc && cards.getById(sc.id);
    if (sw) {
      await sw.webContents.executeJavaScript(`document.querySelector('[data-act="capture"]').click()`);
      let regionWin = null;
      for (let i = 0; i < 60; i++) {
        regionWin = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('region.html'));
        if (regionWin) break;
        await wait(250);
      }
      if (!regionWin) throw new Error('区域选择窗口没有打开');
      shotTest.regionOpened = true;
      try {
        const rimg = await regionWin.webContents.capturePage();
        const rfile = path.join(outDir, 'region.png');
        fs.writeFileSync(rfile, rimg.toPNG());
        shots.push({ plugin: 'region', file: rfile, size: rimg.getSize() });
      } catch (err) {
        shotTest.regionShotError = err.message;
      }
      const rb = regionWin.getBounds();
      const sx = Math.round(rb.width * 0.22);
      const sy = Math.round(rb.height * 0.22);
      const ex = Math.round(rb.width * 0.58);
      const ey = Math.round(rb.height * 0.56);
      shotTest.expect = { w: ex - sx, h: ey - sy };
      regionWin.webContents.sendInputEvent({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
      await wait(90);
      regionWin.webContents.sendInputEvent({ type: 'mouseMove', x: ex, y: ey, button: 'left', clickCount: 1 });
      await wait(90);
      regionWin.webContents.sendInputEvent({ type: 'mouseUp', x: ex, y: ey, button: 'left', clickCount: 1 });
      await wait(1500);
      if (regionWin && !regionWin.isDestroyed()) {
        await regionWin.webContents.executeJavaScript(`window.region.done({ x: 100, y: 100, w: 420, h: 320 })`);
        await wait(700);
      }
      shotTest.canvas = await sw.webContents.executeJavaScript(`(() => {
        const c = document.querySelector('.shot-canvas');
        return { width: c.width, height: c.height, hidden: c.classList.contains('hidden') };
      })()`);
      const before = { ...shotTest.canvas };
      await sw.webContents.executeJavaScript(`document.querySelector('[data-act="rotate"]').click()`);
      await wait(350);
      const rotated = await sw.webContents.executeJavaScript(`(() => { const c = document.querySelector('.shot-canvas'); return { width: c.width, height: c.height }; })()`);
      await sw.webContents.executeJavaScript(`document.querySelector('[data-act="undo"]').click()`);
      await wait(500);
      const back = await sw.webContents.executeJavaScript(`(() => { const c = document.querySelector('.shot-canvas'); return { width: c.width, height: c.height }; })()`);
      shotTest.rotate = { before, rotated, back };
      shotTest.saved = await sw.webContents.executeJavaScript(`(async () => {
        const c = document.querySelector('.shot-canvas');
        const r = await window.noteon.saveCapture(c.toDataURL('image/png'), false);
        return { ok: !!(r && r.ok), path: (r && r.path) || '' };
      })()`);
      const beforeIds = new Set(cards.listCards().map((c) => c.id));
      await sw.webContents.executeJavaScript(`document.querySelector('[data-act="to-image"]').click()`);
      await wait(1200);
      const added = cards.listCards().filter((c) => !beforeIds.has(c.id));
      shotTest.imageCard = { count: added.length, plugin: added[0] ? added[0].plugin : '' };
      for (const c of added) cards.close(c.id);
    }
  } catch (err) {
    shotTest.error = err.message;
  }
  console.log('[smoke] shot', JSON.stringify(shotTest));

  // 主题切换（纸页）后重新截便签
  try {
    if (panel && !panel.isDestroyed()) {
      await panel.webContents.executeJavaScript(`document.querySelectorAll('.preset')[2].click()`);
      await new Promise((r) => setTimeout(r, 800));
      const noteWin = cards.getById(created[0].id);
      const img = await noteWin.webContents.capturePage();
      const file = path.join(outDir, 'note-paper.png');
      fs.writeFileSync(file, img.toPNG());
      shots.push({ plugin: 'note-paper', file, size: img.getSize() });
      await panel.webContents.executeJavaScript(`document.querySelectorAll('.preset')[0].click()`);
    }
  } catch (err) {
    shots.push({ plugin: 'note-paper', error: err.message });
  }

  // 控制台编辑右键菜单
  const menuEditor = {};
  try {
    await panel.webContents.executeJavaScript(`document.querySelector('#editMenu').click()`);
    await wait(500);
    menuEditor.state = await panel.webContents.executeJavaScript(`(() => {
      const m = document.querySelector('#menuModal');
      return {
        shown: !m.classList.contains('hidden'),
        count: document.querySelectorAll('#menuPlugins input').length,
        checked: document.querySelectorAll('#menuPlugins input:checked').length,
      };
    })()`);
    const img = await panel.webContents.capturePage();
    const file = path.join(outDir, 'panel-menu.png');
    fs.writeFileSync(file, img.toPNG());
    shots.push({ plugin: 'panel-menu', file, size: img.getSize() });
    await panel.webContents.executeJavaScript(`document.querySelector('#menuCancel').click()`);
  } catch (err) {
    menuEditor.error = err.message;
  }
  console.log('[smoke] menu-editor', JSON.stringify(menuEditor));

  // 控制台「显示 / 隐藏」自测
  const panelActions = {};
  try {
    const vis = () => created.map((c) => { const w = cards.getById(c.id); return w ? w.isVisible() : null; });
    await panel.webContents.executeJavaScript(`document.querySelector('#hideAll').click()`);
    await wait(500);
    panelActions.afterHide = vis();
    await panel.webContents.executeJavaScript(`document.querySelector('#showAll').click()`);
    await wait(900);
    panelActions.afterShow = vis();
    panelActions.focusedAfterShow = created.map((c) => { const w = cards.getById(c.id); return w ? w.isFocused() : null; });
    await panel.webContents.executeJavaScript(`document.querySelector('#hideAll').click()`);
    await wait(500);
    await panel.webContents.executeJavaScript(`document.querySelector('.crow .cacts .cact').click()`);
    await wait(900);
    const firstWin = cards.getById(created[0].id);
    panelActions.single = { visible: firstWin.isVisible(), focused: firstWin.isFocused(), top: firstWin.isAlwaysOnTop() };
    await panel.webContents.executeJavaScript(`document.querySelector('#showAll').click()`);
    await wait(400);
  } catch (err) {
    panelActions.error = err.message;
  }
  console.log('[smoke] panel-actions', JSON.stringify(panelActions));

  // 卡片隐藏按钮自测
  const hideTest = {};
  try {
    const w = cards.getById(created[0].id);
    await w.webContents.executeJavaScript(`document.querySelector('#btnHide').click()`);
    await wait(500);
    hideTest.hidden = !w.isVisible();
    cards.show(created[0].id);
    await wait(600);
    hideTest.shown = w.isVisible();
  } catch (err) {
    hideTest.error = err.message;
  }
  console.log('[smoke] hide', JSON.stringify(hideTest));

  // 交互自测：拖动 / 缩放 / 置顶按钮
  const interaction = {};
  try {
    const win = cards.getById(created[0].id);
    if (win && !win.isDestroyed()) {
      const send = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
      const b0 = win.getBounds();
      send('mouseDown', 140, 16);
      await wait(60);
      send('mouseMove', 200, 46);
      await wait(80);
      send('mouseMove', 220, 56);
      await wait(80);
      send('mouseUp', 220, 56);
      await wait(350);
      const b1 = win.getBounds();
      interaction.drag = { before: b0, after: b1, ok: b1.x !== b0.x && b1.y !== b0.y };

      send('mouseDown', b1.width - 12, b1.height - 12);
      await wait(60);
      send('mouseMove', b1.width + 30, b1.height + 20);
      await wait(90);
      send('mouseUp', b1.width + 30, b1.height + 20);
      await wait(400);
      const b2 = win.getBounds();
      interaction.resize = { before: b1, after: b2, ok: b2.width > b1.width && b2.height > b1.height };

      const top0 = win.isAlwaysOnTop();
      send('mouseDown', b2.width - 76, 25);
      await wait(30);
      send('mouseUp', b2.width - 76, 25);
      await wait(350);
      interaction.pin = { before: top0, after: win.isAlwaysOnTop(), ok: top0 !== win.isAlwaysOnTop() };
    }
  } catch (err) {
    interaction.error = err.message;
  }
  console.log('[smoke] interaction', JSON.stringify(interaction));

  // 全部显示并排列
  const tileTest = {};
  try {
    cards.tileAll();
    await wait(500);
    const bs = created.map((c) => {
      const w = cards.getById(c.id);
      return w && !w.isDestroyed() ? w.getBounds() : null;
    }).filter(Boolean);
    let overlap = false;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j];
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlap = true;
      }
    }
    tileTest.bounds = bs;
    tileTest.overlap = overlap;
    tileTest.ok = !overlap && bs.every((b) => b.width > 0 && b.height > 0);
  } catch (err) {
    tileTest.error = err.message;
  }
  console.log('[smoke] tile', JSON.stringify(tileTest));

  // 嵌入桌面：临时把第一张卡片挂到桌面窗口，再撤出
  const desktopTest = {};
  try {
    const id = created[0].id;
    const win = cards.getById(id);
    desktopTest.before = win.getBounds();
    const embedRes = await win.webContents.executeJavaScript(`window.noteon.updateCard({ desktop: true })`);
    desktopTest.embed = !!(embedRes && embedRes.desktop);
    await wait(800);
    const c = cards.listCards().find((x) => x.id === id);
    desktopTest.state = !!(c && c.desktop);
    desktopTest.visible = win.isVisible();
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1600, height: 1000 } });
      if (sources[0] && !sources[0].thumbnail.isEmpty()) {
        const file = path.join(outDir, 'desktop-embed.png');
        fs.writeFileSync(file, sources[0].thumbnail.toPNG());
        shots.push({ plugin: 'desktop-embed', file, size: sources[0].thumbnail.getSize() });
      }
    } catch (err) {
      desktopTest.shotError = err.message;
    }
    const restoreRes = await win.webContents.executeJavaScript(`window.noteon.updateCard({ desktop: false })`);
    desktopTest.restore = !!(restoreRes && !restoreRes.desktop);
    await wait(900);
    desktopTest.after = win.getBounds();
    desktopTest.ok = desktopTest.embed && desktopTest.restore && win.isVisible();
  } catch (err) {
    desktopTest.error = err.message;
  }
  console.log('[smoke] desktop', JSON.stringify(desktopTest));

  const report = {
    interaction,
    panelActions,
    hideTest,
    imageTest,
    shotTest,
    menuEditor,
    tileTest,
    desktopTest,
    shots,
    console: consoleLines.slice(0, 300),
    cards: cards.listCards(),
    plugins: plugins.list().map((p) => p.id),
    theme: store.settings.themeId,
  };  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('[smoke] done:', JSON.stringify(report.shots));
  setTimeout(() => { cards.shutdown(); app.exit(0); }, 300);
}

async function runDemo() {
  createDemoCards();
  openDemoPanel();
  setInterval(() => {
    try {
      const data = cards.store.cards.map((c) => ({ plugin: c.plugin, x: c.x, y: c.y, w: c.w, h: c.h, top: c.alwaysOnTop }));
      fs.writeFileSync(path.join(ROOT, 'out', 'demo-bounds.json'), JSON.stringify(data, null, 2));
    } catch {}
  }, 500);
}

/* ------------------------------------------------------------------ */
/* 退出                                                                */
/* ------------------------------------------------------------------ */

app.on('window-all-closed', () => {
  // 保持托盘常驻，不自动退出
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch {}
});

app.on('before-quit', () => {
  quitting = true;
  if (store) store.flush();
  if (cards) cards.shutdown();
  if (webViews) webViews.destroyAll();
});

process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err);
});
