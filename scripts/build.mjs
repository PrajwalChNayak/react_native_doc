/**
 * Static site generator for the React Native CLI Handbook.
 *
 * Plain Node, ESM, zero npm dependencies, so `node scripts/build.mjs` works on
 * a fresh clone with no install step. Reads Markdown from `content/`, writes
 * HTML into `docs/` so GitHub Pages can serve it from main -> /docs with no
 * configuration.
 *
 * All emitted links are relative, so the site also works from a repo subpath.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site, menus, families, sections, flatPages } from './nav.mjs';
import { parseFrontMatter, renderMarkdown, toPlainText, escapeHtml } from './markdown.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'docs');
const ASSETS = path.join(ROOT, 'assets');

const args = new Set(process.argv.slice(2));
const QUIET = args.has('--quiet');

/* ------------------------------------------------------------------ util */

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

function log(...a) {
  if (!QUIET) console.log(...a);
}

/* ----------------------------------------------------------------- icons */

const LOGO = `<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill="none"><ellipse cx="12" cy="12" rx="10.5" ry="4.1" stroke="currentColor" stroke-width="1.5"/><ellipse cx="12" cy="12" rx="10.5" ry="4.1" stroke="currentColor" stroke-width="1.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10.5" ry="4.1" stroke="currentColor" stroke-width="1.5" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="2.1" fill="currentColor"/></svg>`;

const CHEV = `<svg class="chev" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SEARCH_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.6 10.6 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const BURGER = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;

const THEME_ICONS = {
  light: `<svg data-icon="light" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  dark: `<svg data-icon="dark" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  system: `<svg data-icon="system" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.6 13.8h4.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
};

/**
 * Runs before first paint, so the page never flashes the wrong theme.
 * Inlined into <head> — it must stay small and synchronous.
 */
const THEME_BOOT = `(function(){try{var p=localStorage.getItem('rn-theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');document.documentElement.setAttribute('data-theme-pref',p);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

/* ------------------------------------------------------------------ nav */

/** Builds the sticky top bar for a page at `base` depth. */
function topbar(base, activeSectionId) {
  // Menus are grouped by toolchain family and separated by a labelled divider,
  // so the bar itself answers "which toolchain am I reading about?" before the
  // reader opens anything. The two halves are on different React Native
  // versions, which is exactly why that question must never be ambiguous.
  let lastFamily = null;
  const menuHtml = menus
    .map((menu) => {
      const secs = sections.filter((s) => s.menu === menu.id);
      const isActive = secs.some((s) => s.id === activeSectionId);
      const groups = secs
        .map((section) => {
          const links = section.pages
            .map((p) => {
              const href = `${base}${section.id}/${p.slug}.html`;
              const current =
                section.id === activeSectionId && activePageSlug === p.slug
                  ? ' aria-current="page"'
                  : '';
              return `<a href="${href}"${current}>${escapeHtml(p.title)}</a>`;
            })
            .join('');
          return `<div class="menu-group"><p class="menu-group-title">${escapeHtml(section.title)}</p>${links}</div>`;
        })
        .join('');
      const family = families.find((f) => f.id === menu.family);
      let divider = '';
      if (menu.family !== lastFamily) {
        divider = `<span class="fam-label" aria-hidden="true">${escapeHtml(family ? family.short : menu.family)}</span>`;
        lastFamily = menu.family;
      }
      const famTitle = family ? ` — ${family.title}, React Native ${family.rn}` : '';
      return `${divider}<details class="menu" data-family="${escapeHtml(menu.family)}"><summary data-active="${isActive}" title="${escapeHtml(menu.title + famTitle)}">${escapeHtml(menu.title)}${CHEV}</summary><div class="menu-panel">${groups}</div></details>`;
    })
    .join('');

  return `<header class="topbar">
  <a class="brand" href="${base}index.html">${LOGO}<span>${escapeHtml(site.shortTitle)}</span></a>
  <button id="nav-toggle" class="iconbtn hamburger" type="button" aria-expanded="false" aria-controls="navmenus" aria-label="Toggle navigation">${BURGER}</button>
  <nav id="navmenus" class="navmenus" aria-label="Main">${menuHtml}</nav>
  <div class="spacer"></div>
  <button id="search-open" class="searchbtn" type="button" aria-label="Search the handbook">${SEARCH_ICON}<span>Search</span><kbd>/</kbd></button>
  <button id="theme-toggle" class="iconbtn" type="button" aria-label="Toggle theme">${THEME_ICONS.light}${THEME_ICONS.dark}${THEME_ICONS.system}</button>
