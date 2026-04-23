// File-based Gmail cache (main process)
// Layout (inside app.getPath('userData')/mail):
//   state.json                    -> { historyId, lastSyncAt, labels: {...} }
//   index/<labelId>.json          -> Array<{id, threadId, internalDate, from, to, subject, snippet, labelIds, hasAttachments, unread, poFlag, bankFlag, newsletterFlag}>
//   messages/<yyyy>/<mm>/<id>.json  -> full normalized message (headers, bodyHtml, bodyText, attachments metadata)
//   attachments/<messageId>/<attachmentId>-<safeName>  -> raw attachment bytes (downloaded on demand)

const { app } = require('electron');
const path = require('path');
const fs = require('fs').promises;

function root() { return path.join(app.getPath('userData'), 'mail'); }
function indexDir() { return path.join(root(), 'index'); }
function messagesDir() { return path.join(root(), 'messages'); }
function attachmentsDir() { return path.join(root(), 'attachments'); }
function statePath() { return path.join(root(), 'state.json'); }
function queuePath(name) { return path.join(root(), `queue_${name}.json`); }
function userRulesPath() { return path.join(root(), 'user_rules.json'); }

async function ensureDirs() {
    await fs.mkdir(root(), { recursive: true });
    await fs.mkdir(indexDir(), { recursive: true });
    await fs.mkdir(messagesDir(), { recursive: true });
    await fs.mkdir(attachmentsDir(), { recursive: true });
}

// Per-file async mutex to serialize read-modify-write operations against the
// same path. Gmail sync runs fetches in parallel, so multiple workers try to
// upsert the same INBOX index at once — without this, the shared .tmp file
// gets interleaved writes and produces a file like `{...}{...}` which then
// fails with "Unexpected non-whitespace character after JSON at position ...".
const _locks = new Map();
async function withLock(key, fn) {
    const prev = _locks.get(key) || Promise.resolve();
    let release;
    const next = new Promise(r => (release = r));
    // Store the *same* chained promise reference we'll compare against later.
    // Using prev.then(...) twice would create two distinct promise objects
    // and the === check below would always fail, leaking _locks entries.
    const chained = prev.then(() => next);
    _locks.set(key, chained);
    try { await prev; return await fn(); }
    finally {
        release();
        if (_locks.get(key) === chained) _locks.delete(key);
    }
}

async function readJson(p, fallback) {
    try {
        const raw = await fs.readFile(p, 'utf8');
        // Defensive: if two writers once corrupted this file (concatenated JSON),
        // try to recover the first document so the UI keeps working instead of
        // showing a fatal "Unexpected non-whitespace character..." error.
        try {
            return JSON.parse(raw);
        } catch (parseErr) {
            const recovered = tryRecoverConcatenatedJson(raw);
            if (recovered !== undefined) {
                console.warn('[gmailStore] recovered corrupt JSON for', p);
                // Repair on disk so subsequent reads are clean.
                try { await fs.writeFile(p, JSON.stringify(recovered), 'utf8'); } catch {}
                return recovered;
            }
            console.error('[gmailStore] unrecoverable JSON at', p, '-', parseErr.message, '- resetting file.');
            try { await fs.writeFile(p, JSON.stringify(fallback ?? null), 'utf8'); } catch {}
            return fallback;
        }
    } catch (e) {
        if (e.code === 'ENOENT') return fallback;
        throw e;
    }
}

