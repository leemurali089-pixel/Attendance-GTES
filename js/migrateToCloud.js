/**
 * Deep Cloud Migrator (v2.0)
 * Handles high-fidelity synchronization of all database files to Firebase.
 * Including special handling for large files (Employees, Inventory Transactions).
 */

if (!window.DeepCloudMigrator) {
    const DeepCloudMigrator = {
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
        'gtes_recycle_bin'
    ],

    async importAll() {
        if (!confirm("⚠️ WARNING: This will overwrite ALL your current local data with the data from the Cloud.\n\nAre you sure you want to IMPORT?")) return;
        
        console.log("🚀 Starting Cloud Import (Pull)...");
        App.showNotification("Importing from Cloud...", "info");

        let successCount = 0;
        let failCount = 0;
        let failedKeys = [];

        for (const key of this.DB_FILES) {
            const success = await this.importFile(key);
            if (success) successCount++;
            else {
                failCount++;
                failedKeys.push(key);
            }
        }

        if (failCount === 0) {
            App.showNotification(`✅ Cloud Import Complete: ${successCount} modules downloaded.`, "success");
            setTimeout(() => window.location.reload(), 1500); // Reload to reflect changes
        } else {
            App.showNotification(`⚠️ Import partial: ${successCount} ok, ${failCount} failed (${failedKeys.join(', ')}).`, "warning");
        }
    },

    async importFile(key) {
        try {
            console.log(`[Migrator]: Fetching Cloud data for ${key}...`);
            const cloudData = await FileStorage.loadData(key);
            
            if (cloudData !== null && cloudData !== undefined) {
                if (typeof window.electronAPI !== 'undefined') {
                    // Update main process DB
                    await DataManager.saveData(key, cloudData);
                    // Update renderer cache
                    await DataManager.saveDataSync(key, cloudData); 
                } else {
                    // Overwrite Web App LocalStorage
                    await DataManager.saveData(key, cloudData);
                }
                console.log(`[Migrator]: ✅ Imported ${key} successfully.`);
                return true;
            } else {
                console.log(`[Migrator]: ☁️ No cloud data for ${key}. Skipped.`);
                return true;
            }
        } catch (error) {
            console.error(`[Migrator]: ❌ Import failed for ${key}:`, error);
            return false;
        }
    },

    async exportAll() {
        if (!confirm("⚠️ WARNING: This will overwrite ALL Cloud data with your current local machine's data.\n\nAre you sure you want to EXPORT?")) return;

        console.log("🚀 Starting Cloud Export (Push)...");
        App.showNotification("Exporting to Cloud...", "info");

        let successCount = 0;
        let failCount = 0;
        let failedKeys = [];

        for (const key of this.DB_FILES) {
            const success = await this.exportFile(key);
            if (success) successCount++;
            else {
                failCount++;
                failedKeys.push(key);
            }
        }

        if (failCount === 0) {
            App.showNotification(`✅ Cloud Export Complete: ${successCount} modules uploaded.`, "success");
        } else {
            console.error(`[Migrator]: Partial Export Failed. Failed Keys:`, failedKeys);
            App.showNotification(`⚠️ Export partial: ${successCount} ok, ${failCount} failed (${failedKeys.join(', ')}).`, "warning");
        }
    },

    async exportFile(key) {
        try {
            console.log(`[Migrator]: Pushing Local data for ${key}...`);
            let localData = DataManager.getData(key) || [];
            
            // Normal file export (Authorized via Renderer SDK)
            const success = await FileStorage.saveData(key, localData);
            return success;
        } catch (error) {
            console.error(`[Migrator]: ❌ Export failed for ${key}:`, error);
            return false;
        }
    }
};

window.DeepCloudMigrator = DeepCloudMigrator;
}
