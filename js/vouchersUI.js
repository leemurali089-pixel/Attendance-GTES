/**
 * Vouchers UI Module
 * Handles display, creation, and printing of Vouchers (Receipts/Payments)
 * Integrated with Synced Data
 */
const VouchersUI = {
    currentMode: 'gst', // 'gst', 'non-gst', or 'purchase'
    
    async init() {
        console.log('Vouchers UI Initialized');
    },

    load(params = {}) {
        const mode = params.mode || null;
        if (!mode) {
            this.renderSubSelection();
        } else {
            this.currentMode = mode;
            this.renderVouchersList();
        }
    },

    renderSubSelection() {
        const view = document.getElementById('vouchersView');
        if (!view) return;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cash-stack text-info me-2"></i> Vouchers</h2>
                    <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                        <i class="bi bi-arrow-left"></i> Back to Accounting
                    </button>
                </div>
                
                <div class="row g-4 justify-content-center pt-5">
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'gst'})" style="cursor:pointer">
                            <i class="bi bi-cash-stack text-success display-1 mb-4"></i>
                            <h3 class="card-title text-white">GST Vouchers</h3>
                            <p class="text-muted">Taxable Receipts/Payments</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'non-gst'})" style="cursor:pointer">
                            <i class="bi bi-wallet2 text-info display-1 mb-4"></i>
                            <h3 class="card-title text-white">Plain Vouchers</h3>
                            <p class="text-muted">Cash/Bank (No GST)</p>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="VouchersUI.load({mode: 'purchase'})" style="cursor:pointer">
                            <i class="bi bi-journal-check text-warning display-1 mb-4"></i>
                            <h3 class="card-title text-white">Purchase Vouchers</h3>
                            <p class="text-muted">Expense Tracking</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
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
                    <h2><i class="bi bi-cash-stack text-info me-2"></i> ${this.currentMode === 'gst' ? 'GST Vouchers' : (this.currentMode === 'purchase' ? 'Purchase Vouchers' : 'Plain Vouchers')}</h2>
                    <div>
                        <button class="btn btn-secondary btn-sm me-2" onclick="VouchersUI.importBankStatement()">
                            <i class="bi bi-bank"></i> Import Bank Statement
                        </button>
                        <button class="btn btn-outline-info btn-sm me-2" onclick="ExportImportHelper.openImportExport('vouchers')">
                            <i class="bi bi-arrow-left-right me-1"></i> Export/Import
                        </button>
                        <button class="btn btn-primary btn-sm me-2" onclick="VouchersUI.showCreateModal('${this.currentMode === 'purchase' ? 'payment' : 'receipt'}')">
                            <i class="bi bi-plus-lg"></i> New ${this.currentMode === 'purchase' ? 'Purchase' : 'Voucher'}
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="VouchersUI.load()">
                            <i class="bi bi-arrow-left"></i> Back to Selection
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
                             <input type="text" class="form-control bg-dark text-light border-secondary" id="voucherSearch" placeholder="Search vouchers by number, party, or remarks..." oninput="VouchersUI.filterVouchersDebounced()">
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
        let vouchers = DataManager.getData('vouchers') || [];
        
        // Refactored logic based on user feedback:
        // Purchase Vouchers Mode: Show Payments (Out)
        // GST Vouchers Mode: Show Receipts (In)
        
        if (this.currentMode === 'purchase') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'payment');
        } else if (this.currentMode === 'gst') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'receipt' && v.hasGst !== false);
        } else if (this.currentMode === 'non-gst') {
            vouchers = (DataManager.getData('vouchers') || []).filter(v => v.type === 'receipt' && v.hasGst === false);
        }

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
                    ${vouchers.filter(v => {
                        // If we are in purchase mode, we already filtered the list to items that are purchases
                        if (this.currentMode === 'purchase') {
                            return true;
                        }

                        // Exclude purchases from both GST and Plain voucher views
                        if (v.isPurchase || v.type === 'purchase') return false;

                        // GST Voucher: has GST flag OR legacy imports (hasGst is undefined)
                        // Explicitly exclude plain vouchers (hasGst === false)
                        if (this.currentMode === 'gst') {
                            return v.hasGst !== false;
                        }
                        
                        // Plain Voucher: Explicitly marked as hasGst === false
                        return v.hasGst === false;
                    }).map(v => {
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
                            <td class="text-end">₹${(parseFloat(v.amount) + parseFloat(v.tdsAmount || 0) + parseFloat(v.discountAmount || 0)).toFixed(2)}</td>
                            <td class="text-center text-secondary">${v.paymentMode || 'Cash'}</td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-warning" onclick="VouchersUI.showEditVoucherModal('${v.id}')" title="Edit Voucher">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info ms-1" onclick="VouchersUI.previewVoucher('${v.id}')" title="View Voucher">
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

        // Cleanup existing modal if any
        const existing = document.getElementById('createVoucherModal');
        if (existing) {
            const inst = bootstrap.Modal.getInstance(existing);
            if (inst) inst.dispose();
            existing.remove();
        }

        const modalHtml = `
            <div class="modal fade" id="createVoucherModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable"> <!-- XL modal for more space -->
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-wallet2 me-2"></i>New Voucher - ${title}</h5>
                            <div>
                                <button type="button" class="btn btn-sm btn-link text-white" onclick="document.querySelector('#createVoucherModal .modal-dialog').classList.toggle('modal-fullscreen')" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 bg-dark text-white d-flex flex-column" style="max-height: calc(100vh - 120px); overflow: hidden;">
                            <style>
                                .vch-form-control {
                                    background: #1a1d20 !important;
                                    border: 1px solid #373b3e !important;
                                    color: #fff !important;
                                }
                                .vch-form-control:focus {
                                    background: #212529 !important;
                                    border-color: #0dcaf0 !important;
                                    box-shadow: 0 0 0 0.25rem rgba(13, 202, 240, 0.25) !important;
                                }
                                .highlight-vch {
                                    border: 1px solid #0dcaf0 !important;
                                    background: rgba(13, 202, 240, 0.05) !important;
                                    font-weight: bold;
                                    color: #0dcaf0 !important;
                                }
                                .vch-form-label {
                                    font-size: 0.8rem;
                                    color: #6c757d;
                                    margin-bottom: 0.25rem;
                                    font-weight: 500;
                                }
                            </style>
                            <form id="createVoucherForm" class="d-flex flex-column h-100">
                                <!-- Fixed Top Section -->
                                <div class="p-4 flex-shrink-0" style="background: var(--bs-dark); z-index: 10;">
                                    <div class="row mb-3">
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Type</div>
                                            <select class="form-select vch-form-control" name="type" id="voucherType" onchange="VouchersUI.onVoucherTypeChange(this.value)">
                                                <option value="receipt" ${!isPayment ? 'selected' : ''}>Receipt (From Customer)</option>
                                                <option value="payment" ${isPayment ? 'selected' : ''}>Payment (To Vendor)</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Voucher No.</div>
                                            <input type="text" class="form-control vch-form-control highlight-vch" name="voucherId" id="voucherIdField" value="${VoucherManager.getNextVoucherNumber(type)}" required>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Date</div>
                                            <input type="date" class="form-control vch-form-control" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                                        </div>
                                        <div class="col-md-6 mt-3 mt-md-0" id="invoiceSelectContainer">
                                            <div class="vch-form-label" id="lblParty">Party Name</div>
                                            <div class="position-relative">
                                                <input type="text" class="form-control vch-form-control" id="voucherPartySearch" name="customerName" placeholder="Type to search party..." autocomplete="off" required>
                                                <div id="voucherPartyDropdown" class="list-group position-absolute w-100 shadow d-none" style="z-index: 1050; max-height: 250px; overflow-y: auto;">
                                                    <!-- Dropdown items here -->
                                                </div>
                                            </div>
                                            <input type="hidden" name="customerId" id="voucherCustomerId">
                                            <input type="hidden" name="customerAddress" id="voucherCustomerAddress">
                                        </div>
                                    </div>
                                    <div class="row">
                                         <div class="col-md-3">
                                            <div class="vch-form-label">Amount</div>
                                            <input type="number" class="form-control vch-form-control" name="amount" min="0" step="0.01" required>
                                        </div>
                                        <div class="col-md-3">
                                            <div class="vch-form-label">Payment Mode</div>
                                            <select class="form-select vch-form-control" name="paymentMode" onchange="VouchersUI.onPaymentModeChange(this)">
                                                <option value="cash">Cash</option>
                                                <option value="bank">Bank Transfer</option>
                                                <option value="cheque">Cheque</option>
                                                <option value="upi">UPI/Online</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3" id="refNoContainer" style="display:none;">
                                            <div class="vch-form-label">Ref/Cheque No.</div>
                                            <input type="text" class="form-control vch-form-control" name="refNo" placeholder="Cheque/Ref No">
                                        </div>
                                        <div class="col-md-2" id="tdsContainer" style="${this.currentMode !== 'gst' ? 'display:none;' : ''}">
                                            <div class="vch-form-label text-warning">TDS Amount</div>
                                            <input type="number" class="form-control bg-dark border-warning text-warning" name="tdsAmount" id="tdsAmount" value="0" min="0" step="0.01" oninput="VouchersUI.calculateTotal()" placeholder="TDS">
                                        </div>
                                        <div class="col-md-2" id="discountContainer" style="${this.currentMode !== 'gst' ? 'display:none;' : ''}">
                                            <div class="vch-form-label text-info">Discount</div>
                                            <input type="number" class="form-control bg-dark border-info text-info" name="discountAmount" id="discountAmount" value="0" min="0" step="0.01" oninput="VouchersUI.calculateTotal()" placeholder="Discount">
                                        </div>
                                        <div class="col-md-2" id="remarksContainer">
                                            <div class="vch-form-label">Remarks</div>
                                            <input type="text" class="form-control vch-form-control" name="remarks" placeholder="Optional remarks">
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Scrollable Invoice Linking Section -->
                                <div id="invoiceLinkingSection" class="p-4 pt-1 d-none" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                                    <label class="form-label fw-bold text-info flex-shrink-0"><i class="bi bi-link-45deg"></i> Select Pending Invoices:</label>
                                    <div class="table-responsive border border-secondary rounded" style="background: rgba(0,0,0,0.2); flex: 1; overflow-y: auto;">
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
                        <div class="modal-footer border-secondary mt-auto">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="VouchersUI.saveVoucher()">Save Voucher</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('createVoucherModal');
        const modal = new bootstrap.Modal(modalEl);
        
        // Setup the custom dropdown logic
        this.setupPartyDropdown();
        
        modalEl.addEventListener('hidden.bs.modal', function() {
            this.remove(); // Self-destruct after hiding to clean up DOM
        });

        modal.show();
    },

    onVoucherTypeChange(type) {
        this.toggleReferenceFields(type);
        
        // Update Voucher No for the new type
        const idField = document.getElementById('voucherIdField');
        if (idField) {
            idField.value = VoucherManager.getNextVoucherNumber(type);
        }
    },

    toggleReferenceFields(type) {
        // Simple placeholder if needed, current implementation doesn't strictly need logic here 
        // as onVoucherTypeChange handles it, but keeping for compatibility.
    },

    onPaymentModeChange(select) {
        const refContainer = document.getElementById('refNoContainer');
        const remarksContainer = document.getElementById('remarksContainer');
        const discountContainer = document.getElementById('discountContainer');

        if (select.value === 'cheque' || select.value === 'upi' || select.value === 'bank') {
            refContainer.style.display = 'block';
            remarksContainer.className = 'col-md-2';
        } else {
            refContainer.style.display = 'none';
            remarksContainer.className = 'col-md-4';
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

    renderBankRow(tx, index) {
        const isDebit = tx.type === 'debit';
        const match = VoucherManager.resolveBankParty(tx.description);
        const matchHtml = match ? `<span class="badge bg-primary ms-1"><i class="bi bi-magic"></i> ${match}</span>` : '';

        let actionHtml = '';
        const alreadyVouchered = match && VoucherManager.checkDuplicateVoucher(match, tx.amount, tx.date);

        if (tx.converted || alreadyVouchered) {
            actionHtml = `<span class="badge bg-success p-2"><i class="bi bi-check-circle-fill me-1"></i> ${alreadyVouchered ? 'Already Exists' : 'Imported'}</span>`;
            tx.converted = true;
        } else if (tx.isReady) {
            actionHtml = `
                <div class="d-flex flex-column gap-1">
                    <span class="badge bg-warning p-2 text-dark mb-1"><i class="bi bi-clock-history me-1"></i> Ready to Import</span>
                    <button class="btn btn-sm btn-outline-info" onclick="VouchersUI.convertBankTx(${index})">
                        <i class="bi bi-pencil"></i> Edit Details
                    </button>
                </div>`;
        } else {
            actionHtml = `
                <div class="d-flex gap-1 justify-content-center flex-wrap">
                    <button class="btn btn-sm btn-${isDebit ? 'outline-warning' : 'outline-info'}" 
                            onclick="VouchersUI.convertBankTx(${index})">
                        <i class="bi bi-${isDebit ? 'arrow-up-right' : 'arrow-down-left'}"></i>
                        ${isDebit ? 'Payment' : 'Receipt'}
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" 
                            onclick="VouchersUI.assignBankParty(${index})" title="Link to party name for future auto-matching">
                        <i class="bi bi-person-plus"></i> Assign Party
                    </button>
                    <button class="btn btn-sm btn-outline-primary" 
                            onclick="VouchersUI.showAssignToVoucherModal(${index})" title="Link to an existing voucher (allows amount differences)">
                        <i class="bi bi-link-45deg"></i> Link Voucher
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="VouchersUI.deleteBankRow(${index})" title="Delete this transaction">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>`;
        }

        return `
            <tr class="${tx.converted ? 'table-active opacity-50' : (tx.isReady ? 'table-warning bg-opacity-10' : '')}" data-index="${index}">
                <td class="text-center align-middle">
                    <input type="checkbox" class="form-check-input bs-row-checkbox" value="${index}" onchange="VouchersUI.updateBankSelectionStatus()">
                </td>
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
    },

    showStatementProcessingModal(transactions) {
        this.currentBankTransactions = transactions;
        
        // Remove existing to avoid duplicate IDs in DOM
        const existing = document.getElementById('bankStatementModal');
        
        if (existing) {
            // Partial refresh: update only the tbody if modal already open
            const tbody = existing.querySelector('tbody');
            if (tbody) {
                tbody.innerHTML = transactions.map((tx, index) => this.renderBankRow(tx, index)).join('');
                this.filterBankRows();
                return;
            }
        }

        let isFullscreen = false;
        if (existing) {
            isFullscreen = existing.querySelector('.modal-dialog')?.classList.contains('modal-fullscreen');
            const modalInstance = bootstrap.Modal.getInstance(existing);
            if (modalInstance) modalInstance.dispose();
            existing.remove();
        }

        const modalHtml = `
            <div class="modal fade" id="bankStatementModal" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable ${isFullscreen ? 'modal-fullscreen' : ''}">
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary">
                            <h5 class="modal-title"><i class="bi bi-bank me-2"></i>Process Bank Statement</h5>
                            <div>
                                <button type="button" class="btn btn-sm btn-link text-white" onclick="document.querySelector('#bankStatementModal .modal-dialog').classList.toggle('modal-fullscreen')" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body p-0 d-flex flex-column" style="height: ${isFullscreen ? 'calc(100vh - 120px)' : 'auto'};">
                            <div class="alert alert-info mx-3 my-2 py-1 small">
                                <i class="bi bi-info-circle me-1"></i> Click on a transaction to create a voucher or use checkboxes for bulk actions.
                            </div>
                            <div class="table-responsive flex-grow-1" style="max-height: ${isFullscreen ? 'calc(100vh - 200px)' : '75vh'};">
                                <table class="table table-dark table-hover table-sm mb-0 align-middle">
                                    <thead class="sticky-top">
                                        <tr style="background-color: #212529;">
                                            <th style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40; width: 40px;" class="text-center">
                                                <input type="checkbox" class="form-check-input" id="bsSelectAll" onchange="VouchersUI.toggleAllBankRows(this)">
                                            </th>
                                            <th style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40;">Date</th>
                                            <th style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40;">Description</th>
                                            <th class="text-end" style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40;">Debit</th>
                                            <th class="text-end" style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40;">Credit</th>
                                            <th class="text-center" style="background-color: #212529; color: #adb5bd; border-bottom: 2px solid #343a40;">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${transactions.map((tx, index) => this.renderBankRow(tx, index)).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="modal-footer border-secondary">
                            <span class="text-muted small me-auto"><i class="bi bi-info-circle me-1"></i> New vouchers created here can be exported to Excel.</span>
                            <button type="button" class="btn btn-outline-danger me-2" id="btnDeleteSelectedBankTx" onclick="VouchersUI.deleteSelectedBankRows()" disabled>
                                <i class="bi bi-trash"></i> Delete Selected
                            </button>
                            <button type="button" class="btn btn-primary me-2" id="btnImportSelectedBankTx" onclick="VouchersUI.importSelectedBankTransactions()" disabled>
                                <i class="bi bi-cloud-arrow-down"></i> Import Saved
                            </button>
                            <button type="button" class="btn btn-outline-success" onclick="VouchersUI.exportVouchersToExcel()">
                                <i class="bi bi-file-earmark-excel"></i> Export Vouchers as Excel
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Cleanup any stuck backdrops before showing
        this.cleanupBackdrops();

        const modalEl = document.getElementById('bankStatementModal');

        const filters = this.bsFilters || { party: '', type: '', status: '' };
        const filterBarHtml = `
            <div class="d-flex gap-2 align-items-center flex-wrap px-3 pb-2 pt-0">
                <input type="text" id="bsPartyFilter" class="form-control form-control-sm bg-secondary text-white border-secondary" style="max-width:250px;" placeholder="Filter by party name..." oninput="VouchersUI.filterBankRowsDebounced()" value="${filters.party}">
                <select id="bsTypeFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="" ${filters.type === '' ? 'selected' : ''}>All Types</option>
                    <option value="debit" ${filters.type === 'debit' ? 'selected' : ''}>Debit (Payments)</option>
                    <option value="credit" ${filters.type === 'credit' ? 'selected' : ''}>Credit (Receipts)</option>
                </select>
                <select id="bsStatusFilter" class="form-select form-select-sm bg-secondary text-white border-secondary" style="max-width:160px;" onchange="VouchersUI.filterBankRows()">
                    <option value="" ${filters.status === '' ? 'selected' : ''}>All Status</option>
                    <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="imported" ${filters.status === 'imported' ? 'selected' : ''}>Imported</option>
                    <option value="matched" ${filters.status === 'matched' ? 'selected' : ''}>Auto-Matched</option>
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
        modalEl.addEventListener('hidden.bs.modal', function() {
            this.remove(); 
        });

        // Store transactions temporarily
        this.currentBankTransactions = transactions;
    },

    filterBankRowsDebounced() {
        if (this.bsFilterTimeout) clearTimeout(this.bsFilterTimeout);
        this.bsFilterTimeout = setTimeout(() => {
            this.filterBankRows();
        }, 150); // Small delay to catch fast typers
    },

    cleanupBackdrops() {
        document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    },

    filterBankRows() {
        const partyRaw = document.getElementById('bsPartyFilter')?.value || '';
        const partyQ = partyRaw.toLowerCase();
        const typeQ = (document.getElementById('bsTypeFilter')?.value || '');
        const statusQ = (document.getElementById('bsStatusFilter')?.value || '');
        
        // Save for persistence
        this.bsFilters = { party: partyRaw, type: typeQ, status: statusQ };

        const rows = document.querySelectorAll('#bankStatementModal tbody tr');
        let visible = 0;

        rows.forEach(row => {
            // Using .cells for slightly better performance than querySelector
            const descTd = row.cells[2];
            const debitTd = row.cells[3];
            
            const desc = (descTd?.textContent || '').toLowerCase();
            const isDebit = debitTd?.textContent.trim() !== '';
            const isImported = row.classList.contains('table-active');
            const hasMatch = descTd?.querySelector('.badge.bg-primary') !== null;

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

        // Sync Select All checkbox and Import button
        this.updateBankSelectionStatus();
    },

    updateBankSelectionStatus() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        const btnDelete = document.getElementById('btnDeleteSelectedBankTx');
        const btnImport = document.getElementById('btnImportSelectedBankTx');
        
        if (btnDelete) btnDelete.disabled = checkboxes.length === 0;
        
        if (btnImport) {
            // Only enable import if at least one selected row is "Ready"
            let anyReady = false;
            checkboxes.forEach(cb => {
                const idx = parseInt(cb.value);
                const tx = this.currentBankTransactions[idx];
                if (tx && tx.isReady && !tx.converted) anyReady = true;
            });
            btnImport.disabled = !anyReady;
        }
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

    /**
     * Assign a party name to a bank transaction description without creating a voucher.
     * Saves the mapping to gtes_bank_alias for future auto-matching.
     */
    assignBankParty(index) {
        const tx = this.currentBankTransactions?.[index];
        if (!tx) return;

        // Remove any existing assign modal
        const oldModal = document.getElementById('assignPartyModal');
        if (oldModal) { bootstrap.Modal.getInstance(oldModal)?.dispose(); oldModal.remove(); }

        const amtColor = tx.type === 'debit' ? '#ff6b6b' : '#51cf66';
        const amtSign  = tx.type === 'debit' ? '-' : '+';

        const modalHtml = `
        <div class="modal fade" id="assignPartyModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered" style="max-width:520px;">
                <div class="modal-content border-0 shadow-lg" style="background:#1a1d23;">
                    <div class="modal-header border-0 pb-0 px-4 pt-4">
                        <h5 class="modal-title text-white fw-bold">
                            <i class="bi bi-person-plus me-2 text-info"></i>Assign Party
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body px-4 pt-3 pb-4">
                        <!-- Transaction info card -->
                        <div class="rounded-3 p-3 mb-4" style="background:#0d1117; border:1px solid #30363d;">
                            <div class="small mb-1" style="text-transform:uppercase;letter-spacing:.05em;font-size:.7rem;color:#94a3b8;">Transaction Description</div>
                            <div class="text-white mb-2" style="font-size:.85rem;word-break:break-all;">${tx.description}</div>
                            <div class="d-flex gap-3 small">
                                <span><span style="color:#94a3b8;">Amount:</span> <strong style="color:${amtColor};">${amtSign}₹${tx.amount.toFixed(2)}</strong></span>
                                <span style="color:#30363d;">|</span>
                                <span><span style="color:#94a3b8;">Date:</span> <strong class="text-white">${new Date(tx.date).toLocaleDateString('en-IN')}</strong></span>
                            </div>
                        </div>

                        <!-- Party search -->
                        <div class="mb-1 small fw-bold text-white">Select or type Party Name</div>
                        <div class="position-relative mb-2">
                            <input type="text" id="assignPartySearchInput"
                                class="form-control fw-bold"
                                style="background:#0d1117;border:1px solid #58a6ff;color:#e6edf3;font-size:.95rem;"
                                placeholder="Search party..." autocomplete="off">
                            <div id="assignPartyDropdown"
                                class="list-group position-absolute w-100 shadow-lg d-none"
                                style="z-index:2000;max-height:220px;overflow-y:auto;background:#161b22;border:1px solid #30363d;border-radius:8px;top:calc(100% + 4px);">
                            </div>
                        </div>
                        <div class="small" style="color:#8b949e;">
                            <i class="bi bi-info-circle me-1"></i>Saves the mapping for future auto-matching. <strong class="text-white">No voucher will be created.</strong>
                        </div>
                    </div>
                    <div class="modal-footer border-0 px-4 pb-4 pt-0 d-flex justify-content-between">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" id="assignPartySaveBtn" class="btn btn-info text-dark fw-bold" onclick="VouchersUI.confirmAssignParty(${index})">
                            <i class="bi bi-check2 me-1"></i>Save Mapping
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('assignPartyModal');
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Setup custom live-search dropdown with keyboard navigation
        modalEl.addEventListener('shown.bs.modal', () => {
            const searchInput   = document.getElementById('assignPartySearchInput');
            const dropdown      = document.getElementById('assignPartyDropdown');
            if (!searchInput || !dropdown) return;

            let customers = typeof CustomerManager !== 'undefined'
                ? CustomerManager.getAllCustomers()
                : (DataManager.getData('customers') || []);

            let activeIdx = -1;

            const renderDropdown = (query) => {
                const q = (query || '').toLowerCase().trim();
                activeIdx = -1;
                let matches = q
                    ? customers.filter(c =>
                        (c.name || '').toLowerCase().includes(q) ||
                        String(c.phone || '').includes(q))
                    : customers;
                matches = matches.slice(0, 60);

                if (!matches.length) {
                    dropdown.innerHTML = '<div class="px-3 py-2 small" style="color:#8b949e;">No matching parties found</div>';
                    dropdown.classList.remove('d-none');
                    return;
                }

                dropdown.innerHTML = matches.map((c, i) => `
                    <button type="button"
                        class="list-group-item list-group-item-action border-0 d-flex justify-content-between align-items-center assignPartyItem"
                        style="background:#161b22;color:#e6edf3;font-size:.88rem;padding:8px 12px;"
                        data-name="${c.name.replace(/"/g,'&quot;')}"
                        data-idx="${i}"
                        onmouseenter="this.style.background='#1f2937'"
                        onmouseleave="this.style.background=this.classList.contains('active-item')?'#0d47a1':'#161b22'"
                        onclick="VouchersUI._assignPartyPick('${c.name.replace(/'/g,"\\'")}')">
                        <span class="fw-bold text-info">${c.name}</span>
                        <small style="color:#8b949e;">${c.phone || ''}</small>
                    </button>`).join('');
                dropdown.classList.remove('d-none');
            };

            let dropdownTimeout = null;
            searchInput.addEventListener('input', (e) => {
                if (dropdownTimeout) clearTimeout(dropdownTimeout);
                dropdownTimeout = setTimeout(() => {
                    renderDropdown(e.target.value);
                }, 150);
            });
            searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));

            // Keyboard navigation
            searchInput.addEventListener('keydown', (e) => {
                const items = dropdown.querySelectorAll('.assignPartyItem');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    activeIdx = Math.min(activeIdx + 1, items.length - 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    activeIdx = Math.max(activeIdx - 1, 0);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (activeIdx >= 0 && items[activeIdx]) items[activeIdx].click();
                    else if (searchInput.value.trim()) document.getElementById('assignPartySaveBtn')?.click();
                    return;
                } else if (e.key === 'Escape') {
                    dropdown.classList.add('d-none');
                    return;
                } else { return; }

                items.forEach((el, i) => {
                    const active = i === activeIdx;
                    el.classList.toggle('active-item', active);
                    el.style.background = active ? '#0d47a1' : '#161b22';
                    el.style.color = active ? '#fff' : '#e6edf3';
                });
                if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
            });

            // Close dropdown on outside click
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add('d-none');
                }
            }, { once: false });

            searchInput.focus();
        });
    },

    // Called when user picks a party from the dropdown list
    _assignPartyPick(name) {
        const searchInput = document.getElementById('assignPartySearchInput');
        const dropdown    = document.getElementById('assignPartyDropdown');
        if (searchInput) searchInput.value = name;
        if (dropdown) dropdown.classList.add('d-none');
    },

    async confirmAssignParty(index) {
        const partyName = document.getElementById('assignPartySearchInput')?.value?.trim();
        if (!partyName) {
            App.showNotification('Please select or type a party name.', 'warning');
            return;
        }

        const tx = this.currentBankTransactions?.[index];
        if (!tx) return;

        await VoucherManager.saveBankMapping(tx.description, partyName);
        tx.assignedParty = partyName;

        const modalEl = document.getElementById('assignPartyModal');
        bootstrap.Modal.getInstance(modalEl)?.hide();

        App.showNotification(`"${partyName}" assigned. Future imports will auto-match this description.`, 'success');
        this.showStatementProcessingModal(this.currentBankTransactions);
    },

    // --- Bulk Selection and Deletion Methods ---

    toggleAllBankRows(headerCheckbox) {
        const isChecked = headerCheckbox.checked;
        const rows = document.querySelectorAll('#bankStatementModal tbody tr');
        rows.forEach(row => {
            // Only toggle checkboxes that are VISIBLE (not filtered out)
            if (row.style.display !== 'none') {
                const cb = row.querySelector('.bs-row-checkbox');
                if (cb) cb.checked = isChecked;
            }
        });
        this.updateBankSelectionStatus();
    },

    updateBankSelectionStatus() {
        const allCheckboxes = Array.from(document.querySelectorAll('.bs-row-checkbox'));
        // Filter to only those in VISIBLE rows
        const visibleCheckboxes = allCheckboxes.filter(cb => {
            const row = cb.closest('tr');
            return row && row.style.display !== 'none';
        });

        const checkedVisibleCount = visibleCheckboxes.filter(cb => cb.checked).length;
        const totalVisible = visibleCheckboxes.length;
        
        const selectAllCb = document.getElementById('bsSelectAll');
        if (selectAllCb) {
            selectAllCb.checked = totalVisible > 0 && checkedVisibleCount === totalVisible;
            selectAllCb.indeterminate = checkedVisibleCount > 0 && checkedVisibleCount < totalVisible;
        }

        // Count ALL checked for the delete button (even hidden ones, or we can restrict to visible)
        // User said "delete the selected transaction", usually implies visible ones if following the filter focus.
        const totalCheckedAnywhere = allCheckboxes.filter(cb => cb.checked).length;

        const deleteBtn = document.getElementById('btnDeleteSelectedBankTx');
        if (deleteBtn) {
            deleteBtn.disabled = totalCheckedAnywhere === 0;
            deleteBtn.innerHTML = `<i class="bi bi-trash"></i> Delete Selected (${totalCheckedAnywhere})`;
        }
    },

    deleteBankRow(index) {
        if (!confirm('Are you sure you want to delete this transaction from the import list?')) return;
        
        this.currentBankTransactions.splice(index, 1);
        this.showStatementProcessingModal(this.currentBankTransactions);
        App.showNotification('Transaction removed.', 'info');
    },

    deleteSelectedBankRows() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        if (checkboxes.length === 0) return;

        if (!confirm(`Are you sure you want to delete ${checkboxes.length} selected transactions?`)) return;

        // Get indices to delete, sort descending to splice correctly
        const indices = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => b - a);
        
        indices.forEach(idx => {
            this.currentBankTransactions.splice(idx, 1);
        });

        this.showStatementProcessingModal(this.currentBankTransactions);
        App.showNotification(`${indices.length} transactions removed.`, 'info');
    },

    // --- Assign to Existing Voucher Logic ---

    showAssignToVoucherModal(index) {
        const tx = this.currentBankTransactions[index];
        if (!tx) return;

        const resolvedParty = VoucherManager.resolveBankParty(tx.description) || '';
        
        // Fetch all potential documents
        let allVouchers = (VoucherManager.getAllVouchers() || []).map(v => ({
            ...v,
            voucherId: v.voucherId || v.id || 'N/A' // Standarize ID field
        }));
        
        const purchases = DataManager.getData('purchases') || [];
        
        // Combine with purchases if it's a debit (payment)
        if (tx.type === 'debit') {
            const transformedPurchases = purchases.map(p => ({
                voucherId: p.id || p.invoiceNo || p.billNo || 'EXP-N/A',
                date: p.date,
                customerName: p.vendor || p.customerName || p.partyName || 'Unknown Party',
                amount: parseFloat(p.amount || p.total || 0),
                type: 'purchase'
            }));
            allVouchers = [...allVouchers, ...transformedPurchases];
        }

        const oldModal = document.getElementById('assignToVoucherModal');
        if (oldModal) { bootstrap.Modal.getInstance(oldModal)?.dispose(); oldModal.remove(); }

        const modalHtml = `
        <div class="modal fade" id="assignToVoucherModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content border-0 shadow-lg bg-dark text-white">
                    <div class="modal-header border-secondary p-4">
                        <h5 class="modal-title fw-bold">
                            <i class="bi bi-link-45deg me-2 text-primary"></i>Link to Existing ${tx.type === 'debit' ? 'Purchase/Payment' : 'Receipt'}
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div class="bg-black bg-opacity-25 rounded p-3 mb-4 border border-secondary shadow-sm">
                            <div class="row g-2 small text-muted text-uppercase mb-2">
                                <div class="col-6">Bank Transaction</div>
                                <div class="col-3 text-end">Amount</div>
                                <div class="col-3 text-end">Date</div>
                            </div>
                            <div class="row g-2 align-items-center fw-bold">
                                <div class="col-6 text-truncate" title="${tx.description}">${tx.description}</div>
                                <div class="col-3 text-end text-${tx.type === 'debit' ? 'danger' : 'success'}" id="linkBankAmount">₹${tx.amount.toFixed(2)}</div>
                                <div class="col-3 text-end">${new Date(tx.date).toLocaleDateString()}</div>
                            </div>
                        </div>

                        <!-- Adjustment Section (initially hidden) -->
                        <div id="linkAdjustmentContainer" class="mb-4 p-3 bg-secondary bg-opacity-25 rounded border border-info d-none">
                            <h6 class="text-info mb-2 small fw-bold text-uppercase">Amount Difference Detected</h6>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <span class="small">Difference to account for:</span>
                                <span class="fw-bold text-warning" id="linkDiffAmount">₹0.00</span>
                            </div>
                            <div class="row g-3 align-items-end">
                                <div class="col-md-5">
                                    <label class="form-label small text-muted">Identify Difference As:</label>
                                    <select id="linkDiffType" class="form-select form-select-sm bg-dark text-white border-secondary">
                                        <option value="discount">Discount Given/Received</option>
                                        <option value="tds">Tax (TDS) Deducted</option>
                                        <option value="other">Other/Ignore</option>
                                    </select>
                                </div>
                                <div class="col-md-7">
                                    <button class="btn btn-sm btn-info w-100" id="btnConfirmWithAdjustment">
                                        <i class="bi bi-check-circle me-1"></i> Apply Adjustment & Link
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label small text-muted">Select an existing voucher to link:</label>
                            <div class="input-group">
                                <span class="input-group-text bg-secondary border-secondary text-white"><i class="bi bi-search"></i></span>
                                <input type="text" id="voucherLinkSearch" class="form-control bg-dark border-secondary text-white" placeholder="Search by Voucher No, Party Name or Amount..." value="${resolvedParty}">
                            </div>
                        </div>

                        <div class="table-responsive" style="max-height: 250px;">
                            <table class="table table-dark table-hover table-sm border-secondary mb-0">
                                <thead class="sticky-top bg-dark">
                                    <tr class="small text-muted">
                                        <th>No</th>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Party</th>
                                        <th class="text-end">Amount</th>
                                    </tr>
                                </thead>
                                <tbody id="voucherLinkResults">
                                    <!-- Search results here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer border-secondary p-3">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('assignToVoucherModal');
        const modal = new bootstrap.Modal(modalEl);
        
        const searchInput = document.getElementById('voucherLinkSearch');
        const resultsTable = document.getElementById('voucherLinkResults');
        const adjContainer = document.getElementById('linkAdjustmentContainer');
        const diffText = document.getElementById('linkDiffAmount');
        const btnAdjust = document.getElementById('btnConfirmWithAdjustment');

        let selectedVoucher = null;

        const renderResults = (query) => {
            const q = (query || '').toLowerCase();
            const matches = allVouchers.filter(v => {
                // Filter by type matching bank transaction direction
                const typeMatches = tx.type === 'debit' ? 
                    (v.type === 'payment' || v.type === 'purchase' || v.isPurchase) : 
                    (v.type === 'receipt');
                
                if (!typeMatches) return false;

                const vId = String(v.voucherId || '').toLowerCase();
                const vName = String(v.customerName || '').toLowerCase();
                const vAmt = String(v.amount || '').toLowerCase();

                return vId.includes(q) || vName.includes(q) || vAmt.includes(q);
            }).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

            if (matches.length === 0) {
                resultsTable.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted small">No matching vouchers found for this type.</td></tr>';
                return;
            }

            resultsTable.innerHTML = matches.map(v => `
                <tr style="cursor: pointer" class="link-row" data-vid="${v.voucherId}" data-amt="${v.amount}">
                    <td class="small opacity-75">${v.voucherId}</td>
                    <td class="small">${new Date(v.date).toLocaleDateString()}</td>
                    <td class="small"><span class="badge bg-outline-secondary border border-secondary text-uppercase" style="font-size:0.6rem;">${v.type || 'VCH'}</span></td>
                    <td class="small text-truncate" style="max-width:150px;">${v.customerName}</td>
                    <td class="text-end fw-bold">₹${v.amount.toFixed(2)}</td>
                </tr>
            `).join('');

            // Add click handlers for selection behavior
            resultsTable.querySelectorAll('.link-row').forEach(row => {
                row.onclick = () => {
                    resultsTable.querySelectorAll('.link-row').forEach(r => r.classList.remove('table-primary'));
                    row.classList.add('table-primary');
                    
                    const vAmt = parseFloat(row.dataset.amt);
                    const vId = row.dataset.vid;
                    selectedVoucher = matches.find(m => m.voucherId === vId);

                    const diff = vAmt - tx.amount;
                    if (Math.abs(diff) > 0.05) {
                        adjContainer.classList.remove('d-none');
                        diffText.textContent = `₹${diff.toFixed(2)} (${diff > 0 ? 'Less received' : 'Over received'})`;
                        adjContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    } else {
                        adjContainer.classList.add('d-none');
                        // If tiny difference, just confirm immediately
                        VouchersUI.confirmAssignToVoucher(index, vId);
                    }
                };
            });
        };

        btnAdjust.onclick = () => {
            if (!selectedVoucher) return;
            const diffType = document.getElementById('linkDiffType').value;
            const diffAmt = selectedVoucher.amount - tx.amount;
            
            VouchersUI.confirmAssignToVoucher(index, selectedVoucher.voucherId, {
                type: diffType,
                amount: diffAmt
            });
        };

        searchInput.addEventListener('input', (e) => {
            if (this._linkSearchTimeout) clearTimeout(this._linkSearchTimeout);
            this._linkSearchTimeout = setTimeout(() => renderResults(e.target.value), 200);
        });
        renderResults(searchInput.value); // Initial load with pre-filled party

        modal.show();
        modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    },

    async confirmAssignToVoucher(txIndex, voucherId, adjustment = null) {
        const tx = this.currentBankTransactions[txIndex];
        if (!tx) return;

        if (adjustment) {
            const reason = adjustment.type === 'tds' ? 'Tax (TDS)' : (adjustment.type === 'discount' ? 'Discount' : 'Adjustment');
            if (!confirm(`Linking to ${voucherId} with ${reason} of ₹${adjustment.amount.toFixed(2)}. Correct?`)) return;
            
            try {
                await VoucherManager.updateVoucherAdjustment(voucherId, {
                    tdsAmount: adjustment.type === 'tds' ? adjustment.amount : 0,
                    discountAmount: adjustment.type === 'discount' ? adjustment.amount : 0,
                    remarks: `Linked to bank transaction on ${new Date(tx.date).toLocaleDateString()} (${tx.description})`
                });
            } catch (e) {
                console.error(e);
                App.showNotification('Error updating voucher adjustments.', 'danger');
            }
        } else {
            if (!confirm(`Are you sure you want to link this transaction to Voucher ${voucherId}?`)) return;
        }

        tx.converted = true;
        tx.linkedVoucherId = voucherId;
        
        // Close modal
        const modalEl = document.getElementById('assignToVoucherModal');
        bootstrap.Modal.getInstance(modalEl)?.hide();

        App.showNotification(`Transaction linked to Voucher ${voucherId}.`, 'success');
        this.showStatementProcessingModal(this.currentBankTransactions);
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
        const modalEl = document.getElementById('createVoucherModal');
        if (!input || !dropdown) return;

        // Use AbortController to cleanly remove ALL listeners when modal closes
        const controller = new AbortController();
        const signal = controller.signal;

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        }, { signal });

        // Show/filter dropdown on typing
        input.addEventListener('input', (e) => {
            document.getElementById('voucherCustomerId').value = ''; // Reset ID when typing
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        }, { signal });

        // Show dropdown on focus
        input.addEventListener('focus', (e) => {
            this.handlePartySearch(e.target.value);
            dropdown.classList.remove('d-none');
        }, { signal });
        
        // Handle explicit clearing
        input.addEventListener('change', () => {
            if (input.value.trim() === '') {
                this.onPartySelect(input);
            }
        }, { signal });

        // Auto-cleanup when modal closes
        if (modalEl) {
            modalEl.addEventListener('hidden.bs.modal', () => {
                controller.abort();
            }, { once: true });
        }
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

        // Look up customer info (done once at top to avoid reference errors)
        let customers = [];
        if (typeof CustomerManager !== 'undefined') {
            customers = CustomerManager.getAllCustomers();
        } else {
            customers = DataManager.getData('customers') || [];
        }
        const found = customers.find(c => c.id === id);
        const phone = found ? String(found.phone || '') : '';

        // Populate hidden customer address field
        const hiddenAddr = document.getElementById('voucherCustomerAddress');
        if (hiddenAddr) hiddenAddr.value = found?.address || '';

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
            const expenses = DataManager.getData('gtes_expenses') || []; 
            const purchases = DataManager.getData('purchases') || []; 
            
            // Deduplicate by ID to prevent same bill appearing twice
            // Use same priority as line 1554 for the key to ensure consistency
            const uniqueDocsMap = new Map();
            [...expenses, ...purchases].forEach(doc => {
                const key = (doc.invoiceNo || doc.billNo || doc.vch_no || doc.id || '').toString();
                if (key && !uniqueDocsMap.has(key)) {
                    uniqueDocsMap.set(key, doc);
                }
            });
            
            pendingDocs = Array.from(uniqueDocsMap.values()).filter(doc =>
                (doc.vendor === name || doc.customerName === name || doc.partyName === name || doc.supplier === name) && 
                (doc.status !== 'paid' && doc.status !== 'cancelled')
            );

        } else {
            // Load Pending Sales Invoices
            const allInvoices = DataManager.getData('invoices') || [];
            pendingDocs = allInvoices.filter(inv => {
                const nameMatch = (inv.customerId === (customer?.id || '') || inv.customerName === name);
                const statusMatch = (inv.status !== 'cancelled' && inv.status !== 'paid');
                
                // Mode Match Filter - Improved robustness
                let modeMatch = true;
                const invType = (inv.type || '').toLowerCase();
                
                if (this.currentMode === 'gst') {
                    // Show only GST invoices (including legacy with no type or 'with-bill')
                    modeMatch = (invType === 'gst-invoice' || invType === 'with-bill' || !invType || invType === 'sales-gst');
                } else if (this.currentMode === 'non-gst') {
                    // Show only Plain invoices
                    modeMatch = (invType === 'non-gst-invoice' || invType === 'without-bill' || invType === 'sales-non-gst');
                }
                
                return nameMatch && statusMatch && modeMatch;
            });
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
                const totalAmountNum = parseFloat(doc.total || doc.amount || doc.vch_amt || 0);
                const total = totalAmountNum.toFixed(2);
                
                // NEW: Use VoucherManager to get actual pending balance
                const pendingNum = VoucherManager.getDocumentBalance(doc.id, totalAmountNum);
                const pending = pendingNum.toFixed(2);
                
                // Skip if practically zero
                if (pendingNum <= 0.01) return;

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
                            <button type="button" class="btn btn-link btn-sm p-0 ms-2 text-info" 
                                    onclick="${isPayment ? `InvoicesUI.previewPurchase` : `InvoicesUI.previewInvoice`}('${doc.id}')" 
                                    title="View ${isPayment ? 'Bill' : 'Invoice'}">
                                <i class="bi bi-eye"></i>
                            </button>
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
        const bankAmount = parseFloat(visibleAmountInput ? visibleAmountInput.value : 0) || 0;

        // NEW: Calculate Total Settlement (Gross)
        const tds = parseFloat(document.getElementById('tdsAmount')?.value) || 0;
        const discount = parseFloat(document.getElementById('discountAmount')?.value) || 0;
        const totalSettlement = bankAmount + tds + discount;

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

                const remaining = Math.max(0, totalSettlement - alreadyAllocated);
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

        // Add Advance amount
        const advance = parseFloat(document.getElementById('advanceAmount')?.value) || 0;

        // Proportionally distribute TDS and Discount across allocations
        const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        if (allocations.length > 0 && totalAllocated > 0) {
            allocations.forEach(a => {
                const ratio = a.amount / totalAllocated;
                a.tdsAmount = parseFloat((tds * ratio).toFixed(2));
                a.discountAmount = parseFloat((discount * ratio).toFixed(2));
            });
        }

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

        allocated += advance;
 
        const balance = totalSettlement - allocated;

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
            <span><i class="bi bi-wallet2 me-1"></i>Bank/Cash: <strong>₹${bankAmount.toFixed(2)}</strong></span>
            <span>Total Settlement: <strong>₹${totalSettlement.toFixed(2)}</strong> (TDS: ₹${tds.toFixed(2)}, Disc: ₹${discount.toFixed(2)})</span>
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
            id: formData.get('voucherId'),
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
            discountAmount: parseFloat(formData.get('discountAmount') || 0),
            remarks: formData.get('remarks'),
            customerAddress: formData.get('customerAddress') || '',
            hasGst: this.currentMode === 'gst',
            isPurchase: this.currentMode === 'purchase'
        };

        try {
            // If it's a bank import mapping, we only SAVE it to the session, not the database yet
            if (txIndex !== null && txIndex !== '' && this.currentBankTransactions) {
                const idx = parseInt(txIndex);
                if (this.currentBankTransactions[idx]) {
                    this.currentBankTransactions[idx].isReady = true;
                    this.currentBankTransactions[idx].mappedVoucher = data; // Unify field naming
                    
                    // Record this serial locally to ensure immediate auto-increment correctness for the next row
                    if (typeof VoucherManager.recordUsedSerial === 'function') {
                        VoucherManager.recordUsedSerial(data.type, data.id);
                    }

                    // --- Learning Mapping ---
                    const bankDesc = formData.get('bankDescription');
                    if (bankDesc && name && (data.paymentMode === 'Bank' || data.paymentMode === 'bank' || data.paymentMode === 'cheque')) {
                        VoucherManager.saveBankMapping(bankDesc, name); // Async update but don't await to block UI
                    }

                    const modalEl = document.getElementById('createVoucherModal');
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modalEl) {
                        modalEl.addEventListener('hidden.bs.modal', () => {
                            this.showStatementProcessingModal(this.currentBankTransactions);
                        }, { once: true });
                        modal.hide();
                    }
                    App.showNotification(`Details for ${data.id} saved to session. Use "Import Saved" to finish.`, 'info');
                    return; 
                }
            }

            const newVoucher = await VoucherManager.createVoucher(data);

            // Record this serial locally to ensure immediate auto-increment correctness for the next row
            if (typeof VoucherManager.recordUsedSerial === 'function') {
                VoucherManager.recordUsedSerial(data.type, data.id);
            }

            const modalEl = document.getElementById('createVoucherModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            
            if (modalEl) {
                modalEl.addEventListener('hidden.bs.modal', () => {
                    this.updateTable();
                }, { once: true });
                modal.hide();
            } else {
                this.updateTable();
            }

        } catch (e) {
            console.error(e);
            alert('Error creating voucher: ' + e.message);
        }
    },

    async importSelectedBankTransactions() {
        const checkboxes = document.querySelectorAll('.bs-row-checkbox:checked');
        const readyIndices = [];
        checkboxes.forEach(cb => {
            const idx = parseInt(cb.value);
            const tx = this.currentBankTransactions[idx];
            if (tx && tx.isReady && !tx.converted) {
                readyIndices.push(idx);
            }
        });

        if (readyIndices.length === 0) {
            App.showNotification('No ready transactions selected for import.', 'warning');
            return;
        }

        if (!confirm(`Import ${readyIndices.length} saved transactions to Vouchers?`)) return;

        let successCount = 0;
        let failCount = 0;

        for (const idx of readyIndices) {
            const tx = this.currentBankTransactions[idx];
            try {
                const newVoucher = await VoucherManager.createVoucher(tx.mappedData);
                tx.converted = true;
                tx.voucherId = newVoucher.id;
                successCount++;
            } catch (err) {
                console.error(`Import failed for index ${idx}:`, err);
                failCount++;
            }
        }

        App.showNotification(`Successfully imported ${successCount} vouchers.${failCount > 0 ? ` FAILED: ${failCount}` : ''}`, successCount > 0 ? 'success' : 'danger');
        
        // Refresh the table view and modal
        this.updateTable();
        this.showStatementProcessingModal(this.currentBankTransactions);
    },

    async exportVouchersToExcel() {
        if (!this.currentBankTransactions) return;

        // Pull vouchers from both already converted AND ready-to-import rows
        const sessionVouchers = this.currentBankTransactions
            .filter(tx => (tx.converted && tx.voucherId) || (tx.isReady && tx.mappedData))
            .map(tx => {
                if (tx.converted && tx.voucherId) {
                    return VoucherManager.getVoucher(tx.voucherId);
                } else if (tx.isReady && tx.mappedData) {
                    return tx.mappedData;
                }
                return null;
            })
            .filter(v => v);

        if (sessionVouchers.length === 0) {
            App.showNotification('No vouchers exported yet in this session.', 'warning');
            return;
        }

        try {
            const dataForExport = sessionVouchers.map(v => {
                const isReceipt = v.type === 'receipt';
                const modeRaw = v.paymentMode ? v.paymentMode.trim() : 'Bank';
                
                let paymentModeCol = 'Bank';
                let refCol = v.referenceId || '';

                if (modeRaw.toLowerCase() === 'cash') {
                    paymentModeCol = 'Cash';
                } else {
                    paymentModeCol = 'Bank';
                    // If no specific reference ID, use the payment sub-mode (Rtgs, Upi, etc.) as the reference
                    if (!refCol && modeRaw.toLowerCase() !== 'bank') {
                        refCol = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1).toLowerCase();
                    }
                }

                const receivedInto = (paymentModeCol === 'Cash') ? 'Cash' : 'Bank';
                
                // Format Allocation: "INV1:200;INV2:150;"
                const setOff = v.allocations ? v.allocations.map(a => `${a.no}:${a.amount}`).join(';') + ';' : '';

                return {
                    'Voucher Date (YYYY-MM-DD)': v.date,
                    'Receipt Number': v.id,
                    'Received Into': receivedInto,
                    'Received From': v.customerName || '',
                    'Amount': (parseFloat(v.amount) + parseFloat(v.tdsAmount || 0) + parseFloat(v.discountAmount || 0)),
                    'Narration or Any Other Remarks': v.remarks || '',
                    'Set Off Voucher Number With Amount': setOff,
                    'Discount Account': v.discountAmount > 0 ? 'Discount on Sale' : '',
                    'Discount Amount': v.discountAmount > 0 ? v.discountAmount : '',
                    'Tax Deduction Account': v.tdsAmount > 0 ? 'Tax Deducted Receivable' : '',
                    'Tax Deduction Amount': v.tdsAmount > 0 ? v.tdsAmount : '',
                    'Payment Mode': paymentModeCol,
                    'Debit/Credit/Cheque/Transection/Reference Number': refCol,
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

        // Before deleting, check which invoices this voucher was linked to
        const voucher = VoucherManager.getVoucher(id);
        const linkedInvoiceIds = [];
        if (voucher) {
            if (voucher.linkedInvoices && Array.isArray(voucher.linkedInvoices)) {
                voucher.linkedInvoices.forEach(link => {
                    const lid = typeof link === 'object' ? link.id : link;
                    if (lid) linkedInvoiceIds.push(lid);
                });
            } else if (voucher.linkedInvoiceId) {
                linkedInvoiceIds.push(voucher.linkedInvoiceId);
            }
        }

        await VoucherManager.deleteVoucher(id);

        // After deletion, recalculate the status of linked invoices
        if (linkedInvoiceIds.length > 0 && typeof InvoiceManager !== 'undefined') {
            const allVouchers = DataManager.getData('vouchers') || [];
            for (const invId of linkedInvoiceIds) {
                const invoice = InvoiceManager.getInvoice(invId);
                if (!invoice) continue;

                const totalPaid = allVouchers
                    .filter(v => v.linkedInvoices?.some(link => {
                        const lid = typeof link === 'object' ? link.id : link;
                        return lid === invId;
                    }) || v.linkedInvoiceId === invId)
                    .reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

                let newStatus = 'pending';
                const invoiceTotal = parseFloat(invoice.total) || 0;
                if (totalPaid >= invoiceTotal && invoiceTotal > 0) {
                    newStatus = 'paid';
                } else if (totalPaid > 0) {
                    newStatus = 'partial';
                }

                await InvoiceManager.updateInvoice(invId, { status: newStatus });
            }
        }

        this.updateTable();
    },

    async getVoucherElement(voucherId) {
        const voucher = VoucherManager.getVoucher(voucherId);
        if (!voucher) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const companyName = settings.companyName || 'My Company';
        const address = settings.registeredAddress || settings.address || '';

        const element = document.createElement('div');
        element.style.width = '1000px';
        element.style.padding = '30px';
        element.style.background = 'white';
        element.style.color = 'black';
        element.style.fontFamily = "'Inter', sans-serif";
        element.style.border = '1px solid #ddd';

        const typeLabels = {
            'receipt': 'Receipt Voucher',
            'payment': 'Payment Voucher',
            'contra': 'Contra Voucher',
            'purchase': 'Purchase Voucher'
        };
        const typeLabel = typeLabels[voucher.type] || 'Voucher';

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
                    ${voucher.billNo ? `<div style="font-size: 12px; color: #666;">Bill No: ${voucher.billNo}</div>` : ''}
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
                    ` : ''}
                    ${voucher.discountAmount > 0 ? `
                    <div style="margin-bottom: 10px;">
                        <span style="color: #666; font-size: 12px; text-transform: uppercase;">Discount</span><br>
                        <strong style="font-size: 20px; color: #059669;">₹${parseFloat(voucher.discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                    </div>
                    ` : ''}
                    ${(voucher.tdsAmount > 0 || voucher.discountAmount > 0) ? `
                    <div style="margin-bottom: 10px;">
                        <span style="color: #666; font-size: 12px; text-transform: uppercase;">Total Adjustable</span><br>
                        <strong style="font-size: 20px;">₹${(parseFloat(voucher.amount) + parseFloat(voucher.tdsAmount || 0) + parseFloat(voucher.discountAmount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
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
        let linked = voucher.linkedInvoices || [];
        
        // Fallback: If no linkedInvoices, try allocations (common in some imported formats)
        if (linked.length === 0 && voucher.allocations && Array.isArray(voucher.allocations)) {
            linked = voucher.allocations;
        }

        if (linked.length === 0) return '';
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];

        const rows = linked.map(link => {
            const docId = typeof link === 'object' ? link.id : link;
            
            // Priority: Use specific allocation amount if available
            let amount = voucher.amount;
            if (voucher.allocations && Array.isArray(voucher.allocations)) {
                const alloc = voucher.allocations.find(a => a.id === docId);
                if (alloc) amount = parseFloat(alloc.amount) || 0;
            } else if (typeof link === 'object') {
                amount = parseFloat(link.amount) || 0;
            }

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

    async showEditVoucherModal(voucherId) {
        const voucher = VoucherManager.getVoucher(voucherId);
        if (!voucher) { alert('Voucher not found.'); return; }

        // Set current mode based on voucher
        if (voucher.isPurchase) {
            this.currentMode = 'purchase';
        } else if (voucher.hasGst === false) {
            this.currentMode = 'non-gst';
        } else {
            this.currentMode = 'gst';
        }

        // Open the generic create modal pre-filled
        this.showCreateModal(voucher.type || 'receipt');

        // Wait for modal to render (reduced from 300ms to 50ms for snappiness)
        await new Promise(r => setTimeout(r, 50));

        const form = document.getElementById('createVoucherForm');
        if (!form) return;

        // Update title 
        const modalTitle = document.querySelector('#createVoucherModal .modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Edit Voucher – ${voucher.id}`;

        // Pre-fill fields
        const setField = (id, val) => { const el = form.querySelector(`#${id}`) || form.querySelector(`[name="${id}"]`); if (el) el.value = val ?? ''; };
        setField('voucherIdField', voucher.id);
        setField('date', voucher.date);
        setField('voucherType', voucher.type);
        setField('amount', voucher.amount);
        setField('tdsAmount', voucher.tdsAmount || 0);
        setField('discountAmount', voucher.discountAmount || 0);
        setField('remarks', voucher.remarks || '');
        setField('refNo', voucher.referenceId || '');

        // Payment mode
        const modeEl = form.querySelector('[name="paymentMode"]');
        if (modeEl) {
            modeEl.value = voucher.paymentMode || 'cash';
            this.onPaymentModeChange(modeEl);
        }

        // Party name
        const partyInput = document.getElementById('voucherPartySearch');
        const hiddenId = document.getElementById('voucherCustomerId');
        if (partyInput) partyInput.value = voucher.customerName || '';
        if (hiddenId) hiddenId.value = voucher.customerId || '';

        // Override save button
        const saveBtn = document.querySelector('#createVoucherModal .btn-primary[onclick*="saveVoucher"]');
        if (saveBtn) {
            saveBtn.removeAttribute('onclick');
            saveBtn.onclick = () => this.saveEditedVoucher(voucherId);
            saveBtn.textContent = 'Update Voucher';
        }
    },

    async saveEditedVoucher(voucherId) {
        const form = document.getElementById('createVoucherForm');
        if (!form || !form.checkValidity()) { form?.reportValidity(); return; }

        const formData = new FormData(form);
        const name = formData.get('customerName');
        const customers = DataManager.getData('customers') || [];
        const found = customers.find(c => c.name === name);

        const updates = {
            type: formData.get('type'),
            date: formData.get('date'),
            customerName: name,
            customerId: found ? found.id : formData.get('customerId'),
            customerAddress: formData.get('customerAddress') || '',
            amount: parseFloat(formData.get('amount')) || 0,
            paymentMode: formData.get('paymentMode'),
            referenceId: formData.get('refNo'),
            tdsAmount: parseFloat(formData.get('tdsAmount') || 0),
            discountAmount: parseFloat(formData.get('discountAmount') || 0),
            remarks: formData.get('remarks'),
            hasGst: this.currentMode === 'gst',
            isPurchase: this.currentMode === 'purchase'
        };

        try {
            // Update by directly patching the voucher in storage
            const vouchers = DataManager.getData('vouchers') || [];
            const idx = vouchers.findIndex(v => v.id === voucherId);
            if (idx === -1) throw new Error('Voucher not found');
            vouchers[idx] = { ...vouchers[idx], ...updates, updatedAt: new Date().toISOString() };
            await DataManager.saveData('vouchers', vouchers);

            const modalEl = document.getElementById('createVoucherModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            this.updateTable();
            App.showNotification('Voucher updated successfully!', 'success');
        } catch (e) {
            console.error(e);
            alert('Error updating voucher: ' + e.message);
        }
    },
};

window.VouchersUI = VouchersUI;
