// Gmail sync engine (main process)
// - Initial sync: list by label (INBOX, SENT, etc.), page through, fetch metadata+full per message.
// - Incremental: users.history.list(startHistoryId).
// - Attachments: on demand only.

const auth = require('./gmailAuth');
const store = require('./gmailStore');
const rules = require('./gmailRules');

const TRACKED_LABELS = ['INBOX', 'SENT'];
const EXCLUDE_QUERY = '-in:spam -in:trash';

// Global sync mutex: ensures initialSync, incrementalSync, and enrichment
// never overlap. Without this, a polling tick that lands during a manual
// sync can cause concurrent read-modify-write on the index files and
// produce a file like `[...][...]` that breaks JSON.parse at a fixed offset.
let _syncRunning = null;
async function withSyncLock(label, fn) {
    if (_syncRunning) {
        console.log(`[gmailSync] ${label} deferred — waiting on previous sync`);
        await _syncRunning.catch(() => {});
    }
    const p = (async () => fn())();
    _syncRunning = p.finally(() => { if (_syncRunning === p) _syncRunning = null; });
    return p;
}

console.log('[gmailSync] module loaded — metadata-only init + retries + enrichment ready');
// Keep parallelism small. When we pushed this to 10 for large "full" fetches,
// the googleapis client would intermittently return a duplicated response
// body — JSON.parse then fails at a fixed byte offset ("position 835784").
// Metadata-only fetches are small and work fine at this level.
const PARALLEL_FETCH = 4;

// Wrap gmail.users.messages.get so a transient response-body duplication
// (seen under concurrent "full" fetches in @googleapis/gmail) is retried
// serially with a tiny backoff instead of silently dropping the message.
async function messagesGet(gmail, params) {
    const attempts = [0, 150, 500]; // ms delays before attempts
    let lastErr;
    for (let i = 0; i < attempts.length; i++) {
        if (attempts[i]) await new Promise(r => setTimeout(r, attempts[i]));
        try { return await gmail.users.messages.get(params); }
        catch (e) {
            lastErr = e;
            const msg = String(e && e.message || '');
            // Only retry for parse-style failures; for 404s / auth errors bail immediately.
            if (!/Unexpected\s+(non-whitespace|token|end)/i.test(msg) && !/JSON/i.test(msg)) break;
        }
    }
    throw lastErr;
}

function getHeader(headers, name) {
    const h = (headers || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
}

function collectAttachmentsMeta(payload, acc = []) {
    if (!payload) return acc;
    if (payload.filename && payload.body && payload.body.attachmentId) {
        acc.push({
            filename: payload.filename,
            mimeType: payload.mimeType,
            size: payload.body.size || 0,
            attachmentId: payload.body.attachmentId,
            partId: payload.partId
        });
    }
    (payload.parts || []).forEach(p => collectAttachmentsMeta(p, acc));
    return acc;
}

function decodeBody(data) {
    if (!data) return '';
    const b64 = String(data).replace(/-/g, '+').replace(/_/g, '/');
    try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return ''; }
}

function extractBodies(payload, out = { html: '', text: '' }) {
    if (!payload) return out;
    const mt = (payload.mimeType || '').toLowerCase();
    if (mt === 'text/html' && payload.body && payload.body.data) out.html += decodeBody(payload.body.data);
    else if (mt === 'text/plain' && payload.body && payload.body.data) out.text += decodeBody(payload.body.data);
    (payload.parts || []).forEach(p => extractBodies(p, out));
    return out;
}

function normalizeMessage(msg) {
    const headers = (msg.payload && msg.payload.headers) || [];
    const attachments = collectAttachmentsMeta(msg.payload);
    const bodies = extractBodies(msg.payload);
    const from = getHeader(headers, 'From');
    const to = getHeader(headers, 'To');
    const cc = getHeader(headers, 'Cc');
    const subject = getHeader(headers, 'Subject');
    const messageIdHeader = getHeader(headers, 'Message-ID') || getHeader(headers, 'Message-Id');
    const references = getHeader(headers, 'References');
    const inReplyTo = getHeader(headers, 'In-Reply-To');
    return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds || [],
        internalDate: msg.internalDate,
        snippet: msg.snippet || '',
        historyId: msg.historyId,
        sizeEstimate: msg.sizeEstimate,
        headers: headers.map(h => ({ name: h.name, value: h.value })),
        from, to, cc, subject,
        messageIdHeader, references, inReplyTo,
        bodyHtml: bodies.html,
        bodyText: bodies.text,
        attachments
    };
}

