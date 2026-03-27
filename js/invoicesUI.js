/**
 * Invoices UI Module
 * Handles display, creation, and professional PDF generation for invoices
 * Integrated with Synced Data (Customers, Inventory)
 */
const InvoicesUI = {
    currentMode: 'gst', // 'gst' or 'non-gst'

    currentStatusFilter: 'all',
    searchTimeout: null,

    async init() {
        console.log('Invoices UI Initialized');
        if (App.currentView === 'invoices') {
            this.renderInvoicesList(this.currentMode);
        }
    },

    load(params = {}) {
        const mode = params.mode || null;
        if (!mode) {
            this.renderSubSelection();
        } else {
            this.renderInvoicesList(mode);
        }
    },

    renderSubSelection() {
        const view = document.getElementById('invoicesView');
        if (!view) return;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-invoice text-info me-2"></i> Sales Invoices</h2>
                    <button class="btn btn-outline-light btn-sm" onclick="App.showView('accounting')">
                        <i class="bi bi-arrow-left"></i> Back to Accounting
                    </button>
                </div>
                
                <div class="row g-4 justify-content-center pt-5">
                    <div class="col-md-5">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="InvoicesUI.load({mode: 'gst'})" style="cursor:pointer">
                            <i class="bi bi-receipt text-success display-1 mb-4"></i>
                            <h3 class="card-title text-white">GST Invoices</h3>
                            <p class="text-muted">Taxable sales with CGST/SGST/IGST</p>
                        </div>
                    </div>
                    <div class="col-md-5">
                        <div class="card bg-dark border-secondary hover-lift h-100 text-center p-5" onclick="InvoicesUI.load({mode: 'non-gst'})" style="cursor:pointer">
                            <i class="bi bi-receipt-cutoff text-info display-1 mb-4"></i>
                            <h3 class="card-title text-white">Plain Invoices</h3>
                            <p class="text-muted">Non-GST sales / Estimates</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderInvoicesList(mode = 'gst') {
        this.currentMode = mode;
        const view = document.getElementById('invoicesView');
        if (!view) return;

        // Update Title and Icon based on mode
        const isGST = mode === 'gst';
        const titleIcon = isGST ? 'bi-receipt text-success' : 'bi-receipt-cutoff text-success';
        const titleText = isGST ? 'GST Invoices' : 'Plain Invoices (Non-GST)';

        // Populate Filter Options
        const allInvoices = DataManager.getData('invoices') || [];
        const invoices = allInvoices.filter(i => isGST ? (i.type === 'gst-invoice' || i.type === 'with-bill' || !i.type) : (i.type === 'non-gst-invoice' || i.type === 'without-bill'));

        // Financial Years (April - March)
        const fYears = [...new Set(invoices.map(i => DataManager.getFinancialYear(i.date)))].filter(Boolean).sort().reverse();
        const yearOptions = fYears.map(y => `<option value="${y}">${y}</option>`).join('');

        // Customers
        const customers = [...new Set(invoices.map(i => i.customerName).filter(Boolean))].sort();
        const customerOptions = customers.map(c => `<option value="${c}">${c}</option>`).join('');

        // Add summary cards for financial overview
        const summaryHtml = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Pending Amount</div>
                            <h3 class="mb-0 text-danger" id="summaryPendingAmount">₹0.00</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Pending Bills</div>
                            <h3 class="mb-0 text-warning" id="summaryPendingBills">0</h3>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card bg-dark border-secondary shadow-sm">
                        <div class="card-body p-3 text-center">
                            <div class="text-white-50 fw-bold small text-uppercase mb-1">Parties with Outstanding</div>
                            <h3 class="mb-0 text-info" id="summaryPendingParties">0</h3>
                        </div>
                    </div>
                </div>
            </div>
        `;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-file-earmark-text text-info me-2"></i> ${titleText}</h2>
                    <div class="d-flex gap-2">
                        <button class="btn btn-info" onclick="InvoicesUI.showCreateModal('${isGST ? 'sales-gst' : 'sales-non-gst'}')">
                            <i class="bi bi-plus-circle me-1"></i> Create New
                        </button>
                        <button class="btn btn-outline-light" onclick="App.showView('accounting')">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
                
                ${summaryHtml}

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-md-4">
                                <label class="form-label small text-white-50">Financial Year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterYear" onchange="InvoicesUI.updateTable()">
                                    <option value="">All Year</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-white-50">Customer</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterCustomer" onchange="InvoicesUI.updateTable()">
                                    <option value="">All Customers</option>
                                    ${customerOptions}
                                </select>
                            </div>
                            <div class="col-md-4 text-end">
                                <label class="form-label small text-white-50 d-block">Filter by Status</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusAll" value="all" ${this.currentStatusFilter === 'all' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('all')">
                                    <label class="btn btn-outline-secondary btn-sm" for="statusAll">All</label>
                                    
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPending" value="pending" ${this.currentStatusFilter === 'pending' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('pending')">
                                    <label class="btn btn-outline-danger btn-sm" for="statusPending">Pending</label>

                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPartial" value="partial" ${this.currentStatusFilter === 'partial' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('partial')">
                                    <label class="btn btn-outline-warning btn-sm" for="statusPartial">Partial</label>
                                    
                                    <input type="radio" class="btn-check" name="statusFilter" id="statusPaid" value="paid" ${this.currentStatusFilter === 'paid' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('paid')">
                                    <label class="btn btn-outline-success btn-sm" for="statusPaid">Paid</label>
                                </div>
                            </div>
                        </div>
                        <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="invoiceSearch" 
                                placeholder="Search invoices by number, customer or items..." onkeyup="InvoicesUI.debouncedFilter()">
                        </div>
                    </div>
                </div>

                <div class="table-responsive" id="invoicesTableContainer">
                    <div class="text-center py-5">
                        <div class="spinner-border text-info" role="status"></div>
                    </div>
                </div>
            </div>
        `;

        this.updateTable();
    },

    setStatusFilter(val) {
        this.currentStatusFilter = val;
        this.updateTable();
        this.updatePurchasesTable();
    },

    debouncedFilter() {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (document.getElementById('invoiceSearch')) this.updateTable();
            if (document.getElementById('purchaseSearch')) this.updatePurchasesTable();
        }, 300);
    },

    updateTable() {
        const type = this.currentMode; // Use currentMode to determine GST/Non-GST
        const isGST = type === 'gst'; 
        
        // High accuracy: data with balance calculation from InvoiceManager
        let invoices = (typeof InvoiceManager !== 'undefined') ? InvoiceManager.getInvoicesWithBalance() : [];
        const typeFilter = isGST ? 'with-bill' : 'without-bill';
        invoices = invoices.filter(inv => inv.type === typeFilter);

        const yearFilter = document.getElementById('filterYear')?.value;
        const customerFilter = document.getElementById('filterCustomer')?.value;
        const query = document.getElementById('invoiceSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;

        const filtered = invoices.filter(inv => {
            const yearMatch = !yearFilter || DataManager.getFinancialYear(inv.date) === yearFilter;
            const customerMatch = !customerFilter || inv.customerName === customerFilter;
            const statusMatch = statusFilter === 'all' || 
                             (statusFilter === 'paid' && inv.isPaid) ||
                             (statusFilter === 'pending' && !inv.isPaid && !inv.isPartial) ||
                             (statusFilter === 'partial' && inv.isPartial);
            const searchMatch = !query || 
                               (inv.invoiceNo || '').toLowerCase().includes(query) || 
                               (inv.customerName || '').toLowerCase().includes(query) ||
                               (inv.items || []).some(item => item.name.toLowerCase().includes(query));

            return yearMatch && customerMatch && statusMatch && searchMatch;
        });

        // Summary Calculations (Based on filtered data)
        const totalPending = filtered.reduce((sum, inv) => sum + (inv.balance || 0), 0);
        const pendingCount = filtered.filter(inv => (inv.balance || 0) > 0.05).length;
        const outstandingParties = new Set(filtered.filter(inv => (inv.balance || 0) > 0.05).map(inv => inv.customerId)).size;

        // Update Summary Cards if visible
        const updateEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        updateEl('summaryPendingAmount', `₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        updateEl('summaryPendingBills', pendingCount);
        updateEl('summaryPendingParties', outstandingParties);

        const container = document.getElementById('invoicesTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted">No invoices found matching current filters.</div>`;
            return;
        }

        // Sort by date desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        const html = `
            <table class="table table-dark table-hover align-middle border-secondary">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Customer</th>
                        <th class="text-end">Total Amount</th>
                        <th class="text-end">Balance</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(inv => {
            const statusBadge = inv.isPaid ? 
                '<span class="badge bg-success-subtle text-success border border-success">Paid</span>' : 
                (inv.isPartial ? 
                    '<span class="badge bg-warning-subtle text-warning border border-warning">Partial</span>' : 
                    '<span class="badge bg-danger-subtle text-danger border border-danger">Pending</span>');
                    
            return `
                        <tr>
                            <td>${DataManager.formatDateDisplay(inv.date)}</td>
                            <td class="fw-bold text-info">${inv.invoiceNo}</td>
                            <td>${inv.customerName}</td>
                            <td class="text-end">₹${inv.total.toFixed(2)}</td>
                            <td class="text-end fw-bold ${inv.balance > 0 ? 'text-danger' : 'text-success'}">₹${inv.balance.toFixed(2)}</td>
                            <td class="text-center">${statusBadge}</td>
                            <td class="text-end">
                                <div class="btn-group">
                                    <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice('${inv.id}')" title="View/Print">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-warning" onclick="InvoicesUI.showEditModal('${inv.id}')" title="Edit">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" onclick="InvoicesUI.deleteInvoice('${inv.id}')" title="Delete">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
        }).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = html;
    },

    // Legacy method redirection for existing onclicks
    // filterInvoices() {
    //     if (!this.debouncedFilter) {
    //         this.debouncedFilter = this.debounce(() => this.performFilter(), 300);
    //     }
    //     this.debouncedFilter();
    // },

    showCreateModal(type = 'sales-gst') {
        const isSales = !type.includes('purchase');
        const isGST = type === 'sales-gst' || type === 'purchase-gst';
        const title = isGST ? 'Tax Invoice (GST)' : 'Plain Invoice (Non-GST)';
        const partyLabel = isSales ? 'Customer/Cash' : 'Supplier/Cash';
        const accountLabel = isSales ? 'Sales Account' : 'Purchase Account';

        const customers = CustomerManager ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        const inventory = InventoryManager ? InventoryManager.getAllMaterials() : (DataManager.getData('inventory') || []);
        // Support for Services (Try dedicated keys, then fallback to Inventory)
        let services = DataManager.getData('gtes_services') || DataManager.getData('services') || [];
        if (services.length === 0) {
            services = inventory.filter(m => m.unit === 'service' || m.type === 'service' || m.category === 'Services' || m.category === 'Service Charges');
        }
        const settings = DataManager.getData('settings') || {};

        // Helper to escape quotes for HTML attributes
        const esc = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        // Generate datalists
        const customerOptions = customers
            .filter(c => {
                if (!c.name) return false;
                const category = isSales ? 'customer' : 'supplier';
                const actual = String(c.accountType || c.type || c.accountGroup || 'customer').toLowerCase();
                // Extremely permissive filter: match category, standard party types, or default to showing if type is ambiguous
                return actual.includes(category) || actual.includes('debtor') || actual.includes('creditor') || 
                       actual.includes('regular') || actual.includes('party') || actual === 'customer' || actual === 'supplier' || 
                       (!c.accountType && !c.type); // Show if type information is missing
            })
            .map(c => `<option value="${esc(c.name)}" data-id="${c.id}" data-address="${esc(c.address)}" data-gst="${esc(c.gstin)}" data-state="${esc(c.state)}" data-dc-number="${esc(c.customerDCNumber)}"></option>`)
            .join('');

        // Separate Inventory and Services
        const inventoryOptions = inventory
            .filter(m => m.unit !== 'service' && m.type !== 'service' && m.category !== 'Services')
            .map(i => `<option value="${esc(i.name)}" data-type="item" data-rate="${isSales ? (i.rate || 0) : (i.purchaseRate || i.rate || 0)}" data-unit="${esc(i.unit || 'pcs')}" data-gst="${i.gstRate || 0}" data-hsn="${esc(i.hsnCode)}" data-stock="${i.currentStock || i.stock || i.unitsLeft || 0}"></option>`)
            .join('');
        const serviceOptions = services.map(s => `<option value="${esc(s.name)}" data-type="service" data-rate="${s.rate || 0}" data-unit="${esc(s.unit || 'job')}" data-gst="${s.tax || 0}" data-hsn="${esc(s.hsn || s.hsnCode)}"> (Service)</option>`).join('');
        const allItemOptions = inventoryOptions + serviceOptions;

        // Generate next Invoice/Voucher number
        const nextNo = InvoiceManager ? InvoiceManager.generateInvoiceNumber(isGST ? 'with-bill' : 'without-bill') : '00001';
        const dcLabel = isSales ? 'Customer DC / Ref No' : 'Supplier Bill No / Ref';
        
        const modalHtml = `
            <div class="modal fade" id="createInvoiceModal" tabindex="-1">
                <style>
                    .glass-panel {
                        background: rgba(255, 255, 255, 0.05);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .bk-form-control {
                        background: #1a1d21 !important;
                        color: #ffffff !important;
                        border: 1px solid #3d444d !important;
                        border-radius: 4px;
                        padding: 6px 12px;
                        font-size: 14px;
                        color-scheme: dark;
                    }
                    .bk-form-control:focus {
                        border-color: #0d6efd !important;
                        box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
                        outline: none;
                    }
                    .bk-form-label {
                        font-size: 12px;
                        color: #dee2e6; /* Increased brightness for visibility */
                        margin-bottom: 4px;
                        font-weight: 500;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .table-dark {
                        --bs-table-bg: #1a1d21;
                        --bs-table-border-color: #3d444d;
                    }
                    .highlight-input {
                        border-color: #ffc107 !important;
                    }
                    .footer-label {
                        color: #ced4da; /* Brightened from adb5bd */
                        font-size: 0.85rem;
                        font-weight: 500;
                    }
                    .bk-form-control::placeholder {
                        color: #9ea1a4 !important; /* Increased placeholder visibility */
                        opacity: 0.7;
                    }
                </style>
                <div class="modal-dialog modal-xl modal-dialog-scrollable" style="max-width: 95vw;">
                    <div class="modal-content bg-dark text-white border-secondary">
                        <div class="modal-header border-secondary d-flex justify-content-between align-items-center">
                            <div>
                                <span class="fw-bold fs-5 me-3"><i class="bi bi-receipt me-2 text-info"></i> ${title}</span>
                                <button type="button" class="btn btn-sm btn-outline-info ms-2 py-0 px-2" onclick="InvoicesUI.toggleFullscreen()" title="Toggle Fullscreen">
                                    <i class="bi bi-arrows-fullscreen"></i>
                                </button>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div class="modal-body p-4 bg-dark">
                            <form id="createInvoiceForm" onsubmit="event.preventDefault(); InvoicesUI.saveInvoice(event)">
                                <datalist id="invCustomerList">${customerOptions}</datalist>
                                <datalist id="invInventoryList">${inventoryOptions}</datalist>
                                <datalist id="invServiceList">${serviceOptions}</datalist>
                                <datalist id="invItemList">${allItemOptions}</datalist>
                                <input type="hidden" name="type" value="${type}">
                                <input type="hidden" name="customerId">
                                <input type="hidden" name="customerAddress">


                                <!-- Header Info -->
                                <div class="row g-3 mb-4">
                                    <div class="col-md-3">
                                        <div class="bk-form-label">Invoice #</div>
                                        <input type="text" class="bk-form-control w-100 highlight-input" name="invoiceNo" value="${nextNo}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${dcLabel}</div>
                                        <input type="text" class="bk-form-control w-100" name="poNumber" placeholder="No.">
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">Date</div>
                                        <input type="date" class="bk-form-control w-100" name="date" value="${new Date().toISOString().split('T')[0]}" required>
                                    </div>
                                    <div class="col-md-3">
                                        <div class="bk-form-label">${partyLabel} *</div>
                                        <div class="input-group input-group-sm">
                                            <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-person-badge"></i></span>
                                            <input type="text" class="bk-form-control flex-grow-1" name="customerName" list="invCustomerList" 
                                                onchange="InvoicesUI.onCustomerSelect(this)" placeholder="Search customer...">
                                            <input type="hidden" name="customerId">
                                        </div>
                                        <div id="customerDetailsInfo" class="small text-muted mt-1" style="font-size: 11px; min-height: 15px;"></div>
                                    </div>
                                </div>

                                <!-- Search Panels -->
                                <div class="row g-3 mb-4">
                                    <div class="col-md-6">
                                        <div class="card glass-panel h-100">
                                            <div class="card-body p-3">
                                                <label class="bk-form-label text-info">Search Inventory (Materials)</label>
                                                <div class="input-group input-group-sm mb-2">
                                                     <span class="input-group-text bg-dark border-secondary text-info"><i class="bi bi-box-seam"></i></span>
                                                     <input type="text" class="bk-form-control flex-grow-1" id="invSearchInput" 
                                                         placeholder="Type material name..." list="invInventoryList" 
                                                         onchange="InvoicesUI.handleInventorySelect(this, 'invInventoryList')">
                                                 </div>
                                                <div class="row g-2">
                                                    <div class="col-6">
                                                        <button type="button" class="btn btn-sm btn-outline-success w-100" onclick="InvoicesUI.addItemRow()">
                                                            <i class="bi bi-plus-lg"></i> Custom
                                                        </button>
                                                    </div>
                                                    <div class="col-6">
                                                        <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="window.DeliveryUI?.showInventoryModal()">
                                                            <i class="bi bi-plus-circle"></i> New Item
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card glass-panel h-100">
                                            <div class="card-body p-3">
                                                <label class="bk-form-label text-warning">Search Services / Labor</label>
                                                <div class="input-group input-group-sm mb-2">
                                                     <span class="input-group-text bg-dark border-secondary text-warning"><i class="bi bi-tools"></i></span>
                                                     <input type="text" class="bk-form-control flex-grow-1" id="svcSearchInput" 
                                                         placeholder="Type service name..." list="invServiceList"
                                                         onchange="InvoicesUI.handleInventorySelect(this, 'invServiceList')">
                                                 </div>
                                                <button type="button" class="btn btn-sm btn-outline-warning w-100" onclick="window.DeliveryUI?.showSection('services')">
                                                    <i class="bi bi-gear"></i> Manage Services
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="mb-0 text-uppercase letter-spacing-1 fw-bold"><i class="bi bi-list-check me-2 text-info"></i>Selected Items</h6>
                                </div>

                                <!-- Items Table -->
                                <div class="table-responsive border border-secondary rounded overflow-hidden mb-4">
                                    <table class="table table-dark table-hover table-sm mb-0" id="invoiceItemsTable">
                                        <thead>
                                            <tr class="bg-black">
                                                <th class="ps-3 py-2" width="${isGST ? '25%' : '30%'}">ITEM</th>
                                                <th width="${isGST ? '20%' : '25%'}">DESCRIPTION</th>
                                                ${isGST ? '<th width="10%">HSN</th>' : ''}
                                                <th width="8%">QTY</th>
                                                <th width="8%">UNIT</th>
                                                <th width="12%">RATE</th>
                                                ${isGST ? '<th width="8%">GST%</th>' : ''}
                                                <th width="12%">AMOUNT</th>
                                                <th width="3%"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="invoiceItemsBody">
                                            <!-- Dynamic Rows -->
                                        </tbody>
                                    </table>
                                </div>

                                <!-- Footer Section -->
                                <div class="row g-4">
                                    <div class="col-md-8">
                                        <div class="row g-3">
                                            <div class="col-md-12">
                                                <div class="form-check form-switch mb-3">
                                                    <input class="form-check-input" type="checkbox" id="dispatchDetails" onchange="InvoicesUI.toggleDispatchDetails()">
                                                    <label class="form-check-label fw-bold text-info" for="dispatchDetails">ADD DISPATCH DETAILS</label>
                                                </div>
                                                <div id="dispatchSection" style="display: none;" class="card glass-panel border-info mb-3">
                                                    <div class="card-body p-3">
                                                        <div class="row g-3">
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Dispatch Via</div>
                                                                <input type="text" class="bk-form-control w-100" name="dispatchVia" placeholder="e.g. Courier">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">LR / Tracking No</div>
                                                                <input type="text" class="bk-form-control w-100" name="lrNo" placeholder="No.">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Vehicle No</div>
                                                                <input type="text" class="bk-form-control w-100" name="vehicleNo" placeholder="No.">
                                                            </div>
                                                            <div class="col-md-3">
                                                                <div class="bk-form-label">Date</div>
                                                                <input type="date" class="bk-form-control w-100" name="dispatchDate" value="${new Date().toISOString().split('T')[0]}">
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="col-md-12">
                                                <div class="bk-form-label">Narration</div>
                                                <textarea class="bk-form-control w-100" name="narration" rows="3" placeholder="Enter remarks..."></textarea>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="card glass-panel border-secondary">
                                            <div class="card-body p-3">
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="footer-label">SUBTOTAL:</span>
                                                    <span class="fw-bold text-white" id="subTotal">0.00</span>
                                                </div>
                                                ${isGST ? `
                                                <div class="d-flex justify-content-between mb-1">
                                                    <span class="footer-label">CGST (9%):</span>
                                                    <span class="fw-bold text-white" id="cgstTotal">0.00</span>
                                                </div>
                                                <div class="d-flex justify-content-between mb-2">
                                                    <span class="footer-label">SGST (9%):</span>
                                                    <span class="fw-bold text-white" id="sgstTotal">0.00</span>
                                                </div>
                                                ` : ''}
                                                <div class="d-flex justify-content-between align-items-center mb-3">
                                                    <span class="footer-label">ROUND OFF:</span>
                                                    <input type="number" class="bk-form-control text-end p-1" style="width: 100px; height: 30px;" 
                                                        id="roundOff" value="0.00" step="0.01" onchange="InvoicesUI.calculateTotals()">
                                                </div>
                                                <hr class="border-secondary mt-0">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h4 class="mb-0 text-info">TOTAL:</h4>
                                                    <h3 class="mb-0 text-info" id="totalAmountDisplay">0.00</h3>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="d-flex gap-2 mt-4">
                                            <button type="button" class="btn btn-outline-secondary flex-grow-1" data-bs-dismiss="modal">CANCEL</button>
                                            <button type="submit" class="btn btn-primary flex-grow-1 py-2 fw-bold">
                                                <i class="bi bi-plus-circle me-2"></i>CREATE INVOICE
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </form>
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
        this.activateCustomDatalists();
    },

    activateCustomDatalists() {
        document.querySelectorAll('#createInvoiceModal input[list]').forEach(input => {
            const listId = input.getAttribute('list');
            const datalist = document.getElementById(listId);
            if (!datalist) return;

            input.removeAttribute('list');
            
            const wrapper = document.createElement('div');
            wrapper.className = 'position-relative w-100 flex-grow-1';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            const popup = document.createElement('div');
            popup.className = 'dropdown-menu w-100 bg-dark border-secondary shadow-lg custom-datalist-popup p-0';
            popup.style.maxHeight = '250px';
            popup.style.overflowY = 'auto';
            popup.style.position = 'absolute';
            popup.style.top = '100%';
            popup.style.left = '0';
            popup.style.zIndex = '1050';
            popup.style.display = 'none';
            wrapper.appendChild(popup);

            const options = Array.from(datalist.options);
            let selectedIndex = -1;
            let currentFiltered = [];

            const filterOptions = () => {
                const val = input.value.toLowerCase().trim();
                popup.innerHTML = '';
                selectedIndex = -1;
                
                currentFiltered = options.filter(opt => {
                    if (!val) return true;
                    return opt.value.toLowerCase().includes(val) || (opt.textContent && opt.textContent.toLowerCase().includes(val));
                });

                currentFiltered.forEach((opt, idx) => {
                    const div = document.createElement('div');
                    div.className = 'dropdown-item text-white px-3 py-2 text-wrap';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    div.style.fontSize = '14px';
                    
                    let displayHTML = opt.value;
                    if (opt.textContent) {
                        displayHTML += `<span class="text-secondary ms-1" style="font-size:12px">${opt.textContent}</span>`;
                    }
                    div.innerHTML = displayHTML;

                    div.onmousedown = (e) => { 
                        e.preventDefault(); 
                        input.value = opt.value;
                        popup.style.display = 'none';
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    };
                    div.onmouseover = () => {
                        updateHighlight(Array.from(popup.children).indexOf(div));
                    };
                    popup.appendChild(div);
                });

                if (currentFiltered.length > 0) {
                    popup.classList.add('show');
                    popup.style.display = 'block';
                } else {
                    popup.classList.remove('show');
                    popup.style.display = 'none';
                }
            };

            const updateHighlight = (index) => {
                const items = popup.children;
                for (let i = 0; i < items.length; i++) {
                    if (i === index) {
                        items[i].classList.add('bg-primary');
                        items[i].classList.remove('text-white');
                        items[i].classList.add('text-white'); 
                        items[i].scrollIntoView({ block: 'nearest' });
                    } else {
                        items[i].classList.remove('bg-primary');
                    }
                }
                selectedIndex = index;
            };

            input.addEventListener('input', filterOptions);
            input.addEventListener('focus', filterOptions);
            input.addEventListener('blur', () => { 
                // Increased delay to ensure onmousedown of dropdown items fires first
                setTimeout(() => {
                    popup.style.display = 'none';
                    popup.classList.remove('show');
                }, 250); 
            });

            input.addEventListener('keydown', (e) => {
                if (popup.style.display === 'none' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    filterOptions();
                    return;
                }
                const items = popup.children;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (selectedIndex < items.length - 1) updateHighlight(selectedIndex + 1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (selectedIndex > 0) updateHighlight(selectedIndex - 1);
                } else if (e.key === 'Enter') {
                    if (popup.style.display === 'block') {
                        e.preventDefault();
                        if (selectedIndex >= 0 && currentFiltered[selectedIndex]) {
                            input.value = currentFiltered[selectedIndex].value;
                            popup.style.display = 'none';
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                } else if (e.key === 'Escape') {
                    popup.style.display = 'none';
                }
            });
            
            // Allow clicking to open the list
            input.addEventListener('click', () => {
                if (popup.style.display === 'none') filterOptions();
            });
        });
    },

    toggleFullscreen() {
        const dialog = document.querySelector('#createInvoiceModal .modal-dialog');
        if (dialog) {
            if (dialog.classList.contains('modal-fullscreen')) {
                dialog.classList.remove('modal-fullscreen');
                dialog.classList.add('modal-xl');
                dialog.style.maxWidth = '95vw';
            } else {
                dialog.classList.remove('modal-xl');
                dialog.classList.add('modal-fullscreen');
                dialog.style.maxWidth = '100vw';
            }
        }
    },

    toggleDispatchDetails() {
        const checkbox = document.getElementById('dispatchDetails');
        const section = document.getElementById('dispatchSection');
        if (checkbox && section) {
            section.style.display = checkbox.checked ? 'block' : 'none';
        }
    },

    addItemRow(data = null) {
        const tbody = document.getElementById('invoiceItemsBody');
        if (!tbody) return;
        const row = document.createElement('tr');
        
        // Correctly read the type input which contains the actual invoice type
        const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
        const isGST = typeInput ? typeInput.value.includes('gst') : false;
        
        row.innerHTML = `
            <td class="ps-3 py-2">
                <input type="text" name="item[]" list="invItemList" class="bk-form-control w-100 highlight-input" 
                    value="${data ? (data.name || data.description || '') : ''}" required onchange="InvoicesUI.onItemSelect(this)">
            </td>
            <td>
                <input type="text" name="desc[]" class="bk-form-control w-100" 
                    value="${data ? (data.itemDescription || '') : ''}" placeholder="Details">
            </td>
            ${isGST ? `
            <td>
                <input type="text" name="hsn[]" class="bk-form-control w-100 text-center" value="${data ? (data.hsn || '') : ''}">
            </td>
            ` : ''}
            <td>
                <input type="number" name="qty[]" class="bk-form-control w-100 text-center" 
                    value="${data ? (data.quantity || 1) : 1}" min="0.01" step="0.01" oninput="InvoicesUI.calculateRow(this)">
            </td>
            <td>
                <select name="unit[]" class="bk-form-control w-100">
                    <option value="pcs" ${data && data.unit === 'pcs' ? 'selected' : ''}>pcs</option>
                    <option value="set" ${data && data.unit === 'set' ? 'selected' : ''}>set</option>
                    <option value="nos" ${data && data.unit === 'nos' ? 'selected' : ''}>nos</option>
                    <option value="kg" ${data && data.unit === 'kg' ? 'selected' : ''}>kg</option>
                    <option value="mtr" ${data && data.unit === 'mtr' ? 'selected' : ''}>mtr</option>
                    <option value="sqft" ${data && data.unit === 'sqft' ? 'selected' : ''}>sqft</option>
                    <option value="service" ${data && data.unit === 'service' ? 'selected' : ''}>svc</option>
                </select>
            </td>
            <td>
                <input type="number" name="rate[]" class="bk-form-control w-100 text-end" 
                    value="${data ? data.rate : 0}" step="0.01" oninput="InvoicesUI.calculateRow(this)">
            </td>
            ${isGST ? `
            <td>
                <select name="tax[]" class="bk-form-control w-100" onchange="InvoicesUI.calculateRow(this)">
                    <option value="0" ${data && data.gstRate === 0 ? 'selected' : ''}>0%</option>
                    <option value="5" ${data && data.gstRate === 5 ? 'selected' : ''}>5%</option>
                    <option value="12" ${data && data.gstRate === 12 ? 'selected' : ''}>12%</option>
                    <option value="18" ${data && (data.gstRate === 18 || !data.gstRate) ? 'selected' : 'selected'}>18%</option>
                    <option value="28" ${data && data.gstRate === 28 ? 'selected' : ''}>28%</option>
                </select>
            </td>
            ` : ''}
            <td class="text-end pe-3 fw-bold text-info align-middle">
                <span class="row-amount">${data ? (data.quantity * data.rate).toFixed(2) : '0.00'}</span>
                <input type="hidden" name="value[]" value="${data ? (data.quantity * data.rate) : 0}">
            </td>
            <td class="text-center align-middle">
                <button type="button" class="btn btn-link text-danger p-0" onclick="this.closest('tr').remove(); InvoicesUI.calculateTotals()">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;

        tbody.appendChild(row);
        
        if (!data) {
            row.querySelector('input').focus();
        }
        this.calculateTotals();
        this.activateCustomDatalists();
    },

    handleInventorySelect(input, listId = 'invItemList') {
        const val = input.value.trim();
        if (!val) return;

        const list = document.getElementById(listId);
        const option = Array.from(list.options).find(opt => opt.value === val);

        if (option) {
            const data = {
                name: val,
                rate: parseFloat(option.dataset.rate) || 0,
                unit: option.dataset.unit || 'pcs',
                hsn: option.dataset.hsn || '',
                gstRate: parseFloat(option.dataset.gst) || 18
            };
            this.addItemRow(data);
            input.value = ''; // Clear search input
        }
    },

    onCustomerSelect(input) {
        const val = input.value;
        const list = document.getElementById('invCustomerList');
        const option = Array.from(list.options).find(opt => opt.value === val);
        const infoDiv = document.getElementById('customerDetailsInfo');
        const form = document.getElementById('createInvoiceForm');

        if (option) {
            const id = option.getAttribute('data-id');
            const address = option.getAttribute('data-address');
            const gstin = option.getAttribute('data-gst');
            const state = option.getAttribute('data-state');
            const poStr = option.getAttribute('data-dc-number');

            document.querySelector('input[name="customerId"]').value = (id && id !== 'undefined') ? id : '';
            document.querySelector('input[name="customerAddress"]').value = address || '';

            // Fill Customer DC / Ref No if available 
            const poField = form.querySelector('[name="poNumber"]');
            if (poField && option.getAttribute('data-dc-number')) {
                poField.value = option.getAttribute('data-dc-number');
            }

            const hAddress = form.querySelector('[name="customerAddress"]');
            if (hAddress) hAddress.value = address || '';

            // Show Feedback
            if (infoDiv) {
                const displayAddress = address || '';
                const displayGst = gstin || '';
                infoDiv.innerHTML = `<span class="text-success"><i class="bi bi-geo-alt"></i> ${displayAddress.substring(0, 50)}${displayAddress.length > 50 ? '...' : ''}</span> 
                                     ${displayGst ? `<span class="ms-2 text-info"><i class="bi bi-tag"></i> GST: ${displayGst}</span>` : ''}`;
            }
        } else {
            if (infoDiv) infoDiv.innerHTML = '';
        }
    },

    onItemSelect(input) {
        const val = input.value;
        const list = document.getElementById('invItemList');
        const option = Array.from(list.options).find(opt => opt.value === val);

        if (option) {
            const row = input.closest('tr');
            
            const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
            const isGST = typeInput ? typeInput.value.includes('gst') : false;

            row.querySelector('[name="rate[]"]').value = option.dataset.rate || 0;
            row.querySelector('[name="unit[]"]').value = option.dataset.unit || 'pcs';
            
            if (isGST) {
                const hsnField = row.querySelector('[name="hsn[]"]');
                const taxSelect = row.querySelector('[name="tax[]"]');
                if (hsnField) hsnField.value = option.dataset.hsn || '';
                if (taxSelect && option.dataset.gst) {
                    const match = option.dataset.gst.match(/(\d+)/);
                    if (match) taxSelect.value = match[0];
                }
            }
            this.calculateRow(input);
        }
    },

    calculateRow(element) {
        const row = element.closest('tr');
        const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
        const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
        const amount = qty * rate;

        const amountSpan = row.querySelector('.row-amount');
        const amountInput = row.querySelector('[name="value[]"]');
        
        if (amountSpan) amountSpan.textContent = amount.toFixed(2);
        if (amountInput) amountInput.value = amount;

        this.calculateTotals();
    },

    calculateTotals() {
        const rows = document.querySelectorAll('#invoiceItemsBody tr');
        
        const typeInput = document.querySelector('#createInvoiceForm [name="type"]');
        const isGST = typeInput ? typeInput.value.includes('gst') : false;
        
        let subTotal = 0;
        let taxTotal = 0;

        rows.forEach(row => {
            const val = parseFloat(row.querySelector('[name="value[]"]')?.value) || 0;
            subTotal += val;

            if (isGST) {
                const taxRate = parseFloat(row.querySelector('[name="tax[]"]')?.value) || 0;
                taxTotal += (val * taxRate / 100);
            }
        });

        const roundOff = parseFloat(document.getElementById('roundOff').value) || 0;
        const grandTotal = Math.round(subTotal + taxTotal + roundOff);

        const subTotalEl = document.getElementById('subTotal');
        const totalAmountEl = document.getElementById('totalAmountDisplay');

        if (subTotalEl) subTotalEl.textContent = subTotal.toFixed(2);
        
        if (isGST) {
            const cgstEl = document.getElementById('cgstTotal');
            const sgstEl = document.getElementById('sgstTotal');
            if (cgstEl) cgstEl.textContent = (taxTotal / 2).toFixed(2);
            if (sgstEl) sgstEl.textContent = (taxTotal / 2).toFixed(2);
        }

        if (totalAmountEl) totalAmountEl.textContent = grandTotal.toFixed(2);
    },

    async saveInvoice(e) {
        if (e) e.preventDefault();
        
        const form = document.getElementById('createInvoiceForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const formData = new FormData(form);
        const type = formData.get('type') || '';
        const isGST = type.includes('gst-invoice');
        const items = [];
        const total = parseFloat(document.getElementById('totalAmountDisplay').textContent);

        form.querySelectorAll('tbody tr').forEach(row => {
            const nameInput = row.querySelector('[name="item[]"]');
            if (!nameInput) return;
            const name = nameInput.value;
            const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;

            if (name && qty > 0) {
                const finalAmt = parseFloat(row.querySelector('[name="value[]"]').value) || (qty * rate);
                const hsn = row.querySelector('[name="hsn[]"]')?.value || '';
                const taxSelect = row.querySelector('[name="tax[]"]');
                const gst = taxSelect ? parseFloat(taxSelect.value) : 0;

                items.push({
                    name: name,
                    description: row.querySelector('[name="desc[]"]').value,
                    hsn: hsn,
                    quantity: qty,
                    unit: row.querySelector('[name="unit[]"]').value,
                    rate: rate,
                    gstRate: gst,
                    amount: finalAmt
                });
            }
        });

        const cgstAmount = isGST ? (parseFloat(document.getElementById('cgstTotal')?.textContent) || 0) : 0;
        const sgstAmount = isGST ? (parseFloat(document.getElementById('sgstTotal')?.textContent) || 0) : 0;

        const hId = formData.get('customerId');
        const invoiceData = {
            id: formData.get('invoiceNo'),
            invoiceNo: formData.get('invoiceNo'), // Also store explicitly for table display
            type: isGST ? 'gst-invoice' : 'non-gst-invoice',
            customerName: formData.get('customerName'),
            customerAddress: formData.get('customerAddress'),
            customerId: hId || ('CUST-' + Date.now()),
            date: formData.get('date'),
            poNumber: formData.get('poNumber'),
            items: items,
            subtotal: parseFloat(document.getElementById('subTotal').textContent),
            gst: {
                cgst: cgstAmount,
                sgst: sgstAmount,
                igst: 0
            },
            total: total,
            narration: formData.get('narration'),
            dispatchDetails: {
                via: formData.get('dispatchVia') || '',
                lrNo: formData.get('lrNo') || '',
                vehicleNo: formData.get('vehicleNo') || '',
                date: formData.get('dispatchDate') || ''
            },
            status: 'pending',
            jobCardId: form.getAttribute('data-source-jc') || null
        };

        console.log('Saving Invoice:', invoiceData.invoiceNo, invoiceData.id);

        if (!hId) {
            const customers = DataManager.getData('customers') || [];
            const foundCust = customers.find(c => c.name === invoiceData.customerName);
            if (foundCust) invoiceData.customerId = foundCust.id;
        }

        try {
            const invoice = await InvoiceManager.createInvoice(invoiceData);
            
            // NEW: Automatically create Delivery/Service Challan
            if (typeof DeliveryUI !== 'undefined') {
                await DeliveryUI.createAutoChallanFromInvoice(invoice);
            }

            bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal')).hide();
            this.updateTable();

            // NEW: Refresh DeliveryUI if active (go back to history view if we came from there)
            if (typeof DeliveryUI !== 'undefined') {
                if (typeof DeliveryUI.loadHistory === 'function') {
                    DeliveryUI.loadHistory();
                }
                if (typeof DeliveryUI.showSection === 'function') {
                    DeliveryUI.showSection('history'); // ensure we are heavily on history
                }
            }

            // NEW: Update Job Card status if linked
            if (invoiceData.jobCardId && typeof JobCardManager !== 'undefined') {
                await JobCardManager.updateJobCard(invoiceData.jobCardId, {
                    status: 'dispatched',
                    invoiceId: invoice.id
                });
            }

            App.showNotification('Invoice created successfully!', 'success');
            
            // NEW: Auto-open the invoice preview/print
            setTimeout(() => {
                this.previewInvoice(invoice.id);
            }, 300);
        } catch (e) {
            console.error(e);
            alert('Error creating invoice: ' + e.message);
        }
    },

    async showEditModal(invoiceId) {
        const invoice = InvoiceManager.getInvoice(invoiceId);
        if (!invoice) { alert('Invoice not found.'); return; }

        // Determine type from stored invoice
        const invoiceType = invoice.type === 'gst-invoice' || invoice.type === 'with-bill' ? 'sales-gst' : 'sales-non-gst';

        // Open the standard create modal (re-uses all existing UI)
        this.showCreateModal(invoiceType);

        // Wait for modal DOM to render (Reduced wait)
        await new Promise(r => setTimeout(r, 100));

        const form = document.getElementById('createInvoiceForm');
        if (!form) return;

        // Update modal title to indicate editing
        const modalTitle = document.querySelector('#createInvoiceModal .modal-title');
        if (modalTitle) modalTitle.innerHTML = `<i class="bi bi-pencil-square me-2"></i>Edit Invoice`;

        // Pre-fill header fields
        const setField = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val || ''; };
        setField('invoiceNo', invoice.invoiceNo || invoice.id);
        setField('date', invoice.date);
        setField('poNumber', invoice.poNumber);
        setField('customerName', invoice.customerName);
        setField('customerId', invoice.customerId);
        setField('customerAddress', invoice.customerAddress);
        setField('narration', invoice.narration);
        setField('dispatchVia', invoice.dispatchDetails?.via);
        setField('lrNo', invoice.dispatchDetails?.lrNo);
        setField('vehicleNo', invoice.dispatchDetails?.vehicleNo);
        setField('dispatchDate', invoice.dispatchDetails?.date);

        // Show customer details info if possible
        if (invoice.customerId) {
            const customers = DataManager.getData('customers') || [];
            const cust = customers.find(c => c.id === invoice.customerId);
            if (cust) {
                const infoEl = document.getElementById('customerDetailsInfo');
                if (infoEl) infoEl.textContent = `${cust.address || ''} | GSTIN: ${cust.gstin || '-'}`;
            }
        }

        // Clear existing item rows and re-add from invoice data
        const tbody = form.querySelector('tbody');
        if (tbody) tbody.innerHTML = '';

        for (const item of (invoice.items || [])) {
            // Optimized: Use the built-in data support in addItemRow to populate immediately
            this.addItemRow(item);
        }

        // Recalculate totals
        this.calculateTotals();

        // Override the form submit to UPDATE instead of create
        form.onsubmit = async (e) => {
            e.preventDefault();
            await this.saveEditedInvoice(invoiceId);
        };

        // Also override the button in the footer
        const saveBtn = document.querySelector('#createInvoiceModal .btn-primary[onclick*="saveInvoice"]');
        if (saveBtn) {
            saveBtn.removeAttribute('onclick');
            saveBtn.onclick = () => this.saveEditedInvoice(invoiceId);
            saveBtn.textContent = 'Update Invoice';
        }
    },

    async saveEditedInvoice(invoiceId) {
        const form = document.getElementById('createInvoiceForm');
        if (!form || !form.checkValidity()) { form?.reportValidity(); return; }

        const formData = new FormData(form);
        const type = formData.get('type') || '';
        const isGST = type === 'sales-gst' || type === 'gst-invoice';
        const items = [];
        const total = parseFloat(document.getElementById('totalAmountDisplay')?.textContent) || 0;

        form.querySelectorAll('tbody tr').forEach(row => {
            const nameInput = row.querySelector('[name="item[]"]');
            if (!nameInput) return;
            const name = nameInput.value;
            const qty = parseFloat(row.querySelector('[name="qty[]"]').value) || 0;
            const rate = parseFloat(row.querySelector('[name="rate[]"]').value) || 0;
            if (name && qty > 0) {
                const finalAmt = parseFloat(row.querySelector('[name="value[]"]').value) || (qty * rate);
                const taxSelect = row.querySelector('[name="tax[]"]');
                items.push({
                    name,
                    description: row.querySelector('[name="desc[]"]').value,
                    hsn: row.querySelector('[name="hsn[]"]')?.value || '',
                    quantity: qty,
                    unit: row.querySelector('[name="unit[]"]').value,
                    rate,
                    gstRate: taxSelect ? parseFloat(taxSelect.value) : 0,
                    amount: finalAmt
                });
            }
        });

        const cgstAmount = isGST ? (parseFloat(document.getElementById('cgstTotal')?.textContent) || 0) : 0;
        const sgstAmount = isGST ? (parseFloat(document.getElementById('sgstTotal')?.textContent) || 0) : 0;

        const updates = {
            invoiceNo: formData.get('invoiceNo'),
            date: formData.get('date'),
            customerName: formData.get('customerName'),
            customerId: formData.get('customerId'),
            customerAddress: formData.get('customerAddress'),
            poNumber: formData.get('poNumber'),
            narration: formData.get('narration'),
            dispatchDetails: {
                via: formData.get('dispatchVia') || '',
                lrNo: formData.get('lrNo') || '',
                vehicleNo: formData.get('vehicleNo') || '',
                date: formData.get('dispatchDate') || ''
            },
            items,
            subtotal: parseFloat(document.getElementById('subTotal')?.textContent) || 0,
            gst: { cgst: cgstAmount, sgst: sgstAmount, igst: 0 },
            total,
        };

        console.log('Updating Invoice:', invoiceId, 'to new No:', updates.invoiceNo);

        try {
            const updatedInvoice = await InvoiceManager.updateInvoice(invoiceId, updates);
            
            // PERFORMANCE FIX: Non-blocking call to createAutoChallanFromInvoice
            // This allows the UI to close immediately while sync happens in background
            if (typeof DeliveryUI !== 'undefined') {
                DeliveryUI.createAutoChallanFromInvoice(updatedInvoice);
            }

            bootstrap.Modal.getInstance(document.getElementById('createInvoiceModal')).hide();
            this.updateTable();
            
            // NEW: Refresh DeliveryUI if active
            if (typeof DeliveryUI !== 'undefined' && typeof DeliveryUI.loadInvoices === 'function') {
                DeliveryUI.loadInvoices();
            }

            App.showNotification('Invoice updated successfully!', 'success');

            // NEW: Auto-open the invoice preview/print
            setTimeout(() => {
                this.previewInvoice(invoiceId);
            }, 300);
        } catch (e) {
            console.error(e);
            alert('Error updating invoice: ' + e.message);
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
            const gstRate = parseFloat(item.gstRate?.toString().replace(/[^0-9.]/g, '')) || 0;
            const isPlain = invoice.type === 'non-gst-invoice';
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
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${item.discount || 0}%</td>
                    ${isPlain ? '' : `
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstRate}%</td>
                    <td style="padding: 8px; text-align: right; border-right: 1px solid #000;">${cgstRate}%</td>
                    `}
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

            <h3 style="text-align: center; margin: 10px 0; border-bottom: 1px solid #eee; padding-bottom: 5px;">${invoice.type === 'non-gst-invoice' ? 'Invoice' : 'Tax Invoice'}</h3>

            <!-- Info Grid -->
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11px; margin-bottom: 10px;">
                <tr>
                    <td style="width: 50%; border: 1px solid #000; padding: 5px;">
                        <table style="width: 100%;">
                            <tr><td style="width: 40%;"><strong>Invoice No</strong></td><td>: ${invoice.invoiceNo}</td></tr>
                            <tr><td><strong>Date</strong></td><td>: ${invoice.date}</td></tr>
                            <tr><td><strong>Due Date</strong></td><td>: ${invoice.date}</td></tr>
                            <tr><td><strong>Customer DC / Ref No</strong></td><td>: ${invoice.poNumber || '-'}</td></tr>
                        </table>
                    </td>
                    <td style="width: 50%; border: 1px solid #000; padding: 5px;">
                        <table style="width: 100%;">
                            <tr><td style="width: 40%;"><strong>Dispatch Via</strong></td><td>: ${invoice.dispatchDetails?.via || ''}</td></tr>
                            <tr><td><strong>LR/Tracking No</strong></td><td>: ${invoice.dispatchDetails?.lrNo || ''}</td></tr>
                            <tr><td><strong>Vehicle No</strong></td><td>: ${invoice.dispatchDetails?.vehicleNo || ''}</td></tr>
                            <tr><td><strong>Dispatch Date</strong></td><td>: ${invoice.dispatchDetails?.date || ''}</td></tr>
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
                        <th style="padding: 8px; border-right: 1px solid #000; width: 4%;">#</th>
                        <th style="padding: 8px; text-align: left; border-right: 1px solid #000; width: 24%;">Description</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 10%;">HSN</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 7%;">QTY</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 7%;">Units</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 10%;">Rate</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 5%;">Disc</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 6.5%;">CGST%</th>
                        <th style="padding: 8px; border-right: 1px solid #000; width: 6.5%;">SGST%</th>
                        <th style="padding: 8px; width: 20%;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr style="font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000;">
                        <td colspan="9" style="padding: 8px; text-align: right; border-right: 1px solid #000; border-left: 1px solid #000;">Subtotal</td>
                        <td style="padding: 8px; text-align: right; border-right: 1px solid #000; padding-right: 5px;">${subtotal.toFixed(2)}</td>
                    </tr>
                    ${cgstAmount > 0 ? `
                    <tr style="font-weight: bold; border-bottom: 1px solid #000;">
                        <td colspan="9" style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; border-left: 1px solid #000;">CGST@${(displayGstRate / 2).toFixed(1)}%</td>
                        <td style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; padding-right: 5px;">${cgstAmount.toFixed(2)}</td>
                    </tr>
                    <tr style="font-weight: bold; border-bottom: 1px solid #000;">
                        <td colspan="9" style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; border-left: 1px solid #000;">SGST@${(displayGstRate / 2).toFixed(1)}%</td>
                        <td style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; padding-right: 5px;">${sgstAmount.toFixed(2)}</td>
                    </tr>
                    ` : ''}
                    <tr style="font-weight: bold; border-bottom: 1px solid #000;">
                        <td colspan="9" style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; border-left: 1px solid #000;">Round Off</td>
                        <td style="padding: 4px 8px; text-align: right; border-right: 1px solid #000; padding-right: 5px;">${roundOff.toFixed(2)}</td>
                    </tr>
                    <tr style="font-weight: bold; font-size: 14px; background: #f8f8f8; border-bottom: 2px solid #000; border-left: 1px solid #000; border-right: 1px solid #000;">
                        <td colspan="3" style="padding: 10px; border-right: 1px solid #000;">Total Qty: ${totalQty.toFixed(2)}</td>
                        <td colspan="6" style="padding: 10px; text-align: right; border-right: 1px solid #000;">Total Amount</td>
                        <td style="padding: 10px; text-align: right; font-weight: bold; padding-right: 5px;">Rs.${invoice.total.toFixed(2)}</td>
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
                    ${invoice.narration ? `
                    <div style="margin-top: 10px; border: 1px solid #eee; padding: 5px; background: #fafafa;">
                        <strong>Narration:</strong><br>
                        ${invoice.narration}
                    </div>
                    ` : ''}
                    <div style="margin-top: 10px; color: #666; font-style: italic;">Amount in Words: ${this.numberToWords(invoice.total)} Only</div>
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
                
                <!-- Financial Summary Cards -->
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Total Outstanding</div>
                                <h3 class="mb-0 text-danger" id="summaryPurchasePendingAmount">₹0.00</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Pending Bills</div>
                                <h3 class="mb-0 text-warning" id="summaryPurchasePendingBills">0</h3>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary shadow-sm">
                            <div class="card-body p-3 text-center">
                                <div class="text-white-50 fw-bold small text-uppercase mb-1">Suppliers with O/S</div>
                                <h3 class="mb-0 text-info" id="summaryPurchasePendingParties">0</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card bg-dark text-white border-secondary mb-4">
                    <div class="card-body">
                         <div class="row g-2 mb-3">
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Financial Year</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseYear" onchange="InvoicesUI.updatePurchasesTable()">
                                    <option value="">All Year</option>
                                    ${yearOptions}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small text-white-50">Vendor</label>
                                <select class="form-select bg-dark text-white border-secondary" id="filterPurchaseVendor" onchange="InvoicesUI.updatePurchasesTable()">
                                    <option value="">All Vendors</option>
                                    ${vendorOptions}
                                </select>
                            </div>
                            <div class="col-md-6 text-end">
                                <label class="form-label small text-white-50 d-block">Status</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusAll" value="all" ${this.currentStatusFilter === 'all' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('all')">
                                    <label class="btn btn-outline-secondary btn-sm" for="purStatusAll">All</label>
                                    
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPending" value="pending" ${this.currentStatusFilter === 'pending' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('pending')">
                                    <label class="btn btn-outline-danger btn-sm" for="purStatusPending">Pending</label>

                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPartial" value="partial" ${this.currentStatusFilter === 'partial' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('partial')">
                                    <label class="btn btn-outline-warning btn-sm" for="purStatusPartial">Partial</label>
                                    
                                    <input type="radio" class="btn-check" name="purchaseStatusFilter" id="purStatusPaid" value="paid" ${this.currentStatusFilter === 'paid' ? 'checked' : ''} onchange="InvoicesUI.setStatusFilter('paid')">
                                    <label class="btn btn-outline-success btn-sm" for="purStatusPaid">Paid</label>
                                </div>
                            </div>
                        </div>
                         <div class="input-group">
                            <span class="input-group-text bg-secondary border-secondary text-light"><i class="bi bi-search"></i></span>
                            <input type="text" class="form-control bg-dark text-light border-secondary" id="purchaseSearch" 
                                placeholder="Search bills by number, vendor or items..." onkeyup="InvoicesUI.debouncedFilter()">
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
        const purchasesRaw = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const voucherMap = (typeof VoucherManager !== 'undefined') ? VoucherManager.getVoucherAllocationsMap() : new Map();
        
        // Enhance with balance and status
        const purchases = purchasesRaw.map(p => {
            const balance = (typeof VoucherManager !== 'undefined') ? 
                VoucherManager.getDocumentBalance(p.id, parseFloat(p.amount || 0), voucherMap) : 
                parseFloat(p.amount || 0);
            return {
                ...p,
                balance,
                isPaid: balance <= 0.05,
                isPartial: balance > 0.05 && balance < (parseFloat(p.amount || 0) - 0.05)
            };
        });

        // Filter UI states
        const yearFilter = document.getElementById('filterPurchaseYear')?.value;
        const vendorFilter = document.getElementById('filterPurchaseVendor')?.value;
        const query = document.getElementById('purchaseSearch')?.value?.toLowerCase();
        const statusFilter = this.currentStatusFilter;

        const filtered = purchases.filter(p => {
            const yearStr = DataManager.getFinancialYear(p.date);
            const yearMatch = !yearFilter || yearStr === yearFilter;
            const vendorMatch = !vendorFilter || p.vendor === vendorFilter;
            const statusMatch = statusFilter === 'all' || 
                             (statusFilter === 'paid' && p.isPaid) ||
                             (statusFilter === 'pending' && !p.isPaid && !p.isPartial) ||
                             (statusFilter === 'partial' && p.isPartial);
            const searchMatch = !query || 
                               (p.billNo || '').toLowerCase().includes(query) || 
                               (p.vendor || '').toLowerCase().includes(query) ||
                               (p.description || '').toLowerCase().includes(query);

            return yearMatch && vendorMatch && statusMatch && searchMatch;
        });

        // Update Summary Cards
        const totalPending = filtered.reduce((sum, p) => sum + p.balance, 0);
        const pendingCount = filtered.filter(p => p.balance > 0.05).length;
        const outstandingParties = new Set(filtered.filter(p => p.balance > 0.05).map(p => p.vendor)).size;

        const updateEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        updateEl('summaryPurchasePendingAmount', `₹${totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        updateEl('summaryPurchasePendingBills', pendingCount);
        updateEl('summaryPurchasePendingParties', outstandingParties);

        const container = document.getElementById('purchasesTableContainer');
        if (!container) return;

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center py-5 text-muted">No purchase records found matching filters.</div>`;
            return;
        }

        // Sort by date desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        const html = `
            <table class="table table-dark table-hover align-middle border-secondary">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Bill #</th>
                        <th>Vendor</th>
                        <th class="text-end">Total Amount</th>
                        <th class="text-end">Balance</th>
                        <th class="text-center">Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filtered.map(p => {
            const statusBadge = p.isPaid ? 
                '<span class="badge bg-success-subtle text-success border border-success">Paid</span>' : 
                (p.isPartial ? 
                    '<span class="badge bg-warning-subtle text-warning border border-warning">Partial</span>' : 
                    '<span class="badge bg-danger-subtle text-danger border border-danger">Pending</span>');

            return `
                        <tr>
                            <td>${DataManager.formatDateDisplay(p.date)}</td>
                            <td class="fw-bold text-warning">${p.billNo || 'N/A'}</td>
                            <td>${p.vendor || 'Unknown'}</td>
                            <td class="text-end">₹${parseFloat(p.amount).toFixed(2)}</td>
                            <td class="text-end fw-bold ${p.balance > 0 ? 'text-danger' : 'text-success'}">₹${p.balance.toFixed(2)}</td>
                            <td class="text-center">${statusBadge}</td>
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
                    <div style="margin-bottom: 6px;"><strong>Status:</strong> <span style="min-width: 80px; display: inline-block; color: ${p.status === 'paid' ? '#27ae60' : '#e67e22'}; font-weight: bold;">${p.status?.toUpperCase()}</span></div>
                    
                    <div style="margin-top: 10px; padding-top: 5px; border-top: 1px solid #eee; text-align: right;">
                        <div style="font-size: 11px; color: #666;">Supplier Invoice No:</div>
                        <div style="font-size: 14px; color: #2c3e50; font-weight: bold;">${p.supplierBillNo || '-'}</div>
                    </div>

                    ${p.poNumber ? `
                    <div style="margin-top: 5px; text-align: right;">
                        <div style="font-size: 11px; color: #666;">Ref No / DC No:</div>
                        <div style="font-size: 14px; color: #2c3e50; font-weight: bold;">${p.poNumber}</div>
                    </div>
                    ` : ''}
                </div>
v>
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
