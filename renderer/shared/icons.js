/* 统一的线性图标集（stroke 风格），卡片与面板共用 */
(function () {
  const P = {
    note: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19"/><path d="M9 12h6M9 15.5h6"/>',
    text: '<path d="M4 6h16M4 10.5h12M4 15h16M4 19.5h9"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="m20.5 15.5-4.6-4.6-8.6 8.6"/>',
    folder: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2.3h7.4a2 2 0 0 1 2 2v7.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    folderOpen: '<path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h3.6l2 2.3h6.4a2 2 0 0 1 2 2v1.2H3.5z"/><path d="M3.5 12h17.2l-2.1 7.2H5.4z"/>',
    web: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.7 5.3 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.3-3.7-8.5S9.6 5.8 12 3.5z"/>',
    relay: '<path d="M4 8.5h12.5"/><path d="m13.5 5.5 3 3-3 3"/><path d="M20 15.5H7.5"/><path d="m10.5 12.5-3 3 3 3"/>',
    pin: '<path d="M9.2 3.5h5.6l-.9 6.1 3.1 3.1v2H7v-2l3.1-3.1z"/><path d="M12 14.7v6"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5V9h-4.5"/>',
    zoomIn: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m15.7 15.7 4.8 4.8"/><path d="M8 10.8h5.6M10.8 8v5.6"/>',
    zoomOut: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m15.7 15.7 4.8 4.8"/><path d="M8 10.8h5.6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
    eyedropper: '<path d="m19.2 3.6-1.6 1.6"/><path d="m14.4 6.5 3.1 3.1"/><path d="M4 20l.9-3.7L16 5.2l2.8 2.8L7.7 19.1z"/>',
    split: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.8"/><path d="M12 4.5v15"/>',
    square: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>',
    sliders: '<path d="M4 7.5h8M16 7.5h4M4 16.5h4M12 16.5h8"/><circle cx="14" cy="7.5" r="2"/><circle cx="10" cy="16.5" r="2"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7"/><path d="M10 10.5v5.5M14 10.5v5.5"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M10 5H5.5a1 1 0 0 0-1 1v12.5a1 1 0 0 0 1 1H18a1 1 0 0 0 1-1V14"/>',
    chevronLeft: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
    chevronRight: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.6"/><path d="M15.5 5.5h-10a1 1 0 0 0-1 1v10"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8.5 4v5.5h7V4M8.5 20v-6h7v6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.2-1.7"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 20 6.5"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    home: '<path d="M4 11.2 12 4l8 7.2"/><path d="M6.5 9.8V20h11V9.8"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.4-1.4-1.6-1.4-2.7 0-.9.7-1.5 1.9-1.5h1.6c2.2 0 4-1.7 4-4.1C20.1 6.4 16.6 3.5 12 3.5z"/><circle cx="8" cy="10" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16" cy="9.5" r="1.1"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    file: '<path d="M6 3.5h8L18.5 8v12.5H6z"/><path d="M14 3.5V8h4.5"/>',
    fileImage: '<path d="M6 3.5h8L18.5 8v12.5H6z"/><path d="M14 3.5V8h4.5"/><circle cx="9.5" cy="12" r="1"/><path d="m8 17 3-3 4 4"/>',
    fileText: '<path d="M6 3.5h8L18.5 8v12.5H6z"/><path d="M14 3.5V8h4.5"/><path d="M9 12h6M9 15h6"/>',
    paletteDot: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
    dots: '<circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none"/>',
    monitor: '<rect x="3.5" y="4.5" width="17" height="12" rx="1.8"/><path d="M9 20h6M12 16.5V20"/>',
    eye: '<path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 7"/><path d="M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 0 0 5.7 5.7l1.3-1.3"/>',
  };

  function icon(name, size = 16, cls = '') {
    const d = P[name] || P.file;
    return `<svg class="ni ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  }

  window.NI = { icon, paths: P };
})();
