import { startHost } from './bridge.mjs';
import { startModelSync } from './sync.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installClientRefresh } from './client-refresh.mjs';

const instance = Symbol.for('magpie.trae.local.bridge.v1');

/**
 * wantsClientRefresh says whether the catalog-refresh loader goes into the Trae
 * client. macOS's out/main.js is inside the Developer ID seal, so appending a
 * loader makes codesign report "a sealed resource is missing or invalid"; Trae
 * already refreshes the catalog when the model menu opens, so the loader is
 * installed on Windows only and macOS refreshes itself.
 * options.installClientRefresh overrides it, for a test or for diagnosis.
 */
export function wantsClientRefresh(options = {}) {
  if (typeof options.installClientRefresh === 'boolean') return options.installClientRefresh;
  return process.platform !== 'darwin';
}

export default async function TraeLocalBridge(_input, options = {}) {
  if (!globalThis[instance]) {
    const port = options.port ?? 3498;
    if (!options.skipNativeSync) {
      if (wantsClientRefresh(options)) {
        try { installClientRefresh(); }
        catch (e) { console.error(`Trae client refresh: ${/^[a-z_0-9]+$/.test(e.message) ? e.message : 'trae_client_refresh_install_failed'}`); }
      } else {
        console.log('Trae client refresh: skipped on darwin (opening the model menu refreshes the catalog)');
      }
    }
    const host = startHost({ port });
    const sync = options.skipNativeSync ? null : startModelSync({ port });
    globalThis[instance] = { host, sync };
    await host.ready;
    if (!options.skipNativeSync) process.once('exit', () => {
      const worker = spawn(process.execPath, [fileURLToPath(new URL('./restore.mjs', import.meta.url)), String(port)],
        { windowsHide: true, detached: true, stdio: 'ignore', env: process.env });
      worker.unref();
    });
  }
  return {};
}
