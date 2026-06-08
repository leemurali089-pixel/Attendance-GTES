import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const p = path.join(root, 'main.js');
let c = fs.readFileSync(p, 'utf8');
if (c.includes('runtime:get-info')) {
    console.log('already patched');
    process.exit(0);
}
const ins = `// Runtime info for voice diagnostics (Electron vs browser STT)
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

`;
c = c.replace('// Get data folder path', ins + '// Get data folder path');
fs.writeFileSync(p, c);
console.log('patched main.js');
