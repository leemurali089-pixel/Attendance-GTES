(function () {
  const DASH_DATA = {
    all: { pendingInvoices: [{ n: "INV-3012 / Skyline", a: 145000, d: "Overdue 6 days", s: "danger-soft" }, { n: "INV-3014 / Nirmal", a: 89000, d: "Due today", s: "warn-soft" }, { n: "INV-3020 / Delta", a: 42000, d: "Due in 3 days", s: "ok-soft" }], supplierDues: [{ n: "Kannan Industrial", a: 98000, d: "PO #P-920", s: "warn-soft" }, { n: "Raja Electricals", a: 44000, d: "Overdue 2 days", s: "danger-soft" }], dueTasks: [{ n: "Submit GST filing draft", a: 1, d: "Overdue", s: "danger-soft" }, { n: "Vendor payment approval", a: 1, d: "Due today", s: "warn-soft" }], stockAlerts: [{ n: "Inter Cooler Service Charge", a: 0, d: "0 units", s: "danger-soft" }, { n: "Testing Certificate", a: 0, d: "0 units", s: "danger-soft" }, { n: "Insulation Charge", a: 1, d: "1 left", s: "warn-soft" }], c: { l: ["Apr-2024", "May-2024", "Jun-2024", "Jul-2024", "Aug-2024", "Sep-2024", "Oct-2024", "Nov-2024", "Dec-2024", "Jan-2025", "Feb-2025", "Mar-2025"], r: [320, 338, 355, 372, 392, 412, 435, 458, 485, 512, 538, 560], e: [255, 262, 270, 282, 292, 304, 312, 322, 334, 345, 356, 365] } },
    gst: { pendingInvoices: [{ n: "GST-INV-201 / Skyline", a: 112000, d: "Overdue 4 days", s: "danger-soft" }, { n: "GST-INV-207 / Nirmal", a: 73000, d: "Due today", s: "warn-soft" }], supplierDues: [{ n: "Raja Electricals", a: 61000, d: "Tax invoice pending", s: "warn-soft" }], dueTasks: [{ n: "Finalize GSTR working", a: 1, d: "Overdue", s: "danger-soft" }], stockAlerts: [{ n: "Compressor Spare Kit", a: 0, d: "0 units", s: "danger-soft" }], c: { l: ["Apr-2024", "May-2024", "Jun-2024", "Jul-2024", "Aug-2024", "Sep-2024", "Oct-2024", "Nov-2024", "Dec-2024", "Jan-2025", "Feb-2025", "Mar-2025"], r: [220, 238, 255, 275, 298, 318, 338, 358, 378, 398, 418, 436], e: [155, 162, 172, 182, 192, 205, 215, 225, 238, 248, 258, 268] } },
    plain: { pendingInvoices: [{ n: "PLN-INV-91 / Delta", a: 33000, d: "Overdue 2 days", s: "danger-soft" }, { n: "PLN-INV-95 / Blue Arc", a: 22000, d: "Due in 2 days", s: "ok-soft" }], supplierDues: [{ n: "Apex Fasteners", a: 12000, d: "Due in 4 days", s: "ok-soft" }], dueTasks: [{ n: "Plain invoice follow-up", a: 2, d: "Due today", s: "warn-soft" }], stockAlerts: [{ n: "Testing Nozzle Spare", a: 0, d: "0 units", s: "danger-soft" }], c: { l: ["Apr-2024", "May-2024", "Jun-2024", "Jul-2024", "Aug-2024", "Sep-2024", "Oct-2024", "Nov-2024", "Dec-2024", "Jan-2025", "Feb-2025", "Mar-2025"], r: [105, 112, 120, 128, 138, 148, 158, 168, 178, 186, 194, 202], e: [88, 92, 96, 100, 104, 108, 112, 116, 120, 124, 128, 132] } }
  };
  let dashScope = "all";
  let dashDetail = "pendingInvoices";
  /** Bill vs party grouping for the inline dashboard detail panel. */
  let dashDetailGroup = { pendingInvoices: "bill", supplierDues: "bill" };
  let dashChart = null;
  const INLINE_DETAIL_ROWS = 120;
  let _gtesLastShellVisSig = "";
  let _fyRehydrateTimer = null;
  const ADMIN_COMPANY_DETAILS = { companyName: "Gas Tech Engineering Service", tagline: "Excellence in Engineering & Service Solutions.", registeredAddress: "No.233/233, Nageshwar Rao Road, Athipet, Chennai - 600058", worksAddress: "23/4/A, 1st Street, Nageshwar Rao Road, Athipet, Chennai - 600058", email: "gastechengservice@gmail.com", altEmail: "rajmohan67raj@gmail.com", phone: "+91 96000 19838, +91 95682 02896", gstin: "33AFKPR2353A3ZF", iec: "AFKPR2353A", pan: "AFKPR2353A", version: "1.3.32", support: "Support: leemurali001@gmail.com / +91 99529 70089", developedBy: "Developed by Murali D" };

  /** Jump targets: do not use `data-view` (reserved for main nav binding). */
  const JUMP_PAGES = [
    { name: "Dashboard", view: "dashboard" },
    { name: "Employees", view: "employees" },
    { name: "Attendance", view: "attendance" },
    { name: "Filter Attendance", view: "filterAttendance" },
    { name: "Holidays", view: "holidays" },
    { name: "Salary", view: "salary" },
    { name: "Advances", view: "advances" },
    { name: "Bonus", view: "bonus" },
    { name: "GST Invoices", view: "invoices", params: { mode: "gst" } },
    { name: "Plain Invoices", view: "invoices", params: { mode: "non-gst" } },
    { name: "Vouchers", view: "vouchers" },
    { name: "Purchases", view: "purchases" },
    { name: "Challans", view: "challans" },
    { name: "Job Cards", view: "jobcard" },
    { name: "Customers", view: "customers" },
    { name: "Inventory", view: "inventory" },
    { name: "Services", view: "services" },
    { name: "Tasks", view: "tasks" },
    { name: "Payments", view: "payments" },
    { name: "Analytics", view: "analytics" },
    { name: "Mail", view: "mail" },
    { name: "PO Queue", view: "poQueue" },
    { name: "Bank Mail", view: "bankMail" },
    { name: "Admin", view: "admin", params: { adminTab: "settings" } },
  ];

  const SHELL_OPEN_KEY = "gtes_shell_nav_open";

  function shellActiveKeyFromRoute(view, params) {
    const p = params && typeof params === "object" ? params : {};
    if (view === "invoices") return p.mode ? `invoices:${p.mode}` : "invoices";
    if (view === "vouchers") return p.mode ? `vouchers:${p.mode}` : "vouchers";
    if (view === "admin") {
      if (p.focus === "backup") return "admin:backup";
      if (p.adminTab === "settings") return "admin:settings";
      if (p.adminTab === "audit") return "admin:audit";
      return "admin:users";
    }
    if (view === "challans") {
      if (p.challanType === "dc") return "challans:dc";
      if (p.challanType === "sc") return "challans:sc";
      const s = p.deliverySection || p.section;
      if (s) return `challans:${s}`;
      return "challans";
    }
    if (view === "jobcard") return "challans:jobcard";
    if (view === "customers") return "challans:customers";
    if (view === "inventory") return "challans:inventory";
    if (view === "services") return "challans:services";
    return view;
  }

  function syncShellNavFromApp() {
    if (!window.App || typeof App.currentView === "undefined") return;
    const key = shellActiveKeyFromRoute(App.currentView, App.currentViewParams || {});
    document.querySelectorAll(".gtes-shell-link[data-shell-active-key]").forEach((node) => {
      node.classList.toggle("active", node.getAttribute("data-shell-active-key") === key);
    });
    const safe = String(key).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const activeEl = document.querySelector(`[data-shell-active-key="${safe}"]`);
    if (activeEl) {
      let el = activeEl.parentElement;
      while (el && el !== document.body) {
        if (el.tagName === "DETAILS") el.open = true;
        el = el.parentElement;
      }
    }
    try {
      const openIds = [];
      document.querySelectorAll(".gtes-shell-nav details.gtes-side-group").forEach((d) => {
        const id = d.getAttribute("data-nav-group");
        if (id && d.open) openIds.push(id);
      });
      sessionStorage.setItem(SHELL_OPEN_KEY, JSON.stringify(openIds));
    } catch (_) { /* ignore */ }
  }
  window.__gtesSyncShellNavFromApp = syncShellNavFromApp;

  function restoreShellNavOpenState() {
    try {
      const raw = sessionStorage.getItem(SHELL_OPEN_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (!Array.isArray(ids)) return;
      ids.forEach((id) => {
        const d = document.querySelector(`details.gtes-side-group[data-nav-group="${id.replace(/"/g, "")}"]`);
        if (d) d.open = true;
      });
    } catch (_) { /* ignore */ }
  }

  function setScope(scope) {
    dashScope = scope || "all";
    document.querySelectorAll("[data-shell-scope]").forEach((x) => {
      x.classList.toggle("active", x.getAttribute("data-shell-scope") === dashScope);
    });
    refreshDashboardPreview();
  }

  function closeJumpLists() {
    const list = document.getElementById("gtesJumpListMirror");
    if (!list || !list.classList.contains("show")) return;
    list.classList.remove("show");
    list.innerHTML = "";
  }

  function renderJump(value, listId) {
    const list = document.getElementById(listId || "gtesJumpListMirror");
    if (!list) return;
    const q = String(value || "").trim().toLowerCase();
    if (!q) {
      list.classList.remove("show");
      list.innerHTML = "";
      return;
    }
    const rows = JUMP_PAGES.filter(
      (p) => nameIncludes(p, q) || viewIncludes(p, q)
    ).slice(0, 12);
    list.classList.add("show");
    list.innerHTML = rows.length
      ? rows.map((p) => jumpRowHtml(p)).join("")
      : `<div class="gtes-shell-jump-row"><span>No page found</span><code>-</code></div>`;
  }

  function nameIncludes(p, q) {
    return String(p.name || "").toLowerCase().includes(q);
  }
  function viewIncludes(p, q) {
    return String(p.view || "").toLowerCase().includes(q);
  }
  function jumpRowHtml(p) {
    const paramsAttr =
      p.params && Object.keys(p.params).length
        ? ` data-gtes-jump-params="${JSON.stringify(p.params).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`
        : "";
    const code = p.params && Object.keys(p.params).length ? `${p.view} · params` : p.view;
    return `<button type="button" class="gtes-shell-jump-row" data-gtes-jump-view="${p.view}"${paramsAttr}><span>${p.name}</span><code>${code}</code></button>`;
  }

  function syncDashThemeRoll() {
    const btn = document.getElementById("dashThemeBtn");
    const thumb = document.getElementById("dashThemeRollThumb");
    if (!btn) return;
    const light =
      document.documentElement.getAttribute("data-theme") === "light" ||
      document.documentElement.getAttribute("data-bs-theme") === "light";
    btn.classList.toggle("is-light", !!light);
    if (thumb) {
      thumb.innerHTML = light ? '<i class="bi bi-brightness-high-fill"></i>' : '<i class="bi bi-moon-stars-fill"></i>';
    }
    try {
      renderChart();
    } catch (_) {
      /* chart may not be ready */
    }
  }
  window.__gtesSyncDashThemeRoll = syncDashThemeRoll;

  function closeDropdowns() {
    document.querySelectorAll(".gtes-shell-dd").forEach((n) => n.classList.remove("open"));
  }

  function loginOverlayIsDismissed(loginOverlay) {
    if (!loginOverlay) return true;
    if (loginOverlay.classList.contains("hidden")) return true;
    const inline = (loginOverlay.style && loginOverlay.style.display) || "";
    if (inline && String(inline).toLowerCase() === "none") return true;
    try {
      const cs = window.getComputedStyle(loginOverlay);
      if (cs.display === "none") return true;
      if (cs.visibility === "hidden" && cs.opacity === "0") return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function syncShellVisibility() {
    const shell = document.getElementById("gtesAppShell");
    const loginOverlay = document.getElementById("loginOverlay");
    if (!shell || !loginOverlay) return;
    const overlayHidden = loginOverlayIsDismissed(loginOverlay);
    const onDashboard = window.App && App.currentView === "dashboard";
    const shellHidden = shell.classList.contains("d-none");
    const sig = `${overlayHidden ? 1 : 0}|${onDashboard ? 1 : 0}|${shellHidden ? 1 : 0}`;
    if (sig === _gtesLastShellVisSig) return;
    _gtesLastShellVisSig = sig;
    document.body.classList.toggle("gtes-dashboard-active", !!(overlayHidden && onDashboard));
    if (overlayHidden) {
      shell.classList.remove("d-none");
      document.body.classList.add("shell-layout-enabled");
    } else {
      shell.classList.add("d-none");
      document.body.classList.remove("shell-layout-enabled");
      document.body.classList.remove("shell-menu-open");
      document.body.classList.remove("gtes-dashboard-active");
      closeDropdowns();
    }
  }

  window.__gtesSyncShellVisibility = function __gtesSyncShellVisibility() {
    _gtesLastShellVisSig = "";
    syncShellVisibility();
  };

  /** Smooth edge scroll when pointer is near top/bottom of the shell nav (long menus). */
  function wireNavEdgeScroll(navEl) {
    if (!navEl || navEl.dataset.gtesEdgeScrollBound === "1") return;
    navEl.dataset.gtesEdgeScrollBound = "1";
    let raf = 0;
    let lastY = null;
    const EDGE = 52;
    const SPEED = 5;
    function stopLoop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      lastY = null;
    }
    function tick() {
      if (lastY == null) {
        raf = 0;
        return;
      }
      const rect = navEl.getBoundingClientRect();
      if (lastY > rect.bottom - EDGE) navEl.scrollTop += SPEED;
      else if (lastY < rect.top + EDGE) navEl.scrollTop -= SPEED;
      else {
        stopLoop();
        return;
      }
      raf = requestAnimationFrame(tick);
    }
    navEl.addEventListener(
      "mousemove",
      (e) => {
        const rect = navEl.getBoundingClientRect();
        const y = e.clientY;
        if (y < rect.top || y > rect.bottom || rect.height < 100) {
          stopLoop();
          return;
        }
        lastY = y;
        if ((y > rect.bottom - EDGE || y < rect.top + EDGE) && !raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    navEl.addEventListener("mouseleave", stopLoop, { passive: true });
  }

  function wire() {
    if (document.body.dataset.gtesDashShellWireDone === "1") return;
    document.body.dataset.gtesDashShellWireDone = "1";

    const menuBtn = document.getElementById("gtesMenuLaunchBtn");
    const jumpMirror = document.getElementById("gtesJumpInputMirror");

    if (menuBtn) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.body.classList.toggle("shell-menu-open");
      });
    }

    const shellNavEl = document.querySelector("#gtesSidebar .gtes-shell-nav");
    document.querySelectorAll(".gtes-shell-nav details.gtes-side-group[data-nav-group]").forEach((det) => {
      det.addEventListener("toggle", () => {
        if (det.open && shellNavEl && det.parentElement === shellNavEl) {
          shellNavEl.querySelectorAll(":scope > details.gtes-side-group").forEach((sib) => {
            if (sib !== det) sib.open = false;
          });
        }
        try {
          const openIds = [];
          document.querySelectorAll(".gtes-shell-nav details.gtes-side-group[data-nav-group]").forEach((d) => {
            const id = d.getAttribute("data-nav-group");
            if (id && d.open) openIds.push(id);
          });
          sessionStorage.setItem(SHELL_OPEN_KEY, JSON.stringify(openIds));
        } catch (_) { /* ignore */ }
      });
    });

    function bindJumpInput(inputEl, listId) {
      if (!inputEl) return;
      inputEl.addEventListener("input", (e) => renderJump(e.target.value, listId));
      inputEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const list = document.getElementById(listId || "gtesJumpListMirror");
        const first = list && list.querySelector(".gtes-shell-jump-row[data-gtes-jump-view]");
        if (!first) return;
        e.preventDefault();
        first.click();
      });
    }
    bindJumpInput(jumpMirror, "gtesJumpListMirror");

    document.querySelectorAll("[data-shell-scope]").forEach((node) => {
      node.addEventListener("click", () => {
        setScope(node.getAttribute("data-shell-scope") || "all");
      });
    });

    const dashRoot = document.getElementById("dashboardView");
    if (dashRoot) {
      dashRoot.addEventListener("click", (e) => {
        const node = e.target.closest(".gtes-kpi-card[data-detail]");
        if (!node) return;
        dashDetailGroup.pendingInvoices = "bill";
        dashDetailGroup.supplierDues = "bill";
        dashDetail = node.getAttribute("data-detail") || "pendingInvoices";
        renderDetails();
        const d = dashDetail;
        if (window.App && typeof App.openDashboardKpiDetail === "function") {
          if (d === "pendingInvoices" || d === "supplierDues" || d === "dueTasks" || d === "stockAlerts") {
            App.openDashboardKpiDetail(d, { groupBy: "bill" });
          }
        }
      });
    }

    const shellNav = document.querySelector(".gtes-shell-nav");
    wireNavEdgeScroll(shellNav);
    wireDashDetailOpenClicks();

    const syncBtn = document.getElementById("gtesSyncBtn");
    if (syncBtn) syncBtn.addEventListener("click", () => window.SyncManager && SyncManager.showAuditModal && SyncManager.showAuditModal());
    const themeBtn = document.getElementById("gtesThemeBtn");
    const themeInput = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", () => themeInput && themeInput.click());
    const refreshBtn = document.getElementById("gtesRefreshBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => window.location.reload());
    /* Shell logout: handled by App._wireShellLogoutCapture (document capture) — avoid duplicate handlers. */

    const cloudDd = document.getElementById("gtesCloudDd");
    const backupDd = document.getElementById("gtesBackupDd");
    const cloudBtn = document.getElementById("gtesCloudBtn");
    const backupBtn = document.getElementById("gtesBackupBtn");
    if (cloudBtn) {
      cloudBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (backupDd) backupDd.classList.remove("open");
        if (cloudDd) cloudDd.classList.toggle("open");
      });
    }
    if (backupBtn) {
      backupBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (cloudDd) cloudDd.classList.remove("open");
        if (backupDd) backupDd.classList.toggle("open");
      });
    }

    const cloudImport = document.getElementById("gtesCloudImport");
    if (cloudImport) cloudImport.addEventListener("click", async () => window.DeepCloudMigrator && DeepCloudMigrator.importAll && DeepCloudMigrator.importAll());
    const cloudExport = document.getElementById("gtesCloudExport");
    if (cloudExport) cloudExport.addEventListener("click", async () => window.DeepCloudMigrator && DeepCloudMigrator.exportAll && DeepCloudMigrator.exportAll());
    const backupExport = document.getElementById("gtesBackupExport");
    if (backupExport) backupExport.addEventListener("click", () => window.AdminModule && AdminModule.exportManualBackup && AdminModule.exportManualBackup());
    const backupImport = document.getElementById("gtesBackupImport");
    if (backupImport) backupImport.addEventListener("click", () => document.getElementById("navImportFile") && document.getElementById("navImportFile").click());
    const resetData = document.getElementById("gtesResetData");
    if (resetData) resetData.addEventListener("click", () => window.SyncManager && SyncManager.resetData && SyncManager.resetData());
    const dashSyncBtn = document.getElementById("dashSyncBtn");
    if (dashSyncBtn) dashSyncBtn.addEventListener("click", () => window.SyncManager && SyncManager.showAuditModal && SyncManager.showAuditModal());
    const dashThemeBtn = document.getElementById("dashThemeBtn");
    const dashThemeInput = document.getElementById("theme-toggle");
    if (dashThemeBtn) {
      dashThemeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (dashThemeInput) dashThemeInput.click();
        setTimeout(syncDashThemeRoll, 0);
      });
    }
    if (dashThemeInput) {
      dashThemeInput.addEventListener("change", () => setTimeout(syncDashThemeRoll, 0));
    }
    const dashRefreshBtn = document.getElementById("dashRefreshBtn");
    if (dashRefreshBtn) dashRefreshBtn.addEventListener("click", () => window.location.reload());
    /* Logout: App._wireShellLogoutCapture (document, capture). No per-button handler — avoids ReferenceError
       from removed shellLogoutBtn and duplicate preventDefault fighting the capture path. */
    const dashCloudDd = document.getElementById("dashCloudDd");
    const dashBackupDd = document.getElementById("dashBackupDd");
    if (dashCloudDd) {
      const btn = dashCloudDd.querySelector("button");
      if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); if (dashBackupDd) dashBackupDd.classList.remove("open"); dashCloudDd.classList.toggle("open"); });
    }
    if (dashBackupDd) {
      const btn = dashBackupDd.querySelector("button");
      if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); if (dashCloudDd) dashCloudDd.classList.remove("open"); dashBackupDd.classList.toggle("open"); });
    }
    const dashCloudImport = document.getElementById("dashCloudImport");
    if (dashCloudImport) dashCloudImport.addEventListener("click", async () => window.DeepCloudMigrator && DeepCloudMigrator.importAll && DeepCloudMigrator.importAll());
    const dashCloudExport = document.getElementById("dashCloudExport");
    if (dashCloudExport) dashCloudExport.addEventListener("click", async () => window.DeepCloudMigrator && DeepCloudMigrator.exportAll && DeepCloudMigrator.exportAll());
    const dashBackupImport = document.getElementById("dashBackupImport");
    if (dashBackupImport) dashBackupImport.addEventListener("click", () => document.getElementById("navImportFile") && document.getElementById("navImportFile").click());
    const dashBackupExport = document.getElementById("dashBackupExport");
    if (dashBackupExport) dashBackupExport.addEventListener("click", () => window.AdminModule && AdminModule.exportManualBackup && AdminModule.exportManualBackup());
    const dashResetData = document.getElementById("dashResetData");
    if (dashResetData) dashResetData.addEventListener("click", () => window.SyncManager && SyncManager.resetData && SyncManager.resetData());

    syncDashSyncStatusLabel();
    /* Label updates come from SyncManager._paintSyncStatusIndicators → __gtesRefreshDashShellSyncBtn (no 900ms DOM churn). */

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== "function") return;
      if (!t.closest(".gtes-shell-dd")) closeDropdowns();
      if (!t.closest("#dashCloudDd")) dashCloudDd && dashCloudDd.classList.remove("open");
      if (!t.closest("#dashBackupDd")) dashBackupDd && dashBackupDd.classList.remove("open");
      if (!t.closest(".gtes-shell-jump-wrap")) closeJumpLists();
    });

    const hookApp = () => {
      if (!window.App || window.__gtesShellPatched) return;
      window.__gtesShellPatched = true;
      const originalShowView = App.showView.bind(App);
      App.showView = async function (viewName, params, navOpts) {
        const res = await originalShowView(viewName, params, navOpts);
        syncShellNavFromApp();
        if (viewName === "dashboard") {
          setScope("all");
          dashDetail = "pendingInvoices";
          try {
            refreshDashboardPreview();
            renderDashboardFooter();
          } catch (err) {
            console.warn("[dashboardShell] dashboard refresh:", err && err.message);
          }
        }
        _gtesLastShellVisSig = "";
        syncShellVisibility();
        return res;
      };
    };
    hookApp();
    [200, 800, 2500].forEach((ms) => {
      setTimeout(() => {
        hookApp();
        syncShellVisibility();
      }, ms);
    });
    setInterval(() => {
      syncShellVisibility();
      if (!window.__gtesShellPatched && window.App) hookApp();
    }, 5000);

    syncShellVisibility();
    restoreShellNavOpenState();
    initDashFinancialYearControls();
    setScope("all");
    refreshDashboardPreview();
    renderDashboardFooter();
    syncShellNavFromApp();
    syncDashThemeRoll();

    if (!window.__gtesDashFyAfterDataChg) {
      window.__gtesDashFyAfterDataChg = true;
      const FY_REHYDRATE_KEYS = new Set([
        "invoices",
        "vouchers",
        "purchases",
        "gtes_expenses",
        "challans",
        "gtes_challans",
      ]);
      window.addEventListener("gtes:data-changed", (ev) => {
        const k = ev && ev.detail && ev.detail.key;
        if (!k || !FY_REHYDRATE_KEYS.has(String(k))) return;
        clearTimeout(_fyRehydrateTimer);
        _fyRehydrateTimer = setTimeout(() => {
          try {
            initDashFinancialYearControls();
          } catch (e) {
            console.warn("[dashboardShell] FY rehydrate:", e && e.message);
          }
        }, 400);
      });
    }
  }

  const INR = (v) => "₹" + Number(v || 0).toLocaleString("en-IN");
  const sum = (a) => (Array.isArray(a) ? a.reduce((t, x) => t + (x.a || 0), 0) : 0);

  function getScopeDataset() {
    const fallback = DASH_DATA[dashScope] || DASH_DATA.all;
    if (typeof DashboardAdapter === "undefined") return fallback;
    const fy = typeof window !== "undefined" && window.__gtesDashFY ? window.__gtesDashFY : "";
    return DashboardAdapter.getDashboardData(dashScope, fallback, { fy });
  }

  function defaultIndianFYLabel(now) {
    const d = now || new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    // Indian FY runs Apr -> Mar
    const y0 = m >= 3 ? y : y - 1;
    const y1 = y0 + 1;
    return `${y0}-${String(y1).slice(-2)}`;
  }

  /** Best-effort book row date (align with dashboardQueries._docOnOrBefore). */
  function rowBookDate(r) {
    if (!r || typeof r !== "object") return null;
    const d =
      r.date ||
      r.invoiceDate ||
      r.billDate ||
      r.voucherDate ||
      r.purchaseDate ||
      r.expenseDate ||
      r.challanDate ||
      r.dcDate ||
      r.createdAt ||
      null;
    return d == null || d === "" ? null : d;
  }

  function collectIndianFyLabelsFromBooks() {
    const seen = new Set();
    const pushFy = (d) => {
      if (d == null || d === "") return;
      if (typeof DataManager === "undefined" || typeof DataManager.getFinancialYear !== "function") return;
      const fy = DataManager.getFinancialYear(d);
      if (fy) seen.add(fy);
    };
    if (typeof DataManager === "undefined") return [];

    const scanKey = (storageKey) => {
      if (!storageKey) return;
      const rows = DataManager.getData(storageKey);
      if (!Array.isArray(rows)) return;
      rows.forEach((r) => {
        const d = rowBookDate(r);
        if (d != null) pushFy(d);
      });
    };

    scanKey("invoices");
    scanKey("vouchers");
    scanKey("purchases");
    scanKey("gtes_expenses");
    scanKey("challans");
    const chK = DataManager.KEYS && DataManager.KEYS.CHALLANS;
    if (chK) scanKey(chK);

    return [...seen].sort(
      (a, b) => parseInt(String(b).slice(0, 4), 10) - parseInt(String(a).slice(0, 4), 10),
    );
  }

  function initDashFinancialYearControls() {
    const sel = document.getElementById("gtesDashFySelect");
    if (!sel) return;
    const now = new Date();
    let years = collectIndianFyLabelsFromBooks();
    let curFy = "";
    if (typeof GTESFinancialYearUi !== "undefined" && GTESFinancialYearUi.defaultFyKey) {
      curFy = String(GTESFinancialYearUi.defaultFyKey() || "").trim();
    }
    if (!curFy && typeof DataManager !== "undefined" && typeof DataManager.getFinancialYear === "function") {
      curFy = String(DataManager.getFinancialYear(now) || "").trim();
    }
    if (!curFy) curFy = defaultIndianFYLabel(now);
    if (curFy && !years.includes(curFy)) {
      years = [curFy, ...years];
    }
    if (years.length === 0) years = [curFy || defaultIndianFYLabel(now)];
    years.sort(
      (a, b) => parseInt(String(b).slice(0, 4), 10) - parseInt(String(a).slice(0, 4), 10),
    );
    const fp = years.join("|");

    const syncScopeLabel = () => {
      const chartScope = document.getElementById("chartScope");
      if (chartScope) chartScope.textContent = `Scope: ${dashScope.toUpperCase()} · FY ${window.__gtesDashFY || "-"}`;
    };

    let chosen = "";
    try {
      chosen = localStorage.getItem("gtesDashFY") || "";
    } catch (_) {
      chosen = "";
    }
    if (chosen && years.includes(chosen)) {
      /* keep saved FY */
    } else if (curFy && years.includes(curFy)) {
      chosen = curFy;
    } else {
      chosen = years[0] || curFy || defaultIndianFYLabel(now);
    }

    if (sel.dataset.gtesDashFyYearsKey === fp && fp !== "") {
      window.__gtesDashFY = chosen;
      sel.value = chosen;
      syncScopeLabel();
      return;
    }

    sel.dataset.gtesDashFyYearsKey = fp;
    sel.innerHTML = years
      .map((fy) => `<option value="${escAttr(fy)}">${escHtml(`FY ${fy}`)}</option>`)
      .join("");

    sel.value = chosen;
    window.__gtesDashFY = chosen;

    if (!sel.dataset.gtesDashFyBound) {
      sel.dataset.gtesDashFyBound = "1";
      sel.addEventListener("change", () => {
        const v = String(sel.value || "").trim();
        window.__gtesDashFY = v;
        try {
          localStorage.setItem("gtesDashFY", v);
        } catch (_) {
          /* ignore */
        }
        syncScopeLabel();
        refreshDashboardPreview();
        try {
          window.dispatchEvent(new CustomEvent("gtes:dash-fy-changed", { detail: { fy: v } }));
        } catch (_) {
          /* ignore */
        }
      });
    }

    syncScopeLabel();
  }

  function escHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    return escHtml(s).replace(/'/g, "&#39;");
  }

  /** Premium shell top bar — re-query DOM each tick (survives layout swaps). SyncManager calls this too. */
  function syncDashSyncStatusLabel() {
    const dashSyncBtn = document.getElementById("dashSyncBtn");
    if (!dashSyncBtn) return;
    const SM = window.SyncManager;
    const syncing = SM && SM.status === "syncing";
    const pct = syncing && typeof SM.syncProgressPercent !== "undefined" ? Number(SM.syncProgressPercent) || 0 : 0;
    const last = SM && SM.lastSyncTime ? new Date(SM.lastSyncTime) : null;
    const lastTxt = last && !Number.isNaN(last.getTime())
      ? `${last.toLocaleDateString("en-IN")} ${last.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      : "";
    const label = syncing ? `Syncing ${pct}%` : "Sync Status";
    const sub = syncing
      ? (SM.syncProgressMessage ? String(SM.syncProgressMessage) : "Sync in progress…")
      : (lastTxt ? `Last: ${lastTxt}` : "");
    dashSyncBtn.innerHTML = `<i class="bi bi-arrow-repeat me-1"></i>${escHtml(label)}${sub ? ` <span class="gtes-shell-sync-meta">${escHtml(sub)}</span>` : ""}`;
  }
  window.__gtesRefreshDashShellSyncBtn = syncDashSyncStatusLabel;

  window.__gtesSetDashDetailGroup = function __gtesSetDashDetailGroup(key, mode) {
    if (dashDetailGroup[key] === undefined) return;
    dashDetailGroup[key] = mode === "party" ? "party" : "bill";
    renderDetails();
  };

  function wireDashDetailOpenClicks() {
    const list = document.getElementById("gtesDashDetailList");
    if (!list || list.dataset.gtesDashOpenBound === "1") return;
    list.dataset.gtesDashOpenBound = "1";
    list.addEventListener("click", (e) => {
      const openRow = e.target.closest(".gtes-dash-open-row[data-gtes-open-kind][data-gtes-open-id]");
      if (openRow) {
        const kind = openRow.getAttribute("data-gtes-open-kind");
        const id = openRow.getAttribute("data-gtes-open-id") || "";
        if (kind === "invoice" && id && window.InvoicesUI && InvoicesUI.previewInvoice) {
          e.preventDefault();
          InvoicesUI.previewInvoice(id);
          return;
        }
        if (kind === "purchase" && id && window.InvoicesUI && InvoicesUI.previewPurchase) {
          e.preventDefault();
          InvoicesUI.previewPurchase(id);
          return;
        }
      }
      const taskRow = e.target.closest(".gtes-dash-task-row[data-gtes-task-id]");
      if (taskRow) {
        const id = taskRow.getAttribute("data-gtes-task-id");
        if (id && window.TasksUI && typeof TasksUI.viewTaskDetail === "function") {
          e.preventDefault();
          Promise.resolve(window.App && App.showView && App.showView("tasks")).then(() => TasksUI.viewTaskDetail(id));
          return;
        }
      }
      const pill = e.target.closest("[data-gtes-open-kind]");
      if (!pill) return;
      const kind = pill.getAttribute("data-gtes-open-kind");
      const id = pill.getAttribute("data-gtes-open-id") || "";
      if (kind === "invoice" && id && window.InvoicesUI && InvoicesUI.previewInvoice) InvoicesUI.previewInvoice(id);
      else if (kind === "purchase" && id && window.InvoicesUI && InvoicesUI.previewPurchase) InvoicesUI.previewPurchase(id);
      else if (kind === "task" && id && window.TasksUI && TasksUI.viewTaskDetail) {
        Promise.resolve(window.App && App.showView && App.showView("tasks")).then(() => TasksUI.viewTaskDetail(id));
      } else if (kind === "inventory" && window.App && App.showView) void App.showView("inventory");
    });
  }

  function openPillHtml(r) {
    if (dashDetail === "pendingInvoices" && r.rid) {
      return `<span class="pill ${r.s} gtes-dash-open-pill" role="button" tabindex="0" data-gtes-open-kind="invoice" data-gtes-open-id="${escAttr(r.rid)}">open</span>`;
    }
    if (dashDetail === "supplierDues" && r.rid) {
      return `<span class="pill ${r.s} gtes-dash-open-pill" role="button" tabindex="0" data-gtes-open-kind="purchase" data-gtes-open-id="${escAttr(r.rid)}">open</span>`;
    }
    if (dashDetail === "dueTasks" && r.tid) {
      return `<span class="pill ${r.s} gtes-dash-open-pill" role="button" tabindex="0" data-gtes-open-kind="task" data-gtes-open-id="${escAttr(r.tid)}" title="Open task">open</span>`;
    }
    if (dashDetail === "stockAlerts" && r.rid) {
      return `<span class="pill ${r.s} gtes-dash-open-pill" role="button" tabindex="0" data-gtes-open-kind="inventory" data-gtes-open-id="${escAttr(r.rid)}">open</span>`;
    }
    return `<span class="pill ${r.s}">open</span>`;
  }

  function renderDetailsStrip() {
    const strip = document.getElementById("gtesDashDetailStrip");
    if (!strip) return;
    const gbPend = dashDetailGroup.pendingInvoices === "party" ? "party" : "bill";
    const gbSup = dashDetailGroup.supplierDues === "party" ? "party" : "bill";
    if (dashDetail === "pendingInvoices") {
      strip.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2 w-100">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-info${gbPend === "bill" ? " active" : ""}" onclick="__gtesSetDashDetailGroup('pendingInvoices','bill')">Bill-wise</button>
            <button type="button" class="btn btn-outline-info${gbPend === "party" ? " active" : ""}" onclick="__gtesSetDashDetailGroup('pendingInvoices','party')">Party-wise</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-light ms-auto" onclick="App.openDashboardKpiDetail('pendingInvoices',{groupBy:'${gbPend}'})">View full list…</button>
        </div>`;
      strip.classList.remove("d-none");
      return;
    }
    if (dashDetail === "supplierDues") {
      strip.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2 w-100">
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-info${gbSup === "bill" ? " active" : ""}" onclick="__gtesSetDashDetailGroup('supplierDues','bill')">Bill-wise</button>
            <button type="button" class="btn btn-outline-info${gbSup === "party" ? " active" : ""}" onclick="__gtesSetDashDetailGroup('supplierDues','party')">Party-wise</button>
          </div>
          <button type="button" class="btn btn-sm btn-outline-light ms-auto" onclick="App.openDashboardKpiDetail('supplierDues',{groupBy:'${gbSup}'})">View full list…</button>
        </div>`;
      strip.classList.remove("d-none");
      return;
    }
    if (dashDetail === "dueTasks") {
      strip.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2 w-100">
          <span class="small text-muted">Click a row to open that task.</span>
          <button type="button" class="btn btn-sm btn-outline-light ms-auto" onclick="App.openDashboardKpiDetail('dueTasks',{groupBy:'bill'})">View full list…</button>
        </div>`;
      strip.classList.remove("d-none");
      return;
    }
    if (dashDetail === "stockAlerts") {
      strip.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2 w-100">
          <span class="small text-muted">Materials with closing stock ≤ 5 (incl. zero / negative).</span>
          <button type="button" class="btn btn-sm btn-outline-light ms-auto" onclick="App.openDashboardKpiDetail('stockAlerts',{groupBy:'bill'})">View full list…</button>
        </div>`;
      strip.classList.remove("d-none");
      return;
    }
    strip.innerHTML = "";
    strip.classList.add("d-none");
  }

  function renderDetails() {
    const map = {
      pendingInvoices: "Pending invoice details",
      supplierDues: "Supplier / vendor payable details",
      dueTasks: "Tasks due today / overdue",
      stockAlerts: "Low stock (≤ 5 units) & out-of-stock",
    };
    const title = document.getElementById("detailTitle");
    const list = document.getElementById("gtesDashDetailList");
    if (!title || !list) return;
    title.textContent = map[dashDetail] || "Details";
    renderDetailsStrip();

    let rows = [];
    if (typeof window.DashboardQueries !== "undefined" && dashScope) {
      const sc = dashScope;
      if (dashDetail === "pendingInvoices") {
        rows =
          dashDetailGroup.pendingInvoices === "party"
            ? DashboardQueries.getPendingSalesPartyRows(sc, INLINE_DETAIL_ROWS)
            : DashboardQueries.getPendingSalesRows(sc, INLINE_DETAIL_ROWS);
      } else if (dashDetail === "supplierDues") {
        rows =
          dashDetailGroup.supplierDues === "party"
            ? DashboardQueries.getSupplierDuePartyRows(sc, INLINE_DETAIL_ROWS)
            : DashboardQueries.getSupplierDueRows(sc, INLINE_DETAIL_ROWS);
      } else if (dashDetail === "dueTasks") {
        rows = DashboardQueries.getDueTaskRows(sc, INLINE_DETAIL_ROWS);
      } else if (dashDetail === "stockAlerts") {
        rows = DashboardQueries.getStockAlertRows(INLINE_DETAIL_ROWS).rows;
      }
    }
    if (!rows.length) {
      const dataset = getScopeDataset();
      rows = (dataset && dataset[dashDetail]) || [];
    }

    const useTaskRows = dashDetail === "dueTasks" && rows.some((x) => x && x.tid);
    if (useTaskRows) {
      list.innerHTML = rows
        .map(
          (r) => `<div class="gtes-dash-row gtes-dash-task-row d-flex align-items-start justify-content-between gap-2" role="button" tabindex="0" data-gtes-task-id="${escAttr(r.tid || "")}">
            <div class="flex-grow-1 min-w-0"><div class="fw-semibold">${escHtml(r.n)}</div><div class="small-muted">${escHtml(r.d)}</div></div>
            <div class="text-end flex-shrink-0"><div class="fw-bold">${r.a}</div>${openPillHtml(r)}</div></div>`
        )
        .join("");
    } else {
      list.innerHTML = rows
        .map(
          (r) => {
            const clickable =
              (dashDetail === "pendingInvoices" && r.rid) || (dashDetail === "supplierDues" && r.rid);
            const kind = dashDetail === "pendingInvoices" ? "invoice" : dashDetail === "supplierDues" ? "purchase" : "";
            return `<div class="gtes-dash-row d-flex align-items-start justify-content-between gap-2${clickable ? " gtes-dash-open-row" : ""}"${clickable ? ` role="button" tabindex="0" data-gtes-open-kind="${kind}" data-gtes-open-id="${escAttr(r.rid || "")}"` : ""}>
            <div class="min-w-0"><div class="fw-semibold">${escHtml(r.n)}</div><div class="small-muted">${escHtml(r.d)}</div></div>
            <div class="text-end flex-shrink-0"><div class="fw-bold">${dashDetail === "dueTasks" ? r.a : INR(r.a)}</div>${openPillHtml(r)}</div></div>`;
          }
        )
        .join("");
    }
  }

  function dashPlChartIsLightTheme() {
    return (
      document.documentElement.getAttribute("data-theme") === "light" ||
      document.documentElement.getAttribute("data-bs-theme") === "light"
    );
  }

  function dashPlChartAxisColors() {
    const light = dashPlChartIsLightTheme();
    return {
      tick: light ? "#475569" : "#9db0ca",
      grid: light ? "rgba(15,23,42,.08)" : "rgba(255,255,255,.05)",
      legend: light ? "#1e293b" : "#dbeafe",
    };
  }

  /** Retina canvas: Chart.js defaults can look soft on some displays. */
  function dashPlChartDevicePixelRatio() {
    const r = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    return Math.min(Math.max(r, 1), 2.5);
  }

  function dashPlChartFonts() {
    const family =
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
    return {
      family,
      tick: { family, size: 12, weight: "500" },
      legend: { family, size: 12, weight: "600" },
      ttTitle: { family, size: 13, weight: "600" },
      ttBody: { family, size: 13, weight: "500" },
    };
  }

  function renderChart() {
    const dataset = getScopeDataset();
    const c = dataset && dataset.c;
    const chartScope = document.getElementById("chartScope");
    const canvas = document.getElementById("gtesPlChart");
    if (!c || !canvas || !window.Chart) return;
    if (chartScope) {
      const fy = typeof window !== "undefined" && window.__gtesDashFY ? window.__gtesDashFY : "";
      chartScope.textContent = fy ? `Scope: ${dashScope.toUpperCase()} · FY ${fy}` : `Scope: ${dashScope.toUpperCase()}`;
    }
    const ctx = canvas.getContext("2d");
    const axis = dashPlChartAxisColors();
    const fonts = dashPlChartFonts();
    const dpr = dashPlChartDevicePixelRatio();
    const lightTh = dashPlChartIsLightTheme();
    const ttBg = lightTh ? "rgba(248, 250, 252, 0.98)" : "rgba(15, 23, 42, 0.96)";
    const ttTitleC = lightTh ? "#0f172a" : "#f8fafc";
    const ttBodyC = lightTh ? "#334155" : "#e2e8f0";
    const ttBorder = lightTh ? "rgba(15, 23, 42, 0.14)" : "rgba(148, 163, 184, 0.4)";

    let chartReused = false;
    const ds = dashChart && dashChart.data && dashChart.data.datasets;
    const isGroupedIncomeExpense =
      ds &&
      ds.length === 2 &&
      String(ds[0].label || "") === "Income" &&
      String(ds[1].label || "") === "Expense";
    if (
      dashChart &&
      dashChart.data &&
      Array.isArray(dashChart.data.labels) &&
      dashChart.data.labels.length === c.l.length &&
      dashChart.data.labels.every((lab, i) => lab === c.l[i]) &&
      isGroupedIncomeExpense
    ) {
      try {
        dashChart.data.datasets[0].data = c.r;
        dashChart.data.datasets[1].data = c.e;
        dashChart.options.devicePixelRatio = dpr;
        dashChart.options.plugins.legend.labels.color = axis.legend;
        dashChart.options.plugins.legend.labels.font = fonts.legend;
        dashChart.options.plugins.tooltip.backgroundColor = ttBg;
        dashChart.options.plugins.tooltip.titleColor = ttTitleC;
        dashChart.options.plugins.tooltip.bodyColor = ttBodyC;
        dashChart.options.plugins.tooltip.borderColor = ttBorder;
        dashChart.options.plugins.tooltip.titleFont = fonts.ttTitle;
        dashChart.options.plugins.tooltip.bodyFont = fonts.ttBody;
        dashChart.options.scales.x.ticks.color = axis.tick;
        dashChart.options.scales.x.ticks.font = fonts.tick;
        dashChart.options.scales.x.grid.color = axis.grid;
        dashChart.options.scales.y.ticks.color = axis.tick;
        dashChart.options.scales.y.ticks.font = fonts.tick;
        dashChart.options.scales.y.grid.color = axis.grid;
        dashChart.update("none");
        chartReused = true;
      } catch (_) {
        chartReused = false;
      }
    }

    if (!chartReused) {
      if (dashChart) {
        try {
          dashChart.destroy();
        } catch (_) {
          /* ignore */
        }
      }
      dashChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: c.l,
          datasets: [
            {
              label: "Income",
              data: c.r,
              backgroundColor: "rgba(22, 163, 74, 0.88)",
              borderColor: "rgba(21, 128, 61, 0.95)",
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 22,
            },
            {
              label: "Expense",
              data: c.e,
              backgroundColor: "rgba(127, 29, 29, 0.92)",
              borderColor: "rgba(91, 15, 15, 0.98)",
              borderWidth: 1,
              borderRadius: 4,
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: dpr,
          layout: { padding: { top: 10, right: 10, bottom: 4, left: 6 } },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              align: "end",
              labels: {
                color: axis.legend,
                boxWidth: 14,
                padding: 14,
                font: fonts.legend,
                usePointStyle: false,
              },
            },
            tooltip: {
              backgroundColor: ttBg,
              titleColor: ttTitleC,
              bodyColor: ttBodyC,
              borderColor: ttBorder,
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              titleFont: fonts.ttTitle,
              bodyFont: fonts.ttBody,
              displayColors: true,
              boxPadding: 6,
              callbacks: {
                label: (ctx2) => {
                  const v = Number(ctx2.parsed && ctx2.parsed.y != null ? ctx2.parsed.y : ctx2.raw || 0) || 0;
                  return `${ctx2.dataset.label}: ₹${v.toLocaleString("en-IN")}`;
                },
              },
            },
          },
          scales: {
            x: {
              stacked: false,
              offset: true,
              ticks: {
                color: axis.tick,
                font: fonts.tick,
                maxRotation: 40,
                minRotation: 40,
                autoSkip: false,
                maxTicksLimit: 14,
                padding: 8,
              },
              grid: { color: axis.grid, drawTicks: true },
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: axis.tick,
                font: fonts.tick,
                padding: 10,
                maxTicksLimit: 8,
                callback: (raw) => {
                  const v = Number(raw);
                  if (!Number.isFinite(v)) return raw;
                  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
                },
              },
              grid: { color: axis.grid },
            },
          },
        },
      });
    }

    const monthTable = document.getElementById("gtesPlMonthTable");
    if (monthTable) {
      const rows = c.l
        .map((lab, i) => {
          const rv = Number(c.r[i] || 0) || 0;
          const ev = Number(c.e[i] || 0) || 0;
          const pv = rv - ev;
          const pClass = pv >= 0 ? "text-success" : "text-danger";
          return `<tr>
            <td class="small-muted">${escHtml(lab)}</td>
            <td class="text-end">₹${rv.toLocaleString("en-IN")}</td>
            <td class="text-end">₹${ev.toLocaleString("en-IN")}</td>
            <td class="text-end ${pClass}">₹${pv.toLocaleString("en-IN")}</td>
          </tr>`;
        })
        .join("");
      monthTable.innerHTML = `<div class="table-responsive gtes-pl-month-wrap"><table class="table table-sm table-dark align-middle mb-0">
        <thead><tr>
          <th>Month</th>
          <th class="text-end">Revenue</th>
          <th class="text-end">Expenses</th>
          <th class="text-end">Profit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    }
  }

  function refreshDashboardPreview() {
    const d = getScopeDataset();
    const meta = d._meta;
    const pending = document.getElementById("kpiPending");
    const pendingMeta = document.getElementById("kpiPendingMeta");
    const supplier = document.getElementById("kpiSupplier");
    const tasks = document.getElementById("kpiTasks");
    const stock = document.getElementById("kpiStock");
    const stockQuick = document.getElementById("stockQuick");
    const DQ = typeof window.DashboardQueries !== "undefined" ? window.DashboardQueries : null;
    const sc = dashScope || "all";
    // KPI numbers must match the inline list / modal (same DashboardQueries totals). _meta can lag if invoice balance cache was stale.
    let pendingTotal = meta ? meta.pendingSalesTotal : sum(d.pendingInvoices);
    let pendingCount = meta ? meta.pendingSalesCount : (Array.isArray(d.pendingInvoices) ? d.pendingInvoices.length : 0);
    if (DQ && typeof DQ.getPendingSalesTotals === "function") {
      const pt = DQ.getPendingSalesTotals(sc);
      pendingTotal = pt.totalBalance;
      pendingCount = pt.count;
    }
    let supplierTotal = meta ? meta.supplierOwingTotal : sum(d.supplierDues);
    if (DQ && typeof DQ.getSupplierDueTotals === "function") {
      supplierTotal = DQ.getSupplierDueTotals(sc).totalBalance;
    }
    if (pending) pending.textContent = INR(pendingTotal);
    if (pendingMeta) {
      const fy = typeof window !== "undefined" && window.__gtesDashFY ? window.__gtesDashFY : "";
      const asOf = fy && DQ && DQ.getIndianFYEndDate ? DQ.getIndianFYEndDate(fy) : null;
      const asOfTxt = asOf ? ` (up to ${asOf.toLocaleDateString("en-IN")})` : "";
      pendingMeta.textContent = `${pendingCount} invoices pending${asOfTxt}`;
    }
    if (supplier) supplier.textContent = INR(supplierTotal);
    if (tasks) tasks.textContent = meta ? `${meta.dueTaskCount} tasks` : `${d.dueTasks.length} tasks`;
    if (stock) stock.textContent = meta ? `${meta.stockAlertCount} items` : `${d.stockAlerts.length} items`;
    if (stockQuick) {
      const sq = Array.isArray(d.stockAlerts) ? d.stockAlerts.slice(0, 18) : [];
      stockQuick.innerHTML = sq
        .map((x) => `<div class="gtes-dash-row"><div><div class="fw-semibold">${escHtml(x.n)}</div><div class="small-muted">${escHtml(x.d)}</div></div></div>`)
        .join("");
    }
    renderDetails();
    renderChart();
  }

  function renderDashboardFooter() {
    if (window.App && typeof App.updateCompanyBranding === "function") {
      App.updateCompanyBranding().catch((e) => console.warn("[dashboardShell] updateCompanyBranding:", e && e.message));
      return;
    }
    const d = ADMIN_COMPANY_DETAILS;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || "-"; };
    setText("dashFCompanyName", d.companyName);
    setText("dashFTagline", d.tagline);
    setText("dashFRegisteredAddress", `Registered: ${d.registeredAddress}`);
    setText("dashFWorksAddress", `Works: ${d.worksAddress}`);
    setText("dashFEmail", d.email);
    setText("dashFAltEmail", d.altEmail);
    setText("dashFPhone", d.phone);
    setText("dashFGstin", d.gstin);
    setText("dashFIec", d.iec);
    setText("dashFPan", d.pan);
    setText("dashFCopyright", `© ${new Date().getFullYear()} ${d.companyName}. All rights reserved.`);
    setText("dashFVersionLine", `Version ${d.version} | ${d.developedBy} | ${d.support}`);
  }

  window.__gtesRefreshPremiumDashboard = function __gtesRefreshPremiumDashboard() {
    try {
      initDashFinancialYearControls();
    } catch (e) {
      console.warn("[dashboardShell] FY controls before refresh:", e && e.message);
    }
    refreshDashboardPreview();
    renderDashboardFooter();
  };

  document.addEventListener("DOMContentLoaded", wire);
})();
