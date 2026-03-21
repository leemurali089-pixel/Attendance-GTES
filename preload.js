const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
    loadData: (key) => ipcRenderer.invoke('load-data', key),
    fileExists: (key) => ipcRenderer.invoke('file-exists', key),
    getDataFolder: () => ipcRenderer.invoke('get-data-folder'),
    getFileStats: (key) => ipcRenderer.invoke('get-file-stats', key),
    createBackup: () => ipcRenderer.invoke('create-backup'),
    createManualBackup: () => ipcRenderer.invoke('create-manual-backup'),
    readFileBuffer: (path) => ipcRenderer.invoke('read-file-buffer', path),

    // Listeners
    onFileChanged: (callback) => ipcRenderer.on('file-changed', (event, filename) => callback(filename)),

    // Backup operations
    exportBackup: (data, filename) => ipcRenderer.invoke('export-backup', data, filename),
    importBackup: () => ipcRenderer.invoke('import-backup'),

    // Security operations
    hashPassword: (password) => ipcRenderer.invoke('hash-password', password),
    verifyPassword: (password, hash) => ipcRenderer.invoke('verify-password', password, hash),

    // Email operations
    sendEmail: (config, mailOptions) => ipcRenderer.invoke('send-email', config, mailOptions),

    // PDF operations
    savePdf: (data) => ipcRenderer.invoke('save-pdf', data),

    // Deep Sync operations (New in v1.1.5)
    syncToCloud: (key, data) => ipcRenderer.invoke('sync-to-cloud', key, data),

    // Check if running in Electron
    isElectron: true,
    
    // Low-level IPC
    send: (channel, data) => ipcRenderer.send(channel, data)
});
