/**
 * ragIpcMain.js — LanceDB in Electron main process (optional)
 */
const path = require('path');
const fs = require('fs').promises;

let _lanceDb = null;
let _lanceConnect = null;
let _db = null;
let _ragDir = null;
let _backend = 'none';

const COLLECTIONS = ['employees', 'attendance', 'payroll', 'customers', 'invoices', 'vouchers', 'tasks', 'documents'];

function _dot(a, b) {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
}

async function _loadJsonFallback(collection) {
    const fp = path.join(_ragDir, collection + '.json');
    try {
        const raw = await fs.readFile(fp, 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return [];
    }
}

async function _saveJsonFallback(collection, rows) {
    await fs.mkdir(_ragDir, { recursive: true });
    const fp = path.join(_ragDir, collection + '.json');
    await fs.writeFile(fp, JSON.stringify(rows), 'utf8');
}

async function initRagIpc(ipcMain, dataFolder) {
    _ragDir = path.join(dataFolder, 'ai-rag');
    try {
        _lanceDb = require('@lancedb/lancedb');
        await fs.mkdir(_ragDir, { recursive: true });
        _db = await _lanceDb.connect(_ragDir);
        _backend = 'lancedb';
        console.log('[RAG IPC] LanceDB connected at', _ragDir);
    } catch (e) {
        _backend = 'json';
        console.warn('[RAG IPC] LanceDB unavailable, JSON fallback:', e && e.message);
        await fs.mkdir(_ragDir, { recursive: true });
    }

    ipcMain.handle('rag:status', async () => ({
        ok: true,
        backend: _backend,
        path: _ragDir
    }));

    ipcMain.handle('rag:upsert', async (_evt, { collection, records }) => {
        if (!collection || !records) return { ok: false, error: 'Missing args' };
        if (_backend === 'lancedb' && _db) {
            try {
                const tblName = 'rag_' + collection;
                let tbl;
                const names = await _db.tableNames();
                if (names.includes(tblName)) {
                    tbl = await _db.openTable(tblName);
                    await tbl.add(records);
                } else {
                    tbl = await _db.createTable(tblName, records);
                }
                return { ok: true, count: records.length, backend: 'lancedb' };
            } catch (e) {
                console.warn('[RAG IPC] Lance upsert failed', e && e.message);
            }
        }
        const existing = await _loadJsonFallback(collection);
        const byId = {};
        existing.forEach((r) => { if (r.id) byId[r.id] = r; });
        records.forEach((r) => { if (r.id) byId[r.id] = r; });
        const merged = Object.values(byId);
        await _saveJsonFallback(collection, merged);
        return { ok: true, count: records.length, backend: 'json' };
    });

    ipcMain.handle('rag:search', async (_evt, { collection, vector, limit }) => {
        limit = limit || 5;
        if (_backend === 'lancedb' && _db) {
            try {
                const tblName = 'rag_' + collection;
                const names = await _db.tableNames();
                if (names.includes(tblName)) {
                    const tbl = await _db.openTable(tblName);
                    const q = await tbl.search(vector).limit(limit).toArray();
                    return { ok: true, rows: q };
                }
            } catch (e) {
                console.warn('[RAG IPC] Lance search failed', e && e.message);
            }
        }
        const rows = await _loadJsonFallback(collection);
        const scored = rows
            .map((r) => ({ row: r, score: r.vector ? _dot(vector, r.vector) : 0 }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((x) => Object.assign({}, x.row, { _score: x.score }));
        return { ok: true, rows: scored };
    });

    ipcMain.handle('rag:clear', async (_evt, { collection }) => {
        if (_backend === 'lancedb' && _db) {
            try {
                const tblName = 'rag_' + collection;
                await _db.dropTable(tblName);
            } catch (_) { /* ignore */ }
        }
        await _saveJsonFallback(collection, []);
        return { ok: true };
    });
}

module.exports = { initRagIpc, COLLECTIONS };
