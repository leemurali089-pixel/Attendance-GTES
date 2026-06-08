const { app, BrowserWindow, ipcMain, dialog, session, protocol } = require('electron');
const nodemailer = require('nodemailer');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs').promises;
const fssync = require('fs');
const crypto = require('crypto');
const gmailIpc = require('./gmail/gmailIpc');

// Reduce Chromium cache/quota issues on OneDrive paths by pinning cache
// inside Electron userData. Must be called before app.whenReady.
try {
    const ud = app.getPath('userData');
    const cacheDir = path.join(ud, 'Cache');
    app.setPath('cache', cacheDir);
    // Chromium still sometimes tries to relocate disk cache; force it.
    app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
    // Avoid GPU shader cache errors (common on restricted folders).
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (e) {
    console.warn('[main] setPath(cache) skipped:', e && e.message);
}

// Web Speech API in Electron needs a secure context; treat file:// as privileged.
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'file',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            corsEnabled: true
        }
    }
]);

// Prevent noisy Node warnings from background Gmail OAuth/network failures.
// These errors are already surfaced to the renderer via gmail IPC status.
let _lastUnhandledRejectionLogAt = 0;
process.on('unhandledRejection', (reason) => {
    try {
        const msg = String((reason && reason.message) ? reason.message : reason || '');
        const isGmailAuthNoise =
            msg.includes('invalid_grant') ||
            msg.includes('oauth2.googleapis.com') ||
            msg.includes('getaddrinfo ENOTFOUND oauth2.googleapis.com');
        const now = Date.now();
        if (isGmailAuthNoise) {
            // Throttle to avoid log spam if polling retries.
            if (now - _lastUnhandledRejectionLogAt > 30_000) {
                _lastUnhandledRejectionLogAt = now;
                console.warn('[main] Gmail sync auth/network error (handled):', msg);
            }
            return;
        }
        console.error('[main] Unhandled promise rejection:', reason);
    } catch (e) {
        console.error('[main] Unhandled rejection handler failed:', e);
    }
});

// Auto-update: the desktop app pulls new installers from the GitHub
// Release configured under "build.publish" in package.json. Skipped in
// dev (`npm start`) because there is no packaged app to replace.
let autoUpdater = null;
let updaterLastEvent = null;
try {
    autoUpdater = require('electron-updater').autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;
} catch (e) {
    console.warn('[updater] electron-updater not available:', e && e.message);
}

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

/**
 * Installed app default was OneDrive\Attendance GTES\Data; many clones use
 * OneDrive\Attendance GTES TRAIL\Data (or Documents\…). Resolve so desktop matches the folder you edit.
 * Priority: GTES_DATA_FOLDER env → userData/gtes-data-folder.json → auto (newer invoices.json) → legacy default.
 */
function resolvePackagedDataFolder() {
    const od = process.env.OneDrive;
    const docs = app.getPath('documents');
    const legacyBase = od ? path.join(od, 'Attendance GTES') : path.join(docs, 'Attendance GTES');
    const legacyData = path.join(legacyBase, 'Data');

    const envDir = (process.env.GTES_DATA_FOLDER || '').trim();
    if (envDir) {
        const resolved = path.resolve(envDir);
        console.log('[main] DATA_FOLDER from GTES_DATA_FOLDER:', resolved);
        return resolved;
    }

    try {
        const ud = app.getPath('userData');
        const cfgPath = path.join(ud, 'gtes-data-folder.json');
        if (fssync.existsSync(cfgPath)) {
            const cfg = JSON.parse(fssync.readFileSync(cfgPath, 'utf8'));
            const p = cfg && typeof cfg.dataFolder === 'string' ? path.resolve(cfg.dataFolder.trim()) : '';
            if (p && fssync.existsSync(p)) {
                console.log('[main] DATA_FOLDER from gtes-data-folder.json:', p);
                return p;
            }
        }
    } catch (e) {
        console.warn('[main] gtes-data-folder.json:', e && e.message);
    }

    const mtimeMs = (p) => {
        try {
            return fssync.statSync(p).mtimeMs;
        } catch (_) {
            return 0;
        }
    };
    const invFile = (dir) => path.join(dir, 'invoices.json');

    const trailCandidates = [];
    if (od) trailCandidates.push(path.join(od, 'Attendance GTES TRAIL', 'Data'));
    trailCandidates.push(path.join(docs, 'Attendance GTES TRAIL', 'Data'));

    let bestTrail = null;
    let bestTrailInvM = 0;
    for (const c of trailCandidates) {
        if (!fssync.existsSync(c)) continue;
        const inv = invFile(c);
        const m = fssync.existsSync(inv) ? mtimeMs(inv) : mtimeMs(c);
        if (m >= bestTrailInvM) {
            bestTrailInvM = m;
            bestTrail = c;
        }
    }

    const legacyInv = invFile(legacyData);
    const legacyInvM = fssync.existsSync(legacyInv) ? mtimeMs(legacyInv) : 0;

    if (bestTrail && (legacyInvM === 0 || bestTrailInvM >= legacyInvM)) {
        console.log('[main] DATA_FOLDER auto-selected (project Data folder):', bestTrail);
        return bestTrail;
    }

    console.log('[main] DATA_FOLDER default:', legacyData);
    return legacyData;
}

