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
        'vouchers',
        'gtes_recycle_bin'
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
            console.log(`[Migrator]: Fetching data for ${key}...`);
            let localData = DataManager.getData(key) || [];
            
            // Check if special handling is needed for large files via main process direct sync
            // For now, we only push large files from desktop as they are mostly desktop-managed
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

            // Normal file two-way sync (merge cloud and local arrays by ID)
            let cloudData = await FileStorage.loadData(key); // Fetches from Firebase
            let mergedData = localData;

            if (Array.isArray(localData) && Array.isArray(cloudData)) {
                console.log(`[Migrator]: 🔄 Merging arrays for ${key}...`);
                const map = new Map();
                // Add cloud data first
                cloudData.forEach(item => { if (item && item.id) map.set(item.id, item); });
                // Add/Overwrite with local data (assuming local is most recent, or just merging)
                // Note: Real CRDT merge needs timestamps. For now, local overrides if conflicts, 
                // but crucially, this PRESERVES cloud items that desktop doesn't have!
                localData.forEach(item => { if (item && item.id) map.set(item.id, item); });
                
                mergedData = Array.from(map.values());

                // PREVENT RESURRECTION: Filter out items that are in the Recycle Bin
                // We fetch the cloud and local recycle bins just for this comparison
                if (key !== 'gtes_recycle_bin') {
                    const localRB = DataManager.getData('gtes_recycle_bin') || [];
                    const cloudRB = await FileStorage.loadData('gtes_recycle_bin') || [];
                    const recycleBinIds = new Set([
                        ...localRB.map(r => r.id),
                        ...cloudRB.map(r => r.id)
                    ].filter(Boolean));

                    if (recycleBinIds.size > 0) {
                        mergedData = mergedData.filter(item => !recycleBinIds.has(item.id));
                    }
                }
            } else if ((!localData || localData.length === 0) && cloudData) {
                mergedData = cloudData;
            } else if (localData && typeof localData === 'object' && !Array.isArray(localData) && cloudData) {
                // Merge objects (like gtes_settings)
                mergedData = { ...cloudData, ...localData };
            }

            // 1. Save merged data locally so Desktop sees Mobile's new data
            if (typeof window.electronAPI !== 'undefined' && mergedData && mergedData !== localData) {
                await DataManager.saveDataSync(key, mergedData); 
                // We use saveDataSync to update local cache immediately so views can render
                await DataManager.saveData(key, mergedData);
            }

            // 2. Push merged data back to Cloud so Mobile sees Desktop's data
            console.log(`[Migrator]: ☁️ Pushing merged ${key} to Cloud...`);
            const success = await FileStorage.saveData(key, mergedData);
            return success;

        } catch (error) {
            console.error(`[Migrator]: ❌ Sync failed for ${key}:`, error);
            return false;
        }
    }
};

window.DeepCloudMigrator = DeepCloudMigrator;
