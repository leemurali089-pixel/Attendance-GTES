// Purchase Order queue — lists all PO-flagged mails, supports multi-invoice linking
// with per-invoice quantities so one PO can be split across many invoices.

const POQueueUI = (() => {
    const state = { items: [], filter: 'open', search: '' };

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtDate(ms) { if (!ms) return ''; return new Date(Number(ms)).toLocaleString(); }
    function fmtAmount(n) { if (n == null) return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }

    // ---- PO / Invoice matching helpers ----

    // Return array of PO numbers parsed out of a blob.
    // Picks tokens after "PO" / "PO#" / "P.O." / plain numeric tokens in the PO hint string.
    function parsePOTokens(s) {
        if (!s) return [];
        const out = new Set();
        // "PO 12345", "PO-12345", "PO#12345", "P.O. 12345"
        const re = /\b(?:P\.?O\.?)[\s#\-:]*([A-Z0-9][A-Z0-9\/\-]{1,30})/ig;
        let m;
        while ((m = re.exec(s)) !== null) out.add(m[1].toUpperCase());
        // Also pick big numeric tokens (4+ digits) if they sit near "PO"
        const numRe = /\b([0-9]{4,10})\b/g;
        while ((m = numRe.exec(s)) !== null) out.add(m[1]);
        return Array.from(out);
    }

    // Try to parse a date ref from the subject/body (e.g. "Dt. 29.10.2025", "dated 04-03-2026")
    function parseDateHint(s) {
        if (!s) return null;
        const m = /\b(?:dt\.?|dated|date)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i.exec(s);
        return m ? m[1] : null;
    }

    function getPOTokensFromQueueItem(x) {
        const sources = [
            x.hints && x.hints.poNumber,
            x.subject,
        ].filter(Boolean).join(' ');
        const tokens = parsePOTokens(sources);
        // Also add the raw hint.poNumber as-is if it's small/clean
        if (x.hints && x.hints.poNumber) {
            const raw = String(x.hints.poNumber).trim().toUpperCase();
            if (raw.length <= 20 && /^[A-Z0-9\/\-]+$/i.test(raw)) tokens.unshift(raw);
        }
        return Array.from(new Set(tokens));
    }

    function invoiceMatchesAnyToken(invoice, tokens) {
        if (!invoice || !tokens || !tokens.length) return false;
        const blob = String(invoice.poNumber || '').toUpperCase();
        if (!blob) return false;
        for (const t of tokens) {
            if (!t) continue;
            // Word-boundary contains — "1067" matches "1067" but not "10670"
            const re = new RegExp(`(^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`, 'i');
            if (re.test(blob)) return true;
        }
        return false;
    }

    function invoiceInfo(inv) {
        const no = inv.invoiceNo || inv.id || '—';
        const date = inv.date || inv.invoiceDate || '';
        const party = inv.customerName || inv.partyName || '';
        const total = inv.total != null ? inv.total : (inv.grandTotal != null ? inv.grandTotal : null);
        const totalQty = (inv.items || []).reduce((a, it) => a + (Number(it.quantity) || 0), 0);
        return { no, date, party, total, totalQty };
    }

    // ---- Entry status / allocation ----

    function computeAllocated(item) {
        return ((item.linkedInvoices || []).reduce((a, x) => a + (Number(x.qty) || 0), 0));
    }
    function computeStatus(item) {
        const allocated = computeAllocated(item);
        const total = Number(item.totalQty) || 0;
        if (item.linkedInvoiceId && (!item.linkedInvoices || !item.linkedInvoices.length)) return 'linked'; // legacy
        if ((item.linkedInvoices || []).length === 0) return 'open';
        if (total > 0 && allocated >= total) return 'full';
        return 'partial';
    }

    async function load() {
        const view = document.getElementById('poQueueView');
        if (!view) return;
        if (window.MailUI && MailUI.isGmailAvailable && !MailUI.isGmailAvailable()) {
            MailUI.renderDesktopOnlyNotice('poQueueView', {
                title: 'PO Queue',
                feature: 'Automatic detection of Purchase Orders from Gmail',
                icon: 'bi-receipt'
            });
            return;
        }
        if (window.MailUI && MailUI.ensureMailStyles) MailUI.ensureMailStyles();
        view.innerHTML = `
          <div class="px-3 py-3">
            <div class="d-flex align-items-center mb-3 gap-2 flex-wrap">
              <h3 class="mb-0 me-2"><i class="bi bi-receipt"></i> Purchase Orders — Inbox</h3>
              <div class="btn-group btn-group-sm" id="poFilter" role="group">
                <button class="btn btn-outline-primary active" data-filter="open">Open</button>
                <button class="btn btn-outline-warning" data-filter="partial">Partial</button>
                <button class="btn btn-outline-success" data-filter="full">Fully invoiced</button>
                <button class="btn btn-outline-primary" data-filter="all">All</button>
              </div>
              <div class="ms-auto d-flex gap-2">
                <input id="poSearch" type="search" class="form-control form-control-sm" placeholder="Search supplier / subject / PO#" style="width:260px">
                <button class="btn btn-sm btn-outline-warning" id="poCleanup" title="Remove mails that are not actually Purchase Orders (re-checks the body with current rules)"><i class="bi bi-magic"></i> Clean false positives</button>
                <button class="btn btn-sm btn-outline-light" id="poRefresh" title="Refresh from local cache"><i class="bi bi-arrow-repeat"></i></button>
              </div>
            </div>
            <div class="card"><div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                  <thead><tr>
                    <th>Received</th><th>Supplier</th><th>Subject</th><th>PO#</th><th>Qty</th><th>Attachments</th><th>Status</th><th class="text-end">Actions</th>
                  </tr></thead>
                  <tbody id="poRows"><tr><td colspan="8" class="text-center p-4 text-muted">Loading…</td></tr></tbody>
                </table>
              </div>
            </div></div>
          </div>`;

        document.querySelectorAll('#poFilter button').forEach(b => b.onclick = () => {
            document.querySelectorAll('#poFilter button').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); state.filter = b.dataset.filter; render();
        });
        document.getElementById('poSearch').oninput = (e) => { state.search = e.target.value.trim().toLowerCase(); render(); };
        document.getElementById('poRefresh').onclick = async () => {
            const btn = document.getElementById('poRefresh');
            const icon = btn.querySelector('i');
            btn.disabled = true; icon.classList.add('spin');
            try { await refresh(); } finally { btn.disabled = false; icon.classList.remove('spin'); }
        };
        const cleanupBtn = document.getElementById('poCleanup');
        if (cleanupBtn) cleanupBtn.onclick = async () => {
            if (!confirm('Re-check every PO entry against the updated rules and remove ones that are not actually Purchase Orders?')) return;
            cleanupBtn.disabled = true;
            const orig = cleanupBtn.innerHTML;
            cleanupBtn.innerHTML = '<i class="bi bi-hourglass-split spin"></i> Cleaning…';
            try {
                if (!window.electronAPI.gmail.reclassifyQueue) {
                    App.showNotification('This feature needs the updated app. Please fully quit and restart.', 'warning');
                    return;
                }
                const r = await window.electronAPI.gmail.reclassifyQueue('po');
                if (r && r.success) {
                    const { kept, dropped } = r.data || {};
                    App.showNotification(`Kept ${kept} · Removed ${dropped || 0} false positives.`, 'success');
                    await refresh();
                } else {
                    App.showNotification('Cleanup failed: ' + ((r && r.error) || 'unknown'), 'error');
                }
            } finally {
                cleanupBtn.disabled = false;
                cleanupBtn.innerHTML = orig;
            }
        };

        // Guard the listener registration the same way mailUI.js guards
        // onOpenView: a stale/incomplete preload can leave onQueueUpdated
        // as undefined, and invoking it would throw and break the whole
        // PO Queue module.
        if (!POQueueUI._bound
            && window.electronAPI && window.electronAPI.gmail
            && typeof window.electronAPI.gmail.onQueueUpdated === 'function') {
            POQueueUI._bound = true;
            window.electronAPI.gmail.onQueueUpdated(() => {
                if (document.getElementById('poQueueView') && document.getElementById('poQueueView').offsetParent !== null) {
                    refresh();
                }
            });
        }

        await refresh();
    }

    async function refresh() {
        const res = await window.electronAPI.gmail.queueList('po');
        const items = (res && res.data) || [];
        // Normalize legacy records
        for (const x of items) {
            if (!Array.isArray(x.linkedInvoices)) x.linkedInvoices = [];
            if (x.linkedInvoiceId && !x.linkedInvoices.some(i => i.invoiceId === x.linkedInvoiceId)) {
                x.linkedInvoices.push({ invoiceId: x.linkedInvoiceId, qty: null, linkedAt: x.linkedAt || null, notes: 'migrated' });
            }
        }
        state.items = items;
        render();
        // Opportunistic hydrate: flagged-but-not-materialized POs get their
        // bodies fetched on demand so their PO# + attachments appear here.
        //   _hydrating — an attempt is currently in flight
        //   _hydrated  — an attempt has settled (success OR failure); only
        //               set in finally() so a transient IPC error doesn't
        //               permanently block a retry on the next refresh.
        if (!POQueueUI._hydrated && !POQueueUI._hydrating) {
            POQueueUI._hydrating = true;
            hydrate().finally(() => {
                POQueueUI._hydrated = true;
                POQueueUI._hydrating = false;
            });
        }
    }

    async function hydrate() {
        try {
            await window.electronAPI.gmail.materializeQueues({ flags: ['po'], limit: 80 });
        } catch { /* non-fatal */ }
        // One-shot silent cleanup: remove any entries that fail the tightened
        // classifier. Safe because it only touches entries with a local body.
        try {
            if (window.electronAPI.gmail.reclassifyQueue && !POQueueUI._cleanedOnce) {
                POQueueUI._cleanedOnce = true;
                const r = await window.electronAPI.gmail.reclassifyQueue('po');
                if (r && r.success && r.data && r.data.dropped) {
                    App.showNotification(`Cleaned ${r.data.dropped} non-PO mail${r.data.dropped > 1 ? 's' : ''} from the queue.`, 'info');
                }
            }
        } catch { /* non-fatal */ }
        await new Promise(r => setTimeout(r, 200));
        const res = await window.electronAPI.gmail.queueList('po');
        const items = (res && res.data) || [];
        for (const x of items) {
            if (!Array.isArray(x.linkedInvoices)) x.linkedInvoices = [];
            if (x.linkedInvoiceId && !x.linkedInvoices.some(i => i.invoiceId === x.linkedInvoiceId)) {
                x.linkedInvoices.push({ invoiceId: x.linkedInvoiceId, qty: null, linkedAt: x.linkedAt || null, notes: 'migrated' });
            }
        }
        state.items = items;
        render();
    }

    function render() {
        const tbody = document.getElementById('poRows'); if (!tbody) return;
        let items = state.items.slice();

        if (state.filter !== 'all') {
            items = items.filter(x => computeStatus(x) === state.filter);
        }
        if (state.search) {
            const q = state.search;
            items = items.filter(x =>
                (x.from || '').toLowerCase().includes(q) ||
                (x.subject || '').toLowerCase().includes(q) ||
                ((x.hints && x.hints.poNumber) || '').toLowerCase().includes(q)
            );
        }
        // Newest first (received timestamp desc) so the inbox is not a random order
        items.sort((a, b) => (Number(b.receivedAt) || 0) - (Number(a.receivedAt) || 0));
        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-muted">No purchase-order mails ${state.filter !== 'all' ? '(' + state.filter + ')' : ''}.</td></tr>`;
            return;
        }
        tbody.innerHTML = items.map(x => {
            const attach = (x.hints && x.hints.attachments) || [];
            const attachBadges = attach.map((a) =>
                `<a href="#" class="badge bg-secondary me-1 po-att" data-msg="${esc(x.messageId)}" data-att="${esc(a.attachmentId)}" data-name="${esc(a.filename)}" data-mt="${esc(a.mimeType || '')}"><i class="bi bi-paperclip"></i> ${esc(a.filename)}</a>`
            ).join('');
            const st = computeStatus(x);
            const allocated = computeAllocated(x);
            const total = Number(x.totalQty) || 0;
            const qtyCell = total > 0 ? `${allocated}/${total}` : (allocated > 0 ? `${allocated}/?` : '—');
            const statusBadge =
                st === 'full'    ? '<span class="badge bg-success">Fully invoiced</span>' :
                st === 'partial' ? '<span class="badge bg-warning text-dark">Partial</span>' :
                st === 'linked'  ? '<span class="badge bg-info">Linked</span>' :
                                   '<span class="badge bg-secondary">Open</span>';
            return `<tr>
              <td class="small">${esc(fmtDate(x.receivedAt))}</td>
              <td class="small">${esc(x.from)}</td>
              <td class="small"><a href="#" class="po-open" data-msg="${esc(x.messageId)}">${esc(x.subject || '(no subject)')}</a></td>
              <td class="small">${esc((x.hints && x.hints.poNumber) || '—')}</td>
              <td class="small">${esc(qtyCell)}</td>
              <td>${attachBadges || '<span class="text-muted small">None</span>'}</td>
              <td>${statusBadge}</td>
              <td class="text-end">
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary po-manage" data-msg="${esc(x.messageId)}"><i class="bi bi-link-45deg"></i> Invoices</button>
                  <button class="btn btn-outline-secondary po-invoice" data-msg="${esc(x.messageId)}" title="Create a new invoice prefilled from this PO">New Invoice</button>
                  <button class="btn btn-outline-danger po-dismiss" data-msg="${esc(x.messageId)}" title="Remove from queue"><i class="bi bi-x"></i></button>
                </div>
              </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.po-open').forEach(a => a.onclick = (e) => { e.preventDefault(); openMessage(a.dataset.msg); });
        tbody.querySelectorAll('.po-att').forEach(a => a.onclick = async (e) => {
            e.preventDefault();
            if (window.MailUI && MailUI.previewAttachment) {
                await MailUI.previewAttachment(a.dataset.msg, {
                    attachmentId: a.dataset.att, filename: a.dataset.name, mimeType: a.dataset.mt
                });
            }
        });
        tbody.querySelectorAll('.po-manage').forEach(b => b.onclick = () => openInvoicePicker(b.dataset.msg));
        tbody.querySelectorAll('.po-invoice').forEach(b => b.onclick = () => createInvoiceFrom(b.dataset.msg));
        tbody.querySelectorAll('.po-dismiss').forEach(b => b.onclick = async () => {
            if (!confirm('Remove this message from PO queue?')) return;
            await window.electronAPI.gmail.queueRemove({ name: 'po', messageId: b.dataset.msg });
            await refresh();
        });
    }

    async function openMessage(msgId) {
        // Preview inline on top of PO Queue — no view switch. Fall back to
        // the old "navigate to Mail + auto-click the row" behaviour only if
        // MailUI isn't loaded (stale build / async race).
        if (window.MailUI && typeof MailUI.openMessagePreview === 'function') {
            await MailUI.openMessagePreview(msgId);
            return;
        }
        App.showView('mail');
        setTimeout(async () => {
            if (window.MailUI && typeof MailUI.load === 'function') await MailUI.load();
            const row = document.querySelector(`.mail-row[data-id="${CSS.escape(msgId)}"]`);
            if (row) row.click();
        }, 300);
    }

    // ---- Invoice picker + multi-link modal ----

    function invoiceYmdParts(inv) {
        const raw = String(inv && (inv.date || inv.invoiceDate || inv.createdAt) || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
        return { y: raw.slice(0, 4), m: raw.slice(5, 7), d: raw, raw };
    }

    function openInvoicePicker(messageId) {
        const item = state.items.find(x => x.messageId === messageId);
        if (!item) return;

        const tokens = getPOTokensFromQueueItem(item);
        const dateHint = parseDateHint((item.subject || '') + ' ' + ((item.hints && item.hints.poNumber) || ''));

        const invoices = (window.InvoiceManager && InvoiceManager.getAllInvoices)
            ? InvoiceManager.getAllInvoices().slice()
            : (window.DataManager && typeof DataManager.getData === 'function' ? (DataManager.getData('invoices') || []).slice() : []);

        // Rank: token match first (most tokens matched), then by date desc
        invoices.sort((a, b) => {
            const ma = tokens.filter(t => invoiceMatchesAnyToken({ poNumber: a.poNumber }, [t])).length;
            const mb = tokens.filter(t => invoiceMatchesAnyToken({ poNumber: b.poNumber }, [t])).length;
            if (ma !== mb) return mb - ma;
            return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''));
        });

        const yearsSet = new Set();
        for (const inv of invoices) {
            const p = invoiceYmdParts(inv);
            if (p) yearsSet.add(p.y);
        }
        const yList = Array.from(yearsSet).sort().reverse();
        if (yList.length === 0) {
            const y0 = new Date().getFullYear();
            for (let i = 0; i < 6; i++) yearsSet.add(String(y0 - i));
        }
        const yearOptVals = (yList.length ? yList : Array.from(yearsSet).sort().reverse());
        const yearOptionsHtml = '<option value="">All years</option>' + yearOptVals
            .map((y) => `<option value="${esc(y)}">${esc(y)}</option>`).join('');
        const monthOptionsHtml = [
            { v: '', t: 'All months' },
            { v: '01', t: 'Jan' }, { v: '02', t: 'Feb' }, { v: '03', t: 'Mar' },
            { v: '04', t: 'Apr' }, { v: '05', t: 'May' }, { v: '06', t: 'Jun' },
            { v: '07', t: 'Jul' }, { v: '08', t: 'Aug' }, { v: '09', t: 'Sep' },
            { v: '10', t: 'Oct' }, { v: '11', t: 'Nov' }, { v: '12', t: 'Dec' }
        ].map((o) => `<option value="${o.v}">${o.t}</option>`).join('');

        const pick = { q: '', year: '', month: '' };

        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
          <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-link-45deg"></i> Link PO to invoice(s)</h5>
                <button class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body" id="poLinkBody" style="max-height:80vh;overflow:auto">
                <div class="text-center p-4"><div class="spinner-border"></div></div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', async () => {
            modal.remove();
            await refresh();
        });

        const render = () => {
            const prevPick = modal.querySelector('#poPick');
            const prevY = modal.querySelector('#poPickYear');
            const prevM = modal.querySelector('#poPickMonth');
            if (prevPick) pick.q = prevPick.value;
            if (prevY) pick.year = prevY.value;
            if (prevM) pick.month = prevM.value;

            const allocated = computeAllocated(item);
            const total = Number(item.totalQty) || 0;
            const remaining = total > 0 ? (total - allocated) : null;

            const linkedHtml = (item.linkedInvoices || []).length === 0
                ? `<div class="text-muted small">No invoices linked yet.</div>`
                : item.linkedInvoices.map((L, i) => {
                    const inv = invoices.find(v => v.id === L.invoiceId) || {};
                    const info = invoiceInfo(inv);
                    return `<div class="d-flex align-items-center gap-2 border rounded p-2 mb-1">
                      <div class="flex-grow-1">
                        <div><strong>${esc(info.no)}</strong> · ${esc(info.party || '—')} · <span class="small text-muted">${esc(info.date || '')}</span> · ${esc(fmtAmount(info.total))}</div>
                        <div class="small text-muted">PO on invoice: ${esc(inv.poNumber || '—')}</div>
                      </div>
                      <input type="number" min="0" step="1" class="form-control form-control-sm po-link-qty" data-idx="${i}" value="${esc(L.qty == null ? '' : L.qty)}" style="width:100px" placeholder="Qty">
                      <button class="btn btn-sm btn-outline-danger po-link-remove" data-idx="${i}"><i class="bi bi-x"></i></button>
                    </div>`;
                }).join('');

            const q = (pick.q || '').trim().toLowerCase();
            const words = q ? q.split(/\s+/).filter(Boolean) : [];
            let list = invoices.slice();
            if (words.length) {
                list = list.filter((inv) => {
                    const info = invoiceInfo(inv);
                    const idStr = (inv.id != null ? String(inv.id) : '');
                    const cname = (inv.customerName != null ? String(inv.customerName) : '');
                    const hay = `${info.no} ${idStr} ${info.party} ${cname} ${inv.poNumber || ''} ${info.date || ''} ${inv.narration || ''}`.toLowerCase();
                    return words.every((w) => hay.includes(w));
                });
            }
            if (pick.year) {
                list = list.filter((inv) => {
                    const p = invoiceYmdParts(inv);
                    return p && p.y === pick.year;
                });
            }
            if (pick.month) {
                list = list.filter((inv) => {
                    const p = invoiceYmdParts(inv);
                    return p && p.m === pick.month;
                });
            }
            if (list.length > 500) list = list.slice(0, 500);

            const suggestionsHtml = list.map(inv => {
                const info = invoiceInfo(inv);
                const isMatch = invoiceMatchesAnyToken(inv, tokens);
                const already = (item.linkedInvoices || []).some(L => L.invoiceId === inv.id);
                return `<tr class="${isMatch ? 'table-warning' : ''}">
                  <td class="small"><code>${esc(info.no)}</code></td>
                  <td class="small">${esc(info.date)}</td>
                  <td class="small">${esc(info.party || '—')}</td>
                  <td class="small">${esc(inv.poNumber || '—')}</td>
                  <td class="small text-end">${esc(fmtAmount(info.total))}</td>
                  <td class="small text-end">${esc(info.totalQty || '—')}</td>
                  <td class="text-end">
                    ${already
                        ? '<span class="badge bg-success">Linked</span>'
                        : `<button class="btn btn-sm btn-primary po-add" data-id="${esc(inv.id)}">
                             ${isMatch ? '<i class="bi bi-stars"></i> ' : ''}Link
                           </button>`}
                  </td>
                </tr>`;
            }).join('');

            modal.querySelector('#poLinkBody').innerHTML = `
              <div class="mb-3 p-3 border rounded po-link-summary">
                <div class="row g-2">
                  <div class="col-md-6">
                    <div class="small text-muted">From</div>
                    <div>${esc(item.from)}</div>
                    <div class="small text-muted mt-1">Subject</div>
                    <div>${esc(item.subject || '(no subject)')}</div>
                  </div>
                  <div class="col-md-6">
                    <div class="row g-2 align-items-end">
                      <div class="col-6">
                        <label class="form-label small mb-0">PO Number(s)</label>
                        <input id="poTokens" class="form-control form-control-sm" value="${esc(tokens.join(', '))}" placeholder="PO#">
                      </div>
                      <div class="col-6">
                        <label class="form-label small mb-0">PO Date</label>
                        <input id="poDate" class="form-control form-control-sm" value="${esc(dateHint || '')}" placeholder="dd-mm-yyyy">
                      </div>
                      <div class="col-6">
                        <label class="form-label small mb-0">Total PO Qty</label>
                        <input id="poTotalQty" type="number" min="0" step="1" class="form-control form-control-sm" value="${esc(item.totalQty || '')}" placeholder="e.g. 20">
                      </div>
                      <div class="col-6 text-end small pb-1">
                        Allocated: <b>${allocated}</b>${total ? ` / ${total}` : ''}${remaining != null ? ` · Remaining: <b>${remaining}</b>` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <h6 class="mt-2">Linked invoices</h6>
              <div id="poLinkedList">${linkedHtml}</div>

              <hr>
              <h6 class="mb-2">Pick invoices</h6>
              <div class="d-flex flex-wrap align-items-end gap-2 mb-2">
                <div>
                  <label class="form-label small mb-0">Year</label>
                  <select id="poPickYear" class="form-select form-select-sm" style="min-width:110px">${yearOptionsHtml}</select>
                </div>
                <div>
                  <label class="form-label small mb-0">Month</label>
                  <select id="poPickMonth" class="form-select form-select-sm" style="min-width:122px">${monthOptionsHtml}</select>
                </div>
                <div class="flex-grow-1" style="min-width:200px">
                  <label class="form-label small mb-0">Search (invoice, customer, PO#, id)</label>
                  <input id="poPick" class="form-control form-control-sm" value="${esc(pick.q)}" placeholder="e.g. customer name, INV-…, or PO number">
                </div>
              </div>
              <div class="table-responsive" style="max-height:45vh;overflow:auto">
                <table class="table table-sm table-hover mb-0 align-middle">
                  <thead class="sticky-top bg-body"><tr>
                    <th>Invoice</th><th>Date</th><th>Customer</th><th>PO on invoice</th><th class="text-end">Total</th><th class="text-end">Qty</th><th></th>
                  </tr></thead>
                  <tbody>${suggestionsHtml || '<tr><td colspan="7" class="text-center text-muted p-3">No invoices found.</td></tr>'}</tbody>
                </table>
              </div>

              <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
                <button class="btn btn-success" id="poSaveAll"><i class="bi bi-check2"></i> Save</button>
              </div>
            `;

            const pickInp = modal.querySelector('#poPick');
            if (pickInp) {
                pickInp.oninput = (e) => { pick.q = e.target.value; render(); };
            }
            const ySel = modal.querySelector('#poPickYear');
            if (ySel) {
                ySel.value = pick.year;
                ySel.onchange = (e) => { pick.year = e.target.value; render(); };
            }
            const mSel = modal.querySelector('#poPickMonth');
            if (mSel) {
                mSel.value = pick.month;
                mSel.onchange = (e) => { pick.month = e.target.value; render(); };
            }

            modal.querySelectorAll('.po-add').forEach(btn => btn.onclick = () => {
                const invId = btn.dataset.id;
                const inv = invoices.find(v => v.id === invId);
                const info = invoiceInfo(inv);
                item.linkedInvoices.push({
                    invoiceId: invId,
                    qty: info.totalQty || null,
                    linkedAt: new Date().toISOString()
                });
                render();
            });
            modal.querySelectorAll('.po-link-remove').forEach(btn => btn.onclick = () => {
                const i = Number(btn.dataset.idx);
                item.linkedInvoices.splice(i, 1);
                render();
            });
            modal.querySelectorAll('.po-link-qty').forEach(inp => inp.onchange = (e) => {
                const i = Number(e.target.dataset.idx);
                const v = Number(e.target.value);
                item.linkedInvoices[i].qty = isFinite(v) ? v : null;
                render();
            });
            modal.querySelector('#poTotalQty').onchange = (e) => {
                const v = Number(e.target.value);
                item.totalQty = isFinite(v) && v > 0 ? v : null;
                render();
            };

            modal.querySelector('#poSaveAll').onclick = async () => {
                const patch = {
                    linkedInvoices: item.linkedInvoices,
                    totalQty: item.totalQty,
                    status: computeStatus(item),
                    // keep legacy field in sync with the first linked invoice
                    linkedInvoiceId: (item.linkedInvoices[0] && item.linkedInvoices[0].invoiceId) || null,
                    updatedAt: new Date().toISOString()
                };
                const r = await window.electronAPI.gmail.queueUpdate({ name: 'po', messageId, patch });
                if (r && r.success) {
                    App.showNotification('PO links saved.', 'success');
                    bsModal.hide();
                } else {
                    App.showNotification('Save failed: ' + (r && r.error), 'error');
                }
            };
        };

        render();
    }

    async function createInvoiceFrom(messageId) {
        const po = state.items.find(x => x.messageId === messageId);
        if (!po) return;
        try {
            const prefill = {
                source: 'gmail',
                supplier: po.from,
                poNumber: (po.hints && po.hints.poNumber) || '',
                subject: po.subject,
                messageId: po.messageId,
                attachments: (po.hints && po.hints.attachments) || []
            };
            sessionStorage.setItem('mail_po_prefill', JSON.stringify(prefill));
            App.showView('invoices', { fromPOQueue: true, prefill });
            await window.electronAPI.gmail.queueUpdate({ name: 'po', messageId, patch: { status: 'invoicing' } });
        } catch (e) {
            App.showNotification('Could not open Invoices module: ' + e.message, 'error');
        }
    }

    return { load, refresh, openInvoicePicker };
})();

window.POQueueUI = POQueueUI;
