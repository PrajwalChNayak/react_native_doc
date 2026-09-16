/**
 * Type-checks every fenced `ts` / `tsx` block in content/ against the REAL
 * installed types for the toolchain that page documents.
 *
 * The site covers two toolchains on two different React Native versions, so a
 * single harness would give the wrong answer for half the site:
 *
 *   content/<cli sections>/  -> tools/typecheck        react-native 0.87.1
 *                               Strict TypeScript API is the DEFAULT
 *   content/expo-*\/          -> tools/typecheck-expo   expo 57 + RN 0.86.3
 *                               legacy types (expo/tsconfig.base sets
 *                               customConditions: ["react-native"])
 *
 * This is the highest-value check in the project, and it catches the mistake
 * this site is most likely to make: a snippet copied across the toolchain
 * boundary. `ViewInstance` is valid on 0.87 and does not exist on 0.86; a
 * `react-native/Libraries/...` deep import resolves on 0.86 and is a type error
 * on 0.87. Both directions fail loudly here rather than shipping.
 *
 * Blocks tagged `ts-fragment` / `tsx-fragment` are highlighted but skipped,
 * for snippets that genuinely cannot stand alone.
 *
 * Usage:
 *   node scripts/typecheck-blocks.mjs            # every page, both harnesses
 *   node scripts/typecheck-blocks.mjs expo-      # only paths containing "expo-"
 *   node scripts/typecheck-blocks.mjs components # only paths containing "components"
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const CONTENT = path.join(ROOT, 'content');

const filter = process.argv[2] || '';

const HARNESSES = {
  cli: {
    dir: path.join(ROOT, 'tools', 'typecheck'),
    probe: 'react-native',
    label: 'react-native 0.87.1 (Strict API)',
    install: 'cd tools/typecheck && npm install',
    tsconfig: {
      extends: '@react-native/typescript-config',
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        jsx: 'react-jsx',
        module: 'preserve',
        moduleResolution: 'bundler',
        target: 'esnext',
        strict: true,
        types: [],
        // Each block is its own module; without this, two blocks that both
        // declare `styles` at top level would collide.
        isolatedModules: false,
      },
      include: ['blocks'],
    },
  },
  expo: {
    dir: path.join(ROOT, 'tools', 'typecheck-expo'),
    probe: 'expo',
    label: 'expo 57.0.22 + react-native 0.86.3 (SDK 57)',
    install: 'cd tools/typecheck-expo && npm install',
    // Extending expo/tsconfig.base is what makes this match a real Expo
    // project rather than an approximation of one: it sets customConditions to
    // ["react-native"], i.e. the LEGACY type surface an SDK 57 app resolves.
    tsconfig: {
      extends: 'expo/tsconfig.base',
      compilerOptions: {
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        types: [],
        isolatedModules: false,
      },
      include: ['blocks'],
    },
  },
};

/** A page under content/expo-* is an Expo page; everything else is CLI. */
function harnessFor(relPath) {
  return relPath.replace(/\\/g, '/').startsWith('content/expo-') ? 'expo' : 'cli';
}

const RUN_ID = `${(filter || 'all').replace(/[^A-Za-z0-9]/g, '_')}-${process.pid}`;

/* ------------------------------------------------------------- extraction */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const files = walk(CONTENT).filter((f) =>
  filter ? f.replace(/\\/g, '/').includes(filter) : true,
);

/** One record per checkable block, carrying enough to map errors back. */
const blocks = [];

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');

  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const open = /^(\s*)(`{3,})\s*([A-Za-z0-9_-]*)\s*(.*)$/.exec(lines[i]);
    if (!open) {
      i++;
      continue;
    }
    const [, indent, ticks, lang] = open;
    const startLine = i + 1;
    const buf = [];
    i++;
    while (i < lines.length && !new RegExp(`^\\s*\`{${ticks.length},}\\s*$`).test(lines[i])) {
      buf.push(lines[i].startsWith(indent) ? lines[i].slice(indent.length) : lines[i]);
      i++;
    }
    i++;

    const l = lang.toLowerCase();
    if (l !== 'ts' && l !== 'tsx') continue;

    const code = buf.join('\n');
    if (!code.trim()) continue;

    const id = `${rel.replace(/[^A-Za-z0-9]/g, '_')}__${n++}`;
    blocks.push({ id, rel, startLine, lang: l, code, harness: harnessFor(rel) });
  }
}

