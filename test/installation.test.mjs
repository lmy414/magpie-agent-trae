import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installation } from '../installation.mjs';

test('selects the integration from public product metadata and the actual installation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-layout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'Programs/Trae CN/resources/app');
  fs.mkdirSync(app, { recursive: true });
  const setVersion = appVersion => fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ appVersion }));
  const win = { platform: 'win32', env: { LOCALAPPDATA: root }, registry: () => undefined };
  setVersion('3.4.20');
  assert.equal(installation(win).mode, 'native');
  setVersion('3.4.22');
  assert.equal(installation(win).mode, 'manual');
  const alternate = { ...win, env: {}, registry: () => app };
  assert.equal(installation(alternate).app, app);
  assert.equal(installation({ ...alternate, env: { TRAE_APP: path.join(root, 'missing') } }).app, undefined);
  const mac = { platform: 'darwin', env: { TRAE_APP: app }, home: root };
  setVersion('3.4.20');
  assert.equal(installation(mac).mode, 'manual');
  assert.equal(installation(mac).version, '3.4.20');
});
