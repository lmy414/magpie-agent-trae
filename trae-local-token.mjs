import fs from 'node:fs';
import path from 'node:path';
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { LOCAL_TOKEN } from './bridge.mjs';
import { resolveTraeLayout } from './trae-paths.mjs';

const SOURCE_MARKER = Buffer.from('apps\\icube_server_rs\\crates\\llm-client\\src\\crypto\\crypto.rs');
const HARNESS_MARKER = Buffer.from('key too shortrandom too short');
// The macOS dylibs carry no backslash path, so the panic text of the same
// source file locates the material instead. Each marker sits beside the same
// 94-character hex run (64 hex key + 10-digit AAD + 20 hex salt).
const DARWIN_HARNESS_MARKER = Buffer.from('random too short');
const DARWIN_LEGACY_MARKER = Buffer.from('ciphertext too short');
const VERIFIED_BUILDS = {
  '3.4.18': {
    harness: '11b4c76ac34c31a93a5bf4992444e4c406cfd293dcefd89a73d11801841dcb48',
    legacy: '62f6a4e43c778a8114d0b77073d8425c9bd855ffeb815ba1946d0357c133448d',
  },
  '3.4.20': {
    harness: 'b6ba131bd7aa2286313be04fbdc3ba02ede98496c88e227d5f627c806569044d',
    legacy: '522dade20f33bf10c77fdadef7e1fff90755c461b4eb52c5ebbfee000f485677',
  },
  '3.4.24': {
    harness: '1d5897c2d6ca88c9a7968f49d91af73b41b38812f4f2fd7f31e7d1d64a1b58ce',
    legacy: '72c7c2f463bf0bd76550b0e2cfe61e63de90959a5ab740b99d97d1dfe8b6d24c',
  },
  '3.4.20-darwin': {
    harness: '5fb006899278fc9541f1df966762372b413d5b799dab55cdb0dd89e535bfdb37',
    legacy: 'e819bda4c750dd4d42127ba853e8a2902f18159a876ce67daaab8c8834abbb67',
  },
};
let cachedProfile;

