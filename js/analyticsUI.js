/**
 * Business Analytics UI Controller
 * Renders the dashboard and analytics views
 */

const AnalyticsUI = {

    currentSection: 'dashboard',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth(),

    init() {
        console.log('AnalyticsUI initialized');
    },

    /**
     * Set active tab styling
     */
    setActiveTab() {
        const tabs = document.querySelectorAll('#analyticsTabs .nav-link');
        tabs.forEach(tab => {
            const onClick = tab.getAttribute('onclick') || '';
            if (onClick.includes(`'${this.currentSection}'`)) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    },

    /**
     * Render the main analytics dashboard
     */
    renderDashboard() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const data = BusinessAnalytics.getDashboardData();

        container.innerHTML = `
            <div class="row g-4 mb-4">
                <!-- Revenue Card -->
                <div class="col-md-3">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <p class="text-muted small mb-1">This Month Revenue</p>
                                    <h3 class="mb-0 text-success">₹${this.formatCurrency(data.revenue.currentMonth)}</h3>
                                </div>
                                <div class="bg-success bg-opacity-25 rounded-circle p-3">
                                    <i class="bi bi-graph-up-arrow text-success fs-4"></i>
                                </div>
                            </div>
                            <div class="mt-3">
                                <span class="badge bg-${data.revenue.trend === 'up' ? 'success' : 'danger'} me-2">
                                    <i class="bi bi-arrow-${data.revenue.trend}"></i> ${Math.abs(data.revenue.changePercent)}%
                                </span>
                                <small class="text-muted">vs last month</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Expenses Card -->
                <div class="col-md-3">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <p class="text-muted small mb-1">This Month Expenses</p>
                                    <h3 class="mb-0 text-danger">₹${this.formatCurrency(data.expenses.currentMonth)}</h3>
                                </div>
                                <div class="bg-danger bg-opacity-25 rounded-circle p-3">
                                    <i class="bi bi-wallet2 text-danger fs-4"></i>
                                </div>
                            </div>
                            <div class="mt-3">
                                <small class="text-muted">${data.expenses.count} transactions</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Pending Payments Card -->
                <div class="col-md-3">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <p class="text-muted small mb-1">Pending Payments</p>
                                    <h3 class="mb-0 text-warning">₹${this.formatCurrency(data.revenue.pendingAmount)}</h3>
                                </div>
                                <div class="bg-warning bg-opacity-25 rounded-circle p-3">
                                    <i class="bi bi-clock-history text-warning fs-4"></i>
                                </div>
                            </div>
                            <div class="mt-3">
                                <small class="text-muted">${data.revenue.pendingCount} invoices pending</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Inventory Value Card -->
                <div class="col-md-3">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <p class="text-muted small mb-1">Inventory Value</p>
                                    <h3 class="mb-0 text-info">₹${this.formatCurrency(data.inventory.totalValue)}</h3>
                                </div>
                                <div class="bg-info bg-opacity-25 rounded-circle p-3">
                                    <i class="bi bi-box-seam text-info fs-4"></i>
                                </div>
                            </div>
                            <div class="mt-3">
                                ${data.inventory.lowStockCount > 0
                ? `<span class="badge bg-warning">${data.inventory.lowStockCount} low stock</span>`
                : '<span class="badge bg-success">Stock OK</span>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-4 mb-4">
                <!-- Cash Flow Chart -->
                <div class="col-md-8">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-bar-chart me-2"></i>Monthly Cash Flow - ${this.selectedYear}</h6>
                        </div>
                        <div class="card-body">
                            <div id="cashFlowChart" style="height: 300px;">
                                ${this.renderCashFlowChart(data.cashFlow)}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Alerts -->
                <div class="col-md-4">
                    <div class="card glass-panel border-0 h-100">
                        <div class="card-header bg-transparent border-secondary d-flex justify-content-between align-items-center">
                            <h6 class="mb-0"><i class="bi bi-bell me-2"></i>Alerts</h6>
                            <span class="badge bg-danger">${data.alerts.length}</span>
                        </div>
                        <div class="card-body p-0" style="max-height: 300px; overflow-y: auto;">
                            ${data.alerts.length > 0 ? data.alerts.map(alert => `
                                <div class="alert alert-${alert.type} mb-0 rounded-0 border-start border-4 py-2 px-3">
                                    <div class="d-flex align-items-start">
                                        <i class="bi ${alert.icon} me-2 mt-1"></i>
                                        <div class="flex-grow-1">
                                            <strong class="small">${alert.title}</strong>
                                            <p class="mb-0 small text-dark">${alert.message}</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div class="p-3 text-center text-muted"><i class="bi bi-check-circle fs-1"></i><p>No alerts</p></div>'}
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-4 mb-4">
                <!-- Top Customers -->
                <div class="col-md-6">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-people me-2"></i>Top Customers</h6>
                        </div>
                        <div class="card-body p-0">
                            <table class="table table-dark table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th class="text-end">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.customers.topCustomers.map((c, i) => `
                                        <tr>
                                            <td>
                                                <span class="badge bg-${['primary', 'success', 'info', 'warning', 'secondary'][i]} me-2">${i + 1}</span>
                                                ${c.name}
                                            </td>
                                            <td class="text-end fw-bold">₹${this.formatCurrency(c.revenue)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Expense by Category -->
                <div class="col-md-6">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-pie-chart me-2"></i>Expenses by Category</h6>
                        </div>
                        <div class="card-body">
                            ${this.renderExpensesByCategory(data.expenses.byCategory)}
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <!-- Recent Activity -->
                <div class="col-12">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-activity me-2"></i>Recent Activity</h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="list-group list-group-flush">
                                ${data.recentActivity.map(activity => `
                                    <div class="list-group-item bg-transparent border-secondary d-flex align-items-center">
                                        <div class="bg-${activity.color} bg-opacity-25 rounded-circle p-2 me-3">
                                            <i class="bi ${activity.icon} text-${activity.color}"></i>
                                        </div>
                                        <div class="flex-grow-1">
                                            <strong>${activity.title}</strong>
                                            <p class="mb-0 text-muted small">${activity.description}</p>
                                        </div>
                                        <div class="text-muted small">
                                            ${this.formatDate(activity.date)}
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Cash Flow Chart (simple bar representation)
     */
    renderCashFlowChart(data) {
        const maxValue = Math.max(...data.map(d => Math.max(d.revenue, d.expense)));
        if (maxValue === 0) {
            return '<div class="text-center text-muted py-5">No data available</div>';
        }

        return `
            <div class="d-flex justify-content-between align-items-end" style="height: 250px;">
                ${data.map(d => {
            const revenueHeight = maxValue > 0 ? (d.revenue / maxValue * 200) : 0;
            const expenseHeight = maxValue > 0 ? (d.expense / maxValue * 200) : 0;
            return `
                        <div class="text-center" style="flex: 1; max-width: 60px;">
                            <div class="d-flex justify-content-center gap-1 align-items-end" style="height: 200px;">
                                <div class="bg-success rounded-top" style="width: 15px; height: ${revenueHeight}px;" 
                                    title="Revenue: ₹${this.formatCurrency(d.revenue)}"></div>
                                <div class="bg-danger rounded-top" style="width: 15px; height: ${expenseHeight}px;"
                                    title="Expense: ₹${this.formatCurrency(d.expense)}"></div>
                            </div>
                            <small class="text-muted">${d.month}</small>
                        </div>
                    `;
        }).join('')}
            </div>
            <div class="d-flex justify-content-center gap-4 mt-3">
                <span><span class="badge bg-success">&nbsp;</span> Revenue</span>
                <span><span class="badge bg-danger">&nbsp;</span> Expenses</span>
            </div>
        `;
    },

    /**
     * Render Expenses by Category
     */
    renderExpensesByCategory(byCategory) {
        const entries = Object.entries(byCategory);
        if (entries.length === 0) {
            return '<div class="text-center text-muted py-3">No expenses this month</div>';
        }

        const total = entries.reduce((sum, [_, value]) => sum + value, 0);
        const colors = ['primary', 'success', 'info', 'warning', 'danger', 'secondary'];

        return entries.map(([category, amount], i) => {
            const percent = total > 0 ? (amount / total * 100) : 0;
            return `
                <div class="mb-3">
                    <div class="d-flex justify-content-between mb-1">
                        <span class="small">${category}</span>
                        <span class="small fw-bold">₹${this.formatCurrency(amount)} (${percent.toFixed(0)}%)</span>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar bg-${colors[i % colors.length]}" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render GST Reports section
     */
    renderGSTReports() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="card glass-panel border-0 mb-4">
                <div class="card-header bg-transparent border-secondary d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="bi bi-file-earmark-bar-graph me-2 text-primary"></i>GST Reports</h5>
                    <div class="d-flex gap-2">
                        <select class="form-select form-select-sm bg-dark text-white border-secondary" id="gstMonth" style="width: auto;">
                            ${this.getMonthOptions()}
                        </select>
                        <select class="form-select form-select-sm bg-dark text-white border-secondary" id="gstYear" style="width: auto;">
                            ${this.getYearOptions()}
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="AnalyticsUI.loadGSTReport()">
                            <i class="bi bi-arrow-clockwise"></i> Generate
                        </button>
                    </div>
                </div>
                <div class="card-body" id="gstReportContent">
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-file-earmark-bar-graph fs-1"></i>
                        <p class="mt-2">Select month and year, then click Generate</p>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Load and display GST Report
     */
    loadGSTReport() {
        const month = parseInt(document.getElementById('gstMonth').value);
        const year = parseInt(document.getElementById('gstYear').value);

        const gstr1 = BusinessAnalytics.generateGSTR1(year, month);
        const gstr3b = BusinessAnalytics.generateGSTR3B(year, month);

        const content = document.getElementById('gstReportContent');
        content.innerHTML = `
            <div class="row g-4">
                <!-- GSTR-1 Summary -->
                <div class="col-md-6">
                    <div class="card bg-dark border-secondary">
                        <div class="card-header bg-primary text-white d-flex justify-content-between">
                            <span><i class="bi bi-file-text me-2"></i>GSTR-1 (Outward Supplies)</span>
                            <button class="btn btn-sm btn-light" onclick="BusinessAnalytics.exportGSTR1ToCSV(${year}, ${month})">
                                <i class="bi bi-download"></i> Export
                            </button>
                        </div>
                        <div class="card-body">
                            <table class="table table-dark table-sm mb-0">
                                <tr>
                                    <td>B2B Invoices</td>
                                    <td class="text-end">${gstr1.b2b.length}</td>
                                </tr>
                                <tr>
                                    <td>B2C Large</td>
                                    <td class="text-end">${gstr1.b2cl.length}</td>
                                </tr>
                                <tr>
                                    <td>B2C Small</td>
                                    <td class="text-end">${gstr1.b2cs.length} rate groups</td>
                                </tr>
                                <tr class="table-primary">
                                    <td><strong>Total Taxable Value</strong></td>
                                    <td class="text-end"><strong>₹${this.formatCurrency(gstr1.totals.totalTaxableValue)}</strong></td>
                                </tr>
                                <tr>
                                    <td>CGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr1.totals.totalCGST)}</td>
                                </tr>
                                <tr>
                                    <td>SGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr1.totals.totalSGST)}</td>
                                </tr>
                                <tr>
                                    <td>IGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr1.totals.totalIGST)}</td>
                                </tr>
                                <tr class="table-success">
                                    <td><strong>Total Tax</strong></td>
                                    <td class="text-end"><strong>₹${this.formatCurrency(gstr1.totals.totalTax)}</strong></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- GSTR-3B Summary -->
                <div class="col-md-6">
                    <div class="card bg-dark border-secondary">
                        <div class="card-header bg-success text-white">
                            <i class="bi bi-calculator me-2"></i>GSTR-3B Summary
                        </div>
                        <div class="card-body">
                            <h6 class="text-info mb-3">Output Tax (Sales)</h6>
                            <table class="table table-dark table-sm">
                                <tr>
                                    <td>CGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.outwardSupplies.centralTax)}</td>
                                </tr>
                                <tr>
                                    <td>SGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.outwardSupplies.stateTax)}</td>
                                </tr>
                                <tr>
                                    <td>IGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.outwardSupplies.integratedTax)}</td>
                                </tr>
                            </table>
                            
                            <h6 class="text-warning mb-3">Input Tax Credit</h6>
                            <table class="table table-dark table-sm">
                                <tr>
                                    <td>CGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.inputTaxCredit.cgst)}</td>
                                </tr>
                                <tr>
                                    <td>SGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.inputTaxCredit.sgst)}</td>
                                </tr>
                                <tr>
                                    <td>IGST</td>
                                    <td class="text-end">₹${this.formatCurrency(gstr3b.inputTaxCredit.igst)}</td>
                                </tr>
                            </table>
                            
                            <h6 class="text-danger mb-3">Net Tax Payable</h6>
                            <table class="table table-dark table-sm mb-0">
                                <tr class="table-danger">
                                    <td><strong>Total Payable</strong></td>
                                    <td class="text-end"><strong>₹${this.formatCurrency(gstr3b.netTaxPayable.total)}</strong></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- B2B Details -->
            ${gstr1.b2b.length > 0 ? `
                <div class="card bg-dark border-secondary mt-4">
                    <div class="card-header bg-transparent border-secondary">
                        <h6 class="mb-0">B2B Invoice Details</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-dark table-striped table-hover mb-0">
                                <thead>
                                    <tr>
                                        <th>Invoice #</th>
                                        <th>Date</th>
                                        <th>Customer</th>
                                        <th>GSTIN</th>
                                        <th class="text-end">Taxable</th>
                                        <th class="text-end">Tax</th>
                                        <th class="text-end">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${gstr1.b2b.map(inv => `
                                        <tr>
                                            <td>${inv.invoiceNumber}</td>
                                            <td>${this.formatDate(inv.invoiceDate)}</td>
                                            <td>${inv.customerName}</td>
                                            <td><code>${inv.gstin}</code></td>
                                            <td class="text-end">₹${this.formatCurrency(inv.taxableValue)}</td>
                                            <td class="text-end">₹${this.formatCurrency(inv.cgst + inv.sgst + inv.igst)}</td>
                                            <td class="text-end fw-bold">₹${this.formatCurrency(inv.total)}</td>
                                            <td class="text-center">
                                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice('${inv.id}')" title="View">
                                                    <i class="bi bi-eye"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    },

    /**
     * Render Customer Ledger section
     */
    renderCustomerLedger() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const outstanding = BusinessAnalytics.getOutstandingBalances();
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        container.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-md-4">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-people me-2"></i>Select Customer</h6>
                        </div>
                        <div class="card-body">
                            <select class="form-select bg-dark text-white border-secondary mb-3" id="ledgerCustomer" onchange="AnalyticsUI.loadCustomerLedger()">
                                <option value="">-- Select Customer --</option>
                                ${customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                            </select>
                            <button class="btn btn-primary w-100" onclick="AnalyticsUI.loadCustomerLedger()">
                                <i class="bi bi-search"></i> View Ledger
                            </button>
                        </div>
                    </div>

                    <div class="card glass-panel border-0 mt-4">
                        <div class="card-header bg-transparent border-secondary d-flex justify-content-between">
                            <h6 class="mb-0"><i class="bi bi-exclamation-triangle text-warning me-2"></i>Outstanding Balances</h6>
                            <span class="badge bg-danger">${outstanding.length}</span>
                        </div>
                        <div class="card-body p-0" style="max-height: 400px; overflow-y: auto;">
                            ${outstanding.map(c => `
                                <div class="d-flex justify-content-between align-items-center p-2 border-bottom border-secondary hover-lift" 
                                    style="cursor: pointer;" onclick="document.getElementById('ledgerCustomer').value='${c.customerId}'; AnalyticsUI.loadCustomerLedger();">
                                    <div>
                                        <strong>${c.customerName}</strong>
                                        <small class="d-block text-muted">${c.phone || 'No phone'}</small>
                                    </div>
                                    <span class="badge bg-${c.outstandingBalance > 0 ? 'danger' : 'success'}">
                                        ₹${this.formatCurrency(Math.abs(c.outstandingBalance))}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="col-md-8">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-journal-text me-2"></i>Customer Ledger</h6>
                        </div>
                        <div class="card-body" id="ledgerContent">
                            <div class="text-center text-muted py-5">
                                <i class="bi bi-journal-text fs-1"></i>
                                <p class="mt-2">Select a customer to view their ledger</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Load customer ledger
     */
    loadCustomerLedger() {
        const customerId = document.getElementById('ledgerCustomer').value;
        if (!customerId) return;

        const ledger = BusinessAnalytics.getCustomerLedger(customerId);
        if (!ledger) return;

        const content = document.getElementById('ledgerContent');
        content.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-4">
                <div>
                    <h5 class="mb-1">${ledger.customer.name}</h5>
                    <p class="text-muted mb-0">
                        ${ledger.customer.phone ? `<i class="bi bi-phone me-1"></i>${ledger.customer.phone}` : ''}
                        ${ledger.customer.gstin ? `<br><i class="bi bi-building me-1"></i>GSTIN: ${ledger.customer.gstin}` : ''}
                    </p>
                </div>
                <div class="text-end">
                    <p class="mb-1 small text-muted">Outstanding Balance</p>
                    <h4 class="mb-0 ${ledger.summary.balance > 0 ? 'text-danger' : 'text-success'}">
                        ₹${this.formatCurrency(Math.abs(ledger.summary.balance))}
                        <small class="text-muted">${ledger.summary.balance > 0 ? 'Due' : 'Credit'}</small>
                    </h4>
                </div>
            </div>

            <div class="btn-group mb-3">
                <button class="btn btn-sm btn-outline-primary" onclick="BusinessAnalytics.exportLedgerToCSV('${customerId}')">
                    <i class="bi bi-download"></i> Export CSV
                </button>
                <button class="btn btn-sm btn-outline-success" onclick="AnalyticsUI.sendStatementViaWhatsApp('${customerId}')">
                    <i class="bi bi-whatsapp"></i> Send Statement
                </button>
            </div>

            <div class="table-responsive">
                <table class="table table-dark table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Reference</th>
                            <th>Description</th>
                            <th class="text-end">Debit</th>
                            <th class="text-end">Credit</th>
                            <th class="text-end">Balance</th>
                            <th class="text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ledger.entries.map(e => {
            let viewAction = '';
            if (e.type === 'Invoice') viewAction = `InvoicesUI.previewInvoice('${e.reference}')`;
            else if (e.type === 'Payment') viewAction = `VouchersUI.previewVoucher('${e.reference}')`;
            else if (e.type.includes('Challan')) viewAction = `DeliveryUI.viewChallan('${e.reference}')`;

            return `
                            <tr>
                                <td>${this.formatDate(e.date)}</td>
                                <td><span class="badge bg-${e.type === 'Payment' ? 'success' : 'info'} text-nowrap">${e.type}</span></td>
                                <td>${e.reference}</td>
                                <td>${e.description}</td>
                                <td class="text-end ${e.debit > 0 ? 'text-danger' : ''}">
                                    ${e.debit > 0 ? '₹' + this.formatCurrency(e.debit) : '-'}
                                </td>
                                <td class="text-end ${e.credit > 0 ? 'text-success' : ''}">
                                    ${e.credit > 0 ? '₹' + this.formatCurrency(e.credit) : '-'}
                                </td>
                                <td class="text-end fw-bold ${e.balance > 0 ? 'text-danger' : 'text-success'}">
                                    ₹${this.formatCurrency(Math.abs(e.balance))}
                                </td>
                                <td class="text-center">
                                    ${viewAction ? `
                                        <button class="btn btn-sm btn-outline-info" onclick="${viewAction}" title="View">
                                            <i class="bi bi-eye"></i>
                                        </button>
                                    ` : '-'}
                                </td>
                            </tr>
                            `;
        }).join('')}
                    </tbody>
                    <tfoot class="table-secondary">
                        <tr>
                            <td colspan="4"><strong>Totals</strong></td>
                            <td class="text-end text-danger"><strong>₹${this.formatCurrency(ledger.summary.totalDebit)}</strong></td>
                            <td class="text-end text-success"><strong>₹${this.formatCurrency(ledger.summary.totalCredit)}</strong></td>
                            <td class="text-end fw-bold"><strong>₹${this.formatCurrency(Math.abs(ledger.summary.balance))}</strong></td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    },

    /**
     * Render Stock Reports section
     */
    renderStockReports() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const stockReport = BusinessAnalytics.getStockReport();
        const lowStock = BusinessAnalytics.getLowStockAlerts();
        const fastMoving = BusinessAnalytics.getFastMovingItems();
        const totalValue = BusinessAnalytics.getTotalInventoryValue();

        container.innerHTML = `
            <div class="row g-4 mb-4">
                <!-- Summary Cards -->
                <div class="col-md-3">
                    <div class="card glass-panel border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-box-seam fs-1 text-info mb-2"></i>
                            <h3 class="mb-0">${stockReport.length}</h3>
                            <small class="text-muted">Total Items</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-currency-rupee fs-1 text-success mb-2"></i>
                            <h3 class="mb-0">₹${this.formatCurrency(totalValue)}</h3>
                            <small class="text-muted">Total Value</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-exclamation-triangle fs-1 text-warning mb-2"></i>
                            <h3 class="mb-0">${lowStock.length}</h3>
                            <small class="text-muted">Low Stock Items</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-x-circle fs-1 text-danger mb-2"></i>
                            <h3 class="mb-0">${stockReport.filter(i => i.currentStock === 0).length}</h3>
                            <small class="text-muted">Out of Stock</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <!-- Low Stock Alerts -->
                <div class="col-md-4">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-warning text-dark">
                            <h6 class="mb-0"><i class="bi bi-exclamation-triangle me-2"></i>Low Stock Alerts</h6>
                        </div>
                        <div class="card-body p-0" style="max-height: 300px; overflow-y: auto;">
                            ${lowStock.length > 0 ? lowStock.map(item => `
                                <div class="d-flex justify-content-between align-items-center p-2 border-bottom border-secondary">
                                    <div>
                                        <strong>${item.name}</strong>
                                        <small class="d-block text-muted">${item.currentStock} / ${item.minStock} ${item.unit}</small>
                                    </div>
                                    <span class="badge bg-${item.urgency === 'critical' ? 'danger' : 'warning'}">
                                        ${item.urgency === 'critical' ? 'OUT' : 'LOW'}
                                    </span>
                                </div>
                            `).join('') : '<div class="p-3 text-center text-muted">No low stock items</div>'}
                        </div>
                    </div>
                </div>

                <!-- Fast Moving Items -->
                <div class="col-md-4">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-success text-white">
                            <h6 class="mb-0"><i class="bi bi-lightning me-2"></i>Fast Moving (Last 30 Days)</h6>
                        </div>
                        <div class="card-body p-0">
                            ${fastMoving.length > 0 ? fastMoving.map((item, i) => `
                                <div class="d-flex justify-content-between align-items-center p-2 border-bottom border-secondary">
                                    <div>
                                        <span class="badge bg-primary me-2">${i + 1}</span>
                                        <strong>${item.name}</strong>
                                    </div>
                                    <span class="text-success">${item.quantity} used</span>
                                </div>
                            `).join('') : '<div class="p-3 text-center text-muted">No usage data</div>'}
                        </div>
                    </div>
                </div>

                <!-- Stock Value Distribution -->
                <div class="col-md-4">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-info text-white">
                            <h6 class="mb-0"><i class="bi bi-pie-chart me-2"></i>Top Items by Value</h6>
                        </div>
                        <div class="card-body p-0">
                            ${stockReport.sort((a, b) => b.stockValue - a.stockValue).slice(0, 5).map((item, i) => `
                                <div class="d-flex justify-content-between align-items-center p-2 border-bottom border-secondary">
                                    <div>
                                        <span class="badge bg-${['primary', 'success', 'info', 'warning', 'secondary'][i]} me-2">${i + 1}</span>
                                        <strong>${item.name}</strong>
                                    </div>
                                    <span>₹${this.formatCurrency(item.stockValue)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Full Stock Table -->
            <div class="card glass-panel border-0 mt-4">
                <div class="card-header bg-transparent border-secondary">
                    <h6 class="mb-0"><i class="bi bi-table me-2"></i>Complete Stock Report</h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-dark table-striped table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    <th class="text-center">Current Stock</th>
                                    <th class="text-center">Min Stock</th>
                                    <th class="text-end">Rate</th>
                                    <th class="text-end">Value</th>
                                    <th class="text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stockReport.map(item => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td class="text-center">${item.currentStock} ${item.unit}</td>
                                        <td class="text-center">${item.minStock} ${item.unit}</td>
                                        <td class="text-end">₹${this.formatCurrency(item.rate)}</td>
                                        <td class="text-end">₹${this.formatCurrency(item.stockValue)}</td>
                                        <td class="text-center">
                                            ${item.currentStock === 0
                ? '<span class="badge bg-danger">OUT</span>'
                : item.isLowStock
                    ? '<span class="badge bg-warning">LOW</span>'
                    : '<span class="badge bg-success">OK</span>'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Render Due Date Reminders section
     */
    renderDueReminders() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const reminders = BusinessAnalytics.getDueReminders();

        container.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-md-3">
                    <div class="card glass-panel border-danger border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-exclamation-octagon fs-1 text-danger mb-2"></i>
                            <h3 class="mb-0 text-danger">${reminders.overdue.length}</h3>
                            <small class="text-muted">Overdue</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-warning border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-clock fs-1 text-warning mb-2"></i>
                            <h3 class="mb-0 text-warning">${reminders.dueToday.length}</h3>
                            <small class="text-muted">Due Today</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-info border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-calendar-week fs-1 text-info mb-2"></i>
                            <h3 class="mb-0 text-info">${reminders.dueSoon.length}</h3>
                            <small class="text-muted">Due This Week</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card glass-panel border-success border-0 text-center">
                        <div class="card-body">
                            <i class="bi bi-calendar-month fs-1 text-success mb-2"></i>
                            <h3 class="mb-0 text-success">${reminders.upcoming.length}</h3>
                            <small class="text-muted">Upcoming</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Overdue Invoices -->
            ${this.renderReminderSection('Overdue Invoices', reminders.overdue, 'danger', true)}
            
            <!-- Due Today -->
            ${this.renderReminderSection('Due Today', reminders.dueToday, 'warning', false)}
            
            <!-- Due This Week -->
            ${this.renderReminderSection('Due This Week', reminders.dueSoon, 'info', false)}
            
            <!-- Upcoming -->
            ${this.renderReminderSection('Upcoming (8-30 days)', reminders.upcoming, 'success', false)}
        `;
    },

    renderReminderSection(title, items, color, showOverdue) {
        if (items.length === 0) return '';

        return `
            <div class="card glass-panel border-0 mb-4">
                <div class="card-header bg-${color} ${color === 'warning' ? 'text-dark' : 'text-white'}">
                    <h6 class="mb-0"><i class="bi bi-bell me-2"></i>${title}</h6>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-dark table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Customer</th>
                                    <th>Invoice Date</th>
                                    <th>Due Date</th>
                                    <th class="text-end">Amount</th>
                                    <th class="text-center">${showOverdue ? 'Days Overdue' : 'Days Until Due'}</th>
                                    <th class="text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map(item => `
                                    <tr>
                                        <td>${item.invoiceId}</td>
                                        <td>${item.customerName}</td>
                                        <td>${this.formatDate(item.invoiceDate)}</td>
                                        <td>${this.formatDate(item.dueDate)}</td>
                                        <td class="text-end fw-bold">₹${this.formatCurrency(item.amount)}</td>
                                        <td class="text-center">
                                            <span class="badge bg-${color}">${showOverdue ? item.daysOverdue : item.daysUntilDue} days</span>
                                        </td>
                                        <td class="text-center">
                                            <button class="btn btn-sm btn-success" onclick="BusinessAnalytics.sendPaymentReminder('${item.invoiceId}')" title="Send WhatsApp Reminder">
                                                <i class="bi bi-whatsapp"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    // Helper functions
    formatCurrency(value) {
        return parseFloat(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    getMonthOptions() {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months.map((m, i) => `<option value="${i}" ${i === this.selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
    },

    getYearOptions() {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear; y >= currentYear - 5; y--) {
            const fyLabel = `${y}-${(y + 1).toString().slice(-2)}`;
            years.push(`<option value="${y}" ${y === this.selectedYear ? 'selected' : ''}>FY ${fyLabel}</option>`);
        }
        return years.join('');
    },

    sendStatementViaWhatsApp(customerId) {
        const ledger = BusinessAnalytics.getCustomerLedger(customerId);
        if (!ledger) return;

        const settings = DataManager.getData('settings') || {};
        const companyName = settings.companyName || 'Our Company';

        let message = `*Account Statement*\n*${companyName}*\n\n`;
        message += `Customer: ${ledger.customer.name}\n`;
        message += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `Outstanding Balance: ₹${this.formatCurrency(Math.abs(ledger.summary.balance))} ${ledger.summary.balance > 0 ? '(Due)' : '(Credit)'}\n\n`;
        message += `Total Invoices: ₹${this.formatCurrency(ledger.summary.totalDebit)}\n`;
        message += `Total Payments: ₹${this.formatCurrency(ledger.summary.totalCredit)}\n\n`;

        if (settings.upiId) {
            message += `Pay via UPI: ${settings.upiId}\n`;
        }

        const phone = ledger.customer.phone?.replace(/\D/g, '') || '';
        const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    },

    /**
     * Render BookKeeper Import section
     */
    renderDataImport() {
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        container.innerHTML = `
            <div class="row g-4">
                <div class="col-md-6">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h5 class="mb-0">
                                <i class="bi bi-cloud-upload text-primary me-2"></i>Import from BookKeeper
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="alert alert-info small">
                                <i class="bi bi-info-circle me-2"></i>
                                Import data from BookKeeper Android app backup (.db file).
                                <br>Supports: Customers, Inventory, Vouchers, Sales, Purchases.
                            </div>

                            <div class="mb-4">
                                <label class="form-label">Select BookKeeper Backup File</label>
                                <input type="file" class="form-control bg-dark text-white border-secondary" 
                                    id="bookKeeperFile" accept=".db,.sqlite,.sqlite3" onchange="AnalyticsUI.handleImportFileSelection(this)">
                                <div id="fileInfoDisplay" class="mt-2 d-none">
                                    <div class="alert alert-dark border-secondary p-2 mb-0 small">
                                        <div class="d-flex justify-content-between">
                                            <span><i class="bi bi-file-earmark-code me-1"></i> <span id="fileNameDisplay"></span></span>
                                            <span class="text-info"><i class="bi bi-shield-check me-1"></i> Read-Only Mode</span>
                                        </div>
                                        <div class="text-muted mt-1">
                                            <i class="bi bi-clock-history me-1"></i> Last Modified: <span id="fileDateDisplay"></span>
                                        </div>
                                    </div>
                                    <div class="text-success x-small mt-1 px-1">
                                        <i class="bi bi-info-circle me-1"></i> Original file will remain untouched. We work on a temporary copy.
                                    </div>
                                </div>
                                <small class="text-muted" id="fileInputHint">Select the .db file from your BookKeeper backup folder</small>
                            </div>

                            <div class="card bg-dark border-secondary mb-4">
                                <div class="card-header">
                                    <strong>Import Options</strong>
                                </div>
                                <div class="card-body">
                                    <div class="form-check mb-2">
                                        <input class="form-check-input" type="checkbox" id="importCompany" checked>
                                        <label class="form-check-label" for="importCompany">
                                            <i class="bi bi-building me-1"></i> Company Information
                                        </label>
                                    </div>
                                    <div class="form-check mb-2">
                                        <input class="form-check-input" type="checkbox" id="importCustomers" checked>
                                        <label class="form-check-label" for="importCustomers">
                                            <i class="bi bi-people me-1"></i> Customers & Vendors
                                        </label>
                                    </div>
                                    <div class="form-check mb-2">
                                        <input class="form-check-input" type="checkbox" id="importInventory" checked>
                                        <label class="form-check-label" for="importInventory">
                                            <i class="bi bi-box-seam me-1"></i> Inventory Items
                                        </label>
                                    </div>
                                    <div class="form-check mb-2">
                                        <input class="form-check-input" type="checkbox" id="importVouchers" checked>
                                        <label class="form-check-label" for="importVouchers">
                                            <i class="bi bi-receipt me-1"></i> Payment Vouchers
                                        </label>
                                    </div>
                                    <div class="form-check mb-2">
                                         <input class="form-check-input" type="checkbox" id="importSales" checked>
                                         <label class="form-check-label" for="importSales">
                                             <i class="bi bi-cart me-1"></i> Sales / Invoices
                                         </label>
                                     </div>
                                     <div class="form-check mb-2">
                                         <input class="form-check-input" type="checkbox" id="importEstimates" checked>
                                         <label class="form-check-label" for="importEstimates">
                                             <i class="bi bi-file-earmark-text me-1"></i> Estimations / Quotations
                                         </label>
                                     </div>
                                     <div class="form-check mb-2">
                                         <input class="form-check-input" type="checkbox" id="importChallans" checked>
                                         <label class="form-check-label" for="importChallans">
                                             <i class="bi bi-truck me-1"></i> Delivery & Service Challans
                                         </label>
                                     </div>
                                     <div class="form-check mb-2">
                                         <input class="form-check-input" type="checkbox" id="importPurchases" checked>
                                         <label class="form-check-label" for="importPurchases">
                                             <i class="bi bi-bag me-1"></i> Purchases / Expenses
                                         </label>
                                     </div>
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="importTaxSchemes" checked>
                                        <label class="form-check-label" for="importTaxSchemes">
                                            <i class="bi bi-percent me-1"></i> Tax Schemes
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button class="btn btn-primary btn-lg w-100" onclick="AnalyticsUI.startBookKeeperImport()">
                                <i class="bi bi-cloud-download me-2"></i>Start Import
                            </button>
                        </div>
                    </div>
                </div>

                <div class="col-md-6">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h5 class="mb-0">
                                <i class="bi bi-list-check text-success me-2"></i>Import Results
                            </h5>
                        </div>
                        <div class="card-body" id="importResultsContainer">
                            <div class="text-center text-muted py-5">
                                <i class="bi bi-cloud-upload fs-1"></i>
                                <p class="mt-3">Select a file and click "Start Import" to begin</p>
                            </div>
                        </div>
                    </div>

                    <div class="card glass-panel border-0 mt-4">
                        <div class="card-header bg-transparent border-secondary">
                            <h5 class="mb-0">
                                <i class="bi bi-question-circle text-warning me-2"></i>Instructions
                            </h5>
                        </div>
                        <div class="card-body">
                            <ol class="mb-0">
                                <li class="mb-2">Open BookKeeper app on your phone</li>
                                <li class="mb-2">Go to <strong>Settings > Backup</strong></li>
                                <li class="mb-2">Create a backup and note the location</li>
                                <li class="mb-2">Transfer the backup folder to your computer</li>
                                <li class="mb-2">Look for files ending in <code>.db</code></li>
                                <li>Select the file here and import</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Handle file selection to show details and reassurance
     */
    handleImportFileSelection(input) {
        const fileInfoDisplay = document.getElementById('fileInfoDisplay');
        const fileInputHint = document.getElementById('fileInputHint');
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const fileDateDisplay = document.getElementById('fileDateDisplay');

        if (input.files && input.files[0]) {
            const file = input.files[0];
            fileNameDisplay.textContent = file.name;
            fileDateDisplay.textContent = new Date(file.lastModified).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            fileInfoDisplay.classList.remove('d-none');
            fileInputHint.classList.add('d-none');
        } else {
            fileInfoDisplay.classList.add('d-none');
            fileInputHint.classList.remove('d-none');
        }
    },

    /**
     * Start BookKeeper import process
     */
    async startBookKeeperImport() {
        const fileInput = document.getElementById('bookKeeperFile');
        const resultsContainer = document.getElementById('importResultsContainer');

        if (!fileInput.files || fileInput.files.length === 0) {
            App.showNotification('Please select a BookKeeper backup file', 'error');
            return;
        }

        const file = fileInput.files[0];

        // Get import options
        const options = {
            company: document.getElementById('importCompany').checked,
            customers: document.getElementById('importCustomers').checked,
            inventory: document.getElementById('importInventory').checked,
            vouchers: document.getElementById('importVouchers').checked,
            sales: document.getElementById('importSales').checked,
            estimates: document.getElementById('importEstimates').checked,
            challans: document.getElementById('importChallans').checked,
            purchases: document.getElementById('importPurchases').checked,
            taxSchemes: document.getElementById('importTaxSchemes').checked
        };

        // Show loading state
        resultsContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p>Importing data from ${file.name}...</p>
                <p class="text-muted small">This may take a moment for large files</p>
            </div>
        `;

        try {
            // Check if BookKeeperImport is available
            if (typeof BookKeeperImport === 'undefined') {
                throw new Error('BookKeeper import module not loaded. Please refresh the page.');
            }

            // Run the import
            const stats = await BookKeeperImport.runFullImport(file, options);
            const summary = BookKeeperImport.getSummary(stats);

            // Display results
            resultsContainer.innerHTML = `
                <div class="alert alert-success mb-4">
                    <i class="bi bi-check-circle me-2"></i>
                    Import completed in ${summary.duration.toFixed(2)} seconds
                </div>

                <h6 class="text-muted mb-3">Import Summary</h6>
                <div class="list-group list-group-flush mb-4">
                    ${summary.sections.map(section => `
                        <div class="list-group-item bg-transparent border-secondary d-flex justify-content-between align-items-center">
                            <div>
                                <i class="bi ${section.status === 'success' ? 'bi-check-circle text-success' : 'bi-x-circle text-danger'} me-2"></i>
                                <strong>${section.name}</strong>
                                ${section.message ? `<small class="text-muted ms-2">${section.message}</small>` : ''}
                            </div>
                            <div>
                                ${section.imported !== undefined ? `
                                    <span class="badge bg-success">${section.imported} imported</span>
                                    ${section.skipped > 0 ? `<span class="badge bg-secondary">${section.skipped} skipped</span>` : ''}
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="row g-3">
                    <div class="col-6">
                        <div class="card bg-success bg-opacity-25 text-center p-3">
                            <h3 class="mb-0">${summary.totalImported}</h3>
                            <small>Records Imported</small>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="card ${summary.errors > 0 ? 'bg-danger' : 'bg-info'} bg-opacity-25 text-center p-3">
                            <h3 class="mb-0">${summary.errors}</h3>
                            <small>Errors</small>
                        </div>
                    </div>
                </div>

                ${summary.errors > 0 ? `
                    <div class="alert alert-warning mt-3">
                        <strong>Some data could not be imported:</strong>
                        <ul class="mb-0 mt-2">
                            ${stats.errors.map(e => `<li>${e.section}: ${e.error}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <button class="btn btn-outline-light w-100 mt-4" onclick="location.reload()">
                    <i class="bi bi-arrow-clockwise me-2"></i>Refresh to See Imported Data
                </button>
            `;

            App.showNotification(`Successfully imported ${summary.totalImported} records!`, 'success');

        } catch (error) {
            console.error('Import error:', error);
            resultsContainer.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <strong>Import Failed</strong>
                    <p class="mb-0 mt-2">${error.message}</p>
                </div>
                <div class="text-center mt-4">
                    <button class="btn btn-outline-light" onclick="AnalyticsUI.renderDataImport()">
                        <i class="bi bi-arrow-left me-2"></i>Try Again
                    </button>
                </div>
            `;
            App.showNotification('Import failed: ' + error.message, 'error');
        }
    }
};

// Expose to window
window.AnalyticsUI = AnalyticsUI;