function indexEntryFromNormalized(norm, flags, { metadataOnly = false } = {}) {
    const entry = {
        id: norm.id,
        threadId: norm.threadId,
        internalDate: norm.internalDate,
        from: norm.from,
        to: norm.to,
        subject: norm.subject,
        snippet: norm.snippet,
        labelIds: norm.labelIds,
        unread: (norm.labelIds || []).includes('UNREAD'),
        newsletterFlag: !!(flags && flags.newsletterFlag),
        spamFlag: !!(flags && flags.spamFlag)
    };
    // When we only have metadata, don't OVERWRITE flags that the enrichment
    // pass (or an earlier full-body fetch) may have already set to true.
    // Only set the flag positively when we have real evidence.
    if (!metadataOnly || (norm.attachments || []).length > 0) {
        entry.hasAttachments = (norm.attachments || []).length > 0;
    }
    if (!metadataOnly || (flags && flags.poFlag)) {
        entry.poFlag = !!(flags && flags.poFlag);
    }
    if (!metadataOnly || (flags && flags.bankFlag)) {
        entry.bankFlag = !!(flags && flags.bankFlag);
    }
    return entry;
}

// Fetch + normalize + index + classify.
// format: 'metadata' (fast, no body/attachments) or 'full' (complete).
// When metadata-only, we store a lightweight record with bodyTextPending=true.
async function upsertMessage(gmail, id, { format = 'full', labelIds = null } = {}) {
    const params = { userId: 'me', id, format };
    if (format === 'metadata') {
        params.metadataHeaders = ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'Message-Id', 'References', 'In-Reply-To', 'List-Unsubscribe'];
    }
    const { data } = await messagesGet(gmail, params);
    const norm = normalizeMessage(data);
    if (format === 'metadata') {
        norm.bodyPending = true; // mark so the renderer knows to re-request full on open
    }
    await store.saveMessage(norm);

    const userRules = await store.readUserRules().catch(() => null);
    const flags = rules.classify({
        headers: norm.headers,
        snippet: norm.snippet,
        bodyText: norm.bodyText || norm.bodyHtml || '',
        attachments: norm.attachments
    }, userRules);

    const entry = indexEntryFromNormalized(norm, flags, { metadataOnly: format === 'metadata' });
    const labels = labelIds || norm.labelIds || [];
    for (const lbl of TRACKED_LABELS) {
        if (labels.includes(lbl)) {
            await store.upsertIndexEntry(lbl, entry);
        } else {
            await store.removeFromIndex(lbl, id);
        }
    }

    if (flags.poFlag) {
        await store.addToQueue('po', {
            messageId: norm.id,
            threadId: norm.threadId,
            receivedAt: norm.internalDate,
            from: norm.from,
            subject: norm.subject,
            hints: flags.poHints,
            linkedInvoices: [],
            linkedInvoiceId: null, // legacy (kept for backward compatibility)
            totalQty: null,
            status: 'new'
        });
    }
    if (flags.bankFlag) {
        await store.addToQueue('bank', {
            messageId: norm.id,
            threadId: norm.threadId,
            receivedAt: norm.internalDate,
            from: norm.from,
            subject: norm.subject,
            txn: flags.bankTxn,
            linkedVoucherId: null,
            status: 'new'
        });
    }

    return { norm, flags, entry };
}

