/**
 * Vouchers UI Module
 * Handles display, creation, and printing of Vouchers (Receipts/Payments)
 * Integrated with Synced Data
 */
const VouchersUI = {
    async init() {
        console.log('Vouchers UI Initialized');
        // Check if we are on the vouchers view
    },

    load() {
        this.renderVouchersList();
    },

    renderVouchersList() {
        const view = document.getElementById('vouchersView');
        if (!view) return;

        // Fetch vouchers to populate filters
        const vouchers = DataManager.getData('vouchers') || [];
        const fYears = [...new Set(vouchers.map(v => DataManager.getFinancialYear(v.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cash-stack text-info me-2"></i> Vouchers</h2>
                    <div>
                        <button class="btn btn-secondary btn-sm me-2" onclick="VouchersUI.importBankStatement()">
                            <i class="bi bi-bank"></i> Import Bank Statement
                        </button>
                        <button class="btn btn-outline-info btn-sm me-2" onclick="ExportImportHelper.openImportExport('vouchers')">
                            <i class="bi bi-arrow-left-right me-1"></i> Export/Import
                        </button>
                        <button class="btn btn-primary btn-sm me-2" onclick="VouchersUI.showCreateModal()">
                            <i class="bi bi-plus-lg"></i> New Voucher
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-6">
                                <label class="form-label small text-muted">Financial Year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherYear" onchange="VouchersUI.filterVouchers()">
                                    <option value="">All Year</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small text-muted">Voucher Type</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterVoucherType" onchange="VouchersUI.filterVouchers()">
                                    <option value="">All Types</option>
                                    <option value="receipt">Receipt (In)</option>
                                    <option value="payment">Payment (Out)</option>
                                    <option value="contra">Contra</option>
                                </select>
                            </div>
                        </div>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="voucherSearch" placeholder="Search vouchers by number, party, or remarks..." onkeyup="VouchersUI.filterVouchers()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="vouchersTableContainer">
                     <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this.updateTable();
    },

    updateTable() {
        // Fetch vouchers
        const vouchers = DataManager.getData('vouchers') || [];
        // Sort by voucher number desc
        vouchers.sort((a, b) => {
            const numA = parseInt((a.id || '').replace(/\D/g, '')) || 0;
            const numB = parseInt((b.id || '').replace(/\D/g, '')) || 0;
            return numB - numA;
        });

        const container = document.getElementById('vouchersTableContainer');
        if (!container) return;

        if (vouchers.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-wallet2 fs-1 d-block mb-3"></i>
                    No vouchers found.
                </div>
            `;
            return;
        }

        const html = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Voucher #</th>
                        <th>Type</th>
                        <th>Party / Account</th>
                        <th class="text-end">Amount</th>
                        <th class="text-center">Mode</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${vouchers.map(v => {
            const searchStr = `${v.id} ${v.customerName || ''} ${v.remarks || ''} ${v.paymentMode || ''}`.toLowerCase();
            const yearStr = DataManager.getFinancialYear(v.date);
            const typeStr = (v.type || 'general').toLowerCase();

            return `
                        <tr data-search="${searchStr}" data-year="${yearStr}" data-type="${typeStr}">
                            <td>${v.date}</td>
                            <td class="fw-bold text-info">${v.id}</td>
                            <td><span class="badge bg-${v.type === 'receipt' ? 'success' : (v.type === 'payment' ? 'danger' : 'warning')} text-capitalize">${v.type || 'General'}</span></td>
                            <td>
                                ${v.customerName || v.customerId || 'N/A'}
                                ${v.linkedInvoiceId ? `<br><small class="text-muted"><i class="bi bi-link-45deg"></i> Inv: ${v.linkedInvoiceId}</small>` : ''}
                            </td>
                            <td class="text-end">₹${parseFloat(v.amount).toFixed(2)}</td>
                            <td class="text-center text-secondary">${v.paymentMode || 'Cash'}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="VouchersUI.previewVoucher('${v.id}')" title="View Voucher">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-light ms-1" onclick="VouchersUI.generatePDF('${v.id}')" title="Print/PDF">
                                    <i class="bi bi-printer"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger ms-1" onclick="VouchersUI.deleteVoucher('${v.id}')" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        this.filterVouchers();
    },

    filterVouchers() {
        const query = document.getElementById('voucherSearch') ? document.getElementById('voucherSearch').value.toLowerCase() : '';
        const yearFilter = document.getElementById('filterVoucherYear') ? document.getElementById('filterVoucherYear').value : '';
        const typeFilter = document.getElementById('filterVoucherType') ? document.getElementById('filterVoucherType').value : '';

        const rows = document.querySelectorAll('#vouchersTableContainer tbody tr');

        requestAnimationFrame(() => {
            rows.forEach(row => {
                const searchMatch = !query || (row.dataset.search || '').includes(query);
                const yearMatch = !yearFilter || (row.dataset.year === yearFilter);
                const typeMatch = !typeFilter || (row.dataset.type === typeFilter);

                if (searchMatch && yearMatch && typeMatch) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    },

    showCreateModal(type = 'receipt') {
        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }

        const customerOptions = customers.map(c => `<option value="${c.name}">${c.phone || ''}</option>`).join('');

        // Define titles based on type
        const isPayment = type === 'payment';
        const title = isPayment ? 'Payment Out (To Supplier)' : 'Receipt In (From Customer)';

        const modalHtml = `
            <div class="modal fade" id="createVoucherModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered"> <!-- XL modal for more space -->
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-wallet2 me-2"></i>New Voucher - ${title}</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="createVoucherForm">
                                <div class="row mb-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Type</label>
                                        <select class="form-select bg-secondary text-white border-secondary" name="type" id="voucherType" onchange="VouchersUI.toggleReferenceFields(this.value)">
                                            <option value="receipt" ${!isPayment ? 'selected' : ''}>Receipt (From Customer)</option>
                                            <option value="payment" ${isPayment ? 'selected' : ''}>Payment (To Vendor)</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Date</label>
                                        <input type="date" class="form-control bg-secondary text-white border-secondary" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                                    </div>
                                    <div class="col-md-6" id="invoiceSelectContainer">
                                        <label class="form-label" id="lblParty">Party Name</label>
                                        <div class="position-relative">
                                            <input type="text" class="form-control bg-secondary text-white border-secondary" id="voucherPartySearch" name="customerName" placeholder="Type to search party..." autocomplete="off" required>
                                            <div id="voucherPartyDropdown" class="list-group position-absolute w-100 shadow d-none" style="z-index: 1050; max-height: 250px; overflow-y: auto;">
                                                <!-- Dropdown items here -->
                                            </div>
                                        </div>
                                        <input type="hidden" name="customerId" id="voucherCustomerId">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                     <div class="col-md-3">
                                        <label class="form-label">Amount</label>
                                        <input type="number" class="form-control bg-secondary text-white border-secondary" name="amount" min="0" step="0.01" required>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Payment Mode</label>
                                        <select class="form-select bg-secondary text-white border-secondary" name="paymentMode" onchange="VouchersUI.onPaymentModeChange(this)">
                                            <option value="cash">Cash</option>
                                            <option value="bank">Bank Transfer</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="upi">UPI/Online</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3" id="refNoContainer" style="display:none;">
                                        <label class="form-label">Ref/Cheque No.</label>
                                        <input type="text" class="form-control bg-secondary text-white border-secondary" name="refNo" placeholder="Cheque/Ref No">
                                    </div>
                                    <div class="col-md-2" id="tdsContainer">
                                        <label class="form-label text-warning">TDS Amount</label>
                                        <input type="number" class="form-control bg-dark border-warning text-warning" name="tdsAmount" id="tdsAmount" value="0" min="0" step="0.01" oninput="VouchersUI.calculateTotal()" placeholder="TDS">
                                    </div>
                                     <div class="col-md-4" id="remarksContainer"> <!-- Widened if ref hidden -->
                                        <label class="form-label">Remarks</label>
                                        <input type="text" class="form-control bg-secondary text-white border-secondary" name="remarks" placeholder="Optional remarks">
                                    </div>
                                </div>
                                
                                <!-- Invoice Linking Section -->
                                <div id="invoiceLinkingSection" class="border border-secondary p-2 rounded mb-3 d-none">
                                    <label class="form-label small text-info fw-bold">Select Pending Invoices/Bills:</label>
                                     <div class="table-responsive" style="max-height: 200px; overflow-y: auto;">
                                        <table class="table table-dark table-sm table-bordered border-secondary" id="pendingInvoicesTable">
                                            <thead class="sticky-top bg-secondary">
                                                <tr>
                                                    <th width="30"></th> <!-- Checkbox -->
                                                    <th>Invoice No / Date</th>
                                                    <th class="text-end">Total</th>
                                                    <th class="text-end">Pending</th>
                                                    <th width="120" class="text-end">Amount to Pay</th>
                                                </tr>
                                            </thead>
                                            <tbody id="pendingInvoicesBody">
                                                <!-- Rows injected via JS -->
                                            </tbody>
                                            <tfoot>
                                                <tr class="fw-bold">
                                                    <td colspan="4" class="text-end pe-3">Advance Payment / On Account:</td>
                                                    <td class="p-0"><input type="number" class="form-control form-control-sm bg-dark text-white border-0 text-end" id="advanceAmount" value="0.00" oninput="VouchersUI.calculateTotal()" /></td>
                                                </tr>
                                                <tr class="fw-bold table-active">
                                                    <td colspan="4" class="text-end pe-3">Total Voucher Amount:</td>
                                                    <td class="text-end" id="totalVoucherAmount">0.00</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                     </div>
                                </div>
                                <!-- Hidden Fields -->
                                <input type="hidden" name="bankDescription" id="bankDescription">
                                <input type="hidden" name="bankTxIndex" id="bankTxIndex">
                                <input type="hidden" name="finalAmount" id="finalAmount">
                                <input type="hidden" name="linkedInvoicesJSON" id="linkedInvoicesJSON">

                            </form>
                        </div>
                        <div class="modal-footer border-secondary">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="VouchersUI.saveVoucher()">Save Voucher</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('createVoucherModal'));
        
        // Setup the custom dropdown logic
        this.setupPartyDropdown();
        
        modal.show();
    },

    onPaymentModeChange(select) {
        const refContainer = document.getElementById('refNoContainer');
        const remarksContainer = document.getElementById('remarksContainer');

        if (select.value === 'cheque' || select.value === 'upi' || select.value === 'bank') {
            refContainer.style.display = 'block';
            remarksContainer.className = 'col-md-3';
        } else {
            refContainer.style.display = 'none';
            remarksContainer.className = 'col-md-6';
        }
    },

    // --- Bank Statement Import Logic ---

    async importBankStatement() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv, .xlsx, .xls';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Get raw JSON keeping headers intact
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                if (jsonData.length < 2) {
                    App.showNotification('File is empty or invalid format.', 'error');
                    return;
                }

                // Find header row (skip empty top rows)
                let headerIdx = 0;
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i].filter(cell => cell !== null && cell !== '');
                    if (row.length > 2) {
                        headerIdx = i;
                        break;
                    }
                }

                const headers = jsonData[headerIdx].map(h => String(h || '').trim());
                const rows = jsonData.slice(headerIdx + 1).filter(r => r.some(c => c !== ''));

                const mapping = BankImportHelper.detectColumns(headers);
                const transactions = BankImportHelper.mapToTransactions(rows, mapping);

                this.showStatementProcessingModal(transactions);
            };
            
            reader.readAsArrayBuffer(file);
        };
        fileInput.click();
    },

    showStatementProcessingModal(transactions) {
        const modalHtml = `
            <div class="modal fade" id="bankStatementModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-centered">
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-bank me-2"></i>Process Bank Statement</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="alert alert-info m-3 py-2 small">
                                <i class="bi bi-info-circle me-1"></i> Click on a transaction to create a voucher.
                            </div>
                            <div class="table-responsive" style="max-height: 60vh;">
                                <table class="table table-dark table-hover table-sm mb-0 align-middle">
                                    <thead class="sticky-top bg-dark">
                                        <tr>
                                            <th>Date</th>
                                            <th>Description</th>
                                            <th class="text-end">Debit</th>
                                            <th class="text-end">Credit</th>
                                            <th class="text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${transactions.map((tx, index) => {
            const isDebit = tx.type === 'debit';

            // Check for match
            const match = VoucherManager.resolveBankParty(tx.description);
            const matchHtml = match ? `<span class="badge bg-primary ms-1"><i class="bi bi-magic"></i> ${match}</span>` : '';

            // Render Action Button or Imported Status
            let actionHtml = '';
            
            // Duplicate Check: if party is resolved, check if already imported
            const alreadyVouchered = match && VoucherManager.checkDuplicateVoucher(match, tx.amount, tx.date);

            if (tx.converted || alreadyVouchered) {
                actionHtml = `<span class="badge bg-success p-2"><i class="bi bi-check-circle-fill me-1"></i> ${alreadyVouchered ? 'Already Exists' : 'Imported'}</span>`;
                tx.converted = true; // Mark as converted locally for row styling
            } else {
                actionHtml = `
                    <button class="btn btn-sm btn-${isDebit ? 'outline-warning' : 'outline-info'}" 
                            onclick="VouchersUI.convertBankTx(${index})">
                        <i class="bi bi-${isDebit ? 'arrow-up-right' : 'arrow-down-left'}"></i>
                        ${isDebit ? 'Payment' : 'Receipt'}
                    </button>`;
            }

            return `
                                            <tr class="${tx.converted ? 'table-active opacity-50' : ''}">
                                                <td class="small">${new Date(tx.date).toLocaleDateString()}</td>
                                                <td class="small" style="max-width: 300px;">
                                                    <div class="text-truncate" title="${tx.description}">${tx.description}</div>
                                                    ${matchHtml}
                                                </td>
                                                <td class="text-end text-danger fw-bold">${isDebit ? tx.amount.toFixed(2) : ''}</td>
                                                <td class="text-end text-success fw-bold">${!isDebit ? tx.amount.toFixed(2) : ''}</td>
                                                <td class="text-center">
                                                    ${actionHtml}
                                                </td>
                                            </tr>
                                            `;
        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <span class="text-muted small me-auto"><i class="bi bi-info-circle me-1"></i> New vouchers created here can be exported to Excel.</span>
                            <button type="button" class="btn btn-outline-success" onclick="VouchersUI.exportVouchersToExcel()">
                                <i class="bi bi-file-earmark-excel"></i> Export Vouchers as Excel
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing to avoid duplicate IDs in DOM
        const existing = document.getElementById('bankStatementModal');
        if (existing) {
            const modalInstance = bootstrap.Modal.getInstance(existing);
            if (modalInstance) modalInstance.dispose();
            existing.remove();
        }
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Cleanup any stuck backdrops before showing
        this.cleanupBackdrops();

        const modalEl = document.getElementById('bankStatementModal');

        // Add filter bar dynamically after insert
        const allMatches = [...new Set(
            transactions
                .map(tx => VoucherManager.resolveBankParty(tx.description))
                .filter(Boolean)
        )].sort();

        const filterBarHtml = `
            <div class="d-flex gap-2 align-items-center flex-wrap px-3 pb-2 pt-0">
                <input type="text" id="bsPartyFilter" class="form-control form-control-sm bg-secondary text-white border-secondary" style="max-width:250px;" placeholder="Filter by party name..." oninput="VouchersUI.filterBankRows()">
                <select id="bsTypeFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="">All Types</option>
                    <option value="debit">Debit (Payments)</option>
                    <option value="credit">Credit (Receipts)</option>
                </select>
                <select id="bsStatusFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="imported">Imported</option>
                    <option value="matched">Auto-Matched</option>
                </select>
                <span id="bsRowCount" class="text-muted small ms-auto"></span>
            </div>
        `;
        const modalBody = modalEl.querySelector('.modal-body');
        const alertDiv = modalBody.querySelector('.alert');
        alertDiv.insertAdjacentHTML('afterend', filterBarHtml);
        VouchersUI.filterBankRows(); // Init count

        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Ensure clicking close cleans up
        modalEl.addEventListener('hidden.bs.modal', () => {
            this.cleanupBackdrops();
        });

        // Store transactions temporarily
        this.currentBankTransactions = transactions;
    },

    cleanupBackdrops() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    },

    filterBankRows() {
        const partyQ = (document.getElementById('bsPartyFilter')?.value || '').toLowerCase();
        const typeQ = (document.getElementById('bsTypeFilter')?.value || '');
        const statusQ = (document.getElementById('bsStatusFilter')?.value || '');
        const rows = document.querySelectorAll('#bankStatementModal tbody tr');
        let visible = 0;

        rows.forEach(row => {
            const desc = (row.querySelector('td:nth-child(2)')?.textContent || '').toLowerCase();
            const isDebit = row.querySelector('td:nth-child(3)')?.textContent.trim() !== '';
            const isImported = row.classList.contains('table-active');
            const hasMatch = row.querySelector('.badge.bg-primary') !== null;

            const partyOk = !partyQ || desc.includes(partyQ);
            const typeOk = !typeQ || (typeQ === 'debit' && isDebit) || (typeQ === 'credit' && !isDebit);
            let statusOk = true;
            if (statusQ === 'imported') statusOk = isImported;
            else if (statusQ === 'pending') statusOk = !isImported;
            else if (statusQ === 'matched') statusOk = hasMatch;

            const show = partyOk && typeOk && statusOk;
            row.style.display = show ? '' : 'none';
            if (show) visible++;
        });

        const counter = document.getElementById('bsRowCount');
        if (counter) counter.textContent = `${visible} of ${rows.length} transactions`;
    },

    convertBankTx(index) {
        const tx = this.currentBankTransactions[index];
        if (!tx) return;

        // Hide statement modal momentarily (or keep open behind)
        // bootstrap.Modal.getInstance(document.getElementById('bankStatementModal')).hide();

        // Open generic Voucher Create Modal pre-filled
        this.showCreateModal(tx.type === 'debit' ? 'payment' : 'receipt');

        // Use timeout to allow modal to render
        setTimeout(() => {
            const form = document.getElementById('createVoucherForm');
            if (form) {
                // Pre-fill Amount
                const amtField = form.querySelector('#finalAmount'); // Use the hidden field for final amount
                if (amtField) amtField.value = tx.amount;
                const visibleAmtField = form.querySelector('[name="amount"]');
                if (visibleAmtField) visibleAmtField.value = tx.amount;

                // Pre-fill Date
                const dateField = form.querySelector('[name="date"]');
                if (dateField && tx.date) {
                    dateField.value = tx.date.toISOString().split('T')[0];
                }

                // Pre-fill Remarks
                const remarksField = form.querySelector('[name="remarks"]');
                if (remarksField) remarksField.value = `Bank Import: ${tx.description}`;

                // NEW: Populate Hidden Bank Desc for Learning
                const bankDescField = form.querySelector('#bankDescription');
                if (bankDescField) bankDescField.value = tx.description;

                // NEW: Track Index for 'Imported' Status
                const indexField = form.querySelector('#bankTxIndex');
                if (indexField) indexField.value = index;

                // NEW: Try to Auto-Resolve Party
                if (tx) {
                    const resolvedName = VoucherManager.resolveBankParty(tx.description);
                    if (resolvedName) {
                        // Find the customer ID
                        const customers = DataManager.getData('customers') || [];
                        const found = customers.find(c => c.name === resolvedName);
                        const resolvedId = found ? found.id : '';

                        // Use the new selectParty to show badge and load invoices
                        setTimeout(() => {
                            VouchersUI.selectParty(resolvedName, resolvedId);
                        }, 350); // Give extra time after the first timeout renders form
                    }
                }
                // Set Payment Mode and Detect Cheque
                const modeField = form.querySelector('[name="paymentMode"]');
                const refField = form.querySelector('[name="refNo"]');

                let mode = 'bank'; // Default to Bank (Transfer)
                let refNo = '';

                // Cheque Detection
                const descUpper = tx.description.toUpperCase();
                if (descUpper.includes('CHQ') || descUpper.includes('CHEQUE') || descUpper.includes('CLG')) {
                    mode = 'cheque';
                    // Extract number: Look for 6 digit number typical of cheques
                    const chqMatch = tx.description.match(/\b\d{6}\b/);
                    if (chqMatch) {
                        refNo = chqMatch[0];
                    } else {
                        // Fallback: finding any number block > 3 digits
                        const anyNum = tx.description.match(/\d{4,}/);
                        if (anyNum) refNo = anyNum[0];
                    }
                }

                if (modeField) {
                    modeField.value = mode;
                    // Trigger UI update to show reference field
                    VouchersUI.onPaymentModeChange(modeField);
                }

                if (refField && refNo) {
                    refField.value = refNo;
                }
            }
        }, 300);
    },

    toggleReferenceFields(type) {
        // Delegate to onTypeChange if passing element, or handle value directly
        const select = document.getElementById('voucherType');
        if (select) this.onTypeChange(select);
    },

    onTypeChange(select) {
        const lbl = document.getElementById('lblParty');
        if (select.value === 'contra') {
            lbl.textContent = 'Deposit/Withdraw To';
            document.getElementById('invoiceSelectContainer').style.display = 'none';
        } else {
            lbl.textContent = 'Party Name';
            document.getElementById('invoiceSelectContainer').style.display = 'block';
        }
    },

    setupPartyDropdown() {
        const input = document.getElementById('voucherPartySearch');
        const dropdown = document.getElementById('voucherPartyDropdown');
        if (!input || !dropdown) return;

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        });

        // Show/filter dropdown on typing
        input.addEventListener('input', (e) => {
            document.getElementById('voucherCustomerId').value = ''; // Reset ID when typing
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        });

        // Show dropdown on focus
        input.addEventListener('focus', (e) => {
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        });
        
        // Handle explicit clearing via input property
        input.addEventListener('change', () => {
            if (input.value.trim() === '') {
                this.onPartySelect(input);
            }
        });
    },

    handlePartySearch(query) {
        const dropdown = document.getElementById('voucherPartyDropdown');
        if (!dropdown) return;

        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }

        const lowerQuery = query.toLowerCase();
        let matches = customers;

        if (query.trim() !== '') {
            matches = customers.filter(c => 
                (c.name && c.name.toLowerCase().includes(lowerQuery)) || 
                (c.phone && String(c.phone).toLowerCase().includes(lowerQuery))
            );
        }

        if (matches.length === 0) {
            dropdown.innerHTML = '<div class="list-group-item bg-dark text-muted border-secondary">No matching accounts found</div>';
            return;
        }

        // Render matches (top 50 max to prevent lag)
        dropdown.innerHTML = matches.slice(0, 50).map(c => `
            <button type="button" class="list-group-item list-group-item-action list-group-item-dark border-secondary d-flex justify-content-between align-items-center"
                    onclick="VouchersUI.selectParty('${c.name.replace(/'/g, "\\'")}', '${c.id}')">
                <span class="fw-bold text-info">${c.name}</span>
                <small class="text-secondary">${c.phone || ''}</small>
            </button>
        `).join('');
    },

    selectParty(name, id) {
        const input = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        const dropdown = document.getElementById('voucherPartyDropdown');

        if (input) input.value = name;
        if (hiddenId) hiddenId.value = id;
        if (dropdown) dropdown.classList.add('d-none');

        // Look up extra info for the badge
        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }
        const found = customers.find(c => c.id === id);
        const phone = found ? String(found.phone || '') : '';

        // Hide search input and show styled badge
        const wrapper = input ? input.closest('.position-relative') : null;
        if (wrapper) {
            // Remove any existing badge
            const existing = document.getElementById('voucherPartyBadge');
            if (existing) existing.remove();

            input.style.display = 'none';

            const badge = document.createElement('div');
            badge.id = 'voucherPartyBadge';
            badge.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:8px;background:linear-gradient(135deg,#0d47a1,#1565c0);border:1px solid #42a5f5;box-shadow:0 0 12px rgba(66,165,245,0.45);cursor:default;';
            badge.innerHTML = `
                <i class="bi bi-person-fill" style="color:#90caf9;font-size:1.2rem;"></i>
                <div style="flex:1;line-height:1.2;">
                    <div style="font-weight:700;color:#e3f2fd;font-size:1rem;">${name}</div>
                    ${phone ? `<div style="font-size:0.78rem;color:#90caf9;">${phone}</div>` : ''}
                </div>
                <button type="button" title="Change Party" style="background:none;border:none;color:#90caf9;font-size:1.1rem;cursor:pointer;padding:0 4px;" onclick="VouchersUI.clearPartySelection()">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            `;
            wrapper.insertBefore(badge, wrapper.firstChild);
        }

        // Trigger loading of invoices immediately
        this.onPartySelect(input);
    },

    clearPartySelection() {
        const input = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        const badge = document.getElementById('voucherPartyBadge');
        const container = document.getElementById('invoiceLinkingSection');

        if (badge) badge.remove();
        if (input) {
            input.style.display = '';
            input.value = '';
            input.focus();
        }
        if (hiddenId) hiddenId.value = '';
        if (container) container.classList.add('d-none');
    },

    onPartySelect(input) {
        const name = input.value;
        const customers = DataManager.getData('customers') || [];
        const customer = customers.find(c => c.name === name);

        const container = document.getElementById('invoiceLinkingSection');
        const tbody = document.getElementById('pendingInvoicesBody');
        const voucherType = document.getElementById('voucherType').value;
        tbody.innerHTML = '';

        if (!name) {
            container.classList.add('d-none');
            return;
        }

        let pendingDocs = [];
        const isPayment = voucherType === 'payment';

        if (isPayment) {
            // Load Pending Purchase Bills (Expenses)
            const expenses = DataManager.getData('gtes_expenses') || []; // Check correct key
            const purchases = DataManager.getData('purchases') || []; // Also check purchases table
            
            const allPurchaseLikeDocs = [...expenses, ...purchases];
            pendingDocs = allPurchaseLikeDocs.filter(doc =>
                (doc.vendor === name || doc.customerName === name || doc.partyName === name || doc.supplier === name) && 
                (doc.status !== 'paid')
            );

        } else {
            // Load Pending Sales Invoices
            const allInvoices = DataManager.getData('invoices') || [];
            pendingDocs = allInvoices.filter(inv =>
                (inv.customerId === (customer?.id || '') || inv.customerName === name) &&
                inv.status !== 'cancelled' &&
                inv.status !== 'paid'
            );
        }

        // Sort by date
        pendingDocs.sort((a, b) => new Date(a.date) - new Date(b.date));

        if (pendingDocs.length > 0) {
            container.classList.remove('d-none');
            // Update Header Label
            const lbl = container.querySelector('label');
            if (lbl) lbl.textContent = isPayment ? 'Select Pending Purchase Bills:' : 'Select Pending Invoices:';

            pendingDocs.forEach(doc => {
                const tr = document.createElement('tr');
                const docNo = doc.invoiceNo || doc.billNo || doc.vch_no || doc.id;
                const total = parseFloat(doc.total || doc.amount || 0).toFixed(2);
                let pending = total; // Ideally calculate pending balance if partial payments exist

                tr.innerHTML = `
                    <td class="text-center align-middle">
                        <input class="form-check-input invoice-check" type="checkbox" 
                               value="${doc.id}" 
                               data-amount="${pending}" 
                               data-no="${docNo}"
                               onchange="VouchersUI.calculateTotal(this)">
                    </td>
                    <td>
                        <div class="fw-bold">${isPayment ? 'Purchase' : 'Sales'}</div>
                        <div class="small text-muted d-flex align-items-center">
                            Bill No: ${docNo}
                            ${!isPayment ? `<button class="btn btn-link btn-sm p-0 ms-2 text-info" onclick="InvoicesUI.generateInvoicePDF('${doc.id}')" title="View Bill"><i class="bi bi-eye"></i></button>` : ''}
                        </div>
                        <div class="small text-muted">Date: ${doc.date}</div>
                    </td>
                    <td class="text-end align-middle">${total}</td>
                    <td class="text-end align-middle text-warning">${pending}</td>
                    <td class="align-middle p-1">
                        <input type="number" class="form-control form-control-sm bg-dark text-white border-secondary text-end pay-input" 
                               value="0" min="0" max="${pending}" step="0.01" 
                               oninput="VouchersUI.calculateTotal()" disabled>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            container.classList.add('d-none');
        }
    },

    calculateTotal(checkbox) {
        // Get the base transaction amount (the bank import / manually entered amount)
        const visibleAmountInput = document.querySelector('#createVoucherForm [name="amount"]');
        const txnAmount = parseFloat(visibleAmountInput ? visibleAmountInput.value : 0) || 0;

        // If a checkbox was toggled
        if (checkbox) {
            const row = checkbox.closest('tr');
            const input = row.querySelector('.pay-input');
            input.disabled = !checkbox.checked;

            if (checkbox.checked) {
                // Calculate how much is already allocated in OTHER checked rows
                let alreadyAllocated = 0;
                document.querySelectorAll('.pay-input:not(:disabled)').forEach(pi => {
                    if (pi !== input) {
                        alreadyAllocated += parseFloat(pi.value) || 0;
                    }
                });
                // Add current advance allocation too
                const advance = parseFloat(document.getElementById('advanceAmount')?.value) || 0;
                alreadyAllocated += advance;

                const remaining = Math.max(0, txnAmount - alreadyAllocated);
                const billAmount = parseFloat(checkbox.dataset.amount) || 0;

                // Fill min(billAmount, remaining) — partial payment if needed
                input.value = Math.min(billAmount, remaining).toFixed(2);
            } else {
                input.value = 0;
            }
        }

        // Now recalculate totals
        const inputs = document.querySelectorAll('.pay-input:not(:disabled)');
        let allocated = 0;
        const selectedIds = [];
        const invoiceNos = [];

        const allocations = [];

        inputs.forEach(input => {
            const val = parseFloat(input.value) || 0;
            allocated += val;
            if (val > 0) {
                const row = input.closest('tr');
                const cb = row.querySelector('.invoice-check');
                selectedIds.push(cb.value);
                const docNo = cb.dataset.no;
                invoiceNos.push(docNo);
                allocations.push({ id: cb.value, no: docNo, amount: val });
            }
        });

        // Store allocations in a hidden field for saveVoucher
        let allocField = document.getElementById('linkedAllocationsJSON');
        if (!allocField) {
            allocField = document.createElement('input');
            allocField.type = 'hidden';
            allocField.id = 'linkedAllocationsJSON';
            allocField.name = 'linkedAllocationsJSON';
            document.getElementById('createVoucherForm').appendChild(allocField);
        }
        allocField.value = JSON.stringify(allocations);

        // Add Advance and TDS amounts
        const advance = parseFloat(document.getElementById('advanceAmount')?.value) || 0;
        const tds = parseFloat(document.getElementById('tdsAmount')?.value) || 0;
        allocated += (advance + tds);

        const remaining = txnAmount - (allocated - tds); // Total expected including TDS from the bill perspective
        // Actually, if bill is 100.103 and cash is 100,000, TDS is 103.
        // Allocated (Invoices) = 100,103.
        // Allocated (Total) = 100,103.
        // Remaining = 100,000 (Bank) - (100,103 (Alloc) - 103 (TDS)) = 0.
        const balance = txnAmount - (allocated - tds);

        // Update the running balance display
        const totalDisplay = document.getElementById('totalVoucherAmount');
        if (totalDisplay) totalDisplay.textContent = allocated.toFixed(2);

        // Show/update balance summary banner
        let banner = document.getElementById('voucherBalanceBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'voucherBalanceBanner';
            const section = document.getElementById('invoiceLinkingSection');
            if (section) section.appendChild(banner);
        }
        banner.className = balance < 0 
            ? 'alert alert-danger py-1 px-2 mt-2 mb-0 small d-flex justify-content-between'
            : balance === 0 
                ? 'alert alert-success py-1 px-2 mt-2 mb-0 small d-flex justify-content-between'
                : 'alert alert-info py-1 px-2 mt-2 mb-0 small d-flex justify-content-between';
        banner.innerHTML = `
            <span><i class="bi bi-wallet2 me-1"></i>Bank/Cash: <strong>₹${txnAmount.toFixed(2)}</strong></span>
            <span>Allocated: <strong>₹${allocated.toFixed(2)}</strong> (TDS: ₹${tds.toFixed(2)})</span>
            <span ${balance < 0 ? 'class="text-danger fw-bold"' : balance === 0 ? 'class="text-success fw-bold"' : ''}>
                ${balance < 0 ? '⚠️ Over by' : 'Balance'}: <strong>₹${Math.abs(balance).toFixed(2)}</strong>
            </span>
        `;

        // Update hidden fields
        const finalAmt = document.getElementById('finalAmount');
        if (finalAmt) finalAmt.value = allocated.toFixed(2);

        document.getElementById('linkedInvoicesJSON').value = JSON.stringify(selectedIds);

        // Auto narration
        const remarksInput = document.querySelector('#createVoucherForm [name="remarks"]');
        if (remarksInput && (!remarksInput.value || remarksInput.value.startsWith('Payment for Inv:'))) {
            if (invoiceNos.length > 0) {
                remarksInput.value = `Payment for Inv: ${invoiceNos.join(', ')}`;
            } else if (advance > 0) {
                remarksInput.value = "Advance Payment";
            } else {
                remarksInput.value = "";
            }
        }
    },

    async saveVoucher() {
        const form = document.getElementById('createVoucherForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const name = formData.get('customerName');

        // Lookup customer ID
        const customers = DataManager.getData('customers') || [];
        const found = customers.find(c => c.name === name);
        const customerId = found ? found.id : null;

        const linkedJson = formData.get('linkedInvoicesJSON');
        const linkedInvoices = linkedJson ? JSON.parse(linkedJson) : [];
        const allocatedAmount = parseFloat(formData.get('amount')) || 0;

        // --- NEW: Strict Bank Transaction Allocation Check ---
        const txIndex = formData.get('bankTxIndex');
        if (txIndex !== null && txIndex !== '' && this.currentBankTransactions) {
            const tx = this.currentBankTransactions[txIndex];
            if (tx) {
                // Allow a small floating point tolerance (e.g., 0.01)
                if (Math.abs(allocatedAmount - tx.amount) > 0.02) {
                    App.showNotification(`Please allocate the exact bank transaction amount (₹${tx.amount.toFixed(2)}) using invoices or the Advance Payment field. Current allocation: ₹${allocatedAmount.toFixed(2)}`, 'warning');
                    return; // Block saving
                }
            }
        }

        const allocJson = formData.get('linkedAllocationsJSON');
        const allocations = allocJson ? JSON.parse(allocJson) : [];

        const data = {
            type: formData.get('type'),
            date: formData.get('date'),
            customerName: name,
            customerId: customerId,
            amount: allocatedAmount,
            paymentMode: formData.get('paymentMode'),
            referenceId: formData.get('refNo'),
            linkedInvoiceId: linkedInvoices.length > 0 ? linkedInvoices[0] : null, // Legacy support
            linkedInvoices: linkedInvoices, // New array support
            allocations: allocations, // Detailed allocations
            tdsAmount: parseFloat(formData.get('tdsAmount') || 0),
            remarks: formData.get('remarks')
        };

        try {
            const newVoucher = await VoucherManager.createVoucher(data);

            // --- NEW: Learn Bank Mapping ---
            const bankDesc = formData.get('bankDescription');
            // Only save if it came from bank import AND user selected a valid party
            if (bankDesc && name && (data.paymentMode === 'Bank' || data.paymentMode === 'bank' || data.paymentMode === 'cheque')) {
                await VoucherManager.saveBankMapping(bankDesc, name);
            }

            const modal = bootstrap.Modal.getInstance(document.getElementById('createVoucherModal'));
            if (modal) modal.hide();
            
            this.cleanupBackdrops();
            this.updateTable();

            // --- NEW: Update Bank Statement Status ---
            if (txIndex !== null && txIndex !== '' && this.currentBankTransactions) {
                const idx = parseInt(txIndex);
                if (this.currentBankTransactions[idx]) {
                    this.currentBankTransactions[idx].converted = true;
                    this.currentBankTransactions[idx].voucherId = newVoucher.id; // Track for export
                    // Re-open the statement modal to continue processing
                    setTimeout(() => {
                        this.showStatementProcessingModal(this.currentBankTransactions);
                    }, 600);
                }
            }

        } catch (e) {
            console.error(e);
            alert('Error creating voucher: ' + e.message);
        }
    },

    async exportVouchersToExcel() {
        if (!this.currentBankTransactions) return;

        const sessionVouchers = this.currentBankTransactions
            .filter(tx => tx.converted && tx.voucherId)
            .map(tx => VoucherManager.getVoucher(tx.voucherId))
            .filter(v => v);

        if (sessionVouchers.length === 0) {
            App.showNotification('No vouchers exported yet in this session.', 'warning');
            return;
        }

        try {
            const dataForExport = sessionVouchers.map(v => {
                const isReceipt = v.type === 'receipt';
                const mode = v.paymentMode ? v.paymentMode.toLowerCase() : 'bank';
                const receivedInto = mode === 'cash' ? 'Cash' : 'Bank';
                
                // Format Allocation: "INV1:200;INV2:150;"
                const setOff = v.allocations ? v.allocations.map(a => `${a.no}:${a.amount}`).join(';') + ';' : '';

                return {
                    'Voucher Date (YYYY-MM-DD)': v.date,
                    'Receipt Number': v.id,
                    'Received Into': receivedInto,
                    'Received From': v.customerName || '',
                    'Amount': v.amount,
                    'Narration or Any Other Remarks': v.remarks || '',
                    'Set Off Voucher Number With Amount': setOff,
                    'Discount Account': '',
                    'Discount Amount': '',
                    'Tax Deduction Account': v.tdsAmount > 0 ? 'Tax Deducted Receivable' : '',
                    'Tax Deduction Amount': v.tdsAmount || '',
                    'Payment Mode': v.paymentMode || '',
                    'Debit/Credit/Cheque/Transection/Reference Number': v.referenceId || '',
                    'Bank Name': '',
                    'Remarks': ''
                };
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(dataForExport);
            XLSX.utils.book_append_sheet(wb, ws, "Vouchers");
            XLSX.writeFile(wb, `Voucher_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

            App.showNotification('Vouchers exported successfully!', 'success');
        } catch (error) {
            console.error('Excel Export Error:', error);
            App.showNotification('Export failed: ' + error.message, 'error');
        }
    },

    async pushToBookKeeperBackup() {
        if (typeof ExportImportHelper !== 'undefined') {
            await ExportImportHelper.generateAllInOneXML();
        } else {
            App.showNotification('Export/Import module not loaded', 'error');
        }
    },

    async deleteVoucher(id) {
        if (!confirm('Are you sure you want to delete this voucher?')) return;
        await VoucherManager.deleteVoucher(id);
        this.updateTable();
    },

    async getVoucherElement(voucherId) {
        const voucher = VoucherManager.getVoucher(voucherId);
        if (!voucher) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const companyName = settings.companyName || 'My Company';
        const address = settings.registeredAddress || settings.address || '';

        const element = document.createElement('div');
        element.style.width = '600px';
        element.style.padding = '30px';
        element.style.background = 'white';
        element.style.color = 'black';
        element.style.fontFamily = "'Inter', sans-serif";
        element.style.border = '1px solid #ddd';

        const typeLabel = voucher.type === 'receipt' ? 'Receipt Voucher' : (voucher.type === 'payment' ? 'Payment Voucher' : 'Contra Voucher');

        element.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                <h2 style="margin: 0; text-transform: uppercase;">${typeLabel}</h2>
                <h3 style="margin: 5px 0 0; font-weight: normal; font-size: 16px;">${companyName}</h3>
                <p style="margin: 0; font-size: 12px; color: #666;">${address}</p>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <div>
                     <strong>Voucher No:</strong> ${voucher.id}<br>
                     <strong>Date:</strong> ${voucher.date}
                </div>
                <div style="text-align: right;">
                    <strong>Mode:</strong> ${voucher.paymentMode || voucher.mode} ${voucher.referenceId ? '(' + voucher.referenceId + ')' : ''}
                </div>
            </div>

            <div style="background: #f9f9f9; padding: 15px; margin-bottom: 20px;">
                <div style="margin-bottom: 10px;">
                    <span style="color: #666; font-size: 12px; text-transform: uppercase;">${voucher.type === 'receipt' ? 'Received From' : 'Paid To'}</span><br>
                    <strong style="font-size: 18px;">${voucher.customerName || 'Unknown Party'}</strong>
                </div>
                <div style="display: flex; gap: 30px;">
                    <div style="margin-bottom: 10px;">
                        <span style="color: #666; font-size: 12px; text-transform: uppercase;">Amount (Bank/Cash)</span><br>
                        <strong style="font-size: 20px;">₹${parseFloat(voucher.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    ${voucher.tdsAmount > 0 ? `
                    <div style="margin-bottom: 10px;">
                        <span style="color: #666; font-size: 12px; text-transform: uppercase;">TDS Deduction</span><br>
                        <strong style="font-size: 20px; color: #b45309;">₹${parseFloat(voucher.tdsAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <span style="color: #666; font-size: 12px; text-transform: uppercase;">Total Adjustable</span><br>
                        <strong style="font-size: 20px;">₹${(parseFloat(voucher.amount) + parseFloat(voucher.tdsAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    ` : ''}
                </div>
                 ${voucher.remarks || voucher.narration ? `
                <div>
                    <span style="color: #666; font-size: 12px; text-transform: uppercase;">Remarks</span><br>
                    <span>${voucher.remarks || voucher.narration}</span>
                </div>` : ''}
            </div>

            ${this.renderLinkedDocuments(voucher)}

            <div style="display: flex; justify-content: space-between; margin-top: 50px; padding-top: 20px;">
                <div style="text-align: center; width: 150px; border-top: 1px solid #ccc;">
                    <span style="font-size: 12px; color: #666;">Accountant</span>
                </div>
                <div style="text-align: center; width: 150px; border-top: 1px solid #ccc;">
                    <span style="font-size: 12px; color: #666;">Authorized Signatory</span>
                </div>
            </div>
        `;
        return element;
    },

    renderLinkedDocuments(voucher) {
        const linked = voucher.linkedInvoices || [];
        if (linked.length === 0) return '';

        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];

        const rows = linked.map(link => {
            const docId = typeof link === 'object' ? link.id : link;
            const amount = typeof link === 'object' ? (parseFloat(link.amount) || 0) : voucher.amount;

            // Try to find the document for extra details
            const doc = invoices.find(i => i.id === docId) || expenses.find(e => e.id === docId);
            const date = doc ? doc.date : '-';
            const refNo = doc ? (doc.invoiceNo || doc.billNo || docId) : (link.billNo || docId);
            const supplierRef = doc ? (doc.supplierBillNo || '-') : (link.supplierBillNo || '-');

            return `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px;">${refNo}</td>
                    <td style="padding: 10px;">${date}</td>
                    <td style="padding: 10px;">${supplierRef}</td>
                    <td style="padding: 10px; text-align: right;">₹${amount.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div style="margin-top: 30px;">
                <h4 style="font-size: 14px; text-transform: uppercase; color: #333; margin-bottom: 10px;">Remittance Details</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <thead>
                        <tr style="background: #f8f9fa; border-top: 2px solid #333; border-bottom: 1px solid #333;">
                            <th style="padding: 10px; text-align: left;">Invoice No. Reference</th>
                            <th style="padding: 10px; text-align: left;">Date</th>
                            <th style="padding: 10px; text-align: left;">Supplier Invoice No</th>
                            <th style="padding: 10px; text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    },

    async generatePDF(voucherId) {
        const element = await this.getVoucherElement(voucherId);
        if (!element) return;

        const opt = {
            margin: 10,
            filename: `Voucher_${voucherId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
    },

    async previewVoucher(voucherId) {
        const element = await this.getVoucherElement(voucherId);
        if (!element) return;

        const container = document.getElementById('pdfPreviewContainer');
        const title = document.getElementById('pdfPreviewTitle');
        const downloadBtn = document.getElementById('pdfDownloadBtn');

        container.innerHTML = '';
        container.appendChild(element);
        title.textContent = 'Voucher Preview';

        downloadBtn.onclick = () => this.generatePDF(voucherId);

        const modal = new bootstrap.Modal(document.getElementById('pdfPreviewModal'));
        modal.show();
    },
};

window.VouchersUI = VouchersUI;
