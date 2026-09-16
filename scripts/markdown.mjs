/**
 * A small, dependency-free Markdown renderer built for this handbook.
 *
 * It deliberately supports only what the docs actually use, which keeps it
 * short enough to audit: headings, paragraphs, nested lists, fenced code with
 * an optional `title=`, tables, blockquotes, callouts, tab groups, images,
 * horizontal rules and the usual inline marks.
 *
 * Everything is escaped on the way in; the only raw HTML that reaches the page
 * is what this file emits.
 */

/* ------------------------------------------------------------------ utils */

export function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/* ----------------------------------------------------------- front matter */

/**
 * Parses the leading `---` block. Values are plain scalars; that is all the
 * front matter in this project needs, so there is no YAML dependency.
 */
export function parseFrontMatter(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: text };
  const block = text.slice(4, end);
  const body = text.slice(end + 4).replace(/^\n/, '');
  const data = {};
  for (const line of block.split('\n')) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[m[1]] = value;
  }
  return { data, body };
}

/* ---------------------------------------------------- syntax highlighting */

const C_LIKE_KEYWORDS =
  'abstract|as|async|await|break|case|catch|class|companion|const|constructor|continue|data|default|defer|delegate|delete|do|else|enum|export|extends|extension|external|false|final|finally|for|from|fun|func|function|get|guard|if|implements|import|in|infix|init|inline|instanceof|interface|internal|is|lateinit|let|mutating|namespace|new|null|object|of|open|operator|out|override|package|private|protected|public|readonly|register|reified|repeat|required|return|satisfies|sealed|self|set|static|struct|super|suspend|switch|this|throw|throws|true|try|type|typealias|typeof|val|var|void|when|where|while|with|yield';

const TYPE_WORDS =
  'Any|Array|Boolean|Double|Float|Int|Long|Map|Number|Object|Promise|Record|Set|String|Unit|Void|boolean|number|string|unknown|never|any|void|symbol|bigint';

/**
 * Each language is a list of `[className, regex]` rules applied in order at the
 * current scan position. Order matters: comments and strings must win before
 * anything tries to read their contents as code.
 */
