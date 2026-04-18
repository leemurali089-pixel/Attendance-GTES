// Mail client UI (renderer). Calls main-process Gmail via window.electronAPI.gmail.*

const MailUI = (() => {
    const LS_HIDE_NEWSLETTERS = 'mail_hide_newsletters';
    const state = {
        labelId: 'INBOX',
        filter: 'all',
        offset: 0,
        pageSize: 100,
        total: 0,
        items: [],
        selectedId: null,
        selectedMessage: null,
        search: '',
        syncing: false,
        hideNewsletters: localStorage.getItem(LS_HIDE_NEWSLETTERS) !== '0' // default ON
    };

    function $(sel, root = document) { return root.querySelector(sel); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function fmtDate(ms) {
        if (!ms) return '';
        const d = new Date(Number(ms));
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function senderName(from) {
        if (!from) return '';
        const m = /^\s*"?([^"<]+?)"?\s*<([^>]+)>/.exec(from);
        if (m) return m[1].trim();
        return from;
    }

    function senderAddr(from) {
        if (!from) return '';
        const m = /<([^>]+)>/.exec(from);
        return m ? m[1] : from;
    }

    function flagBadges(m) {
        const b = [];
        if (m.unread) b.push('<span class="badge bg-primary me-1">New</span>');
        if (m.poFlag) b.push('<span class="badge bg-warning text-dark me-1"><i class="bi bi-receipt"></i> PO</span>');
        if (m.bankFlag) b.push('<span class="badge bg-info text-dark me-1"><i class="bi bi-bank"></i> Bank</span>');
        if (m.spamFlag) b.push('<span class="badge bg-danger me-1"><i class="bi bi-shield-exclamation"></i> Spam</span>');
        if (m.hasAttachments) b.push('<span class="badge bg-secondary me-1"><i class="bi bi-paperclip"></i></span>');
        if (m.newsletterFlag && !m.spamFlag) b.push('<span class="badge me-1 mail-badge-newsletter">Newsletter</span>');
        return b.join('');
    }

    // Inject once: theme-aware skin for the Mail / PO Queue / Bank Mail
    // views. Everything funnels through CSS custom properties so the
    // rule-set stays single-sourced and only the token values flip when
    // the user switches between `data-theme="dark"` and `data-theme="light"`
    // on <html>. This is what prevents "white text on white pane" the old
    // unscoped dark-only stylesheet caused in light mode.
    function ensureMailStyles() {
        if (document.getElementById('mailUI-theme-css')) return;
        const s = document.createElement('style');
        s.id = 'mailUI-theme-css';
        s.textContent = `
          /* ---------- Tokens (defaults = dark) ---------- */
          .mail-app,
          #poQueueView,
          #bankMailView,
          .mail-preview-modal {
            --mail-fg:            #eef2f8;
            --mail-fg-strong:     #ffffff;
            --mail-fg-meta:       #d7dfe9;
            --mail-fg-muted:      #b8c2d0;
            --mail-fg-muted-2:    #c7d0dc;
            --mail-card-bg:       rgba(255,255,255,.03);
            --mail-border:        rgba(255,255,255,.10);
            --mail-border-strong: rgba(255,255,255,.14);
            --mail-row-hover:     rgba(255,255,255,.05);
            --mail-table-head:    #9fb0c4;
            --mail-link:          #9ec9ff;
            --mail-link-hover:    #c0dcff;
            --mail-success:       #5ae18f;
            --mail-info:          #7cd9ff;
            --mail-warning:       #ffd275;
            --mail-danger:        #ff9191;
            --mail-primary:       #9ec9ff;
            --mail-primary-border:#5b8fd6;
            --mail-primary-hover-bg:#3876d9;
            --mail-input-bg:      rgba(255,255,255,.06);
            --mail-input-bg-focus:rgba(255,255,255,.10);
            --mail-input-fg:      #eef2f8;
            --mail-input-border:  rgba(255,255,255,.18);
            --mail-input-placeholder:#95a2b5;
            --mail-modal-bg:      #1b2331;
            --mail-dropdown-bg:   #222a37;
            --mail-dropdown-fg:   #e4e8ef;
            --mail-dropdown-muted:#9aa6b7;
            --mail-highlight-bg:  rgba(255,201,97,.10);
            --mail-highlight-fg:  #ffe3a8;
            --mail-badge-bg:      rgba(255,255,255,.12);
            --mail-badge-fg:      #e6ebf3;
            --mail-badge-border:  rgba(255,255,255,.15);
            --mail-close-filter:  invert(1) grayscale(1) brightness(2);
          }

          /* ---------- Light-theme overrides ---------- */
          [data-theme="light"] .mail-app,
          [data-theme="light"] #poQueueView,
          [data-theme="light"] #bankMailView,
          [data-theme="light"] .mail-preview-modal {
            --mail-fg:            #1a202c;
            --mail-fg-strong:     #0f172a;
            --mail-fg-meta:       #334155;
            --mail-fg-muted:      #475569;
            --mail-fg-muted-2:    #334155;
            --mail-card-bg:       rgba(255,255,255,.92);
            --mail-border:        rgba(15,23,42,.12);
            --mail-border-strong: rgba(15,23,42,.20);
            --mail-row-hover:     rgba(15,23,42,.04);
            --mail-table-head:    #475569;
            --mail-link:          #1d4ed8;
            --mail-link-hover:    #1e3a8a;
            --mail-success:       #047857;
            --mail-info:          #0369a1;
            --mail-warning:       #b45309;
            --mail-danger:        #b91c1c;
            --mail-primary:       #1d4ed8;
            --mail-primary-border:#3b82f6;
            --mail-primary-hover-bg:#1e40af;
            --mail-input-bg:      #ffffff;
            --mail-input-bg-focus:#ffffff;
            --mail-input-fg:      #1a202c;
            --mail-input-border:  rgba(15,23,42,.18);
            --mail-input-placeholder:#6b7280;
            --mail-modal-bg:      #ffffff;
            --mail-dropdown-bg:   #ffffff;
            --mail-dropdown-fg:   #1a202c;
            --mail-dropdown-muted:#64748b;
            --mail-highlight-bg:  rgba(251,191,36,.20);
            --mail-highlight-fg:  #78350f;
            --mail-badge-bg:      rgba(15,23,42,.07);
            --mail-badge-fg:      #1a202c;
            --mail-badge-border:  rgba(15,23,42,.12);
            --mail-close-filter:  none;
          }

          /* ---------- Base / text ---------- */
          .mail-app,
          #poQueueView,
          #bankMailView { color: var(--mail-fg); }

          .mail-app .text-muted,
          #poQueueView .text-muted,
          #bankMailView .text-muted { color: var(--mail-fg-muted) !important; }
          .mail-app .small.text-muted,
          #poQueueView .small.text-muted,
          #bankMailView .small.text-muted { color: var(--mail-fg-muted-2) !important; }

          /* ---------- Cards, borders ---------- */
          .mail-app .card,
          #poQueueView .card,
          #bankMailView .card {
            background: var(--mail-card-bg);
            border-color: var(--mail-border);
          }
          .mail-app .border,
          #poQueueView .border,
          #bankMailView .border { border-color: var(--mail-border-strong) !important; }

          /* ---------- Tables ---------- */
          #poQueueView .table,
          #bankMailView .table,
          .mail-app .table {
            color: var(--mail-fg);
            --bs-table-bg: transparent;
            --bs-table-color: var(--mail-fg);
            --bs-table-striped-bg: var(--mail-row-hover);
            --bs-table-hover-bg: var(--mail-row-hover);
            --bs-table-border-color: var(--mail-border-strong);
          }
          #poQueueView thead th,
          #bankMailView thead th,
          .mail-app thead th {
            color: var(--mail-table-head);
            font-weight: 600;
            letter-spacing: .02em;
            text-transform: uppercase;
            font-size: .72rem;
            border-bottom-color: var(--mail-border-strong) !important;
            background: transparent;
          }
          #poQueueView td,
          #bankMailView td,
          .mail-app td { border-color: var(--mail-border) !important; vertical-align: middle; }
          #poQueueView td.small,
          #bankMailView td.small { color: var(--mail-fg-muted-2); }
          #poQueueView tr:hover > td,
          #bankMailView tr:hover > td { background: var(--mail-row-hover); }

          /* ---------- Links ---------- */
          #poQueueView .table a,
          #bankMailView .table a,
          .mail-app a { color: var(--mail-link); text-decoration: none; }
          #poQueueView .table a:hover,
          #bankMailView .table a:hover,
          .mail-app a:hover { color: var(--mail-link-hover); text-decoration: underline; }

          /* ---------- Outline buttons ---------- */
          .mail-app .btn-outline-light,
          #poQueueView .btn-outline-light,
          #bankMailView .btn-outline-light {
            color: var(--mail-fg); border-color: var(--mail-border-strong);
          }
          .mail-app .btn-outline-light:hover,
          #poQueueView .btn-outline-light:hover,
          #bankMailView .btn-outline-light:hover {
            background: var(--mail-row-hover); color: var(--mail-fg-strong);
          }
          #poQueueView .btn-outline-primary,
          #bankMailView .btn-outline-primary,
          .mail-app .btn-outline-primary { color: var(--mail-primary); border-color: var(--mail-primary-border); }
          #poQueueView .btn-outline-primary:hover,
          #bankMailView .btn-outline-primary:hover,
          .mail-app .btn-outline-primary:hover { background: var(--mail-primary-hover-bg); color: #fff; border-color: var(--mail-primary-hover-bg); }
          #poQueueView .btn-outline-secondary,
          #bankMailView .btn-outline-secondary,
          .mail-app .btn-outline-secondary { color: var(--mail-fg-muted-2); border-color: var(--mail-border-strong); }
          #poQueueView .btn-outline-secondary:hover,
          #bankMailView .btn-outline-secondary:hover,
          .mail-app .btn-outline-secondary:hover { background: var(--mail-row-hover); color: var(--mail-fg-strong); }
          #poQueueView .btn-outline-success { color: var(--mail-success); border-color: var(--mail-success); }
          #poQueueView .btn-outline-warning,
          .mail-app .btn-outline-warning { color: var(--mail-warning); border-color: var(--mail-warning); }
          #poQueueView .btn-outline-danger,
          #bankMailView .btn-outline-danger,
          .mail-app .btn-outline-danger { color: var(--mail-danger); border-color: var(--mail-danger); }
          #poQueueView .btn-outline-info,
          #bankMailView .btn-outline-info { color: var(--mail-info); border-color: var(--mail-info); }
          #poQueueView .btn.active,
          #bankMailView .btn.active,
          .mail-app .btn.active { color: #fff !important; }

          /* ---------- Text colour helpers ---------- */
          .mail-app .text-success,
          #poQueueView .text-success,
          #bankMailView .text-success { color: var(--mail-success) !important; }
          .mail-app .text-info,
          #poQueueView .text-info,
          #bankMailView .text-info    { color: var(--mail-info) !important; }
          .mail-app .text-warning,
          #poQueueView .text-warning,
          #bankMailView .text-warning { color: var(--mail-warning) !important; }
          .mail-app .text-danger,
          #poQueueView .text-danger,
          #bankMailView .text-danger  { color: var(--mail-danger) !important; }

          /* Invoice-picker yellow highlight rows */
          #poQueueView .table-warning > *,
          #bankMailView .table-warning > * {
            --bs-table-bg: var(--mail-highlight-bg);
            --bs-table-color: var(--mail-highlight-fg);
            color: var(--mail-highlight-fg) !important;
          }

          /* ---------- Badges ---------- */
          #poQueueView .badge.bg-secondary,
          #bankMailView .badge.bg-secondary,
          .mail-app .badge.bg-secondary {
            background: var(--mail-badge-bg) !important;
            color: var(--mail-badge-fg) !important;
            border: 1px solid var(--mail-badge-border);
            font-weight: 500;
          }
          .mail-app .mail-badge-newsletter {
            background: rgba(73,83,96,.85) !important;
            color: #f1f5f9 !important;
            border: 1px solid rgba(73,83,96,.95);
          }
          [data-theme="light"] .mail-app .mail-badge-newsletter {
            background: rgba(71,85,105,.14) !important;
            color: #334155 !important;
            border-color: rgba(71,85,105,.28);
          }

          /* ---------- Form controls ---------- */
          .mail-app input.form-control,
          #poQueueView input.form-control,
          #bankMailView input.form-control,
          .mail-app .form-control-sm,
          #poQueueView .form-control-sm,
          #bankMailView .form-control-sm {
            background: var(--mail-input-bg);
            color: var(--mail-input-fg);
            border-color: var(--mail-input-border);
          }
          .mail-app input.form-control:focus,
          #poQueueView input.form-control:focus,
          #bankMailView input.form-control:focus {
            background: var(--mail-input-bg-focus);
            color: var(--mail-input-fg);
            border-color: var(--mail-primary-border);
            box-shadow: 0 0 0 .15rem rgba(91,143,214,.25);
          }
          .mail-app input.form-control::placeholder,
          #poQueueView input.form-control::placeholder,
          #bankMailView input.form-control::placeholder { color: var(--mail-input-placeholder); }

          /* "bg-dark-subtle" is near-white in light theme and near-black in
             dark, so we neutralise it to our token colours inside mail views */
          .mail-app .bg-dark-subtle,
          #poQueueView .bg-dark-subtle,
          #bankMailView .bg-dark-subtle {
            background: var(--mail-card-bg) !important;
            color: var(--mail-fg) !important;
          }

          /* ---------- Modals we own ---------- */
          /* Scoped to modals that carry mail-app / mail-preview-modal —
             don't touch Bootstrap modals that the rest of the app opens. */
          .mail-app .modal-content,
          .mail-preview-modal .modal-content {
            background: var(--mail-modal-bg);
            color: var(--mail-fg);
            border: 1px solid var(--mail-border-strong);
          }
          .mail-app .modal-header,
          .mail-preview-modal .modal-header { border-bottom-color: var(--mail-border-strong); }
          .mail-app .modal-footer,
          .mail-preview-modal .modal-footer { border-top-color: var(--mail-border-strong); }
          .mail-app .btn-close,
          .mail-preview-modal .btn-close { filter: var(--mail-close-filter); }
          .mail-app .sticky-top.bg-body,
          .mail-preview-modal .sticky-top.bg-body { background: var(--mail-modal-bg) !important; }

          /* ---------- Mail list rows ---------- */
          .mail-app .mail-row[data-id] { border-bottom: 1px solid var(--mail-border); }
          .mail-app .mail-row[data-id]:hover { background: var(--mail-row-hover); }
          .mail-app .mail-row.unread strong { color: var(--mail-fg-strong); }
          .mail-app .mail-row .small.text-muted { color: var(--mail-fg-muted-2) !important; }
          .mail-app .mail-row .ms-2 span,
          .mail-app .mail-row .ms-2 { color: var(--mail-fg-meta) !important; }

          /* Per-row classification dropdown */
          .mail-app .mail-row-actions .mail-row-menu { color: var(--mail-fg-muted) !important; padding: 2px 6px !important; }
          .mail-app .mail-row-actions .mail-row-menu:hover { color: var(--mail-fg-strong) !important; background: var(--mail-row-hover) !important; border-radius: 4px; }
          .mail-app .dropdown-menu.dropdown-menu-dark { background: var(--mail-dropdown-bg); border: 1px solid var(--mail-border); min-width: 260px; }
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-header { color: var(--mail-dropdown-muted); letter-spacing:.03em; text-transform: uppercase; font-size: .7rem; }
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-item { color: var(--mail-dropdown-fg); padding: 6px 14px; }
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-item:hover,
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-item:focus { background: rgba(86,139,242,.18); color: var(--mail-fg-strong); }
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-item .small.text-muted { color: var(--mail-dropdown-muted) !important; }
          .mail-app .dropdown-menu.dropdown-menu-dark .dropdown-divider { border-top-color: var(--mail-border); }

          /* ---------- Message viewer (inline + modal preview) ---------- */
          .mail-app #mailView_body .mail-msg-title,
          .mail-preview-modal .mail-msg-title { color: var(--mail-fg-strong); margin-bottom: .25rem; }
          .mail-app #mailView_body .mail-msg-meta,
          .mail-preview-modal .mail-msg-meta { color: var(--mail-fg-meta); }
          .mail-app #mailView_body .mail-msg-meta strong,
          .mail-preview-modal .mail-msg-meta strong { color: var(--mail-fg-strong); }
          .mail-app #mailView_body .mail-msg-date,
          .mail-preview-modal .mail-msg-date { color: var(--mail-fg-muted); }
          .mail-app #mailView_body .mail-msg-bodytext,
          .mail-preview-modal .mail-msg-bodytext {
            white-space: pre-wrap;
            color: var(--mail-fg);
            background: var(--mail-card-bg);
            padding: 12px;
            border-radius: 6px;
          }
          .mail-preview-modal #attBody {
            background: var(--mail-card-bg);
            color: var(--mail-fg);
            overflow: auto;
          }

          /* Error banner inside mail list (keep noticeable but not ugly) */
          .mail-app #mailList .alert { border: 0; }
          .mail-app #mailList .alert-warning {
            color: var(--mail-warning); background: rgba(255,210,117,.10); border-left: 3px solid var(--mail-warning);
          }

          .mail-app .form-check-label,
          #poQueueView .form-check-label,
          #bankMailView .form-check-label { color: var(--mail-fg-muted-2) !important; }
          #poQueueView .po-link-summary {
            background: var(--mail-card-bg);
            color: var(--mail-fg);
          }

          @keyframes mailui-spin { to { transform: rotate(360deg); } }
          .mail-app .spin,
          #poQueueView .spin,
          #bankMailView .spin { display: inline-block; animation: mailui-spin .8s linear infinite; }
        `;
        document.head.appendChild(s);
    }

    function isGmailAvailable() {
        return !!(typeof window !== 'undefined'
            && window.electronAPI
            && window.electronAPI.gmail);
    }

    // Drop-in renderer used by Mail / PO Queue / Bank Mail when the user is
    // running the **web** version of the app. The Gmail integration needs
    // Electron (OAuth loopback, safeStorage, filesystem cache), so in a plain
    // browser we show a clear, themed "desktop-only" card instead of crashing
    // on the first `window.electronAPI.gmail.*` call.
    function renderDesktopOnlyNotice(viewId, opts) {
        const view = document.getElementById(viewId);
        if (!view) return;
        const o = opts || {};
        const title = o.title || 'Gmail';
        const feature = o.feature || 'This feature';
        const icon = o.icon || 'bi-envelope';
        ensureMailStyles();
        view.innerHTML = `
          <div class="mail-app px-3 py-3">
            <div class="card" style="max-width: 760px; margin: 48px auto;">
              <div class="card-body text-center py-5">
                <i class="bi ${icon} display-1 text-secondary d-block mb-3"></i>
                <h3 class="mb-2">${esc(title)} is available in the Desktop app</h3>
                <p class="text-muted mb-1">
                  ${esc(feature)} uses the Gmail API with OAuth 2.0, encrypted token storage
                  and a local mail cache — all of which only run inside the
                  <b>Gas Tech Engineering desktop app</b>.
                </p>
                <p class="text-muted small mb-4">
                  You are currently using the browser / web version. Install the desktop app
                  to connect your Gmail, see POs, and track bank alerts.
                </p>
                <div class="d-flex gap-2 justify-content-center flex-wrap">
                  <a class="btn btn-primary" href="https://github.com/leemurali089-pixel/Attendance-GTES" target="_blank" rel="noopener">
                    <i class="bi bi-github"></i> Get the Desktop App
                  </a>
                  <button class="btn btn-outline-secondary" onclick="App.showView('dashboard')">
                    <i class="bi bi-arrow-left"></i> Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>`;
    }

    async function load() {
        const view = document.getElementById('mailView');
        if (!view) return;
        if (!isGmailAvailable()) {
            renderDesktopOnlyNotice('mailView', {
                title: 'Mail',
                feature: 'The built-in Gmail mail client',
                icon: 'bi-envelope'
            });
            return;
        }
        ensureMailStyles();
        view.innerHTML = renderShell();
        bindShell();
        await refreshStatusBar();
        await refreshList();
        // Fire-and-forget: upgrade existing index entries with PO/Bank/attachment
        // flags using Gmail-side queries. First time it runs it backfills
        // every existing record. Runs at most once per session.
        if (!MailUI._enrichedOnce) {
            MailUI._enrichedOnce = true;
            try {
                window.electronAPI.gmail.enrichFlags().then(() => refreshList()).catch(() => {});
            } catch {}
        }
    }

    function renderShell() {
        return `
        <div class="mail-app px-3 py-3">
          <div class="d-flex align-items-center mb-3 gap-2 flex-wrap">
            <h3 class="mb-0 me-2"><i class="bi bi-envelope"></i> Mail</h3>
            <div class="btn-group btn-group-sm" role="group" id="mailLabelGroup">
              <button type="button" class="btn btn-outline-primary active" data-label="INBOX">Inbox</button>
              <button type="button" class="btn btn-outline-primary" data-label="SENT">Sent</button>
            </div>
            <div class="btn-group btn-group-sm ms-2" role="group" id="mailFilterGroup">
              <button type="button" class="btn btn-outline-secondary active" data-filter="all">All</button>
              <button type="button" class="btn btn-outline-secondary" data-filter="unread">Unread</button>
              <button type="button" class="btn btn-outline-warning" data-filter="po">PO</button>
              <button type="button" class="btn btn-outline-info" data-filter="bank">Bank</button>
              <button type="button" class="btn btn-outline-secondary" data-filter="attachments">With files</button>
            </div>
            <div class="ms-auto d-flex align-items-center gap-2">
              <input type="search" id="mailSearch" class="form-control form-control-sm" placeholder="Search subject/sender" style="width:240px">
              <div class="form-check form-switch mb-0 small text-muted" title="Hide newsletters / marketing">
                <input class="form-check-input" type="checkbox" id="mailHideNewsletters" ${state.hideNewsletters ? 'checked' : ''}>
                <label class="form-check-label" for="mailHideNewsletters">Hide newsletters</label>
              </div>
              <button class="btn btn-sm btn-outline-warning" id="mailCleanNewsBtn" title="Move all visible newsletters to Spam"><i class="bi bi-broom"></i> Clean</button>
              <button class="btn btn-sm btn-outline-light" id="mailRulesBtn" title="Manage learned senders (PO / Bank / Spam)"><i class="bi bi-bookmark-star"></i> Rules</button>
              <button class="btn btn-sm btn-outline-light" id="mailRefreshBtn" title="Refresh list from local cache (no network)"><i class="bi bi-arrow-repeat"></i></button>
              <button class="btn btn-sm btn-outline-light" id="mailSyncBtn" title="Pull new mail from Gmail"><i class="bi bi-cloud-download"></i> Sync</button>
              <button class="btn btn-sm btn-primary" id="mailComposeBtn"><i class="bi bi-pencil-square"></i> Compose</button>
              <button class="btn btn-sm btn-outline-info" id="mailSettingsBtn"><i class="bi bi-gear"></i></button>
            </div>
          </div>

          <div id="mailStatusBar" class="small text-muted mb-2"></div>

          <div class="row g-3">
            <div class="col-md-5">
              <div class="card" style="height:calc(100vh - 230px)">
                <div class="card-body p-0 d-flex flex-column" style="overflow:hidden">
                  <div id="mailList" class="flex-grow-1" style="overflow:auto"></div>
                  <div class="border-top p-2 d-flex justify-content-between align-items-center" id="mailPager">
                    <span class="small text-muted" id="mailPagerInfo"></span>
                    <div>
                      <button class="btn btn-sm btn-outline-secondary" id="mailPrev">Prev</button>
                      <button class="btn btn-sm btn-outline-secondary" id="mailNext">Next</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="col-md-7">
              <div class="card" style="height:calc(100vh - 230px)">
                <div class="card-body p-0 d-flex flex-column" style="overflow:hidden">
                  <div id="mailView_body" class="p-3" style="overflow:auto">
                    <div class="text-center text-muted mt-5">
                      <i class="bi bi-envelope-open display-4 d-block mb-3"></i>
                      Select a message to read
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        `;
    }

    function bindShell() {
        document.querySelectorAll('#mailLabelGroup button').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('#mailLabelGroup button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.labelId = btn.dataset.label;
                state.offset = 0;
                refreshList();
            };
        });
        document.querySelectorAll('#mailFilterGroup button').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('#mailFilterGroup button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.filter = btn.dataset.filter;
                state.offset = 0;
                refreshList();
            };
        });
        $('#mailSearch').oninput = (e) => {
            state.search = e.target.value.trim().toLowerCase();
            renderList();
        };
        $('#mailRefreshBtn').onclick = async () => {
            const btn = $('#mailRefreshBtn');
            btn.disabled = true;
            btn.querySelector('i').classList.add('spin');
            try {
                await refreshStatusBar();
                await refreshList();
            } finally {
                btn.disabled = false;
                btn.querySelector('i').classList.remove('spin');
            }
        };
        $('#mailSyncBtn').onclick = async () => {
            $('#mailSyncBtn').disabled = true;
            try { await window.electronAPI.gmail.syncNow(); } finally {
                $('#mailSyncBtn').disabled = false;
                await refreshStatusBar();
                await refreshList();
            }
        };
        $('#mailHideNewsletters').onchange = (e) => {
            state.hideNewsletters = !!e.target.checked;
            localStorage.setItem(LS_HIDE_NEWSLETTERS, state.hideNewsletters ? '1' : '0');
            renderList();
        };
        $('#mailCleanNewsBtn').onclick = async () => {
            const victims = state.items.filter(m => m.newsletterFlag);
            if (!victims.length) { App.showNotification('No newsletters on this page.', 'info'); return; }
            if (!confirm(`Move ${victims.length} newsletter message(s) to Spam?`)) return;
            let ok = 0;
            for (const m of victims) {
                try { const r = await window.electronAPI.gmail.reportSpam(m.id); if (r.success) ok++; } catch {}
            }
            App.showNotification(`Sent ${ok}/${victims.length} to Spam`, ok === victims.length ? 'success' : 'warning');
            await refreshList();
        };
        $('#mailComposeBtn').onclick = () => openCompose();
        $('#mailSettingsBtn').onclick = () => openSettings();
        $('#mailRulesBtn').onclick = () => openLearnedRules();
        $('#mailPrev').onclick = () => { state.offset = Math.max(0, state.offset - state.pageSize); refreshList(); };
        $('#mailNext').onclick = () => { if (state.offset + state.pageSize < state.total) { state.offset += state.pageSize; refreshList(); } };

        if (!MailUI._bound) {
            MailUI._bound = true;
            window.electronAPI.gmail.onSyncStatus((d) => {
                state.syncing = !!d.running;
                refreshStatusBar();
                if (!d.running) refreshList();
            });
        }
    }

    async function refreshStatusBar() {
        const bar = $('#mailStatusBar'); if (!bar) return;
        const st = await window.electronAPI.gmail.status();
        const s = st.data || {};
        const stateRes = await window.electronAPI.gmail.getState();
        const stt = (stateRes && stateRes.data) || {};
        const parts = [];
        if (!s.hasCredentials) parts.push('<span class="text-warning">OAuth credentials not set</span>');
        else if (!s.isLoggedIn) parts.push('<span class="text-warning">Not connected</span>');
        else parts.push(`<span class="text-success">Connected as ${esc(stt.accountEmail || 'Gmail')}</span>`);
        if (stt.lastSyncAt) parts.push(`Last sync: ${new Date(stt.lastSyncAt).toLocaleString()}`);
        if (state.syncing) parts.push('<span class="text-info">Syncing…</span>');
        if (!s.safeStorage) parts.push('<span class="text-warning">OS keychain unavailable — tokens unencrypted</span>');
        bar.innerHTML = parts.join(' • ');
    }

    async function refreshList() {
        const res = await window.electronAPI.gmail.list({
            labelId: state.labelId,
            offset: state.offset,
            limit: state.pageSize,
            filter: state.filter
        });
        if (!res.success) {
            const looksLikeCorruption = /JSON|Unexpected|position \d+/i.test(res.error || '');
            $('#mailList').innerHTML = `
              <div class="p-3">
                <div class="alert alert-warning small mb-2">
                  ${looksLikeCorruption
                    ? 'Local mail index looks out of shape. A quick reset will fix it.'
                    : 'Could not load mail: ' + esc(res.error)}
                </div>
                <button class="btn btn-sm btn-warning" id="mailListFixBtn"><i class="bi bi-arrow-clockwise"></i> Reset local cache &amp; resync</button>
              </div>`;
            const fix = document.getElementById('mailListFixBtn');
            if (fix) fix.onclick = async () => {
                fix.disabled = true; fix.textContent = 'Resetting…';
                try {
                    const r = await window.electronAPI.gmail.resetCache();
                    // Old builds of the main process don't register this handler.
                    // The IPC call rejects with "No handler registered for …".
                    if (!r || !r.success) {
                        const msg = (r && r.error) || 'Reset not available';
                        if (/No handler registered/i.test(msg)) {
                            $('#mailList').innerHTML = `
                              <div class="p-3">
                                <div class="alert alert-warning small mb-2">
                                  This button needs the updated main-process code.<br>
                                  Please fully quit the app (File → Quit) and run <code>npm start</code> again,
                                  then click Mail → the error will disappear automatically.
                                </div>
                              </div>`;
                            return;
                        }
                        throw new Error(msg);
                    }
                    await window.electronAPI.gmail.syncNow();
                    await refreshList();
                    await refreshStatusBar();
                } catch (e) {
                    fix.disabled = false;
                    fix.textContent = 'Reset local cache & resync';
                    $('#mailList').insertAdjacentHTML('afterbegin',
                        `<div class="p-2 small text-danger">${esc(e.message || String(e))}</div>`);
                }
            };
            return;
        }
        // Silent auto-heal: listLabelPage may have wiped a corrupt index and
        // returned empty. Kick a sync so the user doesn't stay on an empty list.
        if (res.data && res.data.healed) {
            try { window.electronAPI.gmail.syncNow(); } catch {}
        }
        state.total = res.data.total || 0;
        state.items = res.data.items || [];
        renderList();
        const info = $('#mailPagerInfo');
        if (info) {
            const from = state.total === 0 ? 0 : state.offset + 1;
            const to = Math.min(state.offset + state.pageSize, state.total);
            info.textContent = `${from}–${to} of ${state.total}`;
        }
    }

    function renderList() {
        const el = $('#mailList'); if (!el) return;
        let items = state.items;
        // "Hide newsletters" only auto-hides inside focused filters
        // (PO / Unread / Bank / With files). When the user explicitly picks
        // "All" they've asked to see everything, newsletters included.
        if (state.hideNewsletters && state.filter !== 'all') {
            items = items.filter(m => !m.newsletterFlag);
        }
        if (state.search) {
            const q = state.search;
            items = items.filter(m =>
                (m.subject || '').toLowerCase().includes(q) ||
                (m.from || '').toLowerCase().includes(q) ||
                (m.snippet || '').toLowerCase().includes(q)
            );
        }
        if (!items.length) {
            el.innerHTML = `<div class="p-4 text-center text-muted">No messages${state.filter !== 'all' ? ' for this filter' : ''}.${state.total === 0 ? ' Try clicking Sync.' : ''}${state.hideNewsletters ? ' <br><small>Newsletters are hidden — toggle off if you expected them here.</small>' : ''}</div>`;
            return;
        }
        el.innerHTML = items.map(m => `
          <div class="mail-row p-2 border-bottom ${m.unread ? 'fw-bold' : ''} ${state.selectedId === m.id ? 'bg-primary bg-opacity-10' : ''}"
               data-id="${esc(m.id)}" data-internal="${esc(m.internalDate)}" style="cursor:pointer;position:relative">
            <div class="d-flex justify-content-between align-items-start">
              <div class="text-truncate" style="max-width:60%">
                <i class="bi ${m.unread ? 'bi-envelope-fill text-primary' : 'bi-envelope-open'} me-1"></i>
                ${esc(senderName(m.from))}
              </div>
              <div class="small text-muted ms-2 d-flex align-items-center gap-1">
                <div class="dropdown mail-row-actions">
                  <button class="btn btn-sm p-0 px-1 mail-row-menu text-light" data-bs-toggle="dropdown" aria-expanded="false"
                          title="Classify / Actions" style="font-size:.95rem;line-height:1;border:0;background:transparent">
                    <i class="bi bi-three-dots-vertical"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow small">
                    <li><h6 class="dropdown-header">Teach the classifier</h6></li>
                    <li><button class="dropdown-item mail-classify" data-id="${esc(m.id)}" data-as="po">
                        <i class="bi bi-receipt text-warning me-1"></i>Mark as <b>PO</b>
                        <div class="small text-muted">Add to PO Queue &amp; learn sender</div>
                    </button></li>
                    <li><button class="dropdown-item mail-classify" data-id="${esc(m.id)}" data-as="bank">
                        <i class="bi bi-bank text-info me-1"></i>Mark as <b>Bank</b>
                        <div class="small text-muted">Add to Bank Mail &amp; learn sender</div>
                    </button></li>
                    <li><button class="dropdown-item mail-classify" data-id="${esc(m.id)}" data-as="spam">
                        <i class="bi bi-shield-exclamation text-danger me-1"></i>Mark as <b>Spam</b>
                        <div class="small text-muted">Learn sender &amp; move to Trash</div>
                    </button></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><button class="dropdown-item mail-row-archive-menu" data-id="${esc(m.id)}">
                        <i class="bi bi-archive me-1"></i>Archive (one-off)
                    </button></li>
                  </ul>
                </div>
                <span>${esc(fmtDate(m.internalDate))}</span>
              </div>
            </div>
            <div class="text-truncate small">${esc(m.subject || '(no subject)')}</div>
            <div class="text-truncate small text-muted">${flagBadges(m)}${esc((m.snippet || '').slice(0, 140))}</div>
          </div>
        `).join('');
        el.querySelectorAll('.mail-row').forEach(row => {
            row.onclick = (e) => {
                // Ignore clicks inside the actions menu (the toggle, the
                // menu itself, and any menu item click).
                if (e.target.closest('.mail-row-actions') || e.target.closest('.dropdown-menu')) return;
                openMessage(row.dataset.id, row.dataset.internal);
            };
        });
        el.querySelectorAll('.mail-classify').forEach(btn => btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.id;
            const as = btn.dataset.as;
            await applyClassification(id, as, btn);
        });
        el.querySelectorAll('.mail-row-archive-menu').forEach(btn => btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.id;
            btn.disabled = true;
            const r = await window.electronAPI.gmail.archive(id);
            if (r.success) { state.items = state.items.filter(x => x.id !== id); renderList(); }
            else App.showNotification('Archive failed: ' + r.error, 'error');
        });
    }

    async function applyClassification(messageId, type, originBtn) {
        const labels = { po: 'Purchase Order', bank: 'Bank transaction', spam: 'Spam' };
        if (!window.electronAPI.gmail.classifyAs) {
            App.showNotification('This feature needs the updated app. Please fully quit and restart.', 'warning');
            return;
        }
        if (originBtn) originBtn.disabled = true;
        try {
            const r = await window.electronAPI.gmail.classifyAs(messageId, type);
            if (r && r.success) {
                const d = r.data || {};
                const sender = d.sender || '';
                const retroCount = (d.retro && d.retro.INBOX) || 0;
                App.showNotification(
                    `Marked as ${labels[type]}. Learned ${sender}.${retroCount > 1 ? ` (${retroCount} mails retagged)` : ''}`,
                    'success'
                );
                // Remove the row from the current view immediately for spam; for
                // PO/Bank, refresh so the queues get picked up.
                if (type === 'spam') {
                    state.items = state.items.filter(x => x.id !== messageId);
                    renderList();
                } else {
                    await refreshList();
                }
            } else {
                App.showNotification('Could not classify: ' + ((r && r.error) || 'unknown error'), 'error');
            }
        } catch (e) {
            App.showNotification('Classify failed: ' + (e && e.message ? e.message : 'unknown'), 'error');
        } finally {
            if (originBtn) originBtn.disabled = false;
        }
    }

    async function openMessage(id, internalDate) {
        state.selectedId = id;
        renderList();
        const body = $('#mailView_body');
        body.innerHTML = '<div class="text-center p-4"><div class="spinner-border"></div></div>';
        const res = await window.electronAPI.gmail.getMessage({ id, internalDate: internalDate ? Number(internalDate) : undefined });
        if (!res.success || !res.data) {
            body.innerHTML = `<div class="text-danger p-3">Could not load message: ${esc(res.error || 'not found')}</div>`;
            return;
        }
        state.selectedMessage = res.data;
        renderMessage(res.data);
        // Auto-mark-read if unread
        if ((res.data.labelIds || []).includes('UNREAD')) {
            try { await window.electronAPI.gmail.markRead(id); } catch {}
            const item = state.items.find(x => x.id === id);
            if (item) { item.unread = false; renderList(); }
        }
    }

    // Build the message-preview HTML block used by both the inline mail
    // pane and the shared openMessagePreview() modal. `opts.idPrefix` lets
    // each caller scope its button IDs so two previews can coexist (e.g.
    // the inline pane and a popped-open modal) without colliding.
    function buildMessageHtml(m, opts = {}) {
        const p = opts.idPrefix || 'mail';
        const attachments = (m.attachments || []).map((a, i) => `
            <span class="badge bg-secondary me-2 mb-1" role="button" data-att-idx="${i}">
              <i class="bi bi-paperclip"></i> ${esc(a.filename)} <span class="text-light-emphasis">(${((a.size||0)/1024).toFixed(0)} KB)</span>
            </span>
        `).join('');

        const frameId = `${p}BodyFrame_${m.id || Date.now()}`;
        // Body fallback uses a class (mail-msg-bodytext) styled via theme
        // tokens, so plain-text bodies stay readable in both themes.
        const html = m.bodyHtml && m.bodyHtml.trim()
            ? `<iframe data-msgbody="${esc(frameId)}" sandbox="" style="width:100%;min-height:55vh;border:0;background:white;border-radius:6px"></iframe>`
            : `<pre class="mail-msg-bodytext">${esc(m.bodyText || m.snippet || '')}</pre>`;

        return `
          <div class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
            <div>
              <h5 class="mb-1 mail-msg-title">${esc(m.subject || '(no subject)')}</h5>
              <div class="small mail-msg-meta"><strong>From:</strong> ${esc(m.from)}</div>
              <div class="small mail-msg-meta"><strong>To:</strong> ${esc(m.to)}</div>
              ${m.cc ? `<div class="small mail-msg-meta"><strong>Cc:</strong> ${esc(m.cc)}</div>` : ''}
              <div class="small mail-msg-date">${new Date(Number(m.internalDate)).toLocaleString()}</div>
            </div>
            <div class="btn-group btn-group-sm" role="group" aria-label="Message actions">
              <button class="btn btn-outline-primary" data-msg-action="reply"><i class="bi bi-reply"></i> Reply</button>
              <button class="btn btn-outline-secondary" data-msg-action="archive"><i class="bi bi-archive"></i> Archive</button>
              <button class="btn btn-outline-danger" data-msg-action="trash"><i class="bi bi-trash"></i> Trash</button>
              <button class="btn btn-outline-warning" data-msg-action="spam"><i class="bi bi-shield-exclamation"></i> Spam</button>
            </div>
          </div>
          ${attachments ? `<div class="mb-2">${attachments}</div>` : ''}
          <div>${html}</div>
        `;
    }

    // Wire up the iframe srcdoc + button handlers inside `containerEl`.
    // `opts.afterAction(action)` is called after archive/trash/spam so the
    // caller can e.g. clear the pane (inline view) or hide the modal.
    function wireMessageHandlers(containerEl, m, opts = {}) {
        const frame = containerEl.querySelector('iframe[data-msgbody]');
        if (frame && m.bodyHtml) {
            frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:system-ui,sans-serif;color:#222;margin:12px}</style></head><body>${m.bodyHtml}</body></html>`;
        }
        const act = (name) => containerEl.querySelector(`[data-msg-action="${name}"]`);
        const replyBtn = act('reply');
        const archiveBtn = act('archive');
        const trashBtn = act('trash');
        const spamBtn = act('spam');
        if (replyBtn) replyBtn.onclick = () => openReply(m);
        if (archiveBtn) archiveBtn.onclick = async () => {
            await window.electronAPI.gmail.archive(m.id);
            if (opts.afterAction) await opts.afterAction('archive');
        };
        if (trashBtn) trashBtn.onclick = async () => {
            if (!confirm('Move to Trash?')) return;
            await window.electronAPI.gmail.trash(m.id);
            if (opts.afterAction) await opts.afterAction('trash');
        };
        if (spamBtn) spamBtn.onclick = async () => {
            await window.electronAPI.gmail.reportSpam(m.id);
            if (opts.afterAction) await opts.afterAction('spam');
        };
        containerEl.querySelectorAll('[data-att-idx]').forEach(el => {
            el.onclick = async () => {
                const idx = Number(el.dataset.attIdx);
                const a = m.attachments[idx];
                await previewAttachment(m.id, a);
            };
        });
    }

    function renderMessage(m) {
        const body = $('#mailView_body');
        body.innerHTML = buildMessageHtml(m, { idPrefix: 'mail' });
        wireMessageHandlers(body, m, {
            afterAction: async () => {
                try { await refreshList(); } catch {}
                body.innerHTML = '';
            }
        });
    }

    // Public: open a modal that previews a single message on top of
    // whatever view the user is currently on (Mail, PO Queue, Bank Mail,
    // anywhere). No navigation, no view switch.
    async function openMessagePreview(messageId, internalDate) {
        if (!messageId) return;
        ensureMailStyles();

        const modal = document.createElement('div');
        // `mail-preview-modal` scopes theme tokens + modal chrome (see
        // ensureMailStyles) so the preview pops correctly in both light
        // and dark themes. No inline hex colours below.
        modal.className = 'modal fade mail-preview-modal';
        modal.id = 'mailPreviewModal_' + Date.now();
        modal.tabIndex = -1;
        modal.innerHTML = `
          <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style="max-height:92vh">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-envelope-open"></i> Message preview</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" id="mailPreviewBody" style="min-height:60vh">
                <div class="text-center p-5"><div class="spinner-border"></div></div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const bs = new bootstrap.Modal(modal, { backdrop: true });
        bs.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());

        const bodyEl = modal.querySelector('#mailPreviewBody');
        let msg = null;
        try {
            const res = await window.electronAPI.gmail.getMessage({
                id: messageId,
                internalDate: internalDate ? Number(internalDate) : undefined
            });
            if (!res || !res.success || !res.data) {
                bodyEl.innerHTML = `<div class="text-danger p-3">Could not load message: ${esc((res && res.error) || 'not found')}</div>`;
                return;
            }
            msg = res.data;
        } catch (e) {
            bodyEl.innerHTML = `<div class="text-danger p-3">Error loading message: ${esc(e && e.message ? e.message : 'unknown')}</div>`;
            return;
        }

        bodyEl.innerHTML = buildMessageHtml(msg, { idPrefix: 'mailPrev' });
        wireMessageHandlers(bodyEl, msg, {
            afterAction: async () => {
                try { bs.hide(); } catch {}
            }
        });

        // Auto-mark-read if unread (fire and forget; refresh any list that is
        // listening via onQueueUpdated / onSyncStatus).
        if ((msg.labelIds || []).includes('UNREAD')) {
            try { await window.electronAPI.gmail.markRead(messageId); } catch {}
        }
    }

    async function previewAttachment(messageId, a) {
        const loader = document.createElement('div');
        loader.className = 'modal fade mail-preview-modal';
        loader.innerHTML = `
          <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style="max-height:90vh">
            <div class="modal-content" style="height:88vh">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-paperclip"></i> ${esc(a.filename)}
                  <small class="text-muted ms-2">(${((a.size||0)/1024).toFixed(0)} KB • ${esc(a.mimeType || 'unknown')})</small>
                </h5>
                <div class="ms-auto btn-group btn-group-sm">
                  <button class="btn btn-outline-primary" id="attDownload"><i class="bi bi-download"></i> Download</button>
                  <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
              <div class="modal-body p-0" id="attBody">
                <div class="text-center p-5"><div class="spinner-border"></div> <div class="mt-2">Loading attachment…</div></div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(loader);
        const modal = new bootstrap.Modal(loader);
        modal.show();
        loader.addEventListener('hidden.bs.modal', () => loader.remove());

        const res = await window.electronAPI.gmail.readAttachmentBytes({ messageId, attachmentId: a.attachmentId, filename: a.filename });
        if (!res.success) {
            loader.querySelector('#attBody').innerHTML = `<div class="p-4 text-danger">Error: ${esc(res.error)}</div>`;
            return;
        }
        const b64 = res.data.base64;
        const mt = (a.mimeType || '').toLowerCase();
        const dataUrl = `data:${mt || 'application/octet-stream'};base64,${b64}`;
        const body = loader.querySelector('#attBody');
        body.innerHTML = '';

        const ext = (a.filename || '').split('.').pop().toLowerCase();
        const isPdf = mt.includes('pdf') || ext === 'pdf';
        const isImg = mt.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext);
        const isText = mt.startsWith('text/') || ['txt','csv','log','json','xml','html','md'].includes(ext);

        if (isPdf) {
            body.innerHTML = `<iframe src="${dataUrl}" style="width:100%;height:100%;border:0;background:#fff"></iframe>`;
        } else if (isImg) {
            body.innerHTML = `<div class="text-center p-3"><img src="${dataUrl}" style="max-width:100%;max-height:80vh"></div>`;
        } else if (isText) {
            const txt = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
            body.innerHTML = `<pre class="mail-msg-bodytext">${esc(txt.slice(0, 200000))}</pre>`;
        } else {
            body.innerHTML = `
              <div class="p-5 text-center">
                <i class="bi bi-file-earmark display-1 d-block mb-3"></i>
                <p>No inline preview for <b>${esc(mt || 'this type')}</b>.</p>
                <p class="text-muted small">Use <b>Download</b> to open with your system viewer.</p>
              </div>`;
        }

        loader.querySelector('#attDownload').onclick = () => {
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = a.filename;
            link.click();
        };
    }

    function openReply(original) {
        const to = senderAddr(original.from);
        const subject = /^re:/i.test(original.subject || '') ? original.subject : `Re: ${original.subject || ''}`;
        openCompose({
            to, subject,
            threadId: original.threadId,
            replyTo: { messageIdHeader: original.messageIdHeader, references: original.references },
            quote: `\n\n--- On ${new Date(Number(original.internalDate)).toLocaleString()}, ${original.from} wrote: ---\n${original.bodyText || (original.bodyHtml || '').replace(/<[^>]+>/g,'')}`.slice(0, 5000)
        });
    }

    function openCompose(prefill = {}) {
        const id = 'composeModal_' + Date.now();
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = id;
        modal.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-pencil-square"></i> ${prefill.threadId ? 'Reply' : 'New message'}</h5>
                <button class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="mb-2"><label class="form-label">To</label><input id="cmpTo" class="form-control" value="${esc(prefill.to || '')}"></div>
                <div class="mb-2"><label class="form-label">Cc</label><input id="cmpCc" class="form-control" value="${esc(prefill.cc || '')}"></div>
                <div class="mb-2"><label class="form-label">Subject</label><input id="cmpSubject" class="form-control" value="${esc(prefill.subject || '')}"></div>
                <div class="mb-2"><label class="form-label">Body</label><textarea id="cmpBody" class="form-control" rows="10">${esc(prefill.quote || '')}</textarea></div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button class="btn btn-primary" id="cmpSendBtn"><i class="bi bi-send"></i> Send</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const m = new bootstrap.Modal(modal);
        m.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
        modal.querySelector('#cmpSendBtn').onclick = async () => {
            const to = modal.querySelector('#cmpTo').value.trim();
            const cc = modal.querySelector('#cmpCc').value.trim();
            const subject = modal.querySelector('#cmpSubject').value.trim();
            const text = modal.querySelector('#cmpBody').value;
            const html = text.replace(/\n/g, '<br>');
            if (!to) { alert('Please enter a recipient'); return; }
            const btn = modal.querySelector('#cmpSendBtn');
            btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Sending…';
            const res = await window.electronAPI.gmail.send({
                to, cc, subject, text, html,
                threadId: prefill.threadId, replyTo: prefill.replyTo
            });
            if (res.success) { App.showNotification('Message sent', 'success'); m.hide(); await refreshList(); }
            else { App.showNotification('Send failed: ' + res.error, 'error'); btn.disabled = false; btn.innerHTML = '<i class="bi bi-send"></i> Send'; }
        };
    }

    async function openSettings() {
        if (!isGmailAvailable()) {
            App.showNotification('Gmail Settings are available in the desktop app only. Install the desktop build to connect Gmail.', 'info');
            return;
        }
        const cur = await window.electronAPI.gmail.loadCredentials();
        const status = await window.electronAPI.gmail.status();
        const s = status.data || {};
        const loaded = cur.data || {};
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title"><i class="bi bi-gear"></i> Gmail Settings</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
              <div class="modal-body">
                <div class="alert alert-info small">
                  Create a <b>Desktop app</b> OAuth client at
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a>,
                  enable the <b>Gmail API</b>, add yourself as a Test user in the OAuth consent screen, then paste the Client ID and Secret below.
                </div>
                <div class="mb-2"><label class="form-label">Client ID</label>
                  <input id="gClientId" class="form-control" value="${esc(loaded.client_id || '')}" placeholder="xxxxxxxxxx.apps.googleusercontent.com"></div>
                <div class="mb-2"><label class="form-label">Client Secret</label>
                  <input id="gClientSecret" type="password" class="form-control" placeholder="${loaded.has_client_secret ? '•••••••• (saved)' : ''}"></div>
                <div class="d-flex gap-2 align-items-center mt-3">
                  <button class="btn btn-primary" id="gSaveCreds">Save credentials</button>
                  <button class="btn btn-success" id="gLogin" ${s.hasCredentials ? '' : 'disabled'}><i class="bi bi-google"></i> Connect Gmail</button>
                  <button class="btn btn-outline-danger" id="gLogout" ${s.isLoggedIn ? '' : 'disabled'}>Disconnect</button>
                </div>
                <hr>
                <div class="d-flex gap-2 flex-wrap">
                  <button class="btn btn-outline-primary" id="gInitial" ${s.isLoggedIn ? '' : 'disabled'}>Initial sync (up to 300 per label)</button>
                  <button class="btn btn-outline-secondary" id="gSyncNow" ${s.isLoggedIn ? '' : 'disabled'}>Sync now</button>
                  <button class="btn btn-outline-warning ms-auto" id="gResetCache" ${s.isLoggedIn ? '' : 'disabled'} title="Delete the local mail cache (index / messages / attachments / queues). Account stays connected.">
                    <i class="bi bi-trash"></i> Reset local cache
                  </button>
                </div>
                <div id="gStatus" class="small mt-3 text-muted">${s.isLoggedIn ? 'Connected' : 'Not connected'}</div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const m = new bootstrap.Modal(modal);
        m.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());

        modal.querySelector('#gSaveCreds').onclick = async () => {
            const client_id = modal.querySelector('#gClientId').value.trim();
            const secretInput = modal.querySelector('#gClientSecret').value;
            const creds = { client_id };
            if (secretInput) creds.client_secret = secretInput;
            if (!client_id) { modal.querySelector('#gStatus').innerHTML = '<span class="text-danger">Client ID is required.</span>'; return; }
            if (!secretInput && !loaded.has_client_secret) {
                modal.querySelector('#gStatus').innerHTML = '<span class="text-danger">Please paste the Client Secret at least once.</span>';
                return;
            }
            const r = await window.electronAPI.gmail.saveCredentials(creds);
            modal.querySelector('#gStatus').textContent = r.success ? 'Credentials saved.' : ('Error: ' + r.error);
            modal.querySelector('#gLogin').disabled = !r.success;
        };
        modal.querySelector('#gLogin').onclick = async () => {
            modal.querySelector('#gStatus').textContent = 'Opening Google consent in your browser…';
            const r = await window.electronAPI.gmail.login();
            if (r.success) {
                modal.querySelector('#gStatus').textContent = `Connected as ${r.data.email || ''}`;
                modal.querySelector('#gLogout').disabled = false;
                modal.querySelector('#gInitial').disabled = false;
                modal.querySelector('#gSyncNow').disabled = false;
                await window.electronAPI.gmail.pollingStart(90_000);
            } else {
                modal.querySelector('#gStatus').innerHTML = `<span class="text-danger">Login failed: ${esc(r.error)}</span>`;
            }
        };
        modal.querySelector('#gLogout').onclick = async () => {
            await window.electronAPI.gmail.logout();
            await window.electronAPI.gmail.pollingStop();
            m.hide();
            await refreshStatusBar();
        };
        modal.querySelector('#gInitial').onclick = async () => {
            modal.querySelector('#gStatus').textContent = 'Initial sync running… this can take a while.';
            const r = await window.electronAPI.gmail.initialSync({ maxPerLabel: 500 });
            modal.querySelector('#gStatus').textContent = r.success ? 'Initial sync complete.' : ('Error: ' + r.error);
            await refreshList();
            await refreshStatusBar();
        };
        modal.querySelector('#gSyncNow').onclick = async () => {
            modal.querySelector('#gStatus').textContent = 'Syncing…';
            const r = await window.electronAPI.gmail.syncNow();
            modal.querySelector('#gStatus').textContent = r.success ? 'Synced.' : ('Error: ' + r.error);
            await refreshList();
            await refreshStatusBar();
        };
        modal.querySelector('#gResetCache').onclick = async () => {
            if (!confirm('Delete the local mail cache (index, messages, attachments, PO/bank queues)? Your Gmail account stays connected.')) return;
            modal.querySelector('#gStatus').textContent = 'Resetting cache…';
            const r = await window.electronAPI.gmail.resetCache();
            if (r && r.success) {
                modal.querySelector('#gStatus').textContent = 'Cache reset. Click Initial sync to refetch.';
                await refreshList();
                await refreshStatusBar();
            } else {
                modal.querySelector('#gStatus').innerHTML = `<span class="text-danger">Reset failed: ${esc((r && r.error) || 'unknown')}</span>`;
            }
        };
    }

    // Modal listing every sender the user has taught the classifier about.
    // Each entry has a small "Remove" button that un-learns the rule AND
    // flips the corresponding flag off on matching index rows so the Mail /
    // PO Queue / Bank Mail views update right away.
    async function openLearnedRules() {
        const pickBadge = (t) => ({
            po:   '<span class="badge bg-warning text-dark"><i class="bi bi-receipt"></i> PO</span>',
            bank: '<span class="badge bg-info text-dark"><i class="bi bi-bank"></i> Bank</span>',
            spam: '<span class="badge bg-danger"><i class="bi bi-shield-exclamation"></i> Spam</span>'
        }[t] || t);

        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-bookmark-star"></i> Learned senders</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <p class="small text-muted mb-2">
                  Every time you mark a mail as <b>PO</b>, <b>Bank</b>, or <b>Spam</b>
                  from the row menu, the sender is saved here. Future mails from
                  the same address (or whole domain if the entry starts with
                  <code>@</code>) are auto-classified at sync time.
                </p>
                <div class="d-flex gap-2 mb-3">
                  <select class="form-select form-select-sm" id="ruleAddType" style="max-width:150px">
                    <option value="po">PO sender</option>
                    <option value="bank">Bank sender</option>
                    <option value="spam">Spam sender</option>
                  </select>
                  <input type="text" class="form-control form-control-sm" id="ruleAddPattern" placeholder="email@example.com  or  @domain.com">
                  <button class="btn btn-sm btn-primary" id="ruleAddBtn"><i class="bi bi-plus-lg"></i> Add</button>
                </div>
                <div id="ruleList" class="small">Loading…</div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const m = new bootstrap.Modal(modal);
        m.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());

        async function paint() {
            const listEl = modal.querySelector('#ruleList');
            listEl.textContent = 'Loading…';
            const r = await window.electronAPI.gmail.userRulesList();
            if (!r || !r.success) {
                listEl.innerHTML = '<div class="text-danger">Could not load rules: ' + esc((r && r.error) || 'unknown') + '</div>';
                return;
            }
            const rules = r.data || {};
            const rows = [];
            for (const t of ['po', 'bank', 'spam']) {
                const senders = (rules[t] && rules[t].senders) || [];
                if (!senders.length) continue;
                rows.push(`<div class="fw-semibold mt-3 mb-1">${pickBadge(t)} — ${senders.length}</div>`);
                rows.push('<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0"><tbody>' +
                    senders.map(s => `
                      <tr>
                        <td><code>${esc(s)}</code></td>
                        <td class="text-end">
                          <button class="btn btn-sm btn-outline-danger rule-remove" data-type="${t}" data-pattern="${esc(s)}">
                            <i class="bi bi-x-lg"></i> Remove
                          </button>
                        </td>
                      </tr>
                    `).join('') + '</tbody></table></div>');
            }
            if (!rows.length) {
                listEl.innerHTML = '<div class="text-muted p-3 text-center">No learned senders yet. Use the <i class="bi bi-three-dots-vertical"></i> menu on any mail row to teach the classifier.</div>';
            } else {
                listEl.innerHTML = rows.join('');
            }
            modal.querySelectorAll('.rule-remove').forEach(btn => btn.onclick = async () => {
                btn.disabled = true;
                const r2 = await window.electronAPI.gmail.userRuleRemove(btn.dataset.type, btn.dataset.pattern);
                if (r2 && r2.success) {
                    App.showNotification(`Removed rule: ${btn.dataset.type} · ${btn.dataset.pattern}`, 'info');
                    await paint();
                    try { await refreshList(); } catch {}
                } else {
                    App.showNotification('Could not remove: ' + ((r2 && r2.error) || 'unknown'), 'error');
                    btn.disabled = false;
                }
            });
        }
        await paint();

        modal.querySelector('#ruleAddBtn').onclick = async () => {
            const type = modal.querySelector('#ruleAddType').value;
            const pattern = modal.querySelector('#ruleAddPattern').value.trim();
            if (!pattern) { App.showNotification('Enter an email or @domain first.', 'warning'); return; }
            if (!window.electronAPI.gmail.userRuleAdd) {
                App.showNotification('This feature needs the updated app. Please fully quit and restart.', 'warning');
                return;
            }
            const btn = modal.querySelector('#ruleAddBtn');
            btn.disabled = true;
            try {
                const r = await window.electronAPI.gmail.userRuleAdd(type, pattern);
                if (r && r.success) {
                    const retro = r.data && r.data.retro ? (r.data.retro.INBOX || 0) : 0;
                    App.showNotification(
                        `Saved ${type} rule for ${pattern}.${retro > 0 ? ` ${retro} existing mail${retro === 1 ? '' : 's'} retagged.` : ''}`,
                        'success'
                    );
                    modal.querySelector('#ruleAddPattern').value = '';
                    await paint();
                    try { await refreshList(); } catch {}
                } else {
                    App.showNotification('Could not add rule: ' + ((r && r.error) || 'unknown'), 'error');
                }
            } finally {
                btn.disabled = false;
            }
        };

        if (window.electronAPI.gmail.onRulesUpdated) {
            window.electronAPI.gmail.onRulesUpdated(() => { paint().catch(() => {}); });
        }
    }

    return { load, openCompose, previewAttachment, ensureMailStyles, openLearnedRules, openMessagePreview, isGmailAvailable, renderDesktopOnlyNotice };
})();

window.MailUI = MailUI;

// Register persistent navigation listeners at module load so tray/notification
// clicks route to the right view even if the user has never opened the Mail
// view in this session. Without this, `gmail:open-queue` was broadcast but had
// no subscriber — clicking a notification only focused the window.
(function wireGmailNavListeners() {
    if (MailUI._navBound) return;
    if (!window.electronAPI || !window.electronAPI.gmail) return;
    MailUI._navBound = true;
    const go = (view) => {
        if (window.App && typeof App.showView === 'function') App.showView(view);
    };
    if (typeof window.electronAPI.gmail.onOpenView === 'function') {
        window.electronAPI.gmail.onOpenView((d) => {
            if (d && (d.view === 'mail' || d.view === 'poQueue' || d.view === 'bankMail')) go(d.view);
        });
    }
    if (typeof window.electronAPI.gmail.onOpenQueue === 'function') {
        window.electronAPI.gmail.onOpenQueue((d) => {
            go(d && d.target === 'bank' ? 'bankMail' : 'poQueue');
        });
    }
})();
