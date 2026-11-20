import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import notifier from '../trae-refresh-notifier.cjs';
import { installClientRefresh, LOADER, loaderFor } from '../client-refresh.mjs';
import { resolveTraeLayout } from '../trae-paths.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-refresh-test-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('notifier refreshes all local editor windows once per revision, including disconnect', t => {
  const directory = fixture(t), app = new EventEmitter(), sent = [];
  const window = id => ({ id, isDestroyed: () => false, isLoadingMainFrame: () => false,
    getURL: () => 'vscode-file://vscode-app/fixture.html', send: (...args) => sent.push({ id, args }) });
  const windows = [window(1), window(2), { ...window(3), getURL: () => 'https://example.com' }];
  const write = (revision, state = 'synced') => fs.writeFileSync(path.join(directory, 'sync-status.json'), JSON.stringify({ revision, state }));
  write('a'.repeat(64));
  const service = notifier.startNotifier({ directory, electron: { app, webContents: { getAllWebContents: () => windows } } });
  t.after(() => service.stop());
  assert.equal(sent.length, 2); service.tick(); assert.equal(sent.length, 2);
  write('b'.repeat(64), 'pending'); service.tick(); assert.equal(sent.length, 2);
  write('b'.repeat(64), 'disconnected'); service.tick(); assert.equal(sent.length, 4);
  assert.ok(sent.every(s => s.args[0] === notifier.CHANNEL));
  windows.push(window(4)); service.tick(); assert.equal(sent.length, 5);
  app.emit('will-quit'); write('c'.repeat(64)); service.tick(); assert.equal(sent.length, 5);
});

test('client installation is hash guarded, idempotent and exactly reversible', t => {
  const root = fixture(t), app = path.join(root, 'Programs/Trae CN/resources/app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), '{"appVersion":"3.4.18"}');
  const main = path.join(app, 'out/main.js'), original = '/* native fixture */\n';
  fs.writeFileSync(main, original);
  const options = { local: root, home: root, expectedHash: createHash('sha256').update(original).digest('hex') };
  assert.equal(installClientRefresh(options).changed, true);
  assert.equal(fs.readFileSync(main, 'utf8'), original + LOADER);
  assert.equal(installClientRefresh(options).changed, false);
  installClientRefresh({ ...options, restore: true }); assert.equal(fs.readFileSync(main, 'utf8'), original);
  fs.writeFileSync(main, 'other build');
  assert.throws(() => installClientRefresh(options), /build_unsupported/);
  assert.equal(fs.readFileSync(main, 'utf8'), 'other build');
});

test('an upgrade keeps separate backups and restores the new original', t => {
  const root = fixture(t), app = path.join(root, 'Programs/Trae CN/resources/app');
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  const main = path.join(app, 'out/main.js');
  const original18 = '/* native 3.4.18 fixture */\n', original20 = '/* native 3.4.20 fixture */\n';
  for (const [version, original] of [['3.4.18', original18], ['3.4.20', original20]]) {
    fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ appVersion: version }));
    fs.writeFileSync(main, original);
    const options = { local: root, home: root, expectedHash: createHash('sha256').update(original).digest('hex') };
    const result = installClientRefresh(options);
    assert.equal(result.version, version);
    assert.equal(fs.readFileSync(main, 'utf8'), original + loaderFor(version));
    assert.equal(installClientRefresh(options).changed, false);
    if (version === '3.4.20') {
      installClientRefresh({ ...options, restore: true });
      assert.equal(fs.readFileSync(main, 'utf8'), original20);
    }
  }
  for (const [version, original] of [['3.4.18', original18], ['3.4.20', original20]]) {
    assert.equal(fs.readFileSync(path.join(root, '.config/magpie-trae/client-backups', version, 'main.original.js'), 'utf8'), original);
  }
  // A version string alone must never authorize a different client file.
  fs.writeFileSync(main, 'unverified 3.4.20 build');
  assert.throws(() => installClientRefresh({ local: root, home: root }), /build_unsupported/);
  assert.equal(fs.readFileSync(main, 'utf8'), 'unverified 3.4.20 build');
});

test('darwin layout keeps the app bundle untouched and resolves the dylib paths', t => {
  const root = fixture(t);
  const app = path.join(root, 'Trae CN.app/Contents/Resources/app');
  fs.mkdirSync(path.join(app, 'modules/ai-agent'), { recursive: true });
  fs.mkdirSync(path.join(app, 'out'), { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), '{"appVersion":"3.4.20"}');
  const original = '/* darwin fixture */\n';
  fs.writeFileSync(path.join(app, 'out/main.js'), original);
  const layout = resolveTraeLayout({ platform: 'darwin', home: root, app });
  assert.equal(layout.platform, 'darwin');
  assert.equal(layout.deviceType, 'mac');
  assert.equal(layout.sessionFile, path.join(root, 'Library/Application Support/Trae CN/User/globalStorage/storage.json'));
  assert.equal(layout.harness, path.join(app, 'modules/ai-agent/libharness.dylib'));
  assert.equal(layout.legacy, path.join(app, 'modules/ai-agent/libai_agent.dylib'));
  // 一个未被白名单收录的 darwin 构建必须被拒绝，且不能留下任何改动。
  assert.throws(() => installClientRefresh({ platform: 'darwin', home: root, app }), /build_unsupported/);
  assert.equal(fs.readFileSync(path.join(app, 'out/main.js'), 'utf8'), original);
  assert.equal(fs.existsSync(path.join(app, 'out/magpie-model-refresh.cjs')), false);
});

test('wantsClientRefresh keeps the darwin client untouched unless overridden', async () => {
  const { wantsClientRefresh } = await import('../index.mjs');
  assert.equal(wantsClientRefresh({}), process.platform !== 'darwin');
  assert.equal(wantsClientRefresh({ installClientRefresh: true }), true);
  assert.equal(wantsClientRefresh({ installClientRefresh: false }), false);
});
