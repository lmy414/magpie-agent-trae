import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveTraeLayout } from './trae-paths.mjs';

// Only the exact suffixes installed by 0.3.x on Windows are removable.
const OLD_LOADERS = ['3.4.18', '3.4.20'].map(version => Buffer.from(
  `\n// Magpie model catalog refresh (reversible, Trae CN ${version}).\n` +
  'import("./magpie-model-refresh.cjs").then(m=>m.default.startNotifier()).catch(()=>{});\n',
));

function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function restoreLegacyClientRefresh({ platform = process.platform, local = process.env.LOCALAPPDATA } = {}) {
  if (platform !== 'win32' || !local) return { state: 'not_needed', platform };
  const { app } = resolveTraeLayout({ platform, local });
  const main = path.join(app, 'out/main.js');
  const helper = path.join(app, 'out/magpie-model-refresh.cjs');
  let current;
  try { current = fs.readFileSync(main); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const loader = current && OLD_LOADERS.find(suffix => current.subarray(-suffix.length).equals(suffix));
  if (loader) atomicWrite(main, current.subarray(0, -loader.length));
  let removedHelper = false;
  try {
    fs.unlinkSync(helper);
    removedHelper = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { state: loader || removedHelper ? 'restored' : 'not_needed', platform };
}
