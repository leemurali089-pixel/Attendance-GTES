// File Storage Module - Supports both Electron and Browser
const FileStorage = {
    directoryHandle: null,
    storageMode: 'localStorage', // 'electron', 'fileSystem', or 'localStorage'
    dataFolder: 'Data',
    isElectron: false,

    async init() {
        // Check if running in Electron
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron) {
            this.isElectron = true;
            this.storageMode = 'electron';
            console.log('Running in Electron - using file system storage');

            // Get data folder path
            const dataFolder = await window.electronAPI.getDataFolder();
            console.log('Data folder:', dataFolder);
            return true;
        }

        // Browser mode - check if File System Access API is supported
        if (!('showDirectoryPicker' in window)) {
            console.warn('File System Access API not supported. Using localStorage.');
            this.storageMode = 'localStorage';
            return false;
        }

        // Check if we have stored directory handle
        const storedHandle = localStorage.getItem('dropboxDirectoryHandle');
        if (storedHandle) {
            try {
                // Try to restore the handle
                const handle = await this.restoreDirectoryHandle();
                if (handle) {
                    this.directoryHandle = handle;
                    this.storageMode = 'fileSystem';
                    console.log('Restored directory handle from storage');
                    return true;
                }
            } catch (error) {
                console.warn('Could not restore directory handle:', error);
            }
        }

        // Prompt user to select directory
        return await this.requestDirectoryAccess();
    },

    async requestDirectoryAccess() {
        try {
            // Request directory access
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            this.directoryHandle = handle;
            this.storageMode = 'fileSystem';

            // Store handle reference (note: actual handle can't be stored, just the reference)
            localStorage.setItem('dropboxDirectoryHandle', 'granted');
            localStorage.setItem('dropboxDirectoryName', handle.name);

            // Create Data folder if it doesn't exist
            await this.ensureDataFolder();

            console.log('Directory access granted:', handle.name);
            return true;
        } catch (error) {
            console.warn('Directory access denied:', error);
            this.storageMode = 'localStorage';
            return false;
        }
    },

    async restoreDirectoryHandle() {
        // Note: In current browsers, we can't truly restore the handle
        // User will need to grant access again on page reload
        // This is a browser security limitation
        return null;
    },

    async ensureDataFolder() {
        if (!this.directoryHandle) return;

        try {
            await this.directoryHandle.getDirectoryHandle(this.dataFolder, { create: true });
            console.log('Data folder ensured');
        } catch (error) {
            console.error('Error creating Data folder:', error);
        }
    },

    async saveData(key, data) {
        // Electron mode
        if (this.storageMode === 'electron') {
            try {
                const result = await window.electronAPI.saveData(key, data);
                if (result.success) {
                    console.log(`Saved ${key} via Electron`);
                    return true;
                } else {
                    console.error(`Error saving ${key}:`, result.error);
                    // Fallback to localStorage
                    localStorage.setItem(key, JSON.stringify(data));
                    return false;
                }
            } catch (error) {
                console.error(`Electron save error for ${key}:`, error);
                localStorage.setItem(key, JSON.stringify(data));
                return false;
            }
        }

        // localStorage fallback
        if (this.storageMode === 'localStorage') {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        }

        try {
            // Get Data folder
            const dataFolder = await this.directoryHandle.getDirectoryHandle(this.dataFolder, { create: true });

            // Create/update file
            const fileName = `${key}.json`;
            const fileHandle = await dataFolder.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();

            // Write data
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();

            console.log(`Saved ${fileName} to Dropbox`);
            return true;
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
            // Fallback to localStorage
            localStorage.setItem(key, JSON.stringify(data));
            return false;
        }
    },

    async loadData(key) {
        // Electron mode
        if (this.storageMode === 'electron') {
            try {
                const result = await window.electronAPI.loadData(key);
                if (result.success) {
                    if (result.data !== null) {
                        console.log(`Loaded ${key} via Electron`);
                        return result.data;
                    } else {
                        // File doesn't exist, check localStorage as fallback
                        console.log(`No file for ${key}, checking localStorage`);
                        const localData = localStorage.getItem(key);
                        return localData ? JSON.parse(localData) : null;
                    }
                } else {
                    console.error(`Error loading ${key}:`, result.error);
                    const localData = localStorage.getItem(key);
                    return localData ? JSON.parse(localData) : null;
                }
            } catch (error) {
                console.error(`Electron load error for ${key}:`, error);
                const localData = localStorage.getItem(key);
                return localData ? JSON.parse(localData) : null;
            }
        }

        // localStorage fallback
        if (this.storageMode === 'localStorage') {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }

        try {
            // Get Data folder
            const dataFolder = await this.directoryHandle.getDirectoryHandle(this.dataFolder);

            // Read file
            const fileName = `${key}.json`;
            const fileHandle = await dataFolder.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            const contents = await file.text();

            console.log(`Loaded ${fileName} from Dropbox`);
            return JSON.parse(contents);
        } catch (error) {
            // File doesn't exist or error reading
            console.log(`No file found for ${key}, checking localStorage`);

            // Check localStorage as fallback
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        }
    },

    async migrateFromLocalStorage() {
        if (this.storageMode !== 'fileSystem') {
            console.warn('Cannot migrate: not in fileSystem mode');
            return false;
        }

        const keys = [
            'employees',
            'attendance',
            'holidays',
            'advances',
            'settings',
            'authPassword',
            'salaryPayouts'
        ];

        let migratedCount = 0;

        for (const key of keys) {
            const data = localStorage.getItem(key);
            if (data) {
                try {
                    const parsed = JSON.parse(data);
                    await this.saveData(key, parsed);
                    migratedCount++;
                    console.log(`Migrated ${key} to Dropbox`);
                } catch (error) {
                    console.error(`Error migrating ${key}:`, error);
                }
            }
        }

        console.log(`Migration complete: ${migratedCount} items migrated`);
        return migratedCount > 0;
    },

    getStorageMode() {
        return this.storageMode;
    },

    getStorageInfo() {
        return {
            mode: this.storageMode,
            directoryName: this.directoryHandle ? this.directoryHandle.name : 'N/A',
            supported: 'showDirectoryPicker' in window
        };
    },

    async resetDirectoryAccess() {
        this.directoryHandle = null;
        this.storageMode = 'localStorage';
        localStorage.removeItem('dropboxDirectoryHandle');
        localStorage.removeItem('dropboxDirectoryName');
        console.log('Directory access reset');
    }
};