function rulesFor(lang) {
  const lineComment = ['c', /^\/\/[^\n]*/];
  const blockComment = ['c', /^\/\*[\s\S]*?\*\//];
  const hashComment = ['c', /^#[^\n]*/];
  const dq = ['s', /^"(?:\\.|[^"\\])*"/];
  const sq = ['s', /^'(?:\\.|[^'\\])*'/];
  const tpl = ['s', /^`(?:\\.|[^`\\])*`/];
  const num = ['n', /^\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[fFdDlLuU]*\b/];
  const kw = ['k', new RegExp(`^\\b(?:${C_LIKE_KEYWORDS})\\b`)];
  const ty = ['t', new RegExp(`^\\b(?:${TYPE_WORDS})\\b`)];
  const upper = ['t', /^\b[A-Z][A-Za-z0-9_]*\b/];
  const fn = ['f', /^\b[a-z_$][A-Za-z0-9_$]*(?=\s*\()/];
  const anno = ['d', /^@[A-Za-z_][A-Za-z0-9_.]*/];
  const punct = ['p', /^[{}()[\];,.:?!<>=+\-*/%&|^~]+/];

  switch (lang) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'javascript':
    case 'typescript':
      return [blockComment, lineComment, tpl, dq, sq, num, kw, ty, anno, upper, fn, punct];
    case 'kotlin':
      return [blockComment, lineComment, dq, sq, num, kw, ty, anno, upper, fn, punct];
    case 'swift':
      return [blockComment, lineComment, dq, num, kw, ty, anno, upper, fn, punct];
    case 'objc':
    case 'objective-c':
    case 'cpp':
    case 'c':
      return [
        blockComment,
        lineComment,
        ['d', /^#\s*(?:import|include|define|ifdef|ifndef|endif|if|else|pragma)\b[^\n]*/],
        dq,
        num,
        ['k', /^\b(?:id|self|nil|YES|NO|void|const|static|typedef|struct|enum|return|if|else|for|while|switch|case|break|continue|nullable|nonnull|instancetype|BOOL|NSString|NSInteger|NSDictionary|NSArray)\b/],
        anno,
        upper,
        fn,
        punct,
      ];
    case 'gradle':
    case 'groovy':
      return [blockComment, lineComment, tpl, dq, sq, num, kw, upper, fn, punct];
    case 'java':
      return [blockComment, lineComment, dq, sq, num, kw, ty, anno, upper, fn, punct];
    case 'ruby':
      return [
        hashComment,
        dq,
        sq,
        num,
        ['k', /^\b(?:def|end|do|class|module|require|require_relative|if|elsif|else|unless|then|return|yield|begin|rescue|ensure|self|nil|true|false|gem|source|platform)\b/],
        ['t', /^:[A-Za-z_][A-Za-z0-9_]*/],
        upper,
        fn,
        punct,
      ];
    case 'json':
      return [
        ['a', /^"(?:\\.|[^"\\])*"(?=\s*:)/],
        ['s', /^"(?:\\.|[^"\\])*"/],
        ['n', /^-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/],
        ['k', /^\b(?:true|false|null)\b/],
        ['p', /^[{}[\],:]+/],
      ];
    case 'bash':
    case 'sh':
    case 'shell':
      return [
        hashComment,
        dq,
        sq,
        [
          'k',
          /^\b(?:sudo|cd|ls|cp|mv|rm|mkdir|echo|export|source|if|then|else|fi|for|in|do|done|while|case|esac|function|return|exit|set|unset|read|test)\b/,
        ],
        [
          'f',
          /^\b(?:npm|npx|yarn|pnpm|node|bundle|pod|gradlew|gradle|adb|xcrun|xcodebuild|git|keytool|jarsigner|zipalign|apksigner|unzip|zip|strings|grep|find|curl|open|watchman|brew|ruby|fastlane|detox|maestro|java|javac)\b/,
        ],
        ['a', /^--?[A-Za-z][\w-]*/],
        ['n', /^\b\d+\b/],
        ['v', /^\$\{?[A-Za-z_][\w]*\}?/],
        ['p', /^[|&;<>()$]+/],
      ];
    case 'powershell':
    case 'ps1':
      return [
        hashComment,
        dq,
        sq,
        ['v', /^\$[A-Za-z_][\w:]*/],
        [
          'k',
          /^\b(?:if|else|elseif|foreach|for|while|switch|function|return|param|begin|process|end|try|catch|finally|throw|break|continue|in)\b/i,
        ],
        ['f', /^\b(?:Get|Set|New|Remove|Test|Invoke|Start|Stop|Select|Where|ForEach|Write|Out|Add|Copy|Move|Import|Export|Join|Split|Convert|Resolve)-[A-Za-z]+\b/],
        ['a', /^-{1,2}[A-Za-z][\w-]*/],
        ['n', /^\b\d+\b/],
        ['p', /^[|;{}()[\],.:=+\-*/%&^!<>@]+/],
      ];
    case 'xml':
    case 'html':
    case 'plist':
      return [
        ['c', /^<!--[\s\S]*?-->/],
        ['d', /^<[?!][^>]*>/],
        ['p', /^<\/?/],
        ['t', /^[A-Za-z_][\w:.-]*(?=[\s/>])/],
        ['a', /^[A-Za-z_][\w:.-]*(?=\s*=)/],
        ['s', /^"(?:\\.|[^"\\])*"/],
        ['s', /^'(?:\\.|[^'\\])*'/],
        ['p', /^\/?>/],
      ];
    case 'properties':
    case 'ini':
    // .gitignore files are comment-and-pattern lines, close enough to ini that
    // the same rules read correctly; without this they fall back to plain text.
    case 'gitignore':
      return [
        hashComment,
        ['c', /^![^\n]*/],
        ['a', /^[A-Za-z_][\w.-]*(?=\s*[=:])/],
        ['p', /^[=:]/],
        ['s', /^[^\n]+/],
      ];
    case 'diff':
      return [
        ['ins', /^\+[^\n]*/],
        ['del', /^-[^\n]*/],
        ['c', /^@@[^\n]*/],
      ];
    case 'yaml':
    case 'yml':
      return [
        hashComment,
        ['a', /^[A-Za-z_][\w.-]*(?=\s*:)/],
        dq,
        sq,
        ['n', /^\b\d+(?:\.\d+)?\b/],
        ['k', /^\b(?:true|false|null|on|off)\b/],
        ['p', /^[-:[\]{},]+/],
      ];
    default:
      return null;
  }
}

/**
 * Highlights a code string. Unknown languages fall back to escaped plain text,
 * which is the correct behaviour — a wrong colour is worse than none.
 */
export function highlight(code, lang) {
  const rules = rulesFor((lang || '').toLowerCase());
  if (!rules) return escapeHtml(code);

  // `diff` and `properties` are line-oriented, so scan them a line at a time.
  const lineOriented = lang === 'diff';
  if (lineOriented) {
    return code
      .split('\n')
      .map((line) => {
        for (const [cls, re] of rules) {
          if (re.test(line)) return `<span class="tk-${cls}">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
      })
      .join('\n');
  }

  let out = '';
  let i = 0;
  let guard = 0;
  while (i < code.length && guard++ < 200000) {
    const rest = code.slice(i);

    // Whitespace passes through untouched so indentation is preserved exactly.
    const ws = /^\s+/.exec(rest);
    if (ws) {
      out += escapeHtml(ws[0]);
      i += ws[0].length;
      continue;
    }

    let matched = false;
    for (const [cls, re] of rules) {
      const m = re.exec(rest);
      if (m && m[0].length > 0) {
        out += `<span class="tk-${cls}">${escapeHtml(m[0])}</span>`;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Consume a whole identifier at once; falling back one character at a
      // time would split words across spans and bloat the output.
      const word = /^[A-Za-z_$][\w$]*/.exec(rest);
      const chunk = word ? word[0] : rest[0];
      out += escapeHtml(chunk);
      i += chunk.length;
    }
  }
  return out;
}

