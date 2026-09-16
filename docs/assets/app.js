/* React Native CLI Handbook — client runtime.
   No dependencies. Everything degrades: the nav is <details>, the tabs render
   all panels, and the pages are readable with this file blocked. */
(function () {
  'use strict';

  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var DESKTOP = 1040;

  /* ------------------------------------------------------------- theme */

  function applyTheme(pref) {
    var dark = pref === 'dark' || (pref === 'system' && mq.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme-pref', pref);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute(
        'aria-label',
        'Theme: ' + pref + '. Activate to switch to ' + nextPref(pref) + '.',
      );
      btn.querySelectorAll('[data-icon]').forEach(function (el) {
        el.hidden = el.getAttribute('data-icon') !== pref;
      });
    }
  }

  function nextPref(p) {
    return p === 'light' ? 'dark' : p === 'dark' ? 'system' : 'light';
  }

  function readPref() {
    try {
      var v = localStorage.getItem('rn-theme');
      if (v === 'light' || v === 'dark' || v === 'system') return v;
    } catch (e) {
      /* storage can throw in private mode; fall through to system */
    }
    return 'system';
  }

  var pref = readPref();
  applyTheme(pref);

  if (mq.addEventListener) {
    mq.addEventListener('change', function () {
      if (readPref() === 'system') applyTheme('system');
    });
  }

  var themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      pref = nextPref(readPref());
      try {
        localStorage.setItem('rn-theme', pref);
      } catch (e) {
        /* ignore */
      }
      applyTheme(pref);
    });
  }

  /* ----------------------------------------------------------- menus */

  var menus = Array.prototype.slice.call(document.querySelectorAll('details.menu'));

  function closeMenus(except) {
    menus.forEach(function (m) {
      if (m !== except) m.open = false;
    });
  }

  menus.forEach(function (m) {
    var summary = m.querySelector('summary');

    m.addEventListener('toggle', function () {
      if (m.open) closeMenus(m);
    });

    // Hover-to-open only where there is a real pointer — never on touch.
    var timer;
    m.addEventListener('mouseenter', function () {
      if (!fine.matches || window.innerWidth < DESKTOP) return;
      clearTimeout(timer);
      m.open = true;
    });
    m.addEventListener('mouseleave', function () {
      if (!fine.matches || window.innerWidth < DESKTOP) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        m.open = false;
      }, 180);
    });

    if (summary) {
      summary.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' && m.open) {
          var first = m.querySelector('.menu-panel a');
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('details.menu')) closeMenus(null);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = menus.filter(function (m) {
      return m.open;
    });
    if (open.length) {
      open.forEach(function (m) {
        m.open = false;
      });
      var s = open[0].querySelector('summary');
      if (s) s.focus();
    }
  });

  /* -------------------------------------------------------- mobile nav */

  var burger = document.getElementById('nav-toggle');
  var navmenus = document.getElementById('navmenus');

  function setDrawer(open) {
    if (!navmenus || !burger) return;
    navmenus.hidden = !open;
    burger.setAttribute('aria-expanded', String(open));
    if (!open) closeMenus(null);
  }

  function syncViewport() {
    if (!navmenus || !burger) return;
    if (window.innerWidth >= DESKTOP) {
      navmenus.hidden = false;
      burger.setAttribute('aria-expanded', 'false');
      closeMenus(null);
    } else if (burger.getAttribute('aria-expanded') !== 'true') {
      navmenus.hidden = true;
    }
  }

  if (burger && navmenus) {
    burger.addEventListener('click', function () {
      setDrawer(navmenus.hidden);
    });
    navmenus.addEventListener('click', function (e) {
      if (e.target.closest('a') && window.innerWidth < DESKTOP) setDrawer(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && window.innerWidth < DESKTOP && !navmenus.hidden) {
        setDrawer(false);
        burger.focus();
      }
    });
    window.addEventListener('resize', syncViewport);
    syncViewport();
  }

  /* ------------------------------------------------------------- tabs */

  function selectTab(group, index, focus) {
    var buttons = group.querySelectorAll('.tablist button');
    var panels = group.querySelectorAll('[role="tabpanel"]');
    for (var i = 0; i < buttons.length; i++) {
      var on = i === index;
      buttons[i].setAttribute('aria-selected', String(on));
      buttons[i].tabIndex = on ? 0 : -1;
      if (panels[i]) panels[i].hidden = !on;
    }
    if (focus && buttons[index]) buttons[index].focus();
  }

  var tabGroups = Array.prototype.slice.call(document.querySelectorAll('.tabs'));

  function syncGroups(key, label) {
    tabGroups.forEach(function (g) {
      if (g.getAttribute('data-sync') !== key) return;
      var buttons = g.querySelectorAll('.tablist button');
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute('data-label') === label) {
          selectTab(g, i, false);
          break;
        }
      }
    });
  }

  tabGroups.forEach(function (group) {
    var key = group.getAttribute('data-sync');
    var buttons = Array.prototype.slice.call(group.querySelectorAll('.tablist button'));

    // Restore a previous choice so a reader who picked Android keeps Android.
    try {
      var saved = localStorage.getItem('rn-tab:' + key);
      if (saved) {
        buttons.forEach(function (b, i) {
          if (b.getAttribute('data-label') === saved) selectTab(group, i, false);
        });
      }
    } catch (e) {
      /* ignore */
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        var label = btn.getAttribute('data-label');
        try {
          localStorage.setItem('rn-tab:' + key, label);
        } catch (e) {
          /* ignore */
        }
        syncGroups(key, label);
        selectTab(group, i, false);
      });

      btn.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = (i + 1) % buttons.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + buttons.length) % buttons.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = buttons.length - 1;
        if (next === null) return;
        e.preventDefault();
        selectTab(group, next, true);
      });
    });
  });

  /* ------------------------------------------------------------- copy */

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy');
    if (!btn) return;
    var fig = btn.closest('figure.code');
    var code = fig && fig.querySelector('code');
    if (!code) return;
    var text = code.innerText;

    var done = function () {
      var label = btn.querySelector('span');
      var prev = label ? label.textContent : '';
      btn.classList.add('done');
      if (label) label.textContent = 'Copied';
      setTimeout(function () {
        btn.classList.remove('done');
        if (label) label.textContent = prev || 'Copy';
      }, 1400);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (err) {
        /* nothing useful to do; the code is still selectable by hand */
      }
      document.body.removeChild(ta);
    }
  });

  /* --------------------------------------------------------- scroll-spy */

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    var headings = [];
    tocLinks.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var el = document.getElementById(id);
      if (el) {
        byId[id] = a;
        headings.push(el);
      }
    });

    var visible = new Set();
    var setActive = function (id) {
      tocLinks.forEach(function (a) {
        a.classList.remove('active');
      });
      if (byId[id]) byId[id].classList.add('active');
    };

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        // Highlight the topmost heading currently in the reading band; if none
        // is, keep the last one scrolled past.
        var first = headings.filter(function (h) {
          return visible.has(h.id);
        })[0];
        if (first) {
          setActive(first.id);
        } else {
          var above = headings.filter(function (h) {
            return h.getBoundingClientRect().top < 120;
          });
          if (above.length) setActive(above[above.length - 1].id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach(function (h) {
      io.observe(h);
    });
  }

  /* ----------------------------------------------------------- search */

  var overlay = document.getElementById('search-overlay');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var openBtn = document.getElementById('search-open');
  var index = null;
  var loading = false;
  var lastFocus = null;
  var selIndex = 0;
  var current = [];

  function loadIndex() {
    if (index || loading) return Promise.resolve(index);
    loading = true;
    var base = document.body.getAttribute('data-base') || '';
    return fetch(base + 'search-index.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (json) {
        index = json;
        loading = false;
        return index;
      })
      .catch(function () {
        loading = false;
        return null;
      });
  }

  function openSearch() {
    if (!overlay) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    loadIndex().then(function () {
      if (input && input.value) render(input.value);
    });
    if (input) {
      input.value = '';
      input.focus();
    }
    render('');
  }

  function closeSearch() {
    if (!overlay) return;
    overlay.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function mark(text, terms) {
    var out = escapeHtml(text);
    terms.forEach(function (t) {
      if (t.length < 2) return;
      out = out.replace(
        new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'),
        '<mark>$1</mark>',
      );
    });
    return out;
  }

  function score(entry, terms) {
    var s = 0;
    var title = entry.t.toLowerCase();
    var section = entry.s.toLowerCase();
    var headings = (entry.h || []).join(' ').toLowerCase();
    var body = (entry.b || '').toLowerCase();

    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      var hit = 0;
      if (title === t) hit += 120;
      if (title.indexOf(t) === 0) hit += 60;
      if (title.indexOf(t) !== -1) hit += 40;
      if (section.indexOf(t) !== -1) hit += 10;
      if (headings.indexOf(t) !== -1) hit += 18;
      if (body.indexOf(t) !== -1) hit += 6;
      if (!hit) return 0; // every term must appear somewhere
      s += hit;
    }
    return s;
  }

  function snippet(entry, terms) {
    var body = entry.b || entry.d || '';
    var lower = body.toLowerCase();
    var at = -1;
    for (var i = 0; i < terms.length && at === -1; i++) at = lower.indexOf(terms[i]);
    if (at === -1) return entry.d || body.slice(0, 140);
    var start = Math.max(0, at - 50);
    return (start > 0 ? '…' : '') + body.slice(start, start + 160) + '…';
  }

  function render(query) {
    if (!results) return;
    var q = query.trim().toLowerCase();
    if (!q) {
      results.innerHTML = '<p class="search-empty">Type to search ' +
        (index ? index.length : '') + ' pages.</p>';
      current = [];
      return;
    }
    if (!index) {
      results.innerHTML = '<p class="search-empty">Loading index…</p>';
      return;
    }
    var terms = q.split(/\s+/).filter(Boolean);
    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var s = score(index[i], terms);
      if (s > 0) scored.push([s, index[i]]);
    }
    scored.sort(function (a, b) {
      return b[0] - a[0];
    });
    current = scored.slice(0, 25).map(function (x) {
      return x[1];
    });
    selIndex = 0;

    if (!current.length) {
      results.innerHTML = '<p class="search-empty">No matches for “' + escapeHtml(query) + '”.</p>';
      return;
    }
    var base = document.body.getAttribute('data-base') || '';
    results.innerHTML = current
      .map(function (e, n) {
        return (
          '<a href="' + base + e.u + '" class="' + (n === 0 ? 'sel' : '') + '">' +
          '<span class="r-sec">' + escapeHtml(e.s) + '</span>' +
          '<span class="r-title">' + mark(e.t, terms) + '</span>' +
          '<span class="r-snip">' + mark(snippet(e, terms), terms) + '</span>' +
          '</a>'
        );
      })
      .join('');
  }

  function moveSel(delta) {
    var links = results ? results.querySelectorAll('a') : [];
    if (!links.length) return;
    links[selIndex] && links[selIndex].classList.remove('sel');
    selIndex = (selIndex + delta + links.length) % links.length;
    links[selIndex].classList.add('sel');
    links[selIndex].scrollIntoView({ block: 'nearest' });
  }

  if (openBtn) openBtn.addEventListener('click', openSearch);

  if (input) {
    input.addEventListener('input', function () {
      render(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSel(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSel(-1);
      } else if (e.key === 'Enter') {
        var links = results ? results.querySelectorAll('a') : [];
        if (links[selIndex]) {
          e.preventDefault();
          window.location.href = links[selIndex].getAttribute('href');
        }
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSearch();
    });
  }

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
      e.preventDefault();
      openSearch();
    } else if (e.key === 'Escape' && overlay && !overlay.hidden) {
      closeSearch();
    }
  });

  // Warm the index on idle so the first search feels instant.
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadIndex);
  else setTimeout(loadIndex, 1500);
})();
