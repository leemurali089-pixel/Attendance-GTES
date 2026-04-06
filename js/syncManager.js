/**
 * Sync Manager - Handles real-time updates and data integrity
 */
const SyncManager = {
    status: 'synced', // 'synced', 'syncing', 'conflict', 'offline', 'changes'
    lastSyncTime: new Date(),
    hasUnsavedChanges: false,
    syncLog: [], // Store audit logs

    // UI Elements
    statusIndicators: [], // Array to hold both main and landing indicators

    init() {
        // Initialize audit log from local storage if needed, or start fresh
        this.logSyncEvent('info', 'Application started');

        if (!window.electronAPI) {
            console.log('SyncManager: Not running in Electron, limited functionality');
            // Still show UI for "Offline/Online" if requested
        }

        this.initStatusIndicators();
        this.createAuditModal();
        this.attachListeners();

        // Initial check
        this.updateNetworkStatus();

        // Automatic backup on startup - Delay by 5s to avoid initial main-thread contention
        if (window.electronAPI) {
            setTimeout(() => this.checkBackup(), 5000);
        }

        // NEW: Initialize BookKeeper Sync if available
        if (typeof BookKeeperSync !== 'undefined') {
            BookKeeperSync.init();
        }

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
        if (document.getElementById('syncStatusModal')) return;

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
                        
                        <div class="d-grid gap-2 mb-4">
                            <button class="btn btn-primary" onclick="SyncManager.syncNow()">
                                <i class="bi bi-arrow-repeat"></i> Sync Now
                            </button>
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
    },

    attachListeners() {
        // Network Status Listeners
        window.addEventListener('online', () => {
            this.logSyncEvent('info', 'Network connection restored');
            this.updateNetworkStatus();
            this.syncNow(); // Auto-sync on reconnect
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
                console.log('Daily backup created at:', result.path);
                this.logSyncEvent('success', 'Daily backup created successfully');
            }
        } catch (error) {
            console.error('Backup failed:', error);
            this.logSyncEvent('error', 'Daily backup failed');
        }
    },

    updateStatus(status, message = null) {
        this.status = status;
        if (status !== 'syncing' && status !== 'offline') {
            // Assume synced if safe
            this.lastSyncTime = new Date();
        }

        const timeStr = this.lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Update ALL indicators
        this.statusIndicators.forEach(indicator => {
            if (!indicator) return;

            const icon = indicator.querySelector('i');
            const text = indicator.querySelector('span');
            if (!icon || !text) return;

            // Reset classes
            indicator.className = 'd-flex align-items-center';
            // Restore landing specific classes if needed
            if (indicator.id === 'landingSyncStatus') {
                indicator.classList.add('me-2'); // Restore landing specific margin
            } else if (indicator.id === 'syncStatus') {
                // keep main nav classes if any, though d-flex is mostly it
                // main one usually handled by parent li spacing
            }

            // Common colors are text-success etc which we add below
            // But we need to make sure we don't clear necessary layout classes?
            // actually className = '...' overwrites.
            // Let's be safer: remove ONLY the status classes
            indicator.classList.remove('text-success', 'text-primary', 'text-danger', 'text-warning');
            icon.className = 'bi me-1'; // Reset icon classes

            switch (status) {
                case 'synced':
                    indicator.classList.add('text-success');
                    icon.classList.add('bi-cloud-check-fill');
                    text.textContent = `Synced ${timeStr}`;
                    break;
                case 'syncing':
                    indicator.classList.add('text-primary');
                    icon.classList.add('bi-arrow-repeat', 'spin');
                    text.textContent = 'Syncing...';
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
                indicator.title = "Click to view Sync Status";
            }
        });

        // Refresh modal if open
        if (document.getElementById('syncStatusModal') && document.getElementById('syncStatusModal').classList.contains('show')) {
            this.updateAuditModalUI();
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
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    },

    updateAuditModalUI() {
        const iconDiv = document.getElementById('modalSyncStatusIcon');
        const titleDiv = document.getElementById('modalSyncStatusTitle');
        const timeDiv = document.getElementById('modalLastSyncTime');
        const logList = document.getElementById('syncAuditLogList');
        const bkInfoDiv = document.getElementById('bookKeeperSyncInfo');

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
                            <button class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 0.7rem;" onclick="BookKeeperSync.initiateNativeSync()">
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
                            <button class="btn btn-sm btn-outline-info py-0 px-2" style="font-size: 0.7rem;" onclick="BookKeeperSync.initiateNativeSync(); bootstrap.Modal.getInstance(document.getElementById('syncStatusModal'))?.hide();">
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
            titleDiv.textContent = 'Syncing...';
            titleDiv.className = 'mb-1 text-primary';
        } else {
            iconDiv.classList.add('text-warning');
            iconDiv.innerHTML = '<i class="bi bi-exclamation-triangle-fill"></i>';
            titleDiv.textContent = 'Attention Needed';
            titleDiv.className = 'mb-1 text-warning';
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
        this.logSyncEvent('warning', `Remote changes detected in ${filename}`);
        this.updateStatus('changes', `Changes detected in ${filename}`);
        App.showNotification(`Remote changes detected in ${filename}`, 'info');
    },

    async syncNow() {
        if (!navigator.onLine) {
            App.showNotification('Cannot sync while offline', 'error');
            return;
        }

        this.updateStatus('syncing');
        this.logSyncEvent('info', 'Manual sync started');

        try {
            // Reload all data
            await DataManager.init();

            // Refresh current view
            const currentView = App.currentView;
            if (currentView) {
                App.showView(currentView);
            }

            this.lastSyncTime = new Date();
            this.updateStatus('synced');
            this.logSyncEvent('success', 'Manual sync completed'); // Add distinct log
            App.showNotification('Data synced successfully', 'success');
        } catch (error) {
            console.error('Sync failed:', error);
            this.updateStatus('conflict', 'Sync failed');
            this.logSyncEvent('error', `Sync failed: ${error.message}`);
        }
    },

    // Called by DataManager before saving
    async checkConflict(key) {
        if (!window.electronAPI) return true; // No conflict check if not electron

        try {
            const result = await window.electronAPI.getFileStats(key);
            if (!result.success) return true;

            if (this.status === 'changes') {
                const proceed = confirm('Remote changes detected! Saving now will overwrite them. Continue?');
                if (proceed) {
                    this.logSyncEvent('warning', 'User overwrote remote changes');
                } else {
                    this.logSyncEvent('info', 'User cancelled save due to conflict');
                }
                return proceed;
            }
        } catch (e) {
            // ignore
        }
        return true;
    }
};

// Expose
window.SyncManager = SyncManager;