</header>`;
}

// Set per page while rendering so `topbar` can mark the current link.
let activePageSlug = '';

function searchOverlay() {
  return `<div id="search-overlay" class="search-overlay" hidden role="dialog" aria-modal="true" aria-label="Search">
  <div class="search-box">
    <input id="search-input" type="search" placeholder="Search pages, headings and text…" autocomplete="off" spellcheck="false" aria-label="Search query">
    <div id="search-results" class="search-results"></div>
  </div>
</div>`;
}

function footer(base, family = 'cli') {
  // The two halves are on different React Native versions, so the footer cites
  // the one that actually applies to the page being read rather than a single
  // set of numbers that would be wrong half the time.
  const facts =
    family === 'expo'
      ? `Expo SDK ${escapeHtml(site.expoSdk)} (expo ${escapeHtml(site.expoVersion)}) · React Native ${escapeHtml(site.expoRnVersion)} · expo-router ${escapeHtml(site.expoRouterVersion)} · verified ${escapeHtml(site.verifiedOn)}`
      : `React Native ${escapeHtml(site.rnVersion)} · Community CLI ${escapeHtml(site.cliVersion)} · React ${escapeHtml(site.reactVersion)} · verified ${escapeHtml(site.verifiedOn)}`;

  const links =
    family === 'expo'
      ? `<a href="${base}index.html">Home</a> · <a href="${base}expo-migration/troubleshooting.html">Expo troubleshooting</a> · <a href="${base}expo-migration/cheat-sheet.html">Expo cheat sheet</a>`
      : `<a href="${base}index.html">Home</a> · <a href="${base}reference/troubleshooting.html">Troubleshooting</a> · <a href="${base}reference/cheat-sheet.html">Cheat sheet</a>`;

  return `<footer class="footer"><div class="footer-inner">
  <span>${facts}</span>
  <span>${links}</span>