if (app.isPackaged) {
    DATA_FOLDER = resolvePackagedDataFolder();
    GLOBAL_BASE_PATH = path.dirname(DATA_FOLDER);
} else {
    const envDev = (process.env.GTES_DATA_FOLDER || '').trim();
    if (envDev) {
        DATA_FOLDER = path.resolve(envDev);
        GLOBAL_BASE_PATH = path.dirname(DATA_FOLDER);
    } else {
        // For local development, keep it strictly to the current project clone
        GLOBAL_BASE_PATH = __dirname;
        DATA_FOLDER = path.join(__dirname, 'Data');
    }
}

try {
    const marker = path.join(app.getPath('userData'), '.gtes-active-data-folder');
    fssync.writeFileSync(marker, DATA_FOLDER, 'utf8');
} catch (e) {
    console.warn('[main] Could not write .gtes-active-data-folder:', e && e.message);
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

    // Allow microphone for voice ERP assistant (Chromium speech recognition).
    try {
        session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
            callback(true);
        });
        session.defaultSession.setPermissionCheckHandler(() => true);
    } catch (e) {
        console.warn('[main] speech permission handler skipped:', e && e.message);
    }

    await ensureDataFolder();
    createWindow();

    try { gmailIpc.init(); } catch (e) { console.error('[main] gmailIpc init error:', e.message); }

    // Forward lifecycle events to the renderer so the Admin UI can show
    // "checking / available / downloading / downloaded / error", and cache
    // the last significant event so late-joining views (e.g. the global
    // "Update ready" banner) can query current state on render.
    if (autoUpdater && app.isPackaged) {
        const send = (type, payload) => {
            updaterLastEvent = { type, ...payload };
            try {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('updater:event', { type, ...payload });
                }
            } catch {}
        };
        autoUpdater.on('checking-for-update', () => send('checking-for-update', {}));
        autoUpdater.on('update-available', (info) => send('update-available', { info }));
        autoUpdater.on('update-not-available', (info) => send('update-not-available', { info }));
        autoUpdater.on('error', (err) => {
            send('error', { message: formatUpdaterError(err) });
        });
        autoUpdater.on('download-progress', (p) => send('download-progress', { progress: p }));
        autoUpdater.on('update-downloaded', (info) => send('update-downloaded', { info }));

        // First background check a few seconds after startup so splash/
        // initial render is not blocked by network.
        setTimeout(() => {
            checkForUpdatesWithRetry(3, 10000).then(() => {
                // checkForUpdatesAndNotify also shows OS notification; retry path uses checkForUpdates only.
            }).catch((err) => {
                console.warn('[updater] initial check failed:', formatUpdaterError(err));
            });
        }, 20000);
    } else if (!app.isPackaged) {
        console.log('[updater] skipped (dev mode / not packaged)');
    }

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Updater IPC surface (used by Admin UI + global update banner).
ipcMain.handle('updater:getVersion', () => {
    return { version: app.getVersion(), packaged: app.isPackaged };
});
// Last significant updater event, so views that mount AFTER the events
// fired (e.g. a user switching to the Admin tab post-download) can still
// see the correct state instead of a stale "Ready." label.
ipcMain.handle('updater:getState', () => {
    return { lastEvent: updaterLastEvent, version: app.getVersion(), packaged: app.isPackaged };
});
ipcMain.handle('updater:check', async () => {
    if (!autoUpdater) return { success: false, error: 'updater unavailable' };
    if (!app.isPackaged) return { success: false, error: 'dev mode (run the installed app to check for updates)' };
    try {
        // checkForUpdates() always returns the LATEST available version
        // even when it is equal to the current one. Compare versions so
        // the renderer can display the right message without waiting
        // for the async update-available / update-not-available event.
        const r = await checkForUpdatesWithRetry(4, 8000);
        const remote = r && r.updateInfo && r.updateInfo.version;
        const current = app.getVersion();
        const updateAvailable = !!(remote && compareSemver(remote, current) > 0);
        return {
            success: true,
            data: {
                currentVersion: current,
                remoteVersion: remote || null,
                updateAvailable,
                releaseDate: r && r.updateInfo && r.updateInfo.releaseDate
            }
        };
    } catch (e) {
        return { success: false, error: formatUpdaterError(e) };
    }
});

