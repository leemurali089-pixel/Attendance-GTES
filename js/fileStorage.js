// File Storage Module - Firebase Realtime Database Integration
const FileStorage = {
    isCloudReady: false,

    async init() {
        if (typeof window.db !== 'undefined') {
            this.isCloudReady = true;
            console.log("☁️ Realtime Database cloud connection active.");
            return true;
        } else {
            console.error("Realtime DB not initialized.");
            return false;
        }
    },

    async saveData(key, data) {
        let localSuccess = false;
        // Handle Electron first (Local Persistence)
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.saveData(key, data);
                if (result && result.success) {
                    console.log(`✅ Local File Sync [${key}]: Success`);
                    localSuccess = true;
                } else {
                    console.error(`🚨 Local File Sync Failed for ${key}:`, result?.error);
                }
            } catch (err) {
                console.error(`🚨 Electron IPC Error during save for ${key}:`, err);
            }
        }

        // Handle Cloud Persistence
        if (!this.isCloudReady) {
            if (!window.electronAPI) {
                console.warn("Cloud DB not ready. Saving to localStorage.");
                localStorage.setItem(key, JSON.stringify(data));
            }
            return localSuccess; // Return local status if cloud isn't ready
        }

        try {
            await window.db.ref(key).set(data);
            console.log(`✅ Cloud Sync [${key}]: Success`);
            return true;
        } catch (error) {
            console.error(`🚨 Cloud Sync Failed for ${key}:`, error);
            if (!window.electronAPI) {
                localStorage.setItem(key, JSON.stringify(data));
            }
            return localSuccess; // Still return true if local succeeded but cloud failed (partial success)
        }
    },

    async loadData(key) {
        // Handle Electron first
        let localData = null;
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.loadData(key);
                if (result && result.success) {
                    // If the main process returned a raw string (optimization for large files), parse it here
                    if (result.isRaw && typeof result.data === 'string') {
                        try {
                            localData = JSON.parse(result.data);
                        } catch (pe) {
                            console.error(`[FileStorage] Failed to parse raw data for '${key}':`, pe);
                            localData = null;
                        }
                    } else {
                        localData = result.data;
                    }
                }
                console.warn(`[FileStorage] Local File load failed/empty for '${key}':`, result?.error);
            } catch (err) {
                console.error(`[FileStorage] Electron IPC Error during load for ${key}:`, err);
            }
        }

        if (!this.isCloudReady) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                console.warn(`[FileStorage] Corrupt localStorage for '${key}', ignoring:`, e);
                return null;
            }
        }

        try {
            console.log(`☁️ Fetching ${key} from Realtime Database...`);
            const snapshot = await window.db.ref(key).once('value');
            if (snapshot.exists()) {
                const cloudVal = snapshot.val();
                // If we're on desktop and have both local + cloud, prefer merged/newer for array datasets.
                if (window.electronAPI && localData != null) {
                    if (Array.isArray(localData) && Array.isArray(cloudVal) && window.DataManager && typeof window.DataManager._mergeRecordArraysById === 'function') {
                        return window.DataManager._mergeRecordArraysById(localData, cloudVal);
                    }
                    // For non-array (or if merge is not possible), prefer cloud as source of truth.
                    return cloudVal;
                }
                return cloudVal;
            }
            // No cloud value; fall back to local if any.
            return localData;
        } catch (error) {
            console.error(`Error loading ${key} from Cloud:`, error);
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch (e) {
                console.warn(`[FileStorage] Corrupt localStorage fallback for '${key}':`, e);
                return localData;
            }
        }
    }
};
