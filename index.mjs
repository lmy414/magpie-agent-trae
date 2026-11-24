import { startHost } from './bridge.mjs';
import { installation } from './installation.mjs';
import { startModelSync } from './sync.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installClientRefresh } from './client-refresh.mjs';

const instance = Symbol.for('magpie.trae.local.bridge.v1');

export default async function TraeLocalBridge(_input, options = {}) {
  if (!globalThis[instance]) {
    const port = options.port ?? 3498;
    const nativeSync = !options.skipNativeSync && installation().mode === 'native';
    if (nativeSync && process.env.MAGPIE_TRAE_NO_CLIENT_PATCH !== '1') {
      try { installClientRefresh(); }
      catch (e) { console.error(`Trae client refresh: ${/^[a-z_0-9]+$/.test(e.message) ? e.message : 'trae_client_refresh_install_failed'}`); }
    }
    const host = startHost({ port, nativeSync });
    const sync = nativeSync ? startModelSync({ port }) : null;
    globalThis[instance] = { host, sync };
    await host.ready;
    if (nativeSync) process.once('exit', () => {
      const worker = spawn(process.execPath, [fileURLToPath(new URL('./restore.mjs', import.meta.url)), String(port)],
        { windowsHide: true, detached: true, stdio: 'ignore', env: process.env });
      worker.unref();
    });
  }
  return {};
}
