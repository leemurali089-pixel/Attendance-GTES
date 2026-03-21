/**
 * Deep Cloud Migrator (v2.0)
 * Handles high-fidelity synchronization of all database files to Firebase.
 * Including special handling for large files (Employees, Inventory Transactions).
 */

const DeepCloudMigrator = {
    // Files that are too large for standard IPC (10MB+ or close)
    LARGE_FILES: ['gtes_employees', 'inventoryTransactions'],
    
    // Core database files to sync
    DB_FILES: [
        'invoices', 
        'vouchers', 
        'customers', 
        'inventory', 
        'inventoryTransactions',
        'gtes_employees',
        'gtes_tasks',
        'gtes_attendance',
        'gtes_expenses',
        'gtes_settings',
        'gtes_users',
        'gtes_advances',
        'gtes_holidays',
        'gtes_services',
        'vouchers'
    ],

    async syncAll() {
        console.log("🚀 Starting Deep Cloud Migration...");
        App.showNotification("Starting Cloud Sync...", "info");

        let successCount = 0;
        let failCount = 0;

        for (const key of this.DB_FILES) {
            const success = await this.syncFile(key);
            if (success) successCount++;
            else failCount++;
        }

        if (failCount === 0) {
            App.showNotification(`✅ Cloud Synchronized: ${successCount} modules updated.`, "success");
        } else {
            App.showNotification(`⚠️ Cloud Sync partial: ${successCount} ok, ${failCount} failed.`, "warning");
        }
    },

    async syncFile(key) {
        try {
            console.log(`[Migrator]: Fetching local data for ${key}...`);
            const localData = DataManager.getData(key);
            
            if (!localData || (Array.isArray(localData) && localData.length === 0)) {
                console.log(`[Migrator]: Skipped ${key} (Empty)`);
                return true;
            }

            // Check if special handling is needed for large files
            if (this.LARGE_FILES.includes(key) && typeof window.electronAPI !== 'undefined' && window.electronAPI.syncToCloud) {
                console.log(`[Migrator]: ⚡ Using Direct-to-Cloud Sync for large file: ${key}`);
                const result = await window.electronAPI.syncToCloud(key, localData);
                if (result.success) {
                    console.log(`[Migrator]: ✅ ${key} synced via Main Process.`);
                    return true;
                } else {
                    throw new Error(result.error || "Main process sync failed");
                }
            }

            // Standard Sync for other files
            console.log(`[Migrator]: ☁️ Syncing ${key} via FileStorage...`);
            const success = await FileStorage.saveData(key, localData);
            return success;

        } catch (error) {
            console.error(`[Migrator]: ❌ Sync failed for ${key}:`, error);
            return false;
        }
    }
};

window.DeepCloudMigrator = DeepCloudMigrator;
