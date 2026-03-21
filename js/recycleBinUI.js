/**
 * RecycleBinUI - Manages the Recycle Bin modal UI
 * Shows deleted Invoices and Vouchers with Restore / Permanent Delete options.
 */
const RecycleBinUI = {

    /**
     * Open the Recycle Bin modal
     */
    open() {
        // Ensure modal exists
        this._ensureModal();
        // Render contents
        this._render();
        // Show modal
        const modalEl = document.getElementById('recycleBinModal');
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    },

    /**
     * Create the modal HTML if it doesn't exist yet
     */
    _ensureModal() {
        if (document.getElementById('recycleBinModal')) return;

        const modalHtml = `
<div class="modal fade" id="recycleBinModal" tabindex="-1" aria-labelledby="recycleBinModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-scrollable">
    <div class="modal-content bg-dark text-light border-secondary">
      <div class="modal-header border-secondary" style="background: linear-gradient(135deg,#1a1a2e,#16213e);">
        <h5 class="modal-title" id="recycleBinModalLabel">
          <i class="bi bi-trash3-fill text-warning me-2"></i> Recycle Bin
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-0">
        <div class="px-3 pt-3 pb-2 d-flex align-items-center gap-2 flex-wrap" style="background:#12121f;">
          <span class="badge bg-secondary" id="recycleBinCount">0 items</span>
          <button class="btn btn-sm btn-outline-danger ms-auto" onclick="RecycleBinUI._emptyBin()">
            <i class="bi bi-trash-fill me-1"></i> Empty Bin
          </button>
        </div>
        <div id="recycleBinTableWrapper" class="table-responsive" style="min-height:200px;"></div>
      </div>
    </div>
  </div>
</div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Render the table contents
     */
    _render() {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const wrapper = document.getElementById('recycleBinTableWrapper');
        const countBadge = document.getElementById('recycleBinCount');

        if (!wrapper) return;

        const count = bin.length;
        if (countBadge) countBadge.textContent = `${count} item${count !== 1 ? 's' : ''}`;

        if (count === 0) {
            wrapper.innerHTML = `
              <div class="text-center py-5 text-muted">
                <i class="bi bi-trash3" style="font-size:3rem;opacity:0.3;"></i>
                <p class="mt-3 fs-5">Recycle Bin is empty</p>
                <p class="small">Deleted Invoices, Vouchers, Challans, and Job Cards will appear here.</p>
              </div>`;
            return;
        }

        const rows = bin.map((item, idx) => {
            const type = item._recordType || 'unknown';
            const typeLabel = type === 'invoice' ? 'Invoice' : type === 'voucher' ? 'Voucher' : type === 'challan' ? (item.type === 'delivery' ? 'DC' : 'SC') : 'Job Card';

            let typeBadge = '';
            if (type === 'invoice') typeBadge = `<span class="badge" style="background:#1a56db">Invoice</span>`;
            else if (type === 'voucher') typeBadge = `<span class="badge" style="background:#7e3af2">Voucher</span>`;
            else if (type === 'challan') typeBadge = `<span class="badge" style="background:#047857">${item.type === 'delivery' ? 'DC' : 'SC'}</span>`;
            else typeBadge = `<span class="badge" style="background:#d97706">Job Card</span>`;

            const idNo = item.invoiceNo || item.id || '-';
            const customer = item.customerName || '-';
            const amount = (type === 'jobcard' || type === 'challan')
                ? (item.id || '-')
                : parseFloat(item.total || item.amount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
            const deletedAt = item._deletedAt ? new Date(item._deletedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

            return `
<tr style="border-color:rgba(255,255,255,0.07)">
  <td class="ps-3">${typeBadge}</td>
  <td class="fw-semibold text-info">${idNo}</td>
  <td>${customer}</td>
  <td class="text-end">${amount}</td>
  <td class="text-muted small">${deletedAt}</td>
  <td class="text-end pe-3">
    <button class="btn btn-sm btn-outline-success me-1" onclick="RecycleBinUI._restore('${item.id}','${type}')" title="Restore">
      <i class="bi bi-arrow-counterclockwise me-1"></i>Restore
    </button>
    <button class="btn btn-sm btn-outline-danger" onclick="RecycleBinUI._permanentDelete('${item.id}','${type}')" title="Delete Permanently">
      <i class="bi bi-x-octagon me-1"></i>Delete
    </button>
  </td>
</tr>`;
        }).join('');

        wrapper.innerHTML = `
<table class="table table-dark table-sm mb-0" style="border-collapse:separate;">
  <thead style="background:#1a1a2e;position:sticky;top:0;z-index:1;">
    <tr>
      <th class="ps-3">Type</th>
      <th>ID / No</th>
      <th>Customer</th>
      <th class="text-end">Amount / Info</th>
      <th>Deleted At</th>
      <th class="text-end pe-3">Actions</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
    },

    /**
     * Restore a record
     */
    async _restore(id, type) {
        try {
            if (type === 'invoice') {
                await InvoiceManager.restoreInvoice(id);
            } else if (type === 'voucher') {
                await VoucherManager.restoreVoucher(id);
            } else if (type === 'jobcard') {
                await JobCardManager.restoreJobCard(id);
            } else if (type === 'challan') {
                await DeliveryManager.restoreChallan(id);
            }
            App.showNotification('Record restored successfully!', 'success');
            this._render();
            // Refresh underlying views
            if (typeof InvoicesUI !== 'undefined') InvoicesUI.updateTable();
            if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.loadHistory === 'function') DeliveryUI.loadHistory();
        } catch (e) {
            console.error('Restore failed:', e);
            App.showNotification('Failed to restore: ' + e.message, 'error');
        }
    },

    /**
     * Permanently delete a single record
     */
    async _permanentDelete(id, type) {
        if (!confirm('Permanently delete this record? This cannot be undone.')) return;
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        const newBin = bin.filter(item => !(item.id === id && item._recordType === type));
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, newBin);
        App.showNotification('Record permanently deleted.', 'info');
        this._render();
    },

    /**
     * Empty the entire recycle bin
     */
    async _emptyBin() {
        const bin = DataManager.getData(DataManager.KEYS.RECYCLE_BIN) || [];
        if (bin.length === 0) { App.showNotification('Recycle Bin is already empty.', 'info'); return; }
        if (!confirm(`Permanently delete ALL ${bin.length} item(s) in the Recycle Bin? This cannot be undone.`)) return;
        await DataManager.saveData(DataManager.KEYS.RECYCLE_BIN, []);
        App.showNotification('Recycle Bin emptied.', 'info');
        this._render();
    }
};