/* ------------------------------------------------------------ inline pass */

/**
 * Inline formatting. Code spans are extracted first and restored last so that
 * nothing inside backticks is ever interpreted as markup.
 */
function inline(src, ctx) {
  const codeSpans = [];
  let text = src.replace(/(`+)([\s\S]*?)\1/g, (_, _ticks, body) => {
    codeSpans.push(body);
    return `\u0000C${codeSpans.length - 1}\u0000`;
  });

  text = escapeHtml(text);

  // Images before links: the syntax differs only by the leading `!`.
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src2, title) => {
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(src2)}" alt="${escapeHtml(alt)}"${t} loading="lazy">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, href, title) => {
    const resolved = ctx && ctx.resolveLink ? ctx.resolveLink(href) : href;
    const external = /^https?:\/\//.test(resolved);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(resolved)}"${attrs}${t}>${label}</a>`;
  });

  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // <kbd> is written literally in source; unescape just that one tag.
  text = text.replace(/&lt;kbd&gt;/g, '<kbd>').replace(/&lt;\/kbd&gt;/g, '</kbd>');
  text = text.replace(/&lt;br\s*\/?&gt;/g, '<br>');

  text = text.replace(/\u0000C(\d+)\u0000/g, (_, n) => `<code>${escapeHtml(codeSpans[+n])}</code>`);
  return text;
}

/* --------------------------------------------------------- block renderer */

const CALLOUT_TYPES = {
  NOTE: { cls: 'note', label: 'Note' },
  TIP: { cls: 'tip', label: 'Tip' },
  'BEST-PRACTICE': { cls: 'best', label: 'Best practice' },
  WARNING: { cls: 'warning', label: 'Warning' },
  DANGER: { cls: 'danger', label: 'Danger' },
  DEPRECATED: { cls: 'deprecated', label: 'Deprecated' },
  LEGACY: { cls: 'legacy', label: 'Legacy' },
};