// If a file has two (or more) concatenated JSON documents due to a write
// race, parse just the first and discard the rest.
function tryRecoverConcatenatedJson(raw) {
    // Pass 1: find the balanced end of the first top-level document.
    try {
        const first = raw[0];
        if (first === '{' || first === '[') {
            const open = first, close = first === '{' ? '}' : ']';
            let depth = 0, inStr = false, esc = false, end = -1;
            for (let i = 0; i < raw.length; i++) {
                const c = raw[i];
                if (inStr) {
                    if (esc) esc = false;
                    else if (c === '\\') esc = true;
                    else if (c === '"') inStr = false;
                    continue;
                }
                if (c === '"') inStr = true;
                else if (c === open) depth++;
                else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
            }
            if (end > 0) {
                try { return JSON.parse(raw.slice(0, end + 1)); } catch {}
            }
        }
    } catch {}

    // Pass 2: for arrays, walk element-by-element and keep whatever parses
    // successfully as a partial recovery. Cheap: each element's closing
    // bracket is detected via brace balancing, then parsed individually.
    try {
        if (raw[0] === '[') {
            const items = [];
            let i = 1;
            const N = raw.length;
            while (i < N) {
                // skip whitespace/commas
                while (i < N && /[\s,]/.test(raw[i])) i++;
                if (i >= N || raw[i] === ']') break;
                // walk a single value (only objects expected here; any other
                // token signals corruption — stop)
                if (raw[i] !== '{') break;
                let depth = 0, inStr = false, esc = false, end = -1;
                for (let j = i; j < N; j++) {
                    const c = raw[j];
                    if (inStr) {
                        if (esc) esc = false;
                        else if (c === '\\') esc = true;
                        else if (c === '"') inStr = false;
                        continue;
                    }
                    if (c === '"') inStr = true;
                    else if (c === '{') depth++;
                    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
                }
                if (end < 0) break;
                try { items.push(JSON.parse(raw.slice(i, end + 1))); } catch { /* skip bad item */ }
                i = end + 1;
            }
            if (items.length) return items;
        }
    } catch {}

    return undefined;
}