/** GitHub Actions may publish Setup.exe before latest.yml — transient 404. */
function isUpdaterPublishRace404(err) {
    const msg = String(err && err.message || err || '');
    return /404/i.test(msg) && /latest\.yml/i.test(msg) && /releases\/download/i.test(msg);
}

function formatUpdaterError(err) {
    let msg = String(err && err.message || err || 'unknown');
    if (isUpdaterPublishRace404(err)) {
        return 'The release is still publishing on GitHub (latest.yml not ready yet). Wait 1–2 minutes and click Check for Updates again.';
    }
    if (/404/i.test(msg) && /github\.com.*releases\/download/i.test(msg)) {
        msg += ' The release must include latest.yml and MJS-PrimeLogic-Setup-<version>.exe (from electron-builder publish).';
    }
    return msg;
}

async function checkForUpdatesWithRetry(maxAttempts = 4, delayMs = 8000) {
    if (!autoUpdater) throw new Error('updater unavailable');
    let lastErr = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await autoUpdater.checkForUpdates();
        } catch (e) {
            lastErr = e;
            if (!isUpdaterPublishRace404(e) || attempt >= maxAttempts) throw e;
            console.warn(`[updater] latest.yml not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms…`);
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    throw lastErr;
}

function compareSemver(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}
ipcMain.handle('updater:download', async () => {
    if (!autoUpdater) return { success: false, error: 'updater unavailable' };
    if (!app.isPackaged) return { success: false, error: 'dev mode' };
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (e) {
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
});
ipcMain.handle('updater:install', async () => {
    if (!autoUpdater) return { success: false, error: 'updater unavailable' };
    if (!app.isPackaged) return { success: false, error: 'dev mode' };
    try {
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
        return { success: true };
    } catch (e) {
        return { success: false, error: e && e.message ? e.message : String(e) };
    }
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
            // 1. Write to temporary file (compact JSON — pretty-print blocks UI on multi-MB ledgers)
            await fs.writeFile(tempPath, JSON.stringify(data), 'utf8');
            
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
            // Avoid spamming the terminal; DevTools → Verbose still shows debug.
            console.debug(`[Electron] Large file (${key}.json, ${(data.length / 1024 / 1024).toFixed(2)} MB) — raw string to renderer (parse happens in renderer).`);
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

// Runtime info for voice diagnostics (Electron vs browser STT)
ipcMain.handle('runtime:get-info', async () => ({
    electron: process.versions.electron || null,
    chromium: process.versions.chrome || null,
    node: process.versions.node || null,
    platform: process.platform,
    isPackaged: app.isPackaged
}));

ipcMain.handle('speech:get-env-hints', async () => ({
    hasGoogleApiKey: !!(process.env.GOOGLE_API_KEY && String(process.env.GOOGLE_API_KEY).trim()),
    hasGoogleClientId: !!(process.env.GOOGLE_DEFAULT_CLIENT_ID),
    electron: process.versions.electron || null,
    chromium: process.versions.chrome || null
}));

// Get data folder path
ipcMain.handle('get-data-folder', async () => {
    return DATA_FOLDER;
});

/** User-selected Data directory (persisted); app relaunches so main picks it up. */
ipcMain.handle('set-gtes-data-folder-restart', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog(win || undefined, {
            title: 'Select Data folder (contains invoices.json)',
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: 'Use this folder'
        });
        if (canceled || !filePaths || !filePaths[0]) {
            return { success: false, canceled: true };
        }
        const chosen = filePaths[0];
        const ok = ['invoices.json', 'vouchers.json', 'gtes_settings.json'].some((f) =>
            fssync.existsSync(path.join(chosen, f))
        );
        if (!ok) {
            return {
                success: false,
                error: 'That folder has no invoices.json / vouchers.json / gtes_settings.json. Open the inner Data folder, not the repo root.'
            };
        }
        const cfgPath = path.join(app.getPath('userData'), 'gtes-data-folder.json');
        await fs.writeFile(cfgPath, JSON.stringify({ dataFolder: chosen }, null, 2), 'utf8');
        app.relaunch();
        app.exit(0);
        return { success: true };
    } catch (e) {
        return { success: false, error: e && e.message ? String(e.message) : 'Unknown error' };
    }
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

        // Save single file (compact JSON — manual backup can be very large)
        await fs.writeFile(backupFilePath, JSON.stringify(fullBackup), 'utf8');

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
/** Off-screen window used only for invoice HTML → PDF (printToPDF). */
let invoicePdfWindow = null;

function getInvoicePdfWindow() {
    if (invoicePdfWindow && !invoicePdfWindow.isDestroyed()) {
        return invoicePdfWindow;
    }
    invoicePdfWindow = new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true
        }
    });
    invoicePdfWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return invoicePdfWindow;
}

