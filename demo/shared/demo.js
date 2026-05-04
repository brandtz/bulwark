/* Bulwark Demo Shell — single-script glue layer.
 *
 * Responsibilities:
 *   1. Soft auth gate (client-side only — keeps casual visitors and crawlers out).
 *   2. Session + role persistence in localStorage.
 *   3. Role-aware sidebar/bottom-nav rewriting by icon + text match.
 *   4. Toast-stub all unwired buttons / dead links so nothing feels broken.
 *   5. Floating role pill so the presenter can hop between portals live.
 *
 * NOTE: This is a vaporware demo. There is no real backend, no real security.
 *       The credentials are present on the client by design (presenter-shared).
 */
(function () {
  'use strict';

  // ---- Config ---------------------------------------------------------------
  var CREDS = {
    email: 'thebrandt@gmail.com',
    password: 'Bulwark2026!'
  };

  var SESSION_KEY = 'bulwark_session_v1';
  var ROLE_KEY = 'bulwark_role_v1';

  var ROLES = {
    admin:     { label: 'Admin Portal',        home: '/admin/dashboard',     color: '#1d4ed8' },
    field:     { label: 'Field Contractor',    home: '/field/dashboard',     color: '#16a34a' },
    sub:       { label: 'Subcontractor',       home: '/sub/dashboard',       color: '#7c3aed' },
    homeowner: { label: 'Homeowner',           home: '/homeowner/dashboard', color: '#0891b2' }
  };

  // Canonical nav routes per role. Matched against sidebar/bottom-nav items
  // by lowercase text content OR FontAwesome icon class on a child <i>.
  var NAV_MAP = {
    admin: [
      { match: ['home', 'dashboard', 'fa-house', 'fa-gauge'], href: '/admin/dashboard' },
      { match: ['pipeline', 'properties', 'property', 'fa-layer-group', 'fa-building'], href: '/admin/pipeline' },
      { match: ['jobs', 'work orders', 'work-orders', 'fa-clipboard-list', 'fa-briefcase'], href: '/admin/work-orders' },
      { match: ['quotes', 'fa-file-invoice-dollar', 'fa-file-invoice'], href: '/admin/quotes' },
      { match: ['subcontractors', 'subs', 'fa-users-gear', 'fa-people-group'], href: '/admin/subcontractors' },
      { match: ['compliance', 'docs', 'fa-shield-halved', 'fa-file-shield', 'fa-file-contract'], href: '/admin/compliance' },
      { match: ['invoices', 'billing', 'fa-receipt', 'fa-money-check-dollar'], href: '/admin/invoices' },
      { match: ['users', 'team', 'fa-user-gear', 'fa-users'], href: '/admin/users' },
      { match: ['standards', 'fa-list-check', 'fa-clipboard-check'], href: '/admin/standards' },
      { match: ['audit', 'fa-scroll', 'fa-clipboard'], href: '/admin/audit-log' },
      { match: ['settings', 'menu', 'fa-gear', 'fa-cog', 'fa-bars'], href: '/admin/settings' }
    ],
    field: [
      { match: ['home', 'dashboard', 'fa-house', 'fa-gauge'], href: '/field/dashboard' },
      { match: ['pipeline', 'properties', 'property', 'fa-layer-group', 'fa-building'], href: '/admin/pipeline' },
      { match: ['my jobs', 'jobs', 'work orders', 'fa-clipboard-list', 'fa-briefcase'], href: '/field/my-jobs' },
      { match: ['assessments', 'fa-clipboard-check'], href: '/admin/assessment' },
      { match: ['quotes', 'fa-file-invoice-dollar', 'fa-file-invoice'], href: '/admin/quote-overview' },
      { match: ['profile', 'account', 'fa-user', 'fa-user-circle'], href: '/field/profile' },
      { match: ['settings', 'menu', 'fa-gear', 'fa-cog', 'fa-bars'], href: '/admin/settings' }
    ],
    sub: [
      { match: ['home', 'dashboard', 'jobs', 'my jobs', 'fa-house', 'fa-gauge', 'fa-clipboard-list'], href: '/sub/dashboard' },
      { match: ['profile', 'account', 'fa-user', 'fa-user-circle'], href: '/sub/profile' }
    ],
    homeowner: [
      { match: ['home', 'dashboard', 'fa-house', 'fa-gauge'], href: '/homeowner/dashboard' },
      { match: ['progress', 'job', 'fa-list-check', 'fa-timeline'], href: '/homeowner/job-progress' },
      { match: ['documents', 'docs', 'fa-folder', 'fa-file-lines'], href: '/homeowner/documents' },
      { match: ['invoice', 'billing', 'pay', 'fa-receipt', 'fa-money-check-dollar', 'fa-credit-card'], href: '/homeowner/invoice' },
      { match: ['profile', 'account', 'fa-user', 'fa-user-circle'], href: '/homeowner/profile' }
    ]
  };

  // ---- Session helpers ------------------------------------------------------
  function isAuthed() {
    try { return localStorage.getItem(SESSION_KEY) === 'ok'; }
    catch (e) { return false; }
  }
  function setAuthed() {
    try { localStorage.setItem(SESSION_KEY, 'ok'); } catch (e) {}
  }
  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ROLE_KEY);
    } catch (e) {}
  }
  function getRole() {
    try { return localStorage.getItem(ROLE_KEY) || 'admin'; }
    catch (e) { return 'admin'; }
  }
  function setRole(r) {
    if (!ROLES[r]) return;
    try { localStorage.setItem(ROLE_KEY, r); } catch (e) {}
  }

  window.BulwarkDemo = {
    creds: CREDS,
    isAuthed: isAuthed,
    setAuthed: setAuthed,
    clearSession: clearSession,
    getRole: getRole,
    setRole: setRole,
    roles: ROLES
  };

  var path = window.location.pathname.toLowerCase();
  var isLoginPage = /\/login(\.html)?$/.test(path) || path === '/login' || path.endsWith('/login.html');
  var isPickerPage = path === '/' || path.endsWith('/index.html') || path === '';
  var isErrorPage = path.endsWith('/404.html');

  // ---- Auth gate ------------------------------------------------------------
  if (!isAuthed() && !isLoginPage && !isErrorPage) {
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/login.html?next=' + next);
    return;
  }

  // ---- Inject noindex meta + shell on every page ----------------------------
  function injectMeta() {
    if (document.querySelector('meta[name="robots"]')) return;
    var m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow, noarchive, nosnippet';
    document.head.appendChild(m);
  }

  function ensureToastStack() {
    var s = document.getElementById('bw-toast-stack');
    if (s) return s;
    s = document.createElement('div');
    s.id = 'bw-toast-stack';
    document.body.appendChild(s);
    return s;
  }

  function toast(msg) {
    var stack = ensureToastStack();
    var el = document.createElement('div');
    el.className = 'bw-toast';
    el.innerHTML = '<i class="fa-solid fa-circle-info bw-toast-icon"></i><span></span>';
    el.querySelector('span').textContent = msg;
    stack.appendChild(el);
    setTimeout(function () { el.classList.add('bw-toast-fade'); }, 1800);
    setTimeout(function () { el.remove(); }, 2100);
  }
  window.BulwarkDemo.toast = toast;

  // ---- Role pill ------------------------------------------------------------
  function renderRolePill() {
    if (isLoginPage || isPickerPage || isErrorPage) return;
    if (document.body.classList.contains('bw-no-shell')) return;
    if (document.getElementById('bw-role-pill')) return;
    var role = getRole();
    var roleConf = ROLES[role] || ROLES.admin;
    var pill = document.createElement('div');
    pill.id = 'bw-role-pill';
    pill.innerHTML =
      '<span class="bw-role-dot" style="background:' + roleConf.color + '"></span>' +
      '<select aria-label="Switch portal view">' +
        '<option value="admin">Admin</option>' +
        '<option value="field">Field Contractor</option>' +
        '<option value="sub">Subcontractor</option>' +
        '<option value="homeowner">Homeowner</option>' +
      '</select>' +
      '<button class="bw-logout" type="button">Sign out</button>';
    var sel = pill.querySelector('select');
    sel.value = role;
    sel.addEventListener('change', function () {
      var newRole = sel.value;
      setRole(newRole);
      window.location.href = ROLES[newRole].home;
    });
    pill.querySelector('.bw-logout').addEventListener('click', function () {
      clearSession();
      window.location.href = '/login.html';
    });
    document.body.appendChild(pill);
  }

  // ---- Nav rewriter ---------------------------------------------------------
  // Walks every <a href="#"> (or button) inside obvious nav containers and
  // tries to map it to a canonical URL by text or icon class.
  function rewriteNav() {
    var role = getRole();
    var routes = NAV_MAP[role] || NAV_MAP.admin;

    // candidate containers — sidebars, bottom nav, top nav
    var sels = [
      'aside a', 'aside button',
      'nav a', 'nav button',
      '#desktop-sidebar a', '#mobile-bottom-nav a', '#mobile-bottom-nav button',
      '[id*="sidebar"] a', '[id*="bottom-nav"] a', '[id*="bottom-nav"] button',
      '[class*="sidebar"] a', '[class*="bottom-nav"] a'
    ];
    var seen = new Set();
    sels.forEach(function (sel) {
      var nodes;
      try { nodes = document.querySelectorAll(sel); } catch (e) { return; }
      nodes.forEach(function (n) {
        if (seen.has(n)) return;
        seen.add(n);
        var text = (n.textContent || '').trim().toLowerCase();
        var iconClasses = '';
        var icon = n.querySelector('i');
        if (icon) iconClasses = (icon.className || '').toLowerCase();
        for (var i = 0; i < routes.length; i++) {
          var r = routes[i];
          var matched = r.match.some(function (m) {
            if (m.indexOf('fa-') === 0) return iconClasses.indexOf(m) !== -1;
            return text === m || text.indexOf(m) !== -1;
          });
          if (matched) {
            n.setAttribute('href', r.href);
            n.dataset.bwLinked = '1';
            // Strip any onclick stubs
            n.onclick = null;
            return;
          }
        }
      });
    });
  }

  // Wire any <a href> that already points to a relative .html in the demo to keep working.
  // Wire any <a> with data-bw-href to that route.
  function wireExplicit() {
    document.querySelectorAll('[data-bw-href]').forEach(function (n) {
      n.setAttribute('href', n.getAttribute('data-bw-href'));
      n.dataset.bwLinked = '1';
    });
  }

  // ---- Narrative flow wiring ------------------------------------------------
  // Per-path rules. Each rule finds button/link by visible text and makes it
  // navigate to a target URL. Use "*" to match anywhere; otherwise lowercased
  // substring match against trimmed textContent.
  var FLOW_RULES = {
    '/admin/dashboard': [
      { text: 'view pipeline', href: '/admin/pipeline' },
      { text: 'view all properties', href: '/admin/pipeline' },
      { text: 'view all', href: '/admin/pipeline' },
      { text: 'new property', href: '/admin/property-new' },
      { text: 'new quote', href: '/admin/quote-builder' }
    ],
    '/admin/pipeline': [
      { text: 'add property', href: '/admin/property-new' },
      { text: 'new property', href: '/admin/property-new' },
      { text: 'create property', href: '/admin/property-new' },
      // First card "View" / property name → property detail
      { selector: '[class*="property-card"], [class*="kanban-card"]', href: '/admin/property-detail', allMatching: true }
    ],
    '/admin/property-new': [
      { text: 'save', href: '/admin/property-detail' },
      { text: 'create property', href: '/admin/property-detail' },
      { text: 'continue', href: '/admin/property-detail' }
    ],
    '/admin/property-detail': [
      { text: 'start assessment', href: '/admin/assessment' },
      { text: 'new assessment', href: '/admin/assessment' },
      { text: 'edit property', href: '/admin/property-new' },
      { text: 'generate quote', href: '/admin/quote-builder' },
      { text: 'create quote', href: '/admin/quote-builder' },
      { text: 'view quote', href: '/admin/quote-overview' },
      { text: 'view work order', href: '/admin/work-order-detail' },
      { text: 'view compliance', href: '/admin/compliance-preview' }
    ],
    '/admin/assessment': [
      { text: 'submit assessment', href: '/admin/assessment-summary' },
      { text: 'complete assessment', href: '/admin/assessment-summary' },
      { text: 'finish', href: '/admin/assessment-summary' },
      { text: 'review', href: '/admin/assessment-summary' },
      { text: 'next', href: '/admin/assessment-summary' },
      { text: 'cancel', href: '/admin/property-detail' }
    ],
    '/admin/assessment-summary': [
      { text: 'start quote builder', href: '/admin/quote-builder' },
      { text: 'start quote', href: '/admin/quote-builder' },
      { text: 'generate quote', href: '/admin/quote-builder' },
      { text: 'edit assessment', href: '/admin/assessment' },
      { text: 'done', href: '/admin/property-detail' }
    ],
    '/admin/quote-builder': [
      { text: 'preview quote', href: '/admin/quote-overview' },
      { text: 'preview', href: '/admin/quote-overview' },
      { text: 'send quote', href: '/admin/quote-overview' },
      { text: 'save quote', href: '/admin/quote-overview' },
      { text: 'review', href: '/admin/quote-overview' },
      { text: 'next', href: '/admin/quote-overview' }
    ],
    '/admin/quote-overview': [
      { text: 'create work order', href: '/admin/work-order-detail' },
      { text: 'approve', href: '/admin/work-order-detail' },
      { text: 'edit quote', href: '/admin/quote-builder' },
      { text: 'back to property', href: '/admin/property-detail' }
    ],
    '/admin/work-orders': [
      { text: 'new work order', href: '/admin/work-order-detail' },
      { selector: '[class*="work-order-card"], tbody tr, [class*="job-card"]', href: '/admin/work-order-detail', allMatching: true }
    ],
    '/admin/work-order-detail': [
      { text: 'generate compliance', href: '/admin/compliance' },
      { text: 'compliance doc', href: '/admin/compliance' },
      { text: 'generate invoice', href: '/admin/invoice-detail' },
      { text: 'create invoice', href: '/admin/invoice-detail' },
      { text: 'view invoice', href: '/admin/invoice-detail' },
      { text: 'mark complete', href: '/admin/work-orders' },
      { text: 'assign sub', href: '/admin/subcontractors' }
    ],
    '/admin/subcontractors': [
      { text: 'add sub', href: '/admin/subcontractor-detail' },
      { text: 'new sub', href: '/admin/subcontractor-detail' },
      { selector: 'tbody tr, [class*="sub-card"], [class*="subcontractor-card"]', href: '/admin/subcontractor-detail', allMatching: true }
    ],
    '/admin/compliance': [
      { text: 'generate document', href: '/admin/compliance-preview' },
      { text: 'preview', href: '/admin/compliance-preview' },
      { text: 'generate', href: '/admin/compliance-preview' },
      { text: 'next', href: '/admin/compliance-preview' }
    ],
    '/admin/compliance-preview': [
      { text: 'edit', href: '/admin/compliance' },
      { text: 'done', href: '/admin/work-order-detail' },
      { text: 'back', href: '/admin/compliance' }
    ],
    '/admin/invoices': [
      { text: 'new invoice', href: '/admin/invoice-detail' },
      { selector: 'tbody tr, [class*="invoice-card"]', href: '/admin/invoice-detail', allMatching: true }
    ],
    '/admin/invoice-detail': [
      { text: 'send invoice', href: '/admin/invoices' },
      { text: 'mark paid', href: '/admin/invoices' },
      { text: 'back to invoices', href: '/admin/invoices' }
    ],
    '/admin/quotes': [
      { text: 'new quote', href: '/admin/quote-builder' },
      { selector: 'tbody tr, [class*="quote-card"]', href: '/admin/quote-overview', allMatching: true }
    ],
    '/admin/users': [ { text: 'invite user', href: '/admin/users' } ],
    '/admin/settings': [
      { text: 'users', href: '/admin/users' },
      { text: 'standards', href: '/admin/standards' },
      { text: 'audit log', href: '/admin/audit-log' }
    ],
    '/field/dashboard': [
      { text: 'view pipeline', href: '/admin/pipeline' },
      { text: 'all jobs', href: '/field/my-jobs' },
      { text: 'my jobs', href: '/field/my-jobs' },
      { text: 'new property', href: '/admin/property-new' },
      { text: 'start assessment', href: '/admin/assessment' }
    ],
    '/field/my-jobs': [
      { selector: 'tbody tr, [class*="job-card"], [class*="work-order-card"]', href: '/admin/work-order-detail', allMatching: true }
    ],
    '/sub/dashboard': [
      { selector: '[class*="job-card"], tbody tr', href: '/sub/job-detail', allMatching: true }
    ],
    '/sub/job-detail': [
      { text: 'mark complete', href: '/sub/dashboard' },
      { text: 'update status', href: '/sub/dashboard' },
      { text: 'back', href: '/sub/dashboard' }
    ],
    '/homeowner/dashboard': [
      { text: 'view progress', href: '/homeowner/job-progress' },
      { text: 'view documents', href: '/homeowner/documents' },
      { text: 'view invoice', href: '/homeowner/invoice' },
      { text: 'pay invoice', href: '/homeowner/invoice' }
    ],
    '/homeowner/invoice': [
      { text: 'pay now', href: '/homeowner/invoice' },
      { text: 'back', href: '/homeowner/dashboard' }
    ]
  };

  function applyFlowRules() {
    var p = window.location.pathname.replace(/\.html$/i, '');
    var rules = FLOW_RULES[p];
    if (!rules) return;

    rules.forEach(function (rule) {
      if (rule.selector) {
        var nodes = document.querySelectorAll(rule.selector);
        var count = 0;
        nodes.forEach(function (n) {
          if (n.dataset.bwLinked === '1') return;
          if (n.tagName.toLowerCase() === 'a') {
            n.setAttribute('href', rule.href);
          } else {
            n.style.cursor = 'pointer';
            n.addEventListener('click', function (ev) {
              if (ev.target.closest('button:not([data-bw-pass]), input, select, textarea')) return;
              window.location.href = rule.href;
            });
          }
          n.dataset.bwLinked = '1';
          count++;
          if (!rule.allMatching && count >= 1) return;
        });
        return;
      }
      // text rule: find first matching <a> or <button>
      var needle = (rule.text || '').toLowerCase();
      if (!needle) return;
      var candidates = document.querySelectorAll('a, button');
      for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        if (el.dataset.bwLinked === '1') continue;
        if (el.closest('#bw-role-pill')) continue;
        var t = (el.textContent || '').trim().toLowerCase();
        if (!t) continue;
        if (t.indexOf(needle) === -1) continue;
        if (el.tagName.toLowerCase() === 'a') {
          el.setAttribute('href', rule.href);
        } else {
          el.addEventListener('click', function (href) {
            return function (ev) { ev.preventDefault(); window.location.href = href; };
          }(rule.href));
        }
        el.dataset.bwLinked = '1';
        break;
      }
    });
  }

  // Attach a fallback handler to anything still dead so it gives visible feedback.
  function stubDeadActions() {
    function isDead(el) {
      if (el.dataset.bwLinked === '1') return false;
      var tag = el.tagName.toLowerCase();
      if (tag === 'a') {
        var h = el.getAttribute('href');
        return !h || h === '#' || h.startsWith('javascript:');
      }
      if (tag === 'button') {
        return el.type !== 'submit' || !el.form;
      }
      return false;
    }
    function labelFor(el) {
      var t = (el.getAttribute('aria-label') || el.title || el.textContent || '').trim();
      t = t.replace(/\s+/g, ' ');
      if (t.length > 60) t = t.slice(0, 57) + '…';
      return t || 'Action';
    }
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest('a, button');
      if (!el) return;
      if (el.closest('#bw-role-pill')) return;
      if (el.closest('form') && el.type === 'submit') return;
      if (!isDead(el)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var label = labelFor(el);
      toast(label ? 'Demo: ' + label : 'Demo action');
    }, true);
  }

  // Block native form submits that would 404
  function blockFormSubmits() {
    document.addEventListener('submit', function (ev) {
      var f = ev.target;
      if (f && f.dataset.bwAllowSubmit === '1') return;
      ev.preventDefault();
      toast('Demo: form submitted');
    }, true);
  }

  // ---- Boot -----------------------------------------------------------------
  function boot() {
    injectMeta();
    if (!isLoginPage && !isPickerPage && !isErrorPage) {
      rewriteNav();
      wireExplicit();
      applyFlowRules();
      renderRolePill();
    }
    stubDeadActions();
    blockFormSubmits();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
