const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow;

// Data folder path in Dropbox
const DATA_FOLDER = path.join(__dirname, 'Data');

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
        icon: path.join(__dirname, 'icon.ico'),
        title: 'GTES Attendance & Salary Management System'
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development
    // mainWindow.webContents.openDevTools();

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
        console.log(`Loaded ${key}.json`);
        return { success: true, data: JSON.parse(data) };
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
