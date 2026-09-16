/**
 * Proves that `EXPO_PUBLIC_*` values are readable in a shipped Expo bundle.
 *
 * This is not an argument, it is a demonstration: it exports the app the way a
 * release build does, then recovers the values out of the emitted Hermes
 * bytecode without running the app.
 *
 *   node scripts/prove-leak.mjs
 *
 * It also checks the negative case — a variable WITHOUT the EXPO_PUBLIC_
 * prefix must NOT appear — because a demonstration that only confirms what you
 * expected is not worth much.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** Values planted in .env. Both fake; neither is a real credential. */
const SHOULD_LEAK = [
  ['EXPO_PUBLIC_API_URL', 'https://api.example.com'],
  ['EXPO_PUBLIC_ANALYTICS_KEY', 'pk_live_NOT_A_REAL_KEY_6f2b9c1d4e'],
];

/** No EXPO_PUBLIC_ prefix, so Metro must not inline it. */
const SHOULD_NOT_LEAK = [['SERVER_ONLY_SECRET', 'sk_live_NOT_A_REAL_SECRET_a1b2c3d4e5']];

function exportApp() {
  console.log('Exporting the app the way a release build does…\n');
  fs.rmSync(DIST, { recursive: true, force: true });
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['expo', 'export', '--platform', 'android', '--output-dir', 'dist'],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  );
}

/** Every emitted JS/bytecode artifact, whatever Metro chose to name it. */
function bundleFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) bundleFiles(full, out);
    else if (/\.(hbc|js|bundle|map)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * The equivalent of running `strings` on the artifact: pull printable ASCII
 * runs out of the bytes. Hermes bytecode is not readable JavaScript, but its
 * string table is plain text — which is the whole point.
 */
function strings(buffer, min = 6) {
  const found = [];
  let current = '';
  for (const byte of buffer) {
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= min) found.push(current);
      current = '';
    }
  }
  if (current.length >= min) found.push(current);
  return found;
}

function main() {
  exportApp();

  const files = bundleFiles(DIST);
  if (!files.length) {
    console.error('\nNo bundle artifacts found under dist/. Did the export fail?');
    process.exit(1);
  }

  console.log(`\nScanning ${files.length} artifact(s):`);
  for (const f of files) {
    const kb = (fs.statSync(f).size / 1024).toFixed(0);
    console.log(`  ${path.relative(ROOT, f)}  (${kb} kB)`);
  }

  // Concatenate the raw bytes and pull printable runs out of them.
  const blobs = files.map((f) => fs.readFileSync(f));
  const haystack = strings(Buffer.concat(blobs)).join('\n');

  let failures = 0;

  console.log('\n--- Values that SHOULD be recoverable (EXPO_PUBLIC_ prefix) ---');
  for (const [name, value] of SHOULD_LEAK) {
    const hit = haystack.includes(value);
    console.log(`  ${hit ? 'FOUND   ' : 'NOT FOUND'} ${name} = ${value}`);
    if (!hit) {
      failures++;
      console.log('    ^ expected this to be recoverable; the demonstration did not reproduce.');
    }
  }

  console.log('\n--- Value that should NOT be in the bundle (no prefix) ---');
  for (const [name, value] of SHOULD_NOT_LEAK) {
    const hit = haystack.includes(value);
    console.log(`  ${hit ? 'FOUND   ' : 'ABSENT  '} ${name}`);
    if (hit) {
      failures++;
      console.log('    ^ this should never have been inlined. Something is wrong.');
    }
  }

  console.log(
    '\nConclusion: anything prefixed EXPO_PUBLIC_ is a string constant in the\n' +
      'shipped binary. Hermes bytecode is not readable JavaScript, but it does not\n' +
      'hide string literals. Treat these as public values, because they are.\n' +
      '\nThe fix is not a different variable name. Secrets stay server-side and the\n' +
      'client receives short-lived tokens it can safely hold.',
  );

  process.exit(failures ? 1 : 0);
}

main();
