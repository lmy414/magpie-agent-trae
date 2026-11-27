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

// Read only installation metadata. The sync process verifies the DLL hashes.
function* registryCandidates(query) {
  for (const hive of ['HKCU', 'HKLM']) {
    const key = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Trae CN.exe`;
    const exe = query(['query', key, '/ve']).match(/REG_SZ\s+"?([^"\r\n]+?\.exe)"?\s*$/im)?.[1];
    if (exe && path.isAbsolute(exe)) yield path.join(path.dirname(exe), 'resources/app');
  }

  for (const hive of ['HKCU', 'HKLM']) {
    for (const base of [
      'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ]) {
      // Search results only contain matching values. Read the matched key
      // separately for paths that need not contain the product name.
      const output = query(['query', `${hive}\\${base}`, '/s', '/f', 'TRAE CN', '/d']);
      for (const block of output.split(/\r?\n(?=HKEY_)/)) {
        const key = block.match(/^HKEY_[^\r\n]+/m)?.[0];
        if (!key || !/^[ \t]+DisplayName[ \t]+REG_\w+[ \t]+TRAE CN(?:[ \t]+\([^\r\n]+\))?[ \t]*$/im.test(block)) continue;
        const values = query(['query', key]);
        for (const [, value] of values.matchAll(/^[ \t]+(?:InstallLocation|Inno Setup: App Path)[ \t]+REG_\w+[ \t]+([^\r\n]+)$/gim)) {
          const root = value.trim().replace(/^"|"$/g, '');
          if (path.isAbsolute(root)) yield /resources[\\/]app$/i.test(root) ? root : path.join(root, 'resources/app');
        }
      }
    }
  }
}

export function installation({ platform = process.platform, env = process.env, home = os.homedir(),
  queryRegistry = regOutput } = {}) {
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
      const supported = platform === 'win32'
        ? WINDOWS_VERSIONS.includes(appVersion)
        : platform === 'darwin' && MAC_VERSIONS.includes(appVersion) &&
          macCandidates.some(candidate => path.relative(candidate, app) === '');
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
    for (const candidate of registryCandidates(queryRegistry)) {
      const found = inspect(candidate);
      if (found) return found;
    }
  }
  return manual;
}
