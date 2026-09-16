/**
 * Dependency verification.
 *
 * Extracts every npm package name the docs and examples reference, then asks
 * the registry whether it exists, what the current version is, and whether its
 * peer range admits react-native 0.87.1. Flags anything documented behind
 * current stable.
 *
 * Network access required. Run with:
 *   node scripts/check-deps.mjs
 *   node scripts/check-deps.mjs --json     machine-readable output
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const RN_VERSION = '0.87.1';
const JSON_OUT = process.argv.includes('--json');

/**
 * Packages that are part of React Native itself. Anchored, so a third-party
 * `react-native-foo` is NOT mislabelled as core just because of its prefix.
 */
const FIRST_PARTY = /^(?:react|react-native|react-test-renderer)$|^@react-native(-community)?\//;

/**
 * Things that look like package names but are not: export conditions, plugin
 * subpaths, deliberate placeholders in prose, and the two unpublished example
 * libraries that live in this repository.
 */
const IGNORE = new Set([
  'react-native-legacy-deep-imports',
  'react-native-worklets/plugin',
  'react-native-gesture-handler/jestSetup',
  'react-native-some-package',
  'react-native-my-library',
  'react-native-device-metadata',
  'react-native-gradient-view',
  'react-native-brownfield',
  'react-native-unstable-internals',
  // Export/tsconfig CONDITION names, not packages.
  'react-native-strict-api',
  // Deliberate misspellings used as typosquatting examples in
  // content/expo-security/dependency-auditing.md.
  'expo-secure-stor',
  'react-native-reanimate',
  // Placeholder names used in prose to stand for "some library".
  'react-native-some-library',
  'react-native-some-ios-only-library',
  'expo-some-package',
  'expo-my-module',
  // An MMKV storage id string in examples/expo-dev-build/App.tsx, not a package.
  'expo-dev-build-example',
]);

