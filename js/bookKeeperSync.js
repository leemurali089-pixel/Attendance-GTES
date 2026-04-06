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
            if (e && e.name === 'AbortError') return;
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
        if (typeof SyncManager !== 'undefined' && SyncManager.status === 'syncing') return;
        
        if (typeof SyncManager !== 'undefined') {
            SyncManager.updateStatus('syncing', 'Syncing with Book Keeper...');
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
            const stats = await BookKeeperImport.runFullImport(fileOrBuffer);
            
            // 3. PHASE THREE: Post-Import Integrity Check
            const isVerified = await this.verifyDataIntegrity();

            // 4. Update sync metadata
            this.config.lastSyncDetails = {
                time: new Date().getTime(),
                counts: {
                    vouchers: stats.totalImported > 0 ? (stats.sections.find(s => s.name === 'Vouchers')?.imported || 0) : 0,
                    customers: stats.totalImported > 0 ? (stats.sections.find(s => s.name === 'Customers')?.imported || 0) : 0,
                    inventory: stats.totalImported > 0 ? (stats.sections.find(s => s.name === 'Inventory')?.imported || 0) : 0
                },
                path: sourceLabel
            };
            this.saveConfig();

            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus(isVerified ? 'synced' : 'warning', isVerified ? 'Synced with Book Keeper' : 'Synced with Data Warnings');
                SyncManager.logSyncEvent(isVerified ? 'success' : 'warning', `Book Keeper import complete (${stats.totalImported} records).`);
            }

            // 5. Update UI
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification(`Book Keeper sync complete: ${stats.totalImported} records imported.`, 'success');
            }

            // Refresh dashboards if currently visible
            if (typeof App !== 'undefined') {
                if (App.currentView === 'accounting' && typeof AccountingUI !== 'undefined') {
                    AccountingUI.renderDashboard();
                } else if (App.currentView === 'invoices' && typeof InvoicesUI !== 'undefined') {
                    await InvoicesUI.load?.();
                }
            }
        } catch (e) {
            console.error('[Sync] Safe Import Error:', e);
            if (typeof SyncManager !== 'undefined') {
                SyncManager.updateStatus('conflict', 'Sync Failed: ' + e.message);
                SyncManager.logSyncEvent('error', 'Import failed: ' + e.message);
            }
            if (window.App && App.showNotification) {
                App.showNotification('Book Keeper sync failed: ' + e.message, 'error');
            }
        }
    },

    /**
     * Trigger the full import process from the configured local path (Electron Only)
     */
    async triggerSync() {
        if (!window.electronAPI || !window.electronAPI.readFileBuffer) {
            // Background polling only works on Desktop via Electron
            return;
        }

        try {
            if (!this.config.backupPath) {
                throw new Error('No backup file path configured');
            }

            console.log('[Sync] Triggering background import from:', this.config.backupPath);

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
