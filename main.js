const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// ... existing code ...

// Password Hashing (PBKDF2)
ipcMain.handle('hash-password', async (event, password) => {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
});

ipcMain.handle('verify-password', async (event, password, storedHash) => {
    return new Promise((resolve) => {
        if (storedHash == null || typeof storedHash !== 'string') {
            resolve(false);
            return;
        }
        const [salt, originalHash] = storedHash.split(':');
        if (!salt || !originalHash) {
            resolve(password === storedHash);
            return;
        }

        crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) {
                console.error('verify-password pbkdf2 error:', err);
                resolve(false);
                return;
            }
            resolve(originalHash === derivedKey.toString('hex'));
        });
    });
});

let mainWindow;

// Data folder path - use OneDrive if available for multi-PC syncing
let DATA_FOLDER;
let GLOBAL_BASE_PATH;

if (process.env.OneDrive) {
    // If OneDrive is active on this PC, sync everything through it
    GLOBAL_BASE_PATH = path.join(process.env.OneDrive, 'Attendance GTES');
} else {
    // Fallback to Documents if OneDrive isn't configured
    GLOBAL_BASE_PATH = path.join(app.getPath('documents'), 'Attendance GTES');
}

if (app.isPackaged) {
    DATA_FOLDER = path.join(GLOBAL_BASE_PATH, 'Data');
} else {
    // For local development, keep it strictly to the current project clone
    GLOBAL_BASE_PATH = __dirname;
    DATA_FOLDER = path.join(__dirname, 'Data');
}

// Ensure Data folder exists
async function ensureDataFolder() {
    try {
        await fs.mkdir(DATA_FOLDER, { recursive: true });
        console.log('Data folder ensured:', DATA_FOLDER);
    } catch (error) {
        console.error('Error creating Data folder:', error);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'GTES Attendance & Salary Management System'
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development (uncomment to debug)
    // Open DevTools in development (uncomment to debug)
    // mainWindow.webContents.openDevTools();

    // Start file watcher
    setupFileWatcher(mainWindow);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    if (!app.isPackaged) {
        try {
            session.defaultSession.setCacheEnabled(false);
        } catch (e) {
            console.warn('Dev cache disable skipped:', e && e.message);
        }
    }
    await ensureDataFolder();
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers for file operations

// Watch for file changes
let fileWatcher = null;

function setupFileWatcher(window) {
    if (fileWatcher) fileWatcher.close();

    try {
        // Watch the Data folder
        fileWatcher = fs.watch(DATA_FOLDER, (eventType, filename) => {
            if (filename && filename.endsWith('.json')) {
                // Debounce or just send event
                window.webContents.send('file-changed', filename);
            }
        });
        console.log('File watcher started on', DATA_FOLDER);
    } catch (error) {
        console.error('Error starting file watcher:', error);
    }
}

// Queue for sequential file writes (Prevents OneDrive/Sync collisions)
const writeQueue = new Map(); // Map of key -> Promise chain

/**
 * Robustly save data with retries and atomic write (temp-then-rename)
 */
async function robustSave(key, data) {
    const filePath = path.join(DATA_FOLDER, `${key}.json`);
    const tempPath = filePath + '.tmp';
    const maxRetries = 5;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // 1. Write to temporary file
            await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
            
            // 2. Atomic rename (replaces old file if it exists)
            await fs.rename(tempPath, filePath);
            
            return { success: true };
        } catch (error) {
            lastError = error;
            // Common OneDrive/Sync locks: EBUSY, EPERM, UNKNOWN
            console.warn(`[Save Queue] Attempt ${attempt} failed for ${key}: ${error.code || error.message}`);
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, attempt * 200));
        }
    }

    console.error(`[Save Queue] ❌ All ${maxRetries} attempts failed for ${key}.`);
    return { success: false, error: lastError?.message || 'Unknown save error' };
}

// Bridge console logs from renderer to terminal for debugging
ipcMain.on('log-to-terminal', (event, message) => {
    console.log(`[Renderer]: ${message}`);
});