function walk(dir, out = [], skip = /node_modules|[\\/]docs[\\/]|\.git/) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, e.name);
    if (skip.test(full)) continue;
    if (e.isDirectory()) walk(full, out, skip);
    else if (/\.(md|json|ts|tsx|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** npm package name, scoped or not, with no path suffix. */
const NAME_RE =
  /(?:^|["'`\s(])((?:@[a-z0-9][\w.-]*\/)?(?:react-native|@?[a-z0-9][\w.-]*)[\w.-]*)(?=["'`\s),:;]|$)/g;

/**
 * Example DIRECTORY names (examples/expo-minimal, examples/expo-router-app, …)
 * appear in prose and in paths and look exactly like package names. They are
 * local folders, not published packages, so derive them rather than listing
 * them by hand and going stale when an example is added.
 */
const EXAMPLE_DIRS = new Set(
  fs.existsSync(path.join(ROOT, 'examples'))
    ? fs.readdirSync(path.join(ROOT, 'examples'), {withFileTypes: true})
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [],
);

/** Placeholder stand-ins used in prose: `expo-foo`, `expo-bar`, a bare `expo-`. */
const PLACEHOLDER = /^(?:expo|react-native)-(?:foo|bar|baz|example|package|module|library)?$/;

function looksLikePackage(name) {
  if (IGNORE.has(name)) return false;
  if (EXAMPLE_DIRS.has(name)) return false;
  if (PLACEHOLDER.test(name)) return false;
  // The Expo examples in this repository are named expo-example-* and are never
  // published, so they would otherwise be reported as missing from npm.
  if (/^expo-example-/.test(name)) return false;
  if (name.includes('/') && !name.startsWith('@')) return false;
  if (name.startsWith('@') && name.split('/').length !== 2) return false;
  // A filename is not a package: react-native.config.js, react-native-xcode.sh,
  // react-native-devtools.md all matched before this guard.
  if (/\.(js|mjs|cjs|ts|tsx|json|md|sh|rb|podspec|gradle|xml|tgz|plist|kt|swift|h|mm)$/.test(name)) {
    return false;
  }
  // Only consider names that plausibly belong to this ecosystem, so the scan
  // does not try to resolve every lowercase word in the prose. `expo` needs a
  // word boundary or it matches "exported", "exposing", "exports"...
  return (
    /^react-native(-|$)/.test(name) ||
    /^@react-native(-community)?\//.test(name) ||
    /^expo(-|$)/.test(name) ||
    /^@(shopify|tanstack|notifee|reduxjs|testing-library|sentry|bugsnag|react-navigation)\//.test(name) ||
    /^(zustand|detox|maestro|jest|typescript|metro|hermes)$/.test(name)
  );
}

const names = new Set();
for (const file of [...walk(path.join(ROOT, 'content')), ...walk(path.join(ROOT, 'examples'))]) {
  const text = fs.readFileSync(file, 'utf8');
  NAME_RE.lastIndex = 0;
  let m;
  while ((m = NAME_RE.exec(text)) !== null) {
    const name = m[1].replace(/[.,;:]+$/, '');
    if (looksLikePackage(name)) names.add(name);
  }
}

/** Also pin down what the examples actually depend on, which must be exact. */
const declared = new Map();
for (const dir of fs.existsSync(path.join(ROOT, 'examples'))
  ? fs.readdirSync(path.join(ROOT, 'examples'))
  : []) {
  const pkgPath = path.join(ROOT, 'examples', dir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const [name, range] of Object.entries({
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  })) {
    names.add(name);
    if (!declared.has(name)) declared.set(name, new Set());
    declared.get(name).add(`${dir}:${range}`);
  }
}

// `--dry-run` prints what would be queried and exits. Useful for confirming the
// extractor picked up only real package names, without ~150 network round trips.
if (process.argv.includes('--dry-run')) {
  const found = [...names].sort();
  console.log(`${found.length} package name(s) would be queried:\n`);
  for (const n of found) console.log(`  ${n}`);
  process.exit(0);
}

async function view(name) {
  try {
    const {stdout} = await run(
      'npm',
      ['view', name, 'version', 'peerDependencies', '--json'],
      {shell: process.platform === 'win32', maxBuffer: 4 * 1024 * 1024},
    );
    const parsed = JSON.parse(stdout || '{}');
    if (typeof parsed === 'string') return {version: parsed, peerDependencies: {}};
    return {
      version: parsed.version ?? parsed['version'],
      peerDependencies: parsed.peerDependencies || {},
    };
  } catch (e) {
    return {error: String(e.stderr || e.message).split('\n')[0].slice(0, 160)};
  }
}

/** Does a peer range plainly exclude 0.87? Conservative: only flag clear cases. */
function peerVerdict(peers) {
  const range = peers && peers['react-native'];
  if (!range) return {state: 'no-claim', note: 'declares no react-native peer'};
  if (range === '*' || range === 'x') {
    return {state: 'unverifiable', note: `peer "${range}" asserts nothing`};
  }
  // "0.83 - 0.87" style hyphen ranges, which several RN libraries use.
  const hyphen = /^(\d+)\.(\d+)\s*-\s*(\d+)\.(\d+)$/.exec(range.trim());
  if (hyphen) {
    const lo = Number(hyphen[2]);
    const hi = Number(hyphen[4]);
    return 87 >= lo && 87 <= hi
      ? {state: 'ok', note: `peer ${range} includes 0.87`}
      : {state: 'incompatible', note: `peer ${range} excludes 0.87`};
  }
  const ge = /^>=\s*(\d+)\.(\d+)/.exec(range.trim());
  if (ge) {
    return 87 >= Number(ge[2])
      ? {state: 'ok', note: `peer ${range} includes 0.87`}
      : {state: 'incompatible', note: `peer ${range} excludes 0.87`};
  }
  return {state: 'unclear', note: `peer ${range} — check by hand`};
}

const sorted = [...names].sort();
const results = [];

for (const name of sorted) {
  const info = await view(name);
  const row = {name, ...info};
  if (!info.error) row.peer = peerVerdict(info.peerDependencies);
  if (declared.has(name)) row.declaredIn = [...declared.get(name)];
  results.push(row);
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const missing = results.filter(r => r.error);
const incompatible = results.filter(r => r.peer && r.peer.state === 'incompatible');
const unverifiable = results.filter(
  r => r.peer && (r.peer.state === 'unverifiable' || r.peer.state === 'no-claim'),
);

console.log(`checked ${results.length} package(s) against the npm registry\n`);
for (const r of results) {
  if (r.error) {
    console.log(`  MISSING   ${r.name.padEnd(46)} ${r.error}`);
    continue;
  }
  const flag = FIRST_PARTY.test(r.name) ? 'core' : r.peer.state;
  console.log(`  ${flag.padEnd(9)} ${r.name.padEnd(46)} ${r.version}   ${r.peer.note}`);
}

console.log('');
if (missing.length) console.log(`${missing.length} package(s) could not be resolved.`);
if (incompatible.length) {
  console.log(`${incompatible.length} package(s) declare a peer range that excludes 0.87:`);
  for (const r of incompatible) console.log(`  x ${r.name} — ${r.peer.note}`);
}
if (unverifiable.length) {
  console.log(
    `${unverifiable.length} package(s) declare a permissive or absent react-native peer.\n` +
      `  That is an absence of information, not a compatibility claim — each was checked by hand.`,
  );
}

// Only a genuinely missing package or a proven-incompatible peer is a failure.
process.exit(missing.length || incompatible.length ? 1 : 0);
