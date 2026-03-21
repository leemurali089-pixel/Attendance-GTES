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
        if (!this.isCloudReady) {
            console.warn("Cloud DB not ready. Saving locally.");
            localStorage.setItem(key, JSON.stringify(data));
            return false;
        }

        try {
            // Realtime Database allows replacing the entire node at once
            // This is perfect for bulk syncs and has NO document write limits!
            await window.db.ref(key).set(data);
            console.log(`✅ Cloud Sync [${key}]: Success`);
            return true;
        } catch (error) {
            console.error(`🚨 Cloud Sync Failed for ${key}:`, error);
            localStorage.setItem(key, JSON.stringify(data));
            return false;
        }
    },

    async loadData(key) {
        if (!this.isCloudReady) {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }

        try {
            console.log(`☁️ Fetching ${key} from Realtime Database...`);
            const snapshot = await window.db.ref(key).once('value');
            if (snapshot.exists()) {
                return snapshot.val();
            }
            return null;
        } catch (error) {
            console.error(`Error loading ${key} from Cloud:`, error);
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }
    }
};
