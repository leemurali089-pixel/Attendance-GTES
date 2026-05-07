// IPC surface for Gmail features (main process).
// Renderer calls via window.electronAPI.gmail.*

const { ipcMain, BrowserWindow, Notification, Tray, Menu, app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const auth = require('./gmailAuth');
const store = require('./gmailStore');
const sync = require('./gmailSync');

let pollTimer = null;
let pollBusy = false;
let tray = null;
let notifiedIds = new Set();

function broadcast(channel, payload) {
    BrowserWindow.getAllWindows().forEach(w => {
        try { w.webContents.send(channel, payload); } catch {}
    });
}

async function safe(fn) {
    try { const data = await fn(); return { success: true, data }; }
    catch (e) { console.error('[gmailIpc]', e.stack || e.message); return { success: false, error: e.message }; }
}

async function notifyNewFlagged() {
    try {
        const poList = await store.readQueue('po');
        const bankList = await store.readQueue('bank');
        const newPo = poList.filter(x => x.status === 'new' && !notifiedIds.has('po:' + x.messageId));
        const newBank = bankList.filter(x => x.status === 'new' && !notifiedIds.has('bank:' + x.messageId));
        if (!newPo.length && !newBank.length) return;
        newPo.forEach(x => notifiedIds.add('po:' + x.messageId));
        newBank.forEach(x => notifiedIds.add('bank:' + x.messageId));
        if (Notification.isSupported()) {
            const lines = [];
            if (newPo.length) lines.push(`${newPo.length} new purchase order${newPo.length > 1 ? 's' : ''}`);
            if (newBank.length) lines.push(`${newBank.length} new bank alert${newBank.length > 1 ? 's' : ''}`);
            const n = new Notification({
                title: 'MJS PrimeLogic — Mail',
                body: lines.join(' • '),
                silent: false
            });
            n.on('click', () => {
                const w = BrowserWindow.getAllWindows()[0];
                if (w) { w.show(); w.focus(); w.webContents.send('gmail:open-queue', { target: newPo.length ? 'po' : 'bank' }); }
            });
            n.show();
        }
        broadcast('gmail:queue-updated', { po: newPo.length, bank: newBank.length });
    } catch (e) {
        console.error('[gmailIpc] notify error', e.message);
    }
}

async function runPollOnce() {
    if (pollBusy) return;
    try {
        const st = await auth.status();
        if (!st.isLoggedIn) return;
        pollBusy = true;
        broadcast('gmail:sync-status', { running: true });
        const result = await sync.incrementalSync();
        broadcast('gmail:sync-status', { running: false, lastSyncAt: new Date().toISOString(), result });
        await notifyNewFlagged();
    } catch (e) {
        broadcast('gmail:sync-status', { running: false, error: e.message });
    } finally {
        pollBusy = false;
    }
}

function startPolling(intervalMs = 90_000) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => { void runPollOnce(); }, intervalMs);
    // Kick once shortly after start
    setTimeout(() => { void runPollOnce(); }, 3000);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

function ensureTray() {
    if (tray) return tray;
    try {
        const iconPath = path.join(__dirname, '..', 'icon.png');
        const img = nativeImage.createFromPath(iconPath);
        tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 }));
        tray.setToolTip('MJS PrimeLogic — Mail');
        const menu = Menu.buildFromTemplate([
            { label: 'Show App', click: () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } } },
            { label: 'Sync Now', click: () => { void runPollOnce(); } },
            { type: 'separator' },
            { label: 'Open Mail', click: () => broadcast('gmail:open-view', { view: 'mail' }) },
            { label: 'PO Queue', click: () => broadcast('gmail:open-view', { view: 'poQueue' }) },
            { label: 'Bank Mail', click: () => broadcast('gmail:open-view', { view: 'bankMail' }) }
        ]);
        tray.setContextMenu(menu);
    } catch (e) {
        console.warn('[gmailIpc] tray init skipped:', e.message);
    }
    return tray;
}

