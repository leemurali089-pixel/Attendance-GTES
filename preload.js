const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
    loadData: (key) => ipcRenderer.invoke('load-data', key),
    fileExists: (key) => ipcRenderer.invoke('file-exists', key),
    getDataFolder: () => ipcRenderer.invoke('get-data-folder'),

    // Backup operations
    exportBackup: (data, filename) => ipcRenderer.invoke('export-backup', data, filename),
    importBackup: () => ipcRenderer.invoke('import-backup'),

    // Check if running in Electron
    isElectron: true
});
