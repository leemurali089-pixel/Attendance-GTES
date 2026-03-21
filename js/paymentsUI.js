/**
 * Payment Follow-up UI Module
 * Handles dashboard for pending invoices and customer-wise tracking.
 */

const PaymentsUI = {
    currentFilters: {
        type: 'all', // 'all', 'gst', 'plain'
        customer: '',
        financialYear: ''
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

                <!-- Filters & Toggles -->
                <div class="card glass-panel border-secondary mb-4">
                    <div class="card-body">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-4 position-relative">
                                <label class="text-white-50 small mb-1">Filter by Customer</label>
                                <input type="text" id="payFollowCustomerFilter" class="form-control bg-dark border-secondary text-white" 
                                    placeholder="Search customer..." value="${this.currentFilters.customer}"
                                    oninput="PaymentsUI.updateFiltersDebounced()" autocomplete="off">
                                <div id="payFollowCustomerDropdown" class="list-group position-absolute w-100 shadow-lg d-none" 
                                    style="z-index: 1050; max-height: 250px; overflow-y: auto; top: 105%;"></div>
                            </div>
                            <div class="col-md-2">
                                <label class="text-white-50 small mb-1">Financial Year</label>
                                <select id="payFollowYearFilter" class="form-select bg-dark border-secondary text-white" 
                                    onchange="PaymentsUI.updateFilters()">
                                    <option value="">All Years</option>
                                    ${this.getYearOptions()}
                                </select>
                            </div>
                            <div class="col-md-6 text-end">
                                <div class="btn-group" role="group">
                                    <button type="button" class="btn ${this.currentFilters.type === 'all' ? 'btn-info' : 'btn-outline-info'}" 
                                        onclick="PaymentsUI.setTypeFilter('all')">All Invoices</button>
                                    <button type="button" class="btn ${this.currentFilters.type === 'gst' ? 'btn-info' : 'btn-outline-info'}" 
                                        onclick="PaymentsUI.setTypeFilter('gst')">GST Invoice</button>
                                    <button type="button" class="btn ${this.currentFilters.type === 'plain' ? 'btn-info' : 'btn-outline-info'}" 
                                        onclick="PaymentsUI.setTypeFilter('plain')">Plain Invoice</button>
                                </div>
                                <button class="btn btn-outline-secondary btn-sm ms-2" onclick="PaymentsUI.refreshData()" title="Refresh Data">
                                    <i class="bi bi-arrow-clockwise"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Summary Cards -->
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

                <!-- Customer List Table -->
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
                                                onchange="PaymentsUI.toggleCustomerSelection('${c.groupKey}')">
                                        </td>
                                        <td class="ps-4 fw-bold">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar-sm bg-primary bg-opacity-10 text-primary me-3 rounded-circle d-flex align-items-center justify-content-center fw-bold" style="width: 32px; height: 32px; font-size: 0.8rem;">
                                                    ${c.customerName.charAt(0).toUpperCase()}
                                                </div>
                                                ${c.customerName}
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
            </div>
        `;
        
        this.setupCustomerSearchDropdown();
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

    // Debounce filter input for performance
    filterTimeout: null,
    updateFiltersDebounced() {
        if (this.filterTimeout) clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => this.updateFilters(), 300);
    },

    updateFilters() {
        const cust = document.getElementById('payFollowCustomerFilter')?.value || '';
        const year = document.getElementById('payFollowYearFilter')?.value || '';
        this.currentFilters.customer = cust;
        this.currentFilters.financialYear = year;
        this.renderPaymentFollowup();
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

        // Customer Search - Filter the whole group if a match is found
        if (this.currentFilters.customer) {
            const search = this.currentFilters.customer.toLowerCase();
            // We apply this filter AFTER grouping or by ensuring we keep all bills for matching names
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

    /**
     * Custom live-search dropdown for customer filter
     * Similar logic to VouchersUI and Bank Import
     */
    setupCustomerSearchDropdown() {
        const input = document.getElementById('payFollowCustomerFilter');
        const dropdown = document.getElementById('payFollowCustomerDropdown');
        if (!input || !dropdown) return;

        let activeIdx = -1;
        const allInvoices = this.dataCache || [];
        const uniqueCustomers = [...new Set(allInvoices.map(inv => inv.customerName).filter(Boolean))].sort();

        const renderDropdown = (query) => {
            const q = query.toLowerCase().trim();
            if (!q) {
                dropdown.classList.add('d-none');
                return;
            }

            const matches = uniqueCustomers.filter(name => name.toLowerCase().includes(q)).slice(0, 20);
            if (matches.length === 0) {
                dropdown.classList.add('d-none');
                return;
            }

            dropdown.innerHTML = matches.map((name, i) => `
                <button type="button" class="list-group-item list-group-item-action bg-dark text-white border-secondary small py-2 d-flex justify-content-between align-items-center" 
                    onclick="PaymentsUI.selectCustomerFilter('${name.replace(/'/g, "\\'")}')" data-idx="${i}">
                    <span>${name}</span>
                    <i class="bi bi-chevron-right small text-muted"></i>
                </button>
            `).join('');
            dropdown.classList.remove('d-none');
        };

        input.addEventListener('input', (e) => {
            renderDropdown(e.target.value);
            activeIdx = -1;
        });

        input.addEventListener('focus', () => renderDropdown(input.value));

        // Keyboard navigation
        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.list-group-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
                this.updateActiveItem(items, activeIdx);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
                this.updateActiveItem(items, activeIdx);
            } else if (e.key === 'Enter') {
                if (activeIdx >= 0) {
                    e.preventDefault();
                    items[activeIdx].click();
                }
            } else if (e.key === 'Escape') {
                dropdown.classList.add('d-none');
            }
        });

        // Hide on click outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('d-none');
            }
        });
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
        if (dropdown) dropdown.classList.add('d-none');
        this.renderPaymentFollowup();
    }
};

window.PaymentsUI = PaymentsUI;
