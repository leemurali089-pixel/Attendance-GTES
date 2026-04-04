/**
 * BookKeeper Sync Service
 * Handles the background synchronization between Book Keeper Backup (.db) and MJS PrimeLogic
 */
const BookKeeperSync = {
    config: {
        autoSync: true,
        backupPath: null, // User selected path to .db file
        syncInterval: 30000, // 30 seconds
        lastModified: 0
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
                DataManager.saveData('inventoryTransactions', validTxns);
                
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

    init() {
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

        if (this.config.backupPath && this.config.autoSync) {
            this.startWatcher();
        }

        window.BookKeeperSync = this;

        // After DataManager has loaded (SyncManager runs post–DataManager.init), restore BK data if storage was cleared but we still have a backup path + prior sync.
        void this.maybeRehydrateFromBackup();
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
        this.startWatcher();
    },

    toggleAutoSync(enabled) {
        this.config.autoSync = enabled;
        this.saveConfig();
        if (enabled) {
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
        if (!window.electronAPI) {
            console.warn('Sync requires Electron context');
            return;
        }

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
                    await this.triggerSync();
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
        }
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
            
            if (result.canceled) return;

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
     * Trigger the full import process safely
     */
    async triggerSync() {
        if (typeof SyncManager !== 'undefined' && SyncManager.status === 'syncing') return;

        if (typeof SyncManager !== 'undefined') {
            SyncManager.updateStatus('syncing', 'Syncing with Book Keeper...');
        }

        try {
            if (!this.config.backupPath) {
                throw new Error('No backup file path configured');
            }

            console.log('Triggering Book Keeper Import from:', this.config.backupPath);

            // Read file buffer via Electron IPC
            if (window.electronAPI && window.electronAPI.readFileBuffer) {
                const result = await window.electronAPI.readFileBuffer(this.config.backupPath);

                if (result.error) {
                    throw new Error(result.error);
                }

                if (window.BookKeeperImport) {
                    // Clear old BK data first so deletions are reflected
                    if (typeof BookKeeperImport.clearBookKeeperData === 'function') {
                        BookKeeperImport.clearBookKeeperData();
                    }

                    // Run Import
                    const stats = await BookKeeperImport.runFullImport(result.buffer);
                    const isVerified = await this.verifyDataIntegrity();

                    // Store last sync details
                    this.config.lastSyncDetails = {
                        time: new Date().getTime(),
                        counts: {
                            vouchers: stats.vouchers?.imported || 0,
                            customers: stats.customers?.imported || 0,
                            inventory: stats.inventory?.imported || 0
                        },
                        path: this.config.backupPath
                    };
                    this.saveConfig();

                    if (typeof SyncManager !== 'undefined') {
                        if (isVerified) {
                            SyncManager.updateStatus('synced', 'Synced with Book Keeper');
                        } else {
                            SyncManager.updateStatus('warning', 'Synced with Data Warnings');
                        }
                    }

                    // Refresh UI if needed
                    if (App.currentView === 'accounting' && AccountingUI) {
                        AccountingUI.showTrialBalance();
                    }
                }
            } else {
                throw new Error('Electron API not available for file reading');
            }

        } catch (e) {
            console.error('Sync Error:', e);
            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus('conflict', 'Sync Failed: ' + e.message);
            }
        }
    }
};
