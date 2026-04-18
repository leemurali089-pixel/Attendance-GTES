/**
 * Admin Module - Centralized Administration
 */
const AdminModule = {
    userModal: null,
    _getUserModalEl() {
        const all = Array.from(document.querySelectorAll('#userModal'));
        if (all.length === 0) return null;
        const shown = all.find(el => el.classList.contains('show'));
        return shown || all[all.length - 1];
    },
    _resetModalState() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
    },

    _ensureUserModal() {
        const duplicates = Array.from(document.querySelectorAll('#userModal'));
        if (duplicates.length > 1) {
            // Keep the newest modal and remove stale clones to avoid wrong field reads.
            duplicates.slice(0, -1).forEach(el => {
                try { bootstrap.Modal.getInstance(el)?.dispose(); } catch (_) { }
                el.remove();
            });
        }
        const modalEl = this._getUserModalEl();
        if (!modalEl) return null;
        if (modalEl.parentElement !== document.body) {
            document.body.appendChild(modalEl);
        }
        if (!this.userModal) {
            this.userModal = new bootstrap.Modal(modalEl, { backdrop: true, keyboard: true, focus: true });
            modalEl.addEventListener('hidden.bs.modal', () => this._resetModalState());
        }
        return this.userModal;
    },

    async load() {
        const view = document.getElementById('adminView');
        if (!view) return;

        view.classList.remove('d-none');
        view.style.display = '';

        await this.renderAdminDashboard();
    },

    async renderAdminDashboard() {
        const view = document.getElementById('adminView');
        const settings = await DataManager.getSettings() || {};
        // Remove stale user modals left in document.body from previous admin renders.
        document.querySelectorAll('#userModal').forEach(el => {
            try { bootstrap.Modal.getInstance(el)?.dispose(); } catch (_) { }
            el.remove();
        });

        // Default values if not set
        const defaults = {
            companyName: "MJS PrimeLogic",
            registeredAddress: "",
            workAddress: "",
            emails: "",
            phones: "",
            gstin: "",
            pan: "",
            iec: "",
            upiId: "",
            licenseText: "Developed by - Murali D"
        };

        const s = { ...defaults, ...settings };

        view.innerHTML = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2><i class="bi bi-shield-lock"></i> Admin Panel</h2>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <ul class="nav nav-tabs card-header-tabs" id="adminTabs" role="tablist">
                        <li class="nav-item">
                            <button class="nav-link active" id="users-tab" data-bs-toggle="tab" data-bs-target="#users" type="button">
                                <i class="bi bi-people"></i> User Management
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" id="audit-tab" data-bs-toggle="tab" data-bs-target="#audit" type="button" onclick="AdminModule.loadAuditLogs()">
                                <i class="bi bi-list-check"></i> Audit Logs
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" id="settings-tab" data-bs-toggle="tab" data-bs-target="#settings" type="button">
                                <i class="bi bi-gear"></i> System Settings
                            </button>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    <div class="tab-content" id="adminTabsContent">
                        
                        <!-- User Management Tab -->
                        <div class="tab-pane fade show active" id="users" role="tabpanel">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5>System Users</h5>
                                <button class="btn btn-primary btn-sm" onclick="AdminModule.showUserModal()">
                                    <i class="bi bi-person-plus"></i> Add User
                                </button>
                            </div>
                            <div id="usersTableContainer">Loading users...</div>
                        </div>

                        <!-- Audit Logs Tab -->
                        <div class="tab-pane fade" id="audit" role="tabpanel">
                            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                                <h5 class="mb-0">System Activity Log</h5>
                                <div class="d-flex gap-2 flex-wrap align-items-end">
                                    <div>
                                        <label class="form-label small mb-1">Date</label>
                                        <select class="form-select form-select-sm" id="auditFilterDate" onchange="AdminModule.loadAuditLogs()">
                                            <option value="">All</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="form-label small mb-1">Month</label>
                                        <select class="form-select form-select-sm" id="auditFilterMonth" onchange="AdminModule.loadAuditLogs()">
                                            <option value="">All</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="form-label small mb-1">Year</label>
                                        <select class="form-select form-select-sm" id="auditFilterYear" onchange="AdminModule.loadAuditLogs()">
                                            <option value="">All</option>
                                        </select>
                                    </div>
                                    <button class="btn btn-outline-secondary btn-sm" onclick="AdminModule.clearAuditDateFilters()">
                                        <i class="bi bi-x-circle"></i> Clear
                                    </button>
                                    <button class="btn btn-outline-secondary btn-sm me-2" onclick="AdminModule.loadAuditLogs()">
                                        <i class="bi bi-arrow-clockwise"></i> Refresh
                                    </button>
                                    <button class="btn btn-success btn-sm" onclick="AuditManager.exportLogs()">
                                        <i class="bi bi-download"></i> Export CSV
                                    </button>
                                </div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-sm table-hover" id="auditTable">
                                    <thead>
                                        <tr>
                                            <th>Timestamp</th>
                                            <th>User</th>
                                            <th>Action</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody id="auditTableBody">
                                        <!-- Populated by JS -->
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <!-- Settings Tab -->
                        <div class="tab-pane fade" id="settings" role="tabpanel">
                            <form id="companySettingsForm" onsubmit="AdminModule.saveSettings(event)">
                                <div class="card mb-4">
                                    <div class="card-header bg-light">
                                        <h5 class="mb-0">Company Profile</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-12 mb-3">
                                                <label class="form-label">Company Name</label>
                                                <input type="text" class="form-control" id="companyName" value="${s.companyName}">
                                            </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Registered Address</label>
                                                <textarea class="form-control" id="registeredAddress" rows="3">${s.registeredAddress}</textarea>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Work Address</label>
                                                <textarea class="form-control" id="workAddress" rows="3">${s.workAddress}</textarea>
                                            </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Emails</label>
                                                <input type="text" class="form-control" id="companyEmails" value="${s.emails}">
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Phones</label>
                                                <input type="text" class="form-control" id="companyPhones" value="${s.phones}">
                                            </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-4 mb-3">
                                                <label class="form-label">GSTIN</label>
                                                <input type="text" class="form-control" id="companyGSTIN" value="${s.gstin}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label class="form-label">PAN</label>
                                                <input type="text" class="form-control" id="companyPAN" value="${s.pan}">
                                            </div>
                                            <div class="col-md-4 mb-3">
                                                <label class="form-label">IEC</label>
                                                <input type="text" class="form-control" id="companyIEC" value="${s.iec}">
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">UPI ID (For Invoice QR)</label>
                                                <input type="text" class="form-control" id="companyUPI" value="${s.upiId}" placeholder="e.g. yourname@okicici">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="card mb-4">
                                    <div class="card-header bg-light">
                                        <h5 class="mb-0">Bank Details (For Invoices)</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Bank Name</label>
                                                <input type="text" class="form-control" id="bankName" value="${s.bankDetails?.bankName || ''}">
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Branch</label>
                                                <input type="text" class="form-control" id="bankBranch" value="${s.bankDetails?.branch || ''}">
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Account Number</label>
                                                <input type="text" class="form-control" id="bankAccountNo" value="${s.bankDetails?.accountNo || ''}">
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">IFSC Code</label>
                                                <input type="text" class="form-control" id="bankIFSC" value="${s.bankDetails?.ifsc || ''}">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="card mb-4">
                                    <div class="card-header bg-light">
                                        <h5 class="mb-0">OT Calculation Settings</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="row">
                                            <div class="col-md-4 mb-3">
                                                <label class="form-label">Fixed OT Rate (₹/hr)</label>
                                                <input type="number" class="form-control" id="otRate" value="${s.otRate || 0}">
                                                <small class="d-block mt-1" style="opacity: 0.8;">Used when "Fixed Rate" is selected below</small>
                                            </div>
                                        </div>

                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">OT Calculation Method</label>
                                                <select class="form-select" id="otCalculationMethod">
                                                    <option value="salaryBased9" ${s.otCalculationMethod === 'salaryBased9' ? 'selected' : ''}>Based on Salary (Per Hour Salary = Basic Salary ÷ 30 ÷ 9)</option>
                                                    <option value="salaryBased8" ${s.otCalculationMethod === 'salaryBased8' ? 'selected' : ''}>Based on Salary (Per Hour Salary = Basic Salary ÷ 30 ÷ 8)</option>
                                                    <option value="fixedRate" ${s.otCalculationMethod === 'fixedRate' ? 'selected' : ''}>Fixed Rate: Uses the same Fixed OT Rate defined above</option>
                                                </select>
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">H-OT Calculation Method *</label>
                                                <select class="form-select" id="hOtCalculationMethod">
                                                    <option value="salaryBased9" ${s.hOtCalculationMethod === 'salaryBased9' ? 'selected' : ''}>Based on Salary (Per Hour Salary = Basic Salary ÷ 30 ÷ 9)</option>
                                                    <option value="salaryBased8" ${s.hOtCalculationMethod === 'salaryBased8' ? 'selected' : ''}>Based on Salary (Per Hour Salary = Basic Salary ÷ 30 ÷ 8)</option>
                                                    <option value="fixedRate" ${s.hOtCalculationMethod === 'fixedRate' ? 'selected' : ''}>Fixed Rate: Uses the same Fixed OT Rate defined above</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="card mb-4">
                                    <div class="card-header bg-light">
                                        <h5 class="mb-0">Email Configuration (SMTP)</h5>
                                    </div>
                                    <div class="card-body">
                                        <div class="alert alert-info small">
                                            <i class="bi bi-info-circle me-1"></i>
                                            Configure SMTP settings to enable email payslips. For Gmail, use an App Password.
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">SMTP Host</label>
                                                <input type="text" class="form-control" id="smtpHost" value="${s.emailConfig?.host || 'smtp.gmail.com'}" placeholder="smtp.gmail.com">
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">SMTP Port</label>
                                                <input type="number" class="form-control" id="smtpPort" value="${s.emailConfig?.port || 465}" placeholder="465">
                                            </div>
                                        </div>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Email Address (User)</label>
                                                <input type="email" class="form-control" id="smtpUser" value="${s.emailConfig?.auth?.user || ''}" placeholder="your-email@gmail.com">
                                            </div>
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">App Password</label>
                                                <input type="password" class="form-control" id="smtpPass" value="${s.emailConfig?.auth?.pass || ''}" placeholder="App Password">
                                            </div>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="checkbox" id="smtpSecure" ${s.emailConfig?.secure !== false ? 'checked' : ''}>
                                            <label class="form-check-label" for="smtpSecure">
                                                Use Secure Connection (SSL/TLS)
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <button type="submit" class="btn btn-primary">Save Settings</button>
                            </form>

                            <hr>

                            <div class="card mb-4" id="gmailSyncCard">
                                <div class="card-header bg-light d-flex justify-content-between align-items-center">
                                    <h5 class="mb-0"><i class="bi bi-google"></i> Gmail Integration</h5>
                                    <span id="gmailStatusPill" class="badge bg-secondary">Checking…</span>
                                </div>
                                <div class="card-body">
                                    <div id="gmailStatusDetail" class="small text-muted mb-2">Loading status…</div>
                                    <div class="d-flex gap-2 flex-wrap">
                                        <button class="btn btn-sm btn-primary" onclick="MailUI && MailUI.load ? App.showView('mail') : null"><i class="bi bi-envelope"></i> Open Mail</button>
                                        <button class="btn btn-sm btn-outline-primary" onclick="App.showView('poQueue')"><i class="bi bi-receipt"></i> PO Queue</button>
                                        <button class="btn btn-sm btn-outline-info" onclick="App.showView('bankMail')"><i class="bi bi-bank"></i> Bank Mail</button>
                                        <button class="btn btn-sm btn-outline-secondary" id="gmailAdminSync"><i class="bi bi-arrow-clockwise"></i> Sync now</button>
                                        <button class="btn btn-sm btn-outline-secondary" id="gmailAdminSettings"><i class="bi bi-gear"></i> Settings</button>
                                    </div>
                                </div>
                            </div>

                            <h5>Data Management</h5>
                            <div class="d-flex gap-2">
                                <button class="btn btn-outline-primary" onclick="AdminModule.exportManualBackup()">
                                    <i class="bi bi-cloud-arrow-up"></i> Create Manual Backup
                                </button>
                                <button class="btn btn-outline-info" onclick="AdminModule.analyzeBookKeeperFile()">
                                    <i class="bi bi-search"></i> Analyze BookKeeper Features
                                </button>
                            </div>
                            
                            <hr>
                            
                            <h5>Application Version</h5>
                            <div class="d-flex align-items-center gap-3">
                                <div>
                                    <p class="mb-1"><strong>Current Version:</strong> <span class="badge bg-info">${UpdateChecker.getCurrentVersion()}</span></p>
                                    <p class="text-muted small mb-0">MJS PrimeLogic - Attendance & Salary Management</p>
                                </div>
                                <button class="btn btn-outline-success btn-sm" onclick="UpdateChecker.performUpdateCheck()">
                                    <i class="bi bi-arrow-clockwise"></i> Check for Updates
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
            
            ${this.getUserModalHTML()}
        `;

        this.userModal = null;
        this._ensureUserModal();
        await this.loadUsers();
        this._wireGmailAdminCard();
    },

    async _wireGmailAdminCard() {
        try {
            if (!window.electronAPI || !window.electronAPI.gmail) {
                const pill = document.getElementById('gmailStatusPill');
                const detail = document.getElementById('gmailStatusDetail');
                if (pill) { pill.textContent = 'Unavailable (non-Electron)'; pill.className = 'badge bg-secondary'; }
                if (detail) detail.textContent = 'Gmail integration requires the desktop app.';
                return;
            }
            const refreshGmailCard = async () => {
                const statusRes = await window.electronAPI.gmail.status();
                const stateRes = await window.electronAPI.gmail.getState();
                const s = (statusRes && statusRes.data) || {};
                const stt = (stateRes && stateRes.data) || {};
                const pill = document.getElementById('gmailStatusPill');
                const detail = document.getElementById('gmailStatusDetail');
                if (!pill || !detail) return;
                if (!s.hasCredentials) {
                    pill.textContent = 'Not configured'; pill.className = 'badge bg-warning text-dark';
                    detail.innerHTML = 'Paste your Google Cloud OAuth <b>Desktop app</b> client ID &amp; secret (see <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a>).';
                } else if (!s.isLoggedIn) {
                    pill.textContent = 'Disconnected'; pill.className = 'badge bg-warning text-dark';
                    detail.textContent = 'Credentials configured. Click Settings → Connect Gmail.';
                } else {
                    pill.textContent = 'Connected'; pill.className = 'badge bg-success';
                    const poRes = await window.electronAPI.gmail.queueList('po');
                    const bankRes = await window.electronAPI.gmail.queueList('bank');
                    const poCount = ((poRes && poRes.data) || []).filter(x => !x.linkedInvoiceId).length;
                    const bankCount = ((bankRes && bankRes.data) || []).filter(x => !x.linkedVoucherId).length;
                    detail.innerHTML = `Account: <b>${stt.accountEmail || '—'}</b> • Last sync: ${stt.lastSyncAt ? new Date(stt.lastSyncAt).toLocaleString() : 'never'} • Open POs: <b>${poCount}</b> • Open bank alerts: <b>${bankCount}</b>`;
                }
            };
            await refreshGmailCard();
            const syncBtn = document.getElementById('gmailAdminSync');
            if (syncBtn) syncBtn.onclick = async () => {
                syncBtn.disabled = true;
                try { await window.electronAPI.gmail.syncNow(); } finally { syncBtn.disabled = false; await refreshGmailCard(); }
            };
            const settingsBtn = document.getElementById('gmailAdminSettings');
            if (settingsBtn) settingsBtn.onclick = () => { App.showView('mail'); setTimeout(() => { const b = document.getElementById('mailSettingsBtn'); if (b) b.click(); }, 300); };
        } catch (e) {
            console.warn('Gmail admin card wiring error:', e.message);
        }
    },

    clearAuditDateFilters() {
        const dateEl = document.getElementById('auditFilterDate');
        const monthEl = document.getElementById('auditFilterMonth');
        const yearEl = document.getElementById('auditFilterYear');
        if (dateEl) dateEl.value = '';
        if (monthEl) monthEl.value = '';
        if (yearEl) yearEl.value = '';
        this.loadAuditLogs();
    },

    _populateAuditDateFilterOptions(logs) {
        const dateEl = document.getElementById('auditFilterDate');
        const monthEl = document.getElementById('auditFilterMonth');
        const yearEl = document.getElementById('auditFilterYear');
        if (!dateEl || !monthEl || !yearEl) return;

        const prevDate = dateEl.value || '';
        const prevMonth = monthEl.value || '';
        const prevYear = yearEl.value || '';

        const dateSet = new Set();
        const monthSet = new Set();
        const yearSet = new Set();

        (Array.isArray(logs) ? logs : []).forEach((log) => {
            const ts = new Date(log?.timestamp || '');
            if (Number.isNaN(ts.getTime())) return;
            const y = ts.getFullYear();
            const m = String(ts.getMonth() + 1).padStart(2, '0');
            const d = String(ts.getDate()).padStart(2, '0');
            dateSet.add(`${y}-${m}-${d}`);
            monthSet.add(`${y}-${m}`);
            yearSet.add(String(y));
        });

        const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
        const sortedMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
        const sortedYears = Array.from(yearSet).sort((a, b) => Number(b) - Number(a));

        const monthLabel = (ym) => {
            if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
            const [yy, mm] = ym.split('-');
            const date = new Date(Number(yy), Number(mm) - 1, 1);
            return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        };
        const dateLabel = (ymd) => {
            const dt = new Date(ymd);
            if (Number.isNaN(dt.getTime())) return ymd;
            return dt.toLocaleDateString('en-GB');
        };

        dateEl.innerHTML = `<option value="">All</option>${sortedDates.map((d) => `<option value="${d}">${dateLabel(d)}</option>`).join('')}`;
        monthEl.innerHTML = `<option value="">All</option>${sortedMonths.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join('')}`;
        yearEl.innerHTML = `<option value="">All</option>${sortedYears.map((y) => `<option value="${y}">${y}</option>`).join('')}`;

        dateEl.value = sortedDates.includes(prevDate) ? prevDate : '';
        monthEl.value = sortedMonths.includes(prevMonth) ? prevMonth : '';
        yearEl.value = sortedYears.includes(prevYear) ? prevYear : '';
    },

    _matchesAuditDateFilter(log) {
        const dateFilter = document.getElementById('auditFilterDate')?.value || '';
        const monthFilter = document.getElementById('auditFilterMonth')?.value || '';
        const yearFilter = document.getElementById('auditFilterYear')?.value || '';
        if (!dateFilter && !monthFilter && !yearFilter) return true;

        const ts = new Date(log?.timestamp || '');
        if (Number.isNaN(ts.getTime())) return false;
        const yyyy = ts.getFullYear();
        const mm = String(ts.getMonth() + 1).padStart(2, '0');
        const dd = String(ts.getDate()).padStart(2, '0');
        const logDate = `${yyyy}-${mm}-${dd}`;
        const logMonth = `${yyyy}-${mm}`;

        if (dateFilter) return logDate === dateFilter;
        if (monthFilter) return logMonth === monthFilter;
        if (yearFilter) return String(yyyy) === String(yearFilter);
        return true;
    },

    async loadUsers() {
        const users = await UserManager.getUsers();
        const container = document.getElementById('usersTableContainer');

        container.innerHTML = `
            <table class="table table-bordered table-hover">
                <thead class="table-light">
                    <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Full Name</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>${u.username}</td>
                            <td><span class="badge bg-${u.role === 'admin' ? 'danger' : 'primary'}">${u.role}</span></td>
                            <td>${u.fullName}</td>
                            <td><span class="badge bg-${u.isActive ? 'success' : 'secondary'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary" onclick="AdminModule.editUser('${u.id}')">Edit</button>
                                ${u.username !== 'admin' ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="AdminModule.deleteUser('${u.id}')">Delete</button>
                                ` : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    async loadAuditLogs() {
        const logs = await AuditManager.getLogs();
        const tbody = document.getElementById('auditTableBody');
        if (!tbody) return;
        this._populateAuditDateFilterOptions(logs);
        tbody.innerHTML = '';

        const filteredLogs = logs.filter((log) => this._matchesAuditDateFilter(log));
        if (filteredLogs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No logs found for selected date/month/year.</td></tr>`;
            return;
        }

        filteredLogs.forEach(log => {
            const date = new Date(log.timestamp).toLocaleString();
            const tr = document.createElement('tr');

            // Check if details contain changes
            const hasChanges = log.details && log.details.includes('Changes:');
            const detailsHtml = hasChanges
                ? `${log.details.split('Changes:')[0]} <button class="btn btn-sm btn-link p-0" onclick="AdminModule.showAuditDiff('${log.id}')">View Changes</button>`
                : log.details;

            tr.innerHTML = `
                <td>${date}</td>
                <td>${log.user}</td>
                <td><span class="badge bg-secondary">${log.action}</span></td>
                <td>${detailsHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    async showAuditDiff(logId) {
        const logs = await AuditManager.getLogs();
        const log = logs.find(l => l.id === logId);
        if (!log) return;

        const parts = log.details.split('Changes:');
        const summary = parts[0];
        const changes = parts[1] ? parts[1].trim() : 'No details available';

        // Create modal if not exists
        if (!document.getElementById('auditDiffModal')) {
            const modalHtml = `
                <div class="modal fade" id="auditDiffModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Audit Log Details</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <p class="fw-bold" id="auditDiffSummary"></p>
                                <pre id="auditDiffContent" class="audit-diff-content p-3 border rounded"></pre>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
        }

        document.getElementById('auditDiffSummary').textContent = summary;
        document.getElementById('auditDiffContent').textContent = changes;
        new bootstrap.Modal(document.getElementById('auditDiffModal')).show();
    },

    getUserModalHTML() {
        return `
            <div class="modal fade" id="userModal" tabindex="-1">
                <div class="modal-dialog modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="userModalTitle">Add User</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="userForm">
                                <input type="hidden" id="userId">
                                <div class="mb-3">
                                    <label class="form-label">Username</label>
                                    <input type="text" class="form-control" id="userUsername" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Full Name</label>
                                    <input type="text" class="form-control" id="userFullName" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Role</label>
                                    <select class="form-select" id="userRole">
                                        <option value="user">User</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Password</label>
                                    <input type="password" class="form-control" id="userPassword" placeholder="Enter new password">
                                    <small class="form-text text-muted" id="passwordHint">Leave blank to keep existing password unchanged.</small>
                                </div>
                                <div class="mb-3">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <label class="form-label mb-0">Permissions</label>
                                        <div>
                                            <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="AdminModule.selectAllPermissions()">Select All</button>
                                            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="AdminModule.clearAllPermissions()">Clear All</button>
                                        </div>
                                    </div>
                                    <div class="alert alert-info small mb-2">
                                        <i class="bi bi-info-circle me-1"></i>
                                        Select the areas this user can access. VIEW_DASHBOARD is automatically included.
                                    </div>
                                    <div class="row">
                                        <div class="col-md-6">
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="MANAGE_EMPLOYEES" id="permEmployees">
                                                <label class="form-check-label fw-bold" for="permEmployees">
                                                    <i class="bi bi-people text-primary"></i> Manage Employees
                                                </label>
                                                <small class="d-block text-muted ms-4">Add, edit, delete employees</small>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="MANAGE_ATTENDANCE" id="permAttendance">
                                                <label class="form-check-label fw-bold" for="permAttendance">
                                                    <i class="bi bi-calendar-check text-success"></i> Manage Attendance
                                                </label>
                                                <small class="d-block text-muted ms-4">Mark and edit attendance</small>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="MANAGE_SALARY" id="permSalary">
                                                <label class="form-check-label fw-bold" for="permSalary">
                                                    <i class="bi bi-currency-rupee text-warning"></i> Manage Salary
                                                </label>
                                                <small class="d-block text-muted ms-4">View and edit salaries</small>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="MANAGE_ADVANCES" id="permAdvances">
                                                <label class="form-check-label fw-bold" for="permAdvances">
                                                    <i class="bi bi-cash-coin text-info"></i> Manage Advances
                                                </label>
                                                <small class="d-block text-muted ms-4">Add and manage advances</small>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="MANAGE_HOLIDAYS" id="permHolidays">
                                                <label class="form-check-label fw-bold" for="permHolidays">
                                                    <i class="bi bi-calendar-event text-danger"></i> Manage Holidays
                                                </label>
                                                <small class="d-block text-muted ms-4">Configure holidays</small>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input user-permission" type="checkbox" value="VIEW_REPORTS" id="permReports">
                                                <label class="form-check-label fw-bold" for="permReports">
                                                    <i class="bi bi-file-earmark-bar-graph text-secondary"></i> View Reports
                                                </label>
                                                <small class="d-block text-muted ms-4">Access reports</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="AdminModule.saveUser()">Save User</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    showUserModal() {
        const modalEl = this._getUserModalEl();
        if (!modalEl) return;
        modalEl.querySelector('#userForm')?.reset();
        const idEl = modalEl.querySelector('#userId');
        if (idEl) idEl.value = '';
        const titleEl = modalEl.querySelector('#userModalTitle');
        if (titleEl) titleEl.textContent = 'Add User';
        const hint = modalEl.querySelector('#passwordHint');
        if (hint) hint.style.display = 'none'; // Password required for new users
        const passField = modalEl.querySelector('#userPassword');
        if (passField) passField.placeholder = 'Enter password (required)';
        this._resetModalState();
        this._ensureUserModal()?.show();
    },

    async editUser(id) {
        const users = await UserManager.getUsers();
        const user = users.find(u => u.id === id);
        if (!user) return;
        const modalEl = this._getUserModalEl();
        if (!modalEl) return;

        modalEl.querySelector('#userId').value = user.id;
        modalEl.querySelector('#userUsername').value = user.username;
        modalEl.querySelector('#userFullName').value = user.fullName;
        modalEl.querySelector('#userRole').value = user.role;
        modalEl.querySelector('#userPassword').value = ''; // Don't show password
        modalEl.querySelector('#userModalTitle').textContent = 'Edit User';
        const hint = modalEl.querySelector('#passwordHint');
        if (hint) hint.style.display = 'block'; // Show hint: password is optional for edits
        const passField = modalEl.querySelector('#userPassword');
        if (passField) passField.placeholder = 'Leave blank to keep existing password';

        // Set permissions
        const permissions = user.permissions || [];
        modalEl.querySelectorAll('.user-permission').forEach(cb => {
            cb.checked = permissions.includes(cb.value);
        });

        this._resetModalState();
        this._ensureUserModal()?.show();
    },

    async saveUser() {
        const modalEl = this._getUserModalEl();
        if (!modalEl) {
            alert('User modal is not available. Please reopen Add User.');
            return;
        }
        const id = modalEl.querySelector('#userId')?.value || '';
        const username = (modalEl.querySelector('#userUsername')?.value || '').trim();
        const fullName = (modalEl.querySelector('#userFullName')?.value || '').trim();
        const role = modalEl.querySelector('#userRole')?.value || 'user';
        const password = modalEl.querySelector('#userPassword')?.value || '';
        const permissions = Array.from(modalEl.querySelectorAll('.user-permission:checked')).map(cb => cb.value);

        if (!username) { alert('Username is required.'); return; }
        if (!fullName) { alert('Full Name is required.'); return; }

        // Ensure VIEW_DASHBOARD is always included
        if (!permissions.includes('VIEW_DASHBOARD')) {
            permissions.push('VIEW_DASHBOARD');
        }

        // Disable save button to prevent double-submit
        const saveBtn = modalEl.querySelector('.btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            if (id) {
                // Update existing user
                const updates = { username, fullName, role, permissions };
                if (password) updates.password = password;
                await UserManager.updateUser(id, updates);
                AuditManager.log('USER_UPDATE', `Updated user ${username}`);
            } else {
                // Create new user
                if (!password) { alert('Password is required for new users'); return; }
                await UserManager.createUser({ username, password, fullName, role, permissions });
                AuditManager.log('USER_CREATE', `Created user ${username}`);
            }

            // Close modal safely
            this._ensureUserModal()?.hide();

            await this.loadUsers();
            App.showNotification('User saved successfully!', 'success');
        } catch (error) {
            console.error('saveUser error:', error);
            alert('Error saving user: ' + error.message);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save User'; }
        }
    },

    async deleteUser(id) {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await UserManager.deleteUser(id);
            AuditManager.log('USER_DELETE', `Deleted user ID ${id}`);
            await this.loadUsers();
            App.showNotification('User deleted', 'success');
        } catch (error) {
            alert(error.message);
        }
    },

    async saveSettings(event) {
        event.preventDefault();

        const settings = await DataManager.getSettings() || {};

        const oldSettings = { ...settings }; // Clone old settings

        settings.companyName = document.getElementById('companyName').value;
        settings.registeredAddress = document.getElementById('registeredAddress').value;
        settings.workAddress = document.getElementById('workAddress').value;
        settings.emails = document.getElementById('companyEmails').value;
        settings.phones = document.getElementById('companyPhones').value;
        settings.gstin = document.getElementById('companyGSTIN').value;
        settings.pan = document.getElementById('companyPAN').value;
        settings.iec = document.getElementById('companyIEC').value;
        settings.upiId = document.getElementById('companyUPI').value;

        settings.bankDetails = {
            bankName: document.getElementById('bankName').value,
            branch: document.getElementById('bankBranch').value,
            accountNo: document.getElementById('bankAccountNo').value,
            ifsc: document.getElementById('bankIFSC').value
        };

        settings.otCalculationMethod = document.getElementById('otCalculationMethod').value;
        settings.hOtCalculationMethod = document.getElementById('hOtCalculationMethod').value;
        settings.otRate = parseFloat(document.getElementById('otRate').value) || 0;

        settings.emailConfig = {
            host: document.getElementById('smtpHost').value,
            port: parseInt(document.getElementById('smtpPort').value),
            secure: document.getElementById('smtpSecure').checked,
            auth: {
                user: document.getElementById('smtpUser').value,
                pass: document.getElementById('smtpPass').value
            }
        };

        await DataManager.saveSettings(settings);

        // Calculate diff
        const changes = [];
        for (const key in settings) {
            if (JSON.stringify(settings[key]) !== JSON.stringify(oldSettings[key])) {
                changes.push(`${key}: "${oldSettings[key] || ''}" -> "${settings[key] || ''}"`);
            }
        }

        if (changes.length > 0) {
            AuditManager.log('SETTINGS_UPDATE', `Updated company profile. Changes:\n${changes.join('\n')}`);
        } else {
            AuditManager.log('SETTINGS_UPDATE', 'Updated company profile (No changes detected)');
        }
        App.showNotification('Settings saved successfully', 'success');

        // Update UI immediately
        if (App.updateCompanyBranding) {
            await App.updateCompanyBranding();
        }
    },

    async exportManualBackup() {
        console.log('Starting manual backup export...');
        try {
            const result = await window.electronAPI.createManualBackup();
            if (result.success) {
                App.showNotification(`Backup created successfully! ${result.fileCount} files backed up to: ${result.path}`, 'success');
            } else if (result.cancelled) {
                App.showNotification('Backup cancelled', 'info');
            } else {
                App.showNotification('Backup failed', 'error');
            }
        } catch (error) {
            console.error('Backup error:', error);
            App.showNotification('Error creating backup: ' + error.message, 'error');
        }
    },

    async analyzeBookKeeperFile() {
        // Create hidden input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.db,.sqlite';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                App.showNotification('Analyzing file structure...', 'info');
                const analysis = await BookKeeperImport.analyzeFeatures(file);

                const message = `
                    <strong>Detected Features:</strong><br/>
                    ${analysis.detectedFeatures.length > 0 ? analysis.detectedFeatures.join(', ') : 'None detected (Standard Version)'}
                    <br/><br/>
                    <strong>Database Tables Found (${analysis.tables.length}):</strong><br/>
                    <div style="max-height: 200px; overflow-y: auto; font-size: 0.8em; background: #eee; color: #333; padding: 5px;">
                        ${analysis.tables.join(', ')}
                    </div>
                    <br/>
                    <i>Copy this list and share it with the developer to ensure all features are covered.</i>
                `;

                // Show in a modal
                const modalHtml = `
                    <div class="modal fade" id="analyzeModal" tabindex="-1">
                        <div class="modal-dialog">
                            <div class="modal-content text-dark">
                                <div class="modal-header">
                                    <h5 class="modal-title">BookKeeper Feature Analysis</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body">${message}</div>
                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHtml);
                new bootstrap.Modal(document.getElementById('analyzeModal')).show();

            } catch (error) {
                console.error(error);
                alert('Analysis failed: ' + error.message);
            }
        };
        input.click();
    },

    async importBackup(file) {
        if (!file) return;

        if (!confirm('WARNING: Importing a backup will OVERWRITE all current data. This cannot be undone. Are you sure?')) {
            return;
        }

        try {
            const text = await file.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                App.showNotification('Invalid backup file. Must be a valid JSON file.', 'error');
                return;
            }

            // Check if this is a full single-file backup (contains keys like 'gtes_users', 'gtes_attendance')
            const isFullBackup = Object.keys(data).some(key => key.startsWith('gtes_'));

            if (isFullBackup) {
                console.log('Detected single-file full backup');
                let successCount = 0;

                for (const [key, value] of Object.entries(data)) {
                    if (key.startsWith('gtes_')) {
                        await window.electronAPI.saveData(key, value);
                        successCount++;
                    }
                }

                AuditManager.log('BACKUP_IMPORT', `Imported full backup from ${file.name}`);
                App.showNotification(`Backup imported successfully! ${successCount} data sets restored. Page will reload.`, 'success');

                // Reload application to reflect changes
                setTimeout(() => window.location.reload(), 1500);
            } else {
                // Legacy single file import or invalid format
                App.showNotification('Invalid backup format. Please select a full backup file generated by this system.', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            App.showNotification('Error importing backup: ' + error.message, 'error');
        }
    },

    selectAllPermissions() {
        document.querySelectorAll('.user-permission').forEach(cb => cb.checked = true);
    },

    clearAllPermissions() {
        document.querySelectorAll('.user-permission').forEach(cb => cb.checked = false);
    }


};

window.AdminModule = AdminModule;