// Queue-wrapped IPC handler
ipcMain.handle('save-data', async (event, key, data) => {
    // Get or create queue for this specific file key
    if (!writeQueue.has(key)) {
        writeQueue.set(key, Promise.resolve());
    }

    // Append this save operation to the chain
    const currentQueue = writeQueue.get(key);
    const nextOperation = currentQueue
        .then(() => robustSave(key, data))
        .catch(err => ({ success: false, error: err.message }));

    writeQueue.set(key, nextOperation);
    return nextOperation;
});

// Load data from file
ipcMain.handle('load-data', async (event, key) => {
    try {
        const filePath = path.join(DATA_FOLDER, `${key}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);

        // Optimization: For huge files (> 5MB), just return success and let the renderer know it's too big
        // Or return raw string to avoid serialization costs of large objects
        if (data.length > 5 * 1024 * 1024) {
             console.log(`Large file detected (${key}.json), returning raw string to renderer.`);
             return { success: true, isRaw: true, data: data, lastModified: stats.mtimeMs };
        }

        let parsedData = null;
        try {
            parsedData = JSON.parse(data);
        } catch (parseError) {
            console.error(`Error parsing ${key}.json:`, parseError);
            return { success: true, data: null, lastModified: stats.mtimeMs };
        }

        return { success: true, data: parsedData, lastModified: stats.mtimeMs };
    } catch (error) {
        if (error.code === 'ENOENT') return { success: true, data: null };
        return { success: false, error: error.message };
    }
});

// Get file stats (for conflict detection)
ipcMain.handle('get-file-stats', async (event, key) => {
    try {
        const filePath = path.join(DATA_FOLDER, `${key}.json`);
        const stats = await fs.stat(filePath);
        return { success: true, lastModified: stats.mtimeMs };
    } catch (error) {
        return { success: false, error: error.code }; // ENOENT if not found
    }
});

// NEW: Get external file stats (for Book Keeper sync)
ipcMain.handle('get-external-file-stats', async (event, absolutePath) => {
    try {
        if (!absolutePath) throw new Error('Path is required');
        const stats = await fs.stat(absolutePath);
        return { success: true, lastModified: stats.mtimeMs, size: stats.size };
    } catch (error) {
        return { success: false, error: error.code || error.message };
    }
});

// Check if file exists
ipcMain.handle('file-exists', async (event, key) => {
    try {
        const filePath = path.join(DATA_FOLDER, `${key}.json`);
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
});

// Get data folder path
ipcMain.handle('get-data-folder', async () => {
    return DATA_FOLDER;
});

// Read file buffer (for Book Keeper .db file)
ipcMain.handle('read-file-buffer', async (event, filePath) => {
    try {
        const buffer = await fs.readFile(filePath);
        return { success: true, buffer: buffer };
    } catch (error) {
        console.error('Error reading file buffer:', error);
        return { success: false, error: error.message };
    }
});

// Automatic backup (to default Backups folder)
ipcMain.handle('create-backup', async () => {
    try {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        // Use the globally synchronized base path
        let basePath = GLOBAL_BASE_PATH;
        const backupFolder = path.join(basePath, 'Backups', date);

        // Create backup folder if it doesn't exist
        await fs.mkdir(backupFolder, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileName = `backup_full_${timestamp}.json`;
        const backupFilePath = path.join(backupFolder, backupFileName);

        // Read all data files
        const files = await fs.readdir(DATA_FOLDER);
        const fullBackup = {};
        let fileCount = 0;

        for (const file of files) {
            if (file.endsWith('.json')) {
                const sourcePath = path.join(DATA_FOLDER, file);
                const data = await fs.readFile(sourcePath, 'utf8');
                const key = path.parse(file).name; // e.g., 'gtes_users'
                fullBackup[key] = JSON.parse(data);
                fileCount++;
            }
        }

        // Save single file - Remove pretty-printing (null, 2) which is extremely slow on 5MB+ objects
        await fs.writeFile(backupFilePath, JSON.stringify(fullBackup), 'utf8');

        console.log(`Automatic backup created: ${fileCount} data sets to ${backupFilePath}`);
        return { success: true, path: backupFilePath, fileCount };
    } catch (error) {
        console.error('Automatic backup error:', error);
        return { success: false, error: error.message };
    }
});

// Manual backup with folder selection (Single File)
ipcMain.handle('create-manual-backup', async () => {
    try {
        // Show folder selection dialog
        const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Backup Location',
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: 'Select Folder'
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { success: false, cancelled: true };
        }

        const selectedFolder = filePaths[0];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const backupFileName = `backup_full_${timestamp}.json`;
        const backupFilePath = path.join(selectedFolder, backupFileName);

        // Read all data files
        const files = await fs.readdir(DATA_FOLDER);
        const fullBackup = {};
        let fileCount = 0;

        for (const file of files) {
            if (file.endsWith('.json')) {
                const sourcePath = path.join(DATA_FOLDER, file);
                const data = await fs.readFile(sourcePath, 'utf8');
                // Store with filename as key (without extension)
                const key = path.parse(file).name;
                fullBackup[key] = JSON.parse(data);
                fileCount++;
            }
        }

        // Save single file
        await fs.writeFile(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

        console.log(`Manual backup created: ${fileCount} data sets to ${backupFilePath}`);
        return { success: true, path: backupFilePath, fileCount, type: 'single-file' };
    } catch (error) {
        console.error('Manual backup error:', error);
        return { success: false, error: error.message };
    }
});

// Export backup
ipcMain.handle('export-backup', async (event, data, filename) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export Backup',
            defaultPath: filename,
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ]
        });

        if (filePath) {
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
            return { success: true, path: filePath };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Import backup
ipcMain.handle('import-backup', async () => {
    try {
        const { filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Import Backup',
            filters: [
                { name: 'JSON Files', extensions: ['json'] }
            ],
            properties: ['openFile']
        });

        if (filePaths && filePaths.length > 0) {
            const data = await fs.readFile(filePaths[0], 'utf8');
            return { success: true, data: JSON.parse(data) };
        }
        return { success: false, cancelled: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Select Book Keeper Database File (for getting absolute path)
ipcMain.handle('select-bookkeeper-db', async () => {
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
            title: 'Select Book Keeper Database (.db)',
            buttonLabel: 'Select Database',
            filters: [
                { name: 'BookKeeper Database', extensions: ['db', 'sqlite'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });

        if (canceled || !filePaths || filePaths.length === 0) {
            return { success: false, canceled: true };
        }
        
        return { success: true, path: filePaths[0] };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
// Save PDF to specific folder (PRD Requirement)
ipcMain.handle('save-pdf', async (event, { blobBase64, filename, subfolder }) => {
    try {
        let basePath = GLOBAL_BASE_PATH;
        const outputDir = path.join(basePath, 'ChallanOutput', subfolder);
        await fs.mkdir(outputDir, { recursive: true });

        const filePath = path.join(outputDir, filename);
        const buffer = Buffer.from(blobBase64, 'base64');
        await fs.writeFile(filePath, buffer);

        console.log(`PDF saved to: ${filePath}`);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Error saving PDF:', error);
        return { success: false, error: error.message };
    }
});

// Direct Cloud Sync for large data (Bypasses Renderer/IPC overhead)
const https = require('https');
ipcMain.handle('sync-to-cloud', async (event, key, data) => {
    return new Promise((resolve) => {
        const payload = JSON.stringify(data);
        const options = {
            hostname: 'mjs-primelogic-default-rtdb.asia-southeast1.firebasedatabase.app',
            port: 443,
            path: `/${key}.json`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        console.log(`[Main Sync]: Uploading ${key} directly to Firebase... (${Buffer.byteLength(payload)} bytes)`);
        
        const req = https.request(options, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`[Main Sync]: ✅ ${key} uploaded successfully (Status ${res.statusCode})`);
                resolve({ success: true });
            } else {
                console.error(`[Main Sync]: ❌ ${key} failed (Status ${res.statusCode})`);
                resolve({ success: false, error: `Firebase error ${res.statusCode}` });
            }
        });

        req.on('error', (e) => {
            console.error(`[Main Sync]: ❌ ${key} error:`, e.message);
            resolve({ success: false, error: e.message });
        });

        req.write(payload);
        req.end();
    });
});

// Email sending
ipcMain.handle('send-email', async (event, config, mailOptions) => {
    try {
        const transporter = nodemailer.createTransport(config);
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return { success: true, info };
    } catch (error) {
        console.error('Email error:', error);
        return { success: false, error: error.message };
    }
});
