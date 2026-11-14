'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const EVENTS = new Set([
  'theme:changed',
  'card:updated',
  'plugins:reloaded',
  'plugin:settings:changed',
  'board:changed',
  'web:state',
]);

function on(channel, cb) {
  if (!EVENTS.has(channel) || typeof cb !== 'function') return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  /* ---------- 卡片 ---------- */
  cardGet: () => ipcRenderer.invoke('card:get'),
  updateCard: (patch) => ipcRenderer.invoke('card:update', patch),
  saveState: (patch) => ipcRenderer.invoke('card:state', patch),
  close: () => ipcRenderer.invoke('card:close'),
  openCard: (opts) => ipcRenderer.invoke('card:create', opts),
  openFile: (p) => ipcRenderer.invoke('card:open-file', p),
  listCards: () => ipcRenderer.invoke('card:list'),
  showCard: (id) => ipcRenderer.invoke('card:show', id),

  /* ---------- 窗口拖动 / 缩放 ---------- */
  dragStart: (pt) => ipcRenderer.send('win:drag-start', pt),
  dragMove: (pt) => ipcRenderer.send('win:drag-move', pt),
  dragEnd: () => ipcRenderer.send('win:drag-end'),
  resizeStart: (edge, pt) => ipcRenderer.send('win:resize-start', { edge, x: pt.x, y: pt.y }),
  resizeMove: (pt) => ipcRenderer.send('win:resize-move', pt),
  resizeEnd: () => ipcRenderer.send('win:resize-end'),
  focusWindow: () => ipcRenderer.send('win:focus'),

  /* ---------- 文件 ---------- */
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickFiles: (opts) => ipcRenderer.invoke('dialog:pick-files', opts || {}),
  saveFileDialog: (opts) => ipcRenderer.invoke('dialog:save-file', opts || {}),
  messageBox: (opts) => ipcRenderer.invoke('dialog:message', opts || {}),
  readDir: (dir, showHidden = false) => ipcRenderer.invoke('fs:read-dir', { dir, showHidden }),
  readText: (path, maxBytes) => ipcRenderer.invoke('fs:read-text', { path, maxBytes }),
  writeText: (path, text) => ipcRenderer.invoke('fs:write-text', { path, text }),
  stat: (path) => ipcRenderer.invoke('fs:stat', { path }),
  exists: (path) => ipcRenderer.invoke('fs:exists', { path }),
  copyInto: (paths, dest) => ipcRenderer.invoke('fs:copy-into', { paths, dest }),
  listDrives: () => ipcRenderer.invoke('fs:list-drives'),

  openPath: (p) => ipcRenderer.invoke('shell:open-path', p),
  reveal: (p) => ipcRenderer.invoke('shell:reveal', p),
  openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  dragFile: (path) => ipcRenderer.invoke('file:drag', { path }),

  /* ---------- 图片 / 菜单 ---------- */
  loadImage: (src) => ipcRenderer.invoke('image:load', { src }),
  menu: (items, x, y) => ipcRenderer.invoke('menu:popup', { items, x, y }),

  /* ---------- 网页内容层 ---------- */
  webMount: (rect) => ipcRenderer.invoke('web:mount', { rect }),
  webBounds: (rect) => ipcRenderer.invoke('web:set-bounds', rect),
  webLoad: (url, rect) => ipcRenderer.invoke('web:load', { url, rect }),
  webAction: (action) => ipcRenderer.invoke('web:action', action),
  webZoom: (factor) => ipcRenderer.invoke('web:zoom', factor),
  webVisible: (visible) => ipcRenderer.invoke('web:visible', visible),
  webDevTools: () => ipcRenderer.invoke('web:devtools'),
  webDestroy: () => ipcRenderer.invoke('web:destroy'),

  /* ---------- 插件 ---------- */
  invoke: (fn, args) => ipcRenderer.invoke('plugin:invoke', { fn, args }),
  pluginSettings: () => ipcRenderer.invoke('plugin:settings:get'),
  savePluginSettings: (patch) => ipcRenderer.invoke('plugin:settings:set', patch),

  /* ---------- 设置 ---------- */
  getSettings: () => ipcRenderer.invoke('settings:get'),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),

  /* ---------- 工具 ---------- */
  getPathForFile: (file) => {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
  on,
};

contextBridge.exposeInMainWorld('noteon', api);
