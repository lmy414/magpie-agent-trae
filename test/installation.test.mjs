import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installation } from '../installation.mjs';
import { resolveTraeLayout } from '../trae-paths.mjs';

test('selects native integration for verified Windows versions at any absolute path', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-layout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'Programs/Trae CN/resources/app');
  fs.mkdirSync(app, { recursive: true });
  const setVersion = (directory, appVersion) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'product.json'), JSON.stringify({ appVersion }));
  };
  const win = { platform: 'win32', env: { LOCALAPPDATA: root }, registry: () => undefined, uninstall: () => undefined };
  for (const version of ['3.4.18', '3.4.20', '3.4.24', '3.4.25']) {
    setVersion(app, version);
    assert.deepEqual(installation(win), { platform: 'win32', app, version, mode: 'native' });
  }
  setVersion(app, '3.4.22');
  assert.equal(installation(win).mode, 'manual');
  setVersion(app, '3.4.20');
  const alternate = { ...win, env: {}, registry: () => app };
  assert.deepEqual(installation(alternate), { platform: 'win32', app, version: '3.4.20', mode: 'native' });
  assert.equal(installation({ ...alternate, env: { TRAE_APP: path.join(root, 'missing') } }).app, undefined);
  assert.deepEqual(installation({ ...alternate, env: { TRAE_APP: app } }),
    { platform: 'win32', app, version: '3.4.20', mode: 'native' });
});

test('finds a verified Windows install registered outside the standard path', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-custom-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const custom = path.join(root, 'Games/Trae CN/resources/app');
  fs.mkdirSync(custom, { recursive: true });
  fs.writeFileSync(path.join(custom, 'product.json'), JSON.stringify({ appVersion: '3.4.25' }));
  const win = { platform: 'win32', env: { LOCALAPPDATA: path.join(root, 'empty') },
    registry: () => undefined, uninstall: () => custom };
  assert.deepEqual(installation(win), { platform: 'win32', app: custom, version: '3.4.25', mode: 'native' });
  const unsupported = path.join(root, 'Games/Trae CN/resources/app-unsupported');
  fs.mkdirSync(unsupported, { recursive: true });
  fs.writeFileSync(path.join(unsupported, 'product.json'), JSON.stringify({ appVersion: '3.4.26' }));
  assert.deepEqual(installation({ ...win, uninstall: () => unsupported }),
    { platform: 'win32', app: unsupported, version: '3.4.26', mode: 'manual' });
});

test('macOS selects native integration for a verified 3.4.20 install and manual for other versions', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-mac-layout-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const mac = { platform: 'darwin', env: {}, home };
  const app = path.join(home, 'Applications/Trae CN.app/Contents/Resources/app');
  const setVersion = (directory, appVersion) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'product.json'), JSON.stringify({ appVersion }));
  };
  setVersion(app, '3.4.20');
  const native = { platform: 'darwin', app, version: '3.4.20', mode: 'native' };
  assert.deepEqual(installation(mac), native);
  assert.deepEqual(installation({ ...mac, env: { TRAE_APP: app } }), native);

  for (const name of ['TRAE_APP', 'TRAE_CN_APP_ROOT']) {
    const value = process.env[name];
    delete process.env[name];
    t.after(() => { if (value !== undefined) process.env[name] = value; });
  }
  const layout = resolveTraeLayout({ platform: 'darwin', home });
  assert.equal(layout.app, app);
  assert.equal(layout.deviceType, 'mac');
  assert.equal(layout.sessionFile, path.join(home, 'Library/Application Support/Trae CN/User/globalStorage/storage.json'));
  assert.equal(layout.harness, path.join(app, 'modules/ai-agent/libharness.dylib'));
  assert.equal(layout.legacy, path.join(app, 'modules/ai-agent/libai_agent.dylib'));

  setVersion(app, '3.4.24');
  assert.deepEqual(installation(mac), { ...native, version: '3.4.24', mode: 'manual' });
  setVersion(app, '3.4.25');
  assert.deepEqual(installation(mac), { ...native, version: '3.4.25', mode: 'manual' });
  const moved = path.join(home, 'Moved/Trae CN.app/Contents/Resources/app');
  setVersion(moved, '3.4.20');
  assert.deepEqual(installation({ ...mac, env: { TRAE_APP: moved } }), { ...native, app: moved, mode: 'native' });
});
