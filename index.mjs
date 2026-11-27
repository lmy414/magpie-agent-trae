import { startHost } from './bridge.mjs';
import { installation } from './installation.mjs';
import { startModelSync } from './sync.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const instance = Symbol.for('magpie.trae.local.bridge.v1');

export default async function TraeLocalBridge(_input, options = {}) {
  if (!globalThis[instance]) {
    const port = options.port ?? 3498;
    const client = installation();
    const nativeSync = !options.skipNativeSync && client.mode === 'native';
    const host = startHost({ port, nativeSync });
    const sync = nativeSync ? startModelSync({ port, app: client.app }) : null;
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
