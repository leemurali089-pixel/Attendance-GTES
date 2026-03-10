/**
 * Invoices UI Module
 * Handles display, creation, and professional PDF generation for invoices
 * Integrated with Synced Data (Customers, Inventory)
 */
const InvoicesUI = {
    async init() {
        console.log('Invoices UI Initialized');
        if (App.currentView === 'invoices') {
            this.renderInvoicesList();
        }
    },

    load() {
        this.renderInvoicesList();
    },

    renderInvoicesList() {
        const view = document.getElementById('invoicesView');
        if (!view) return;

        // Populate Filter Options
        const invoices = DataManager.getData('invoices') || [];

        // Financial Years (April - March)
        const fYears = [...new Set(invoices.map(i => DataManager.getFinancialYear(i.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        // Customers
        const customers = [...new Set(invoices.map(i => i.customerName).filter(Boolean))].sort();
        const customerOptions = customers.map(c => `<option value="${c}">${c}</option>`).join('');

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-receipt text-success me-2"></i> GST Invoices</h2>
                    <div>
                        <button class="btn btn-primary btn-sm me-2" onclick="InvoicesUI.showCreateModal('sales')">
                            <i class="bi bi-plus-lg"></i> New Invoice
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
                
                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Financial Year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterYear" onchange="InvoicesUI.filterInvoices()">
                                    <option value="">All Year</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Customer</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterCustomer" onchange="InvoicesUI.filterInvoices()">
                                    <option value="">All Customers</option>
                                    ${customerOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Status</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterStatus" onchange="InvoicesUI.filterInvoices()">
                                    <option value="">All Status</option>
                                    <option value="paid">Paid</option>
                                    <option value="pending">Pending</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="invoiceSearch" placeholder="Search GST invoices by number or customer..." onkeyup="InvoicesUI.filterInvoices()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="invoicesTableContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this.updateTable();
    },

    updateTable() {
        // Fetch all invoices, treating them as GST Invoices by default as per request
        const invoices = DataManager.getData('invoices') || [];
        // Sort by invoice number desc
        invoices.sort((a, b) => {
            const numA = parseInt((a.invoiceNo || '').replace(/\D/g, '')) || 0;
            const numB = parseInt((b.invoiceNo || '').replace(/\D/g, '')) || 0;
            return numB - numA;
        });

        const container = document.getElementById('invoicesTableContainer');
        if (!container) return;

        if (invoices.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                    No invoices found. Sync with Book Keeper or create a new GST Invoice.
                </div>
            `;
            return;
        }

        const html = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                         <th>Date</th>
                        <th>Invoice #</th>
                        <th>Customer</th>
                        <th class="text-end">Amount</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoices.map(inv => {
            const searchStr = `${inv.invoiceNo} ${inv.customerName || ''}`.toLowerCase();
            const yearStr = DataManager.getFinancialYear(inv.date);
            const statusStr = (inv.status || 'pending').toLowerCase();
            return `
                        <tr data-search="${searchStr}" 
                            data-year="${yearStr}" 
                            data-customer="${(inv.customerName || '').replace(/"/g, '&quot;')}"
                            data-status="${statusStr}">
                            <td>${inv.date}</td>
                            <td class="fw-bold text-primary">${inv.invoiceNo}</td>
                            <td>${inv.customerName || 'Unknown'}</td>
                            <td class="text-end">₹${parseFloat(inv.total).toFixed(2)}</td>
                            <td class="text-center">
                                <span class="badge bg-${inv.status === 'paid' ? 'success' : 'warning'}">${inv.status || 'Pending'}</span>
                            </td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice('${inv.id}')" title="View Invoice">
                                    <i class="bi bi-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info ms-1" onclick="InvoicesUI.generatePDF('${inv.id}')" title="Download PDF">
                                    <i class="bi bi-file-earmark-pdf"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger ms-1" onclick="InvoicesUI.deleteInvoice('${inv.id}')" title="Delete">
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

        // Trigger filter in case values are already selected
        this.performFilter();
    },

    debounce(func, wait) {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    },

    filterInvoices: null, // Initialized below to bind correct context if needed, or just defined as method

    setupSearch() {
        const input = document.getElementById('invoiceSearch');
        if (input) {
            input.onkeyup = this.debounce(() => {
                this.performFilter();
            }, 300);
        }
    },

    performFilter() {
        const query = document.getElementById('invoiceSearch').value.toLowerCase();
        const yearFilter = document.getElementById('filterYear') ? document.getElementById('filterYear').value : '';
        const customerFilter = document.getElementById('filterCustomer') ? document.getElementById('filterCustomer').value : '';
        const statusFilter = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

        const rows = document.querySelectorAll('#invoicesTableContainer tbody tr');

        // Use requestAnimationFrame for smoother UI during heavy filtering
        requestAnimationFrame(() => {
            rows.forEach(row => {
                const searchMatch = !query || (row.dataset.search || '').includes(query);
                const yearMatch = !yearFilter || (row.dataset.year === yearFilter);
                const customerMatch = !customerFilter || (row.dataset.customer === customerFilter);
                const statusMatch = !statusFilter || (row.dataset.status === statusFilter);

                if (searchMatch && yearMatch && customerMatch && statusMatch) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    },

    // Legacy method redirection for existing onclicks
    filterInvoices() {
        if (!this.debouncedFilter) {
            this.debouncedFilter = this.debounce(() => this.performFilter(), 300);
        }
        this.debouncedFilter();
    },

    showCreateModal(type = 'sales') {
        const isSales = type === 'sales';
        const title = isSales ? 'Sale/Invoice/Bill' : 'Purchase';
        const partyLabel = isSales ? 'Customer/Cash' : 'Supplier/Cash';
        const accountLabel = isSales ? 'Sales Account' : 'Purchase Account';

        const customers = DataManager.getData('customers') || [];
        const inventory = DataManager.getData('inventory') || [];
        // Support for Services
        const services = DataManager.getData('services') || [];
        const settings = DataManager.getData('settings') || {};

        // Generate datalists
        const customerOptions = customers
            .filter(c => isSales ? c.type !== 'vendor' : c.type === 'vendor') // strict filter if needed, else show all
            .map(c => `<option value="${c.name}" data-id="${c.id}" data-address="${c.address || ''}" data-gst="${c.gstin || ''}" data-state="${c.state || ''}">`)
            .join('');

        // Merge Inventory and Services
        let itemOptions = inventory.map(i => `<option value="${i.name}" data-type="item" data-rate="${isSales ? i.rate : (i.purchaseRate || i.rate)}" data-unit="${i.unit}" data-gst="${i.gstRate}" data-stock="${i.stock || 0}">`).join('');

        // Append Services to options
        if (services.length > 0) {
            itemOptions += services.map(s => `<option value="${s.name}" data-type="service" data-rate="${s.rate || 0}" data-unit="${s.unit || 'NA'}" data-gst="${s.tax || 0}"> (Service)</option>`).join('');
        }

        // Generate next Invoice/Voucher number
        const nextNo = InvoiceManager ? InvoiceManager.generateInvoiceNumber(isSales ? 'with-bill' : 'purchase') : '00001';

        const modalHtml = `
            <div class="modal fade" id="createInvoiceModal" tabindex="-1" data-bs-backdrop="static">
                <style>
                    /* BookKeeper Replica Styles */
                    .bk-modal-header { background: #f0f0f0; color: #333; border-bottom: 1px solid #ccc; padding: 5px 15px; }
                    .bk-form-label { font-size: 11px; color: #333; margin-bottom: 1px; font-weight: bold; }
                    .bk-form-control { 
                        background: #fff; color: #000; border: 1px solid #aaa; 
                        border-radius: 2px; padding: 2px 5px; font-size: 13px; height: 26px; 
                    }
                    .bk-form-control:focus { box-shadow: none; border-color: #0078d7; outline: none; }
                    .bk-table th { 
                        background: #f1f1f1; color: #000; font-weight: normal; font-size: 11px; 
                        border: 1px solid #ccc; padding: 4px; border-bottom: 2px solid #aaa;
                    }
                    .bk-table td { padding: 0; border: 1px solid #ccc; vertical-align: middle; }
                    .bk-table input { border: none; width: 100%; padding: 4px; font-size: 12px; border-radius: 0; }
                    .bk-table input:focus { background: #ffffe0; outline: 1px solid #0078d7; }
                    .bk-footer-panel { background: #fffbe6; border: 1px solid #ddd; padding: 10px; font-size: 12px; }
                    .bk-total-lbl { font-size: 12px; text-align: right; padding-right: 10px; color: #444; }
                    .bk-total-val { background: #fff; border: 1px solid #ccc; text-align: right; font-weight: bold; }
                    .highlight-input { background-color: #ffff00 !important; color: #000; } /* Yellow highlight from screenshot */
                </style>
                <div class="modal-dialog modal-xl" style="max-width: 95vw;">
                    <div class="modal-content bg-light text-dark">
                        <!-- Header Bar (Menu style) -->
                        <div class="bk-modal-header d-flex justify-content-between align-items-center">
                            <div>
                                <span class="fw-bold fs-6 me-3"><i class="bi bi-file-text me-1"></i> ${title}</span>
                                <small class="text-muted">Ctrl+Q: Exit</small>
                            </div>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body p-2" style="background: #f9f9f9;">
                            <form id="createInvoiceForm">
                                <datalist id="customerList">${customerOptions}</datalist>
                                <datalist id="itemList">${itemOptions}</datalist>
                                <input type="hidden" name="type" value="${type}">

                                <!-- Top Form Section -->
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <div class="bk-form-label">Invoice No</div>
                                        <input type="text" class="bk-form-control highlight-input" name="invoiceNo" value="${nextNo}" required>
                                    </div>
                                    <div class="col-md-2">
                                        <div class="bk-form-label">Voucher Date</div>
                                        <input type="date" class="bk-form-control" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="text-danger small fw-bold mb-1 text-center">Press ENTER to move forward</div>
                                        <div class="d-flex justify-content-center gap-3 bg-white border p-1 border-secondary rounded-1">
                                            <div class="form-check form-check-inline m-0">
                                                <input class="form-check-input" type="radio" name="taxType" id="taxLocal" value="local" checked>
                                                <label class="form-check-label small fw-bold" for="taxLocal">Local</label>
                                            </div>
                                            <div class="form-check form-check-inline m-0">
                                                <input class="form-check-input" type="radio" name="taxType" id="taxInterstate" value="interstate">
                                                <label class="form-check-label small fw-bold" for="taxInterstate">Interstate</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-2">
                                         <div class="bk-form-label">Due Date</div>
                                         <input type="date" class="bk-form-control" name="dueDate">
                                    </div>
                                     <div class="col-md-3">
                                         <div class="bk-form-label">Purchase Order No</div>
                                         <input type="text" class="bk-form-control" name="poNumber">
                                    </div>
                                </div>

                                <div class="row g-2 mb-2">
                                    <div class="col-md-4">
                                        <div class="bk-form-label">${partyLabel}</div>
                                        <input type="text" class="bk-form-control" name="customerName" list="customerList" onchange="InvoicesUI.onCustomerSelect(this)" placeholder="Select Party">
                                    </div>
                                    <div class="col-md-4">
                                        <div class="bk-form-label">${accountLabel}</div>
                                        <input type="text" class="bk-form-control" name="accountName" value="${isSales ? 'Sales' : 'Purchase'}" readonly>
                                    </div>
                                    <div class="col-md-4">
                                         <div class="bk-form-label">Place of Supply</div>
                                         <input type="text" class="bk-form-control" name="placeOfSupply" id="placeOfSupply" placeholder="State">
                                    </div>
                                </div>

                                <!-- Items Table -->
                                <div class="text-danger small fw-bold mb-1 ps-1">Press ENTER key to add item.</div>
                                <div class="table-responsive border border-secondary mb-2" style="background: #fff; min-height: 200px; max-height: 350px; overflow-y: auto;">
                                    <table class="table table-sm table-bordered bk-table mb-0" id="invoiceItemsTable">
                                        <thead class="sticky-top">
                                            <tr>
                                                <th width="25%">Item</th>
                                                <th width="8%">QTY</th>
                                                <th width="8%">Units</th>
                                                <th width="10%">Rate</th>
                                                <th width="8%">Per</th>
                                                <th width="8%">Discount(%)</th>
                                                <th width="10%">Tax</th>
                                                <th width="12%">Value</th>
                                                <th width="15%">Description</th>
                                                <th width="2%"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="invoiceItemsBody">
                                            <!-- Rows will be added here -->
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colspan="10" class="p-0">
                                                    <input type="text" class="form-control-plaintext form-control-sm px-2 text-primary fst-italic" 
                                                           placeholder="+ Click to add new item row..." 
                                                           onclick="InvoicesUI.addItemRow()" 
                                                           onfocus="InvoicesUI.addItemRow()">
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <!-- Footer Totals Section -->
                                <div class="bk-footer-panel">
                                    <div class="row g-2">
                                        <div class="col-md-7">
                                            <div class="d-flex gap-2 mb-2">
                                                <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" id="otherCharges">
                                                    <label class="form-check-label" for="otherCharges">Other Charges</label>
                                                </div>
                                                <div class="form-check">
                                                    <input class="form-check-input" type="checkbox" id="dispatchDetails">
                                                    <label class="form-check-label" for="dispatchDetails">Dispatch</label>
                                                </div>
                                            </div>
                                            <div class="bk-form-label">Narration</div>
                                            <textarea class="form-control" name="narration" rows="2" style="font-size: 12px;"></textarea>
                                        </div>
                                        <div class="col-md-5">
                                            <div class="row g-1 align-items-center mb-1">
                                                <div class="col-4 bk-total-lbl">Round Off</div>
                                                <div class="col-3">
                                                    <input type="number" class="bk-total-val w-100" id="roundOff" value="0.00" step="0.01" onchange="InvoicesUI.calculateTotals()">
                                                </div>
                                                <div class="col-5 text-end fw-bold" id="totalAmountDisplay" style="font-size: 1.2rem;">0.00</div>
                                            </div>
                                            <hr class="my-1">
                                            <div class="row g-1">
                                                <div class="col-6">
                                                   <fieldset class="border p-1 rounded">
                                                       <legend class="float-none w-auto px-1 fs-6 p-0 m-0 small fw-bold">Discount & Tax</legend>
                                                       <div class="form-check small">
                                                           <input class="form-check-input" type="radio" name="taxCalc" id="taxOnTotal" value="total">
                                                           <label class="form-check-label" for="taxOnTotal">On Total</label>
                                                       </div>
                                                       <div class="form-check small">
                                                           <input class="form-check-input" type="radio" name="taxCalc" id="taxPerItem" value="item" checked>
                                                           <label class="form-check-label" for="taxPerItem">Per Item</label>
                                                       </div>
                                                   </fieldset>
                                                </div>
                                                <div class="col-6 text-end">
                                                    <div class="small text-muted">Total Qty: <span id="totalQty">0</span></div>
                                                    <div class="small text-muted">Subtotal: <span id="subTotal">0.00</span></div>
                                                    <div class="small text-muted">Tax Total: <span id="taxTotal">0.00</span></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer border-top bg-light justify-content-between py-1">
                            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Ctrl+Q: Exit</button>
                            <div>
                                <button type="button" class="btn btn-outline-dark btn-sm me-1" onclick="this.form.reset()">Clear</button>
                                <button type="button" class="btn btn-success btn-sm px-4 fw-bold" onclick="InvoicesUI.saveInvoice()">F12: Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('createInvoiceModal');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('createInvoiceModal'));
        modal.show();

        // Add first row
        this.addItemRow();
    },

    addItemRow() {
        const tbody = document.getElementById('invoiceItemsBody');
        const rowIndex = tbody.children.length;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="text" name="item[]" list="itemList" class="highlight-input" onchange="InvoicesUI.onItemSelect(this)">
            </td>
            <td><input type="number" name="qty[]" value="1" min="0" step="0.01" oninput="InvoicesUI.calculateRow(this)"></td>
            <td><input type="text" name="unit[]" readonly tabindex="-1"></td>
            <td><input type="number" name="rate[]" value="0.00" step="0.01" oninput="InvoicesUI.calculateRow(this)"></td>
            <td><input type="text" name="per[]" readonly tabindex="-1"></td>
            <td><input type="number" name="discount[]" value="0" step="0.01" oninput="InvoicesUI.calculateRow(this)"></td>
            <td>
                <select name="tax[]" class="bk-form-control p-0 border-0" onchange="InvoicesUI.calculateRow(this)">
                    <option value="0">None</option>
                    <option value="5">GST@5%</option>
                    <option value="12">GST@12%</option>
                    <option value="18">GST@18%</option>
                    <option value="28">GST@28%</option>
                </select>
            </td>
            <td><input type="number" name="value[]" value="0.00" readonly tabindex="-1" class="fw-bold text-end"></td>
            <td><input type="text" name="desc[]"></td>
            <td class="text-center">
                <i class="bi bi-x-circle text-danger cursor-pointer" onclick="this.closest('tr').remove(); InvoicesUI.calculateTotals()"></i>
            </td>
        `;
        tbody.appendChild(row);

        // Focus on first input of new row
        row.querySelector('input').focus();
    },

    onCustomerSelect(input) {
        const val = input.value;
        const list = document.getElementById('customerList');
        const options = Array.from(list.options);
        const option = options.find(opt => opt.value === val);

        if (option) {
            const form = document.getElementById('createInvoiceForm'); // Fixed ID reference
            // Auto fill address if textarea exists (though current UI doesn't show it explicitly, logic remains)
            const addrField = form.querySelector('[name="billingAddress"]');
            if (addrField) addrField.value = option.dataset.address || '';

            const gstField = form.querySelector('[name="customerGst"]');
            if (gstField) gstField.value = option.dataset.gst || '';

            // Fill Place of Supply
            const placeField = form.querySelector('[name="placeOfSupply"]');
            if (placeField && option.dataset.state) {
                placeField.value = option.dataset.state;
            }
        }
    },

    onItemSelect(input) {
        const options = document.getElementById('itemList').options;
        let selected;
        // Search matching option
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === input.value) {
                selected = options[i];
                break;
            }
        }

        if (selected) {
            const row = input.closest('tr');
            row.querySelector('[name="rate[]"]').value = selected.dataset.rate || 0;
            // Handle unit: Services might be 'NA' or empty
            const unit = selected.dataset.unit || 'Nos';
            row.querySelector('[name="unit[]"]').value = unit;
            row.querySelector('[name="per[]"]').value = unit;

            // Parse Tax
            const taxStr = selected.dataset.gst || '';
            let taxVal = 0;
            // Try to extract number from string like "GST@18%" or just "18"
            const match = taxStr.match(/(\d+)/);
            if (match) taxVal = parseInt(match[0]);

            // Set Tax Dropdown
            // We need to map exact values 0, 5, 12, 18, 28. If non-standard, default to 18 or 0?
            // Let's try to set it if valid
            const taxSelect = row.querySelector('[name="tax[]"]');
            if ([0, 5, 12, 18, 28].includes(taxVal)) {
                taxSelect.value = taxVal;
            } else {
                taxSelect.value = 0; // Default or maybe leave as is
            }

            this.calculateRow(input);
        }
    },

    calculateRow(element) {
        const row = element.closest('tr');
        const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
        const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
        const disc = parseFloat(row.querySelector('[name="discount[]"]').value) || 0;
        const taxRate = parseFloat(row.querySelector('[name="tax[]"]').value) || 0;

        let amount = qty * rate;

        // Discount logic (assume % for now, straightforward)
        const discAmount = amount * (disc / 100);
        amount -= discAmount;

        // Tax Logic matches BookKeeper 'Tax Per Item' usually adds tax to the value shown in 'Value' column? 
        // Or is 'Value' taxable value? 
        // Screenshot shows "Value" column. Usually this is amount *before* tax or *after* tax depending on settings.
        // Let's assume Value = Taxable Value + Tax Amount for now, or just Taxable.
        // Actually looking at screenshot, the "Value" is likely the line total.

        const taxAmount = amount * (taxRate / 100);
        const totalValue = amount + taxAmount;

        row.querySelector('[name="value[]"]').value = totalValue.toFixed(2);

        this.calculateTotals();
    },

    calculateTotals() {
        const rows = document.querySelectorAll('#invoiceItemsBody tr');
        let totalQty = 0;
        let subTotal = 0; // Taxable
        let taxTotal = 0;
        let grandTotal = 0;

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
            const disc = parseFloat(row.querySelector('[name="discount[]"]').value) || 0;
            const taxRate = parseFloat(row.querySelector('[name="tax[]"]').value) || 0;
            const val = parseFloat(row.querySelector('[name="value[]"]').value) || 0; // This is (qty*rate-disc) + tax

            let taxable = qty * rate;
            let discAmt = taxable * (disc / 100);
            taxable -= discAmt;
            let taxAmt = taxable * (taxRate / 100);

            totalQty += qty;
            subTotal += taxable;
            taxTotal += taxAmt;
            grandTotal += (taxable + taxAmt);
        });

        const roundOff = parseFloat(document.getElementById('roundOff').value) || 0;
        grandTotal += roundOff;

        document.getElementById('totalQty').textContent = totalQty;
        document.getElementById('subTotal').textContent = subTotal.toFixed(2);
        document.getElementById('taxTotal').textContent = taxTotal.toFixed(2);
        document.getElementById('totalAmountDisplay').textContent = grandTotal.toFixed(2);
    },

    async saveInvoice() {
        const form = document.getElementById('createInvoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const items = [];
        const total = parseFloat(document.getElementById('invTotal').textContent);

        form.querySelectorAll('tbody tr').forEach(row => {
            const name = row.querySelector('[name="itemName"]').value;
            const qty = parseFloat(row.querySelector('[name="qty"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate"]').value) || 0;

            if (name && qty > 0) {
                const finalAmt = parseFloat(row.querySelector('.item-amount').textContent);
                const discount = parseFloat(row.querySelector('[name="discount"]').value) || 0;
                const gst = parseFloat(row.querySelector('[name="gstRate"]').value) || 0;

                items.push({
                    name: name,
                    description: row.querySelector('[name="itemDesc"]').value,
                    hsn: row.querySelector('[name="hsn"]').value,
                    quantity: qty,
                    unit: row.querySelector('[name="unit"]').value,
                    rate: rate,
                    discount: discount,
                    gstRate: gst,
                    amount: finalAmt
                });
            }
        });

        const invoiceData = {
            type: 'with-bill',
            customerName: formData.get('customerName'),
            customerId: 'CUST-' + Date.now(),
            date: formData.get('date'),
            dueDate: formData.get('dueDate'),
            poNumber: formData.get('poNumber'),
            items: items,
            subtotal: parseFloat(document.getElementById('invSubtotal').textContent),
            gst: {
                cgst: parseFloat(document.getElementById('invCgst').textContent),
                sgst: parseFloat(document.getElementById('invSgst').textContent),
                igst: parseFloat(document.getElementById('invIgst').textContent)
            },
            total: total,
            narration: formData.get('narration'),
            terms: formData.get('terms'),
            transport: {
                mode: formData.get('transportMode'),
                vehicleNo: formData.get('vehicleNo')
            },
            status: 'pending'
        };

        const customers = DataManager.getData('customers') || [];
        const foundCust = customers.find(c => c.name === invoiceData.customerName);
        if (foundCust) invoiceData.customerId = foundCust.id;

        try {
            await InvoiceManager.createInvoice(invoiceData);
            bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal')).hide();
            this.updateTable();
        } catch (e) {
            console.error(e);
            alert('Error creating invoice: ' + e.message);
        }
    },

    async getInvoiceElement(invoiceId) {
        const invoice = (DataManager.getData('invoices') || []).find(i => i.id === invoiceId);
        if (!invoice) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const company = {
            name: settings.companyName || DataManager.COMPANY_PROFILE.name,
            address: settings.registeredAddress || DataManager.COMPANY_PROFILE.registeredAddress,
            workAddress: settings.workAddress || DataManager.COMPANY_PROFILE.workAddress,
            gstin: settings.gstin || DataManager.COMPANY_PROFILE.gstin,
            pan: settings.pan || DataManager.COMPANY_PROFILE.pan,
            iec: settings.iec || DataManager.COMPANY_PROFILE.iec,
            emails: settings.emails || DataManager.COMPANY_PROFILE.emails,
            phones: settings.phones || DataManager.COMPANY_PROFILE.phones,
            bank: settings.bankDetails || DataManager.COMPANY_PROFILE.bankDetails
        };

        // Fetch customer details or use imported ones
        const customer = CustomerManager.getCustomer(invoice.customerId) || {
            name: invoice.customerName,
            address: invoice.customerAddress || '',
            gstin: invoice.customerGstin || '',
            pan: invoice.customerPan || ''
        };

        const element = document.createElement('div');
        element.style.width = '850px';
        element.style.padding = '30px';
        element.style.background = 'white';
        element.style.color = 'black';
        element.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

        // Fetch Master Data for real-time HSN/Unit/Description lookup
        const masterInventory = DataManager.getData('inventory') || [];
        const masterServices = DataManager.getData('gtes_services') || [];
        const allMasterItems = [...masterInventory, ...masterServices];

        const itemsHtml = invoice.items.map((item, idx) => {
            // Lookup master item
            const masterItem = allMasterItems.find(m => m.name.toLowerCase() === item.name.toLowerCase());

            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const amount = parseFloat(item.amount) || (qty * rate);
            const gstRate = parseFloat(item.gstRate?.replace(/[^0-9.]/g, '')) || 0;
            const cgstRate = gstRate / 2;
            const cgstAmount = amount * (cgstRate / 100);

            // Prioritize master data if available
            const hsn = masterItem?.hsnCode || item.hsn || '-';
            const unit = masterItem?.unit || item.unit || 'nos';

            // Build a clean description to avoid redundant info (Prioritizing Transaction details)
            let displayDesc = '';
            const itemDesc = (item.description || '').trim();
            const mstrDesc = (masterItem?.description || '').trim();

            // 1. Transaction description is ALWAYS prioritized (as requested)
            // Capture transaction-level notes (e.g., "1.5 Mtrs Long...")
            if (itemDesc && itemDesc.toLowerCase().trim() !== item.name.toLowerCase().trim()) {
                displayDesc = itemDesc;
            }

            // 2. ONLY append master description if transaction desc is empty OR significantly different
            if (mstrDesc && mstrDesc !== 'NA' && mstrDesc.toLowerCase().trim() !== item.name.toLowerCase().trim()) {
                if (!displayDesc) {
                    displayDesc = mstrDesc;
                } else if (!displayDesc.toLowerCase().includes(mstrDesc.toLowerCase())) {
                    // Append if master has extra info not in transaction
                    displayDesc += '<br>' + mstrDesc;
                }
            }

            return `
                <tr style="border-bottom: 1px solid #000; font-size: 11px;">
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #000;">${idx + 1}</td>
                    <td style="padding: 8px; border-right: 1px solid #000;">
                        <div style="font-weight: 600;">${item.name}</div>
                        ${displayDesc ? `<div style="font-size: 9px; color: #444; margin-top: 3px; line-height: 1.2; white-space: pre-line;">${displayDesc}</div>` : ''}
                    </td>
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #000;">${hsn}</td>
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #000;">${qty.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #000;">${unit}</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${rate.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: center; border-right: 1px solid #000;">${unit}</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${item.discount || 0}%</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstRate}%</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstAmount.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstRate}%</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstAmount.toFixed(2)}</td>
                    <td style="padding: 8px; text-align: right; font-weight: 600;">${amount.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        const totalQty = invoice.items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const subtotal = invoice.subtotal || invoice.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        const cgstAmount = invoice.gst?.cgst || invoice.items.reduce((sum, item) => {
            const amt = parseFloat(item.amount) || 0;
            const rate = parseFloat(item.gstRate?.replace(/[^0-9.]/g, '')) || 0;
            return sum + (amt * (rate / 200));
        }, 0);
        const sgstAmount = invoice.gst?.sgst || cgstAmount;

        // Get generic GST rate for display in summary if needed
        const displayGstRate = parseFloat(invoice.items[0]?.gstRate?.replace(/[^0-9.]/g, '')) || 18;

        const roundOff = invoice.roundOff !== undefined ? invoice.roundOff : (invoice.total - (subtotal + cgstAmount + sgstAmount));

        element.innerHTML = `
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
                <h2 style="margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">${company.name}</h2>
                <div style="font-size: 12px; margin-top: 5px;">
                    ${company.address}<br>
                    Work Address: ${company.workAddress}<br>
                    Email: ${Array.isArray(company.emails) ? company.emails.join(', ') : company.emails} | Ph: ${Array.isArray(company.phones) ? company.phones.join(', ') : company.phones}<br>
                    <strong>GSTIN: ${company.gstin} | PAN: ${company.pan} | IEC: ${company.iec}</strong>
                </div>
            </div>

            <h3 style="text-align: center; margin: 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">Tax Invoice</h3>

            <!-- Info Grid -->
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11px; margin-bottom: 10px;">
                <tr>
                    <td style="width: 50%; border: 1px solid #000; padding: 5px;">
                        <table style="width: 100%;">
                            <tr><td style="width: 40%;"><strong>Invoice No</strong></td><td>: ${invoice.invoiceNo}</td></tr>
                            <tr><td><strong>Date</strong></td><td>: ${invoice.date}</td></tr>
                            <tr><td><strong>Due Date</strong></td><td>: ${invoice.date}</td></tr>
                            <tr><td><strong>Purchase Order No</strong></td><td>: ${invoice.poNumber || '-'}</td></tr>
                        </table>
                    </td>
                    <td style="width: 50%; border: 1px solid #000; padding: 5px;">
                        <table style="width: 100%;">
                            <tr><td style="width: 40%;"><strong>Dispatch</strong></td><td>: -</td></tr>
                            <tr><td><strong>Document No.</strong></td><td>: -</td></tr>
                            <tr><td><strong>Dispatch Through</strong></td><td>: -</td></tr>
                            <tr><td><strong>Destination</strong></td><td>: -</td></tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td style="border: 1px solid #000; padding: 5px; vertical-align: top;">
                        <div style="background: #f0f0f0; padding: 2px 5px; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #000;">Details of Receiver (Billed To)</div>
                        <div style="font-weight: bold; font-size: 13px;">${customer.name}</div>
                        <div style="white-space: pre-wrap;">${customer.address}</div>
                        <p style="margin: 5px 0 0;"><strong>GSTIN:</strong> ${customer.gstin || '-'}</p>
                        <p style="margin: 0;"><strong>PAN:</strong> ${customer.pan || '-'}</p>
                    </td>
                    <td style="border: 1px solid #000; padding: 5px; vertical-align: top;">
                        <div style="background: #f0f0f0; padding: 2px 5px; font-weight: bold; margin-bottom: 5px; border-bottom: 1px solid #000;">Details of Consignee (Shipped To)</div>
                        <div style="font-weight: bold; font-size: 13px;">${customer.name}</div>
                        <div style="white-space: pre-wrap;">${customer.address}</div>
                    </td>
                </tr>
            </table>

            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11px; margin-bottom: 0;">
                <thead>
                    <tr style="background: #f8f8f8; border-bottom: 1px solid #000;">
                        <th style="padding: 8px; border-right: 1px solid #000;">#</th>
                        <th style="padding: 8px; text-align: left; border-right: 1px solid #000; width: 30%;">Description</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">HSN</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">QTY</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">Units</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">Rate</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">Per</th>
                        <th style="padding: 8px; border-right: 1px solid #000;">Disc</th>
                        <th colspan="2" style="padding: 8px; border-right: 1px solid #000;">CGST</th>
                        <th colspan="2" style="padding: 8px; border-right: 1px solid #000;">SGST</th>
                        <th style="padding: 8px;">Amount</th>
                    </tr>
                    <tr style="background: #f8f8f8; font-size: 10px; border-bottom: 1px solid #000;">
                        <th colspan="8" style="border-right: 1px solid #000;"></th>
                        <th style="padding: 3px; border-right: 1px solid #000; text-align: center;">Rate %</th>
                        <th style="padding: 3px; border-right: 1px solid #000; text-align: center;">Amount</th>
                        <th style="padding: 3px; border-right: 1px solid #000; text-align: center;">Rate %</th>
                        <th style="padding: 3px; border-right: 1px solid #000; text-align: center;">Amount</th>
                        <th style="text-align: center;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr style="font-weight: bold; border-top: 1px solid #000;">
                        <td colspan="8" style="padding: 8px; text-align: right; border-right: 1px solid #eee;">Subtotal</td>
                        <td colspan="4" style="border-right: 1px solid #eee;"></td>
                        <td style="padding: 8px; text-align: right;">${subtotal.toFixed(2)}</td>
                    </tr>
                    ${cgstAmount > 0 ? `
                    <tr style="font-weight: bold;">
                        <td colspan="8" style="padding: 4px 8px; text-align: right; border-right: 1px solid #eee;">CGST@${(displayGstRate / 2).toFixed(1)}%</td>
                        <td colspan="4" style="border-right: 1px solid #eee;"></td>
                        <td style="padding: 4px 8px; text-align: right;">${cgstAmount.toFixed(2)}</td>
                    </tr>
                    <tr style="font-weight: bold;">
                        <td colspan="8" style="padding: 4px 8px; text-align: right; border-right: 1px solid #eee;">SGST@${(displayGstRate / 2).toFixed(1)}%</td>
                        <td colspan="4" style="border-right: 1px solid #eee;"></td>
                        <td style="padding: 4px 8px; text-align: right;">${sgstAmount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr style="font-weight: bold;">
                        <td colspan="8" style="padding: 4px 8px; text-align: right; border-right: 1px solid #eee;">Round Off</td>
                        <td colspan="4" style="border-right: 1px solid #eee;"></td>
                        <td style="padding: 4px 8px; text-align: right;">${roundOff.toFixed(2)}</td>
                    </tr>
                    <tr style="font-weight: bold; font-size: 14px; background: #f8f8f8; border-top: 1px solid #000;">
                        <td colspan="3" style="padding: 10px; border-right: 1px solid #000;">Total</td>
                        <td style="padding: 10px; text-align: center; border-right: 1px solid #000;">${totalQty.toFixed(2)}</td>
                        <td colspan="8" style="padding: 10px; text-align: right; border-right: 1px solid #000;"></td>
                        <td style="padding: 10px; text-align: right; font-weight: bold;">Rs.${invoice.total.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <!-- Footer Details -->
            <div style="display: flex; justify-content: space-between; margin-top: 20px; font-size: 11px;">
                <div style="width: 60%;">
                    <div style="margin-bottom: 10px;">
                        <strong>Bank Details :</strong> ${company.bank?.bankName || '-'}<br>
                        <strong>Branch :</strong> ${company.bank?.branch || '-'}<br>
                        <strong>A/c No. :</strong> ${company.bank?.accountNo || '-'}<br>
                        <strong>Ifsc Code :</strong> ${company.bank?.ifsc || '-'}
                    </div>
                    <div style="color: #666; font-style: italic;">Amount in Words: ${this.numberToWords(invoice.total)} Only</div>
                </div>
                <div style="width: 35%; text-align: right;">
                    <div style="margin-bottom: 40px;">For <strong>${company.name}</strong></div>
                    <div style="border-top: 1px solid #000; padding-top: 5px; text-align: center;">Authorized Signatory.</div>
                </div>
            </div>

            <div style="margin-top: 20px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
                This is computer generated invoice and does not require a physical signature.
            </div>
        `;
        return element;
    },

    generatePDF(invoiceId) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.printInvoice) {
            DeliveryUI.printInvoice(invoiceId);
        } else {
            App.showNotification('PDF generation not available', 'error');
        }
    },

    previewInvoice(invoiceId) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.viewInvoice) {
            DeliveryUI.viewInvoice(invoiceId);
        } else {
            App.showNotification('Preview not available in this context', 'error');
        }
    },

    numberToWords(num) {
        // Placeholder for efficient number to words
        return num.toFixed(2);
    },

    async deleteInvoice(id) {
        if (window.InvoiceManager && window.InvoiceManager.deleteInvoice) {
            const invoice = InvoiceManager.getInvoice(id);
            if (invoice && invoice.challanId) {
                if (confirm(`Delete both Invoice ${id} and linked DC ${invoice.challanId}?\n\n- Click OK to delete BOTH\n- Click CANCEL to see more options`)) {
                    await InvoiceManager.deleteInvoice(id, true);
                } else {
                    if (confirm(`Keep DC ${invoice.challanId} and delete ONLY Invoice ${id}?`)) {
                        await InvoiceManager.deleteInvoice(id, false);
                    } else {
                        return; // Cancelled
                    }
                }
            } else {
                if (!confirm('Are you sure you want to delete this invoice?')) return;
                await InvoiceManager.deleteInvoice(id);
            }
        }
        this.updateTable();
    },

    renderPurchasesList() {
        const view = document.getElementById('purchasesView');
        if (!view) return;

        // Fetch purchases for filters
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];

        // Financial Years (April - March)
        const fYears = [...new Set(purchases.map(p => DataManager.getFinancialYear(p.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        // Vendors
        const vendors = [...new Set(purchases.map(p => p.vendor).filter(Boolean))].sort();
        const vendorOptions = vendors.map(v => `<option value="${v}">${v}</option>`).join('');

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cart-check text-warning me-2"></i> Purchase Bills</h2>
                    <div>
                         <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
                
                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Financial Year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseYear" onchange="InvoicesUI.filterPurchases()">
                                    <option value="">All Year</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Vendor</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseVendor" onchange="InvoicesUI.filterPurchases()">
                                    <option value="">All Vendors</option>
                                    ${vendorOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-muted">Status</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseStatus" onchange="InvoicesUI.filterPurchases()">
                                    <option value="">All Status</option>
                                    <option value="paid">Paid</option>
                                    <option value="pending">Pending</option>
                                </select>
                            </div>
                        </div>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="purchaseSearch" placeholder="Search bills by number, vendor or items..." onkeyup="InvoicesUI.filterPurchases()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="purchasesTableContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-warning" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this.updatePurchasesTable();
    },

    updatePurchasesTable() {
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        // Sort by bill number desc
        purchases.sort((a, b) => {
            const numA = parseInt((a.billNo || '').replace(/\D/g, '')) || 0;
            const numB = parseInt((b.billNo || '').replace(/\D/g, '')) || 0;
            return numB - numA;
        });

        const container = document.getElementById('purchasesTableContainer');
        if (!container) return;

        if (purchases.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-cart-x fs-1 d-block mb-3"></i>
                    No purchase bills found. Sync with Book Keeper to import.
                </div>
            `;
            return;
        }

        const html = `
            <table class="table table-dark table-hover align-middle">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Bill #</th>
                        <th>Vendor</th>
                        <th>Description</th>
                        <th class="text-end">Amount</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${purchases.map(p => {
            const searchStr = `${p.billNo || ''} ${p.vendor || ''} ${p.description || ''}`.toLowerCase();
            const yearStr = DataManager.getFinancialYear(p.date);

            // Reconcile status dynamically for UI accuracy
            let currentStatus = (p.status || 'pending').toLowerCase();
            if (currentStatus !== 'paid') {
                const allVouchers = DataManager.getData('vouchers') || [];
                const totalPaid = allVouchers.filter(v =>
                    v.type === 'payment' &&
                    v.linkedInvoices &&
                    v.linkedInvoices.some(link => link.id === p.id || link === p.id)
                ).reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

                if (totalPaid >= parseFloat(p.amount) && parseFloat(p.amount) > 0) {
                    currentStatus = 'paid';
                }
            }

            const badgeClass = currentStatus === 'paid' ? 'bg-success' : 'bg-warning';
            const statusLabel = currentStatus === 'paid' ? 'Paid' : 'Pending';

            return `
                        <tr data-search="${searchStr}" 
                            data-year="${yearStr}" 
                            data-vendor="${(p.vendor || '').replace(/"/g, '&quot;')}"
                            data-status="${currentStatus}">
                            <td>${p.date}</td>
                            <td class="fw-bold text-warning">${p.billNo || 'N/A'}</td>
                            <td>${p.vendor || 'Unknown'}</td>
                            <td class="small text-muted text-truncate" style="max-width: 200px;">${p.description || ''}</td>
                            <td class="text-end">₹${parseFloat(p.amount).toFixed(2)}</td>
                            <td class="text-center">
                                <span class="badge ${badgeClass}">${statusLabel}</span>
                            </td>
                            <td class="text-end">
                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewPurchase('${p.id}')" title="View Purchase">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
        this.filterPurchases();
    },

    filterPurchases() {
        const query = document.getElementById('purchaseSearch')?.value.toLowerCase() || '';
        const yearFilter = document.getElementById('filterPurchaseYear')?.value || '';
        const vendorFilter = document.getElementById('filterPurchaseVendor')?.value || '';
        const statusFilter = document.getElementById('filterPurchaseStatus')?.value || '';

        const rows = document.querySelectorAll('#purchasesTableContainer tbody tr');

        requestAnimationFrame(() => {
            rows.forEach(row => {
                const searchMatch = !query || (row.dataset.search || '').includes(query);
                const yearMatch = !yearFilter || (row.dataset.year === yearFilter);
                const vendorMatch = !vendorFilter || (row.dataset.vendor === vendorFilter);
                const statusMatch = !statusFilter || (row.dataset.status === statusFilter);

                if (searchMatch && yearMatch && vendorMatch && statusMatch) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    },

    async getPurchaseElement(id) {
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const p = purchases.find(pur => pur.id === id);
        if (!p) return null;

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
        const company = settings.companyName || 'Gas Tech Engineering Service';

        const element = document.createElement('div');
        element.style.width = '850px';
        element.style.padding = '30px';
        element.style.background = 'white';
        element.style.color = 'black';
        element.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

        const itemsHtml = (p.items || []).map((item, idx) => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const taxableValue = parseFloat(item.amount) || (qty * rate);

            // Robust tax extraction with fallbacks
            const cgstR = parseFloat(item.cgstRate || (item.gstRate ? (parseFloat(item.gstRate) / 2) : 0)) || 0;
            const sgstR = parseFloat(item.sgstRate || (item.gstRate ? (parseFloat(item.gstRate) / 2) : 0)) || 0;

            const cgstA = parseFloat(item.cgstAmount || item.cgst || (taxableValue * cgstR / 100)) || 0;
            const sgstA = parseFloat(item.sgstAmount || item.sgst || (taxableValue * sgstR / 100)) || 0;

            const total = parseFloat(item.totalAmount) || (taxableValue + cgstA + sgstA + (parseFloat(item.igstAmount || item.igst) || 0));

            return `
            <tr style="border-bottom: 1px solid #ddd; font-size: 11px;">
                <td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${idx + 1}</td>
                <td style="padding: 8px; border-right: 1px solid #eee;">
                    <div style="font-weight: 600;">${item.name}</div>
                    ${item.description ? `<div style="font-size: 9px; color: #666;">${item.description}</div>` : ''}
                </td>
                <td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${item.hsn || '-'}</td>
                <td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${qty}</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${rate.toFixed(2)}</td>
                <td style="padding: 8px; text-align: center; border-right: 1px solid #eee;">${item.per || 'nos'}</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${item.discount || 0}%</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${cgstR.toFixed(1)}%</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${cgstA.toFixed(2)}</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${sgstR.toFixed(1)}%</td>
                <td style="padding: 8px; text-align: right; border-right: 1px solid #eee;">${sgstA.toFixed(2)}</td>
                <td style="padding: 8px; text-align: right; font-weight: 600;">${taxableValue.toFixed(2)}</td>
            </tr>
        `;
        }).join('');

        element.innerHTML = `
            <!-- Header Section (Company Branding) -->
            <div style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 22px; text-transform: uppercase;">${company}</h2>
                <div style="font-size: 11px; color: #444; margin-top: 5px; line-height: 1.4;">
                    ${settings.registeredAddress || 'No.232/233, Nageshwara Road, Athipet, Chennai - 600058'}
                </div>
                <div style="font-size: 11px; color: #444;">
                    Work Address: ${settings.workAddress || '236/1A, 1st St, Nageshwara Rao Road, Athipet, Chennai - 600058'}
                </div>
                <div style="font-size: 11px; color: #444; margin-top: 3px;">
                    Email: ${settings.emails || 'gastechengservice@gmail.com'} | Ph: ${settings.phones || '+91 9600019839'}
                </div>
                <div style="font-size: 11px; font-weight: bold; margin-top: 3px;">
                    GSTIN: ${settings.gstin || '33AFXPR3235A3ZF'} | PAN: ${settings.pan || 'AFXPR3235A'} | IEC: ${settings.iec || 'AFXPR3235A'}
                </div>
            </div>

            <h3 style="text-align: center; margin: 10px 0; text-transform: uppercase; letter-spacing: 5px; font-weight: bold; background: #f8f9fa; padding: 5px;">PURCHASE</h3>

            <div style="display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 12px;">
                <div style="width: 55%; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                    <strong style="text-transform: uppercase; color: #333; display: block; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Bill From:</strong>
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${p.vendor}</div>
                    <div style="color: #555; line-height: 1.4; margin-bottom: 8px;">
                        ${p.vendorAddress || 'No Address Provided'}
                    </div>
                    ${p.vendorGstin ? `<div><strong>GSTIN:</strong> ${p.vendorGstin}</div>` : ''}
                </div>
                <div style="width: 40%; text-align: right; border: 1px solid #ddd; padding: 10px; border-radius: 4px;">
                    <div style="margin-bottom: 6px;"><strong>Purchase No:</strong> <span style="font-weight: bold; min-width: 80px; display: inline-block;">${p.billNo}</span></div>
                    <div style="margin-bottom: 6px;"><strong>Date:</strong> <span style="min-width: 80px; display: inline-block;">${p.date}</span></div>
                    <div style="margin-bottom: 6px;"><strong>Status:</strong> <span style="min-width: 80px; display: inline-block; color: ${p.status === 'paid' ? '#27ae60' : '#e67e22'};">${p.status?.toUpperCase()}</span></div>
                    <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                        <strong style="color: #666;">Supplier Invoice No:</strong><br>
                        <span style="font-size: 15px; color: #2c3e50; font-weight: bold;">${p.supplierBillNo || '-'}</span>
                    </div>
                </div>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #ddd;">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #333; font-size: 10px; text-transform: uppercase; text-align: center;">
                        <th style="padding: 8px; border: 1px solid #ddd; width: 30px;">#</th>
                        <th style="padding: 8px; border: 1px solid #ddd; text-align: left; width: 25%;">Description</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 60px;">HSN</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 85px;">QTY</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 80px;">Rate</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 65px;">Per</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 40px;">Disc</th>
                        <th style="padding: 8px; border: 1px solid #ddd;" colspan="2">CGST</th>
                        <th style="padding: 8px; border: 1px solid #ddd;" colspan="2">SGST</th>
                        <th style="padding: 8px; border: 1px solid #ddd; width: 90px;">Amount</th>
                    </tr>
                    <tr style="background: #f8f9fa; border-bottom: 1px solid #ddd; font-size: 9px; text-align: center;">
                        <th colspan="7" style="border-right: 1px solid #ddd;"></th>
                        <th style="border: 1px solid #ddd; padding: 4px; width: 30px;">%</th>
                        <th style="border: 1px solid #ddd; padding: 4px; width: 50px;">Amt</th>
                        <th style="border: 1px solid #ddd; padding: 4px; width: 30px;">%</th>
                        <th style="border: 1px solid #ddd; padding: 4px; width: 50px;">Amt</th>
                        <th style="border: 1px solid #ddd;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="width: 50%; font-size: 11px;">
                    <div style="margin-bottom: 5px;"><strong>CGST Amt:</strong> ${(p.cgst || 0).toFixed(2)}</div>
                    <div style="margin-bottom: 5px;"><strong>SGST Amt:</strong> ${(p.sgst || 0).toFixed(2)}</div>
                    ${p.igst > 0 ? `<div style="margin-bottom: 5px;"><strong>IGST Amt:</strong> ${(p.igst || 0).toFixed(2)}</div>` : ''}
                    <div style="margin-bottom: 15px;"><strong>Total Tax:</strong> ${((p.cgst || 0) + (p.sgst || 0) + (p.igst || 0)).toFixed(2)}</div>
                    
                    <div style="margin-top: 30px; font-size: 10px; color: #666; font-style: italic; line-height: 1.4;">
                        We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                    </div>
                </div>
                
                <div style="width: 40%; border: 1px solid #ddd; border-radius: 4px; padding: 8px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <tr>
                            <td style="padding: 6px; text-align: right; color: #666;">Subtotal</td>
                            <td style="padding: 6px; text-align: right; font-weight: 500;">₹${(p.subtotal || p.amount - ((p.cgst || 0) + (p.sgst || 0) + (p.igst || 0))).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px; text-align: right; color: #666;">CGST Total</td>
                            <td style="padding: 6px; text-align: right;">₹${(p.cgst || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px; text-align: right; color: #666;">SGST Total</td>
                            <td style="padding: 6px; text-align: right;">₹${(p.sgst || 0).toFixed(2)}</td>
                        </tr>
                        ${p.igst > 0 ? `
                        <tr>
                            <td style="padding: 6px; text-align: right; color: #666;">IGST Total</td>
                            <td style="padding: 6px; text-align: right;">₹${(p.igst || 0).toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        ${p.roundOff ? `
                        <tr>
                            <td style="padding: 6px; text-align: right; color: #666;">Round Off</td>
                            <td style="padding: 6px; text-align: right;">₹${parseFloat(p.roundOff).toFixed(2)}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-top: 2px solid #333; font-weight: bold; font-size: 16px; background: #f8f9fa;">
                            <td style="padding: 10px 6px; text-align: right;">Total Amount</td>
                            <td style="padding: 10px 6px; text-align: right; color: #000;">₹${parseFloat(p.amount).toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
            </div>

            <div style="margin-top: 50px; display: flex; justify-content: flex-end;">
                <div style="text-align: right; width: 300px;">
                    <div style="font-size: 12px; margin-bottom: 60px;">For <strong>${company}</strong></div>
                    <div style="border-top: 1px solid #333; padding-top: 10px; text-align: center;">
                        <span style="font-weight: bold; font-size: 13px; text-transform: uppercase;">Authorized Signatory</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 15px;">
                This is a computer generated invoice and does not require a physical signature.
            </div>
        `;
        return element;
    },

    previewPurchase(id) {
        if (typeof DeliveryUI !== 'undefined' && DeliveryUI.viewPurchaseDetails) {
            DeliveryUI.viewPurchaseDetails(id);
        } else {
            App.showNotification('Purchase preview not available', 'error');
        }
    },

    async viewPurchase(id) {
        return this.previewPurchase(id);
    }
};

window.InvoicesUI = InvoicesUI;