// Vendor codec constants stay in the installed client. Scan with bounded memory;
// neither the package nor the credential cache contains its AES key.
// before reads the material ahead of the marker (Windows); skip is how many
// bytes past the marker to start (macOS), with length the run to take. Either
// way the candidate must occur exactly once.
function inspect(file, marker, { before = 0, skip = 0, length } = {}) {
  const fd = fs.openSync(file, 'r'), hash = createHash('sha256');
  const chunk = Buffer.alloc(1024 * 1024), candidates = [];
  const span = length || before;
  let tail = Buffer.alloc(0), total = 0;
  try {
    let count;
    while ((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      const current = chunk.subarray(0, count); hash.update(current);
      const window = Buffer.concat([tail, current]);
      let at = -1;
      while ((at = window.indexOf(marker, at + 1)) >= 0) {
        if (before) {
          if (at >= before) candidates.push(Buffer.from(window.subarray(at - before, at)));
        } else {
          const start = at + marker.length + skip;
          // The material has to sit whole in this window; a hit split across
          // chunks is rescanned by the next window, which carries the tail.
          if (start + span <= window.length) candidates.push(Buffer.from(window.subarray(start, start + span)));
        }
      }
      total += count;
      tail = Buffer.from(window.subarray(-(marker.length + skip + span + 64)));
    }
  } finally { fs.closeSync(fd); }
  if (candidates.length !== 1) throw new Error('trae_credential_profile_unknown');
  return { prefix: candidates[0], digest: hash.digest('hex') };
}

/**
 * deriveDarwinMaterial turns the 94-character run found in the dylibs into the
 * AES-256-GCM key and AAD the client uses. The layout matches Windows:
 * [64 hex key][10-digit AAD][20 hex salt], and the key's first 8 bytes are
 * XORed with the salt's first 8 bytes to give the key actually in use.
 */
function deriveDarwinMaterial(material) {
  const text = material.toString('ascii');
  if (!/^[0-9a-f]{64}[0-9]{10}[0-9a-f]{20}$/.test(text)) throw new Error('trae_credential_profile_unknown');
  const key = Buffer.from(text.slice(0, 64), 'hex'), salt = Buffer.from(text.slice(74, 94), 'hex');
  for (let i = 0; i < 8; i++) key[i] ^= salt[i];
  salt.fill(0);
  return { key, aad: Buffer.from(text.slice(64, 74)) };
}

/**
 * readNativeCredentialProfile reads the material Trae's native encryption uses
 * and checks the client build against the verified list. Windows locates it by
 * the DLL path marker plus an 84/94-character prefix; macOS by the panic text
 * in the dylib plus the 94 characters after it. The result is cached by file
 * size and mtime, so a Trae upgrade drops it and it is read again.
 */
export function readNativeCredentialProfile({ local = process.env.LOCALAPPDATA, platform, home, roaming, app: appOverride } = {}) {
  const layout = resolveTraeLayout({ platform, home, roaming, local, app: appOverride });
  const version = JSON.parse(fs.readFileSync(layout.product, 'utf8')).appVersion;
  const key = layout.platform === 'darwin' ? `${version}-darwin` : version;
  const build = Object.hasOwn(VERIFIED_BUILDS, key) ? VERIFIED_BUILDS[key] : null;
  if (!build) throw new Error('trae_credential_version_unsupported');
  const files = [layout.harness, layout.legacy];
  const identity = key + '|' + files.map(file => { const s = fs.statSync(file); return `${file}:${s.size}:${s.mtimeMs}`; }).join('|');
  if (cachedProfile?.identity === identity) return cachedProfile;
  const harness = layout.platform === 'darwin'
    ? inspect(files[0], DARWIN_HARNESS_MARKER, { skip: 8, length: 94 })
    : inspect(files[0], HARNESS_MARKER, { before: 84 });
  const legacy = layout.platform === 'darwin'
    ? inspect(files[1], DARWIN_LEGACY_MARKER, { before: 94 })
    : inspect(files[1], SOURCE_MARKER, { before: 94 });
  if (harness.digest !== build.harness || legacy.digest !== build.legacy) throw new Error('trae_credential_build_unsupported');
  if (layout.platform === 'darwin') {
    // Both dylibs embed the same run on macOS; comparing them catches a
    // candidate read off by a byte.
    if (harness.prefix.subarray(0, 94).toString('ascii') !== legacy.prefix.toString('ascii')) throw new Error('trae_credential_profile_unknown');
    const { key: materialKey, aad } = deriveDarwinMaterial(legacy.prefix);
    cachedProfile = { identity, id: `trae-cn-${version}-darwin:${harness.digest}`, key: materialKey, aad };
    console.log(`Trae credential: darwin profile ${version} verified (${harness.digest.slice(0, 12)})`);
    return cachedProfile;
  }
  const a = legacy.prefix.toString('ascii'), h = harness.prefix.toString('ascii');
  if (!/^[0-9a-f]{84}$/.test(h) || !/^[0-9a-f]{64}[0-9]{10}[0-9a-f]{20}$/.test(a) ||
      a.slice(0, 64) !== h.slice(0, 64) || a.slice(74) !== h.slice(64)) throw new Error('trae_credential_profile_unknown');
  const keyBytes = Buffer.from(h.slice(0, 64), 'hex'), salt = Buffer.from(h.slice(64), 'hex');
  for (let i = 0; i < 8; i++) keyBytes[i] ^= salt[i];
  salt.fill(0);
  cachedProfile = { identity, id: `trae-cn-${version}:${harness.digest}`, key: keyBytes, aad: Buffer.from(a.slice(64, 74)) };
  return cachedProfile;
}

export function encodeCredential(value, profile, nonce = randomBytes(12)) {
  if (typeof value !== 'string' || nonce.length !== 12) throw new Error('trae_credential_input_invalid');
  const cipher = createCipheriv('aes-256-gcm', profile.key, nonce);
  cipher.setAAD(profile.aad);
  return Buffer.concat([nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64');
}

export function decodeCredential(value, profile) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('trae_credential_invalid');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 28 || bytes.toString('base64') !== value) throw new Error('trae_credential_invalid');
  try {
    const decipher = createDecipheriv('aes-256-gcm', profile.key, bytes.subarray(0, 12));
    decipher.setAAD(profile.aad); decipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8');
  } catch { throw new Error('trae_credential_invalid'); }
}

export function localCredential(file, { profile = readNativeCredentialProfile() } = {}) {
  let stored;
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('trae_credential_cache_unreadable'); }
  if (stored?.version === 1 && stored.profile === profile.id && decodeCredential(stored.ak, profile) === LOCAL_TOKEN) return stored.ak;
  const ak = encodeCredential(LOCAL_TOKEN, profile);
  if (decodeCredential(ak, profile) !== LOCAL_TOKEN) throw new Error('trae_credential_self_check_failed');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, profile: profile.id, ak }, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
  return ak;
}
