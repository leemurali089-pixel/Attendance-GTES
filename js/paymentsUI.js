/**
 * Payment Follow-up UI Module
 * Handles dashboard for pending invoices and customer-wise tracking.
 */

const PaymentsUI = {
    currentFilters: {
        type: 'all', // 'all', 'gst', 'plain'
        customer: '',
        financialYear: '',
        status: 'pending' // 'all', 'pending', 'partial', 'paid'
    },
    dataCache: null,
    selectedCustomers: new Set(),

    async init() {
        console.log('PaymentsUI initialized');
    },

    async load() {
        this.dataCache = null; // Reset cache on load
        this.selectedCustomers.clear();
        this.renderPaymentFollowup();
    },

    /**
     * Main Dashboard View
     */
    async renderPaymentFollowup() {
        const container = document.getElementById('paymentsView');
        if (!container) return;

        // Get or use cached invoices with balance
        if (!this.dataCache) {
            this.dataCache = InvoiceManager.getInvoicesWithBalance();
        }
        
        // Filter out fully paid invoices
        let pendingInvoices = this.dataCache.filter(inv => inv.balance > 0.05);

        // Apply UI Filters
        pendingInvoices = this.applyFilters(pendingInvoices);

        // Group by Customer - Use a more robust grouping to fix mapping bug
        const customerSummary = this.groupInvoicesByCustomer(pendingInvoices);

        // Render HTML
        container.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-cash-coin text-info me-2"></i> Payment Follow Up</h2>
                    <div class="d-flex gap-2">
                        ${this.selectedCustomers.size > 0 ? `
                            <button class="btn btn-warning btn-sm animate__animated animate__fadeIn" onclick="PaymentsUI.showBulkTaskModal()">
                                <i class="bi bi-plus-circle-fill me-1"></i> Create Bulk Task (${this.selectedCustomers.size})
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-warning btn-sm" onclick="App.showView('tasks')">
                            <i class="bi bi-check-square"></i> View Tasks
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                            <i class="bi bi-grid-fill"></i> Back to Apps
                        </button>
                    </div>
                </div>

                <!-- Filters & Toggles: higher z-index + overflow visible so typeahead sits above summary cards -->
                <div class="card glass-panel border-secondary mb-4 pay-followup-filter-stack" style="position:relative;z-index:100;">
                    <div class="card-body overflow-visible">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-3 position-relative" style="z-index:200;">
                                <label class="text-white-50 small mb-1">Filter by Customer</label>
                                <input type="text" id="payFollowCustomerFilter" class="form-control bg-dark border-secondary text-white" 
                                    placeholder="Type to search customer..." value="${(this.currentFilters.customer || '').replace(/"/g, '&quot;')}"
                                    autocomplete="off">
                            </div>
                            <div class="col-md-2">
                                <label class="text-white-50 small mb-1">Financial Year</label>
                                <select id="payFollowYearFilter" class="form-select bg-dark border-secondary text-white" 
                                    onchange="PaymentsUI.updateFilters()">
                                    <option value="">All Years</option>
                                    ${this.getYearOptions()}
                                </select>
                            </div>
                            <div class="col-md-7 text-end">
                                <div class="d-flex flex-wrap gap-2 justify-content-end">
                                    <div class="btn-group btn-group-sm" role="group">
                                        <button type="button" class="btn ${this.currentFilters.type === 'all' ? 'btn-info' : 'btn-outline-info'}" 
                                            onclick="PaymentsUI.setTypeFilter('all')">All Invoices</button>
                                        <button type="button" class="btn ${this.currentFilters.type === 'gst' ? 'btn-info' : 'btn-outline-info'}" 
                                            onclick="PaymentsUI.setTypeFilter('gst')">GST</button>
                                        <button type="button" class="btn ${this.currentFilters.type === 'plain' ? 'btn-info' : 'btn-outline-info'}" 
                                            onclick="PaymentsUI.setTypeFilter('plain')">Plain</button>
                                    </div>

                                    <div class="btn-group btn-group-sm" role="group">
                                        <button type="button" class="btn ${this.currentFilters.status === 'all' ? 'btn-warning' : 'btn-outline-warning'}" 
                                            onclick="PaymentsUI.setStatusFilter('all')">All Status</button>
                                        <button type="button" class="btn ${this.currentFilters.status === 'pending' ? 'btn-warning' : 'btn-outline-warning'}" 
                                            onclick="PaymentsUI.setStatusFilter('pending')" title="Zero payment">Pending</button>
                                        <button type="button" class="btn ${this.currentFilters.status === 'partial' ? 'btn-warning' : 'btn-outline-warning'}" 
                                            onclick="PaymentsUI.setStatusFilter('partial')" title="Some payment received">Partial</button>
                                        <button type="button" class="btn ${this.currentFilters.status === 'paid' ? 'btn-warning' : 'btn-outline-warning'}" 
                                            onclick="PaymentsUI.setStatusFilter('paid')" title="Fully paid">Paid</button>
                                    </div>

                                    <button class="btn btn-outline-secondary btn-sm" onclick="PaymentsUI.refreshData()" title="Refresh Data">
                                        <i class="bi bi-arrow-clockwise"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="payFollowResultsBlock" class="pay-followup-results-stack" style="position:relative;z-index:1;">
                ${this._buildPayFollowResultsHtml(customerSummary)}
                </div>
            </div>
        `;
        
        this.setupCustomerSearchDropdown();
    },

    /**
     * Recompute summary + table only (keeps focus in customer filter; avoids full re-render on each keystroke).
     */
    renderPayFollowResultsOnly() {
        const block = document.getElementById('payFollowResultsBlock');
        if (!block) {
            this.renderPaymentFollowup();
            return;
        }
        if (!this.dataCache) {
            this.dataCache = InvoiceManager.getInvoicesWithBalance();
        }
        let pendingInvoices = this.dataCache.filter(inv => inv.balance > 0.05);
        const custEl = document.getElementById('payFollowCustomerFilter');
        if (custEl) {
            this.currentFilters.customer = custEl.value;
        }
        const yearEl = document.getElementById('payFollowYearFilter');
        if (yearEl) {
            this.currentFilters.financialYear = yearEl.value;
        }
        pendingInvoices = this.applyFilters(pendingInvoices);
        const customerSummary = this.groupInvoicesByCustomer(pendingInvoices);
        block.innerHTML = this._buildPayFollowResultsHtml(customerSummary);
        requestAnimationFrame(() => this._positionPayFollowCustomerDropdown());
    },

    _buildPayFollowResultsHtml(customerSummary) {
        return `
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                         <div class="card bg-dark border-info border-opacity-25 h-100 shadow-sm">
                            <div class="card-body">
                                <h6 class="text-white-50 small mb-2 uppercase tracking-wider">TOTAL PENDING AMOUNT</h6>
                                <h3 class="text-info fw-bold mb-0">₹ ${this.formatCurrency(customerSummary.reduce((sum, c) => sum + c.totalPending, 0))}</h3>
                            </div>
                         </div>
                    </div>
                    <div class="col-md-4">
                         <div class="card bg-dark border-warning border-opacity-25 h-100 shadow-sm">
                            <div class="card-body">
                                <h6 class="text-white-50 small mb-2 uppercase tracking-wider">TOTAL PENDING BILLS</h6>
                                <h3 class="text-warning fw-bold mb-0">${customerSummary.reduce((sum, c) => sum + c.billCount, 0)}</h3>
                            </div>
                         </div>
                    </div>
                    <div class="col-md-4">
                         <div class="card bg-dark border-success border-opacity-25 h-100 shadow-sm">
                            <div class="card-body">
                                <h6 class="text-white-50 small mb-2 uppercase tracking-wider">CUSTOMERS WITH OUTSTANDING</h6>
                                <h3 class="text-success fw-bold mb-0">${customerSummary.length}</h3>
                            </div>
                         </div>
                    </div>
                </div>

                <div class="card glass-panel border-secondary overflow-hidden shadow">
                    <div class="table-responsive">
                        <table class="table table-dark table-hover mb-0 align-middle">
                            <thead class="bg-dark text-white-50 small uppercase">
                                <tr>
                                    <th class="ps-4" style="width: 40px;">
                                        <input type="checkbox" class="form-check-input" onchange="PaymentsUI.toggleAllCustomers(this)">
                                    </th>
                                    <th>Customer Name</th>
                                    <th class="text-center">Pending Bills</th>
                                    <th class="text-end">Total Pending Amount</th>
                                    <th class="text-center">Last Bill Date</th>
                                    <th class="text-end pe-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customerSummary.length === 0 ? `
                                    <tr>
                                        <td colspan="6" class="p-5 text-center text-muted">No pending invoices found matching filters.</td>
                                    </tr>
                                ` : customerSummary.map(c => `
                                    <tr onclick="PaymentsUI.renderCustomerDetails('${btoa(c.groupKey)}')" style="cursor: pointer;">
                                        <td class="ps-4" onclick="event.stopPropagation()">
                                            <input type="checkbox" class="form-check-input" ${this.selectedCustomers.has(c.groupKey) ? 'checked' : ''} 
                                                onchange="PaymentsUI.toggleCustomerSelection('${(c.groupKey || '').replace(/'/g, "\\'")}')">
                                        </td>
                                        <td class="ps-4 fw-bold">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar-sm bg-primary bg-opacity-10 text-primary me-3 rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                                    ${c.customerName.charAt(0).toUpperCase()}
                                                </div>
                                                ${(c.customerName || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                                            </div>
                                        </td>
                                        <td class="text-center">
                                            <span class="badge bg-warning bg-opacity-10 text-warning px-3 rounded-pill">${c.billCount}</span>
                                        </td>
                                        <td class="text-end fw-bold text-info">₹ ${this.formatCurrency(c.totalPending)}</td>
                                        <td class="text-center text-white-50">${this.formatDate(c.lastBillDate)}</td>
                                        <td class="text-end pe-4">
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-info rounded-pill px-3" onclick="event.stopPropagation(); PaymentsUI.renderCustomerDetails('${btoa(c.groupKey)}')">
                                                    View Bills
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
        `;
    },

    /**
     * Customer Specific Details View
     * @param {string} encodedGroupKey Base64 encoded group key (name|id or just name)
     */
    async renderCustomerDetails(encodedGroupKey) {
        const groupKey = atob(encodedGroupKey);
        
        if (!this.dataCache) this.dataCache = InvoiceManager.getInvoicesWithBalance();
        
        // Match by groupKey (robust matching)
        let customerInvoices = this.dataCache.filter(inv => {
            const currentKey = (inv.customerId || 'ID') + '::' + (inv.customerName || 'NAME');
            return currentKey === groupKey && inv.balance > 0.05;
        });
        
        if (customerInvoices.length === 0) {
            // Fallback for direct name match if key fails
            customerInvoices = this.dataCache.filter(inv => (inv.customerName === groupKey || inv.customerId === groupKey) && inv.balance > 0.05);
        }

        if (customerInvoices.length === 0) {
            this.renderPaymentFollowup();
            return;
        }

        const customerName = customerInvoices[0].customerName;
        const customerId = customerInvoices[0].customerId;
        const totalPending = customerInvoices.reduce((sum, inv) => sum + inv.balance, 0);

        const container = document.getElementById('paymentsView');
        container.innerHTML = `
            <div class="container-fluid animate__animated animate__fadeIn">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <nav aria-label="breadcrumb">
                        <ol class="breadcrumb mb-0">
                            <li class="breadcrumb-item"><a href="#" onclick="PaymentsUI.renderPaymentFollowup(); return false;" class="text-info text-decoration-none">Payment Follow Up</a></li>
                            <li class="breadcrumb-item active text-white" aria-current="page">${customerName}</li>
                        </ol>
                    </nav>
                    <div class="d-flex gap-2">
                        <button class="btn btn-warning btn-sm" onclick="PaymentsUI.showCreateTaskModal('${btoa(groupKey)}')">
                            <i class="bi bi-plus-circle me-1"></i> Create Task
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="PaymentsUI.renderPaymentFollowup()">
                            <i class="bi bi-arrow-left me-1"></i> Back to List
                        </button>
                    </div>
                </div>

                <div class="row g-4">
                    <!-- Left Side: Invoice List -->
                    <div class="col-lg-8">
                        <div class="card glass-panel border-secondary overflow-hidden shadow">
                            <div class="card-header bg-dark border-secondary p-3 d-flex justify-content-between align-items-center">
                                <h5 class="mb-0 text-white">Pending Bills for ${customerName}</h5>
                                <span class="badge bg-info bg-opacity-10 text-info">${customerInvoices.length} Bills</span>
                            </div>
                            <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                                <table class="table table-dark table-hover mb-0 align-middle">
                                    <thead class="bg-dark text-white-50 small uppercase sticky-top">
                                        <tr>
                                            <th class="ps-3">Invoice No.</th>
                                            <th>Date</th>
                                            <th class="text-end">Bill Amount</th>
                                            <th class="text-end">Pending</th>
                                            <th class="text-end pe-3">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${customerInvoices.map(inv => `
                                            <tr>
                                                <td class="ps-3 fw-bold">${inv.invoiceNo}</td>
                                                <td>${this.formatDate(inv.date)}</td>
                                                <td class="text-end text-white-50">₹ ${this.formatCurrency(inv.total)}</td>
                                                <td class="text-end fw-bold text-info">₹ ${this.formatCurrency(inv.balance)}</td>
                                                <td class="text-end pe-3">
                                                    <button class="btn btn-icon btn-sm btn-outline-info" title="View Invoice" 
                                                        onclick="InvoicesUI.previewInvoice('${inv.id}')">
                                                        <i class="bi bi-eye"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="card-footer bg-dark border-secondary p-3">
                                <div class="d-flex justify-content-between align-items-center fw-bold">
                                    <div class="text-white-50">Grand Total Outstanding</div>
                                    <div class="text-info fs-5">₹ ${this.formatCurrency(totalPending)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Side: Customer Info & Quick Options -->
                    <div class="col-lg-4">
                        <div class="card bg-dark border-secondary mb-4 shadow-sm">
                            <div class="card-body">
                                <h5 class="text-white mb-3 border-bottom border-secondary pb-2">Customer Details</h5>
                                <div class="mb-3">
                                    <label class="text-white-50 small d-block">Name</label>
                                    <div class="text-white fw-bold">${customerName}</div>
                                </div>
                                <div class="mb-3">
                                    <label class="text-white-50 small d-block">Address</label>
                                    <div class="text-white small">${customerInvoices[0].customerAddress || 'N/A'}</div>
                                </div>
                                <div class="row g-2 mb-0">
                                    <div class="col-6">
                                        <label class="text-white-50 small d-block">Total Bills</label>
                                        <div class="text-white">${customerInvoices.length}</div>
                                    </div>
                                    <div class="col-6">
                                        <label class="text-white-50 small d-block">Status</label>
                                        <div class="text-warning">Outstanding</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Grouping logic for summary - FIXED to ensure unique grouping
     */
    groupInvoicesByCustomer(invoices) {
        const groups = {};
        invoices.forEach(inv => {
            // Use a robust composite key with separator to prevent collisions
            const groupKey = (inv.customerId || 'ID') + '::' + (inv.customerName || 'NAME');
            
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    groupKey: groupKey,
                    customerId: inv.customerId,
                    customerName: inv.customerName,
                    billCount: 0,
                    totalPending: 0,
                    lastBillDate: inv.date
                };
            }
            groups[groupKey].billCount++;
            groups[groupKey].totalPending += inv.balance;
            if (new Date(inv.date) > new Date(groups[groupKey].lastBillDate)) {
                groups[groupKey].lastBillDate = inv.date;
            }
        });

        return Object.values(groups).sort((a, b) => b.totalPending - a.totalPending);
    },

    setTypeFilter(type) {
        this.currentFilters.type = type;
        this.renderPaymentFollowup();
    },

    setStatusFilter(status) {
        this.currentFilters.status = status;
        this.renderPaymentFollowup();
    },

    updateFilters() {
        const cust = document.getElementById('payFollowCustomerFilter')?.value || '';
        const year = document.getElementById('payFollowYearFilter')?.value || '';
        this.currentFilters.customer = cust;
        this.currentFilters.financialYear = year;
        this.renderPayFollowResultsOnly();
    },

    refreshData() {
        this.dataCache = null;
        this.renderPaymentFollowup();
    },

    applyFilters(invoices) {
        let filtered = [...invoices];

        // Type Filter
        if (this.currentFilters.type === 'gst') {
            filtered = filtered.filter(inv => {
                const isGST = inv.type === 'with-bill' || inv.type === 'gst-invoice' || inv.type === 'sales-gst';
                return isGST;
            });
        } else if (this.currentFilters.type === 'plain') {
            filtered = filtered.filter(inv => {
                const isGST = inv.type === 'with-bill' || inv.type === 'gst-invoice' || inv.type === 'sales-gst';
                return !isGST;
            });
        }

        // Status Filter
        if (this.currentFilters.status === 'pending') {
            filtered = filtered.filter(inv => !inv.isPaid && !inv.isPartial);
        } else if (this.currentFilters.status === 'partial') {
            filtered = filtered.filter(inv => inv.isPartial);
        } else if (this.currentFilters.status === 'paid') {
            filtered = filtered.filter(inv => inv.isPaid);
        }

        // Customer Search - Filter the whole group if a match is found
        if (this.currentFilters.customer) {
            const search = this.currentFilters.customer.toLowerCase();
            filtered = filtered.filter(inv => (inv.customerName || '').toLowerCase().includes(search));
        }

        // Financial Year
        if (this.currentFilters.financialYear) {
            filtered = filtered.filter(inv => {
                const fy = DataManager.getFinancialYear(inv.date);
                return fy === this.currentFilters.financialYear;
            });
        }

        return filtered;
    },

    getYearOptions() {
        const invoices = InvoiceManager.getAllInvoices();
        const years = new Set();
        invoices.forEach(inv => {
            const fy = DataManager.getFinancialYear(inv.date);
            if (fy) years.add(fy);
        });
        
        years.add(DataManager.getFinancialYear(new Date()));
        
        return Array.from(years).filter(y => y).sort().reverse().map(y => 
            `<option value="${y}" ${this.currentFilters.financialYear === y ? 'selected' : ''}>FY ${y}</option>`
        ).join('');
    },

    toggleCustomerSelection(groupKey) {
        if (this.selectedCustomers.has(groupKey)) {
            this.selectedCustomers.delete(groupKey);
        } else {
            this.selectedCustomers.add(groupKey);
        }
        this.renderPaymentFollowup();
    },

    toggleAllCustomers(checkbox) {
        if (checkbox.checked) {
            // Only add visible customers
            const invoices = this.applyFilters(this.dataCache || []);
            const summaries = this.groupInvoicesByCustomer(invoices);
            summaries.forEach(s => this.selectedCustomers.add(s.groupKey));
        } else {
            this.selectedCustomers.clear();
        }
        this.renderPaymentFollowup();
    },

    showBulkTaskModal() {
        if (this.selectedCustomers.size === 0) return;
        
        const names = [];
        const summaries = this.groupInvoicesByCustomer(this.dataCache || []);
        summaries.forEach(s => {
            if (this.selectedCustomers.has(s.groupKey)) {
                names.push(s.customerName);
            }
        });

        if (typeof TasksUI !== 'undefined') {
            TasksUI.showCreateModal({
                partyName: `Bulk: ${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''}`,
                narration: `Payment follow-up for multiple customers: ${names.join(', ')}`,
                type: 'payment_followup',
                bulkPartyIds: Array.from(this.selectedCustomers)
            });
        }
    },

    formatCurrency(amount) {
        return (amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    showCreateTaskModal(encodedGroupKey) {
        const groupKey = atob(encodedGroupKey);
        const summaries = this.groupInvoicesByCustomer(this.dataCache || []);
        const customer = summaries.find(s => s.groupKey === groupKey);
        
        if (typeof TasksUI !== 'undefined') {
            TasksUI.showCreateModal({
                partyId: customer ? (customer.customerId || customer.customerName) : groupKey,
                partyName: customer ? customer.customerName : groupKey,
                type: 'payment_followup',
                narration: `Payment follow-up for ${customer ? customer.customerName : 'customer'}`
            });
        } else {
            App.showNotification('Tasks module not loaded.', 'error');
        }
    },

    _escapeAttr(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    /**
     * Master book customers (always an array) plus any party names on pending invoices in dataCache
     * so the typeahead matches the table when `customers` is not loaded yet or is stored as an object map.
     */
    _getCustomersForTypeahead() {
        let book = typeof CustomerManager !== 'undefined' ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        if (!Array.isArray(book)) {
            book =
                typeof DataManager.coerceJsonArray === 'function'
                    ? DataManager.coerceJsonArray(book)
                    : Object.values(book || {}).filter((x) => x && typeof x === 'object');
        }
        const byKey = new Map();
        for (const c of book) {
            if (!c || typeof c !== 'object') continue;
            const n = (c.name || '').trim();
            if (!n) continue;
            const k = n.toLowerCase();
            if (!byKey.has(k)) {
                byKey.set(k, { name: c.name || n, phone: c.phone != null ? String(c.phone) : '' });
            }
        }
        for (const inv of this.dataCache || []) {
            const n = (inv && inv.customerName) ? String(inv.customerName).trim() : '';
            if (!n) continue;
            const k = n.toLowerCase();
            if (!byKey.has(k)) byKey.set(k, { name: n, phone: '' });
        }
        return Array.from(byKey.values());
    },

    /**
     * Append dropdown to `document.body` so `position: fixed` is viewport-anchored. Ancestors with
     * `backdrop-filter` (e.g. `.glass-panel`) create a containing block in Chromium/WebKit, which
     * made the list appear off-canvas or with zero effective area.
     */
    _getPayFollowCustomerDropdownEl() {
        let el = document.getElementById('payFollowCustomerDropdown');
        if (el) {
            if (el.parentNode !== document.body) {
                document.body.appendChild(el);
            }
            return el;
        }
        el = document.createElement('div');
        el.id = 'payFollowCustomerDropdown';
        el.setAttribute('role', 'listbox');
        el.className = 'list-group shadow-lg d-none pay-followup-cust-dd';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        return el;
    },

    _positionPayFollowCustomerDropdown() {
        const input = document.getElementById('payFollowCustomerFilter');
        const dd = this._getPayFollowCustomerDropdownEl();
        if (!input || !dd || dd.classList.contains('d-none')) return;
        const r = input.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const pad = 4;
        const maxH = Math.min(window.innerHeight * 0.5, 420);
        let left = Math.max(8, r.left);
        const width = r.width;
        if (left + width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - 8 - width);
        }
        const bottomSpace = window.innerHeight - r.bottom - pad;
        Object.assign(dd.style, {
            position: 'fixed',
            left: `${left}px`,
            top: `${r.bottom + pad}px`,
            width: `${width}px`,
            maxHeight: `${Math.min(maxH, bottomSpace)}px`,
            overflowY: 'auto',
            overflowX: 'hidden',
            zIndex: '2147483647',
            boxSizing: 'border-box',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: '0.375rem',
            backgroundColor: 'rgb(21, 27, 39)',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto',
            visibility: 'visible',
        });
    },

    /**
     * Party-style typeahead: CustomerManager (name + phone) like VouchersUI Party Name. No full re-render on each keystroke.
     * Suggestions are capped at 50; customers with an outstanding (cached) balance are listed first.
     */
    setupCustomerSearchDropdown() {
        const input = document.getElementById('payFollowCustomerFilter');
        const dropdown = this._getPayFollowCustomerDropdownEl();
        if (!input || !dropdown) return;

        let activeIdx = -1;

        const renderDropdown = (query) => {
            let customers = [];
            try {
                customers = this._getCustomersForTypeahead();
            } catch (e) {
                console.warn('[PaymentsUI] typeahead list:', e && e.message);
                customers = [];
            }
            const outNames = new Set(
                (this.dataCache || [])
                    .map((inv) => (inv.customerName || '').trim())
                    .filter(Boolean)
            );
            const lowerQuery = (query || '').toLowerCase().trim();
            let matches = customers;
            if (lowerQuery !== '') {
                matches = customers.filter(
                    (c) =>
                        (c.name && c.name.toLowerCase().includes(lowerQuery)) ||
                        (c.phone && String(c.phone).toLowerCase().includes(lowerQuery))
                );
            }
            matches = matches
                .slice()
                .sort((a, b) => {
                    const aOut = outNames.has((a.name || '').trim()) ? 0 : 1;
                    const bOut = outNames.has((b.name || '').trim()) ? 0 : 1;
                    if (aOut !== bOut) return aOut - bOut;
                    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
                })
                .slice(0, 50);

            if (matches.length === 0) {
                dropdown.innerHTML =
                    '<div class="list-group-item list-group-item-dark bg-dark text-muted border-secondary">No matching customers found</div>';
                dropdown.classList.remove('d-none');
                dropdown.setAttribute('aria-hidden', 'false');
                requestAnimationFrame(() => this._positionPayFollowCustomerDropdown());
                return;
            }

            dropdown.innerHTML = matches
                .map((c) => {
                    const enc = encodeURIComponent(c.name);
                    const phone = String(c.phone != null ? c.phone : '');
                    return `
                <button type="button" class="list-group-item list-group-item-action list-group-item-dark border-secondary d-flex justify-content-between align-items-center pay-followup-dd-item"
                    data-cust-enc="${enc}">
                    <span class="fw-bold text-info text-start text-break">${this._escapeAttr(c.name)}</span>
                    <small class="text-secondary text-end text-nowrap ms-2 flex-shrink-0">${this._escapeAttr(phone)}</small>
                </button>
            `;
                })
                .join('');
            dropdown.classList.remove('d-none');
            dropdown.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => this._positionPayFollowCustomerDropdown());
        };

        if (!dropdown._payFollowClickDelegate) {
            dropdown._payFollowClickDelegate = (e) => {
                const btn = e.target && e.target.closest && e.target.closest('button[data-cust-enc]');
                if (!btn) return;
                e.preventDefault();
                const name = decodeURIComponent(btn.getAttribute('data-cust-enc') || '');
                if (name) this.selectCustomerFilter(name);
            };
            dropdown.addEventListener('click', dropdown._payFollowClickDelegate);
        }

        let tableDebounce = null;
        if (!input._payFollowInputWired) {
            input._payFollowInputWired = true;
            input.addEventListener('input', (e) => {
                this.currentFilters.customer = e.target.value;
                activeIdx = -1;
                renderDropdown(e.target.value);
                if (tableDebounce) clearTimeout(tableDebounce);
                tableDebounce = setTimeout(() => this.renderPayFollowResultsOnly(), 280);
            });
            input.addEventListener('focus', () => {
                setTimeout(() => renderDropdown(input.value), 0);
            });
        }

        if (!input._payFollowKeydownWired) {
            input._payFollowKeydownWired = true;
            input.addEventListener('keydown', (e) => {
                const items = dropdown.querySelectorAll('.pay-followup-dd-item');
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (items.length) {
                        activeIdx = Math.min(activeIdx + 1, items.length - 1);
                        this.updateActiveItem(items, activeIdx);
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (items.length) {
                        activeIdx = Math.max(activeIdx - 1, 0);
                        this.updateActiveItem(items, activeIdx);
                    }
                } else if (e.key === 'Enter') {
                    if (activeIdx >= 0 && items[activeIdx]) {
                        e.preventDefault();
                        items[activeIdx].click();
                    }
                } else if (e.key === 'Escape') {
                    dropdown.classList.add('d-none');
                    dropdown.setAttribute('aria-hidden', 'true');
                }
            });
        }

        if (this._payFollowDocClick) {
            document.removeEventListener('click', this._payFollowDocClick, true);
        }
        this._payFollowDocClick = (e) => {
            if (input.contains(e.target) || dropdown.contains(e.target)) return;
            dropdown.classList.add('d-none');
            dropdown.setAttribute('aria-hidden', 'true');
        };
        document.addEventListener('click', this._payFollowDocClick, true);

        if (!this._payFollowLayoutWired) {
            this._payFollowLayoutWired = true;
            this._onPayFollowDdLayout = () => this._positionPayFollowCustomerDropdown();
            window.addEventListener('scroll', this._onPayFollowDdLayout, true);
            window.addEventListener('resize', this._onPayFollowDdLayout);
        }
    },

    updateActiveItem(items, idx) {
        items.forEach((item, i) => {
            if (i === idx) {
                item.classList.add('active', 'bg-primary');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active', 'bg-primary');
            }
        });
    },

    selectCustomerFilter(name) {
        this.currentFilters.customer = name;
        const input = document.getElementById('payFollowCustomerFilter');
        if (input) input.value = name;
        const dropdown = document.getElementById('payFollowCustomerDropdown');
        if (dropdown) {
            dropdown.classList.add('d-none');
            dropdown.setAttribute('aria-hidden', 'true');
        }
        this.renderPayFollowResultsOnly();
    }
};

window.PaymentsUI = PaymentsUI;