/** Match InvoicePreviewLayout margin presets (mm → inches for Electron custom margins). */
function invoiceMarginMm(preset) {
    const map = { none: 0, narrow: 5, normal: 8 };
    return map[preset] ?? 8;
}

/** Measure layout in a webContents (preview / print / download parity). */
async function measureInvoiceRender(wc) {
    return wc.executeJavaScript(`
        (() => {
            const h = (el) => el ? Math.max(el.scrollHeight || 0, el.offsetHeight || 0) : 0;
            const measureRoot = (root) => {
                if (!root) return null;
                const lineItems = root.querySelector('.gtes-invoice-line-items');
                const footer = root.querySelector('.gtes-invoice-footer-block');
                const totals = root.querySelector('.gtes-invoice-totals-summary');
                const bank = root.querySelector('.gtes-invoice-bank-details');
                const signature = root.querySelector('.gtes-pdf-signature-block');
                let beforeFooter = h(root);
                if (footer) {
                    try {
                        const range = document.createRange();
                        range.setStart(root, 0);
                        range.setEndBefore(footer);
                        beforeFooter = range.getBoundingClientRect().height;
                    } catch (_) {
                        beforeFooter = Math.max(footer.offsetTop - root.offsetTop, 0);
                    }
                }
                const footerStyle = footer ? getComputedStyle(footer) : null;
                return {
                    rootHeight: h(root),
                    lineItemsHeight: h(lineItems),
                    beforeFooterHeight: beforeFooter,
                    footerHeight: h(footer),
                    totalsHeight: h(totals),
                    bankHeight: h(bank),
                    signatureHeight: h(signature),
                    footerBreakInside: footerStyle?.breakInside || null,
                    footerPageBreakInside: footerStyle?.pageBreakInside || null
                };
            };
            const printRoot = document.querySelector('#gtesInvoicePrintSource .gtes-invoice-print-root')
                || document.querySelector('#pdfPreviewContainer .gtes-invoice-print-root')
                || document.querySelector('.gtes-invoice-print-root');
            const previewRoot = document.querySelector('#gtesInvoicePagesStage .gtes-invoice-print-root');
            const bodyRect = document.body.getBoundingClientRect();
            const rootRect = printRoot ? printRoot.getBoundingClientRect() : null;
            const style = printRoot ? window.getComputedStyle(printRoot) : null;
            const cssZoom = style?.zoom || '1';
            const transform = style?.transform || 'none';
            let transformScale = 1;
            if (transform && transform !== 'none') {
                const m = transform.match(/^matrix\\(([^,]+),\\s*[^,]+,\\s*[^,]+,\\s*([^,]+)/);
                if (m) transformScale = Number(m[1]) || 1;
            }
            const zoomNumber = Number(cssZoom) || 1;
            const printDomHeight = measureRoot(printRoot);
            const previewDomHeight = measureRoot(previewRoot);
            console.log('[printToPDF:dom-heights]', {
                previewDomHeight,
                printDomHeight,
                printHeightPx: printDomHeight?.rootHeight ?? null
            });
            return {
                bodyRect: { width: bodyRect.width, height: bodyRect.height, top: bodyRect.top, left: bodyRect.left },
                contentWidthPx: rootRect ? rootRect.width : bodyRect.width,
                contentHeightPx: rootRect ? rootRect.height : bodyRect.height,
                printHeightPx: printDomHeight?.rootHeight ?? (rootRect ? rootRect.height : null),
                previewDomHeight,
                printDomHeight,
                renderScale: zoomNumber * transformScale,
                cssZoom,
                cssTransform: transform,
                cssTransformScale: transformScale,
                devicePixelRatio: window.devicePixelRatio || 1,
                browserZoom: 1
            };
        })()
    `);
}

