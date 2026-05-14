const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // File operations
    saveData: (key, data) => ipcRenderer.invoke('save-data', key, data),
    loadData: (key) => ipcRenderer.invoke('load-data', key),
    fileExists: (key) => ipcRenderer.invoke('file-exists', key),
    getDataFolder: () => ipcRenderer.invoke('get-data-folder'),
    setGtesDataFolderRestart: () => ipcRenderer.invoke('set-gtes-data-folder-restart'),
    getFileStats: (key) => ipcRenderer.invoke('get-file-stats', key),
    getExternalFileStats: (path) => ipcRenderer.invoke('get-external-file-stats', path),
    createBackup: () => ipcRenderer.invoke('create-backup'),
    createManualBackup: () => ipcRenderer.invoke('create-manual-backup'),
    readFileBuffer: (path) => ipcRenderer.invoke('read-file-buffer', path),
    selectBookKeeperDb: () => ipcRenderer.invoke('select-bookkeeper-db'),

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

    // App auto-update (electron-updater + GitHub Releases)
    updater: {
        getVersion: () => ipcRenderer.invoke('updater:getVersion'),
        getState: () => ipcRenderer.invoke('updater:getState'),
        check: () => ipcRenderer.invoke('updater:check'),
        download: () => ipcRenderer.invoke('updater:download'),
        install: () => ipcRenderer.invoke('updater:install'),
        onEvent: (cb) => ipcRenderer.on('updater:event', (_evt, data) => cb(data))
    },

    // Gmail API integration
    gmail: {
        // Auth
        status: () => ipcRenderer.invoke('gmail:status'),
        saveCredentials: (creds) => ipcRenderer.invoke('gmail:save-credentials', creds),
        loadCredentials: () => ipcRenderer.invoke('gmail:load-credentials'),
        login: () => ipcRenderer.invoke('gmail:login'),
        logout: () => ipcRenderer.invoke('gmail:logout'),
        // Sync
        initialSync: (opts) => ipcRenderer.invoke('gmail:initial-sync', opts),
        incrementalSync: () => ipcRenderer.invoke('gmail:incremental-sync'),
        syncNow: () => ipcRenderer.invoke('gmail:sync-now'),
        getState: () => ipcRenderer.invoke('gmail:get-state'),
        pollingStart: (interval) => ipcRenderer.invoke('gmail:polling-start', interval),
        pollingStop: () => ipcRenderer.invoke('gmail:polling-stop'),
        // Read
        list: (args) => ipcRenderer.invoke('gmail:list', args),
        getMessage: (args) => ipcRenderer.invoke('gmail:get-message', args),
        // Actions
        markRead: (id) => ipcRenderer.invoke('gmail:mark-read', id),
        markUnread: (id) => ipcRenderer.invoke('gmail:mark-unread', id),
        archive: (id) => ipcRenderer.invoke('gmail:archive', id),
        trash: (id) => ipcRenderer.invoke('gmail:trash', id),
        reportSpam: (id) => ipcRenderer.invoke('gmail:report-spam', id),
        // Attachments
        downloadAttachment: (args) => ipcRenderer.invoke('gmail:download-attachment', args),
        readAttachmentBytes: (args) => ipcRenderer.invoke('gmail:read-attachment-bytes', args),
        // Send
        send: (payload) => ipcRenderer.invoke('gmail:send', payload),
        // Queues
        queueList: (name) => ipcRenderer.invoke('gmail:queue-list', name),
        queueUpdate: (args) => ipcRenderer.invoke('gmail:queue-update', args),
        queueRemove: (args) => ipcRenderer.invoke('gmail:queue-remove', args),
        resetCache: () => ipcRenderer.invoke('gmail:reset-cache'),
        enrichFlags: () => ipcRenderer.invoke('gmail:enrich-flags'),
        materializeQueues: (opts) => ipcRenderer.invoke('gmail:materialize-queues', opts),
        reclassifyQueue: (name) => ipcRenderer.invoke('gmail:reclassify-queue', { name }),
        // User-taught classification
        classifyAs: (messageId, type) => ipcRenderer.invoke('gmail:classify-as', { messageId, type }),
        userRulesList: () => ipcRenderer.invoke('gmail:user-rules-list'),
        userRuleAdd: (type, pattern) => ipcRenderer.invoke('gmail:user-rule-add', { type, pattern }),
        userRuleRemove: (type, pattern) => ipcRenderer.invoke('gmail:user-rule-remove', { type, pattern }),
        // Listeners
        onSyncStatus: (cb) => ipcRenderer.on('gmail:sync-status', (_e, d) => cb(d)),
        onQueueUpdated: (cb) => ipcRenderer.on('gmail:queue-updated', (_e, d) => cb(d)),
        onOpenView: (cb) => ipcRenderer.on('gmail:open-view', (_e, d) => cb(d)),
        onOpenQueue: (cb) => ipcRenderer.on('gmail:open-queue', (_e, d) => cb(d)),
        onMaterializeProgress: (cb) => ipcRenderer.on('gmail:materialize-progress', (_e, d) => cb(d)),
        onRulesUpdated: (cb) => ipcRenderer.on('gmail:rules-updated', (_e, d) => cb(d))
    },

    // PDF operations
    savePdf: (data) => ipcRenderer.invoke('save-pdf', data),

    // Deep Sync operations (New in v1.1.5)
    syncToCloud: (key, data) => ipcRenderer.invoke('sync-to-cloud', key, data),

    // Check if running in Electron
    isElectron: true,
    
    // Low-level IPC
    send: (channel, data) => ipcRenderer.send(channel, data)
});