let uid = 0;

function renderCode(lang, title, code) {
  const cleanLang = (lang || 'text').replace(/-fragment$/, '');
  const label = title || cleanLang;
  const body = highlight(code.replace(/\n$/, ''), cleanLang);
  return `<figure class="code" data-lang="${escapeHtml(cleanLang)}">
<figcaption><span class="code-label">${escapeHtml(label)}</span><button class="copy" type="button" aria-label="Copy code to clipboard">${COPY_ICON}<span>Copy</span></button></figcaption>
<pre><code class="lang-${escapeHtml(cleanLang)}">${body}</code></pre>
</figure>`;
}

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M5.5 5.5v-3h8v8h-3"/><rect x="2.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

/**
 * Renders a Markdown body to HTML and collects the heading tree for the TOC.
 */
export function renderMarkdown(body, ctx = {}) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  const toc = [];
  const usedSlugs = new Map();
  let i = 0;

  function uniqueSlug(text) {
    const base = slugify(text) || 'section';
    const n = usedSlugs.get(base) || 0;
    usedSlugs.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  }

  /** Renders a nested chunk (list item bodies, tab panels, callout bodies). */
  function sub(text) {
    return renderMarkdown(text, { ...ctx, _nested: true }).html;
  }

  while (i < lines.length) {
    const line = lines[i];

    // blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code
    const fence = /^(\s*)(`{3,}|~{3,})\s*([^\s]*)\s*(.*)$/.exec(line);
    if (fence) {
      const [, indent, ticks, lang, meta] = fence;
      // An unquoted title runs to the end of the line, so multi-word titles
      // like `title=Typing a ref in 0.87` survive intact.
      const titleMatch = /title=(?:"([^"]+)"|(.+))\s*$/.exec(meta || '');
      const title = titleMatch ? titleMatch[1] || titleMatch[2] : '';
      const buf = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${ticks[0]}{${ticks.length},}\\s*$`).test(lines[i])) {
        buf.push(lines[i].startsWith(indent) ? lines[i].slice(indent.length) : lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(renderCode(lang, title, buf.join('\n')));
      continue;
    }

    // tab group
    if (/^:::tabs\s*$/.test(line.trim())) {
      i++;
      const raw = [];
      let depth = 1;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^:::tabs\s*$/.test(t)) depth++;
        if (t === ':::') {
          depth--;
          if (depth === 0) break;
        }
        raw.push(lines[i]);
        i++;
      }
      i++; // closing :::
      out.push(renderTabs(raw, sub));
      continue;
    }

    // callout
    const callout = /^>\s*\[!([A-Z-]+)\]\s*(.*)$/.exec(line);
    if (callout) {
      const type = CALLOUT_TYPES[callout[1]] || CALLOUT_TYPES.NOTE;
      const customTitle = callout[2].trim();
      const buf = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        `<aside class="callout callout-${type.cls}" role="note">` +
          `<p class="callout-title">${ICONS[type.cls] || ''}<span>${escapeHtml(customTitle || type.label)}</span></p>` +
          `<div class="callout-body">${sub(buf.join('\n'))}</div></aside>`,
      );
      continue;
    }

    // plain blockquote
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${sub(buf.join('\n'))}</blockquote>`);
      continue;
    }

    // heading
    const heading = /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const rawText = heading[2].trim().replace(/\s*#+\s*$/, '');
      const id = uniqueSlug(rawText);
      if (level <= 3) toc.push({ level, id, text: rawText.replace(/`/g, '') });
      out.push(
        `<h${level} id="${id}">${inline(rawText, ctx)}` +
          `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`,
      );
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const header = splitRow(lines[i]);
      const align = splitRow(lines[i + 1]).map((c) => {
        const t = c.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return '';
      });
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const th = header
        .map((c, n) => `<th${align[n] ? ` style="text-align:${align[n]}"` : ''}>${inline(c.trim(), ctx)}</th>`)
        .join('');
      const tb = rows
        .map(
          (r) =>
            '<tr>' +
            r
              .map((c, n) => `<td${align[n] ? ` style="text-align:${align[n]}"` : ''}>${inline(c.trim(), ctx)}</td>`)
              .join('') +
            '</tr>',
        )
        .join('');
      out.push(`<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }

    // list
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const [html, next] = renderList(lines, i, sub, ctx);
      out.push(html);
      i = next;
      continue;
    }

    // paragraph
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(?:#{2,6}\s|>|:::|`{3,}|~{3,}|\||[-*+]\s|\d+\.\s)/.test(lines[i]) &&
      !/^\s*(?:---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '), ctx)}</p>`);
    else i++;
  }

  return { html: out.join('\n'), toc };
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
}

