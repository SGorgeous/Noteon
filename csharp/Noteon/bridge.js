(function () {
  if (window.noteon) return;
  const pending = new Map();
  const events = Object.create(null);
  let seq = 0;

  window.chrome.webview.addEventListener('message', function (ev) {
    const m = ev.data;
    if (!m) return;
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.result);
      return;
    }
    if (m.event) {
      const list = events[m.event] || [];
      for (const fn of list) {
        try { fn(m.payload); } catch (err) { console.error(err); }
      }
    }
  });

  function call(method, args) {
    return new Promise(function (resolve, reject) {
      const id = ++seq;
      pending.set(id, { resolve: resolve, reject: reject });
      window.chrome.webview.postMessage({ id: id, method: method, args: args || [] });
    });
  }

  function on(channel, cb) {
    if (!events[channel]) events[channel] = [];
    events[channel].push(cb);
    return function () {
      const list = events[channel] || [];
      const i = list.indexOf(cb);
      if (i >= 0) list.splice(i, 1);
    };
  }

  window.noteon = {
    cardGet: function () { return call('cardGet'); },
    updateCard: function (a, b) { return b === undefined ? call('updateCard', [a]) : call('panelUpdateCard', [a, b]); },
    saveState: function (patch) { return call('saveState', [patch]); },
    listCards: function () { return call('listCards'); },
    openCard: function (opts) { return call('openCard', [opts]); },
    createCard: function (opts) { return call('createCard', [opts]); },
    showCard: function (id) { return call('showCard', [id]); },
    closeCard: function (id) { return call('closeCard', [id]); },
    showAllCards: function () { return call('showAllCards'); },
    hideAllCards: function () { return call('hideAllCards'); },
    unlockAll: function () { return call('unlockAll'); },
    listPlugins: function () { return call('listPlugins'); },
    reloadPlugins: function () { return call('listPlugins'); },
    getSettings: function () { return call('getSettings'); },
    setSettings: function (p) { return call('setSettings', [p]); },
    applyToAll: function (p) { return call('applyToAll', [p]); },
    getShellMenu: function () { return call('getShellMenu'); },
    setShellMenu: function (c) { return call('setShellMenu', [c]); },
    openDataDir: function () { return call('openDataDir'); },
    openPluginDir: function () { return call('openPluginDir'); },
    openDocs: function () { return call('openDocs'); },
    minimize: function () { return call('minimize'); },
    maximize: function () { return call('maximize'); },
    close: function () { return call('close'); },
    hide: function () { return call('hide'); },
    menu: function (items) { return call('menu', [items]); },
    toast: function (text) { return call('toast', [text]); },
    dragStart: function (pt) { return call('dragStart', [pt]); },
    dragMove: function (pt) { return call('dragMove', [pt]); },
    dragEnd: function () { return call('dragEnd'); },
    resizeStart: function (edge, pt) { return call('resizeStart', [edge, pt]); },
    resizeMove: function (pt) { return call('resizeMove', [pt]); },
    resizeEnd: function () { return call('resizeEnd'); },
    openUrl: function (url) { return call('openUrl', [url]); },
    openFile: function (p) { return call('openFile', [p]); },
    pickFiles: function (opts) { return call('pickFiles', [opts]); },
    pickFolder: function () { return call('pickFolder'); },
    readDir: function (dir, hidden) { return call('readDir', [dir, hidden]); },
    readText: function (p, max) { return call('readText', [p, max]); },
    writeText: function (p, text) { return call('writeText', [p, text]); },
    stat: function (p) { return call('stat', [p]); },
    exists: function (p) { return call('exists', [p]); },
    saveFileDialog: function (opts) { return call('saveFileDialog', [opts]); },
    messageBox: function (opts) { return call('messageBox', [opts]); },
    copyInto: function (paths, dest) { return call('copyInto', [paths, dest]); },
    listDrives: function () { return call('listDrives'); },
    reveal: function (p) { return call('reveal', [p]); },
    setStatus: function (t) { return call('setStatus', [t]); },
    dragFile: function (p) { return call('dragFile', [p]); },
    fullscreen: function () { return call('fullscreen'); },
    setStylusArea: function (area) { return call('setStylusArea', [area]); },
    smallWindow: function () { return call('smallWindow'); },
    openPath: function (p) { return call('openPath', [p]); },
    openDevTools: function () { return call('openDevTools'); },
    copy: function (text) { return call('copy', [text]); },
    readClipboardText: function () { return call('readClipboardText'); },
    writeClipboardText: function (text) { return call('writeClipboardText', [text]); },
    readClipboardImage: function () { return call('readClipboardImage'); },
    writeClipboardImage: function (dataUrl) { return call('writeClipboardImage', [dataUrl]); },
    getPathForFile: function () { return null; },
    loadImage: function (src) { return call('loadImage', [src]); },
    webMount: function (rect) { return call('webMount', [null, rect]); },
    webLoad: function (url, rect) { return call('webLoad', [url, rect]); },
    webBounds: function (rect) { return call('webBounds', [rect]); },
    webAction: function (action) { return call('webAction', [action]); },
    webZoom: function (factor) { return call('webZoom', [factor]); },
    webVisible: function (visible) { return call('webVisible', [visible]); },
    webDevTools: function () { return call('webDevTools'); },
    webDestroy: function () { return call('webDestroy'); },
    captureScreen: function () { return call('captureScreen'); },
    captureRegion: function () { return call('captureRegion'); },
    saveCapture: function (data, asFile) { return call('saveCapture', [data, asFile]); },
    on: on,
  };

  function bindPanelDrag() {
    var bar = document.querySelector('.titlebar');
    if (!bar) return;
    bar.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      var start = { x: e.screenX, y: e.screenY };
      window.noteon.dragStart(start);
      function move(ev) { window.noteon.dragMove({ x: ev.screenX, y: ev.screenY }); }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.noteon.dragEnd();
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPanelDrag);
  else bindPanelDrag();

  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
})();
