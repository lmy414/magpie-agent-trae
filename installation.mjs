import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

// Read only public installation metadata. Native integration has separate build checks.
function registryApp() {
  for (const hive of ['HKCU', 'HKLM']) {
    try {
      const key = hive + '\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Trae CN.exe';
      const output = execFileSync('reg.exe', ['query', key, '/ve'], {
        encoding: 'utf8', windowsHide: true, timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const exe = output.match(/REG_SZ\s+"?([^"\r\n]+?\.exe)"?\s*$/im)?.[1];
      if (exe && path.isAbsolute(exe)) return path.join(path.dirname(exe), 'resources/app');
    } catch { /* The installer may have registered the other hive. */ }
  }
}

export function installation({ platform = process.platform, env = process.env, home = os.homedir(), registry = registryApp } = {}) {
  const manual = { mode: 'manual', platform };
  const standard = platform === 'win32' && env.LOCALAPPDATA
    ? path.resolve(env.LOCALAPPDATA, 'Programs/Trae CN/resources/app') : undefined;
  const macCandidates = [path.join(home, 'Applications/Trae CN.app/Contents/Resources/app'), '/Applications/Trae CN.app/Contents/Resources/app'];
  const candidates = platform === 'darwin'
    ? macCandidates
    : [standard, env.ProgramFiles && path.join(env.ProgramFiles, 'Trae CN/resources/app')];
  function inspect(app) {
    if (!app || !path.isAbsolute(app)) return;
    try {
      const { appVersion } = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
      if (typeof appVersion !== 'string' || !appVersion) return;
      const native = platform === 'darwin'
        ? appVersion === '3.4.20' && macCandidates.some(candidate => path.relative(candidate, app) === '')
        : standard && path.relative(standard, app) === '' && ['3.4.18', '3.4.20', '3.4.24'].includes(appVersion);
      return { platform, mode: native ? 'native' : 'manual', app: path.resolve(app), version: appVersion };
    } catch { /* An installation may have been moved or removed. */ }
  }
  const override = env.TRAE_APP || (platform === 'darwin' && env.TRAE_CN_APP_ROOT);
  if (override) return inspect(override) ?? manual;
  for (const candidate of candidates) {
    const found = inspect(candidate);
    if (found) return found;
  }
  return (platform === 'win32' && inspect(registry())) || manual;
}
