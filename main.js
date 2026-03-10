const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
    return new Promise((resolve, reject) => {
        const [salt, originalHash] = storedHash.split(':');
        if (!salt || !originalHash) {
            // Fallback for plain text (migration phase)
            resolve(password === storedHash);
            return;
        }

        crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            resolve(originalHash === derivedKey.toString('hex'));
        });
    });
});

let mainWindow;

// Data folder path - use userData for packaged app, local Data folder for development
// When packaged, __dirname points to inside app.asar which is read-only
// So we use the parent directory of app.asar for the Data folder
let DATA_FOLDER;
if (app.isPackaged) {
    // For packaged app: use the parent directory of resources/app.asar
    // This will be in the installation directory, e.g., C:\Users\Dell\OneDrive\MJS PrimeLogic\Data
    const appPath = app.getAppPath(); // Points to resources/app.asar or resources/app
    const resourcesPath = path.dirname(appPath); // Points to resources/
    const installPath = path.dirname(resourcesPath); // Points to installation directory
    DATA_FOLDER = path.join(installPath, 'Data');
} else {
    // For development: use local Data folder in project directory
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

// Save data to file
ipcMain.handle('save-data', async (event, key, data) => {
    try {
        const filePath = path.join(DATA_FOLDER, `${key}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`Saved ${key}.json`);
        return { success: true };
    } catch (error) {
        console.error(`Error saving ${key}:`, error);
        return { success: false, error: error.message };
    }
});

// Load data from file
ipcMain.handle('load-data', async (event, key) => {
    try {
        const filePath = path.join(DATA_FOLDER, `${key}.json`);
        const data = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);
        console.log(`Loaded ${key}.json`);

        let parsedData = null;
        try {
            parsedData = JSON.parse(data);
        } catch (parseError) {
            console.error(`Error parsing ${key}.json:`, parseError);
            // Return null so the app can use defaults or fallback
            return { success: true, data: null, lastModified: stats.mtimeMs };
        }

        return {
            success: true,
            data: parsedData,
            lastModified: stats.mtimeMs
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist
            console.log(`File not found: ${key}.json`);
            return { success: true, data: null };
        }
        console.error(`Error loading ${key}:`, error);
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
        // Use same approach as DATA_FOLDER to get the correct base path
        let basePath;
        if (app.isPackaged) {
            const appPath = app.getAppPath();
            const resourcesPath = path.dirname(appPath);
            basePath = path.dirname(resourcesPath);
        } else {
            basePath = __dirname;
        }
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

        // Save single file
        await fs.writeFile(backupFilePath, JSON.stringify(fullBackup, null, 2), 'utf8');

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
// Save PDF to specific folder (PRD Requirement)
ipcMain.handle('save-pdf', async (event, { blobBase64, filename, subfolder }) => {
    try {
        let basePath;
        if (app.isPackaged) {
            const appPath = app.getAppPath();
            const resourcesPath = path.dirname(appPath);
            basePath = path.dirname(resourcesPath);
        } else {
            basePath = __dirname;
        }

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