/**
 * Lists, including nesting. Items are gathered by indentation, then each item
 * body is rendered recursively so it can contain code blocks or sub-lists.
 */
function renderList(lines, start, sub, ctx) {
  const first = /^(\s*)([-*+]|\d+\.)\s+/.exec(lines[start]);
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
    if (!m) {
      // A blank line may be interior to a loose list; look ahead one line.
      if (!lines[i].trim() && i + 1 < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i + 1])) {
        const nextIndent = /^(\s*)/.exec(lines[i + 1])[1].length;
        if (nextIndent >= baseIndent) {
          i++;
          continue;
        }
      }
      break;
    }
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      // Belongs to the previous item; fold it into that item's body.
      if (items.length) items[items.length - 1].push(lines[i].slice(baseIndent));
      i++;
      continue;
    }
    items.push([m[3]]);
    i++;

    // Continuation lines indented past the marker belong to this item.
    while (i < lines.length) {
      if (!lines[i].trim()) {
        const ahead = lines[i + 1];
        if (ahead && /^\s{2,}\S/.test(ahead) && /^(\s*)/.exec(ahead)[1].length > baseIndent) {
          items[items.length - 1].push('');
          i++;
          continue;
        }
        break;
      }
      const ind = /^(\s*)/.exec(lines[i])[1].length;
      if (ind > baseIndent) {
        items[items.length - 1].push(lines[i].slice(baseIndent));
        i++;
      } else break;
    }
  }

  const tag = ordered ? 'ol' : 'ul';
  const body = items
    .map((item) => {
      const text = item.join('\n');
      const multi = /\n/.test(text.trim()) || /^\s*(?:[-*+]|\d+\.)\s/m.test(text.replace(/^[^\n]*/, ''));
      const rendered = multi ? sub(text) : inline(text.trim(), ctx);
      return `<li>${rendered}</li>`;
    })
    .join('');
  return [`<${tag}>${body}</${tag}>`, i];
}