function countPdfPages(buffer) {
    if (!buffer || !buffer.length) return 0;
    const text = buffer.toString('latin1');
    const matches = text.match(/\/Type\s*\/Page\b(?!s)/g);
    return matches ? matches.length : 1;
}

async function printInvoiceFromWebContents(wc, { pageSize, marginPreset, metrics, scale, orientation }) {
    wc.setZoomFactor(1);
    const measured = await measureInvoiceRender(wc);
    measured.browserZoom = wc.getZoomFactor();
    const scaleFactor = Math.min(200, Math.max(50, parseInt(scale, 10) || 100));
    measured.electronPrintToPdfScaleFactor = scaleFactor;

    const page = pageSize === 'Letter' ? 'Letter' : 'A4';
    const marginMm = metrics?.marginTopMm ?? invoiceMarginMm(marginPreset);
    const landscape = orientation === 'landscape';

    const pdfBuffer = await wc.printToPDF({
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize: page,
        scaleFactor,
        preferCSSPageSize: true,
        landscape
    });

    const pdfPageCount = countPdfPages(pdfBuffer);

    return {
        pdfBase64: pdfBuffer.toString('base64'),
        measured,
        marginMm,
        pageSize: page,
        pdfPageCount,
        scaleFactor,
        landscape
    };
}