async function writeJson(p, data) {
    // Each write uses a unique tmp name to avoid two parallel writers clobbering
    // the same staging file. The lock above still prevents lost updates for
    // read-modify-write flows.
    const tmp = `${p}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fs.rename(tmp, p);
}

async function getState() {
    await ensureDirs();
    return (await readJson(statePath(), null)) || { historyId: null, lastSyncAt: null, labels: {}, accountEmail: null };
}

async function setState(state) {
    await ensureDirs();
    await writeJson(statePath(), state);
}

function safeName(s) {
    return String(s || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

function messageFilePath(id, internalDate) {
    const d = internalDate ? new Date(Number(internalDate)) : new Date();
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return {
        dir: path.join(messagesDir(), yyyy, mm),
        file: path.join(messagesDir(), yyyy, mm, `${id}.json`)
    };
}

async function saveMessage(normalized) {
    const { dir, file } = messageFilePath(normalized.id, normalized.internalDate);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(file, normalized);
    return file;
}

async function loadMessage(id, internalDate) {
    const { file } = messageFilePath(id, internalDate);
    return readJson(file, null);
}

async function findMessageFile(id) {
    // Walk messages/* if internalDate unknown. Slower fallback only.
    async function walk(dir) {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                const found = await walk(full);
                if (found) return found;
            } else if (e.name === `${id}.json`) {
                return full;
            }
        }
        return null;
    }
    return walk(messagesDir());
}

async function loadMessageAnywhere(id) {
    const file = await findMessageFile(id);
    if (!file) return null;
    return readJson(file, null);
}

async function readIndex(labelId) {
    await ensureDirs();
    return (await readJson(path.join(indexDir(), `${labelId}.json`), null)) || [];
}

async function writeIndex(labelId, list) {
    await ensureDirs();
    await writeJson(path.join(indexDir(), `${labelId}.json`), list);
}

// Upsert an index entry (dedupe by id) and keep sorted by internalDate desc
async function upsertIndexEntry(labelId, entry) {
    const p = path.join(indexDir(), `${labelId}.json`);
    return withLock(p, async () => {
        const list = await readIndex(labelId);
        const i = list.findIndex(x => x.id === entry.id);
        if (i >= 0) list[i] = { ...list[i], ...entry };
        else list.push(entry);
        list.sort((a, b) => Number(b.internalDate || 0) - Number(a.internalDate || 0));
        await writeIndex(labelId, list);
    });
}

async function removeFromIndex(labelId, id) {
    const p = path.join(indexDir(), `${labelId}.json`);
    return withLock(p, async () => {
        const list = await readIndex(labelId);
        const next = list.filter(x => x.id !== id);
        if (next.length !== list.length) await writeIndex(labelId, next);
    });
}

// Bulk-set a boolean flag on index entries whose id is in `ids`, and
// optionally clear it on entries outside the set when `clearOthers` is true.
// Used by the post-sync enrichment pass (has:attachment, is:unread, PO subject query).
async function setIndexFlag(labelId, flagName, ids, { clearOthers = false } = {}) {
    const p = path.join(indexDir(), `${labelId}.json`);
    return withLock(p, async () => {
        const list = await readIndex(labelId);
        const set = ids instanceof Set ? ids : new Set(ids || []);
        let changed = 0;
        for (const entry of list) {
            const want = set.has(entry.id);
            if (want && entry[flagName] !== true) { entry[flagName] = true; changed++; }
            else if (!want && clearOthers && entry[flagName] === true) { entry[flagName] = false; changed++; }
        }
        if (changed) await writeIndex(labelId, list);
        return changed;
    });
}

// Atomically clear a boolean flag on every index entry for which
// `predicate(entry)` returns truthy. Mirrors setIndexFlag's locking
// discipline so concurrent syncs can't lose writes to this file. Used
// by unlearnRule() when a user removes a learned sender rule and we
// need to flip that type's flag back off across existing mails.
//
// `predicate` is called inside the lock on the freshly-read list, so
// callers get a consistent snapshot (no stale read/write window).
async function clearIndexFlagWhere(labelId, flagName, predicate) {
    const p = path.join(indexDir(), `${labelId}.json`);
    return withLock(p, async () => {
        const list = await readIndex(labelId);
        let changed = 0;
        for (const entry of list) {
            if (!entry || entry[flagName] !== true) continue;
            let match = false;
            try { match = !!predicate(entry); } catch { match = false; }
            if (match) { entry[flagName] = false; changed++; }
        }
        if (changed) await writeIndex(labelId, list);
        return changed;
    });
}

async function listLabelPage(labelId, { offset = 0, limit = 50, filter = 'all' } = {}) {
    const list = await readIndex(labelId);
    let filtered = list;
    if (filter === 'unread') filtered = list.filter(m => m.unread);
    else if (filter === 'po') filtered = list.filter(m => m.poFlag);
    else if (filter === 'bank') filtered = list.filter(m => m.bankFlag);
    else if (filter === 'attachments') filtered = list.filter(m => m.hasAttachments);
    return {
        total: filtered.length,
        items: filtered.slice(offset, offset + limit)
    };
}

async function saveAttachmentBytes(messageId, attachmentId, filename, bytes) {
    const dir = path.join(attachmentsDir(), messageId);
    await fs.mkdir(dir, { recursive: true });
    const out = path.join(dir, `${safeName(attachmentId)}-${safeName(filename)}`);
    await fs.writeFile(out, bytes);
    return out;
}

async function getAttachmentLocalPath(messageId, attachmentId, filename) {
    const dir = path.join(attachmentsDir(), messageId);
    const out = path.join(dir, `${safeName(attachmentId)}-${safeName(filename)}`);
    try { await fs.access(out); return out; } catch { return null; }
}

// Queues for classified items (PO / bank) so renderer can list them instantly.
async function readQueue(name) {
    return (await readJson(queuePath(name), null)) || [];
}
async function writeQueue(name, list) { await writeJson(queuePath(name), list); }
async function addToQueue(name, entry) {
    const p = queuePath(name);
    return withLock(p, async () => {
        const list = await readQueue(name);
        if (!list.some(x => x.messageId === entry.messageId)) {
            list.unshift(entry);
            await writeQueue(name, list.slice(0, 5000));
        }
    });
}
async function updateQueueEntry(name, messageId, patch) {
    const p = queuePath(name);
    return withLock(p, async () => {
        const list = await readQueue(name);
        const mid = (messageId == null ? '' : String(messageId)).trim();
        const i = list.findIndex(x => (x.messageId == null ? '' : String(x.messageId)).trim() === mid);
        if (i >= 0) {
            list[i] = { ...list[i], ...patch };
            await writeQueue(name, list);
        }
    });
}

async function resetCache() {
    try { await fs.rm(root(), { recursive: true, force: true }); } catch {}
    await ensureDirs();
    return { ok: true };
}

async function resetIndex(labelId) {
    const p = path.join(indexDir(), `${labelId}.json`);
    try { await fs.unlink(p); } catch {}
    // Force-reset state historyId too so the next sync does a clean full pull.
    try {
        const st = await getState();
        st.historyId = null;
        await setState(st);
    } catch {}
    return { ok: true };
}

// ── User-taught classification rules ──────────────────────────────────────
// Shape: { spam: { senders: [...] }, bank: { senders: [...] }, po: { senders: [...] }, updatedAt }
// A sender entry is either an exact "from" address (case-insensitive) or a
// domain pattern starting with "@" that matches any address in that domain.
const RULE_TYPES = ['spam', 'bank', 'po'];

function emptyRules() {
    return {
        spam: { senders: [] },
        bank: { senders: [] },
        po: { senders: [] },
        updatedAt: null
    };
}

async function readUserRules() {
    const r = await readJson(userRulesPath(), null);
    if (!r || typeof r !== 'object') return emptyRules();
    const out = emptyRules();
    for (const t of RULE_TYPES) {
        if (r[t] && Array.isArray(r[t].senders)) {
            out[t].senders = Array.from(new Set(
                r[t].senders.filter(Boolean).map(s => String(s).trim().toLowerCase())
            ));
        }
    }
    out.updatedAt = r.updatedAt || null;
    return out;
}

async function writeUserRules(rules) {
    return withLock(userRulesPath(), async () => {
        const safe = emptyRules();
        for (const t of RULE_TYPES) {
            if (rules && rules[t] && Array.isArray(rules[t].senders)) {
                safe[t].senders = Array.from(new Set(
                    rules[t].senders.filter(Boolean).map(s => String(s).trim().toLowerCase())
                ));
            }
        }
        safe.updatedAt = new Date().toISOString();
        await writeJson(userRulesPath(), safe);
        return safe;
    });
}

// Normalise a "From" header / email token to a comparable form.
// Accepts  '"Foo Bar" <foo@bar.com>'  or  'foo@BAR.com'.
function normaliseSender(from) {
    if (!from) return '';
    const s = String(from).trim().toLowerCase();
    const m = s.match(/<([^>]+)>/);
    return (m ? m[1] : s).trim();
}

// Does `from` match any pattern in `patterns`?
// Patterns starting with "@" are domain suffixes; otherwise exact email match.
function senderMatchesAny(from, patterns) {
    if (!from || !patterns || !patterns.length) return false;
    const addr = normaliseSender(from);
    const domain = addr.includes('@') ? '@' + addr.split('@').pop() : '';
    for (const p of patterns) {
        const pat = String(p || '').trim().toLowerCase();
        if (!pat) continue;
        if (pat.startsWith('@')) {
            if (domain && domain.endsWith(pat)) return true;
        } else {
            if (addr === pat) return true;
        }
    }
    return false;
}

async function addUserRule(type, rawPattern) {
    if (!RULE_TYPES.includes(type)) throw new Error('Unknown rule type: ' + type);
    const pattern = normaliseSender(rawPattern);
    if (!pattern) throw new Error('Empty sender pattern');
    const rules = await readUserRules();
    if (!rules[type].senders.includes(pattern)) {
        rules[type].senders.push(pattern);
    }
    // Marking a sender as PO/bank implicitly un-marks it as spam, and v.v.,
    // so the user's most recent choice wins instead of the sender living in
    // two buckets at once.
    for (const other of RULE_TYPES) {
        if (other === type) continue;
        rules[other].senders = rules[other].senders.filter(s => s !== pattern);
    }
    return writeUserRules(rules);
}

async function removeUserRule(type, rawPattern) {
    if (!RULE_TYPES.includes(type)) throw new Error('Unknown rule type: ' + type);
    const pattern = normaliseSender(rawPattern);
    const rules = await readUserRules();
    rules[type].senders = rules[type].senders.filter(s => s !== pattern);
    return writeUserRules(rules);
}

module.exports = {
    root, ensureDirs,
    getState, setState,
    saveMessage, loadMessage, loadMessageAnywhere,
    readIndex, writeIndex, upsertIndexEntry, removeFromIndex, setIndexFlag, clearIndexFlagWhere, listLabelPage,
    saveAttachmentBytes, getAttachmentLocalPath,
    readQueue, writeQueue, addToQueue, updateQueueEntry,
    resetCache, resetIndex,
    readUserRules, writeUserRules, addUserRule, removeUserRule,
    senderMatchesAny, normaliseSender
};