if (!blocks.length) {
  console.log('no ts/tsx blocks found');
  process.exit(0);
}

/* ----------------------------------------------------------- run one half */

const byId = new Map(blocks.map((b) => [b.id, b]));
let totalErrors = 0;
let totalFailedBlocks = 0;
const summaries = [];

for (const [key, harness] of Object.entries(HARNESSES)) {
  const mine = blocks.filter((b) => b.harness === key);
  if (!mine.length) continue;

  if (!fs.existsSync(path.join(harness.dir, 'node_modules', harness.probe))) {
    console.error(
      `${harness.probe} is not installed in ${path.relative(ROOT, harness.dir)}.\n` +
        `Run:  ${harness.install}`,
    );
    process.exit(1);
  }

  // Each run gets its own workspace so several authors can type-check
  // different sections at the same time without overwriting each other.
  const work = path.join(harness.dir, '.work', RUN_ID);
  const blocksDir = path.join(work, 'blocks');
  const tsconfigPath = path.join(work, 'tsconfig.json');

  fs.rmSync(blocksDir, { recursive: true, force: true });
  fs.mkdirSync(blocksDir, { recursive: true });

  for (const b of mine) {
    const ext = b.lang === 'tsx' ? '.tsx' : '.ts';
    fs.writeFileSync(
      path.join(blocksDir, b.id + ext),
      b.code.endsWith('\n') ? b.code : b.code + '\n',
    );
  }

  fs.writeFileSync(tsconfigPath, JSON.stringify(harness.tsconfig, null, 2));

  const tsc = path.join(
    harness.dir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsc.cmd' : 'tsc',
  );
  const run = spawnSync(tsc, ['-p', tsconfigPath, '--pretty', 'false'], {
    cwd: work,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  const output = `${run.stdout || ''}${run.stderr || ''}`;

  const failures = new Map();
  for (const line of output.split('\n')) {
    // blocks/content_expo_router_stack_md__0.tsx(3,10): error TS2304: ...
    const m = /^blocks[\\/]([A-Za-z0-9_]+)\.(tsx?)\((\d+),(\d+)\):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const b = byId.get(m[1]);
    if (!b) continue;
    const list = failures.get(b.id) || [];
    // Map the block-local line back to the line in the Markdown file.
    list.push({ mdLine: b.startLine + Number(m[3]), message: m[5] });
    failures.set(b.id, list);
  }

  const pages = new Set(mine.map((b) => b.rel)).size;
  console.log(`[${key}] type-checked ${mine.length} block(s) from ${pages} page(s) against ${harness.label}`);

  const stray = output
    .trim()
    .split('\n')
    .filter((l) => l.trim() && !/^blocks[\\/]/.test(l.trim()));
  if (!failures.size && stray.length) {
    console.log(`\n[${key}] compiler output not attributable to a block:`);
    console.log(stray.slice(0, 20).join('\n'));
    totalErrors += stray.length;
    continue;
  }

  if (!failures.size) {
    summaries.push(`[${key}] OK`);
    continue;
  }

  // Group by page so the report is actionable.
  const byPage = new Map();
  for (const id of failures.keys()) {
    const b = byId.get(id);
    const list = byPage.get(b.rel) || [];
    list.push({ b, errs: failures.get(id) });
    byPage.set(b.rel, list);
  }

  let count = 0;
  console.log(`\n[${key}] ${failures.size} block(s) failed across ${byPage.size} page(s):\n`);
  for (const [rel, items] of byPage) {
    console.log(rel);
    for (const { errs } of items) {
      for (const e of errs) {
        count++;
        console.log(`  ${rel}:${e.mdLine}  ${e.message}`);
      }
    }
    console.log('');
  }
  totalErrors += count;
  totalFailedBlocks += failures.size;
  summaries.push(`[${key}] ${count} error(s) in ${failures.size} block(s)`);
}

console.log(summaries.join('   '));

if (totalErrors) {
  console.log(`\n${totalErrors} type error(s) total across ${totalFailedBlocks} block(s).`);
  process.exit(1);
}

console.log('typecheck: OK');
