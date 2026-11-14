'use strict';

const { execFileSync } = require('node:child_process');

const PLUGINS = [
  ['note', '便签'],
  ['text', '文本'],
  ['screenshot', '截屏'],
  ['image', '图片'],
  ['folder', '文件夹映射'],
  ['web', '网页'],
  ['relay', '文件中转'],
];

const SLASH = String.fromCharCode(92);
const ROOTS = [
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}DesktopBackground${SLASH}Shell${SLASH}NoteonCards`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}Directory${SLASH}Background${SLASH}shell${SLASH}NoteonCards`,
];

const LEGACY_ROOTS = [
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}DesktopBackground${SLASH}Shell${SLASH}Noteon`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}DesktopBackground${SLASH}Shell${SLASH}NoteonMenu`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}DesktopBackground${SLASH}Shell${SLASH}NoteonCreate`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}Directory${SLASH}Background${SLASH}shell${SLASH}Noteon`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}Directory${SLASH}Background${SLASH}shell${SLASH}NoteonMenu`,
  `HKCU${SLASH}Software${SLASH}Classes${SLASH}Directory${SLASH}Background${SLASH}shell${SLASH}NoteonCreate`,
];

function runReg(args, ignoreError = false) {
  try {
    execFileSync('reg.exe', args, { windowsHide: true, stdio: 'pipe' });
    return true;
  } catch (err) {
    if (ignoreError) return false;
    throw err;
  }
}

function commandFor(plugin, opts) {
  const parts = [`"${opts.execPath}"`];
  if (!opts.packaged) parts.push(`"${opts.appPath}"`);
  parts.push('--new', plugin, '--path', '"%V"');
  return parts.join(' ');
}

function install(opts, ids) {
  const BS = String.fromCharCode(92);
  const target = opts.packaged ? opts.execPath : opts.appPath;
  const selected = (Array.isArray(ids) ? PLUGINS.filter(([id]) => ids.includes(id)) : PLUGINS.slice());
  if (!selected.length) return uninstall();
  for (const root of LEGACY_ROOTS) runReg(['delete', root, '/f'], true);
  for (const root of ROOTS) {
    runReg(['delete', root, '/f'], true);
    runReg(['add', root, '/v', 'MUIVerb', '/d', '在 Noteon 新建', '/f']);
    runReg(['add', root, '/v', 'Icon', '/d', `"${opts.icon}"`, '/f']);
    runReg(['add', root, '/v', 'Position', '/d', 'Top', '/f']);
    // 空 SubCommands 表示使用本键下的 shell 子键
    runReg(['add', root, '/v', 'SubCommands', '/t', 'REG_SZ', '/d', '', '/f']);
    runReg(['add', root, '/v', 'InstallPath', '/d', target, '/f']);
    runReg(['add', root, '/v', 'MenuVersion', '/d', '2', '/f']);
    runReg(['add', root, '/v', 'MenuPlugins', '/d', selected.map(([id]) => id).join(','), '/f']);
    for (let idx = 0; idx < selected.length; idx++) {
      const [id, label] = selected[idx];
      const key = root + BS + 'shell' + BS + String(idx + 1).padStart(2, '0') + id;
      runReg(['add', key, '/v', 'MUIVerb', '/d', label, '/f']);
      runReg(['add', key + BS + 'command', '/ve', '/d', commandFor(id, opts), '/f']);
    }
  }
  return true;
}

function isCurrent(opts, ids) {
  try {
    const target = opts.packaged ? opts.execPath : opts.appPath;
    const selected = (Array.isArray(ids) ? PLUGINS.filter(([id]) => ids.includes(id)) : PLUGINS.slice()).map(([id]) => id);
    if (!selected.length) return false;
    const read = (name) => execFileSync('reg.exe', ['query', ROOTS[0], '/v', name], { windowsHide: true, encoding: 'utf8' });
    if (!read('InstallPath').includes(target)) return false;
    if (!read('MenuVersion').includes('2')) return false;
    if (!read('MenuPlugins').includes(selected.join(','))) return false;
    return true;
  } catch {
    return false;
  }
}

function uninstall() {
  for (const root of ROOTS) runReg(['delete', root, '/f'], true);
  for (const root of LEGACY_ROOTS) runReg(['delete', root, '/f'], true);
  return true;
}

function isInstalled() {
  return ROOTS.every((root) => runReg(['query', root], true));
}

module.exports = { install, uninstall, isInstalled, isCurrent, PLUGINS };