// Because metadata-format fetches give us no parts / no body, Gmail-side
// search queries let us stamp index flags without downloading bodies.
// For each query we only page through IDs (not bodies) then set the flag.
// NOTE: these queries only *candidate* a message for a flag. The real yes/no
// call happens in rules.classify() during materialization when we have the
// full body. We deliberately keep the PO query narrow: `subject:PO` alone
// was flagging marketing mails ("PODCAST", "post-order survey", etc.) —
// `subject:"purchase order"` is far safer and real POs almost always say so.
// Bank senders — a big OR-list of the domains + popular payment services.
// Gmail's `from:` operator matches a substring of the sender address, so
// `from:hdfcbank` matches `alerts@hdfcbank.net` etc.
const BANK_FROM_OR = [
    // private banks
    'hdfcbank', 'icicibank', 'axisbank', 'kotak', 'yesbank',
    'idfcfirstbank', 'rblbank', 'indusind', 'federalbank',
    'csb.co.in', 'dcbbank', 'bandhanbank', 'southindianbank', 'karnatakabank',
    // public-sector
    'sbi.co.in', 'onlinesbi', 'alerts.sbi',
    'pnb.co.in', 'pnbindia',
    'canarabank', 'bankofbaroda', 'bankofindia',
    'unionbankofindia', 'idbi.co.in', 'idbibank',
    'centralbankofindia', 'ucobank', 'indianbank.in', 'iobnet',
    'bankofmaharashtra',
    // foreign
    'citi.com', 'citibank', 'standardchartered', 'sc.com',
    'hsbc.co.in', 'hsbc.com', 'dbs.com',
    'americanexpress', 'aexp.com',
    // SFB / co-op
    'aubank.in', 'equitasbank', 'suryodaybank', 'ujjivansfb',
    // payment services
    'paytm', 'phonepe', 'amazonpay', 'razorpay', 'cashfree',
    'payu.in', 'payumoney', 'mobikwik', 'freecharge', 'juspay'
].map(d => `from:${d}`).join(' OR ');

const BANK_TXN_KEYWORDS = '(credited OR debited OR "credit alert" OR "debit alert" OR UPI OR "transaction alert" OR "txn alert")';

const ENRICHMENT_QUERIES = [
    { flag: 'hasAttachments', q: 'has:attachment',                                                    clearOthers: true },
    { flag: 'unread',         q: 'is:unread',                                                         clearOthers: true },
    { flag: 'poFlag',         q: 'subject:"purchase order" OR subject:"PO No" OR subject:"PO#" OR filename:"purchase order"', clearOthers: false },
    // Primary: any known bank/payment sender + any transaction keyword.
    { flag: 'bankFlag',       q: `(${BANK_FROM_OR}) AND ${BANK_TXN_KEYWORDS}`,                        clearOthers: false },
    // Fallback: unknown sender but the subject itself is clearly a txn alert.
    // Scoped to last 6 months to keep the query fast & relevant.
    { flag: 'bankFlag',       q: '(subject:"credited" OR subject:"debited" OR subject:"transaction alert" OR subject:"UPI alert" OR subject:"payment received" OR subject:"payment successful" OR subject:"bank alert") newer_than:180d', clearOthers: false }
];

async function listIdsForQuery(gmail, labelId, q) {
    const ids = new Set();
    let pageToken = null;
    let pages = 0;
    do {
        const { data } = await gmail.users.messages.list({
            userId: 'me',
            labelIds: [labelId],
            q: `${q} ${EXCLUDE_QUERY}`,
            maxResults: 500,
            pageToken: pageToken || undefined
        });
        (data.messages || []).forEach(m => ids.add(m.id));
        pageToken = data.nextPageToken;
        pages++;
    } while (pageToken && pages < 10); // hard cap: up to ~5000 ids per flag
    return ids;
}

async function enrichIndexFlags(gmail, labels = TRACKED_LABELS) {
    for (const label of labels) {
        for (const { flag, q, clearOthers } of ENRICHMENT_QUERIES) {
            try {
                const ids = await listIdsForQuery(gmail, label, q);
                await store.setIndexFlag(label, flag, ids, { clearOthers });
                console.log(`[gmailSync] enrich ${label}/${flag}: ${ids.size} candidates (q=${q.slice(0, 80)}${q.length > 80 ? '…' : ''})`);
            } catch (e) {
                console.error(`[gmailSync] enrichment ${flag} (${label}) failed:`, e.message);
            }
        }
    }
}

// Small batch-parallel runner
async function runInBatches(items, worker, concurrency = PARALLEL_FETCH) {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
            const idx = cursor++;
            try { await worker(items[idx], idx); } catch (e) { /* handled inside worker */ }
        }
    });
    await Promise.all(runners);
}

async function initialSync(opts = {}) {
    return withSyncLock('initialSync', () => _initialSync(opts));
}

