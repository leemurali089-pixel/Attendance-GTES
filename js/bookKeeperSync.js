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

            // Check for orphaned inventory transactions
            const txns = DataManager.getData('inventoryTransactions') || [];
            const orphanedTxns = txns.filter(t => !inventory.find(m => m.id === t.materialId));
            if (orphanedTxns.length > 0) {
                issues.push(`${orphanedTxns.length} orphaned inventory transactions found.`);
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

    async init() {
        console.log('Initializing BookKeeper Sync Service...');

        // Load saved config
        const savedConfig = localStorage.getItem('bk_sync_config');
        if (savedConfig) {
            this.config = JSON.parse(savedConfig);
        }

        // Start watcher if path is configured
        if (this.config.backupPath && this.config.autoSync) {
            this.startWatcher();
        }

        // Expose to window for UI interactions
        window.BookKeeperSync = this;
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

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
    BookKeeperSync.init();
});