const ICONS = {
  note: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4M8 4.8v.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  tip: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.8a4.2 4.2 0 0 0-2.4 7.65V11h4.8V9.45A4.2 4.2 0 0 0 8 1.8Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6.4 13h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  best: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.2 8.4 6.4 11.6l6.4-6.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.4 14.6 13.4H1.4Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.4v3.1M8 11.3v.05" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  danger: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  deprecated: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.2 8h5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  legacy: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const PLATFORM_ICONS = {
  ios: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M11 1.8c-.9.1-1.9.6-2.5 1.3-.5.6-1 1.6-.8 2.5 1 .1 2-.4 2.6-1.1.6-.7 1-1.7.7-2.7Z" fill="currentColor"/><path d="M13.6 11.3c-.5 1.1-.8 1.6-1.4 2.6-.9 1.3-2.1 3-3.6 3-1.3 0-1.7-.9-3.5-.9s-2.2.9-3.5.9c-1.5 0-2.6-1.5-3.5-2.9C-.1 11.4-.4 8 1 6.1c.9-1.3 2.3-2 3.6-2 1.4 0 2.2.9 3.4.9 1.1 0 1.8-.9 3.4-.9 1.2 0 2.4.6 3.3 1.7-2.9 1.6-2.4 5.7-1.1 5.5Z" fill="currentColor" transform="translate(0.6 -1.2) scale(0.92)"/></svg>',
  android:
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.2 6.4h9.6v5.2a.9.9 0 0 1-.9.9H4.1a.9.9 0 0 1-.9-.9Z" fill="currentColor"/><rect x="1" y="6.4" width="1.6" height="4.4" rx=".8" fill="currentColor"/><rect x="13.4" y="6.4" width="1.6" height="4.4" rx=".8" fill="currentColor"/><rect x="5" y="12.9" width="1.6" height="2.4" rx=".8" fill="currentColor"/><rect x="9.4" y="12.9" width="1.6" height="2.4" rx=".8" fill="currentColor"/><path d="M3.3 5.6a4.7 4.7 0 0 1 9.4 0Z" fill="currentColor"/><circle cx="5.8" cy="3.6" r=".55" fill="var(--code-bg)"/><circle cx="10.2" cy="3.6" r=".55" fill="var(--code-bg)"/></svg>',
  npm: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1 4.5h14v7H8.6v-5H6.3v5H1Z" fill="currentColor"/></svg>',
  yarn: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.4 10.8c.6-2 1.7-3.2 3.2-4.2M7.4 4.6c.5.7.6 1.4.3 2.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  pnpm: '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="1.6" y="1.6" width="3.6" height="3.6" fill="currentColor"/><rect x="6.2" y="1.6" width="3.6" height="3.6" fill="currentColor"/><rect x="10.8" y="1.6" width="3.6" height="3.6" fill="currentColor"/><rect x="6.2" y="6.2" width="3.6" height="3.6" fill="currentColor"/><rect x="10.8" y="6.2" width="3.6" height="3.6" fill="currentColor"/><rect x="10.8" y="10.8" width="3.6" height="3.6" fill="currentColor"/></svg>',
};

function tabIcon(label) {
  const key = label.trim().toLowerCase();
  if (key === 'ios') return PLATFORM_ICONS.ios;
  if (key === 'android') return PLATFORM_ICONS.android;
  if (key === 'npm') return PLATFORM_ICONS.npm;
  if (key === 'yarn') return PLATFORM_ICONS.yarn;
  if (key === 'pnpm') return PLATFORM_ICONS.pnpm;
  return '';
}

function renderTabs(rawLines, sub) {
  const tabs = [];
  let current = null;
  for (const line of rawLines) {
    const m = /^@tab\s+(.+)$/.exec(line.trim());
    if (m) {
      current = { label: m[1].trim(), body: [] };
      tabs.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  if (!tabs.length) return '';

  const group = `tabs-${++uid}`;
  // A stable key per label set lets the runtime sync every iOS/Android group
  // on the page at once, which is what a reader following a setup guide wants.
  const syncKey = tabs.map((t) => t.label.toLowerCase()).join('|');

  const buttons = tabs
    .map(
      (t, n) =>
        `<button role="tab" type="button" id="${group}-t${n}" aria-controls="${group}-p${n}" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}" data-label="${escapeHtml(t.label)}">${tabIcon(t.label)}<span>${escapeHtml(t.label)}</span></button>`,
    )
    .join('');

  const panels = tabs
    .map(
      (t, n) =>
        `<div role="tabpanel" id="${group}-p${n}" aria-labelledby="${group}-t${n}"${n === 0 ? '' : ' hidden'}>${sub(t.body.join('\n'))}</div>`,
    )
    .join('');

  return `<div class="tabs" data-sync="${escapeHtml(syncKey)}"><div class="tablist" role="tablist">${buttons}</div>${panels}</div>`;
}

/** Strips markup so a page body can be indexed as plain search text. */
export function toPlainText(body) {
  return body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^:::.*$/gm, ' ')
    .replace(/^@tab\s+.*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?\[![A-Z-]+\]\s*/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