</div></footer>`;
}

/** The page shell. `bodyClass` and `toc` vary; everything else is shared. */
function layout({ base, title, description, activeSectionId, content, toc, bodyClass = '', family = 'cli' }) {
  const tocHtml = toc && toc.length
    ? `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${toc
        .map(
          (h) =>
            `<li class="lvl-${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
        )
        .join('')}</ul></aside>`
    : '<aside class="toc" aria-hidden="true"></aside>';

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(site.shortTitle)}</title>
<meta name="description" content="${escapeHtml(description || site.description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#0a58ca"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>')}">
<script>${THEME_BOOT}</script>
<link rel="stylesheet" href="${base}assets/theme.css">
</head>
<body class="${bodyClass}" data-base="${base}">
<a class="skip" href="#main">Skip to content</a>
${topbar(base, activeSectionId)}
<div class="shell">
<main id="main" class="main">
${content}
</main>
${tocHtml}
</div>
${footer(base, family)}
${searchOverlay()}
<script src="${base}assets/app.js" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------- rendering */

const pages = flatPages();
const searchIndex = [];
const missing = [];

function pageHtml(page, i) {
  const srcPath = path.join(ROOT, page.source);
  if (!fs.existsSync(srcPath)) {
    missing.push(page.source);
    return null;
  }

  const { data, body } = parseFrontMatter(read(srcPath));
  const base = '../';

  const { html, toc } = renderMarkdown(body, {
    // Content links are authored as `.md`; the site serves `.html`.
    resolveLink(href) {
      if (/^(https?:|mailto:|#)/.test(href)) return href;
      return href.replace(/\.md(#|$)/, '.html$1');
    },
  });

  const prev = i > 0 ? pages[i - 1] : null;
  const next = i < pages.length - 1 ? pages[i + 1] : null;

  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb">
  <a href="${base}index.html">Home</a><span class="sep">/</span>
  <a href="${base}index.html#${page.section.id}">${escapeHtml(page.section.title)}</a><span class="sep">/</span>
  <span aria-current="page">${escapeHtml(page.title)}</span>
</nav>`;

  const status = (data.status || 'current').toLowerCase();

  // Toolchain badge. This site documents two toolchains on two different React
  // Native versions, so every page says which one it assumes — a reader who
  // arrives from a search result has no other way to tell.
  const isExpo = page.sectionId.startsWith('expo-');
  const toolchain = (data.toolchain || (isExpo ? 'expo' : 'cli')).toLowerCase();
  const toolBadge =
    toolchain === 'expo'
      ? `<span class="badge badge-expo" title="Expo SDK ${escapeHtml(String(data.sdk || '57'))} ships React Native 0.86.3">Expo SDK ${escapeHtml(String(data.sdk || '57'))} · RN 0.86</span>`
      : `<span class="badge badge-cli" title="React Native Community CLI, React Native ${escapeHtml(site.rnVersion)}">RN CLI · ${escapeHtml(site.rnVersion)}</span>`;

  const statusBadge =
    status === 'current'
      ? ''
      : `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span>`;

  const badge = `<div class="badges">${toolBadge}${statusBadge}</div>`;

  const pager = `<nav class="pager" aria-label="Previous and next page">
${prev ? `<a class="prev" href="${base}${prev.path}.html"><span class="dir">Previous</span><span>${escapeHtml(prev.title)}</span></a>` : '<span></span>'}
${next ? `<a class="next" href="${base}${next.path}.html"><span class="dir">Next</span><span>${escapeHtml(next.title)}</span></a>` : ''}
</nav>`;

  const content = `${crumbs}
<div class="page-head">
<h1>${escapeHtml(data.title || page.title)}</h1>
${data.description ? `<p class="lede">${escapeHtml(data.description)}</p>` : ''}
${badge}
</div>
<article class="prose">
${html}
</article>
${pager}`;

  searchIndex.push({
    u: `${page.path}.html`,
    t: data.title || page.title,
    s: page.section.title,
    d: data.description || '',
    h: toc.map((t) => t.text),
    b: toPlainText(body).slice(0, 1800),
  });

  activePageSlug = page.slug;
  return layout({
    base,
    title: data.title || page.title,
    description: data.description,
    activeSectionId: page.sectionId,
    content,
    toc,
    family: isExpo ? 'expo' : 'cli',
  });
}

/* ------------------------------------------------------------- home page */

function homeHtml() {
  const cardsFor = (predicate) =>
    sections
      .filter(predicate)
      .map(
        (s) =>
          `<a class="sec-card" id="${s.id}" href="${s.id}/${s.pages[0].slug}.html">
<h3>${escapeHtml(s.title)}</h3>
<p>${escapeHtml(s.description)}</p>
<p class="count">${s.pages.length} pages</p>
</a>`,
      )
      .join('');

  const cliCards = cardsFor((s) => !s.id.startsWith('expo-'));
  const expoCards = cardsFor((s) => s.id.startsWith('expo-'));

  const count = (predicate) =>
    sections.filter(predicate).reduce((total, s) => total + s.pages.length, 0);
  const cliPages = count((s) => !s.id.startsWith('expo-'));
  const expoPages = count((s) => s.id.startsWith('expo-'));

  const content = `<div class="home-hero">
<h1>React Native Handbook</h1>
<p>Two toolchains, documented separately and verified against both. The
<strong>Community CLI</strong> half targets React Native <strong>${escapeHtml(site.rnVersion)}</strong>;
the <strong>Expo</strong> half targets <strong>SDK ${escapeHtml(site.expoSdk)}</strong>, which ships
React Native <strong>${escapeHtml(site.expoRnVersion)}</strong>. They are different versions, and this
site never blurs them together.</p>
<p><a class="cta" href="getting-started/introduction.html">React Native CLI</a> <a class="cta secondary" href="expo-getting-started/introduction.html">Expo</a></p>
</div>
<article class="prose">
<h2 id="which-half">Which half do I want?</h2>
<div class="table-wrap"><table>
<thead><tr><th>&nbsp;</th><th>React Native CLI</th><th>Expo</th></tr></thead>
<tbody>
<tr><td>React Native</td><td><strong>${escapeHtml(site.rnVersion)}</strong></td><td><strong>${escapeHtml(site.expoRnVersion)}</strong> (pinned by SDK ${escapeHtml(site.expoSdk)})</td></tr>
<tr><td>Native projects</td><td>Yours, committed and hand-maintained</td><td>Generated from config (CNG)</td></tr>
<tr><td>Create a project</td><td><code>npx @react-native-community/cli init</code></td><td><code>npx create-expo-app@latest</code></td></tr>
<tr><td>Install a package</td><td><code>npm install</code></td><td><code>npx expo install</code></td></tr>
<tr><td>Best when</td><td>You need full native control, or are adding RN to an existing native app</td><td>You want the native build pipeline maintained for you</td></tr>
</tbody></table></div>
<p>An honest, non-promotional comparison is in
<a href="expo-vs-bare/comparison.html">Expo vs Bare CLI</a>. Note that
<strong>code does not transfer between the halves unchecked</strong>: React Native 0.87 made the
Strict TypeScript API the default and added per-component ref types that do not exist in 0.86.</p>

<h2 id="cli-sections">React Native CLI · ${cliPages} pages</h2>
<p>The framework-less Community CLI path on React Native ${escapeHtml(site.rnVersion)}, New Architecture only.</p>
<div class="sec-grid">${cliCards}</div>

<h2 id="expo-sections">Expo · ${expoPages} pages</h2>
<p>Expo SDK ${escapeHtml(site.expoSdk)} on React Native ${escapeHtml(site.expoRnVersion)} — the SDK, Expo Router, development builds, config plugins and EAS.</p>
<div class="sec-grid">${expoCards}</div>

<h2 id="verified">Verified against</h2>
<div class="table-wrap"><table>
<thead><tr><th>Package</th><th>Version</th><th>Half</th></tr></thead>
<tbody>
<tr><td><code>react-native</code></td><td>${escapeHtml(site.rnVersion)}</td><td>CLI</td></tr>
<tr><td><code>@react-native-community/cli</code></td><td>${escapeHtml(site.cliVersion)}</td><td>CLI</td></tr>
<tr><td><code>react</code></td><td>${escapeHtml(site.reactVersion)}</td><td>CLI</td></tr>
<tr><td>Node.js (minimum)</td><td>${escapeHtml(site.nodeMin)}</td><td>CLI</td></tr>
<tr><td><code>expo</code></td><td>${escapeHtml(site.expoVersion)} (SDK ${escapeHtml(site.expoSdk)})</td><td>Expo</td></tr>
<tr><td><code>react-native</code> via SDK ${escapeHtml(site.expoSdk)}</td><td>${escapeHtml(site.expoRnVersion)}</td><td>Expo</td></tr>
<tr><td><code>expo-router</code></td><td>${escapeHtml(site.expoRouterVersion)}</td><td>Expo</td></tr>
<tr><td><code>eas-cli</code></td><td>${escapeHtml(site.easCliVersion)}</td><td>Expo</td></tr>
</tbody></table></div>
<p>Versions and APIs were checked against the npm registry and the installed
<code>react-native</code> and <code>expo</code> packages on ${escapeHtml(site.verifiedOn)}. Every
fenced TypeScript block is compiled against the real versions for its half.</p>
</article>`;

  activePageSlug = '';
  return layout({
    base: '',
    title: 'React Native Handbook',
    description: site.description,
    activeSectionId: null,
    content,
    toc: [
      { level: 2, id: 'which-half', text: 'Which half do I want?' },
      { level: 2, id: 'cli-sections', text: 'React Native CLI' },
      { level: 2, id: 'expo-sections', text: 'Expo' },
      { level: 2, id: 'verified', text: 'Verified against' },
    ],
    bodyClass: 'home',
  });
}

function notFoundHtml() {
  activePageSlug = '';
  return layout({
    base: '',
    title: 'Page not found',
    description: 'That page does not exist.',
    activeSectionId: null,
    content: `<div class="page-head"><h1>Page not found</h1><p class="lede">That page does not exist in this handbook.</p></div>
<article class="prose"><p><a href="index.html">Go to the home page</a>, or press <kbd>/</kbd> to search.</p></article>`,
    toc: [],
  });
}

/* ----------------------------------------------------------------- build */

function copyAssets() {
  const dest = path.join(OUT, 'assets');
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(ASSETS)) {
    fs.copyFileSync(path.join(ASSETS, file), path.join(dest, file));
  }
}

function main() {
  const started = Date.now();

  // Clear only generated output, keeping the directory itself so a checked-out
  // Pages configuration does not break between builds.
  if (fs.existsSync(OUT)) {
    for (const entry of fs.readdirSync(OUT)) {
      fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
    }
  }

  let written = 0;
  pages.forEach((page, i) => {
    const html = pageHtml(page, i);
    if (html === null) return;
    write(path.join(ROOT, page.output), html);
    written++;
  });

  write(path.join(OUT, 'index.html'), homeHtml());
  write(path.join(OUT, '404.html'), notFoundHtml());
  write(path.join(OUT, 'search-index.json'), JSON.stringify(searchIndex));
  // Tell GitHub Pages not to run Jekyll, which would drop files like _foo.
  write(path.join(OUT, '.nojekyll'), '');
  copyAssets();

  log(`built ${written}/${pages.length} pages in ${Date.now() - started}ms`);
  if (missing.length) {
    log(`\n${missing.length} page(s) listed in nav.mjs have no content file yet:`);
    for (const m of missing.slice(0, 40)) log(`  - ${m}`);
    if (missing.length > 40) log(`  … and ${missing.length - 40} more`);
  }
  const bytes = JSON.stringify(searchIndex).length;
  log(`search index: ${searchIndex.length} entries, ${(bytes / 1024).toFixed(1)} kB`);
}

main();
