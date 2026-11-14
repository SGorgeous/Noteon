'use strict';

const { execFileSync } = require('node:child_process');

const PLUGINS = [
  ['note', '便签'],
  ['text', '文本'],
  ['image', '图片参考'],
  ['folder', '文件夹映射'],
  ['web', '网页'],
  ['relay', '文件中转'],
];

const ROOTS = [
  'HKCU\\Software\\Classes\\DesktopBackground\\Shell\\Noteon',
  'HKCU\\Software\\Classes\\Directory\\Background\\shell\\Noteon',
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

function install(opts) {
  for (const root of ROOTS) {
    runReg(['delete', root, '/f'], true);
    runReg(['add', root, '/ve', '/d', '在 Noteon 新建', '/f']);
    runReg(['add', root, '/v', 'MUIVerb', '/d', '在 Noteon 新建', '/f']);
    runReg(['add', root, '/v', 'Icon', '/d', `"${opts.icon}"`, '/f']);
    runReg(['add', root, '/v', 'Position', '/d', 'Top', '/f']);
    runReg(['add', root, '/v', 'SubCommands', '/d', PLUGINS.map(([id]) => '0' + id).join(';'), '/f']);
    for (const [id, label] of PLUGINS) {
      const key = `${root}\\shell\\0${id}`;
      runReg(['add', key, '/ve', '/d', label, '/f']);
      runReg(['add', key, '/v', 'MUIVerb', '/d', label, '/f']);
      runReg(['add', `${key}\\command`, '/ve', '/d', commandFor(id, opts), '/f']);
    }
  }
  return true;
}

function uninstall() {
  for (const root of ROOTS) runReg(['delete', root, '/f'], true);
  return true;
}

function isInstalled() {
  return ROOTS.every((root) => runReg(['query', root], true));
}

module.exports = { install, uninstall, isInstalled, PLUGINS };
