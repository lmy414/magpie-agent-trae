import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveTraeLayout } from './trae-paths.mjs';

export const MAIN_SHA256 = '6540f065068c73e9a76f63c92283abedab234d69ea0779996ff7098e4b21bf2a';
const VERIFIED_MAIN = {
  '3.4.18': MAIN_SHA256,
  '3.4.20': '433e32bd7821ab4b05e46be1fc1b74043315884ba3ec58c45c99d94f58fd6816',
  // macOS 3.4.20（Trae CN 3.4.20 / tron 2.3.103559，out/main.js 3.2 MB）
  '3.4.20-darwin': '41cc73aee287861ea830c2ca67cbb38dc374a76c383cd20670a00462edb3b4f8',
};
export const LOADER = '\n// Magpie model catalog refresh (reversible, Trae CN 3.4.18).\nimport("./magpie-model-refresh.cjs").then(m=>m.default.startNotifier()).catch(()=>{});\n';
export const loaderFor = version => LOADER.replace('3.4.18', version);
const sha = value => createHash('sha256').update(value).digest('hex');

function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, content, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

/**
 * installClientRefresh installs or withdraws the catalog-refresh loader in the
 * Trae client. resolveTraeLayout gives the folder and the platform (macOS is an
 * absolute path under /Applications); out/main.js is hash-checked against the
 * verified list before it is touched, and its original is backed up so the
 * change can be undone exactly.
 */
export function installClientRefresh({ local = process.env.LOCALAPPDATA, home = os.homedir(),
  platform, roaming, app: appOverride, expectedHash, restore = false } = {}) {
  const layout = resolveTraeLayout({ platform, home, roaming, local, app: appOverride });
  if (layout.platform === 'darwin') return { state: 'not_needed', platform: 'darwin' };
  const app = layout.app;
  const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
  const version = product.appVersion;
  const build = layout.platform === 'darwin' ? `${version}-darwin` : version;
  if (!Object.hasOwn(VERIFIED_MAIN, build)) throw new Error('trae_client_refresh_build_unsupported');
  expectedHash ??= VERIFIED_MAIN[build];
  const main = path.join(app, 'out/main.js'), helper = path.join(app, 'out/magpie-model-refresh.cjs');
  const current = fs.readFileSync(main, 'utf8');
  const existingLoader = Object.keys(VERIFIED_MAIN).map(loaderFor).find(loader => current.endsWith(loader));
  const original = existingLoader ? current.slice(0, -existingLoader.length) : current;
  if (sha(original) !== expectedHash) throw new Error('trae_client_refresh_build_unsupported');
  // A macOS and a Windows build can share a version number, so the backup
  // folder is per build and neither overwrites the other's original.
  const directory = path.join(home, '.config/magpie-trae/client-backups', build);
  fs.mkdirSync(directory, { recursive: true });
  const backup = path.join(directory, 'main.original.js');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, { flag: 'wx' });
  if (sha(fs.readFileSync(backup)) !== expectedHash) throw new Error('trae_client_refresh_backup_invalid');
  if (!restore) {
    const content = fs.readFileSync(new URL('./trae-refresh-notifier.cjs', import.meta.url));
    if (!fs.existsSync(helper) || sha(fs.readFileSync(helper)) !== sha(content)) atomicWrite(helper, content);
  }
  const wanted = restore ? original : original + loaderFor(version);
  if (current !== wanted) atomicWrite(main, wanted);
  if (restore) fs.rmSync(helper, { force: true });
  const result = { state: restore ? 'restored' : 'installed', version: product.appVersion,
    platform: layout.platform, changed: current !== wanted, backup, main, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(result, null, 2));
  console.log(`Trae client refresh: ${result.state} ${layout.platform} ${version} (changed=${result.changed})`);
  return result;
}
