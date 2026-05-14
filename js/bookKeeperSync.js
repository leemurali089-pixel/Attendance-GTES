/**
 * BookKeeper Sync Service
 * Handles the background synchronization between Book Keeper Backup (.db) and MJS PrimeLogic
 */
const BookKeeperSync = {
    config: {
        autoSync: true,
        backupPath: null, // User selected path to .db file
        /** Poll backup mtime — lower = closer to real-time when you edit Book Keeper and save the .db (Electron). */
        syncInterval: 4000, // poll backup mtime — closer to real-time when Book Keeper writes the .db
        lastModified: 0
    },

    /**
     * Records touched in a full import (aligned with BookKeeperImport.buildImportModalSummary totals).
     * Used after runFullImport so we never call BookKeeperImport.getSummary() here — duplicate method names
     * in older bookKeeperImport builds could make getSummary the wrong overload and throw.
     */
    countImportTouches(stats) {
        if (!stats) return 0;
        let n = 0;
        if (stats.company) n++;
        if (stats.customers) n += stats.customers.imported || 0;
        if (stats.inventory) n += stats.inventory.imported || 0;
        if (stats.services) n += stats.services.imported || 0;
        if (stats.vouchers) n += (stats.vouchers.imported || 0) + (stats.vouchers.updated || 0);
        if (stats.sales) n += stats.sales.imported || 0;
        if (stats.purchases) n += stats.purchases.imported || 0;
        if (stats.taxSchemes) n += stats.taxSchemes.imported || 0;
        return n;
    },

    /**
     * Verify imported data integrity
     * Checks if key collections are populated and have valid links
     */
    async verifyDataIntegrity() {
        console.log('Verifying Data Integrity...');
        const issues = [];

        try {
            const invoices = DataManager.getData('invoices') || [];
            const vouchers = DataManager.getData('vouchers') || [];
            const inventory = DataManager.getData('inventory') || [];

            if (invoices.length === 0 && vouchers.length > 0) {
                issues.push('Invoices missing but vouchers present. Check Sales import.');
            }

            // Check for orphaned inventory transactions and auto-repair
            const txns = DataManager.getData('inventoryTransactions') || [];
            
            // OPTIMIZATION: Use a Set for O(1) lookups instead of .find() in a loop
            const inventoryIds = new Set(inventory.map(m => m.id));
            const orphanedTxns = txns.filter(t => !inventoryIds.has(t.materialId));
            
            if (orphanedTxns.length > 0) {
                console.warn(`[Sync] Found ${orphanedTxns.length} orphaned inventory txns. Auto-repairing...`);
                // Auto repair by saving only valid transactions
                const validTxns = txns.filter(t => inventoryIds.has(t.materialId));
                await DataManager.saveData('inventoryTransactions', validTxns);
                
                // Optional: log to sync manager so user knows a repair happened
                if (typeof SyncManager !== 'undefined') {
                    SyncManager.logSyncEvent('info', `Auto-repaired ${orphanedTxns.length} orphaned legacy records. DB is clean.`);
                }
            }

            if (issues.length > 0) {
                console.warn('Data Integrity Issues:', issues);
                SyncManager.logSyncEvent('warning', 'Data Integrity Issues: ' + issues.join('; '));
                return false;
            } else {
                console.log('Data Integrity Verified: OK');
                return true;
            }
        } catch (e) {
            console.error('Verification failed', e);
            return false;
        }
    },

    intervalId: null,
    _importInProgress: false,
    /** One stat check at a time (interval does not await). */
    _fileStatInFlight: false,
    _initDone: false,

    /** True when file-based Book Keeper sync can run (desktop only). */
    _isElectronFileContext() {
        return !!(typeof window !== 'undefined' && window.electronAPI && window.electronAPI.getExternalFileStats);
    },

    init() {
        if (this._initDone) return;
        this._initDone = true;
        console.log('Initializing BookKeeper Sync Service...');

        const savedConfig = localStorage.getItem('bk_sync_config');
        if (savedConfig) {
            try {
                const parsed = JSON.parse(savedConfig);
                this.config = { ...this.config, ...parsed };
            } catch (e) {
                console.warn('[BK] Invalid bk_sync_config, using defaults:', e);
            }
        }
        if (typeof this.config.autoSync !== 'boolean') {
            this.config.autoSync = true;
        }

        // File watcher + mtime polling need Electron IPC — never start on web/PWA (avoids noisy warnings).
        if (this._isElectronFileContext() && this.config.backupPath && this.config.autoSync) {
            this.startWatcher();
        }

        window.BookKeeperSync = this;

        // After DataManager has loaded (SyncManager runs post–DataManager.init), restore BK data if storage was cleared but we still have a backup path + prior sync.
        void this.maybeRehydrateFromBackup();
    },

    /**
     * Call after login or when the window becomes visible again.
     * Refreshes BookKeeper summary in the sync modal and (on Electron) runs one file mtime check / watcher start.
     */
    onAppForeground() {
        try {
            if (typeof SyncManager !== "undefined" && typeof SyncManager.updateAuditModalUI === "function") {
                SyncManager.updateAuditModalUI();
            }
        } catch (_) {
            /* ignore */
        }
        if (!this._isElectronFileContext() || !this.config.backupPath) {
            return;
        }
        if (this.config.autoSync) {
            if (!this.intervalId) {
                this.startWatcher();
            }
        }
        void this.checkFile();
    },

    /**
     * Hard refresh or cleared site data can empty invoices/vouchers while bk_sync_config remains.
     * Auto re-import once from the saved .db path (Electron only). File watcher only detects *changes*, not empty storage.
     */
    async maybeRehydrateFromBackup() {
        await new Promise((r) => setTimeout(r, 50));

        if (!window.electronAPI || !window.electronAPI.readFileBuffer) {
            return;
        }
        const path = this.config.backupPath;
        if (!path) {
            return;
        }

        const hadSuccessfulSync = !!(this.config.lastSyncDetails && this.config.lastSyncDetails.time);
        if (!hadSuccessfulSync) {
            return;
        }

        const invoices = DataManager.getData('invoices') || [];
        const vouchers = DataManager.getData(DataManager.KEYS.VOUCHERS) || DataManager.getData('vouchers') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('gtes_expenses') || [];
        const challans = DataManager.getData('challans') || [];

        const noTransactionalData =
            invoices.length === 0 &&
            vouchers.length === 0 &&
            expenses.length === 0 &&
            challans.length === 0;

        if (!noTransactionalData) {
            return;
        }

        console.log('[BK] Stored data empty but backup path + prior sync exist — re-importing from file...');
        if (typeof App !== 'undefined' && App.showNotification) {
            App.showNotification('Restoring Book Keeper data from your backup file…', 'info');
        }
        await this.triggerSync();
    },

    setBackupPath(path) {
        this.config.backupPath = path;
        this.saveConfig();
        // meaningful change, restart watcher
        this.stopWatcher();
        if (this._isElectronFileContext()) this.startWatcher();
    },

    toggleAutoSync(enabled) {
        this.config.autoSync = enabled;
        this.saveConfig();
        if (enabled && this._isElectronFileContext()) {
            this.startWatcher();
        } else {
            this.stopWatcher();
        }
    },

    saveConfig() {
        localStorage.setItem('bk_sync_config', JSON.stringify(this.config));
    },

    startWatcher() {
        if (this.intervalId) return; // Already running
        if (!this._isElectronFileContext()) return;
        if (!this.config.backupPath) return;

        console.log('Starting Book Keeper File Watcher on:', this.config.backupPath);

        // Initial check
        this.checkFile();

        // Poll for changes
        this.intervalId = setInterval(() => {
            this.checkFile();
        }, this.config.syncInterval);
    },

    stopWatcher() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('Stopped Book Keeper File Watcher');
        }
    },

    async checkFile() {
        if (!this._isElectronFileContext()) {
            return;
        }
        // While a full import runs, skip polling — avoids stacked IPC and keeps RTDB / other work smoother.
        if (this._importInProgress) {
            return;
        }
        if (this._fileStatInFlight) {
            return;
        }
        this._fileStatInFlight = true;

        try {
            const result = await window.electronAPI.getExternalFileStats(this.config.backupPath);
            
            if (result.success && result.lastModified) {
                // Initial load / bootstrap: If we don't have a baseline yet, set it now.
                if (!this.config.lastModified) {
                    this.config.lastModified = result.lastModified;
                    this.saveConfig();
                    console.log('[Sync] Initialized baseline timestamp:', new Date(result.lastModified).toLocaleString());
                    return;
                }

                // Comparison: Has the file been modified since our last check?
                if (result.lastModified > this.config.lastModified) {
                    console.log('[Sync] Change detected! Auto-triggering import...');
                    console.log(`[Sync] Old: ${new Date(this.config.lastModified).toLocaleString()}, New: ${new Date(result.lastModified).toLocaleString()}`);
                    
                    // Update baseline immediately to prevent multiple triggers if import is slow
                    this.config.lastModified = result.lastModified;
                    this.saveConfig();

                    // Run the actual sync
                    if (typeof App !== 'undefined' && App.showNotification) {
                        App.showNotification('Book Keeper backup update detected. Syncing...', 'info');
                    }
                    await this.triggerSync({ background: true });
                }
            } else if (result.error) {
                // Only log once to avoid console spam in intervals
                if (!this._lastError) {
                    console.warn('[Sync] File check error:', result.error);
                    if (typeof SyncManager !== 'undefined') {
                        SyncManager.logSyncEvent('error', 'Auto-watch error: ' + result.error + ' [' + this.config.backupPath + ']');
                    }
                    this._lastError = result.error;
                }
            } else {
                this._lastError = null;
            }
        } catch (error) {
            console.error('[Sync] Unexpected error during file check:', error);
        } finally {
            this._fileStatInFlight = false;
        }
    },

    /**
     * Let the current frame paint and give a short idle slice before heavy BK read + sqlite work.
     * Manual / rehydrate syncs skip this so they start immediately.
     */
    async _deferBackgroundImportStart() {
        await new Promise((resolve) => {
            const go = () => {
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 220)));
                } else {
                    setTimeout(resolve, 220);
                }
            };
            setTimeout(go, 0);
        });
    },

    /**
     * Shows native file dialog to pick database and get absolute path
     */
    async initiateNativeSync() {
        if (!window.electronAPI || !window.electronAPI.selectBookKeeperDb) {
            if (window.App && App.showNotification) App.showNotification('Native file picker not available. Please restart the app.', 'error');
            return;
        }

        try {
            const result = await window.electronAPI.selectBookKeeperDb();
            
            if (result.canceled) {
                if (typeof SyncManager !== 'undefined') {
                    SyncManager.clearSyncProgress?.();
                    SyncManager.updateStatus('synced', 'Book Keeper sync cancelled');
                }
                return;
            }

            if (!result.success || !result.path) {
                if (window.App && App.showNotification) App.showNotification('Error selecting file: ' + (result.error || 'Unknown'), 'error');
                return;
            }

            console.log('[Sync] Natively selected absolute path:', result.path);

            // Save the absolute path
            this.config.backupPath = result.path;
            
            // Force a baseline reset so the background auto watcher registers this as the new master
            this.config.lastModified = 0;
            this.saveConfig();

            // Run the actual Sync
            await this.triggerSync();
            
            // If the modal was open, gracefully reload it so the new path renders
            if (typeof SyncManager !== 'undefined' && document.getElementById('syncStatusModal')) {
                SyncManager.updateAuditModalUI();
            }

        } catch (e) {
            console.error('[Sync] Native dialgue error:', e);
            if (window.App && App.showNotification) App.showNotification('Failed to open file picker.', 'error');
        }
    },

    /**
     * Web/PWA fallback: pick .db/.sqlite and import directly.
     * Uses modern File System Access API (showOpenFilePicker) or hidden <input> fallback.
     */
    async initiateWebSync() {
        try {
            if (window.App && App.showNotification) {
                App.showNotification('Select your Book Keeper backup (.db/.sqlite)', 'info');
            }

            // Path 1: Modern File System Access API (Chrome/Edge)
            if (typeof window.showOpenFilePicker === 'function') {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: 'BookKeeper SQLite Backup',
                        accept: {
                            'application/octet-stream': ['.db', '.sqlite', '.sqlite3'],
                            'application/x-sqlite3': ['.db', '.sqlite', '.sqlite3']
                        }
                    }]
                });
                if (!handle) return;
                const file = await handle.getFile();
                this.webFileHandle = handle;
                this.webFileName = file.name;
                
                // Save locally so we can suggest this file later
                this.config.backupPath = file.name;
                this.saveConfig();
                
                await this._runImportFromFile(file, file.name);
                return;
            }

            // Path 2: Hidden <input type="file"> fallback
            const fileInput = document.getElementById('bkImportFile');
            if (fileInput) {
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        this.webFileHandle = null;
                        this.webFileName = file.name;
                        this.config.backupPath = file.name;
                        this.saveConfig();
                        await this._runImportFromFile(file, file.name);
                    }
                };
                fileInput.click();
                return;
            }

            throw new Error('No supported file selection mechanism found in this browser.');
        } catch (e) {
            if (e && e.name === 'AbortError') {
                if (typeof SyncManager !== 'undefined') {
                    SyncManager.clearSyncProgress?.();
                    SyncManager.updateStatus('synced', 'Book Keeper sync cancelled');
                }
                return;
            }
            console.error('[Sync] Web file picker error:', e);
            if (window.App && App.showNotification) {
                App.showNotification('Failed to open backup file picker.', 'error');
            }
        }
    },

    /**
     * Centralized Safe-Import Logic
     * Ensures we don't clear old data unless the new file is successfully parsed.
     * @param {File|Uint8Array|ArrayBuffer} fileOrBuffer - The backup data
     * @param {string} sourceLabel - Label for the sync status audit (e.g. filename)
     */
    async _runImportFromFile(fileOrBuffer, sourceLabel = 'BookKeeper Backup') {
        if (this._importInProgress) return;
        this._importInProgress = true;
        let progThrottleTimer = null;

        if (typeof SyncManager !== 'undefined') {
            SyncManager.updateStatus('syncing', 'Syncing with Book Keeper...');
            if (typeof SyncManager.setSyncProgress === 'function') {
                SyncManager.setSyncProgress(2, 'Preparing sync');
            }
            // BookKeeper import is a trusted source; do not spam conflict prompts.
            SyncManager.suppressConflictPrompts = true;
        }

        try {
            if (!window.BookKeeperImport) {
                throw new Error('BookKeeper import module not loaded');
            }

            // 1. PHASE ONE: Dry-run / Parse check
            // We open the DB and check for tables before clearing anything.
            // Note: BookKeeperImport.openDatabase(fileOrBuffer) should be called inside runFullImport.
            
            // 2. PHASE TWO: Actual Import
            // runFullImport executes the full data mapping.
            let lastProgPct = -999;
            const stats = await BookKeeperImport.runFullImport(fileOrBuffer, {
                onProgress: (percent, stage) => {
                    if (typeof SyncManager === 'undefined' || typeof SyncManager.setSyncProgress !== 'function') {
                        return;
                    }
                    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
                    const msg = stage || 'Syncing with Book Keeper...';
                    const flush = () => {
                        progThrottleTimer = null;
                        lastProgPct = p;
                        SyncManager.setSyncProgress(p, msg);
                    };
                    if (progThrottleTimer) {
                        clearTimeout(progThrottleTimer);
                        progThrottleTimer = null;
                    }
                    // Always show start/end and large jumps; coalesce small steps to cut main-thread churn.
                    if (p <= 3 || p >= 97 || Math.abs(p - lastProgPct) >= 5) {
                        flush();
                    } else {
                        progThrottleTimer = setTimeout(flush, 110);
                    }
                }
            });
            
            // 3. PHASE THREE: Post-Import Integrity Check
            const isVerified = await this.verifyDataIntegrity();
            if (typeof SyncManager !== 'undefined' && typeof SyncManager.setSyncProgress === 'function') {
                SyncManager.setSyncProgress(99, 'Finalizing sync');
            }

            // 4. Update sync metadata (runFullImport returns importStats, not getSummary sections)
            const vStats = stats.vouchers;
            const voucherCount = vStats
                ? (vStats.imported || 0) + (vStats.updated || 0)
                : 0;
            const custStats = stats.customers;
            const invStats = stats.inventory;
            this.config.lastSyncDetails = {
                time: new Date().getTime(),
                counts: {
                    vouchers: voucherCount,
                    customers: custStats ? (custStats.imported || 0) : 0,
                    inventory: invStats ? (invStats.imported || 0) : 0
                },
                path: sourceLabel
            };
            this.saveConfig();

            // Safety net: Book Keeper import can delete rows (e.g. invoices removed in backup).
            // Cloud uploads are debounced; flush now so a restart / forceRefresh won't union-merge stale cloud rows back.
            try {
                if (window.FileStorage && typeof FileStorage.flushPendingCloudWrites === 'function') {
                    await FileStorage.flushPendingCloudWrites(2500);
                }
            } catch (e) {
                console.warn('[Sync] flushPendingCloudWrites skipped:', e && e.message);
            }

            const totalTouched = this.countImportTouches(stats);

            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus(isVerified ? 'synced' : 'warning', isVerified ? 'Synced with Book Keeper' : 'Synced with Data Warnings');
                if (typeof SyncManager.clearSyncProgress === 'function') {
                    SyncManager.clearSyncProgress();
                }
                SyncManager.logSyncEvent(isVerified ? 'success' : 'warning', `Book Keeper import complete (${totalTouched} records).`);
            }

            // 5. Update UI
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification(`Book Keeper sync complete: ${totalTouched} records imported or updated.`, 'success');
            }

            // Defer heavy list/dashboard refreshes so RTDB listeners and layout aren’t starved on the same tick as import.
            const runDeferredViewRefresh = async () => {
                if (typeof App === 'undefined') return;
                if (App.currentView === 'accounting' && typeof AccountingUI !== 'undefined') {
                    AccountingUI.renderDashboard();
                } else if (App.currentView === 'invoices' && typeof InvoicesUI !== 'undefined') {
                    await InvoicesUI.load?.();
                } else if (App.currentView === 'vouchers' && typeof VouchersUI !== 'undefined') {
                    await VouchersUI.load?.();
                }
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(() => { void runDeferredViewRefresh(); }, { timeout: 2000 });
            } else {
                setTimeout(() => { void runDeferredViewRefresh(); }, 100);
            }
        } catch (e) {
            console.error('[Sync] Safe Import Error:', e);
            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus('conflict', 'Sync Failed: ' + e.message);
                if (typeof SyncManager.clearSyncProgress === 'function') {
                    SyncManager.clearSyncProgress();
                }
                SyncManager.logSyncEvent('error', 'Import failed: ' + e.message);
            }
            if (window.App && App.showNotification) {
                App.showNotification('Book Keeper sync failed: ' + e.message, 'error');
            }
        } finally {
            if (progThrottleTimer) {
                clearTimeout(progThrottleTimer);
                progThrottleTimer = null;
            }
            this._importInProgress = false;
            if (typeof SyncManager !== 'undefined') {
                SyncManager.suppressConflictPrompts = false;
                if (typeof SyncManager.clearSyncProgress === 'function' && SyncManager.status !== 'syncing') {
                    SyncManager.clearSyncProgress();
                }
            }
        }
    },

    /**
     * Trigger the full import process from the configured local path (Electron Only)
     * @param {{ background?: boolean }} [options] — if background, delay start slightly so UI / cloud sync are not starved.
     */
    async triggerSync(options = {}) {
        if (!window.electronAPI || !window.electronAPI.readFileBuffer) {
            // Background polling only works on Desktop via Electron
            return;
        }

        try {
            if (!this.config.backupPath) {
                throw new Error('No backup file path configured');
            }

            if (this._importInProgress) {
                return;
            }

            if (options.background) {
                await this._deferBackgroundImportStart();
                if (this._importInProgress) {
                    return;
                }
            }

            console.log('[Sync] Triggering import from:', this.config.backupPath, options.background ? '(background)' : '');

            // Read file buffer via Electron IPC
            const result = await window.electronAPI.readFileBuffer(this.config.backupPath);

            if (result.error) {
                throw new Error(result.error);
            }

            // Run central safe import
            await this._runImportFromFile(result.buffer, this.config.backupPath);

        } catch (e) {
            console.error('[Sync] Background sync error:', e);
            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus('conflict', 'Sync Failed: ' + e.message);
            }
        }
    }
};
