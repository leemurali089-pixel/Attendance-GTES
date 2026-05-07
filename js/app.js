// Main Application Logic and Routing
const App = {
    currentView: 'dashboard',
    previousView: 'dashboard',
    viewHistory: ['dashboard'], // Track navigation history
    currentEmployee: null,
    currentMonth: null,
    currentYear: null,
    authInProgress: false,
    /** Fingerprint for Tasks-style live attendance polling (dashboard / attendance / filter views). */
    _attendanceLivePollFp: null,
    _attendanceLivePollTimer: null,

    showLoader() {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.classList.remove('d-none');
        }
    },

    hideLoader(delay = 180) {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('d-none');
            }, delay);
        }
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

        this.showLoader();

        const _pv = (typeof UpdateChecker !== 'undefined' && UpdateChecker.getDisplayVersion) ? UpdateChecker.getDisplayVersion() : '1.3.28';
        console.log(`%c🚀 MJS PrimeLogic v${_pv} Initializing...`, "color: #0dcaf0; font-weight: bold; font-size: 1.2rem;");
        console.log("%c✅ Performance Optimization: ACTIVE (Parallel Cloud Loading)", "color: #198754; font-weight: bold;");
        console.log("%c✅ Voucher Serial Logic: FIXED (Prefix-Sticky & Session Sync)", "color: #198754; font-weight: bold;");

        let loginScreenReady = false;
        // Wire UI first so login still works if cloud/prefetch throws later
        this.setupNavigation();
        this.setupEventListeners();
        this.initTheme();

        try {
            await DataManager.init();
            const loggedIn = await this.checkLoginStatus();

            if (!loggedIn) {
                // Core data (users/settings) is already in cache. First-run has no user rows: must
                // finish UserManager.init (create admin) before allowing interaction.
                const rawUsers = DataManager.getData('gtes_users') || DataManager.getData(UserManager.STORAGE_KEY);
                const hasUsers = Array.isArray(rawUsers) && rawUsers.length > 0;
                if (hasUsers) {
                    this.hideLoader(0);
                    loginScreenReady = true;
                    void UserManager.init().then(() => {
                        this.updateCompanyBranding().catch((e) => console.warn('[App] updateCompanyBranding:', e));
                    });
                    setTimeout(() => this._initDeferredModules(), 0);
                } else {
                    await UserManager.init();
                    await this.updateCompanyBranding();
                    this.hideLoader(0);
                    loginScreenReady = true;
                    setTimeout(() => this._initDeferredModules(), 0);
                }
            } else {
                await UserManager.init();
                await this.updateCompanyBranding();
                this._initDeferredModules();
            }
        } catch (error) {
            console.error('App initialization error:', error);
            try {
                await UserManager.init();
            } catch (e2) {
                console.error('UserManager.init fallback failed:', e2);
            }
            alert('Application failed to initialize: ' + error.message);
        } finally {
            if (!loginScreenReady) {
                this.hideLoader(300);
            }
        }
    },

    /** Sync, analytics, and secondary UI — not required before login interaction. */
    _initDeferredModules() {
        if (typeof SyncManager !== 'undefined') {
            SyncManager.init();
        }

        window.addEventListener('load', () => setTimeout(() => this.updateMagicIndicator(), 100));
        window.addEventListener('resize', () => this.updateMagicIndicator());

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
                else if (v === 'dashboard') await this.loadDashboard();
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

            // Load landing view by default
            this.showLandingPage();
            return true;
        }

        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            loginOverlay.style.display = 'flex'; // Restore display
        }
        if (userInfo) userInfo.classList.add('d-none');
        if (logoutBtn) logoutBtn.style.display = 'none';

        // Hide all nav items when logged out
        document.querySelectorAll('.nav-item').forEach(item => {
            item.style.display = 'none';
        });
        // Ensure login overlay is visible
        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            loginOverlay.style.display = 'flex';
        }
        return false;
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
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        document.documentElement.setAttribute('data-bs-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        // Sync Main Toggle
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) themeToggle.checked = newTheme === 'light';

        // Sync Landing Toggle
        const landingThemeToggle = document.getElementById('landing-theme-toggle');
        if (landingThemeToggle) landingThemeToggle.checked = newTheme === 'light';

        // Update magic indicator after theme change
        setTimeout(() => this.updateMagicIndicator(), 50);
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
    },

    setupEventListeners() {
        // Attendance: match TasksUI — react to any save/sync event, not only firebase-listener.
        window.addEventListener('gtes:data-changed', (event) => {
            const d = event && event.detail;
            if (!d) return;
            const v = this.currentView;
            try {
                if (d.key === 'gtes_attendance') {
                    if (v === 'attendance' && typeof AttendanceModule !== 'undefined') {
                        AttendanceModule.loadAttendanceForDate().catch((e) => console.warn('[App] attendance refresh:', e && e.message));
                    } else if (v === 'filterAttendance' && typeof FilterAttendanceModule !== 'undefined') {
                        FilterAttendanceModule.load().catch((e) => console.warn('[App] filter attendance refresh:', e && e.message));
                    } else if (v === 'dashboard') {
                        this.loadDashboard().catch((e) => console.warn('[App] dashboard refresh:', e && e.message));
                    }
                    if (v !== 'attendance' && v !== 'filterAttendance' && v !== 'dashboard' && typeof this.showNotification === 'function') {
                        this.showNotification('Attendance was updated elsewhere. Numbers refresh when you open Attendance or Dashboard.', 'info');
                    }
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
                if (key === DataManager.KEYS.ATTENDANCE) {
                    const v = this.currentView;
                    if (v === 'attendance' && typeof AttendanceModule !== 'undefined') await AttendanceModule.loadAttendanceForDate();
                    else if (v === 'filterAttendance' && typeof FilterAttendanceModule !== 'undefined') await FilterAttendanceModule.load();
                    else if (v === 'dashboard') await this.loadDashboard();
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

                        // Redirect to Landing Page
                        this.showLandingPage();

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

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        this._setupBackspaceBackShortcut();
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
        await UserManager.logout();
        const loginOverlay = document.getElementById('loginOverlay');
        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');

        // Clear login form
        if (loginUsername) loginUsername.value = '';
        if (loginPassword) loginPassword.value = '';

        // Show Landing Page (which will be hidden by login overlay)
        this.showLandingPage();

        if (loginOverlay) {
            loginOverlay.classList.remove('hidden');
            loginOverlay.style.display = 'flex';

            // Force pointer events reset immediately
            loginOverlay.style.pointerEvents = 'auto';

            // Ensure inputs are enabled
            if (loginUsername) loginUsername.disabled = false;
            if (loginPassword) loginPassword.disabled = false;
        }

        // Hide all nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.style.display = 'none';
        });

        const userInfo = document.getElementById('userInfo');
        if (userInfo) userInfo.classList.add('d-none');

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.style.display = 'none';

        this.showNotification('Logged out successfully', 'success');
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

    showLandingPage() {
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

        // Hide overlay
        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) {
            loginOverlay.classList.add('hidden');
            loginOverlay.style.display = 'none';
        }

        this.updateBackButton();
    },

    async showView(viewName, params = {}) {
        // Special case for landing
        if (viewName === 'landing') {
            this.showLandingPage();
            return;
        }

        // Hide landing view explicitly if it's open
        const landingView = document.getElementById('landingView');
        if (landingView) landingView.classList.add('d-none');

        this.showLoader();
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

            // Hide all views
            document.querySelectorAll('.view-section').forEach(section => {
                section.classList.add('d-none');
            });

            // Show selected view
            const targetView = document.getElementById(`${viewName}View`);
            if (targetView) {
                targetView.classList.remove('d-none');
                // Ensure it's visible
                targetView.style.display = '';
            } else {
                console.error(`View element not found: ${viewName}View`);
            }

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
            await this.loadViewContent(viewName, params);

            // Update magic indicator
            setTimeout(() => this.updateMagicIndicator(), 50);
        } finally {
            this.hideLoader();
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
                try {
                    await DeliveryUI.initManagersOnly();
                    const dView = document.getElementById('deliveryView');
                    if (dView) {
                        document.querySelectorAll('.view-section').forEach(el => el.classList.add('d-none'));
                        dView.classList.remove('d-none');
                        DeliveryUI.showLanding();
                    } else {
                        // Fallback if deliveryView is missing
                        if (viewName === 'challans') DeliveryUI.loadHistory('challansView');
                        else if (viewName === 'jobcard') DeliveryUI.loadJobCards('jobcardView');
                        else DeliveryUI.loadCustomers('customersView');
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
        const totalAdvEl = document.getElementById('dashTotalAdvances');
        if (totalAdvEl) {
            const advances = await DataManager.getAdvances();
            totalAdvEl.textContent = advances.length;
        }
    },

    async showEmployeeDetailsModal(type) {
        const modal = new bootstrap.Modal(document.getElementById('employeeDetailsModal'));
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

        modalTitle.textContent = title;
        modalBody.innerHTML = content;
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

    async logout() {
        if (confirm('Are you sure you want to logout?')) {
            await UserManager.logout();
            const loginOverlay = document.getElementById('loginOverlay');
            const logoutBtn = document.getElementById('logoutBtn');

            if (loginOverlay) {
                loginOverlay.classList.remove('hidden');
                loginOverlay.style.display = 'flex';
            }
            document.getElementById('userInfo').classList.add('d-none');
            if (logoutBtn) logoutBtn.style.display = 'none';
            this.showNotification('Logged out successfully', 'success');
        }
    },

    async updateCompanyBranding() {
        try {
            const settings = await DataManager.getSettings();
            const companyName = settings.companyName || DataManager.COMPANY_PROFILE.name;

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

            // Update Copyright
            const copyrightName = document.getElementById('copyrightCompanyName');
            if (copyrightName) copyrightName.textContent = companyName;

            const copyrightYear = document.getElementById('copyrightYear');
            if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

        } catch (error) {
            console.error('Error updating company branding:', error);
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Expose App to window for global access (needed for inline onclicks)

