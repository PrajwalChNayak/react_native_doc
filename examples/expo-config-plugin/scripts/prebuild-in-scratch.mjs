/**
 * Runs `npx expo prebuild` in a SCRATCH COPY of this project and prints what the
 * config plugin changed in the generated native files.
 *
 * Never run prebuild in a working project to "have a look". In SDK 57 prebuild
 * clears and regenerates ios/ and android/ by default, so any hand edits there
 * are deleted. A scratch copy makes the inspection free.
 *
 *   node scripts/prebuild-in-scratch.mjs            # android (works on any OS)
 *   node scripts/prebuild-in-scratch.mjs ios        # iOS files generate without Xcode;
 *                                                   # pod install is skipped
 *
 * The relevant excerpts are also written to generated-output/ so the result can
 * be read without running anything.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = process.argv[2] === 'ios' ? 'ios' : 'android';

// The Expo CLI itself refuses to prebuild iOS on Windows (see
// @expo/cli build/src/prebuild/resolveOptions.js). Rather than pretend, fall
// back to `expo config --type introspect`, which runs the same config plugin
// mods against an in-memory model of Info.plist without generating a project.
if (platform === 'ios' && process.platform === 'win32') {
  console.log('iOS prebuild is not supported on Windows by the Expo CLI.');
  console.log('Showing the introspected Info.plist instead (the same mods, applied in memory).\n');
  const raw = execFileSync('npx.cmd', ['expo', 'config', '--type', 'introspect', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const config = JSON.parse(raw);
  const infoPlist = config._internal?.modResults?.ios?.infoPlist ?? config.ios?.infoPlist ?? {};
  fs.mkdirSync(path.join(ROOT, 'generated-output'), {recursive: true});
  fs.writeFileSync(
    path.join(ROOT, 'generated-output', 'Info.plist.introspected.json'),
    JSON.stringify(infoPlist, null, 2) + '\n',
  );
  const value = infoPlist.ExampleFeatureFlag;
  console.log(`Info.plist ExampleFeatureFlag = ${JSON.stringify(value)}`);
  process.exit(value === undefined ? 1 : 0);
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-plugin-scratch-'));
const OUT = path.join(ROOT, 'generated-output');

const COPY = ['app.json', 'package.json', 'index.ts', 'App.tsx', 'tsconfig.json', 'plugins', 'assets'];
for (const entry of COPY) {
  fs.cpSync(path.join(ROOT, entry), path.join(scratch, entry), {recursive: true});
}
// Reuse the installed dependencies instead of downloading them again.
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(scratch, 'node_modules'), 'junction');

console.log(`Scratch copy: ${scratch}`);
execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'prebuild', '--platform', platform, '--no-install'],
  {cwd: scratch, stdio: 'inherit', shell: process.platform === 'win32', env: {...process.env, CI: '1'}},
);

fs.mkdirSync(OUT, {recursive: true});

if (platform === 'android') {
  const manifestPath = path.join(scratch, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const hit = manifest.split('\n').filter((line) => line.includes('EXAMPLE_FEATURE_FLAG'));
  fs.writeFileSync(path.join(OUT, 'AndroidManifest.xml'), manifest);
  console.log('\nandroid/app/src/main/AndroidManifest.xml — lines added by the plugin:');
  console.log(hit.length ? hit.map((l) => `+ ${l.trim()}`).join('\n') : '(NOT FOUND — the plugin did not apply)');
  process.exitCode = hit.length ? 0 : 1;
} else {
  const plist = fs
    .readdirSync(path.join(scratch, 'ios'), {recursive: true})
    .map(String)
    .find((p) => p.endsWith('Info.plist') && !p.includes('Pods'));
  const text = plist ? fs.readFileSync(path.join(scratch, 'ios', plist), 'utf8') : '';
  fs.writeFileSync(path.join(OUT, 'Info.plist'), text);
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes('<key>ExampleFeatureFlag</key>'));
  console.log(`\nios/${plist ?? '(no Info.plist found)'} — keys added by the plugin:`);
  console.log(i >= 0 ? `+ ${lines[i].trim()}\n+ ${lines[i + 1].trim()}` : '(NOT FOUND — the plugin did not apply)');
  process.exitCode = i >= 0 ? 0 : 1;
}

// On Windows, Gradle and Metro can keep a handle on files in the generated
// project for a moment after prebuild exits, which makes an immediate delete
// fail with EBUSY. Retry, and never let cleanup turn a successful inspection
// into a failure.
try {
  // Remove the node_modules junction on its own FIRST. A recursive delete that
  // walks into a junction can follow it and delete the real node_modules it
  // points at; unlinking the link removes only the link.
  fs.unlinkSync(path.join(scratch, 'node_modules'));
  fs.rmSync(scratch, {recursive: true, force: true, maxRetries: 10, retryDelay: 500});
} catch (error) {
  console.warn(`\n(Could not remove the scratch copy at ${scratch}: ${error.code}. Delete it by hand.)`);
}