/** Download PDF from the same DOM + print CSS as window.print (fixes scale mismatch). */
ipcMain.handle('invoice-preview-to-pdf', async (_event, { pageSize, marginPreset, metrics, scale, orientation }) => {
    try {
        if (!mainWindow || mainWindow.isDestroyed()) {
            return { success: false, error: 'Main window not available' };
        }
        const result = await printInvoiceFromWebContents(mainWindow.webContents, {
            pageSize,
            marginPreset,
            metrics,
            scale,
            orientation
        });
        console.log('[invoice-preview-to-pdf:render-measure]', result.measured, 'pdfPages:', result.pdfPageCount);
        return {
            success: true,
            pdfBase64: result.pdfBase64,
            metrics: {
                layout: metrics || null,
                measured: result.measured,
                marginMm: result.marginMm,
                pageSize: result.pageSize,
                pdfPageCount: result.pdfPageCount,
                scaleFactor: result.scaleFactor,
                landscape: result.landscape,
                source: 'mainWindow.printToPDF'
            }
        };
    } catch (error) {
        console.error('[invoice-preview-to-pdf]', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('invoice-html-to-pdf', async (_event, { html, pageSize, marginPreset, scale, metrics }) => {
    try {
        if (!html || typeof html !== 'string') {
            return { success: false, error: 'Missing HTML' };
        }
        const win = getInvoicePdfWindow();
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
        await win.loadURL(dataUrl);
        await win.webContents.executeJavaScript(`
            (async () => {
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                await Promise.all([...document.images].map((img) => new Promise((res) => {
                    if (img.complete) { res(); return; }
                    const t = setTimeout(res, 4000);
                    img.onload = img.onerror = () => { clearTimeout(t); res(); };
                })));
            })()
        `);

        const result = await printInvoiceFromWebContents(win.webContents, {
            pageSize,
            marginPreset,
            metrics,
            scale,
            orientation: metrics?.orientation
        });
        console.log('[invoice-html-to-pdf:render-measure]', result.measured, 'pdfPages:', result.pdfPageCount);

        return {
            success: true,
            pdfBase64: result.pdfBase64,
            metrics: {
                layout: metrics || null,
                measured: result.measured,
                marginMm: result.marginMm,
                pageSize: result.pageSize,
                pdfPageCount: result.pdfPageCount,
                scaleFactor: result.scaleFactor,
                source: 'offscreen.printToPDF'
            }
        };
    } catch (error) {
        console.error('[invoice-html-to-pdf]', error);
        return { success: false, error: error.message };
    }
});

function pdfMediaBoxLandscape(pdfBuffer) {
    try {
        const text = pdfBuffer.toString('latin1');
        const m = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
        if (!m) return null;
        const w = parseFloat(m[1]);
        const h = parseFloat(m[2]);
        if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
        return w > h;
    } catch (_) {
        return null;
    }
}

ipcMain.handle('print-pdf-buffer', async (_event, { pdfBase64, filename, landscape, pageSize }) => {
    let printWin;
    try {
        if (!pdfBase64) return { success: false, error: 'Missing PDF data' };
        const tmpDir = app.getPath('temp');
        const safeName = (filename || `gtes-invoice-${Date.now()}.pdf`).replace(/[^\w.-]+/g, '_');
        const tmpPath = path.join(tmpDir, safeName);
        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        await fs.writeFile(tmpPath, pdfBuffer);

        const detectedLandscape = pdfMediaBoxLandscape(pdfBuffer);
        const useLandscape = detectedLandscape != null ? detectedLandscape : !!landscape;
        const page = pageSize === 'Letter' ? 'Letter' : 'A4';
        const winW = useLandscape ? 1280 : 900;
        const winH = useLandscape ? 900 : 1200;

        printWin = new BrowserWindow({
            show: false,
            width: winW,
            height: winH,
            useContentSize: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        });
        printWin.setContentSize(winW, winH);

        await printWin.loadURL(pathToFileURL(tmpPath).href);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 8000);
            printWin.webContents.once('did-finish-load', () => {
                clearTimeout(timer);
                setTimeout(resolve, 350);
            });
            printWin.webContents.once('did-fail-load', (_e, _code, desc) => {
                clearTimeout(timer);
                reject(new Error(desc || 'PDF load failed'));
            });
        });

        console.log('[print-pdf-buffer]', {
            tmpPath,
            detectedLandscape,
            useLandscape,
            page,
            winW,
            winH
        });

        const printResult = await new Promise((resolve) => {
            printWin.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                    landscape: useLandscape,
                    pageSize: page
                },
                (success, failureReason) => {
                    if (!printWin.isDestroyed()) printWin.close();
                    resolve({ success: !!success, error: failureReason || null });
                }
            );
        });
        return {
            ...printResult,
            path: tmpPath,
            landscape: useLandscape,
            pageSize: page,
            detectedLandscape
        };
    } catch (error) {
        if (printWin && !printWin.isDestroyed()) printWin.close();
        console.error('[print-pdf-buffer]', error);
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
