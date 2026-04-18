// Bank mail queue — lists credit/debit alerts, lets user create voucher drafts.

const BankMailUI = (() => {
    const state = { items: [], filter: 'open', search: '' };

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fmtDate(ms) { if (!ms) return ''; return new Date(Number(ms)).toLocaleString(); }
    function fmtAmount(n) { if (n == null) return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }
    function setStatus(msg) {
        const el = document.getElementById('bankStatus');
        if (el) el.textContent = msg || '';
    }

    async function load() {
        const view = document.getElementById('bankMailView');
        if (!view) return;
        if (window.MailUI && MailUI.ensureMailStyles) MailUI.ensureMailStyles();
        view.innerHTML = `
          <div class="px-3 py-3">
            <div class="d-flex align-items-center mb-3 gap-2 flex-wrap">
              <h3 class="mb-0 me-2"><i class="bi bi-bank"></i> Bank Transactions (from email)</h3>
              <div class="btn-group btn-group-sm" id="bankFilter" role="group">
                <button class="btn btn-outline-primary active" data-filter="open">Open</button>
                <button class="btn btn-outline-success" data-filter="credit">Credits</button>
                <button class="btn btn-outline-danger" data-filter="debit">Debits</button>
                <button class="btn btn-outline-secondary" data-filter="voucher">Voucher-ed</button>
                <button class="btn btn-outline-primary" data-filter="all">All</button>
              </div>
              <div class="ms-auto d-flex gap-2">
                <input id="bankSearch" type="search" class="form-control form-control-sm" placeholder="Search" style="width:240px">
                <button class="btn btn-sm btn-outline-light" id="bankRefresh" title="Refresh from local cache"><i class="bi bi-arrow-repeat"></i></button>
                <button class="btn btn-sm btn-outline-primary" id="bankRescan" title="Re-scan Gmail for bank transaction alerts"><i class="bi bi-search"></i> Rescan</button>
              </div>
            </div>
            <div id="bankStatus" class="small text-muted mb-2" style="min-height:1.2em"></div>
            <div class="card"><div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-hover mb-0 align-middle">
                  <thead><tr>
                    <th>Received</th><th>Bank</th><th>Type</th><th class="text-end">Amount</th><th>Subject</th><th>Status</th><th class="text-end">Actions</th>
                  </tr></thead>
                  <tbody id="bankRows"><tr><td colspan="7" class="text-center p-4 text-muted">Loading…</td></tr></tbody>
                </table>
              </div>
            </div></div>
          </div>`;

        document.querySelectorAll('#bankFilter button').forEach(b => b.onclick = () => {
            document.querySelectorAll('#bankFilter button').forEach(x => x.classList.remove('active'));
            b.classList.add('active'); state.filter = b.dataset.filter; render();
        });
        document.getElementById('bankSearch').oninput = (e) => { state.search = e.target.value.trim().toLowerCase(); render(); };
        document.getElementById('bankRefresh').onclick = async () => {
            const btn = document.getElementById('bankRefresh');
            const icon = btn.querySelector('i');
            btn.disabled = true; icon.classList.add('spin');
            try { await refresh(); } finally { btn.disabled = false; icon.classList.remove('spin'); }
        };
        document.getElementById('bankRescan').onclick = async () => {
            const btn = document.getElementById('bankRescan');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Scanning…';
            setStatus('Re-scanning Gmail for bank transaction alerts. This may take a few seconds.');
            try {
                try { await window.electronAPI.gmail.enrichFlags(); } catch {}
                const envelope = await window.electronAPI.gmail.materializeQueues({ flags: ['bank'], limit: 120 });
                const r = (envelope && envelope.data) || envelope || {};
                const scanned = (r.scanned && r.scanned.bank) || 0;
                const added = (r.added && r.added.bank) || 0;
                setStatus(`Scan complete — ${scanned} candidate mails inspected, ${added} confirmed as bank transactions.`);
                await refresh();
            } catch (e) {
                setStatus(`Scan failed: ${e && e.message ? e.message : 'unknown error'}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-search"></i> Rescan';
            }
        };

        // Guard the listener registration the same way mailUI.js guards
        // onOpenView: a stale/incomplete preload can leave onQueueUpdated
        // as undefined, and invoking it would throw and break the whole
        // Bank Mail module.
        if (!BankMailUI._bound
            && window.electronAPI && window.electronAPI.gmail
            && typeof window.electronAPI.gmail.onQueueUpdated === 'function') {
            BankMailUI._bound = true;
            window.electronAPI.gmail.onQueueUpdated(() => {
                if (document.getElementById('bankMailView') && document.getElementById('bankMailView').offsetParent !== null) {
                    refresh();
                }
            });
        }

        await refresh();
    }

    async function refresh() {
        const res = await window.electronAPI.gmail.queueList('bank');
        state.items = (res && res.data) || [];
        render();
        // If nothing in the bank queue yet, attempt to hydrate it from
        // flagged index entries (full-body fetch of just bank mails).
        //   _hydrating — an attempt is currently in flight
        //   _hydrated  — an attempt has settled (success or failure); only
        //               set in finally() so a transient IPC error doesn't
        //               permanently block a retry on the next refresh.
        if (!state.items.length && !BankMailUI._hydrated && !BankMailUI._hydrating) {
            BankMailUI._hydrating = true;
            hydrate().finally(() => {
                BankMailUI._hydrated = true;
                BankMailUI._hydrating = false;
            });
        }
    }

    async function hydrate() {
        const tbody = document.getElementById('bankRows');
        if (tbody && !state.items.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-muted">
              <div class="spinner-border spinner-border-sm me-2"></div>
              Scanning Gmail for bank transaction alerts…
            </td></tr>`;
        }
        setStatus('Looking for bank alert emails in your Gmail…');
        // First run the enrichment pass so the index has bankFlag set on
        // every candidate message — previous sessions may have missed it.
        try { await window.electronAPI.gmail.enrichFlags(); } catch {}
        let result = null;
        try {
            const envelope = await window.electronAPI.gmail.materializeQueues({ flags: ['bank'], limit: 120 });
            result = (envelope && envelope.data) || envelope;
        } catch (e) {
            setStatus(`Scan failed: ${e && e.message ? e.message : 'unknown error'}`);
        }
        await new Promise(r => setTimeout(r, 200));
        const res = await window.electronAPI.gmail.queueList('bank');
        state.items = (res && res.data) || [];
        if (result) {
            const scanned = (result.scanned && result.scanned.bank) || 0;
            const added = (result.added && result.added.bank) || 0;
            if (scanned > 0) {
                setStatus(`Inspected ${scanned} candidate mails, found ${added} bank transaction${added === 1 ? '' : 's'}.`);
            } else if (!state.items.length) {
                setStatus('No bank transaction alerts detected in your Gmail. Click Rescan after you receive one.');
            } else {
                setStatus('');
            }
        }
        render();
    }

    function render() {
        const tbody = document.getElementById('bankRows'); if (!tbody) return;
        let items = state.items.slice();
        if (state.filter === 'open') items = items.filter(x => !x.linkedVoucherId);
        else if (state.filter === 'credit') items = items.filter(x => x.txn && x.txn.type === 'credit');
        else if (state.filter === 'debit') items = items.filter(x => x.txn && x.txn.type === 'debit');
        else if (state.filter === 'voucher') items = items.filter(x => x.linkedVoucherId);
        if (state.search) {
            const q = state.search;
            items = items.filter(x => (x.from || '').toLowerCase().includes(q) || (x.subject || '').toLowerCase().includes(q));
        }
        if (!items.length) {
            // Distinguish: queue is completely empty vs. filter hides everything.
            const hasAnyInQueue = state.items.length > 0;
            if (hasAnyInQueue) {
                tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-muted">
                  No bank mails match this filter. Try switching to <b>All</b>.
                </td></tr>`;
            } else {
                tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-muted">
                  <div class="text-center">
                    <div class="mb-2"><i class="bi bi-bank fs-1 opacity-50"></i></div>
                    <div class="fw-semibold mb-1">No bank transaction alerts detected yet</div>
                    <div class="small mb-3" style="max-width:560px;margin:0 auto">
                      We scan your Gmail for messages from major Indian banks
                      (HDFC, ICICI, Axis, SBI, Kotak, PNB, BoB, Canara…) and
                      payment services (Paytm, PhonePe, Razorpay, UPI alerts).
                      If you just connected Gmail or recently started receiving
                      alerts, click <b>Rescan</b> to look again.
                    </div>
                    <button class="btn btn-sm btn-primary" id="bankEmptyRescan"><i class="bi bi-search"></i> Rescan now</button>
                  </div>
                </td></tr>`;
                const rs = document.getElementById('bankEmptyRescan');
                if (rs) rs.onclick = () => {
                    const btn = document.getElementById('bankRescan');
                    if (btn) btn.click();
                };
            }
            return;
        }
        tbody.innerHTML = items.map(x => {
            const type = x.txn && x.txn.type;
            const typeBadge = type === 'credit' ? '<span class="badge bg-success">Credit</span>'
                            : type === 'debit' ? '<span class="badge bg-danger">Debit</span>'
                            : '<span class="badge bg-secondary">—</span>';
            return `<tr>
              <td class="small">${esc(fmtDate(x.receivedAt))}</td>
              <td class="small">${esc(x.from)}</td>
              <td>${typeBadge}</td>
              <td class="text-end small">${esc(fmtAmount(x.txn && x.txn.amount))}</td>
              <td class="small">${esc(x.subject || '')}</td>
              <td>${x.linkedVoucherId ? `<span class="badge bg-success">Voucher #${esc(x.linkedVoucherId)}</span>` : `<span class="badge bg-warning text-dark">Open</span>`}</td>
              <td class="text-end">
                <div class="btn-group btn-group-sm">
                  <button class="btn btn-outline-primary bank-voucher" data-msg="${esc(x.messageId)}">Create Voucher</button>
                  <button class="btn btn-outline-secondary bank-open" data-msg="${esc(x.messageId)}">Open</button>
                  <button class="btn btn-outline-danger bank-dismiss" data-msg="${esc(x.messageId)}"><i class="bi bi-x"></i></button>
                </div>
              </td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.bank-open').forEach(b => b.onclick = async () => {
            const msgId = b.dataset.msg;
            // Preview inline on top of Bank Mail — no view switch. Fall back
            // to the old "navigate to Mail + auto-click the row" behaviour
            // only if MailUI isn't loaded (stale build / async race).
            if (window.MailUI && typeof MailUI.openMessagePreview === 'function') {
                await MailUI.openMessagePreview(msgId);
                return;
            }
            App.showView('mail');
            setTimeout(async () => {
                if (window.MailUI) await MailUI.load();
                const row = document.querySelector(`.mail-row[data-id="${CSS.escape(msgId)}"]`);
                if (row) row.click();
            }, 300);
        });
        tbody.querySelectorAll('.bank-voucher').forEach(b => b.onclick = () => createVoucherFrom(b.dataset.msg));
        tbody.querySelectorAll('.bank-dismiss').forEach(b => b.onclick = async () => {
            if (!confirm('Remove from bank queue?')) return;
            await window.electronAPI.gmail.queueRemove({ name: 'bank', messageId: b.dataset.msg });
            await refresh();
        });
    }

    async function createVoucherFrom(messageId) {
        const item = state.items.find(x => x.messageId === messageId);
        if (!item) return;
        const prefill = {
            source: 'gmail',
            bankSender: item.from,
            subject: item.subject,
            messageId: item.messageId,
            amount: item.txn && item.txn.amount,
            type: item.txn && item.txn.type,
            receivedAt: item.receivedAt
        };
        sessionStorage.setItem('mail_bank_prefill', JSON.stringify(prefill));
        try {
            App.showView('vouchers', { fromBankMail: true, prefill });
            await window.electronAPI.gmail.queueUpdate({ name: 'bank', messageId, patch: { status: 'drafting' } });
        } catch (e) {
            App.showNotification('Could not open Vouchers module: ' + e.message, 'error');
        }
    }

    return { load, refresh };
})();

window.BankMailUI = BankMailUI;
