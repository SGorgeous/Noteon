'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('region', {
  onImage: (cb) => ipcRenderer.on('region:image', (_event, data) => cb(data)),
  done: (rect) => ipcRenderer.send('region:done', rect),
  cancel: () => ipcRenderer.send('region:cancel'),
});
