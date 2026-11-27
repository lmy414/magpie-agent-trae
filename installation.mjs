import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const WINDOWS_VERSIONS = ['3.4.18', '3.4.20', '3.4.24', '3.4.25'];
const MAC_VERSIONS = ['3.4.20'];

function regOutput(args) {
  try {
    return execFileSync('reg.exe', args, {
      encoding: 'utf8', windowsHide: true, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { return ''; }
}

// Read only public installation metadata. Native integration still verifies the
// client's DLL profile before its first write (trae-local-token.mjs).
function registryApp() {
  for (const hive of ['HKCU', 'HKLM']) {
    const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Trae CN.exe`;
    const exe = regOutput(['query', key, '/ve']).match(/REG_SZ\s+"?([^"\r\n]+?\.exe)"?\s*$/im)?.[1];
    if (exe && path.isAbsolute(exe)) return path.join(path.dirname(exe), 'resources/app');
  }
}

function appUnder(installLocation) {
  if (typeof installLocation !== 'string') return;
  const root = installLocation.trim().replace(/^"|"$/g, '');
  if (!root || !path.isAbsolute(root)) return;
  return /resources[\\/]app$/i.test(root) ? root : path.join(root, 'resources/app');
}

// The per-user installer writes InstallLocation under HKCU. HKLM covers a
// machine-wide install, and WOW6432Node a 32-bit installer on 64-bit Windows.
function registryInstall() {
  for (const hive of ['HKCU', 'HKLM']) {
    for (const base of [
      'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ]) {
      // /d searches values: a key block holds DisplayName and InstallLocation
      // together, so only the Trae CN uninstall entry is accepted.
      const output = regOutput(['query', `${hive}\\${base}`, '/s', '/f', 'TRAE CN', '/d']);
      for (const block of output.split(/\r?\n(?=HKEY_)/)) {
        if (!/DisplayName\s+REG_\w+\s+TRAE CN/i.test(block)) continue;
        const value = block.match(/(?:InstallLocation|Inno Setup: App Path)\s+REG_\w+\s+"?([^"\r\n]+)"?\s*$/im)?.[1];
        const app = appUnder(value);
        if (app) return app;
      }
    }
  }
}

export function installation({ platform = process.platform, env = process.env, home = os.homedir(),
  registry = registryApp, uninstall = registryInstall } = {}) {
  const manual = { mode: 'manual', platform };
  const standard = platform === 'win32' && env.LOCALAPPDATA
    ? path.resolve(env.LOCALAPPDATA, 'Programs/Trae CN/resources/app') : undefined;
  const macCandidates = [
    path.join(home, 'Applications/Trae CN.app/Contents/Resources/app'),
    '/Applications/Trae CN.app/Contents/Resources/app',
  ];
  const candidates = platform === 'darwin'
    ? macCandidates
    : [standard, env.ProgramFiles && path.join(env.ProgramFiles, 'Trae CN/resources/app')];
  function inspect(app) {
    if (!app || !path.isAbsolute(app)) return;
    try {
      const { appVersion } = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
      if (typeof appVersion !== 'string' || !appVersion) return;
      // Any absolute path is acceptable once its version is on the verified list.
      // The DLL profile is checked again before a model is written.
      const supported = platform === 'darwin'
        ? MAC_VERSIONS.includes(appVersion)
        : WINDOWS_VERSIONS.includes(appVersion);
      return { platform, mode: supported ? 'native' : 'manual', app: path.resolve(app), version: appVersion };
    } catch { /* An installation may have been moved or removed. */ }
  }
  const override = env.TRAE_APP || (platform === 'darwin' && env.TRAE_CN_APP_ROOT);
  if (override) return inspect(override) ?? manual;
  for (const candidate of candidates) {
    const found = inspect(candidate);
    if (found) return found;
  }
  if (platform === 'win32') {
    for (const candidate of [registry(), uninstall()]) {
      const found = inspect(candidate);
      if (found) return found;
    }
  }
  return manual;
}
