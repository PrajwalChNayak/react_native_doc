/**
 * Content validation. Zero dependencies; run with `node scripts/check.mjs`.
 *
 * Checks structure (front matter, required sections, links, anchors, orphans)
 * and then greps for the API patterns that React Native 0.87 removed or
 * deprecated. The banned-pattern pass is the important half: it is what stops
 * pre-0.82 code from drifting back into the docs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections, flatPages } from './nav.mjs';
import { parseFrontMatter, slugify } from './markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const CONTENT = path.join(ROOT, 'content');

const errors = [];
const warnings = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}

function warn(file, msg) {
  warnings.push(`${file}: ${msg}`);
}

/* ------------------------------------------------------- banned patterns */

/**
 * Each rule is checked against the *prose and code* of every page except the
 * files in `allow`. The migration section is the designated home for legacy
 * material, so most rules exempt it.
 */
const MIGRATION = 'content/migration/';
const BREAKING = 'content/migration/breaking-changes-087.md';

const BANNED = [
  {
    id: 'deep-import-libraries',
    re: /["'`]react-native\/Libraries\//g,
    msg: 'deep import of react-native/Libraries/ — a type error under the Strict API',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'deep-import-private',
    re: /["'`]react-native\/src\/private\//g,
    msg: 'deep import of react-native/src/private/ — removed in 0.87',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'new-arch-flag-android',
    re: /newArchEnabled\s*=\s*false/g,
    msg: 'newArchEnabled=false — ignored since 0.82',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'new-arch-flag-ios',
    re: /RCT_NEW_ARCH_ENABLED\s*=\s*0/g,
    msg: 'RCT_NEW_ARCH_ENABLED=0 — ignored since 0.82',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'interaction-manager',
    re: /\bInteractionManager\b/g,
    msg: 'InteractionManager — removed in 0.87, use the requestIdleCallback global',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'modal-animated',
    re: /<Modal[^>]*\banimated\b(?!\w)/g,
    msg: "Modal's `animated` prop — removed in 0.87",
    allowPrefix: [MIGRATION],
  },
  {
    id: 'statusbar-backgroundcolor',
    re: /<StatusBar[^>]*\bbackgroundColor\b/g,
    msg: 'StatusBar backgroundColor — removed in 0.87',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'statusbar-translucent',
    re: /<StatusBar[^>]*\btranslucent\b/g,
    msg: 'StatusBar translucent — removed in 0.87',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'use-turbo-modules',
    re: /\buseTurboModules\b/g,
    msg: 'useTurboModules feature flag — removed in 0.87',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'native-methods',
    re: /\bNativeMethodsMixin\b|\bNativeMethods\b/g,
    msg: 'NativeMethods / NativeMethodsMixin — removed in 0.87, use HostInstance',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'properties-aliases',
    re: /\b(?:View|Text|Image|ScrollView|TextInput|Switch|Touchable[A-Za-z]*|FlatList|SectionList|Modal|ActivityIndicator|RefreshControl)Properties\b/g,
    msg: '*Properties type alias — removed in 0.87, use *Props',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'image-background',
    re: /\bImageBackground\b/g,
    msg: 'ImageBackground — deprecated in 0.87, use a View with an absolutely positioned Image',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'rn-get-polyfills',
    re: /rn-get-polyfills/g,
    msg: 'react-native/rn-get-polyfills — removed, use @react-native/js-polyfills',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'initialize-core',
    re: /InitializeCore/g,
    msg: 'InitializeCore — deprecated, use react-native/setup-env',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'bare-rctappdelegate',
    re: /#import\s+<RCTAppDelegate\.h>/g,
    msg: 'bare #import <RCTAppDelegate.h> — must be <React/RCTAppDelegate.h> in 0.87',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'core-cli-utils',
    re: /@react-native\/core-cli-utils/g,
    msg: '@react-native/core-cli-utils — no longer published',
    allowPrefix: [MIGRATION],
  },
  {
    id: 'color-scheme-unspecified',
    re: /['"]unspecified['"]/g,
    msg: "'unspecified' color scheme — removed in 0.87, use 'auto' / null",
    allowPrefix: [MIGRATION],
  },
];

/* ----------------------------------------------------- toolchain scoping */

/**
 * The site documents two toolchains. A page belongs to exactly one, decided by
 * its section id: anything under `content/expo-*` is an Expo page, everything
 * else is a React Native CLI page.
 *
 * The rules below run in opposite directions, which is the whole point:
 *   - CLI pages must not mention Expo (one allow-listed scope note aside).
 *   - Expo pages must not teach removed Expo commands, bare `npm install` of
 *     an SDK package, the retired managed/bare framing, or a React Native 0.87
 *     API that Expo SDK 57 does not ship.
 */
const isExpoPage = (file) => file.startsWith('content/expo-');

/** Expo has exactly one allow-listed home inside the CLI half. */
const EXPO_ALLOW = ['content/getting-started/introduction.md'];
const EXPO_RE = /\bexpo\b|\bEAS\b|create-expo-app|\bexpo-[a-z-]+/gi;

/** The Expo migration section is where retired Expo material is documented. */
const EXPO_MIGRATION = 'content/expo-migration/';

/**
 * Rules that apply ONLY to Expo pages. Same shape as BANNED, but the allow
 * prefix points at the Expo migration section rather than the CLI one.
 */
const EXPO_BANNED = [
  {
    id: 'expo-init',
    re: /\bexpo init\b/g,
    msg: '`expo init` was removed — use `npx create-expo-app@latest`',
    allowPrefix: [EXPO_MIGRATION],
  },
  {
    id: 'expo-eject',
    re: /\bexpo eject\b/g,
    msg: '`expo eject` was removed — see the CNG vs committed-native framing',
    allowPrefix: [EXPO_MIGRATION],
  },
  {
    id: 'npm-install-sdk-package',
    // `npm install expo-foo` / `yarn add expo-foo` — SDK packages must go
    // through `npx expo install`, which resolves the SDK-matched version.
    re: /\b(?:npm i(?:nstall)?|yarn add|pnpm add|bun add)\s+(?:-[\w-]+\s+)*(?:expo-[a-z0-9-]+|expo|expo-router)\b/g,
    msg: 'SDK packages must be installed with `npx expo install`, not a bare package-manager install',
    allowPrefix: [EXPO_MIGRATION],
  },
  {
    id: 'managed-bare-workflow',
    // Only the "workflow" framing is banned, not the words in isolation.
    re: /\b(?:managed|bare)\s+workflow\b/gi,
    msg: 'the "managed workflow" / "bare workflow" framing is retired — use CNG vs committed native directories',
    allowPrefix: [EXPO_MIGRATION, 'content/expo-vs-bare/'],
  },
  {
    id: 'rn-087-instance-types',
    // ViewInstance, TextInputInstance, HostInstance and friends are 0.87-only.
    // Expo SDK 57 is on React Native 0.86, where they do not exist at all.
    re: /\b(?:HostInstance|(?:View|Text|TextInput|ScrollView|FlatList|SectionList|Pressable|Modal|Switch|Image|RefreshControl|ActivityIndicator|KeyboardAvoidingView)Instance)\b/g,
    msg: 'React Native 0.87-only instance type — Expo SDK 57 ships 0.86, where it does not exist',
    allowPrefix: [EXPO_MIGRATION],
  },
];

/* ------------------------------------------------------------- structure */

const REQUIRED_HEADINGS = ['Common mistakes', 'Related topics'];
const VALID_STATUS = new Set(['current', 'legacy', 'deprecated']);

const pages = flatPages();
const bySource = new Map(pages.map((p) => [p.source.replace(/\\/g, '/'), p]));

/** Every markdown file actually on disk, relative to the repo root. */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
  }
  return out;
}

/**
 * Blanks out fenced code so a check can look at prose only, keeping the line
 * count intact so reported line numbers still line up. A `# comment` inside a
 * bash block is not a Markdown H1.
 */
function stripFences(body) {
  let inFence = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

const onDisk = walk(CONTENT);

// Orphans: a content file that nav.mjs does not list.
for (const file of onDisk) {
  if (!bySource.has(file)) err(file, 'orphan page — not listed in scripts/nav.mjs');
}

/* Collect anchors per page so cross-page #fragment links can be validated. */
const anchorsByFile = new Map();
const parsed = new Map();

for (const page of pages) {
  const file = page.source.replace(/\\/g, '/');
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, 'utf8');
  const { data, body } = parseFrontMatter(raw);
  const lineOffset = raw.replace(/\r\n/g, '\n').split('\n').length - body.split('\n').length;
  parsed.set(file, { data, body, raw, page, lineOffset });

  const anchors = new Set();
  const used = new Map();
  for (const line of body.split('\n')) {
    const m = /^(#{2,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const base = slugify(m[2].trim().replace(/\s*#+\s*$/, '')) || 'section';
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  anchorsByFile.set(file, anchors);
}

/* ------------------------------------------------------------ page rules */

for (const page of pages) {
  const file = page.source.replace(/\\/g, '/');
  const entry = parsed.get(file);
  if (!entry) {
    warn(file, 'listed in nav.mjs but the file does not exist yet');
    continue;
  }
  const { data, body } = entry;

  // Front matter
  if (!data.title) err(file, 'front matter is missing `title`');
  if (!data.description) err(file, 'front matter is missing `description`');
  if (data.status && !VALID_STATUS.has(data.status.toLowerCase())) {
    err(file, `front matter status "${data.status}" must be current | legacy | deprecated`);
  }
  if (/^#\s+/m.test(stripFences(body))) {
    err(file, 'body contains an H1 — the title comes from front matter, start at H2');
  }

  // Toolchain declaration. A reader must always know which toolchain and which
  // React Native version a page assumes, so the generator renders a badge from
  // these and both are required on Expo pages.
  const expoPage = isExpoPage(file);
  const toolchain = (data.toolchain || '').toLowerCase();
  if (expoPage) {
    if (toolchain !== 'expo') {
      err(file, 'Expo pages must declare `toolchain: expo` in front matter');
    }
    if (String(data.sdk || '').trim() !== '57') {
      err(file, 'Expo pages must declare `sdk: 57` in front matter');
    }
  } else if (toolchain && toolchain !== 'cli') {
    err(file, `front matter toolchain "${data.toolchain}" must be cli on a React Native CLI page`);
  }

  // Required sections
  const headings = [...body.matchAll(/^#{2,6}\s+(.*)$/gm)].map((m) => m[1].trim());
  for (const required of REQUIRED_HEADINGS) {
    if (!headings.some((h) => h.toLowerCase() === required.toLowerCase())) {
      err(file, `missing required section "## ${required}"`);
    }
  }

  // Internal links
  const links = [...body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  for (const href of links) {
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;

    if (href.startsWith('#')) {
      const anchors = anchorsByFile.get(file);
      if (anchors && !anchors.has(decodeURIComponent(href.slice(1)))) {
        err(file, `link to missing anchor on this page: ${href}`);
      }
      continue;
    }

    const [targetPart, frag] = href.split('#');

    // Links into examples/ point at real source files, not pages.
    if (targetPart.includes('examples/')) {
      const abs = path.resolve(path.dirname(path.join(ROOT, file)), targetPart);
      if (!fs.existsSync(abs)) err(file, `link to missing example file: ${href}`);
      continue;
    }

    if (!targetPart.endsWith('.md')) {
      warn(file, `internal link does not end in .md: ${href}`);
      continue;
    }

    const abs = path.resolve(path.dirname(path.join(ROOT, file)), targetPart);
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (!fs.existsSync(abs)) {
      // A link to a page that nav.mjs lists but nobody has written yet is a
      // work-in-progress, not a broken link. Anything else is a real error.
      if (bySource.has(rel)) warn(file, `link to not-yet-written page: ${href}`);
      else err(file, `broken link: ${href}`);
      continue;
    }
    if (frag) {
      const anchors = anchorsByFile.get(rel);
      if (anchors && !anchors.has(decodeURIComponent(frag))) {
        err(file, `link to missing anchor: ${href}`);
      }
    }
  }
}

/* --------------------------------------------------------- banned scan */

/** Strips fenced code so a rule can opt to ignore prose or vice versa. */
function lineNumber(text, index, offset = 0) {
  return text.slice(0, index).split('\n').length + offset;
}

/**
 * A page may name a banned API when warning against it. That needs an explicit,
 * visible opt-in in front matter, e.g.
 *
 *   allow-banned: native-methods, new-arch-flag-android
 *
 * Every use is reported below, so the escape hatch cannot be used quietly.
 */
const allowUses = [];

for (const [file, entry] of parsed) {
  const { body, data, lineOffset } = entry;
  const allowed = new Set(
    String(data['allow-banned'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (allowed.size) allowUses.push({ file, ids: [...allowed] });

  // The React Native 0.87 rules describe the CLI half's React Native. Expo
  // SDK 57 is on 0.86, where most of those removals have not happened yet, so
  // applying them to an Expo page would flag correct code.
  const ruleSet = isExpoPage(file) ? EXPO_BANNED : BANNED;

  for (const rule of ruleSet) {
    if (rule.allowPrefix && rule.allowPrefix.some((p) => file.startsWith(p))) continue;
    if (allowed.has(rule.id)) continue;
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(body)) !== null) {
      err(file, `line ${lineNumber(body, m.index, lineOffset)}: banned ${rule.id} — ${rule.msg}`);
    }
  }

  // The "no Expo" rule is a CLI-half rule. Expo pages are exempt by definition;
  // without this scoping it would fire on every line of the new sections.
  if (!isExpoPage(file) && !EXPO_ALLOW.includes(file) && !allowed.has('expo')) {
    EXPO_RE.lastIndex = 0;
    let m;
    while ((m = EXPO_RE.exec(body)) !== null) {
      // "exposed", "exponential" etc. are legitimate words; \b...\b on `expo`
      // already excludes them, but guard the EAS acronym against "leases".
      err(
        file,
        `line ${lineNumber(body, m.index, lineOffset)}: Expo reference "${m[0]}" outside the allow-listed scope note`,
      );
    }
  }
}

/* ---------------------------------------------------------------- report */

const missingFiles = pages.filter((p) => !parsed.has(p.source.replace(/\\/g, '/')));

console.log(`checked ${parsed.size}/${pages.length} pages`);
if (missingFiles.length) {
  console.log(`${missingFiles.length} page(s) not written yet`);
}

if (allowUses.length) {
  console.log(`\n${allowUses.length} page(s) use the allow-banned escape hatch:`);
  for (const u of allowUses) console.log(`  ~ ${u.file}: ${u.ids.join(', ')}`);
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 60)) console.log(`  ! ${w}`);
  if (warnings.length > 60) console.log(`  … and ${warnings.length - 60} more`);
}

if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors.slice(0, 200)) console.log(`  x ${e}`);
  if (errors.length > 200) console.log(`  … and ${errors.length - 200} more`);
  process.exit(1);
}

console.log('\ncheck: OK');
