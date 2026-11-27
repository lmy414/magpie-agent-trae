import { startHost } from './bridge.mjs';
import { installation } from './installation.mjs';
import { startModelSync } from './sync.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const instance = Symbol.for('magpie.trae.local.bridge.v1');

export default async function TraeLocalBridge(_input, options = {}) {
  if (!globalThis[instance]) {
    const port = options.port ?? 3498;
    const client = options.skipNativeSync ? null : installation();
    const nativeSync = client?.mode === 'native';
    const host = startHost({ port, nativeSync });
    const sync = nativeSync ? startModelSync({ port, app: client.app }) : null;
    globalThis[instance] = { host, sync };
    await host.ready;
    if (nativeSync) process.once('exit', () => {
      const script = fileURLToPath(new URL('./restore.mjs', import.meta.url));
      const worker = spawn(process.execPath, [script, String(port), client.app],
        { windowsHide: true, detached: true, stdio: 'ignore', env: process.env });
      worker.unref();
    });
  }
  return {};
}
