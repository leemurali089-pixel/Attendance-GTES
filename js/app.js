// Main Application Logic and Routing
const App = {
    currentView: 'dashboard',
    previousView: 'dashboard',
    viewHistory: ['dashboard'], // Track navigation history
    currentEmployee: null,
    currentMonth: null,
    currentYear: null,
    authInProgress: false,

    init() {
        // Initialize data
        DataManager.init();

        // Check authentication status and update logout button
        AuthManager.isAuth();
        AuthManager.updateLogoutButton();

        // Setup navigation
        this.setupNavigation();

        // Load default view
        this.showView('dashboard');

        // Setup event listeners
        this.setupEventListeners();

        // Initial indicator update
        window.addEventListener('load', () => setTimeout(() => this.updateMagicIndicator(), 100));
        window.addEventListener('resize', () => this.updateMagicIndicator());

        // Initialize theme
        this.initTheme();
    },

    initTheme() {
        // Check localStorage for saved theme, default to dark
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

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
        localStorage.setItem('theme', newTheme);

        // Update magic indicator after theme change
        setTimeout(() => this.updateMagicIndicator(), 50);
    },

    setupNavigation() {
        const navLinks = document.querySelectorAll('[data-view]');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Skip if link has onclick handler (like salary link)
                if (link.onclick || link.getAttribute('onclick')) {
                    return;
                }
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view === 'advances') {
                    AuthManager.requireAuth(() => this.showView(view));
                    return;
                }
                this.showView(view);
            });
        });
    },

    setupEventListeners() {
        // Admin panel button
        const adminBtn = document.getElementById('adminPanelBtn');
        if (adminBtn) {
            adminBtn.addEventListener('click', () => {
                AuthManager.requireAuth(() => {
                    this.showView('admin');
                }); // Removed forcePrompt so it respects existing authentication
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                AuthManager.logout();
                this.showView('dashboard');
                this.showNotification('Logged out successfully', 'success');
            });
        }
    },

    showView(viewName, params = {}) {
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

        // Update active nav
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`[data-view="${viewName}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }

        // Show/hide back button based on view
        this.updateBackButton();

        // Load view-specific content
        this.loadViewContent(viewName, params);

        // Update magic indicator
        setTimeout(() => this.updateMagicIndicator(), 50);
    },

    updateMagicIndicator() {
        const activeLink = document.querySelector('.nav-link.active');
        const indicator = document.querySelector('.magic-indicator');

        if (activeLink && indicator) {
            const linkRect = activeLink.getBoundingClientRect();
            const navRect = activeLink.closest('.navbar-nav').getBoundingClientRect();

            const left = linkRect.left - navRect.left;
            const width = linkRect.width;

            indicator.style.left = `${left}px`;
            indicator.style.width = `${width}px`;
            indicator.style.opacity = '1';
        }
    },

    goBack() {
        // Remove current view from history
        if (this.viewHistory.length > 1) {
            this.viewHistory.pop(); // Remove current view
            const previousView = this.viewHistory[this.viewHistory.length - 1];
            // Temporarily set flag to prevent adding to history when going back
            this._isGoingBack = true;
            this.showView(previousView);
            this._isGoingBack = false;
        } else {
            // If no history, go to dashboard
            this._isGoingBack = true;
            this.showView('dashboard');
            this._isGoingBack = false;
        }
    },

    updateBackButton() {
        // Find or create back button container
        let backButtonContainer = document.getElementById('backButtonContainer');
        if (!backButtonContainer) {
            backButtonContainer = document.createElement('div');
            backButtonContainer.id = 'backButtonContainer';
            backButtonContainer.className = 'back-button-container';
            const containerFluid = document.querySelector('.container-fluid');
            if (containerFluid) {
                containerFluid.insertBefore(backButtonContainer, containerFluid.firstChild);
            }
        }

        // Show back button for all views except dashboard
        if (this.currentView !== 'dashboard' && this.viewHistory.length > 1) {
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

    loadViewContent(viewName, params) {
        switch (viewName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'employees':
                EmployeesModule.load();
                break;
            case 'attendance':
                AttendanceModule.load();
                break;
            case 'filterAttendance':
                FilterAttendanceModule.load();
                break;
            case 'holidays':
                HolidaysModule.load();
                break;
            case 'advances':
                AdvancesModule.load();
                break;
            case 'salary':
                // Auth is handled by the onclick handler in the nav link
                // Only load the module if we reach here (auth was successful)
                SalaryModule.load();
                break;
            case 'employeeView':
                if (params && params.employeeName) {
                    console.log('Loading employee view for:', params.employeeName);
                    const viewElement = document.getElementById('employeeView');
                    if (viewElement) {
                        viewElement.classList.remove('d-none');
                        viewElement.style.display = '';
                    }
                    EmployeeViewModule.load(params.employeeName);
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
                AdminModule.load();
                break;
        }
    },

    loadDashboard() {
        const dashboard = document.getElementById('dashboardView');
        if (!dashboard) return;

        const employees = DataManager.getActiveEmployees();
        const attendance = DataManager.getAttendance();
        const today = new Date();
        const todayStr = DataManager.formatDate(today);
        const todayAttendance = attendance.filter(a => DataManager.formatDate(new Date(a.date)) === todayStr);

        // Update stats if elements exist
        const activeEmpEl = document.getElementById('dashActiveEmployees');
        if (activeEmpEl) activeEmpEl.textContent = employees.length;

        const todayAttEl = document.getElementById('dashTodayAttendance');
        if (todayAttEl) todayAttEl.textContent = todayAttendance.length;

        const todayAbsenceEl = document.getElementById('dashTodayAbsence');
        if (todayAbsenceEl) {
            const todayAbsence = employees.length - todayAttendance.length;
            todayAbsenceEl.textContent = todayAbsence;
        }
        const totalAdvEl = document.getElementById('dashTotalAdvances');
        if (totalAdvEl) totalAdvEl.textContent = DataManager.getAdvances().length;
    },

    showEmployeeDetailsModal(type) {
        const modal = new bootstrap.Modal(document.getElementById('employeeDetailsModal'));
        const modalTitle = document.getElementById('employeeDetailsModalLabel');
        const modalBody = document.getElementById('employeeDetailsModalBody');

        const employees = DataManager.getActiveEmployees();
        const attendance = DataManager.getAttendance();
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
                const presentEmployees = todayAttendance.map(att => {
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
                title = "Today's Absent Employees";
                const presentNames = todayAttendance.map(a => a.employee);
                const absentEmployees = employees.filter(emp => !presentNames.includes(emp.name));
                content = absentEmployees.length > 0 ? `
                    <div class="list-group">
                        ${absentEmployees.map((emp, index) => `
                            <div class="list-group-item d-flex align-items-center">
                                <div class="me-3 text-danger fw-bold">${index + 1}</div>
                                <div class="flex-grow-1">
                                    <div class="fw-bold">${emp.name}</div>
                                    <small class="text-muted">${emp.designation || 'N/A'} • ${emp.salaryType || 'Monthly'}</small>
                                </div>
                                <div class="badge bg-danger">
                                    <i class="bi bi-x-circle"></i> Absent
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="alert alert-success">All employees are present today!</div>';
                break;

            case 'advances':
                title = 'Advance Records Summary';
                const advances = DataManager.getAdvances();
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
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

