/**
 * Sync Manager - Handles real-time updates and data integrity
 */
const SyncManager = {
    _initDone: false,
    status: 'synced', // 'synced', 'syncing', 'conflict', 'offline', 'changes'
    lastSyncTime: new Date(),
    hasUnsavedChanges: false,
    syncLog: [], // Store audit logs
    /** When true, conflict prompts are suppressed (e.g. during BookKeeper import). */
    suppressConflictPrompts: false,
    _conflictPromptCooldownUntil: 0,
    /** Coalesce indicator DOM updates to one paint per frame. */
    _statusPaintRaf: null,
    _pendingStatusMessage: null,
    syncProgressPercent: 0,
    syncProgressMessage: '',

    // UI Elements
    statusIndicators: [], // Array to hold both main and landing indicators
    _auditModalInstance: null,

    init() {
        if (this._initDone) return;
        this._initDone = true;
        // Initialize audit log from local storage if needed, or start fresh
        this.logSyncEvent('info', 'Application started');

        // Web / PWA: no Electron file IPC — BookKeeper file watcher is skipped (see bookKeeperSync).

        this.initStatusIndicators();
        this.createAuditModal();
        this.attachListeners();

        // Initial check
        this.updateNetworkStatus();

        // Heavy startup work is deferred until after the UI is interactive (see App.isInStartupGrace).
        if (window.electronAPI) {
            setTimeout(() => this.checkBackup(), 120000);
        }

        if (typeof BookKeeperSync !== 'undefined') {
            BookKeeperSync.init();
            setTimeout(() => {
                if (typeof BookKeeperSync.startBackgroundServices === 'function') {
                    BookKeeperSync.startBackgroundServices();
                }
            }, 6000);
        }

        setTimeout(() => {
            try {
                this.updateAuditModalUI();
            } catch (e) {
                console.warn('[SyncManager] updateAuditModalUI on init:', e && e.message);
            }
        }, 4000);

        console.log('SyncManager initialized');
    },

    initStatusIndicators() {
        this.statusIndicators = [];

        // 1. Main Navbar Indicator (Create dynamically if missing)
        let mainIndicator = document.getElementById('syncStatus');
        if (!mainIndicator) {
            const userInfo = document.getElementById('userInfo');
            if (userInfo) {
                const parentLi = userInfo.closest('li');
                const ul = parentLi.parentElement;
                const li = document.createElement('li');
                li.className = 'nav-item d-flex align-items-center me-3';
                li.innerHTML = `
                    <div id="syncStatus" class="d-flex align-items-center text-success" style="cursor: pointer;" title="Click to view Sync Status">
                        <i class="bi bi-cloud-check-fill me-1"></i>
                        <span class="small d-none d-md-inline ms-1">Synced</span>
                    </div>
                `;
                ul.insertBefore(li, parentLi);
                mainIndicator = document.getElementById('syncStatus');
            }
        }
        if (mainIndicator) {
            this.statusIndicators.push(mainIndicator);
            mainIndicator.onclick = () => this.showAuditModal();
        }

        // 2. Landing Page Indicator (Already exists in HTML usually)
        const landingIndicator = document.getElementById('landingSyncStatus');
        if (landingIndicator) {
            this.statusIndicators.push(landingIndicator);
            landingIndicator.style.cursor = 'pointer';
            landingIndicator.onclick = () => this.showAuditModal();
        }
    },

    createAuditModal() {
        const existing = document.getElementById('syncStatusModal');
        if (existing) {
            this._auditModalInstance = bootstrap.Modal.getOrCreateInstance(existing);
            return;
        }

        const modalDiv = document.createElement('div');
        modalDiv.className = 'modal fade';
        modalDiv.id = 'syncStatusModal';
        modalDiv.tabIndex = '-1';
        // Use inline styles to force the theme variables which handle both light/dark modes
        modalDiv.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content" style="background: var(--bg-card); color: var(--text-primary); backdrop-filter: blur(10px); border: 1px solid var(--border-color);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h5 class="modal-title"><i class="bi bi-arrow-repeat me-2"></i>Sync Status</h5>
                        <button type="button" class="btn-close" style="filter: invert(1) grayscale(100%) brightness(200%);" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="d-flex align-items-center mb-4 p-3 rounded" style="border: 1px solid var(--border-color); background: var(--bg-glass);">
                             <div id="modalSyncStatusIcon" class="me-3 fs-1 text-success"><i class="bi bi-check-circle-fill"></i></div>
                             <div>
                                <h5 id="modalSyncStatusTitle" class="mb-1">All Systems Operational</h5>
                                <div style="color: var(--text-muted);" class="small">Last synced: <span id="modalLastSyncTime" class="fw-bold" style="color: var(--text-primary);">Just now</span></div>
                             </div>
                        </div>
                        
                        <div class="mb-4">
                            <div class="d-grid gap-2">
                                <button class="btn btn-primary" onclick="SyncManager.syncNow()">
                                    <i class="bi bi-arrow-repeat"></i> Sync Now
                                </button>
                            </div>
                            <div class="row g-2 mt-2">
                                <div class="col-md-6">
                                    <div class="card h-100" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color);">
                                        <div class="card-body py-2">
                                            <div class="small fw-bold mb-2"><i class="bi bi-cloud-sync me-1"></i> Cloud Sync</div>
                                            <div class="d-grid gap-1">
                                                <button class="btn btn-sm btn-outline-info" onclick="SyncManager.importFromCloud()">
                                                    <i class="bi bi-cloud-arrow-down me-1"></i> Import from Cloud
                                                </button>
                                                <button class="btn btn-sm btn-outline-info" onclick="SyncManager.exportToCloud()">
                                                    <i class="bi bi-cloud-arrow-up me-1"></i> Export to Cloud
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card h-100" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color);">
                                        <div class="card-body py-2">
                                            <div class="small fw-bold mb-2"><i class="bi bi-hdd-network me-1"></i> Backup</div>
                                            <div class="d-grid gap-1">
                                                <button class="btn btn-sm btn-outline-secondary" onclick="SyncManager.exportBackup()">
                                                    <i class="bi bi-download me-1"></i> Export
                                                </button>
                                                <button class="btn btn-sm btn-outline-secondary" onclick="SyncManager.importBackup()">
                                                    <i class="bi bi-upload me-1"></i> Import
                                                </button>
                                                <button class="btn btn-sm btn-outline-danger" onclick="SyncManager.resetData()">
                                                    <i class="bi bi-arrow-clockwise me-1"></i> Reset Data
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="syncProgressContainer" class="mb-3 d-none">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <small id="syncProgressLabel" style="color: var(--text-muted);">Preparing sync…</small>
                                <small id="syncProgressPercent" class="fw-bold" style="color: var(--text-primary);">0%</small>
                            </div>
                            <div class="progress" style="height: 8px; background: rgba(255,255,255,0.1);">
                                <div id="syncProgressBar" class="progress-bar progress-bar-striped progress-bar-animated bg-info" style="width: 0%"></div>
                            </div>
                        </div>

                        <!-- Book Keeper Sync Details -->
                        <div id="bookKeeperSyncInfo" class="mb-4"></div>

                        <h6 class="pb-2 mb-2" style="border-bottom: 1px solid var(--border-color);">Audit Log</h6>
                        <div class="list-group list-group-flush small" id="syncAuditLogList" style="max-height: 250px; overflow-y: auto;">
                            <!-- Items will be populated here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalDiv);
        this._auditModalInstance = bootstrap.Modal.getOrCreateInstance(modalDiv);

        // Defensive cleanup: avoid stuck grey overlay if backdrop gets orphaned.
        modalDiv.addEventListener('hidden.bs.modal', () => {
            this._cleanupModalArtifacts();
        });
    },

    attachListeners() {
        // Network Status Listeners
        window.addEventListener('online', () => {
            this.logSyncEvent('info', 'Network connection restored');
            this.updateNetworkStatus();
            const inGrace = window.App && typeof App.isInStartupGrace === 'function' && App.isInStartupGrace();
            if (!inGrace) {
                setTimeout(() => this.syncNow(), 2500);
            }
        });
        window.addEventListener('offline', () => {
            this.logSyncEvent('warning', 'Network connection lost');
            this.updateNetworkStatus();
        });

        // Listen for file changes from main process
        if (window.electronAPI) {
            window.electronAPI.onFileChanged((filename) => {
                console.log('Remote file changed:', filename);
                this.handleRemoteChange(filename);
            });
        }
    },

    updateNetworkStatus() {
        if (navigator.onLine) {
            // We are online, but let's see if we are 'synced' or 'syncing'
            if (this.status === 'offline') {
                this.updateStatus('synced', 'Back online');
            }
        } else {
            this.updateStatus('offline', 'No Internet Connection');
        }
    },

    async checkBackup() {
        try {
            const result = await window.electronAPI.createBackup();
            if (result.success) {
                console.debug('Daily backup created at:', result.path);
                this.logSyncEvent('success', 'Daily backup created successfully');
            }
        } catch (error) {
            console.error('Backup failed:', error);
            this.logSyncEvent('error', 'Daily backup failed');
        }
    },

    updateStatus(status, message = null) {
        const prevStatus = this.status;
        this.status = status;
        if (status !== 'syncing' && status !== 'offline') {
            this.lastSyncTime = new Date();
        }
        this._pendingStatusMessage = message;

        // If a sync/import finished, flush any deferred view refreshes once.
        if (prevStatus === 'syncing' && status !== 'syncing') {
            try {
                if (window.App && typeof App.flushDeferredDataRefresh === 'function') {
                    void App.flushDeferredDataRefresh();
                }
            } catch (_) { /* ignore */ }
        }

        if (typeof cancelAnimationFrame === 'function' && this._statusPaintRaf != null) {
            cancelAnimationFrame(this._statusPaintRaf);
        }
        if (typeof requestAnimationFrame === 'function') {
            this._statusPaintRaf = requestAnimationFrame(() => {
                this._statusPaintRaf = null;
                this._paintSyncStatusIndicators();
            });
        } else {
            this._statusPaintRaf = null;
            this._paintSyncStatusIndicators();
        }
    },

    _paintSyncStatusIndicators() {
        const status = this.status;
        const message = this._pendingStatusMessage;
        const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        this.statusIndicators.forEach((indicator) => {
            if (!indicator) return;

            const icon = indicator.querySelector('i');
            const text = indicator.querySelector('span');
            if (!icon || !text) return;

            indicator.className = 'd-flex align-items-center';
            if (indicator.id === 'landingSyncStatus') {
                indicator.classList.add('me-2');
            }

            indicator.classList.remove('text-success', 'text-primary', 'text-danger', 'text-warning');
            icon.className = 'bi me-1';

            switch (status) {
                case 'synced':
                    indicator.classList.add('text-success');
                    icon.classList.add('bi-cloud-check-fill');
                    text.textContent = `Synced ${timeStr}`;
                    break;
                case 'syncing':
                    indicator.classList.add('text-primary');
                    icon.classList.add('bi-arrow-repeat', 'spin');
                    text.textContent = this.syncProgressPercent > 0 ? `Syncing ${this.syncProgressPercent}%` : 'Syncing...';
                    break;
                case 'conflict':
                    indicator.classList.add('text-danger');
                    icon.classList.add('bi-exclamation-triangle-fill');
                    text.textContent = 'Conflict';
                    break;
                case 'changes':
                    indicator.classList.add('text-warning');
                    icon.classList.add('bi-cloud-arrow-down-fill');
                    text.textContent = 'Updates';
                    break;
                case 'offline':
                    indicator.classList.add('text-danger');
                    icon.classList.add('bi-wifi-off');
                    text.textContent = 'Offline';
                    break;
            }

            if (message) {
                indicator.title = message;
            } else {
                indicator.title = 'Click to view Sync Status';
            }
        });

        const modalEl = document.getElementById('syncStatusModal');
        if (modalEl && modalEl.classList.contains('show')) {
            // Full modal rebuild (audit log + BK panel) is expensive — during active sync only patch progress chrome.
            if (status === 'syncing') {
                this._patchSyncModalProgressOnly();
            } else {
                this.updateAuditModalUI();
            }
        }
        try {
            if (typeof window.__gtesRefreshDashShellSyncBtn === 'function') {
                window.__gtesRefreshDashShellSyncBtn();
            }
        } catch (_) { /* ignore */ }
    },

    /** Updates modal header + progress bar only (no audit log / BK panel DOM rebuild). */
    _patchSyncModalProgressOnly() {
        const iconDiv = document.getElementById('modalSyncStatusIcon');
        const titleDiv = document.getElementById('modalSyncStatusTitle');
        const progressWrap = document.getElementById('syncProgressContainer');
        const progressBar = document.getElementById('syncProgressBar');
        const progressLabel = document.getElementById('syncProgressLabel');
        const progressPct = document.getElementById('syncProgressPercent');
        if (iconDiv) {
            iconDiv.className = 'me-3 fs-1 text-primary';
            iconDiv.innerHTML = '<i class="bi bi-arrow-repeat spin"></i>';
        }
        if (titleDiv) {
            titleDiv.textContent = this.syncProgressPercent > 0
                ? `Syncing... ${this.syncProgressPercent}%`
                : 'Syncing...';
            titleDiv.className = 'mb-1 text-primary';
        }
        if (progressWrap && progressBar && progressLabel && progressPct) {
            progressWrap.classList.remove('d-none');
            const pct = Math.max(0, Math.min(100, parseInt(this.syncProgressPercent || 0, 10)));
            progressBar.style.width = `${pct}%`;
            progressPct.textContent = `${pct}%`;
            progressLabel.textContent = this.syncProgressMessage || 'Sync in progress...';
        }
    },

    logSyncEvent(type, message) {
        // type: 'success', 'info', 'warning', 'error'
        const entry = {
            time: new Date(),
            type: type,
            message: message
        };
        this.syncLog.unshift(entry);
        if (this.syncLog.length > 50) this.syncLog.pop(); // Keep last 50
    },

    showAuditModal() {
        const modalEl = document.getElementById('syncStatusModal');
        if (!modalEl) return;

        this.updateAuditModalUI();
        this._auditModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
        this._auditModalInstance.show();
    },

    closeAuditModal() {
        const modalEl = document.getElementById('syncStatusModal');
        if (!modalEl) {
            this._cleanupModalArtifacts();
            return;
        }
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
        // Backup cleanup in case Bootstrap hidden event is skipped/interrupted.
        setTimeout(() => this._cleanupModalArtifacts(), 120);
    },

    _cleanupModalArtifacts() {
        const modalEl = document.getElementById('syncStatusModal');
        const isOpen = !!(modalEl && modalEl.classList.contains('show'));
        if (isOpen) return;

        document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
        document.body.style.removeProperty('overflow');
    },

    updateAuditModalUI() {
        const iconDiv = document.getElementById('modalSyncStatusIcon');
        const titleDiv = document.getElementById('modalSyncStatusTitle');
        const timeDiv = document.getElementById('modalLastSyncTime');
        const logList = document.getElementById('syncAuditLogList');
        const bkInfoDiv = document.getElementById('bookKeeperSyncInfo');
        if (!iconDiv || !titleDiv || !timeDiv || !logList) {
            return;
        }

        // Update Book Keeper Info — always show this section
        if (bkInfoDiv) {
            const bkSync = window.BookKeeperSync;
            const details = bkSync && bkSync.config.lastSyncDetails ? bkSync.config.lastSyncDetails : null;
            const backupPath = bkSync && bkSync.config.backupPath ? bkSync.config.backupPath : null;

            if (details) {
                // Have sync details — show full info
                const d = new Date(details.time);
                const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const fileName = backupPath ? backupPath.split('\\').pop().split('/').pop() : (details.path || 'BookKeeper Backup');

                // Normalize count: handle both old {imported: N} format and new number format
                const getCount = (val) => {
                    if (typeof val === 'number') return val;
                    if (val && typeof val === 'object') return val.imported || 0;
                    return 0;
                };
                const vCount = getCount(details.counts.vouchers);
                const cCount = getCount(details.counts.customers);
                const iCount = getCount(details.counts.inventory);

                bkInfoDiv.innerHTML = `
                    <div class="p-3 rounded mb-2" style="background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.3);">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div>
                                <div style="color: #60a5fa; font-size: 0.8rem; font-weight: 700;">
                                    <i class="bi bi-database me-1"></i>Book Keeper Backup
                                </div>
                                <div style="color: rgba(255,255,255,0.7); font-size: 0.75rem; margin-top: 2px;">${fileName}</div>
                                <div style="color: rgba(255,255,255,0.4); font-size: 0.6rem; margin-top: 1px; word-break: break-all;">${backupPath || 'No absolute path saved'}</div>
                            </div>
                            <button class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 0.7rem;" onclick="App.startBookKeeperSync()">
                                <i class="bi bi-arrow-repeat"></i> Sync Now
                            </button>
                        </div>
                        <div class="d-flex justify-content-between align-items-center mb-2" style="font-size: 0.8rem;">
                            <span style="color: rgba(255,255,255,0.55);">Last Imported:</span>
                            <span style="color: #fff; font-weight: 600;">${timeStr}</span>
                        </div>
                        <div class="d-flex flex-wrap gap-2">
                            <span class="badge" style="background: rgba(255,255,255,0.15); color: #fff; font-size: 0.65rem;">${vCount} Vouchers</span>
                            <span class="badge" style="background: rgba(255,255,255,0.15); color: #fff; font-size: 0.65rem;">${cCount} Parties</span>
                            <span class="badge" style="background: rgba(255,255,255,0.15); color: #fff; font-size: 0.65rem;">${iCount} Items</span>
                        </div>
                        <div class="mt-2 d-flex justify-content-end">
                            <button class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size: 0.7rem;" onclick="SyncManager.resetData()">
                                <i class="bi bi-arrow-clockwise"></i> Reset Data
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // No sync yet — show prompt with sync button
                bkInfoDiv.innerHTML = `
                    <div class="p-3 rounded border mb-2" style="border-color: var(--border-color); background: rgba(255,255,255,0.03);">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="mb-0 small fw-bold"><i class="bi bi-database me-1 text-info"></i>Book Keeper Backup</h6>
                                <div class="text-muted" style="font-size: 0.7rem;">No sync performed yet</div>
                            </div>
                            <button class="btn btn-sm btn-outline-info py-0 px-2" style="font-size: 0.7rem;" onclick="App.startBookKeeperSync(); SyncManager.closeAuditModal();">
                                <i class="bi bi-arrow-repeat"></i> Sync Now
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        // Update Header Status
        iconDiv.className = 'me-3 fs-1';
        if (this.status === 'synced') {
            iconDiv.classList.add('text-success');
            iconDiv.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
            titleDiv.textContent = 'Synced & Up to Date';
            titleDiv.className = 'mb-1 text-success';
        } else if (this.status === 'offline') {
            iconDiv.classList.add('text-danger');
            iconDiv.innerHTML = '<i class="bi bi-wifi-off"></i>';
            titleDiv.textContent = 'Not Synced (Offline)';
            titleDiv.className = 'mb-1 text-danger';
        } else if (this.status === 'syncing') {
            iconDiv.classList.add('text-primary');
            iconDiv.innerHTML = '<i class="bi bi-arrow-repeat spin"></i>';
            titleDiv.textContent = this.syncProgressPercent > 0
                ? `Syncing... ${this.syncProgressPercent}%`
                : 'Syncing...';
            titleDiv.className = 'mb-1 text-primary';
        } else {
            iconDiv.classList.add('text-warning');
            iconDiv.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i>';
            titleDiv.textContent = 'Attention Needed';
            titleDiv.className = 'mb-1 text-warning';
        }

        // Progress bar / stage text
        const progressWrap = document.getElementById('syncProgressContainer');
        const progressBar = document.getElementById('syncProgressBar');
        const progressLabel = document.getElementById('syncProgressLabel');
        const progressPct = document.getElementById('syncProgressPercent');
        if (progressWrap && progressBar && progressLabel && progressPct) {
            if (this.status === 'syncing') {
                progressWrap.classList.remove('d-none');
                const pct = Math.max(0, Math.min(100, parseInt(this.syncProgressPercent || 0, 10)));
                progressBar.style.width = `${pct}%`;
                progressPct.textContent = `${pct}%`;
                progressLabel.textContent = this.syncProgressMessage || 'Sync in progress...';
            } else {
                progressWrap.classList.add('d-none');
                progressBar.style.width = '0%';
                progressPct.textContent = '0%';
                progressLabel.textContent = 'Preparing sync…';
            }
        }

        if (this.lastSyncTime) {
            const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeDiv.textContent = `${this.lastSyncTime.toLocaleDateString()} ${timeStr}`;
            // Ensure visibility by forcing bright color or variable
            timeDiv.style.color = 'var(--text-primary)';
            timeDiv.className = 'fw-bold';
        } else {
            timeDiv.textContent = 'Never';
        }

        // Update Log List
        logList.innerHTML = '';
        if (this.syncLog.length === 0) {
            logList.innerHTML = `<div class="list-group-item text-center" style="background: transparent; color: var(--text-muted);">No logs available</div>`;
        } else {
            this.syncLog.forEach(log => {
                const item = document.createElement('div');
                // Transparent background to blend with modal, use borders
                item.className = 'list-group-item d-flex justify-content-between align-items-center mb-1 rounded';
                item.style.background = 'rgba(255,255,255,0.05)';
                item.style.border = '1px solid var(--border-color)';
                item.style.color = 'var(--text-primary)';

                let icon = 'bi-info-circle';
                let color = 'var(--info-color)';
                if (log.type === 'success') { icon = 'bi-check-circle'; color = 'var(--success-color)'; }
                if (log.type === 'warning') { icon = 'bi-exclamation-triangle'; color = 'var(--warning-color)'; }
                if (log.type === 'error') { icon = 'bi-x-circle'; color = 'var(--danger-color)'; }

                const timeStr = log.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                item.innerHTML = `
                    <div class="d-flex align-items-center">
                        <i class="bi ${icon} me-2" style="color: ${color}"></i>
                        <span>${log.message}</span>
                    </div>
                    <span class="badge bg-secondary font-monospace" style="font-size: 0.75rem;">${timeStr}</span>
                `;
                logList.appendChild(item);
            });
        }
    },

    handleRemoteChange(filename) {
        let base = '';
        if (typeof filename === 'string') {
            base = filename.replace(/\.json$/i, '').replace(/^.*[/\\]/, '');
        }
        // RTDB listener already updated memory + we mirrored the same payload to disk — do not
        // invalidate cache or the UI can reload merged stale rows from before the mirror completed.
        if (base && window.FileStorage && typeof FileStorage.consumeMirrorWriteFromRtdb === 'function') {
            if (FileStorage.consumeMirrorWriteFromRtdb(base)) {
                return;
            }
        }

        this.logSyncEvent('warning', `Remote changes detected in ${filename}`);
        this.updateStatus('changes', `Changes detected in ${filename}`);
        if (typeof filename === 'string' && window.DataManager && typeof DataManager.invalidateDataCache === 'function') {
            if (base) {
                DataManager.invalidateDataCache(base);
            }
        }
        try {
            window.dispatchEvent(new CustomEvent('gtes:remote-change', {
                detail: { key: base, filename, ts: Date.now() }
            }));
        } catch (_) { }
        App.showNotification(`Remote changes detected in ${filename}`, 'info');
    },

    async syncNow() {
        if (!navigator.onLine) {
            App.showNotification('Cannot sync while offline', 'error');
            return;
        }

        this.updateStatus('syncing');
        this.logSyncEvent('info', 'Manual sync started');
        this.setSyncProgress(1, 'Clearing in-memory cache…');

        try {
            if (typeof FileStorage !== 'undefined' && typeof FileStorage.flushPendingCloudWrites === 'function') {
                this.setSyncProgress(2, 'Uploading pending changes to cloud…');
                await FileStorage.flushPendingCloudWrites(4000);
            }
            DataManager.invalidateDataCache();
            this.setSyncProgress(3, 'Reloading datasets from disk / cloud…');
            await DataManager.reloadAllDataAfterCacheClear({
                onProgress: (pct, msg) => {
                    const p = Math.max(3, Math.min(99, Number(pct) || 0));
                    this.setSyncProgress(p, msg || 'Reloading…');
                },
            });
            this.setSyncProgress(100, 'Finishing…');

            const currentView = App.currentView;
            if (currentView && typeof App.showView === 'function') {
                const runShow = () => {
                    try {
                        if (typeof UserManager !== 'undefined' && UserManager.SESSION_KEY) {
                            if (!sessionStorage.getItem(UserManager.SESSION_KEY)) return;
                        }
                    } catch (_) {
                        return;
                    }
                    try {
                        void App.showView(currentView);
                    } catch (e) {
                        console.warn('[SyncManager] showView after sync:', e && e.message);
                    }
                };
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => {
                        setTimeout(runShow, 0);
                    });
                } else {
                    setTimeout(runShow, 0);
                }
            }

            this.lastSyncTime = new Date();
            this.updateStatus('synced');
            this.clearSyncProgress();
            this.logSyncEvent('success', 'Manual sync completed'); // Add distinct log
            App.showNotification('Data synced successfully', 'success');
        } catch (error) {
            console.error('Sync failed:', error);
            this.clearSyncProgress();
            this.updateStatus('conflict', 'Sync failed');
            this.logSyncEvent('error', `Sync failed: ${error.message}`);
        }
    },

    async importFromCloud() {
        try {
            if (!window.DeepCloudMigrator || typeof DeepCloudMigrator.importAll !== 'function') {
                App.showNotification('Cloud import is not available.', 'warning');
                return;
            }
            await DeepCloudMigrator.importAll();
            this.logSyncEvent('success', 'Imported data from cloud');
        } catch (error) {
            console.error('Cloud import failed:', error);
            this.logSyncEvent('error', `Cloud import failed: ${error.message}`);
            App.showNotification('Cloud import failed', 'error');
        }
    },

    async exportToCloud() {
        try {
            if (!window.DeepCloudMigrator || typeof DeepCloudMigrator.exportAll !== 'function') {
                App.showNotification('Cloud export is not available.', 'warning');
                return;
            }
            await DeepCloudMigrator.exportAll();
            this.logSyncEvent('success', 'Exported data to cloud');
        } catch (error) {
            console.error('Cloud export failed:', error);
            this.logSyncEvent('error', `Cloud export failed: ${error.message}`);
            App.showNotification('Cloud export failed', 'error');
        }
    },

    exportBackup() {
        try {
            if (!window.AdminModule || typeof AdminModule.exportManualBackup !== 'function') {
                App.showNotification('Backup export is not available.', 'warning');
                return;
            }
            AdminModule.exportManualBackup();
            this.logSyncEvent('info', 'Backup export started');
        } catch (error) {
            console.error('Backup export failed:', error);
            this.logSyncEvent('error', `Backup export failed: ${error.message}`);
        }
    },

    importBackup() {
        const input = document.getElementById('navImportFile');
        if (!input) {
            App.showNotification('Backup import input not found.', 'warning');
            return;
        }
        input.click();
    },

    async resetData() {
        const ok = confirm(
            'This will remove BookKeeper–imported accounting data and clear the Book Keeper backup connection.\n\n' +
                'Keeps: vouchers and invoices you created in this app (tagged local / no BookKeeper id).\n\n' +
                'Does NOT load demo seed data (your plain/GST vouchers are not replaced).\n\nContinue?'
        );
        if (!ok) return;
        try {
            if (window.BookKeeperImport && typeof BookKeeperImport.clearAllData === 'function') {
                const swept = await BookKeeperImport.clearAllData({ reloadAfter: false, notifySuccess: false });
                if (swept === false) {
                    App.showNotification('Reset stopped: could not clear existing data safely.', 'error');
                    return;
                }
            }
            this.logSyncEvent('warning', 'System reset: BookKeeper import data cleared; app vouchers/invoices kept');
            App.showNotification('BookKeeper data cleared. Your app-created vouchers and invoices were kept.', 'success');
            setTimeout(() => window.location.reload(), 1200);
        } catch (error) {
            console.error('Reset data failed:', error);
            this.logSyncEvent('error', `Reset data failed: ${error.message}`);
            App.showNotification('Reset data failed.', 'error');
        }
    },

    setSyncProgress(percent, message = '') {
        this.syncProgressPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
        this.syncProgressMessage = message || this.syncProgressMessage || 'Sync in progress...';
        if (this.status === 'syncing') {
            this.updateStatus('syncing', this.syncProgressMessage);
        }
    },

    clearSyncProgress() {
        this.syncProgressPercent = 0;
        this.syncProgressMessage = '';
    },

    // Called by DataManager before saving
    async checkConflict(key) {
        if (!window.electronAPI) return true; // No conflict check if not electron

        // Conflict UX only applies in `changes` (external file newer). Avoid per-save IPC during
        // Book Keeper import / manual sync — hundreds of getFileStats round-trips froze the UI.
        if (this.suppressConflictPrompts || this.status === 'syncing') return true;
        if (this.status !== 'changes') return true;

        try {
            const result = await window.electronAPI.getFileStats(key);
            if (!result.success) return true;

            // Avoid prompting in a loop when multiple saves happen back-to-back.
            const now = Date.now();
            if (now < this._conflictPromptCooldownUntil) {
                this.logSyncEvent('warning', `Conflict prompt suppressed (cooldown) for ${key}`);
                return false;
            }

            const proceed = confirm('Remote changes detected! Saving now will overwrite them. Continue?');
            if (proceed) {
                this.logSyncEvent('warning', 'User overwrote remote changes');
                this._conflictPromptCooldownUntil = Date.now() + 15000;
            } else {
                this.logSyncEvent('info', 'User cancelled save due to conflict');
                this._conflictPromptCooldownUntil = Date.now() + 15000;
            }
            return proceed;
        } catch (e) {
            // ignore
        }
        return true;
    }
};

// Expose
window.SyncManager = SyncManager;

