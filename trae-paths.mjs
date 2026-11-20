import os from 'node:os';
import path from 'node:path';

// Trae CN keeps its install, its user data and its native modules in different
// places on Windows and macOS. They are resolved once here so no caller has to
// branch on the platform itself.
// A local (%LOCALAPPDATA%, or a fixture root in tests) means the Windows
// layout, as Trae on macOS is never under such a folder.
// app names .../resources/app directly, for a test or a non-standard install.
export function resolveTraeLayout({ platform, home = os.homedir(), roaming, local, app: appOverride } = {}) {
  const target = platform || (local ? 'win32' : process.platform);
  // macOS: the app is in /Applications, the user data in ~/Library/Application Support.
  if (target === 'darwin') {
    const app = appOverride || process.env.TRAE_CN_APP_ROOT || '/Applications/Trae CN.app/Contents/Resources/app';
    const userData = path.join(home, 'Library/Application Support/Trae CN');
    const modules = path.join(app, 'modules/ai-agent');
    return {
      platform: 'darwin',
      // Trae's own main.js maps darwin to "mac" in the request header, not to
      // "darwin" or "macos".
      deviceType: 'mac',
      app,
      userData,
      sessionFile: path.join(userData, 'User/globalStorage/storage.json'),
      product: path.join(app, 'product.json'),
      modules,
      harness: path.join(modules, 'libharness.dylib'),
      legacy: path.join(modules, 'libai_agent.dylib'),
    };
  }
  // Windows: the %APPDATA%/%LOCALAPPDATA% layout.
  if (!local) throw new Error('trae_installation_unavailable');
  const app = appOverride || path.join(local, 'Programs/Trae CN/resources/app');
  const userData = path.join(roaming || path.join(home, 'AppData/Roaming'), 'Trae CN');
  const modules = path.join(app, 'modules/ai-agent');
  return {
    platform: 'win32',
    deviceType: 'windows',
    app,
    userData,
    sessionFile: path.join(userData, 'User/globalStorage/storage.json'),
    product: path.join(app, 'product.json'),
    modules,
    harness: path.join(modules, 'harness.dll'),
    legacy: path.join(modules, 'ai_agent.dll'),
  };
}
