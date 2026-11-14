'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set(['theme:changed', 'board:changed', 'card:updated', 'plugins:reloaded']);

function on(channel, cb) {
  if (!EVENTS.has(channel) || typeof cb !== 'function') return () => {};
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('noteon', {
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  listCards: () => ipcRenderer.invoke('card:list'),
  createCard: (opts) => ipcRenderer.invoke('card:create', opts),
  showCard: (id) => ipcRenderer.invoke('card:show', id),
  updateCard: (id, patch) => ipcRenderer.invoke('card:updateById', { id, patch }),
  closeCard: (id) => ipcRenderer.invoke('card:closeById', id),
  showAllCards: () => ipcRenderer.invoke('cards:show-all'),
  hideAllCards: () => ipcRenderer.invoke('cards:hide-all'),
  unlockAll: () => ipcRenderer.invoke('cards:unlock-all'),
  setShellMenu: (config) => ipcRenderer.invoke('shellmenu:set', config),
  getShellMenu: () => ipcRenderer.invoke('shellmenu:get'),
  applyToAll: (patch) => ipcRenderer.invoke('settings:apply-to-all', patch),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openDataDir: () => ipcRenderer.invoke('app:open-data-dir'),
  openPluginDir: () => ipcRenderer.invoke('app:open-plugin-dir'),
  openDocs: () => ipcRenderer.invoke('app:open-docs'),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  minimize: () => ipcRenderer.invoke('panel:minimize'),
  maximize: () => ipcRenderer.invoke('panel:maximize'),
  close: () => ipcRenderer.invoke('panel:close'),
  on,
});
