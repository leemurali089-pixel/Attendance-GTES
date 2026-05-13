// Main Application Logic and Routing
const App = {
    currentView: 'dashboard',
    /** Last params passed to showView (for shell active states). */
    currentViewParams: {},
    previousView: 'dashboard',
    viewHistory: ['dashboard'], // Track navigation history
    currentEmployee: null,
    currentMonth: null,
    currentYear: null,
    authInProgress: false,
    /** Fingerprint for Tasks-style live attendance polling (dashboard / attendance / filter views). */
    _attendanceLivePollFp: null,
    _attendanceLivePollTimer: null,
    /** During sync/import, coalesce view refreshes until sync completes. */
    _deferredDataRefreshKeys: null,
    _deferredDataRefreshTimer: null,
    /** First cold start: show staged % + elapsed on #globalLoader; suppress nested showView loaders. */
    _bootSequenceActive: false,
    _bootElapsedTimer: null,
    _globalLoaderDismissWired: false,

    _wireGlobalLoaderDismissOnce() {
        if (this._globalLoaderDismissWired) return;
        const btn = document.getElementById('globalLoaderDismissBtn');
        if (!btn) return;
        this._globalLoaderDismissWired = true;
        btn.addEventListener('click', () => {
            const err = document.getElementById('globalLoaderError');
            if (err) err.classList.add('d-none');
            btn.classList.add('d-none');
            this.hideLoader(0);
        });
    },

    _startBootElapsedTimer() {
        if (!this._bootSequenceActive) return;
        if (this._bootElapsedTimer) clearInterval(this._bootElapsedTimer);
        const start = performance.now();
        const tick = () => {
            const el = document.getElementById('globalLoaderElapsed');
            if (el) el.textContent = `${((performance.now() - start) / 1000).toFixed(1)}s`;
        };
        tick();
        this._bootElapsedTimer = setInterval(tick, 200);
    },

    _stopBootElapsedTimer() {
        if (this._bootElapsedTimer) {
            clearInterval(this._bootElapsedTimer);
            this._bootElapsedTimer = null;
        }
    },

    _setInitialBootProgress(pct, stageText) {
        if (!this._bootSequenceActive) return;
        const n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
        const pEl = document.getElementById('globalLoaderPct');
        const bar = document.getElementById('globalLoaderProgressBar');
        const st = document.getElementById('globalLoaderStage');
        if (pEl) pEl.textContent = `${n}%`;
        if (bar) bar.style.width = `${n}%`;
        if (st) st.textContent = stageText || 'Loading…';
    },

    _applyDefaultDashboardFyEarly() {
        try {
            let fy = '';
            if (typeof GTESFinancialYearUi !== 'undefined' && GTESFinancialYearUi.defaultFyKey) {
                fy = GTESFinancialYearUi.defaultFyKey() || '';
            }
            if (!fy && typeof DataManager !== 'undefined' && typeof DataManager.getFinancialYear === 'function') {
                fy = DataManager.getFinancialYear(new Date()) || '';
            }
            if (!fy || typeof window === 'undefined') return;
            const cur = String(window.__gtesDashFY || '').trim();
            if (!cur) window.__gtesDashFY = fy;
        } catch (_) { /* ignore */ }
    },

    _showInitialBootError(err) {
        const msg = err && err.message ? String(err.message) : 'Startup failed.';
        const loader = document.getElementById('globalLoader');
        if (loader) loader.classList.add('gtes-boot-error');
        const box = document.getElementById('globalLoaderError');
        const btn = document.getElementById('globalLoaderDismissBtn');
        if (box) {
            box.textContent = msg;
            box.classList.remove('d-none');
        }
        if (btn) btn.classList.remove('d-none');
        this._setInitialBootProgress(100, 'Error');
        this._wireGlobalLoaderDismissOnce();
    },

    _queueDeferredDataRefresh(key) {
        if (!key) return;
        if (!this._deferredDataRefreshKeys) this._deferredDataRefreshKeys = new Set();
        this._deferredDataRefreshKeys.add(key);
        if (this._deferredDataRefreshTimer) return;
        this._deferredDataRefreshTimer = setTimeout(() => {
            this.flushDeferredDataRefresh().catch(() => {});
        }, 800);
    },

    async flushDeferredDataRefresh() {
        try {
            if (typeof UserManager !== 'undefined' && UserManager.SESSION_KEY) {
                if (!sessionStorage.getItem(UserManager.SESSION_KEY)) return;
            }
        } catch (_) {
            return;
        }
        if (this._deferredDataRefreshTimer) {
            clearTimeout(this._deferredDataRefreshTimer);
            this._deferredDataRefreshTimer = null;
        }
        const keys = this._deferredDataRefreshKeys ? Array.from(this._deferredDataRefreshKeys) : [];
        if (!keys.length) return;

        const SM = window.SyncManager;
        if (SM && SM.status === 'syncing') {
            // Still syncing; try again shortly.
            this._deferredDataRefreshTimer = setTimeout(() => {
                this.flushDeferredDataRefresh().catch(() => {});
            }, 900);
            return;
        }

        try { this._deferredDataRefreshKeys.clear(); } catch (_) { /* ignore */ }

        // Dashboard refresh is expensive — do it once.
        if (this.currentView === 'dashboard') {
            try {
                await this.loadDashboard();
                this._refreshPremiumDashboardShell();
            } catch (e) {
                console.warn('[App] flushDeferredDataRefresh dashboard:', e && e.message);
            }
            return;
        }

        for (let i = 0; i < keys.length; i++) {
            await this._refreshUIFromDataKey(keys[i]);
            // Yield so long bursts don't block paints.
            if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
        }
    },

    showLoader() {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.classList.remove('d-none');
            if (this._bootSequenceActive) {
                loader.classList.add('gtes-boot-loader-active');
                this._wireGlobalLoaderDismissOnce();
                this._startBootElapsedTimer();
            }
        }
    },

    hideLoader(delay = 180) {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('d-none');
                loader.classList.remove('gtes-boot-loader-active');
                loader.classList.remove('gtes-boot-error');
                const err = document.getElementById('globalLoaderError');
                const btn = document.getElementById('globalLoaderDismissBtn');
                if (err) err.classList.add('d-none');
                if (btn) btn.classList.add('d-none');
            }, delay);
        }
        this._stopBootElapsedTimer();
    },

    async init() {
        // Initialize state
        this.currentView = 'landing';
        this.previousView = 'landing';
        this.viewHistory = ['landing'];
        this.currentEmployee = null;
        this.currentMonth = null;
        this.currentYear = null;
        this.authInProgress = false;

        // Hide navbar initially
        const nav = document.querySelector('.navbar');
        if (nav) nav.style.display = 'none';

        this._bootSequenceActive = true;
        this.showLoader();
        this._setInitialBootProgress(8, 'Preparing…');

        const _pv = (typeof UpdateChecker !== 'undefined' && UpdateChecker.getDisplayVersion) ? UpdateChecker.getDisplayVersion() : '1.3.31';
        console.log(`%c🚀 MJS PrimeLogic v${_pv} Initializing...`, "color: #0dcaf0; font-weight: bold; font-size: 1.2rem;");
        console.log("%c✅ Performance Optimization: ACTIVE (Parallel Cloud Loading)", "color: #198754; font-weight: bold;");
        console.log("%c✅ Voucher Serial Logic: FIXED (Prefix-Sticky & Session Sync)", "color: #198754; font-weight: bold;");

        let loginScreenReady = false;
        let bootFailed = false;
        // Wire UI first so login still works if cloud/prefetch throws later
        this.setupNavigation();
        this.setupEventListeners();
        this._wireShellLogoutCapture();
        this.initTheme();
        this._setInitialBootProgress(12, 'Interface ready…');

        try {
            this._setInitialBootProgress(22, 'Reading storage…');
            await DataManager.init();
            this._applyDefaultDashboardFyEarly();
            this._setInitialBootProgress(48, 'Core data loaded…');
            const loggedIn = await this.checkLoginStatus();
            this._setInitialBootProgress(66, 'Session checked…');

            if (!loggedIn) {
                // Core data (users/settings) is already in cache. First-run has no user rows: must
                // finish UserManager.init (create admin) before allowing interaction.
                const rawUsers = DataManager.getData('gtes_users') || DataManager.getData(UserManager.STORAGE_KEY);
                const hasUsers = Array.isArray(rawUsers) && rawUsers.length > 0;
                if (hasUsers) {
                    this._setInitialBootProgress(100, 'Ready');
                    this.hideLoader(0);
                    loginScreenReady = true;
                    void UserManager.init().then(() => {
                        this.updateCompanyBranding().catch((e) => console.warn('[App] updateCompanyBranding:', e));
                    });
                    setTimeout(() => this._initDeferredModules(), 0);
                } else {
                    this._setInitialBootProgress(78, 'First-time setup…');
                    await UserManager.init();
                    await this.updateCompanyBranding();
                    this._setInitialBootProgress(100, 'Ready');
                    this.hideLoader(0);
                    loginScreenReady = true;
                    setTimeout(() => this._initDeferredModules(), 0);
                }
            } else {
                this._setInitialBootProgress(74, 'User profile…');
                await UserManager.init();
                this._setInitialBootProgress(86, 'Branding…');
                await this.updateCompanyBranding();
                this._setInitialBootProgress(94, 'Background services…');
                this._initDeferredModules();
                this._setInitialBootProgress(100, 'Ready');
            }
        } catch (error) {
            bootFailed = true;
            console.error('App initialization error:', error);
            try {
                await UserManager.init();
            } catch (e2) {
                console.error('UserManager.init fallback failed:', e2);
            }
            this._showInitialBootError(error);
            try {
                alert('Application failed to initialize: ' + (error && error.message ? error.message : 'Unknown error'));
            } catch (_) { /* ignore */ }
        } finally {
            if (!loginScreenReady && !bootFailed) {
                this.hideLoader(300);
            }
            this._bootSequenceActive = false;
            this._stopBootElapsedTimer();
        }
    },

    /** Sync, analytics, and secondary UI — not required before login interaction. */
    _initDeferredModules() {
        if (typeof SyncManager !== 'undefined') {
            SyncManager.init();
        }

        window.addEventListener('load', () => setTimeout(() => this.updateMagicIndicator(), 100));
        if (!this._magicIndicatorResizeBound) {
            this._magicIndicatorResizeBound = true;
            window.addEventListener('resize', () => {
                if (this._magicIndicatorResizeRaf) return;
                this._magicIndicatorResizeRaf = requestAnimationFrame(() => {
                    this._magicIndicatorResizeRaf = 0;
                    this.updateMagicIndicator();
                });
            });
        }

        if (typeof AnalyticsUI !== 'undefined') {
            AnalyticsUI.init();
        }
        if (typeof PaymentsUI !== 'undefined') {
            PaymentsUI.init();
        }
        if (typeof TasksUI !== 'undefined') {
            TasksUI.init();
        }
        this._ensureAttendanceLivePoll();

        if (!document.documentElement.dataset.gtesBkVisBound) {
            document.documentElement.dataset.gtesBkVisBound = '1';
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState !== 'visible') return;
                if (window.BookKeeperSync && typeof BookKeeperSync.onAppForeground === 'function') {
                    BookKeeperSync.onAppForeground();
                }
            });
        }

        // Large invoice/voucher loads finish after first paint — refresh BookKeeper KPIs once data is warm.
        [120, 450, 1100].forEach((ms) => {
            setTimeout(() => {
                try {
                    if (typeof UserManager !== 'undefined' && UserManager.SESSION_KEY) {
                        if (!sessionStorage.getItem(UserManager.SESSION_KEY)) return;
                    }
                } catch (_) {
                    return;
                }
                try {
                    this._refreshPremiumDashboardShell();
                } catch (_) { /* ignore */ }
            }, ms);
        });
    },

    /**
     * Same idea as TasksUI: periodic forceRefresh from cloud + refresh open views so
     * edits from another device (web) appear without a full page reload.
     */
    _ensureAttendanceLivePoll() {
        if (this._attendanceLivePollTimer) return;
        const computeFp = async () => {
            const a = await DataManager.getAttendance();
            const list = Array.isArray(a) ? a : [];
            let latestTs = 0;
            let checksum = 0;
            for (const r of list) {
                const stamp = Date.parse(r?.updatedAt || r?.createdAt || 0) || 0;
                if (stamp > latestTs) latestTs = stamp;
                const sig = [
                    r?.id || '',
                    r?.status || '',
                    r?.employee || '',
                    String(r?.date || ''),
                    String(r?.checkIn || ''),
                    String(r?.checkOut || '')
                ].join('|');
                for (let i = 0; i < sig.length; i++) checksum = (checksum + sig.charCodeAt(i)) % 1000000007;
            }
            return `${list.length}:${latestTs}:${checksum}`;
        };
        this._attendanceLivePollTimer = setInterval(async () => {
            try {
                if (typeof UserManager !== 'undefined' && UserManager.SESSION_KEY) {
                    if (!sessionStorage.getItem(UserManager.SESSION_KEY)) return;
                }
            } catch (_) {
                return;
            }
            const v = this.currentView;
            if (v !== 'attendance' && v !== 'filterAttendance' && v !== 'dashboard') return;
            try {
                await DataManager.loadData(DataManager.KEYS.ATTENDANCE, { forceRefresh: true });
                const next = await computeFp();
                if (this._attendanceLivePollFp === null) {
                    this._attendanceLivePollFp = next;
                    return;
                }
                if (next === this._attendanceLivePollFp) return;
                this._attendanceLivePollFp = next;
                if (v === 'attendance' && typeof AttendanceModule !== 'undefined') await AttendanceModule.loadAttendanceForDate();
                else if (v === 'filterAttendance' && typeof FilterAttendanceModule !== 'undefined') await FilterAttendanceModule.load();
                else if (v === 'dashboard') {
                    await this.loadDashboard();
                    this._refreshPremiumDashboardShell();
                }
            } catch (e) {
                console.warn('[App] attendance live poll:', e && e.message);
            }
        }, 8000);
    },

    /**
     * When RTDB or disk sync updates a dataset, refresh the open screen so web + desktop match (same idea as attendance).
     */
    async _refreshUIFromDataKey(key) {
        if (!key || key === DataManager.KEYS.ATTENDANCE) return;
        const v = this.currentView;
        const K = DataManager.KEYS;
        try {
            if (key === K.EMPLOYEES && v === 'employees' && typeof EmployeesModule !== 'undefined') {
                await EmployeesModule.load();
                return;
            }
            if (key === K.HOLIDAYS && v === 'holidays' && typeof HolidaysModule !== 'undefined') {
                await HolidaysModule.load();
                return;
            }
            if (key === K.ADVANCES && v === 'advances' && typeof AdvancesModule !== 'undefined') {
                await AdvancesModule.load();
                return;
            }
            if (key === K.BONUS_PAYOUTS && v === 'bonus' && typeof BonusModule !== 'undefined') {
                await BonusModule.load();
                return;
            }
            if (key === K.EMAIL_LOGS && v === 'mail' && window.MailUI) {
                await MailUI.load();
                return;
            }
            if (key === 'gtes_tasks' && v === 'tasks' && window.TasksUI) {
                await TasksUI.load();
                return;
            }
            if (key === K.SETTINGS && v === 'admin' && typeof AdminModule !== 'undefined') {
                await AdminModule.load();
                return;
            }
            if (key === K.SETTINGS && v === 'dashboard') {
                await this.updateCompanyBranding();
                await this.loadDashboard();
                this._refreshPremiumDashboardShell();
                return;
            }
            if (v === 'salary' && typeof SalaryModule !== 'undefined') {
                if ([K.EMPLOYEES, K.SETTINGS, K.ATTENDANCE, K.ADVANCES, K.BONUS_PAYOUTS, K.HOLIDAYS].indexOf(key) !== -1) {
                    await SalaryModule.load();
                }
                return;
            }
            if (v === 'invoices' && window.InvoicesUI) {
                if (['invoices', 'customers', 'challans', 'inventory', K.SERVICES].indexOf(key) !== -1 || key === K.CHALLANS) {
                    await InvoicesUI.load();
                }
                return;
            }
            if (v === 'challans' && window.DeliveryUI && (key === 'challans' || key === K.CHALLANS)) {
                try {
                    DeliveryUI.loadHistory();
                } catch (e) { /* ignore */ }
                return;
            }
            if (v === 'accounting' && window.AccountingUI) {
                if (['invoices', 'vouchers', 'customers', 'purchases', K.ACCOUNTS, K.JOURNAL_ENTRIES].indexOf(key) !== -1) {
                    await AccountingUI.load();
                }
                return;
            }
            if (v === 'vouchers' && window.VouchersUI) {
                if (['vouchers', 'customers', 'invoices'].indexOf(key) !== -1) {
                    await VouchersUI.load();
                }
                return;
            }
            if (v === 'payments' && window.PaymentsUI) {
                if (['vouchers', 'invoices', 'customers', 'purchases'].indexOf(key) !== -1) {
                    await PaymentsUI.load();
                }
                return;
            }
            if (v === 'poQueue' && window.POQueueUI) {
                if ([K.PURCHASE_ORDERS, 'customers', 'invoices'].indexOf(key) !== -1) {
                    await POQueueUI.load();
                }
                return;
            }
            if (v === 'bankMail' && window.BankMailUI) {
                if ([K.BANK_ALIAS, 'vouchers', 'invoices', 'customers'].indexOf(key) !== -1) {
                    await BankMailUI.load();
                }
                return;
            }
            const analyticsKeys = new Set([
                'invoices', 'vouchers', 'customers', 'purchases', 'challans', K.CHALLANS, 'inventory', 'inventoryTransactions',
                K.INVENTORY_ITEMS, K.SERVICES, K.WAREHOUSES, K.ACCOUNTS, 'gtes_expenses', K.EXPENSE_CATEGORIES,
                K.ESTIMATES, K.PURCHASE_ORDERS, K.RECURRING_INVOICES, K.RECYCLE_BIN,
                K.SETTINGS, K.EMPLOYEES
            ]);
            if (v === 'analytics' && analyticsKeys.has(key) && typeof AnalyticsUI !== 'undefined') {
                AnalyticsUI.refreshCurrentSection();
                return;
            }
            if (v === 'dashboard') {
                await this.loadDashboard();
                this._refreshPremiumDashboardShell();
            }
        } catch (e) {
            console.warn('[App] _refreshUIFromDataKey:', key, e && e.message);
        }
    },

    async checkLoginStatus() {
        const isLoggedIn = await UserManager.isLoggedIn();
        const loginOverlay = document.getElementById('loginOverlay');
        const userInfo = document.getElementById('userInfo');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const logoutBtn = document.getElementById('logoutBtn');

        console.log('Checking login status:', isLoggedIn);

        if (isLoggedIn) {
            const user = await UserManager.getCurrentUser();
            if (loginOverlay) {
                loginOverlay.classList.add('hidden');
                loginOverlay.style.display = 'none'; // Force hide
            }

            // Update Landing User Name
            const landingUserName = document.getElementById('landingUserName');
            if (landingUserName) {
                landingUserName.textContent = user.fullName || user.username;
            }

            if (userInfo) {
                userInfo.classList.remove('d-none');
                userNameDisplay.textContent = user.fullName || user.username;

                // Admin Panel Access
                if (await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SETTINGS) ||
                    await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_USERS)) {
                    userInfo.style.cursor = 'pointer';
                    userInfo.title = 'Click to open Admin Panel';
                    userInfo.onclick = () => this.showView('admin');
                } else {
                    userInfo.style.cursor = 'default';
                    userInfo.title = '';
                    userInfo.onclick = null;
                }
            }
            if (logoutBtn) {
                logoutBtn.style.display = 'block';
            }

            // Update Navigation based on permissions
            const navLinks = document.querySelectorAll('[data-view]');
            for (const link of navLinks) {
                const view = link.getAttribute('data-view');
                let hasAccess = false;

                switch (view) {
                    case 'dashboard':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.VIEW_DASHBOARD);
                        break;
                    case 'employees':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_EMPLOYEES);
                        break;
                    case 'attendance':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_ATTENDANCE);
                        break;
                    case 'salary':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SALARY);
                        break;
                    case 'bonus':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SALARY);
                        break;
                    case 'reports':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.VIEW_REPORTS);
                        break;
                    case 'holidays':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_HOLIDAYS);
                        break;
                    case 'advances':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_ADVANCES);
                        break;
                    case 'mail':
                    case 'poQueue':
                    case 'bankMail':
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.ACCESS_MAIL);
                        break;
                    case 'admin': // Admin view is not typically in the main nav, but good to handle
                        hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SETTINGS) ||
                            await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_USERS);
                        break;
                    default:
                        hasAccess = true; // Default to true for views not explicitly listed
                }

                // Find the parent li element to hide/show the entire nav item
                const navItem = link.closest('.nav-item');
                if (navItem) {
                    if (hasAccess) {
                        navItem.style.display = ''; // Show
                    } else {
                        navItem.style.display = 'none'; // Hide
                    }
                }
            }

            // Ensure "Home" button (Back to Landing) is visible
            const appsBtn = document.querySelector('a[title="Back to Home"]');
            if (appsBtn) {
                const appsBtnParent = appsBtn.closest('.nav-item');
                if (appsBtnParent) appsBtnParent.style.display = '';
            }

            // Ensure logout button's parent nav-item is visible
            const logoutBtnParent = document.getElementById('logoutBtn')?.closest('.nav-item');
            if (logoutBtnParent) {
                logoutBtnParent.style.display = '';
            }

            // Ensure "Apps" button is visible (Logic handled above)

            // CRITICAL: Show these AFTER the nav loop above completes
            // Ensure backup dropdown is visible for admins
            const backupDropdownParent = document.getElementById('backupDropdown')?.closest('.nav-item');
            if (backupDropdownParent) {
                const isAdmin = await UserManager.isAdmin();
                if (isAdmin) {
                    backupDropdownParent.style.display = '';
                } else {
                    backupDropdownParent.style.display = 'none';
                }
            }

            // Ensure theme toggle is always visible when logged in
            const themeToggleParent = document.getElementById('theme-toggle')?.closest('.nav-item');
            if (themeToggleParent) {
                themeToggleParent.style.display = '';
            }

            // Ensure user info is visible when logged in
            const userInfoParent = document.getElementById('userInfo')?.closest('.nav-item');
            if (userInfoParent) {
                userInfoParent.style.display = '';
            }

            // Landing Page Specific Logic
            const landingBackupDropdown = document.getElementById('landingBackupDropdown');
            const landingUserInfo = document.getElementById('landingUserInfo');

            if (await UserManager.isAdmin()) {
                if (landingBackupDropdown) landingBackupDropdown.style.display = 'block';

                if (landingUserInfo) {
                    landingUserInfo.style.cursor = 'pointer';
                    landingUserInfo.onclick = () => this.showView('admin');
                    landingUserInfo.title = 'Click to open Admin Panel';
                }
            } else {
                if (landingBackupDropdown) landingBackupDropdown.style.display = 'none';

                if (landingUserInfo) {
                    landingUserInfo.style.cursor = 'default';
                    landingUserInfo.onclick = null;
                    landingUserInfo.title = '';
                }
            }

            // Sync Landing Theme Toggle State
            const savedTheme = localStorage.getItem('theme') || 'dark';
            const landingThemeToggle = document.getElementById('landing-theme-toggle');
            if (landingThemeToggle) {
                landingThemeToggle.checked = savedTheme === 'light';
            }

            // Load dashboard view by default (premium dashboard shell)
            this._setInitialBootProgress(55, 'Opening dashboard…');
            await this.showView('dashboard', {}, { suppressLoader: !!this._bootSequenceActive });
            if (typeof window.__gtesSyncShellVisibility === 'function') {
                window.__gtesSyncShellVisibility();
            }
            if (window.BookKeeperSync && typeof BookKeeperSync.onAppForeground === 'function') {
                setTimeout(() => BookKeeperSync.onAppForeground(), 400);
            }
            return true;
        }

        this.presentLoginOverlay();
        if (userInfo) userInfo.classList.add('d-none');
        if (logoutBtn) logoutBtn.style.display = 'none';

        // Hide all nav items when logged out
        document.querySelectorAll('.nav-item').forEach(item => {
            item.style.display = 'none';
        });
        return false;
    },

    presentLoginOverlay() {
        const loginOverlay = document.getElementById('loginOverlay');
        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');
        if (!loginOverlay) return;
        loginOverlay.classList.remove('hidden');
        loginOverlay.style.display = 'flex';
        loginOverlay.style.opacity = '1';
        loginOverlay.style.visibility = 'visible';
        loginOverlay.style.zIndex = '20000';
        loginOverlay.style.pointerEvents = 'auto';
        if (loginUsername) loginUsername.disabled = false;
        if (loginPassword) loginPassword.disabled = false;
    },

    initTheme() {
        // Check localStorage for saved theme, default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        // Bootstrap 5.3 reads `data-bs-theme`, not our custom `data-theme`.
        // Setting both keeps every Bootstrap component (card, form-control,
        // table, modal, dropdown…) in sync with the app theme without
        // manual per-component overrides.
        document.documentElement.setAttribute('data-bs-theme', savedTheme);

        // Update checkbox state
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            themeToggle.checked = savedTheme === 'light';
            themeToggle.addEventListener('change', () => this.toggleTheme());
        }
        if (typeof window.__gtesSyncDashThemeRoll === 'function') {
            window.__gtesSyncDashThemeRoll();
        }
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this._pendingTheme = newTheme;
        if (this._themeToggleRaf) return;
        this._themeToggleRaf = requestAnimationFrame(() => {
            this._themeToggleRaf = 0;
            const t = this._pendingTheme;
            this._pendingTheme = null;
            if (!t) return;

            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.setAttribute('data-bs-theme', t);
            localStorage.setItem('theme', t);

            const themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) themeToggle.checked = t === 'light';

            const landingThemeToggle = document.getElementById('landing-theme-toggle');
            if (landingThemeToggle) landingThemeToggle.checked = t === 'light';

            if (typeof window.__gtesSyncDashThemeRoll === 'function') {
                window.__gtesSyncDashThemeRoll();
            }
            requestAnimationFrame(() => this.updateMagicIndicator());
        });
    },

    setupNavigation() {
        const navLinks = document.querySelectorAll('[data-view]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                this.showView(view);
            });
        });

        // Premium shell sidebar (#gtesSidebar): same SPA routes as main nav (data-shell-view + optional JSON params).
        const shellNav = (root) => root.querySelectorAll('#gtesSidebar [data-shell-view]');
        const bindShell = (root = document) => {
            shellNav(root).forEach((btn) => {
                if (btn.dataset.gtesShellNavBound === '1') return;
                btn.dataset.gtesShellNavBound = '1';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const view = btn.getAttribute('data-shell-view');
                    if (!view) return;
                    let params = {};
                    const raw = btn.getAttribute('data-shell-params');
                    if (raw) {
                        try {
                            params = JSON.parse(raw);
                        } catch (_) { /* ignore malformed */ }
                    }
                    this.showView(view, params);
                    document.body.classList.remove('shell-menu-open');
                });
            });
        };
        bindShell();

        // Jump to Page: dropdown lives under #gtesJumpListMirror (dashboard toolbar).
        // Delegate on document (capture) so jump rows use the same App.showView path.
        if (document.documentElement.dataset.gtesJumpDocNavBound !== '1') {
            document.documentElement.dataset.gtesJumpDocNavBound = '1';
            document.addEventListener(
                'click',
                (e) => {
                    const row = e.target && e.target.closest && e.target.closest('.gtes-shell-jump-row[data-gtes-jump-view]');
                    if (!row) return;
                    const inList = row.closest('#gtesJumpListMirror');
                    if (!inList) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const view = row.getAttribute('data-gtes-jump-view');
                    if (!view) return;
                    let params = {};
                    const raw = row.getAttribute('data-gtes-jump-params');
                    if (raw) {
                        try {
                            params = JSON.parse(raw);
                        } catch (_) {
                            params = {};
                        }
                    }
                    void this.showView(view, params);
                    const list = document.getElementById('gtesJumpListMirror');
                    if (list) {
                        list.classList.remove('show');
                        list.innerHTML = '';
                    }
                    const jm = document.getElementById('gtesJumpInputMirror');
                    if (jm) jm.value = '';
                    document.body.classList.remove('shell-menu-open');
                    if (typeof window.__gtesSyncShellNavFromApp === 'function') {
                        window.__gtesSyncShellNavFromApp();
                    }
                },
                true
            );
        }
    },

    setupEventListeners() {
        // Attendance: match TasksUI — react to any save/sync event, not only firebase-listener.
        window.addEventListener('gtes:data-changed', (event) => {
            const d = event && event.detail;
            if (!d) return;
            const v = this.currentView;
            try {
                const SM = window.SyncManager;
                const isSyncing = !!(SM && SM.status === 'syncing');

                if (d.key === 'gtes_attendance') {
                    if (v === 'attendance' && typeof AttendanceModule !== 'undefined') {
                        AttendanceModule.loadAttendanceForDate().catch((e) => console.warn('[App] attendance refresh:', e && e.message));
                    } else if (v === 'filterAttendance' && typeof FilterAttendanceModule !== 'undefined') {
                        FilterAttendanceModule.load().catch((e) => console.warn('[App] filter attendance refresh:', e && e.message));
                    } else if (v === 'dashboard') {
                        this.loadDashboard().catch((e) => console.warn('[App] dashboard refresh:', e && e.message));
                        this._refreshPremiumDashboardShell();
                    }
                    if (v !== 'attendance' && v !== 'filterAttendance' && v !== 'dashboard' && typeof this.showNotification === 'function') {
                        this.showNotification('Attendance was updated elsewhere. Numbers refresh when you open Attendance or Dashboard.', 'info');
                    }
                    return;
                }
                // During sync/import, defer heavy view reloads until sync completes.
                if (isSyncing) {
                    this._queueDeferredDataRefresh(d.key);
                    return;
                }
                // Dashboard KPIs (BookKeeper / invoices / stock) must react to disk/local hydration too — not only firebase-listener.
                const K = DataManager.KEYS;
                const dashDataKeys = new Set([
                    'invoices', 'vouchers', 'customers', 'purchases', 'challans', K.CHALLANS, 'inventory', 'inventoryTransactions',
                    K.INVENTORY_ITEMS, K.SERVICES, K.WAREHOUSES, K.ACCOUNTS, 'gtes_expenses', K.EXPENSE_CATEGORIES,
                    K.ESTIMATES, K.PURCHASE_ORDERS, K.RECURRING_INVOICES, K.RECYCLE_BIN,
                    K.SETTINGS, K.EMPLOYEES, 'gtes_tasks', 'orders'
                ]);
                if (v === 'dashboard' && dashDataKeys.has(d.key)) {
                    this._refreshUIFromDataKey(d.key).catch(() => {});
                    return;
                }
                if (d.source !== 'firebase-listener') return;
                this._refreshUIFromDataKey(d.key).catch(() => {});
            } catch (_) { /* ignore */ }
        });

        // Electron file watcher: disk changed → reload key from cloud and refresh the open view.
        window.addEventListener('gtes:remote-change', async (event) => {
            const key = event && event.detail && event.detail.key;
            if (!key) return;
            try {
                await DataManager.loadData(key, { forceRefresh: true });
                const SM = window.SyncManager;
                if (SM && SM.status === 'syncing' && key !== DataManager.KEYS.ATTENDANCE) {
                    this._queueDeferredDataRefresh(key);
                    return;
                }
                if (key === DataManager.KEYS.ATTENDANCE) {
                    const v = this.currentView;
                    if (v === 'attendance' && typeof AttendanceModule !== 'undefined') await AttendanceModule.loadAttendanceForDate();
                    else if (v === 'filterAttendance' && typeof FilterAttendanceModule !== 'undefined') await FilterAttendanceModule.load();
                    else if (v === 'dashboard') {
                        await this.loadDashboard();
                        this._refreshPremiumDashboardShell();
                    }
                    return;
                }
                await this._refreshUIFromDataKey(key);
            } catch (e) {
                console.warn('[App] remote-change refresh:', e && e.message);
            }
        });

        // Login Form
        const loginForm = document.getElementById('loginForm');

        // Password Visibility Toggle
        const togglePasswordBtn = document.getElementById('togglePasswordBtn');
        const passwordInput = document.getElementById('loginPassword');

        if (togglePasswordBtn && passwordInput) {
            togglePasswordBtn.addEventListener('click', (e) => {
                // Prevent button default
                e.preventDefault();

                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);

                // Toggle icon path
                const iconSvg = togglePasswordBtn.querySelector('svg');
                if (iconSvg) {
                    if (type === 'text') {
                        // Switch to Eye Slash
                        iconSvg.innerHTML = `<path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                    <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                    <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>`;
                    } else {
                        // Switch to Eye
                        iconSvg.innerHTML = `<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                    <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>`;
                    }
                }
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUsername').value.trim();
                const password = document.getElementById('loginPassword').value.trim();
                const errorDiv = document.getElementById('loginError');

                try {
                    const result = await UserManager.authenticate(username, password);
                    if (result.success) {
                        // Login success
                        const loginOverlay = document.getElementById('loginOverlay');
                        if (loginOverlay) {
                            loginOverlay.classList.add('hidden');
                            loginOverlay.style.display = 'none'; // Force hide
                        }

                        // Show theme toggle, backup, and user info after login success
                        const themeToggleParent = document.getElementById('theme-toggle')?.closest('.nav-item');
                        if (themeToggleParent) {
                            themeToggleParent.style.display = '';
                        }

                        const userInfoParent = document.getElementById('userInfo')?.closest('.nav-item');
                        if (userInfoParent) {
                            userInfoParent.style.display = '';
                        }

                        const backupDropdownParent = document.getElementById('backupDropdown')?.closest('.nav-item');
                        if (backupDropdownParent) {
                            // Show for all users
                            backupDropdownParent.style.display = '';
                        }

                        const logoutBtnParent = document.getElementById('logoutBtn')?.closest('.nav-item');
                        if (logoutBtnParent) {
                            logoutBtnParent.style.display = '';
                        }

                        const user = await UserManager.getCurrentUser();
                        const userInfo = document.getElementById('userInfo');
                        const userNameDisplay = document.getElementById('userNameDisplay');
                        if (userInfo) {
                            userInfo.classList.remove('d-none');
                            userNameDisplay.textContent = user.fullName || user.username;
                            // Admin Panel Access
                            if (await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SETTINGS) ||
                                await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_USERS)) {
                                userInfo.style.cursor = 'pointer';
                                userInfo.title = 'Click to open Admin Panel';
                            } else {
                                userInfo.style.cursor = 'default';
                                userInfo.title = '';
                            }
                        }

                        // Update Navigation based on permissions
                        const navLinks = document.querySelectorAll('[data-view]');
                        for (const link of navLinks) {
                            const view = link.getAttribute('data-view');
                            let hasAccess = false;

                            switch (view) {
                                case 'dashboard':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.VIEW_DASHBOARD);
                                    break;
                                case 'employees':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_EMPLOYEES);
                                    break;
                                case 'attendance':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_ATTENDANCE);
                                    break;
                                case 'salary':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SALARY);
                                    break;
                                case 'reports':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.VIEW_REPORTS);
                                    break;
                                case 'holidays':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_HOLIDAYS);
                                    break;
                                case 'advances':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_ADVANCES);
                                    break;
                                case 'mail':
                                case 'poQueue':
                                case 'bankMail':
                                    hasAccess = await UserManager.hasPermission(UserManager.PERMISSIONS.ACCESS_MAIL);
                                    break;
                                default:
                                    hasAccess = true;
                            }

                            const navItem = link.closest('.nav-item');
                            if (navItem) {
                                if (hasAccess) {
                                    navItem.style.display = '';
                                } else {
                                    navItem.style.display = 'none';
                                }
                            }
                        }
                        const logoutBtn = document.getElementById('logoutBtn');
                        if (logoutBtn) logoutBtn.style.display = 'block';

                        // Update UI state immediately
                        await this.checkLoginStatus();

                        // Redirect to dashboard by default
                        this.showView('dashboard');
                        if (typeof window.__gtesSyncShellVisibility === 'function') {
                            window.__gtesSyncShellVisibility();
                        }

                        this.showNotification(`Welcome back, ${user.fullName || user.username}!`, 'success');
                        // Clear form
                        document.getElementById('loginUsername').value = '';
                        document.getElementById('loginPassword').value = '';
                        if (errorDiv) errorDiv.classList.add('d-none');
                    } else {
                        if (errorDiv) {
                            errorDiv.textContent = result.message || 'Invalid username or password';
                            errorDiv.classList.remove('d-none');
                            errorDiv.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                        }
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    if (errorDiv) {
                        errorDiv.textContent = 'An error occurred during login. Check the console for details.';
                        errorDiv.classList.remove('d-none');
                        errorDiv.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            });
        }

        // User Info click (Admin Panel access)
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
            userInfo.addEventListener('click', async () => {
                const isAdmin = await UserManager.isAdmin();
                if (isAdmin) {
                    this.showView('admin');
                }
            });
        }

        this._setupBackspaceBackShortcut();
    },

    /** All logout entry points (navbar + premium shell): capture phase so clicks always run. */
    _wireShellLogoutCapture() {
        if (this._shellLogoutCaptureBound) return;
        this._shellLogoutCaptureBound = true;
        document.addEventListener(
            'click',
            (e) => {
                const t = e.target && e.target.closest && e.target.closest('#logoutBtn, #dashLogoutBtn, #gtesLogoutBtn, [data-gtes-logout]');
                if (!t) return;
                // `const App` does not set `window.App` in classic scripts — do not gate on window.App only.
                if (typeof App !== 'undefined' && App && typeof App.logout === 'function') {
                    void App.logout();
                }
            },
            true
        );
    },

    /**
     * Backspace mirrors the main Back button when it is shown (same rules as updateBackButton).
     * Disabled while typing in inputs, or when a modal/offcanvas is open, so editing is not disrupted.
     * Works in the browser and in the Electron desktop shell (same UI bundle).
     */
    _setupBackspaceBackShortcut() {
        if (this._backspaceBackShortcutBound) return;
        this._backspaceBackShortcutBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Backspace') return;
            if (e.defaultPrevented) return;
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            if (this._shouldIgnoreBackspaceForNavigation(e)) return;
            if (!this._canNavigateBackViaShortcut()) return;
            if (document.querySelector('.modal.show')) return;
            if (document.querySelector('.offcanvas.show')) return;
            e.preventDefault();
            this.goBack();
        });
    },

    _shouldIgnoreBackspaceForNavigation(e) {
        const t = e.target;
        if (!t || t.nodeType !== Node.ELEMENT_NODE) return false;
        if (t.isContentEditable) return true;
        const tag = (t.tagName || '').toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'select') return true;
        if (tag === 'input') {
            const type = (t.type || '').toLowerCase();
            if (['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'color', 'range'].includes(type)) {
                return false;
            }
            if (t.readOnly || t.disabled) return true;
            return true;
        }
        return false;
    },

    _canNavigateBackViaShortcut() {
        return this.currentView !== 'dashboard' && this.currentView !== 'landing' && this.viewHistory.length > 1;
    },

    // Centralized Logout Logic
    async logout() {
        if (this._logoutInProgress) return;
        this._logoutInProgress = true;
        try {
            await this.forceLoginScreen();
            try {
                this.showNotification('Logged out successfully', 'success');
            } catch (e) {
                console.warn('[App] showNotification after logout:', e && e.message);
            }
        } finally {
            this._logoutInProgress = false;
        }
    },

    // NEW: Open a specific top-level module
    openModule(moduleName) {
        const nav = document.querySelector('.navbar');
        const landingView = document.getElementById('landingView');

        // Hide landing
        if (landingView) landingView.classList.add('d-none');

        if (moduleName === 'hrms') {
            // Show Navbar for HRMS
            if (nav) nav.style.display = 'flex';
            this.showView('dashboard');
        } else if (moduleName === 'tasks') {
            if (nav) nav.style.display = 'flex';
            this.showView('tasks');
        } else if (moduleName === 'payments') {
            if (nav) nav.style.display = 'flex';
            this.showView('payments');
        } else if (moduleName === 'analytics') {
            if (nav) nav.style.display = 'flex';
            this.showView('analytics');
        } else if (moduleName === 'accounting') {
            if (nav) nav.style.display = 'flex';
            // Must use showView so viewHistory includes 'accounting' (Back returns here before dashboard).
            this.showView('accounting');
        }
    },

    showLandingPage(options = {}) {
        const retainLoginOverlay = options && options.retainLoginOverlay === true;

        this.currentView = 'landing';
        this.viewHistory = ['landing'];
        
        const landingView = document.getElementById('landingView');
        const nav = document.querySelector('.navbar');

        // Hide Navbar
        if (nav) nav.style.display = 'none';

        // Hide all views first
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('d-none'));

        // Show landing view
        if (landingView) {
            landingView.classList.remove('d-none');
            // Ensure footer is visible
            const footer = document.querySelector('footer');
            if (footer) footer.style.display = '';
        }

        if (!retainLoginOverlay) {
            let hideLoginChrome = true;
            try {
                hideLoginChrome = !!(typeof UserManager !== 'undefined' && UserManager.SESSION_KEY
                    && sessionStorage.getItem(UserManager.SESSION_KEY));
            } catch (_) {
                hideLoginChrome = true;
            }
            if (hideLoginChrome) {
                const loginOverlay = document.getElementById('loginOverlay');
                if (loginOverlay) {
                    loginOverlay.classList.add('hidden');
                    loginOverlay.style.display = 'none';
                }
            }
        }

        this.updateBackButton();
    },

    /**
     * Single path: clear session, cancel deferred dashboard work, show landing + login, hide shell.
     */
    async forceLoginScreen(options = {}) {
        const skipSessionClear = options && options.skipSessionClear === true;
        if (!skipSessionClear) {
            try {
                await UserManager.logout();
            } catch (e) {
                console.warn('[App] UserManager.logout (forceLoginScreen):', e && e.message);
            }
        }
        if (this._premiumDashRetrySeq) {
            this._premiumDashRetrySeq += 1;
        } else {
            this._premiumDashRetrySeq = 1;
        }
        if (this._deferredDataRefreshTimer) {
            clearTimeout(this._deferredDataRefreshTimer);
            this._deferredDataRefreshTimer = null;
        }
        if (this._deferredDataRefreshKeys) {
            try {
                this._deferredDataRefreshKeys.clear();
            } catch (_) { /* ignore */ }
        }

        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');
        if (loginUsername) loginUsername.value = '';
        if (loginPassword) loginPassword.value = '';

        this.showLandingPage({ retainLoginOverlay: true });
        this.presentLoginOverlay();

        try {
            if (typeof window.__gtesSyncShellVisibility === 'function') {
                window.__gtesSyncShellVisibility();
            }
        } catch (e) {
            console.warn('[App] __gtesSyncShellVisibility (forceLoginScreen):', e && e.message);
        }

        try {
            await this.checkLoginStatus();
        } catch (e) {
            console.warn('[App] checkLoginStatus (forceLoginScreen):', e && e.message);
        }
    },

    async showView(viewName, params = {}, navOpts = {}) {
        const suppressLoader = !!(navOpts && navOpts.suppressLoader);
        // Special case for landing
        if (viewName === 'landing') {
            this.showLandingPage();
            return;
        }

        if (typeof UserManager !== 'undefined' && UserManager.isLoggedIn) {
            const loggedIn = await UserManager.isLoggedIn();
            if (!loggedIn) {
                await this.forceLoginScreen();
                return;
            }
        }

        // Hide landing view explicitly if it's open
        const landingView = document.getElementById('landingView');
        if (landingView) landingView.classList.add('d-none');

        if (!suppressLoader) this.showLoader();
        try {
            // Permission Check - Must be at the top to prevent unauthorized access
            let hasPermission = false;
            let requiredPermission = null;


            switch (viewName) {
                case 'dashboard':
                    requiredPermission = UserManager.PERMISSIONS.VIEW_DASHBOARD;
                    break;
                case 'employees':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_EMPLOYEES;
                    break;
                case 'attendance':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_ATTENDANCE;
                    break;
                case 'salary':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_SALARY;
                    break;
                case 'bonus':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_SALARY;
                    break;
                case 'reports':
                    requiredPermission = UserManager.PERMISSIONS.VIEW_REPORTS;
                    break;
                case 'holidays':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_HOLIDAYS;
                    break;
                case 'advances':
                    requiredPermission = UserManager.PERMISSIONS.MANAGE_ADVANCES;
                    break;
                case 'admin':
                    hasPermission = await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_SETTINGS) ||
                        await UserManager.hasPermission(UserManager.PERMISSIONS.MANAGE_USERS);

                    // Show Navbar for Admin View so back button/apps button is visible
                    const nav = document.querySelector('.navbar');
                    if (nav) nav.style.display = 'flex';
                    break;
                case 'filter':
                    // Filter view should be accessible to all logged-in users
                    hasPermission = true;
                    break;
                case 'mail':
                case 'poQueue':
                case 'bankMail':
                    requiredPermission = UserManager.PERMISSIONS.ACCESS_MAIL;
                    break;
                default:
                    hasPermission = true;
            }

            // Check permission if required
            if (requiredPermission) {
                hasPermission = await UserManager.hasPermission(requiredPermission);
            }

            if (!hasPermission) {
                console.warn(`Access denied to ${viewName}. User lacks required permission.`);
                this.showNotification('You do not have permission to access this area.', 'error');

                // Fallback to dashboard if not already trying to access it
                if (viewName !== 'dashboard') {
                    this.showView('dashboard');
                }
                return; // Block access
            }

            // Close mobile menu if open
            const navbarCollapse = document.getElementById('navbarNav');
            if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                const bsCollapse = bootstrap.Collapse.getInstance(navbarCollapse);
                if (bsCollapse) {
                    bsCollapse.hide();
                } else {
                    navbarCollapse.classList.remove('show');
                }
            }

            // Store previous view before switching
            if (this.currentView !== viewName) {
                this.previousView = this.currentView;
                // Add to history if not already the last item (prevents duplicates) and not going back
                if (!this._isGoingBack && this.viewHistory[this.viewHistory.length - 1] !== viewName) {
                    this.viewHistory.push(viewName);
                }
            }
            this.currentView = viewName;
            this.currentViewParams = params && typeof params === 'object' ? { ...params } : {};

            // Hide all views
            document.querySelectorAll('.view-section').forEach(section => {
                section.classList.add('d-none');
            });

            // Delivery / challan hub uses #deliveryView for challans, job card, customers, inventory, services
            const deliveryAppViews = new Set(['challans', 'jobcard', 'customers', 'inventory', 'services']);
            const containerId = deliveryAppViews.has(viewName) ? 'deliveryView' : `${viewName}View`;

            // Show selected view
            const targetView = document.getElementById(containerId);
            if (!targetView) {
                console.error(`View element not found: ${containerId}`);
                if (this.viewHistory.length && this.viewHistory[this.viewHistory.length - 1] === viewName) {
                    this.viewHistory.pop();
                }
                this.currentView = this.viewHistory[this.viewHistory.length - 1] || 'dashboard';
                this.showNotification('This page could not be opened.', 'warning');
                if (viewName !== 'dashboard') {
                    await this.showView('dashboard');
                } else {
                    this.showLandingPage();
                }
                return;
            }
            targetView.classList.remove('d-none');
            targetView.style.display = '';

            // Update active nav (main navbar only — do not strip .active from Analytics sub-tabs, dropdowns, etc.)
            document.querySelectorAll('a.nav-link[data-view]').forEach(link => {
                link.classList.remove('active');
            });
            const activeLink = document.querySelector(`a.nav-link[data-view="${viewName}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }

            // Show/hide back button based on view
            this.updateBackButton();

            // Load view-specific content
            try {
                await this.loadViewContent(viewName, params);
            } catch (err) {
                console.error('[App] loadViewContent', viewName, err);
                this.showNotification(
                    'Could not finish loading this page. Try again or use Back.',
                    'error'
                );
            }

            // Update magic indicator
            setTimeout(() => this.updateMagicIndicator(), 50);
        } finally {
            if (!suppressLoader) this.hideLoader();
        }
    },

    updateMagicIndicator() {
        const indicator = document.querySelector('.magic-indicator');
        if (!indicator) return;

        const activeLink = document.querySelector('.navbar .navbar-nav a.nav-link.active');
        const navbarNav = activeLink?.closest('.navbar-nav');
        if (!activeLink || !navbarNav) {
            indicator.style.opacity = '0';
            return;
        }

        const linkRect = activeLink.getBoundingClientRect();
        const navRect = navbarNav.getBoundingClientRect();
        indicator.style.left = `${linkRect.left - navRect.left}px`;
        indicator.style.width = `${linkRect.width}px`;
        indicator.style.opacity = '1';
    },

    goBack() {
        if (this.viewHistory.length > 1) {
            this.viewHistory.pop();
            const previousView = this.viewHistory[this.viewHistory.length - 1];
            this._isGoingBack = true;
            this.showView(previousView);
            this._isGoingBack = false;
            return;
        }
        // Stack is only the root screen — do not skip intermediate pages elsewhere; nothing to pop.
        if (this.currentView === 'dashboard' || this.currentView === 'landing') {
            return;
        }
        this._isGoingBack = true;
        this.showView('dashboard');
        this._isGoingBack = false;
    },

    updateBackButton() {
        let backButtonContainer = document.getElementById('backButtonContainer');
        const mainContent = document.querySelector('.main-content-container');
        if (!mainContent) return;

        if (!backButtonContainer) {
            backButtonContainer = document.createElement('div');
            backButtonContainer.id = 'backButtonContainer';
            backButtonContainer.className = 'back-button-container';
            mainContent.insertBefore(backButtonContainer, mainContent.firstChild);
        } else if (backButtonContainer.parentElement !== mainContent) {
            mainContent.insertBefore(backButtonContainer, mainContent.firstChild);
        }

        // Show back button for all views except dashboard and landing
        if (this.currentView !== 'dashboard' && this.currentView !== 'landing' && this.viewHistory.length > 1) {
            backButtonContainer.innerHTML = `
                <button class="btn btn-outline-light btn-sm mb-3" onclick="App.goBack()" id="backButton">
                    <i class="bi bi-arrow-left"></i><span class="btn-text">Back</span>
                </button>
            `;
            backButtonContainer.style.display = 'block';
        } else {
            backButtonContainer.style.display = 'none';
        }
    },

    async loadViewContent(viewName, params) {
        switch (viewName) {
            case 'dashboard':
                await this.loadDashboard();
                this._refreshPremiumDashboardShell();
                this._schedulePremiumDashboardShellRetry();
                break;
            case 'employees':
                await EmployeesModule.load();
                break;
            case 'attendance':
                await AttendanceModule.load();
                break;
            case 'filterAttendance':
                await FilterAttendanceModule.load();
                break;
            case 'holidays':
                await HolidaysModule.load();
                break;
            case 'advances':
                await AdvancesModule.load();
                break;
            case 'invoices':
                if (window.InvoicesUI) await InvoicesUI.load(params);
                break;
            case 'accounting':
                if (window.AccountingUI) await AccountingUI.load(params);
                break;
            case 'vouchers':
                if (window.VouchersUI) await VouchersUI.load(params);
                break;
            case 'challans':
            case 'jobcard':
            case 'customers':
            case 'inventory':
            case 'services':
                try {
                    await DeliveryUI.initManagersOnly();
                    const dView = document.getElementById('deliveryView');
                    if (!dView) {
                        if (viewName === 'challans') DeliveryUI.loadHistory('challansView');
                        else if (viewName === 'jobcard') DeliveryUI.loadJobCards('jobcardView');
                        else DeliveryUI.loadCustomers('customersView');
                        break;
                    }
                    document.querySelectorAll('.view-section').forEach((el) => el.classList.add('d-none'));
                    dView.classList.remove('d-none');
                    dView.style.display = '';

                    const p = params && typeof params === 'object' ? params : {};
                    const legacySection =
                        viewName === 'jobcard'
                            ? 'jobcard'
                            : viewName === 'customers'
                              ? 'customers'
                              : viewName === 'inventory'
                                ? 'inventory'
                                : viewName === 'services'
                                  ? 'services'
                                  : null;
                    const section = p.deliverySection || p.section || legacySection;
                    const ct = p.challanType;

                    if (ct === 'dc' && typeof DeliveryUI.viewChallanType === 'function') {
                        DeliveryUI.viewChallanType('delivery');
                    } else if (ct === 'sc' && typeof DeliveryUI.viewChallanType === 'function') {
                        DeliveryUI.viewChallanType('service');
                    } else if (section === 'create' || section === 'history' || section === 'jobcard' || section === 'customers' || section === 'inventory' || section === 'services' || section === 'invoices' || section === 'vouchers') {
                        DeliveryUI.showSection(section);
                    } else if (section === 'challanMenu' && typeof DeliveryUI.showChallanMenu === 'function') {
                        DeliveryUI.showChallanMenu();
                    } else if (!section && typeof DeliveryUI.showLanding === 'function') {
                        DeliveryUI.showLanding();
                    } else if (typeof DeliveryUI.showLanding === 'function') {
                        DeliveryUI.showLanding();
                    }
                } catch (error) {
                    const v = document.getElementById(viewName + 'View');
                    if (v) v.innerHTML = `<div class="alert alert-danger m-4">Error loading ${viewName}: ${error.message}</div>`;
                    console.error(`${viewName} Load Error:`, error);
                }
                break;
            case 'purchases':
                if (window.InvoicesUI) {
                    await InvoicesUI.renderPurchasesList();
                }
                break;
            case 'salary':
                // Auth is handled by the onclick handler in the nav link
                // Only load the module if we reach here (auth was successful)
                await SalaryModule.load();
                break;
            case 'bonus':
                await BonusModule.load();
                break;
            case 'employeeView':
                if (params && params.employeeName) {
                    console.log('Loading employee view for:', params.employeeName);
                    const viewElement = document.getElementById('employeeView');
                    if (viewElement) {
                        viewElement.classList.remove('d-none');
                        viewElement.style.display = '';
                    }
                    await EmployeeViewModule.load(params.employeeName);
                } else {
                    const viewElement = document.getElementById('employeeView');
                    if (viewElement) {
                        viewElement.innerHTML = '<div class="alert alert-warning">Please select an employee to view details</div>';
                        viewElement.classList.remove('d-none');
                        viewElement.style.display = '';
                    }
                }
                break;
            case 'admin':
                await AdminModule.load();
                if (typeof AdminModule.activateTab === 'function' && params.adminTab) {
                    AdminModule.activateTab(params.adminTab);
                }
                if (params.focus === 'backup' && typeof AdminModule.focusDataManagement === 'function') {
                    setTimeout(() => AdminModule.focusDataManagement(), 200);
                }
                break;
            case 'mail':
                if (window.MailUI) await MailUI.load();
                break;
            case 'poQueue':
                if (window.POQueueUI) await POQueueUI.load();
                break;
            case 'bankMail':
                if (window.BankMailUI) await BankMailUI.load();
                break;
            case 'analytics':
                if (typeof AnalyticsUI.ensureSubNav === 'function') {
                    AnalyticsUI.ensureSubNav();
                }
                AnalyticsUI.renderDashboard();
                break;
            case 'payments':
                if (window.PaymentsUI) await PaymentsUI.load(params);
                break;
            case 'tasks':
                if (window.TasksUI) await TasksUI.load(params);
                break;
        }
    },

    async loadDashboard() {
        const dashboard = document.getElementById('dashboardView');
        if (!dashboard) return;

        const employees = await DataManager.getActiveEmployees();
        const attendance = await DataManager.getAttendance();
        const today = new Date();
        const todayStr = DataManager.formatDate(today);
        const todayAttendance = attendance.filter(a => DataManager.formatDate(new Date(a.date)) === todayStr);

        // Update stats if elements exist
        const activeEmpEl = document.getElementById('dashActiveEmployees');
        if (activeEmpEl) activeEmpEl.textContent = employees.length;

        const todayAttEl = document.getElementById('dashTodayAttendance');
        if (todayAttEl) {
            // Fix: Filter only actually present employees
            const presentAttendance = todayAttendance.filter(a =>
                a.status === 'Present' || a.status === 'H-Working' || a.status === 'Half Day'
            );
            todayAttEl.textContent = presentAttendance.length;
        }

        const todayAbsenceEl = document.getElementById('dashTodayAbsence');
        if (todayAbsenceEl) {
            // Count employees without records
            const presentNames = todayAttendance.map(a => a.employee);
            const employeesWithoutRecords = employees.filter(emp => !presentNames.includes(emp.name)).length;

            // Count employees with non-present statuses
            const nonPresentCount = todayAttendance.filter(att =>
                att.status === 'Sick Leave' ||
                att.status === 'Unpaid Leave' ||
                att.status === 'Half Day' ||
                att.status === 'Paid Leave'
            ).length;

            const todayAbsence = employeesWithoutRecords + nonPresentCount;
            todayAbsenceEl.textContent = todayAbsence;
        }
        const outOfStockEl = document.getElementById('dashOutOfStock');
        if (outOfStockEl) {
            if (window.DashboardQueries && typeof DashboardQueries.getStockAlertRows === 'function') {
                outOfStockEl.textContent = DashboardQueries.getStockAlertRows(1).totalCount;
            } else if (DataManager.getData) {
                const tx = DataManager.getData('inventoryTransactions') || [];
                const byMat = new Map();
                tx.forEach((r) => {
                    const mid = r.materialId || r.itemId;
                    if (!mid) return;
                    const q = Number(r?.closingStock ?? r?.quantity ?? 0);
                    if (Number.isNaN(q)) return;
                    const prev = byMat.get(mid);
                    if (!prev || q < prev) byMat.set(mid, q);
                });
                outOfStockEl.textContent = [...byMat.values()].filter((q) => q <= 5).length;
            }
        }

        const totalAdvEl = document.getElementById('dashTotalAdvances');
        if (totalAdvEl) {
            const advances = await DataManager.getAdvances();
            totalAdvEl.textContent = advances.length;
        }
    },

    /** Active All/GST/Plain scope for premium dashboard (toolbar pills). */
    getDashboardShellScope() {
        const a =
            document.querySelector('.gtes-dash-toolbar .scope-pills .active[data-shell-scope]') ||
            document.querySelector('[data-shell-scope].active');
        const v = a && a.getAttribute('data-shell-scope');
        return v === 'gst' || v === 'plain' ? v : 'all';
    },

    /** Full pending invoices / supplier dues / due tasks from live dashboard queries. */
    async openDashboardKpiDetail(detailKey, opts = {}) {
        const el = document.getElementById('gtesDashKpiModal');
        if (!el || typeof bootstrap === 'undefined') return;
        if (el.parentElement !== document.body) document.body.appendChild(el);
        const titleEl = document.getElementById('gtesDashKpiModalLabel');
        const bodyEl = document.getElementById('gtesDashKpiModalBody');
        const footEl = document.getElementById('gtesDashKpiModalFooter');
        const scope = this.getDashboardShellScope();
        const groupBy = opts && opts.groupBy === 'party' ? 'party' : 'bill';
        const rowLimit = 15000;
        const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const fmt = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        let title = '';
        let html = '';
        let foot = '';

        if (detailKey === 'pendingInvoices' && window.DashboardQueries) {
            const rows =
                groupBy === 'party'
                    ? DashboardQueries.getPendingSalesPartyRows(scope, rowLimit)
                    : DashboardQueries.getPendingSalesRows(scope, rowLimit);
            const t = DashboardQueries.getPendingSalesTotals(scope);
            title = `Pending sales invoices (${scope.toUpperCase()})`;
            const th1 = groupBy === 'party' ? 'Party' : 'Invoice / Party';
            const th3 = groupBy === 'party' ? 'Invoices' : 'Status';
            const toggle = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <div class="btn-group btn-group-sm" role="group" aria-label="Group pending sales">
                    <button type="button" class="btn btn-outline-info${groupBy === 'bill' ? ' active' : ''}" onclick="App.openDashboardKpiDetail('pendingInvoices',{groupBy:'bill'})">Bill-wise</button>
                    <button type="button" class="btn btn-outline-info${groupBy === 'party' ? ' active' : ''}" onclick="App.openDashboardKpiDetail('pendingInvoices',{groupBy:'party'})">Party-wise</button>
                </div>
                <span class="small text-muted ms-md-auto">Total: <strong>${fmt(t.totalBalance)}</strong> · <strong>${t.count}</strong> invoice(s)</span>
            </div>`;
            html = `${toggle}
                <div class="table-responsive" style="max-height:55vh"><table class="table table-sm table-dark align-middle mb-0">
                <thead><tr><th>${th1}</th><th class="text-end">Balance</th><th>${th3}</th></tr></thead><tbody>
                ${rows.map((r) => `<tr><td>${esc(r.n)}</td><td class="text-end">${fmt(r.a)}</td><td><span class="badge bg-secondary">${esc(r.d)}</span></td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted">No rows</td></tr>'}
                </tbody></table></div>`;
            if (scope === 'all') {
                foot = `<button type="button" class="btn btn-outline-light me-2" data-bs-dismiss="modal" onclick="App.showView('invoices',{mode:'gst'})">GST Invoices</button>
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="App.showView('invoices',{mode:'non-gst'})">Plain Invoices</button>`;
            } else {
                const mode = scope === 'plain' ? 'non-gst' : 'gst';
                foot = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="App.showView('invoices',{mode:'${mode}'})">Open Invoices</button>`;
            }
        } else if (detailKey === 'supplierDues' && window.DashboardQueries) {
            const rows =
                groupBy === 'party'
                    ? DashboardQueries.getSupplierDuePartyRows(scope, rowLimit)
                    : DashboardQueries.getSupplierDueRows(scope, rowLimit);
            const t = DashboardQueries.getSupplierDueTotals(scope);
            title = `Supplier / vendor payable (${scope.toUpperCase()})`;
            const th1 = groupBy === 'party' ? 'Vendor' : 'Bill — Vendor';
            const th3 = groupBy === 'party' ? 'Bills' : 'Note';
            const toggle = `<div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <div class="btn-group btn-group-sm" role="group" aria-label="Group supplier dues">
                    <button type="button" class="btn btn-outline-info${groupBy === 'bill' ? ' active' : ''}" onclick="App.openDashboardKpiDetail('supplierDues',{groupBy:'bill'})">Bill-wise</button>
                    <button type="button" class="btn btn-outline-info${groupBy === 'party' ? ' active' : ''}" onclick="App.openDashboardKpiDetail('supplierDues',{groupBy:'party'})">Party-wise</button>
                </div>
                <span class="small text-muted ms-md-auto">Total: <strong>${fmt(t.totalBalance)}</strong> · <strong>${t.count}</strong> document(s)</span>
            </div>`;
            html = `${toggle}
                <div class="table-responsive" style="max-height:55vh"><table class="table table-sm table-dark align-middle mb-0">
                <thead><tr><th>${th1}</th><th class="text-end">Balance</th><th>${th3}</th></tr></thead><tbody>
                ${rows.map((r) => `<tr><td>${esc(r.n)}</td><td class="text-end">${fmt(r.a)}</td><td class="small">${esc(r.d)}</td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted">No rows</td></tr>'}
                </tbody></table></div>`;
            foot = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="App.showView('purchases')">Open Purchases</button>`;
        } else if (detailKey === 'dueTasks') {
            const taskKey = (DataManager.KEYS && DataManager.KEYS.TASKS) || 'gtes_tasks';
            const tasks = (DataManager.getData(taskKey) || []).filter((t) => t.status !== 'completed');
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const isDue = (t) => {
                if (!t.followupDate) return false;
                const due = new Date(t.followupDate + 'T' + (t.followupTime || '00:00'));
                return due < now || t.followupDate === todayStr;
            };
            const open = tasks.filter(isDue).sort((a, b) => String(a.followupDate).localeCompare(String(b.followupDate)));
            title = 'Due & today tasks';
            html = `<p class="small text-muted mb-2"><strong>${open.length}</strong> open task(s) due today or overdue.</p>
                <div class="table-responsive" style="max-height:55vh"><table class="table table-sm table-dark align-middle mb-0">
                <thead><tr><th>Follow-up</th><th>Narration</th><th>Status</th></tr></thead><tbody>
                ${open.map((t) => `<tr><td>${esc(t.followupDate || '—')}</td><td>${esc(String(t.narration || 'Task').slice(0, 120))}</td><td>${esc(t.status || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="text-center text-muted">No matching tasks</td></tr>'}
                </tbody></table></div>`;
            foot = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="App.showView('tasks')">Open Tasks</button>`;
        } else if (detailKey === 'stockAlerts' && window.DashboardQueries) {
            const stock = DashboardQueries.getStockAlertRows(8000);
            title = 'Low & out-of-stock items';
            html = `<p class="small text-muted mb-2"><strong>${stock.totalCount}</strong> line(s) with stock ≤ 5 units (includes zero and negative).</p>
                <div class="table-responsive" style="max-height:55vh"><table class="table table-sm table-dark align-middle mb-0">
                <thead><tr><th>Item</th><th>Qty / closing</th></tr></thead><tbody>
                ${stock.rows.map((r) => `<tr><td>${esc(r.n)}</td><td class="text-end">${esc(String(r.a))}</td></tr>`).join('') || '<tr><td colspan="2" class="text-center text-muted">None</td></tr>'}
                </tbody></table></div>`;
            foot = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal" onclick="App.showView('inventory')">Open Inventory</button>`;
        } else {
            title = 'Details';
            html = '<p class="text-muted">Live dashboard data is not available.</p>';
        }

        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.innerHTML = html;
        if (footEl) footEl.innerHTML = foot;
        const inst = bootstrap.Modal.getOrCreateInstance(el, { backdrop: true, keyboard: true, focus: true });
        inst.show();
    },

    async showEmployeeDetailsModal(type) {
        const el = document.getElementById('employeeDetailsModal');
        if (!el || typeof bootstrap === 'undefined') return;
        if (el.parentElement !== document.body) {
            document.body.appendChild(el);
        }
        const modal = bootstrap.Modal.getOrCreateInstance(el, { backdrop: true, keyboard: true, focus: true });
        const modalTitle = document.getElementById('employeeDetailsModalLabel');
        const modalBody = document.getElementById('employeeDetailsModalBody');

        const employees = await DataManager.getActiveEmployees();
        const attendance = await DataManager.getAttendance();
        const today = new Date();
        const todayStr = DataManager.formatDate(today);
        const todayAttendance = attendance.filter(a => DataManager.formatDate(new Date(a.date)) === todayStr);

        let title = '';
        let content = '';

        switch (type) {
            case 'active':
                title = 'Active Employees';
                content = `
                    <div class="list-group">
                        ${employees.map((emp, index) => `
                            <div class="list-group-item d-flex align-items-center">
                                <div class="me-3 text-primary fw-bold">${index + 1}</div>
                                <div class="flex-grow-1">
                                    <div class="fw-bold">${emp.name}</div>
                                    <small class="text-muted">${emp.designation || 'N/A'} • ${emp.salaryType || 'Monthly'}</small>
                                </div>
                                <div class="badge bg-success">Active</div>
                            </div>
                        `).join('')}
                    </div>
                `;
                break;

            case 'present':
                title = "Today's Present Employees";
                // Fix: Filter only actually present employees
                const realPresent = todayAttendance.filter(a =>
                    a.status === 'Present' || a.status === 'H-Working' || a.status === 'Half Day'
                );
                const presentEmployees = realPresent.map(att => {
                    const emp = employees.find(e => e.name === att.employee);
                    return { ...att, empData: emp };
                });
                content = presentEmployees.length > 0 ? `
                    <div class="list-group">
                        ${presentEmployees.map((att, index) => `
                            <div class="list-group-item d-flex align-items-center">
                                <div class="me-3 text-success fw-bold">${index + 1}</div>
                                <div class="flex-grow-1">
                                    <div class="fw-bold">${att.employee}</div>
                                    <small class="text-muted">${att.empData?.designation || 'N/A'} • Status: ${att.status}</small>
                                </div>
                                <div class="badge bg-success">
                                    <i class="bi bi-check-circle"></i> Present
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="alert alert-info">No employees present today</div>';
                break;

            case 'absence':
                title = "Today's Absence Details";
                const presentNames = todayAttendance.map(a => a.employee);

                // Get employees without attendance records
                const absentEmployees = employees.filter(emp => !presentNames.includes(emp.name));

                // Get employees with non-present statuses
                const nonPresentStatuses = todayAttendance.filter(att =>
                    att.status === 'Sick Leave' ||
                    att.status === 'Unpaid Leave' ||
                    att.status === 'Half Day' ||
                    att.status === 'Paid Leave'
                );

                // Combine both lists
                const allAbsent = [
                    ...absentEmployees.map(emp => ({
                        name: emp.name,
                        designation: emp.designation || 'N/A',
                        salaryType: emp.salaryType || 'Monthly',
                        status: 'Absent',
                        badge: 'danger',
                        icon: 'x-circle'
                    })),
                    ...nonPresentStatuses.map(att => {
                        const emp = employees.find(e => e.name === att.employee);
                        let badge = 'warning';
                        let icon = 'exclamation-circle';
                        if (att.status === 'Sick Leave') {
                            badge = 'danger';
                            icon = 'thermometer-half';
                        } else if (att.status === 'Half Day') {
                            badge = 'info';
                            icon = 'hourglass-split';
                        } else if (att.status === 'Paid Leave') {
                            badge = 'success';
                            icon = 'calendar-check';
                        }
                        return {
                            name: att.employee,
                            designation: emp?.designation || 'N/A',
                            salaryType: emp?.salaryType || 'Monthly',
                            status: att.status,
                            badge,
                            icon
                        };
                    })
                ];

                content = allAbsent.length > 0 ? `
                    <div class="list-group">
                        ${allAbsent.map((emp, index) => `
                            <div class="list-group-item d-flex align-items-center">
                                <div class="me-3 text-${emp.badge} fw-bold">${index + 1}</div>
                                <div class="flex-grow-1">
                                    <div class="fw-bold">${emp.name}</div>
                                    <small class="text-muted">${emp.designation} • ${emp.salaryType}</small>
                                </div>
                                <div class="badge bg-${emp.badge}">
                                    <i class="bi bi-${emp.icon}"></i> ${emp.status}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="alert alert-success">All employees are present today!</div>';
                break;

            case 'advances':
                title = 'Advance Records Summary';
                const advances = await DataManager.getAdvances();
                const advancesByEmployee = {};

                advances.forEach(adv => {
                    if (!advancesByEmployee[adv.employeeName]) {
                        advancesByEmployee[adv.employeeName] = [];
                    }
                    advancesByEmployee[adv.employeeName].push(adv);
                });

                content = Object.keys(advancesByEmployee).length > 0 ? `
                    <div class="list-group">
                        ${Object.keys(advancesByEmployee).map((empName, index) => {
                    const empAdvances = advancesByEmployee[empName];
                    const totalAmount = empAdvances.reduce((sum, adv) => sum + parseFloat(adv.amount || 0), 0);
                    return `
                                <div class="list-group-item">
                                    <div class="d-flex align-items-center mb-2">
                                        <div class="me-3 text-warning fw-bold">${index + 1}</div>
                                        <div class="flex-grow-1">
                                            <div class="fw-bold">${empName}</div>
                                            <small class="text-muted">${empAdvances.length} advance(s)</small>
                                        </div>
                                        <div class="text-warning fw-bold">₹${totalAmount.toLocaleString('en-IN')}</div>
                                    </div>
                                </div>
                            `;
                }).join('')}
                    </div>
                ` : '<div class="alert alert-info">No advance records found</div>';
                break;
        }

        if (modalTitle) modalTitle.textContent = title;
        if (modalBody) modalBody.innerHTML = content;
        modal.show();
    },
    
    /**
     * Unified trigger for Book Keeper synchronization.
     * Detects environment and uses the appropriate sync method.
     */
    async startBookKeeperSync() {
        if (typeof BookKeeperSync === 'undefined') {
            this.showNotification('Book Keeper sync module not loaded.', 'error');
            return;
        }
        if (typeof SyncManager !== 'undefined') {
            SyncManager.updateStatus('syncing', 'Starting manual sync...');
            if (typeof SyncManager.setSyncProgress === 'function') {
                SyncManager.setSyncProgress(1, 'Opening backup file picker');
            }
            if (typeof SyncManager.showAuditModal === 'function') {
                SyncManager.showAuditModal();
            }
        }

        // 1. Desktop Sync (Native Electron Picker)
        if (window.electronAPI && typeof BookKeeperSync.initiateNativeSync === 'function') {
            await BookKeeperSync.initiateNativeSync();
            return;
        }

        // 2. Web Sync Fallback (File Picker API or Input)
        if (typeof BookKeeperSync.initiateWebSync === 'function') {
            await BookKeeperSync.initiateWebSync();
            return;
        }

        this.showNotification('Sync mechanism not supported on this device.', 'error');
    },

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `toast-premium alert alert-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 320px; padding: 0; border: none;';

        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';

        notification.innerHTML = `
            <div class="d-flex p-3 align-items-center">
                <i class="bi bi-${icon} fs-4 me-3"></i>
                <div class="flex-grow-1 fw-medium">${message}</div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="alert"></button>
            </div>
            <div class="toast-progress"></div>
        `;

        document.body.appendChild(notification);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    confirmAction(message) {
        return confirm(message);
    },

    async updateCompanyBranding() {
        try {
            const settings = await DataManager.getSettings();
            const companyName = settings.companyName || DataManager.COMPANY_PROFILE.name;
            const registeredAddress = settings.registeredAddress || settings.address || DataManager.COMPANY_PROFILE.address;
            const workAddress = settings.workAddress || settings.address2 || '';
            const gstin = settings.gstin || DataManager.COMPANY_PROFILE.gstin || '';
            const pan = settings.pan || DataManager.COMPANY_PROFILE.pan || '';
            const iec = settings.iec || '';
            const supportContact = settings.supportContact || 'leemurali089@gmail.com / +91 99529 70089';
            const phones = settings.phones || settings.phone || '';
            const emailList = String(settings.emails || settings.email || '').split(',').map((v) => v.trim()).filter(Boolean);
            const primaryEmail = emailList[0] || 'gastechengservice@gmail.com';
            const secondaryEmail = emailList[1] || primaryEmail;

            // Update Title
            document.title = `${companyName} - Attendance & Salary Management`;
            const appTitle = document.getElementById('appTitle');
            if (appTitle) appTitle.textContent = `${companyName} - Attendance & Salary Management`;

            // Update Header
            const headerName = document.getElementById('headerCompanyName');
            if (headerName) headerName.textContent = companyName;

            // Update Landing Page
            const landingName = document.getElementById('landingCompanyName');
            if (landingName) landingName.textContent = companyName;

            // Update Login Screen
            const loginName = document.getElementById('loginCompanyName');
            if (loginName) {
                loginName.textContent = companyName;
                // Hide if no company name or if it matches default App Name (though here we hardcoded App Name)
                if (!companyName || companyName === 'MJS PrimeLogic') {
                    // Optional: decide if we hide it if it's the same, 
                    // but user asked for "Company name if available". 
                    // Generally companyName from data is "Gas Tech" or something set by user.
                    // If not set, it defaults to 'MJS PrimeLogic' in DataManager?
                    // Let's just show it.
                }
            }

            // Update Footer
            const footerName = document.getElementById('footerCompanyName');
            if (footerName) footerName.textContent = companyName;
            const footerRegisteredAddress = document.getElementById('footerRegisteredAddress');
            if (footerRegisteredAddress) footerRegisteredAddress.textContent = registeredAddress || '—';
            const footerWorkAddress = document.getElementById('footerWorkAddress');
            if (footerWorkAddress) footerWorkAddress.textContent = workAddress || '—';
            const footerGstin = document.getElementById('footerGstin');
            if (footerGstin) footerGstin.textContent = gstin || '—';
            const footerPan = document.getElementById('footerPan');
            if (footerPan) footerPan.textContent = pan || '—';
            const footerIec = document.getElementById('footerIec');
            if (footerIec) footerIec.textContent = iec || '—';
            const footerPhones = document.getElementById('footerPhones');
            if (footerPhones) footerPhones.textContent = phones || '—';
            const footerEmailPrimary = document.getElementById('footerEmailPrimary');
            if (footerEmailPrimary) {
                footerEmailPrimary.textContent = primaryEmail;
                footerEmailPrimary.setAttribute('href', `mailto:${primaryEmail}`);
            }
            const footerEmailSecondary = document.getElementById('footerEmailSecondary');
            if (footerEmailSecondary) {
                footerEmailSecondary.textContent = secondaryEmail;
                footerEmailSecondary.setAttribute('href', `mailto:${secondaryEmail}`);
            }
            const footerSupportContact = document.getElementById('footerSupportContact');
            if (footerSupportContact) footerSupportContact.textContent = `Support: ${supportContact}`;

            // Update Copyright
            const copyrightName = document.getElementById('copyrightCompanyName');
            if (copyrightName) copyrightName.textContent = companyName;

            const copyrightYear = document.getElementById('copyrightYear');
            if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

            // Premium shell dashboard footer (#dashboardView)
            const setDash = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.textContent = text != null && text !== '' ? text : '—';
            };
            const tagline =
                settings.tagline ||
                settings.companyTagline ||
                'Excellence in Engineering & Service Solutions.';
            const phoneStr = Array.isArray(settings.phones)
                ? settings.phones.filter(Boolean).join(', ')
                : (settings.phones || settings.phone || DataManager.COMPANY_PROFILE.phones.join(', ') || '—');
            setDash('dashFCompanyName', companyName);
            setDash('dashFTagline', tagline);
            setDash('dashFRegisteredAddress', registeredAddress ? `Registered: ${registeredAddress}` : '—');
            setDash('dashFWorksAddress', workAddress ? `Works: ${workAddress}` : '—');
            setDash('dashFEmail', primaryEmail);
            setDash('dashFAltEmail', secondaryEmail);
            setDash('dashFPhone', phoneStr);
            setDash('dashFGstin', gstin || '—');
            setDash('dashFIec', iec || '—');
            setDash('dashFPan', pan || '—');
            setDash('dashFCopyright', `© ${new Date().getFullYear()} ${companyName}. All rights reserved.`);
            setDash('dashFVersionLine', `Version 1.3.31 | Developed by Murali D | Support: ${supportContact}`);

            const shellCo = document.getElementById('shellBrandCompanyName');
            if (shellCo) shellCo.textContent = companyName;
            const shellTag = document.getElementById('shellBrandTagline');
            if (shellTag) shellTag.textContent = tagline;
        } catch (error) {
            console.error('Error updating company branding:', error);
        }
    },

    /** Refreshes premium dashboard KPIs/chart (dashboardShell + DashboardQueries). */
    _refreshPremiumDashboardShell() {
        try {
            if (typeof window.__gtesRefreshPremiumDashboard === 'function') {
                window.__gtesRefreshPremiumDashboard();
            }
        } catch (e) {
            console.warn('[App] premium dashboard refresh:', e && e.message);
        }
    },

    /**
     * After a cold load, invoices/vouchers may hydrate a few hundred ms after the first KPI paint.
     * Re-run the premium dashboard refresh a few times while the user stays on Dashboard.
     */
    _schedulePremiumDashboardShellRetry() {
        if (this._premiumDashRetrySeq) {
            this._premiumDashRetrySeq += 1;
        } else {
            this._premiumDashRetrySeq = 1;
        }
        const seq = this._premiumDashRetrySeq;
        [80, 160, 320, 600, 1200, 2200, 4500, 9000].forEach((ms) => {
            setTimeout(() => {
                if (this.currentView !== 'dashboard') return;
                if (this._premiumDashRetrySeq !== seq) return;
                this._refreshPremiumDashboardShell();
            }, ms);
        });
    }
};

/** Classic script: top-level `const App` is not `window.App` — shell/Electron helpers rely on this. */
window.App = App;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Expose App to window for global access (needed for inline onclicks)