function register() {
    // --- Auth ---
    ipcMain.handle('gmail:status', () => safe(() => auth.status()));
    ipcMain.handle('gmail:save-credentials', (_e, creds) => safe(async () => {
        const existing = (await auth.loadCredentials()) || {};
        const merged = { ...existing, ...(creds || {}) };
        if (!merged.client_secret && existing.client_secret) merged.client_secret = existing.client_secret;
        return auth.saveCredentials(merged);
    }));
    ipcMain.handle('gmail:load-credentials', () => safe(async () => {
        const c = await auth.loadCredentials();
        if (!c) return null;
        return { client_id: c.client_id, has_client_secret: !!c.client_secret };
    }));
    ipcMain.handle('gmail:login', () => safe(() => auth.beginLogin()));
    ipcMain.handle('gmail:logout', () => safe(() => auth.logout()));

    // --- Sync ---
    ipcMain.handle('gmail:initial-sync', (_e, opts) => safe(() => sync.initialSync(opts || {})));
    ipcMain.handle('gmail:incremental-sync', () => safe(() => sync.incrementalSync()));
    ipcMain.handle('gmail:get-state', () => safe(() => store.getState()));

    // --- Read ---
    ipcMain.handle('gmail:list', (_e, { labelId = 'INBOX', offset = 0, limit = 50, filter = 'all' } = {}) =>
        safe(async () => {
            try {
                return await store.listLabelPage(labelId, { offset, limit, filter });
            } catch (err) {
                // Belt-and-braces: if the index file is corrupt in a way readJson
                // couldn't recover from, nuke just that index and return empty so
                // the UI doesn't display a raw JSON parse error. Next sync will
                // repopulate it.
                console.error('[gmailIpc] list failed, auto-healing index for', labelId, '-', err.message);
                try { await store.resetIndex(labelId); } catch {}
                return { total: 0, items: [], healed: true };
            }
        }));
    ipcMain.handle('gmail:get-message', (_e, { id, internalDate, ensureFull }) =>
        safe(async () => {
            let m = internalDate ? await store.loadMessage(id, internalDate) : await store.loadMessageAnywhere(id);
            if ((ensureFull !== false) && (!m || m.bodyPending || (!m.bodyHtml && !m.bodyText))) {
                try { m = await sync.ensureFullMessage(id); } catch (e) { console.error('[gmailIpc] ensureFull error:', e.message); }
            }
            return m;
        }));

    // --- Actions ---
    ipcMain.handle('gmail:mark-read', (_e, id) => safe(() => sync.markRead(id)));
    ipcMain.handle('gmail:mark-unread', (_e, id) => safe(() => sync.markUnread(id)));
    ipcMain.handle('gmail:archive', (_e, id) => safe(() => sync.archive(id)));
    ipcMain.handle('gmail:trash', (_e, id) => safe(() => sync.trash(id)));
    ipcMain.handle('gmail:report-spam', (_e, id) => safe(() => sync.reportSpam(id)));

    // --- Attachments ---
    ipcMain.handle('gmail:download-attachment', (_e, { messageId, attachmentId, filename }) =>
        safe(async () => {
            const p = await sync.downloadAttachment(messageId, attachmentId, filename);
            return { path: p };
        }));
    ipcMain.handle('gmail:read-attachment-bytes', (_e, { messageId, attachmentId, filename }) =>
        safe(async () => {
            const p = await sync.downloadAttachment(messageId, attachmentId, filename);
            const bytes = await fs.readFile(p);
            return { path: p, base64: bytes.toString('base64') };
        }));

    // --- Send / Reply ---
    ipcMain.handle('gmail:send', (_e, payload) => safe(() => sync.sendMessage(payload)));

    // --- Queues (PO + Bank) ---
    ipcMain.handle('gmail:queue-list', (_e, name) => safe(() => store.readQueue(name)));
    ipcMain.handle('gmail:queue-update', (_e, { name, messageId, patch }) =>
        safe(async () => {
            await store.updateQueueEntry(name, messageId, patch);
            broadcast('gmail:queue-updated', { updated: { name, messageId, patch } });
        }));
    ipcMain.handle('gmail:queue-remove', (_e, { name, messageId }) => safe(async () => {
        const list = await store.readQueue(name);
        await store.writeQueue(name, list.filter(x => x.messageId !== messageId));
    }));
    ipcMain.handle('gmail:reset-cache', () => safe(async () => {
        await store.resetCache();
        return { ok: true };
    }));
    ipcMain.handle('gmail:enrich-flags', () => safe(async () => sync.enrichNow()));
    ipcMain.handle('gmail:materialize-queues', (_e, opts = {}) => safe(async () => {
        const result = await sync.materializeQueues({
            limit: opts.limit || 60,
            flags: opts.flags || ['po', 'bank'],
            onProgress: (p) => broadcast('gmail:materialize-progress', p)
        });
        broadcast('gmail:queue-updated', { materialized: true, result });
        return result;
    }));
    ipcMain.handle('gmail:reclassify-queue', (_e, { name } = {}) => safe(async () => {
        const r = await sync.reclassifyQueue(name || 'po');
        broadcast('gmail:queue-updated', { reclassified: name, result: r });
        return r;
    }));

    // --- User-taught classification rules ---
    // Teach the classifier: "mails from this sender are always <type>".
    // See gmailSync.classifyAs() — it updates rules, retroactively re-flags
    // the sender's existing mail, adds to queues, and trashes if type=spam.
    ipcMain.handle('gmail:classify-as', (_e, { messageId, type } = {}) => safe(async () => {
        if (!messageId || !type) throw new Error('messageId and type are required');
        const r = await sync.classifyAs(messageId, type);
        broadcast('gmail:queue-updated', { classifiedAs: type, sender: r.sender });
        broadcast('gmail:rules-updated', {});
        return r;
    }));
    ipcMain.handle('gmail:user-rules-list', () => safe(async () => {
        return await store.readUserRules();
    }));
    ipcMain.handle('gmail:user-rule-add', (_e, { type, pattern } = {}) => safe(async () => {
        if (!type || !pattern) throw new Error('type and pattern are required');
        await store.addUserRule(type, pattern);
        // Retroactively flip the flag on existing index entries from this sender
        // so the Mail / PO Queue / Bank Mail views update immediately.
        const retro = await sync.applySenderFlagToIndex(pattern, type).catch(() => null);
        broadcast('gmail:rules-updated', {});
        broadcast('gmail:queue-updated', { ruleAdded: type, pattern });
        return { ok: true, retro };
    }));
    ipcMain.handle('gmail:user-rule-remove', (_e, { type, pattern } = {}) => safe(async () => {
        if (!type || !pattern) throw new Error('type and pattern are required');
        const r = await sync.unlearnRule(type, pattern);
        broadcast('gmail:rules-updated', {});
        return r;
    }));

    // --- Polling control ---
    ipcMain.handle('gmail:polling-start', (_e, interval) => safe(async () => { startPolling(interval || 90_000); return { ok: true }; }));
    ipcMain.handle('gmail:polling-stop', () => safe(async () => { stopPolling(); return { ok: true }; }));
    ipcMain.handle('gmail:sync-now', () => safe(async () => { await runPollOnce(); return { ok: true }; }));
}

function init() {
    console.log('[gmailIpc] init — v3 (sync mutex + index auto-heal + enrichment + user rules)');
    register();
    ensureTray();
    // Auto-start polling if already logged in.
    setTimeout(async () => {
        try {
            const st = await auth.status();
            if (st.isLoggedIn) startPolling(90_000);
        } catch {}
    }, 2000);
}

module.exports = { init, startPolling, stopPolling };
