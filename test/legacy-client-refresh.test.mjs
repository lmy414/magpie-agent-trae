import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreLegacyClientRefresh } from '../legacy-client-refresh.mjs';

const oldLoader = version => `\n// Magpie model catalog refresh (reversible, Trae CN ${version}).\n` +
  'import("./magpie-model-refresh.cjs").then(m=>m.default.startNotifier()).catch(()=>{});\n';

function fixture(t) {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'trae-legacy-cleanup-'));
  t.after(() => fs.rmSync(local, { recursive: true, force: true }));
  const out = path.join(local, 'Programs/Trae CN/resources/app/out');
  fs.mkdirSync(out, { recursive: true });
  return { local, out, main: path.join(out, 'main.js'), helper: path.join(out, 'magpie-model-refresh.cjs') };
}

test('legacy cleanup restores exact original bytes for both old Windows loaders', t => {
  const { local, out, main, helper } = fixture(t);
  const original = Buffer.from('/* native fixture */\r\n\uFEFF');
  const restore = () => restoreLegacyClientRefresh({ platform: 'win32', local });
  for (const version of ['3.4.18', '3.4.20']) {
    fs.writeFileSync(main, Buffer.concat([original, Buffer.from(oldLoader(version))]));
    fs.writeFileSync(helper, 'fixture helper');
    assert.deepEqual(restore(), { state: 'restored', platform: 'win32' });
    assert.deepEqual(fs.readFileSync(main), original);
    assert.deepEqual(fs.readdirSync(out), ['main.js']);
    assert.deepEqual(restore(), { state: 'not_needed', platform: 'win32' });
  }
});

test('legacy cleanup leaves a nonterminal loader untouched and removes an orphaned helper', t => {
  const { local, main, helper } = fixture(t);
  const nonterminal = '/* fixture */' + oldLoader('3.4.20') + '/* another edit */\n';
  fs.writeFileSync(main, nonterminal);
  const restore = () => restoreLegacyClientRefresh({ platform: 'win32', local });
  assert.equal(restore().state, 'not_needed');
  assert.equal(fs.readFileSync(main, 'utf8'), nonterminal);
  fs.unlinkSync(main);
  fs.writeFileSync(helper, 'fixture helper');
  assert.equal(restore().state, 'restored');
  assert.equal(fs.existsSync(helper), false);
  assert.equal(fs.existsSync(main), false);
});

test('legacy cleanup returns not_needed on macOS and leaves files untouched', t => {
  const { local, main, helper } = fixture(t);
  const contents = '/* fixture */' + oldLoader('3.4.20');
  fs.writeFileSync(main, contents);
  fs.writeFileSync(helper, 'fixture helper');
  assert.deepEqual(restoreLegacyClientRefresh({ platform: 'darwin', local }), { state: 'not_needed', platform: 'darwin' });
  assert.equal(fs.readFileSync(main, 'utf8'), contents);
  assert.equal(fs.readFileSync(helper, 'utf8'), 'fixture helper');
});