async function _initialSync({ maxPerLabel = 300, onProgress } = {}) {
    const gmail = await auth.getGmail();
    const state = await store.getState();
    let latestHistoryId = null;

    for (const label of TRACKED_LABELS) {
        // Step A: page through ids quickly
        const ids = [];
        let pageToken = null;
        do {
            const { data } = await gmail.users.messages.list({
                userId: 'me',
                labelIds: [label],
                q: EXCLUDE_QUERY,
                maxResults: Math.min(500, maxPerLabel - ids.length),
                pageToken: pageToken || undefined
            });
            (data.messages || []).forEach(m => ids.push(m.id));
            pageToken = data.nextPageToken;
            if (ids.length >= maxPerLabel) break;
        } while (pageToken);

        // Step B: fetch metadata in parallel.
        // We deliberately skip re-fetching as 'full' here; that caused the
        // gmail client to return duplicated response bodies under concurrency
        // ("Unexpected non-whitespace character after JSON at position ...").
        // Full body (and precise PO / bank classification) is fetched lazily
        // when the user opens a message — see ensureFullMessage below.
        let done = 0;
        await runInBatches(ids, async (id) => {
            try {
                const { norm: meta } = await upsertMessage(gmail, id, { format: 'metadata' });
                if (!latestHistoryId || Number(meta.historyId) > Number(latestHistoryId)) {
                    latestHistoryId = meta.historyId;
                }
            } catch (e) {
                console.error('[gmailSync] metadata fetch error', id, e.message);
            } finally {
                done++;
                if (onProgress) onProgress({ label, fetched: done, total: ids.length });
            }
        });
    }

    // Save profile email + historyId
    try {
        const { data: profile } = await gmail.users.getProfile({ userId: 'me' });
        state.accountEmail = profile.emailAddress || state.accountEmail;
        if (profile.historyId) latestHistoryId = profile.historyId;
    } catch {}

    // Stamp flags (hasAttachments, PO, Bank, Unread) using Gmail-side queries —
    // metadata-only sync can't detect these from the payload alone.
    try { await enrichIndexFlags(gmail); } catch (e) { console.error('[gmailSync] enrich failed:', e.message); }

    state.historyId = latestHistoryId;
    state.lastSyncAt = new Date().toISOString();
    await store.setState(state);
    return { ok: true, historyId: latestHistoryId };
}

async function incrementalSync(opts = {}) {
    return withSyncLock('incrementalSync', () => _incrementalSync(opts));
}

async function _incrementalSync({ onProgress } = {}) {
    const gmail = await auth.getGmail();
    const state = await store.getState();
    if (!state.historyId) return _initialSync({ onProgress });

    let pageToken = null;
    let startHistoryId = state.historyId;
    let latest = startHistoryId;
    const touched = new Set();

    try {
        do {
            const { data } = await gmail.users.history.list({
                userId: 'me',
                startHistoryId: String(startHistoryId),
                historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
                pageToken: pageToken || undefined
            });
            if (data.historyId) latest = data.historyId;
            const hist = data.history || [];
            for (const h of hist) {
                (h.messagesAdded || []).forEach(x => touched.add(x.message.id));
                (h.messagesDeleted || []).forEach(x => touched.add(x.message.id));
                (h.labelsAdded || []).forEach(x => touched.add(x.message.id));
                (h.labelsRemoved || []).forEach(x => touched.add(x.message.id));
            }
            pageToken = data.nextPageToken;
        } while (pageToken);
    } catch (e) {
        // 404 means historyId too old. Fall back to resync.
        if (e.code === 404 || (e.errors && e.errors[0] && e.errors[0].reason === 'notFound')) {
            console.warn('[gmailSync] history expired; doing initial resync');
            return initialSync({ onProgress });
        }
        throw e;
    }

    let n = 0;
    const ids = Array.from(touched);
    await runInBatches(ids, async (id) => {
        try {
            await upsertMessage(gmail, id, { format: 'metadata' });
        } catch (e) {
            if (e.code === 404) {
                for (const lbl of TRACKED_LABELS) await store.removeFromIndex(lbl, id);
            } else {
                console.error('[gmailSync] incr fetch error', id, e.message);
            }
        } finally {
            n++;
            if (onProgress) onProgress({ processed: n, total: ids.length });
        }
    });

    // Re-stamp flags after any churn so new mail ends up in the right filter.
    if (ids.length > 0) {
        try { await enrichIndexFlags(gmail); } catch (e) { console.error('[gmailSync] enrich failed:', e.message); }
    }

    state.historyId = latest;
    state.lastSyncAt = new Date().toISOString();
    await store.setState(state);
    return { ok: true, processed: n, historyId: latest };
}

async function downloadAttachment(messageId, attachmentId, filename) {
    const cached = await store.getAttachmentLocalPath(messageId, attachmentId, filename);
    if (cached) return cached;
    const gmail = await auth.getGmail();
    const { data } = await gmail.users.messages.attachments.get({
        userId: 'me', messageId, id: attachmentId
    });
    const b64 = String(data.data || '').replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Buffer.from(b64, 'base64');
    return store.saveAttachmentBytes(messageId, attachmentId, filename, bytes);
}

async function modifyLabels(messageId, { add = [], remove = [] } = {}) {
    const gmail = await auth.getGmail();
    await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds: add, removeLabelIds: remove }
    });
    // Update local copy
    try { await upsertMessage(gmail, messageId); } catch {}
    return { ok: true };
}

async function markRead(messageId) { return modifyLabels(messageId, { remove: ['UNREAD'] }); }
async function markUnread(messageId) { return modifyLabels(messageId, { add: ['UNREAD'] }); }
async function archive(messageId) { return modifyLabels(messageId, { remove: ['INBOX'] }); }
async function trash(messageId) {
    const gmail = await auth.getGmail();
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    for (const lbl of TRACKED_LABELS) await store.removeFromIndex(lbl, messageId);
    return { ok: true };
}
async function reportSpam(messageId) { return modifyLabels(messageId, { add: ['SPAM'], remove: ['INBOX'] }); }

// Strip CR / LF and other control chars that would terminate the current
// header and let a caller inject extra RFC-822 headers (classic "email
// header injection"). Applied to *every* value we interpolate into a
// header line in buildRawRfc822 below.
//
// Attack surface: `inReplyTo` and `references` come from a received
// message's own headers (attacker-controllable), and `subject` / `to` /
// `cc` come from user input or prefilled Reply state that was derived
// from such headers. Without this, a sender could slip in extra Bcc:,
// From:, or arbitrary mail-routing headers when the user hits Reply.
//
// U+0000..U+001F and U+007F are all stripped. Returning a string that may
// still contain non-ASCII chars is fine for Gmail's `messages.send` raw
// upload — the caller UTF-8 encodes the whole payload.
function sanitizeHeaderValue(v) {
    if (v == null) return '';
    // eslint-disable-next-line no-control-regex
    return String(v).replace(/[\r\n\u0000-\u001F\u007F]+/g, ' ').trim();
}

// Quoted-string values inside headers (name="…", filename="…", boundary="…")
// additionally must not contain a double-quote or a backslash.
function sanitizeQuotedHeaderValue(v) {
    return sanitizeHeaderValue(v).replace(/["\\]+/g, '_');
}

function buildRawRfc822({ from, to, cc, subject, html, text, inReplyTo, references, attachments }) {
    // attachments: [{filename, mimeType, contentBase64}]
    const boundaryMixed = '----mjs-mixed-' + Date.now().toString(36);
    const boundaryAlt = '----mjs-alt-' + Date.now().toString(36);

    // Every interpolated value below is sanitized to prevent CR/LF header
    // injection — see sanitizeHeaderValue() for the threat model.
    const safeFrom = sanitizeHeaderValue(from);
    const safeTo = sanitizeHeaderValue(to);
    const safeCc = sanitizeHeaderValue(cc);
    const safeSubject = sanitizeHeaderValue(subject);
    const safeInReplyTo = sanitizeHeaderValue(inReplyTo);
    const safeReferences = sanitizeHeaderValue(references);

    const headers = [];
    if (safeFrom) headers.push(`From: ${safeFrom}`);
    if (safeTo) headers.push(`To: ${safeTo}`);
    if (safeCc) headers.push(`Cc: ${safeCc}`);
    headers.push(`Subject: ${safeSubject}`);
    if (safeInReplyTo) headers.push(`In-Reply-To: ${safeInReplyTo}`);
    if (safeReferences) headers.push(`References: ${safeReferences}`);
    headers.push('MIME-Version: 1.0');

    const hasAttach = attachments && attachments.length;
    if (hasAttach) headers.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    else headers.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);

    const parts = [];
    const altParts = [
        `--${boundaryAlt}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        text || (html ? html.replace(/<[^>]+>/g, '') : ''),
        `--${boundaryAlt}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        html || (text || ''),
        `--${boundaryAlt}--`
    ];

    if (hasAttach) {
        parts.push(
            `--${boundaryMixed}`,
            `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
            '',
            altParts.join('\r\n')
        );
        for (const a of attachments) {
            // `''.match(/.{1,76}/g)` returns null, so guard against empty or
            // missing base64 payloads — otherwise sending any mail with such
            // an attachment throws "Cannot read properties of null (reading
            // 'join')" and the whole send aborts.
            const b64 = a.contentBase64 || '';
            const body = b64 ? (b64.match(/.{1,76}/g) || []).join('\r\n') : '';
            // Filenames and mime types are inlined into quoted header params,
            // so they must be sanitized for CR/LF *and* for the quote char.
            const safeName = sanitizeQuotedHeaderValue(a.filename);
            const safeMime = sanitizeQuotedHeaderValue(a.mimeType || 'application/octet-stream');
            parts.push(
                `--${boundaryMixed}`,
                `Content-Type: ${safeMime}; name="${safeName}"`,
                `Content-Disposition: attachment; filename="${safeName}"`,
                'Content-Transfer-Encoding: base64',
                '',
                body
            );
        }
        parts.push(`--${boundaryMixed}--`);
    } else {
        parts.push(altParts.join('\r\n'));
    }

    return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

async function sendMessage({ to, cc, subject, html, text, attachments, threadId, replyTo }) {
    const gmail = await auth.getGmail();
    const state = await store.getState();
    const from = state.accountEmail ? state.accountEmail : undefined;

    let inReplyTo, references;
    if (replyTo && replyTo.messageIdHeader) {
        inReplyTo = replyTo.messageIdHeader;
        references = [replyTo.references || '', replyTo.messageIdHeader].filter(Boolean).join(' ');
    }

    const raw = buildRawRfc822({ from, to, cc, subject, html, text, inReplyTo, references, attachments });
    const encoded = Buffer.from(raw, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded, threadId: threadId || undefined }
    });
    // refresh sent index
    try { await upsertMessage(gmail, data.id); } catch {}
    return { success: true, id: data.id, threadId: data.threadId };
}

async function ensureFullMessage(id) {
    const gmail = await auth.getGmail();
    const { norm } = await upsertMessage(gmail, id, { format: 'full' });
    return norm;
}

async function enrichNow() {
    return withSyncLock('enrich', async () => {
        const gmail = await auth.getGmail();
        await enrichIndexFlags(gmail);
        return { ok: true };
    });
}

// Walk existing queue entries and drop any whose full body no longer passes
// the (tightened) classifier. Used to cleanly purge false positives built
// up under older, looser rules — e.g. "Order ID" replacement emails that
// were wrongly flagged as Purchase Orders.
async function reclassifyQueue(queueName) {
    const flagField = queueName === 'po' ? 'poFlag' : 'bankFlag';
    const list = await store.readQueue(queueName);
    if (!list.length) return { kept: 0, dropped: 0 };
    const kept = [];
    let dropped = 0;
    const userRules = await store.readUserRules().catch(() => null);
    for (const entry of list) {
        let msg = null;
        try { msg = await store.loadMessageAnywhere(entry.messageId); } catch {}
        // If we have a stored body, re-run classifier. If we don't (metadata
        // only), trust the current entry — we can't be sure it's wrong.
        if (msg && (msg.bodyText || msg.bodyHtml || (msg.attachments && msg.attachments.length))) {
            const flags = rules.classify({
                headers: msg.headers,
                snippet: msg.snippet,
                bodyText: msg.bodyText || msg.bodyHtml || '',
                attachments: msg.attachments
            }, userRules);
            if (flags[flagField]) {
                // Refresh hints while we're here.
                if (queueName === 'po' && flags.poHints) {
                    entry.hints = Object.assign({}, entry.hints, flags.poHints);
                }
                kept.push(entry);
            } else {
                dropped++;
            }
        } else {
            kept.push(entry);
        }
    }
    if (dropped > 0) {
        await store.writeQueue(queueName, kept);
    }
    return { kept: kept.length, dropped };
}

// Metadata-only sync stamps poFlag/bankFlag onto the index but doesn't write
// to queue_po.json / queue_bank.json — those need full bodies to extract PO
// hints and bank txn details. This function walks the index for every entry
// that is flagged but not yet in the corresponding queue, and fetches the
// full body on-demand (with retries), classifying + enqueuing as it goes.
// Safe to call repeatedly: it skips already-materialized entries.
async function materializeQueues({ limit = 60, flags = ['po', 'bank'], onProgress } = {}) {
    return withSyncLock('materialize', async () => {
        const gmail = await auth.getGmail();
        const added = { po: 0, bank: 0 };
        const scanned = { po: 0, bank: 0 };
        const failed = { po: 0, bank: 0 };

        for (const flag of flags) {
            const flagField = flag === 'po' ? 'poFlag' : 'bankFlag';
            const queueName = flag;
            let queue = [];
            try { queue = await store.readQueue(queueName); } catch {}
            const already = new Set((queue || []).map(x => x.messageId));

            // Pull candidate IDs from the INBOX index filtered to this flag.
            const page = await store.listLabelPage('INBOX', { offset: 0, limit: 10000, filter: flag });
            const candidates = (page.items || [])
                .filter(e => e && e.id && e[flagField] && !already.has(e.id))
                .slice(0, limit);

            console.log(`[gmailSync] materialize ${flag}: ${candidates.length} candidates (${already.size} already in queue)`);
            if (onProgress) onProgress({ flag, phase: 'start', candidates: candidates.length });
            for (let i = 0; i < candidates.length; i++) {
                const entry = candidates[i];
                scanned[flag]++;
                try {
                    const { flags: f } = await upsertMessage(gmail, entry.id, { format: 'full' });
                    if ((flag === 'po' && f.poFlag) || (flag === 'bank' && f.bankFlag)) {
                        added[flag]++;
                    }
                } catch (e) {
                    failed[flag]++;
                    console.error(`[gmailSync] materialize ${flag} failed for ${entry.id}:`, e.message);
                }
                if (onProgress && (i % 5 === 0)) onProgress({ flag, phase: 'step', done: i + 1, total: candidates.length });
            }
            console.log(`[gmailSync] materialize ${flag}: scanned=${scanned[flag]} added=${added[flag]} failed=${failed[flag]}`);
            if (onProgress) onProgress({ flag, phase: 'done', added: added[flag], scanned: scanned[flag], failed: failed[flag] });
        }
        return { added, scanned, failed };
    });
}

// Mark a message (and its sender) as Spam / Bank / PO.
//   - Adds the sender to the user-rules file so *future* mail from the same
//     sender is auto-classified at sync time.
//   - Re-classifies the message itself right now so its index row and the
//     appropriate queue get updated immediately.
//   - For 'spam', the Gmail message is also moved to Trash (Gmail doesn't
//     expose a reliable "teach spam" endpoint; Trash is the closest thing
//     that also gets the mail out of the user's face).
//   - Also re-classifies every *existing* index entry from the same sender
//     so the learning is retroactive (learned PO sender → all old mail from
//     them now appears in the PO queue).
async function classifyAs(messageId, type) {
    if (!['spam', 'bank', 'po'].includes(type)) throw new Error('Unknown type: ' + type);
    const gmail = await auth.getGmail();

    // Step 1: load message (full body, re-fetch if we only had metadata).
    let msg = null;
    try { msg = await store.loadMessageAnywhere(messageId); } catch {}
    if (!msg || msg.bodyPending || (!msg.bodyText && !msg.bodyHtml)) {
        try {
            const r = await upsertMessage(gmail, messageId, { format: 'full' });
            msg = r.norm;
        } catch (e) {
            console.warn(`[gmailSync] classifyAs could not full-fetch ${messageId}:`, e.message);
        }
    }
    if (!msg) throw new Error('Message not found locally — try syncing first.');

    const sender = store.normaliseSender(msg.from || '');
    if (!sender) throw new Error('Could not determine sender address.');

    // Step 2: persist the learned rule (also un-marks sender from other buckets).
    await store.addUserRule(type, sender);

    // Step 3: re-classify this message and refresh its index + queues.
    const userRules = await store.readUserRules();
    const flags = rules.classify({
        headers: msg.headers,
        snippet: msg.snippet,
        bodyText: msg.bodyText || msg.bodyHtml || '',
        attachments: msg.attachments
    }, userRules);
    const entry = indexEntryFromNormalized(msg, flags, { metadataOnly: false });
    for (const lbl of TRACKED_LABELS) {
        if ((msg.labelIds || []).includes(lbl)) await store.upsertIndexEntry(lbl, entry);
    }

    // Step 4: push into the corresponding queue (if applicable).
    if (type === 'po' && flags.poFlag) {
        await store.addToQueue('po', {
            messageId: msg.id,
            threadId: msg.threadId,
            receivedAt: msg.internalDate,
            from: msg.from,
            subject: msg.subject,
            hints: flags.poHints,
            linkedInvoices: [],
            linkedInvoiceId: null,
            totalQty: null,
            status: 'new',
            learned: true
        });
    }
    if (type === 'bank' && flags.bankFlag) {
        await store.addToQueue('bank', {
            messageId: msg.id,
            threadId: msg.threadId,
            receivedAt: msg.internalDate,
            from: msg.from,
            subject: msg.subject,
            txn: flags.bankTxn || { type: null, amount: null },
            linkedVoucherId: null,
            status: 'new',
            learned: true
        });
    }

    // Step 5: if spam, trash the message on Gmail as well.
    if (type === 'spam') {
        try { await trash(messageId); } catch (e) { console.warn('[gmailSync] trash after spam failed:', e.message); }
    }

    // Step 6: apply the learning retroactively to other mails from this sender.
    // We just flip flags in the index — full queue materialisation still needs
    // bodies, but the filter views and mail list will update right away.
    const retro = await applySenderFlagToIndex(sender, type);

    return { ok: true, sender, retro, flags };
}

// Walk every tracked label's index and update the relevant flag on entries
// whose from-address matches `sender` (case-insensitive exact or @domain).
async function applySenderFlagToIndex(sender, type) {
    const touched = { INBOX: 0, SENT: 0 };
    const field = type === 'po' ? 'poFlag' : type === 'bank' ? 'bankFlag' : 'spamFlag';
    const wantTrue = true; // we're *adding* a rule, so flip matching senders ON
    for (const lbl of TRACKED_LABELS) {
        const list = await store.readIndex(lbl).catch(() => []);
        const matchIds = new Set();
        for (const e of list) {
            if (!e || !e.from) continue;
            if (store.senderMatchesAny(e.from, [sender])) matchIds.add(e.id);
        }
        if (matchIds.size) {
            await store.setIndexFlag(lbl, field, matchIds, { clearOthers: false });
            touched[lbl] = matchIds.size;
        }
    }
    return touched;
}

// Remove a learned rule *and* flip the flag back off on matching index entries
// so the views update live.
//
// The whole read-modify-write is delegated to store.clearIndexFlagWhere,
// which runs under the per-file withLock used by every other mutator of
// the index (upsertIndexEntry / removeFromIndex / setIndexFlag). Doing it
// ourselves in two separate readIndex calls would race any concurrent
// sync and clobber its writes.
//
// We can't strictly say a mail was *only* flagged by this rule, so we do
// a conservative remove: flip flag off for matches; the next full-body
// classification will re-set it if other rules still apply.
async function unlearnRule(type, pattern) {
    await store.removeUserRule(type, pattern);
    const field = type === 'po' ? 'poFlag' : type === 'bank' ? 'bankFlag' : 'spamFlag';
    const touched = { INBOX: 0, SENT: 0 };
    for (const lbl of TRACKED_LABELS) {
        const cleared = await store.clearIndexFlagWhere(lbl, field, (e) => (
            e && e.from && store.senderMatchesAny(e.from, [pattern])
        )).catch(() => 0);
        touched[lbl] = cleared || 0;
    }
    return { touched };
}

module.exports = {
    initialSync,
    incrementalSync,
    enrichIndexFlags,
    enrichNow,
    materializeQueues,
    reclassifyQueue,
    downloadAttachment,
    markRead, markUnread, archive, trash, reportSpam,
    sendMessage,
    upsertMessage,
    ensureFullMessage,
    classifyAs,
    unlearnRule,
    applySenderFlagToIndex
};
