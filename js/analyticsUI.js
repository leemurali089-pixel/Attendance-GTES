/**
 * Business Analytics UI Controller
 * Renders the dashboard and analytics views
 */

const AnalyticsUI = {

    currentSection: 'dashboard',
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth(),

    /** Full analytics sub-nav (same markup as former index.html block). */
    _SUB_NAV_HTML: `<ul class="nav nav-pills mb-4 flex-wrap gap-2 p-2 rounded-3 border border-secondary border-opacity-25 bg-dark bg-opacity-25" id="analyticsTabs" role="tablist" aria-label="Business analytics sections">
<li class="nav-item"><a class="nav-link active" href="#" onclick="AnalyticsUI.currentSection='dashboard'; AnalyticsUI.renderDashboard(); return false;"><i class="bi bi-speedometer2 me-1"></i> Dashboard</a></li>
<li class="nav-item"><a class="nav-link" href="#" onclick="AnalyticsUI.currentSection='gst'; AnalyticsUI.renderGSTReports(); return false;"><i class="bi bi-file-earmark-bar-graph me-1"></i> GST Reports</a></li>
<li class="nav-item"><a class="nav-link" href="#" onclick="AnalyticsUI.currentSection='ledger'; AnalyticsUI.renderCustomerLedger(); return false;"><i class="bi bi-journal-text me-1"></i> Customer Ledger</a></li>
<li class="nav-item"><a class="nav-link" href="#" onclick="AnalyticsUI.currentSection='stock'; AnalyticsUI.renderStockReports(); return false;"><i class="bi bi-box-seam me-1"></i> Stock Reports</a></li>
<li class="nav-item"><a class="nav-link" href="#" onclick="AnalyticsUI.currentSection='reminders'; AnalyticsUI.renderDueReminders(); return false;"><i class="bi bi-bell me-1"></i> Due Reminders</a></li>
<li class="nav-item"><a class="nav-link" href="#" onclick="AnalyticsUI.currentSection='import'; AnalyticsUI.renderDataImport(); return false;"><i class="bi bi-cloud-upload me-1"></i> Data Import</a></li>
</ul>`,

    init() {
        console.log('AnalyticsUI initialized');
    },

    /**
     * Ensure GST / Ledger / … pills exist (injected on first analytics open).
     */
    ensureSubNav() {
        const mount = document.getElementById('analyticsSubNavMount');
        if (!mount) return;
        const existing = document.getElementById('analyticsTabs');
        if (existing && mount.contains(existing) && existing.querySelectorAll('li').length >= 6) {
            return;
        }
        mount.innerHTML = this._SUB_NAV_HTML;
    },

    /**
     * Set active tab styling
     */
    setActiveTab() {
        this.ensureSubNav();
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
        this.currentSection = 'dashboard';
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
                            <h6 class="mb-0"><i class="bi bi-bar-chart me-2"></i>Monthly Cash Flow — FY ${data.cashFlowFyLabel || this.selectedYear}</h6>
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
                                <div class="alert alert-${alert.type} mb-0 rounded-0 border-start border-4 py-2 px-3 gtes-analytics-alert">
                                    <div class="d-flex align-items-start">
                                        <i class="bi ${alert.icon} me-2 mt-1"></i>
                                        <div class="flex-grow-1">
                                            <strong class="small">${alert.title}</strong>
                                            <p class="mb-0 small gtes-analytics-alert-msg">${alert.message}</p>
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div class="p-3 text-center gtes-analytics-muted"><i class="bi bi-check-circle fs-1"></i><p class="mb-0">No alerts</p></div>'}
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
                            <table class="table table-hover mb-0 gtes-analytics-table">
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
                            <small class="gtes-analytics-chart-label">${d.month}</small>
                        </div>
                    `;
        }).join('')}
            </div>
            <div class="d-flex justify-content-center gap-4 mt-3 gtes-analytics-chart-legend">
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
        this.currentSection = 'gst';
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const fy = (typeof DataManager !== 'undefined' && DataManager.getFinancialYear)
            ? DataManager.getFinancialYear(new Date(), true)
            : { startYear: new Date().getFullYear() - 1, endYear: new Date().getFullYear() };
        const defStart = `${fy.startYear}-04-01`;
        const defEnd = new Date().toISOString().slice(0, 10);

        container.innerHTML = `
            <ul class="nav nav-pills mb-3 flex-wrap gap-2" id="gstSubTabs" role="tablist">
                <li class="nav-item">
                    <button type="button" class="nav-link active btn btn-sm" data-gst-sub="month"
                        onclick="AnalyticsUI.showGstSubPanel('month')">GST month report</button>
                </li>
                <li class="nav-item">
                    <button type="button" class="nav-link btn btn-sm" data-gst-sub="sales"
                        onclick="AnalyticsUI.showGstSubPanel('sales')">Sales register</button>
                </li>
                <li class="nav-item">
                    <button type="button" class="nav-link btn btn-sm" data-gst-sub="purchase"
                        onclick="AnalyticsUI.showGstSubPanel('purchase')">Purchase register</button>
                </li>
            </ul>

            <div id="gstPanelMonth">
                <div class="card glass-panel border-0 mb-4">
                    <div class="card-header bg-transparent border-secondary d-flex flex-wrap justify-content-between align-items-center gap-2">
                        <h5 class="mb-0"><i class="bi bi-file-earmark-bar-graph me-2 text-primary"></i>GST month report</h5>
                        <div class="d-flex flex-wrap gap-2 align-items-center">
                            <select class="form-select form-select-sm bg-dark text-white border-secondary" id="gstMonth" style="width: auto;">
                                ${this.getMonthOptions()}
                            </select>
                            <select class="form-select form-select-sm bg-dark text-white border-secondary" id="gstYear" style="width: auto;">
                                ${this.getYearOptions()}
                            </select>
                            <button class="btn btn-primary btn-sm" onclick="AnalyticsUI.loadGSTReport()">
                                <i class="bi bi-arrow-clockwise"></i> Generate
                            </button>
                            <button type="button" class="btn btn-outline-success btn-sm" onclick="AnalyticsUI.exportGstReportExcel()" title="Full report Excel (CSV)">
                                <i class="bi bi-file-earmark-spreadsheet"></i> Excel
                            </button>
                            <button type="button" class="btn btn-outline-danger btn-sm" onclick="AnalyticsUI.exportGstReportPdf()" title="Summary PDF">
                                <i class="bi bi-file-earmark-pdf"></i> PDF
                            </button>
                        </div>
                    </div>
                    <div class="card-body" id="gstReportContent">
                        <div class="text-center gtes-analytics-muted py-5">
                            <i class="bi bi-file-earmark-bar-graph fs-1"></i>
                            <p class="mt-2 mb-0">Select month and year, then click Generate</p>
                            <p class="small mt-2 mb-0">Includes <strong>GST invoices only</strong> (plain invoices excluded).</p>
                        </div>
                    </div>
                </div>
            </div>

            <div id="gstPanelSales" class="d-none">
                <div class="card glass-panel border-0 mb-4">
                    <div class="card-header bg-transparent border-secondary">
                        <h5 class="mb-0"><i class="bi bi-receipt me-2 text-success"></i>Sales register</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 align-items-end mb-3">
                            <div class="col-md-2">
                                <label class="form-label small gtes-analytics-muted mb-0">Start date</label>
                                <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="gstSalesRegStart" value="${defStart}">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small gtes-analytics-muted mb-0">End date</label>
                                <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="gstSalesRegEnd" value="${defEnd}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small gtes-analytics-muted mb-0">Invoice type</label>
                                <select class="form-select form-select-sm bg-dark text-white border-secondary" id="gstSalesRegMode">
                                    <option value="gst">GST / tax invoices only</option>
                                    <option value="plain">Plain (non-GST) only</option>
                                </select>
                            </div>
                            <div class="col-md-5 d-flex flex-wrap gap-2">
                                <button type="button" class="btn btn-primary btn-sm" onclick="AnalyticsUI.loadSalesRegister()">
                                    <i class="bi bi-search"></i> Generate
                                </button>
                                <button type="button" class="btn btn-outline-success btn-sm" onclick="AnalyticsUI.exportSalesRegisterExcel()">
                                    <i class="bi bi-file-earmark-spreadsheet"></i> Excel
                                </button>
                                <button type="button" class="btn btn-outline-danger btn-sm" onclick="AnalyticsUI.exportSalesRegisterPdf()">
                                    <i class="bi bi-file-earmark-pdf"></i> PDF
                                </button>
                            </div>
                        </div>
                        <div id="gstSalesRegisterOut" class="gtes-gst-register-out"></div>
                    </div>
                </div>
            </div>

            <div id="gstPanelPurchase" class="d-none">
                <div class="card glass-panel border-0 mb-4">
                    <div class="card-header bg-transparent border-secondary">
                        <h5 class="mb-0"><i class="bi bi-bag-check me-2 text-warning"></i>Purchase register</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 align-items-end mb-3">
                            <div class="col-md-2">
                                <label class="form-label small gtes-analytics-muted mb-0">Start date</label>
                                <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="gstPurRegStart" value="${defStart}">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small gtes-analytics-muted mb-0">End date</label>
                                <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="gstPurRegEnd" value="${defEnd}">
                            </div>
                            <div class="col-md-8 d-flex flex-wrap gap-2">
                                <button type="button" class="btn btn-primary btn-sm" onclick="AnalyticsUI.loadPurchaseRegister()">
                                    <i class="bi bi-search"></i> Generate
                                </button>
                                <button type="button" class="btn btn-outline-success btn-sm" onclick="AnalyticsUI.exportPurchaseRegisterExcel()">
                                    <i class="bi bi-file-earmark-spreadsheet"></i> Excel
                                </button>
                                <button type="button" class="btn btn-outline-danger btn-sm" onclick="AnalyticsUI.exportPurchaseRegisterPdf()">
                                    <i class="bi bi-file-earmark-pdf"></i> PDF
                                </button>
                            </div>
                        </div>
                        <div id="gstPurchaseRegisterOut" class="gtes-gst-register-out"></div>
                    </div>
                </div>
            </div>
        `;
    },

    showGstSubPanel(which) {
        document.querySelectorAll('#gstSubTabs [data-gst-sub]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-gst-sub') === which);
        });
        const m = document.getElementById('gstPanelMonth');
        const s = document.getElementById('gstPanelSales');
        const p = document.getElementById('gstPanelPurchase');
        if (m) m.classList.toggle('d-none', which !== 'month');
        if (s) s.classList.toggle('d-none', which !== 'sales');
        if (p) p.classList.toggle('d-none', which !== 'purchase');
    },

    loadSalesRegister() {
        const start = document.getElementById('gstSalesRegStart')?.value;
        const end = document.getElementById('gstSalesRegEnd')?.value;
        const mode = document.getElementById('gstSalesRegMode')?.value || 'gst';
        const out = document.getElementById('gstSalesRegisterOut');
        if (!start || !end || !out) return;
        const rep = BusinessAnalytics.getSalesRegister(start, end, mode);
        const label = mode === 'plain' ? 'Plain' : 'GST';
        out.innerHTML = this._renderRegisterTable(
            ['Invoice #', 'Date', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Type'],
            rep.rows.map(r => [
                r.invoiceNo, r.date, r.customerName,
                `₹${this.formatCurrency(r.taxable)}`,
                `₹${this.formatCurrency(r.cgst)}`, `₹${this.formatCurrency(r.sgst)}`, `₹${this.formatCurrency(r.igst)}`,
                `₹${this.formatCurrency(r.total)}`, r.billType
            ]),
            ['', '', '', `₹${this.formatCurrency(rep.totals.taxable)}`,
                `₹${this.formatCurrency(rep.totals.cgst)}`, `₹${this.formatCurrency(rep.totals.sgst)}`, `₹${this.formatCurrency(rep.totals.igst)}`,
                `₹${this.formatCurrency(rep.totals.total)}`, '']
        ) + `<p class="small gtes-gst-small mt-2 mb-0">${rep.rows.length} row(s) · ${label} · ${start} to ${end}</p>`;
    },

    loadPurchaseRegister() {
        const start = document.getElementById('gstPurRegStart')?.value;
        const end = document.getElementById('gstPurRegEnd')?.value;
        const out = document.getElementById('gstPurchaseRegisterOut');
        if (!start || !end || !out) return;
        const rep = BusinessAnalytics.getPurchaseRegister(start, end);
        out.innerHTML = this._renderRegisterTable(
            ['Bill #', 'Date', 'Vendor', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Category'],
            rep.rows.map(r => [
                r.billNo, r.date, r.vendor,
                `₹${this.formatCurrency(r.taxable)}`,
                `₹${this.formatCurrency(r.cgst)}`, `₹${this.formatCurrency(r.sgst)}`, `₹${this.formatCurrency(r.igst)}`,
                `₹${this.formatCurrency(r.total)}`, r.category
            ]),
            ['', '', '', `₹${this.formatCurrency(rep.totals.taxable)}`,
                `₹${this.formatCurrency(rep.totals.cgst)}`, `₹${this.formatCurrency(rep.totals.sgst)}`, `₹${this.formatCurrency(rep.totals.igst)}`,
                `₹${this.formatCurrency(rep.totals.total)}`, '']
        ) + `<p class="small gtes-gst-small mt-2 mb-0">${rep.rows.length} row(s) · ${start} to ${end}</p>`;
    },

    _renderRegisterTable(headers, rows, footerRow) {
        const esc = (v) => {
            if (v == null) return '';
            return String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };
        let h = '<div class="table-responsive"><table class="table table-sm gtes-gst-report-table table-striped"><thead><tr>';
        headers.forEach(x => { h += `<th>${esc(x)}</th>`; });
        h += '</tr></thead><tbody>';
        rows.forEach(cols => {
            h += '<tr>';
            cols.forEach(c => { h += `<td>${esc(c)}</td>`; });
            h += '</tr>';
        });
        if (footerRow) {
            h += '<tr class="gtes-gst-row-accent fw-bold">';
            footerRow.forEach(c => { h += `<td>${esc(c)}</td>`; });
            h += '</tr>';
        }
        h += '</tbody></table></div>';
        return h;
    },

    exportSalesRegisterExcel() {
        const start = document.getElementById('gstSalesRegStart')?.value;
        const end = document.getElementById('gstSalesRegEnd')?.value;
        const mode = document.getElementById('gstSalesRegMode')?.value || 'gst';
        if (!start || !end) {
            if (typeof App !== 'undefined') App.showNotification('Select start and end dates', 'warning');
            return;
        }
        BusinessAnalytics.exportSalesRegisterCSV(start, end, mode);
    },

    exportPurchaseRegisterExcel() {
        const start = document.getElementById('gstPurRegStart')?.value;
        const end = document.getElementById('gstPurRegEnd')?.value;
        if (!start || !end) {
            if (typeof App !== 'undefined') App.showNotification('Select start and end dates', 'warning');
            return;
        }
        BusinessAnalytics.exportPurchaseRegisterCSV(start, end);
    },

    async exportSalesRegisterPdf() {
        const start = document.getElementById('gstSalesRegStart')?.value;
        const end = document.getElementById('gstSalesRegEnd')?.value;
        const mode = document.getElementById('gstSalesRegMode')?.value || 'gst';
        if (!start || !end) {
            if (typeof App !== 'undefined') App.showNotification('Select dates and click Generate first', 'warning');
            return;
        }
        const rep = BusinessAnalytics.getSalesRegister(start, end, mode);
        const title = `Sales register (${mode === 'plain' ? 'Plain' : 'GST'})`;
        await this._exportRegisterPdf(title, `${start} to ${end}`, [
            'Invoice #', 'Date', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Type'
        ], rep.rows.map(r => [r.invoiceNo, r.date, r.customerName, r.taxable, r.cgst, r.sgst, r.igst, r.total, r.billType]),
            ['', '', '', rep.totals.taxable, rep.totals.cgst, rep.totals.sgst, rep.totals.igst, rep.totals.total, '']);
    },

    async exportPurchaseRegisterPdf() {
        const start = document.getElementById('gstPurRegStart')?.value;
        const end = document.getElementById('gstPurRegEnd')?.value;
        if (!start || !end) {
            if (typeof App !== 'undefined') App.showNotification('Select dates', 'warning');
            return;
        }
        const rep = BusinessAnalytics.getPurchaseRegister(start, end);
        await this._exportRegisterPdf('Purchase register', `${start} to ${end}`, [
            'Bill #', 'Date', 'Vendor', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total', 'Category'
        ], rep.rows.map(r => [r.billNo, r.date, r.vendor, r.taxable, r.cgst, r.sgst, r.igst, r.total, r.category]),
            ['', '', '', rep.totals.taxable, rep.totals.cgst, rep.totals.sgst, rep.totals.igst, rep.totals.total, '']);
    },

    async _exportRegisterPdf(title, period, headers, dataRows, footerNumeric) {
        if (typeof html2pdf === 'undefined' || typeof DeliveryUI === 'undefined') {
            if (typeof App !== 'undefined') App.showNotification('PDF library not loaded', 'error');
            return;
        }
        const esc = (v) => (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let rowsHtml = '';
        dataRows.forEach(cols => {
            rowsHtml += '<tr>' + cols.map(c => `<td style="padding:6px;border:1px solid #ccc;font-size:9px;">${esc(c)}</td>`).join('') + '</tr>';
        });
        let foot = '<tr style="background:#e0e7ff;font-weight:bold;">';
        footerNumeric.forEach((c, i) => {
            const cell = i >= 3 && i <= 7 ? `₹${this.formatCurrency(Number(c) || 0)}` : esc(c);
            foot += `<td style="padding:6px;border:1px solid #ccc;font-size:9px;">${cell}</td>`;
        });
        foot += '</tr>';
        const headHtml = headers.map(h => `<th style="padding:6px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:9px;">${esc(h)}</th>`).join('');
        const wrap = document.createElement('div');
        wrap.className = 'gtes-pdf-document';
        const w = DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX || 760;
        wrap.style.cssText = `width:${w}px;padding:16px;background:#fff;color:#111;font-family:Arial,sans-serif;`;
        wrap.innerHTML = `
            <h2 style="font-size:14px;margin:0 0 8px;">${esc(title)}</h2>
            <p style="font-size:10px;margin:0 0 12px;">${esc(period)}</p>
            <table style="width:100%;border-collapse:collapse;"><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}${foot}</tbody></table>
        `;
        const filename = `${title.replace(/\s+/g, '_')}_${period.replace(/\s+/g, '')}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const opt = DeliveryUI.buildGtesHtml2PdfOptions({ filename });
        const { host, clone } = DeliveryUI.beginPdfClone(wrap, w);
        try {
            const blob = await html2pdf().set(opt).from(clone).output('blob');
            await DeliveryUI.finishPdfDownload(blob, filename, 'GST_Reports');
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('PDF export failed', 'error');
        } finally {
            DeliveryUI.endPdfClone(host);
        }
    },

    exportGstReportExcel() {
        const sel = this._getGstReportSelection();
        if (!sel) return;
        BusinessAnalytics.exportFullGstMonthExcel(sel.calendarYear, sel.month);
    },

    async exportGstReportPdf() {
        const sel = this._getGstReportSelection();
        if (!sel) return;
        const { month, calendarYear } = sel;
        if (typeof html2pdf === 'undefined' || typeof DeliveryUI === 'undefined') {
            if (typeof App !== 'undefined') App.showNotification('PDF library not loaded', 'error');
            return;
        }
        const gstr1 = BusinessAnalytics.generateGSTR1(calendarYear, month);
        const grand = BusinessAnalytics.generateGstMonthGrandSummary(calendarYear, month);
        const hsn = BusinessAnalytics.generateHSNWiseSales(calendarYear, month);
        const esc = (v) => (v == null ? '' : String(v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let hsnRows = hsn.rows.map(r => `<tr><td style="padding:4px;border:1px solid #ccc;font-size:8px;">${esc(r.hsn)}</td>
            <td style="padding:4px;border:1px solid #ccc;font-size:8px;text-align:right;">${r.quantity || '—'}</td>
            <td style="padding:4px;border:1px solid #ccc;font-size:8px;text-align:right;">₹${this.formatCurrency(r.taxableValue)}</td>
            <td style="padding:4px;border:1px solid #ccc;font-size:8px;text-align:right;">₹${this.formatCurrency(r.cgst + r.sgst + r.igst)}</td></tr>`).join('');
        const wrap = document.createElement('div');
        wrap.className = 'gtes-pdf-document';
        const pw = DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX || 760;
        wrap.style.cssText = `width:${pw}px;padding:14px;background:#fff;color:#111;font-family:Arial,sans-serif;font-size:9px;`;
        wrap.innerHTML = `
            <h1 style="font-size:15px;">GST month report (GST invoices only)</h1>
            <p>${esc(gstr1.period)}</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
                <tr><td style="padding:4px;border:1px solid #ccc;">GST invoices</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">${gstr1.totals.totalInvoices}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">Taxable (sales)</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">₹${this.formatCurrency(grand.sales.taxableValue)}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">Total GST (sales)</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">₹${this.formatCurrency(grand.sales.totalGst)}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">Grand total sales</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">₹${this.formatCurrency(grand.sales.grandTotal)}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">Purchase bills</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">${grand.purchase.billCount}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">ITC total</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">₹${this.formatCurrency(grand.purchase.itcTotal)}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;">Purchase grand total</td><td style="padding:4px;border:1px solid #ccc;text-align:right;">₹${this.formatCurrency(grand.purchase.grandTotal)}</td></tr>
                <tr><td style="padding:4px;border:1px solid #ccc;"><strong>Net tax payable</strong></td><td style="padding:4px;border:1px solid #ccc;text-align:right;"><strong>₹${this.formatCurrency(grand.netTaxPayable)}</strong></td></tr>
            </table>
            <h2 style="font-size:12px;">HSN summary</h2>
            <table style="width:100%;border-collapse:collapse;font-size:8px;"><thead><tr>
                <th style="border:1px solid #333;background:#1e293b;color:#fff;padding:4px;">HSN</th>
                <th style="border:1px solid #333;background:#1e293b;color:#fff;padding:4px;">Qty</th>
                <th style="border:1px solid #333;background:#1e293b;color:#fff;padding:4px;">Taxable</th>
                <th style="border:1px solid #333;background:#1e293b;color:#fff;padding:4px;">Tax</th>
            </tr></thead><tbody>${hsnRows}</tbody></table>
        `;
        const filename = `GST_Report_${gstr1.period.replace(/\s+/g, '_')}.pdf`;
        const opt = DeliveryUI.buildGtesHtml2PdfOptions({
            filename,
            html2canvas: { scale: Math.min(Number(DeliveryUI.GTES_LEDGER_HTML2PDF_SCALE) || 1.12, 1.15) }
        });
        const { host, clone } = DeliveryUI.beginPdfClone(wrap, pw);
        try {
            const blob = await html2pdf().set(opt).from(clone).output('blob');
            await DeliveryUI.finishPdfDownload(blob, filename, 'GST_Reports');
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('PDF export failed', 'error');
        } finally {
            DeliveryUI.endPdfClone(host);
        }
    },

    /**
     * Load and display GST Report
     */
    loadGSTReport() {
        const sel = this._getGstReportSelection();
        if (!sel) return;
        const { month, calendarYear } = sel;

        const gstr1 = BusinessAnalytics.generateGSTR1(calendarYear, month);
        const gstr3b = BusinessAnalytics.generateGSTR3B(calendarYear, month);
        const salesPur = BusinessAnalytics.generateMonthlySalesPurchaseSummary(calendarYear, month);
        const hsnRep = BusinessAnalytics.generateHSNWiseSales(calendarYear, month);
        const hsnLines = BusinessAnalytics.generateHSNWiseSalesLines(calendarYear, month);
        const grand = BusinessAnalytics.generateGstMonthGrandSummary(calendarYear, month);

        const content = document.getElementById('gstReportContent');
        content.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="card gtes-gst-metric-card border-secondary h-100">
                        <div class="card-body">
                            <h6 class="gtes-gst-section-title mb-2"><i class="bi bi-graph-up-arrow me-2 text-success"></i>Total sales (GST)</h6>
                            <p class="gtes-gst-metric-value mb-1">₹${this.formatCurrency(salesPur.totalSales)}</p>
                            <small class="gtes-gst-small">${salesPur.invoiceCount} GST invoice(s) · ${salesPur.period}</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card gtes-gst-metric-card border-secondary h-100">
                        <div class="card-body">
                            <h6 class="gtes-gst-section-title mb-2"><i class="bi bi-bag-check me-2 text-warning"></i>Total purchase</h6>
                            <p class="gtes-gst-metric-value mb-1">₹${this.formatCurrency(salesPur.totalPurchase)}</p>
                            <small class="gtes-gst-small">${salesPur.purchaseBillCount} bill(s) from <strong>purchases</strong> book (ITC rules: Purchase category, BookKeeper, local, or GST on vendor bills)</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card gtes-gst-metric-card border-secondary h-100">
                        <div class="card-body">
                            <h6 class="gtes-gst-section-title mb-2"><i class="bi bi-upc-scan me-2 text-info"></i>HSN report</h6>
                            <p class="gtes-gst-metric-value mb-1">${hsnRep.rows.length} HSN line(s)</p>
                            <small class="gtes-gst-small">GST invoices only — see table below</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-4">
                <!-- GSTR-1 Summary -->
                <div class="col-md-6">
                    <div class="card gtes-gst-inner-card border-secondary">
                        <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                            <span><i class="bi bi-file-text me-2"></i>GSTR-1 — GST invoices only</span>
                            <button class="btn btn-sm btn-light" onclick="BusinessAnalytics.exportGSTR1ToCSV(${calendarYear}, ${month})">
                                <i class="bi bi-download"></i> Export
                            </button>
                        </div>
                        <div class="card-body">
                            <table class="table table-sm mb-0 gtes-gst-report-table">
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
                                <tr class="gtes-gst-row-accent">
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
                                <tr class="gtes-gst-row-success">
                                    <td><strong>Total Tax</strong></td>
                                    <td class="text-end"><strong>₹${this.formatCurrency(gstr1.totals.totalTax)}</strong></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- GSTR-3B Summary -->
                <div class="col-md-6">
                    <div class="card gtes-gst-inner-card border-secondary">
                        <div class="card-header bg-success text-white">
                            <i class="bi bi-calculator me-2"></i>GSTR-3B Summary
                        </div>
                        <div class="card-body">
                            <h6 class="gtes-gst-section-title mb-3">Output Tax (Sales)</h6>
                            <table class="table table-sm gtes-gst-report-table">
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

                            <h6 class="gtes-gst-section-title mb-3 mt-3">Input Tax Credit</h6>
                            <table class="table table-sm gtes-gst-report-table">
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

                            <h6 class="gtes-gst-section-title mb-3 mt-3">Net Tax Payable</h6>
                            <table class="table table-sm mb-0 gtes-gst-report-table">
                                <tr class="gtes-gst-row-payable">
                                    <td><strong>Total Payable</strong></td>
                                    <td class="text-end"><strong>₹${this.formatCurrency(gstr3b.netTaxPayable.total)}</strong></td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <!-- HSN-wise sales -->
            <div class="card gtes-gst-inner-card border-secondary mt-4">
                <div class="card-header border-secondary d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="mb-0 gtes-gst-section-title"><i class="bi bi-list-columns-reverse me-2"></i>HSN-wise sales (GST invoices)</h6>
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="BusinessAnalytics.exportHSNWiseSalesToCSV(${calendarYear}, ${month})">
                        <i class="bi bi-download"></i> Export CSV
                    </button>
                </div>
                <div class="card-body p-0">
                    ${hsnRep.rows.length === 0 ? `
                        <div class="p-4 text-center gtes-gst-small">No GST invoice line items in this month, or no HSN/taxable data.</div>
                    ` : `
                    <div class="table-responsive">
                        <table class="table table-sm mb-0 gtes-gst-report-table table-striped">
                            <thead>
                                <tr>
                                    <th class="gtes-gst-hsn-full">HSN (full)</th>
                                    <th class="text-end">Qty</th>
                                    <th class="text-end">Taxable value</th>
                                    <th class="text-end">CGST</th>
                                    <th class="text-end">SGST</th>
                                    <th class="text-end">IGST</th>
                                    <th class="text-end">Total tax</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hsnRep.rows.map(r => `
                                    <tr>
                                        <td><span class="gtes-gst-hsn">${r.hsn}</span></td>
                                        <td class="text-end">${r.quantity ? r.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}</td>
                                        <td class="text-end">₹${this.formatCurrency(r.taxableValue)}</td>
                                        <td class="text-end">₹${this.formatCurrency(r.cgst)}</td>
                                        <td class="text-end">₹${this.formatCurrency(r.sgst)}</td>
                                        <td class="text-end">₹${this.formatCurrency(r.igst)}</td>
                                        <td class="text-end fw-bold">₹${this.formatCurrency(r.cgst + r.sgst + r.igst)}</td>
                                    </tr>
                                `).join('')}
                                <tr class="gtes-gst-row-accent fw-bold">
                                    <td>Total</td>
                                    <td class="text-end">${hsnRep.totals.quantity ? hsnRep.totals.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—'}</td>
                                    <td class="text-end">₹${this.formatCurrency(hsnRep.totals.taxableValue)}</td>
                                    <td class="text-end">₹${this.formatCurrency(hsnRep.totals.cgst)}</td>
                                    <td class="text-end">₹${this.formatCurrency(hsnRep.totals.sgst)}</td>
                                    <td class="text-end">₹${this.formatCurrency(hsnRep.totals.igst)}</td>
                                    <td class="text-end">₹${this.formatCurrency(hsnRep.totals.totalTax)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    `}
                </div>
            </div>

            <!-- B2B Details -->
            ${gstr1.b2b.length > 0 ? `
                <div class="card gtes-gst-inner-card border-secondary mt-4">
                    <div class="card-header border-secondary">
                        <h6 class="mb-0 gtes-gst-section-title">B2B — GST invoices (15-char GSTIN)</h6>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-striped table-hover mb-0 gtes-gst-report-table">
                                <thead>
                                    <tr>
                                        <th>Invoice #</th>
                                        <th>Date</th>
                                        <th>Customer</th>
                                        <th>GSTIN</th>
                                        <th class="text-end">Taxable</th>
                                        <th class="text-end">Tax</th>
                                        <th class="text-end">Total</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${gstr1.b2b.map(inv => `
                                        <tr>
                                            <td>${inv.invoiceNumber}</td>
                                            <td>${this.formatDate(inv.invoiceDate)}</td>
                                            <td>${inv.customerName}</td>
                                            <td><span class="gtes-gst-hsn">${inv.gstin}</span></td>
                                            <td class="text-end">₹${this.formatCurrency(inv.taxableValue)}</td>
                                            <td class="text-end">₹${this.formatCurrency(inv.cgst + inv.sgst + inv.igst)}</td>
                                            <td class="text-end fw-bold">₹${this.formatCurrency(inv.total)}</td>
                                            <td class="text-center">
                                                <button class="btn btn-sm btn-outline-info" onclick="InvoicesUI.previewInvoice(decodeURIComponent('${encodeURIComponent(String(inv.id))}'))" title="View">
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

            <div class="card gtes-gst-inner-card border-secondary mt-4">
                <div class="card-header border-secondary d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="mb-0 gtes-gst-section-title"><i class="bi bi-ui-radios-grid me-2"></i>HSN line detail (full HSN / SAC per line)</h6>
                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="BusinessAnalytics.exportHSNWiseLinesToCSV(${calendarYear}, ${month})">
                        <i class="bi bi-download"></i> Export CSV
                    </button>
                </div>
                <div class="card-body p-0">
                    ${hsnLines.lines.length === 0 ? `<div class="p-4 text-center gtes-gst-small">No line-level HSN rows for this month.</div>` : `
                    <div class="table-responsive gtes-gst-lines-scroll">
                        <table class="table table-sm mb-0 gtes-gst-report-table table-striped">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Date</th>
                                    <th>Customer</th>
                                    <th>Item</th>
                                    <th class="gtes-gst-hsn-full">HSN (full)</th>
                                    <th class="text-end">Qty</th>
                                    <th>Unit</th>
                                    <th class="text-end">Taxable</th>
                                    <th class="text-end">Tax</th>
                                    <th class="text-end">Line total</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${hsnLines.lines.map(l => `
                                    <tr>
                                        <td>${String(l.invoiceNo).replace(/</g, '&lt;')}</td>
                                        <td>${this.formatDate(l.invoiceDate)}</td>
                                        <td>${String(l.customerName || '').replace(/</g, '&lt;')}</td>
                                        <td>${String(l.itemName || '').replace(/</g, '&lt;')}</td>
                                        <td class="gtes-gst-hsn-full"><span class="gtes-gst-hsn">${String(l.hsnFull).replace(/</g, '&lt;')}</span></td>
                                        <td class="text-end">${l.quantity === '' || l.quantity === undefined ? '—' : l.quantity}</td>
                                        <td>${String(l.unit || '').replace(/</g, '&lt;')}</td>
                                        <td class="text-end">₹${this.formatCurrency(l.taxableValue)}</td>
                                        <td class="text-end">₹${this.formatCurrency(l.cgst + l.sgst + l.igst)}</td>
                                        <td class="text-end fw-bold">₹${this.formatCurrency(l.lineTotal)}</td>
                                        <td class="text-center">
                                            <button class="btn btn-sm btn-outline-info" type="button" onclick="InvoicesUI.previewInvoice(decodeURIComponent('${encodeURIComponent(String(l.invoiceId))}'))" title="View"><i class="bi bi-eye"></i></button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`}
                </div>
            </div>

            <div class="card gtes-gst-inner-card border-secondary mt-4 mb-2">
                <div class="card-header border-secondary">
                    <h6 class="mb-0 gtes-gst-section-title"><i class="bi bi-calculator-fill me-2"></i>Month totals</h6>
                </div>
                <div class="card-body">
                    <table class="table table-sm gtes-gst-report-table mb-0">
                        <tbody>
                            <tr><td>GST invoices (count)</td><td class="text-end fw-bold">${grand.sales.gstInvoiceCount}</td></tr>
                            <tr><td>Taxable (GST sales)</td><td class="text-end">₹${this.formatCurrency(grand.sales.taxableValue)}</td></tr>
                            <tr><td>Total GST on sales</td><td class="text-end">₹${this.formatCurrency(grand.sales.totalGst)}</td></tr>
                            <tr class="gtes-gst-row-success"><td><strong>Grand total sales</strong></td><td class="text-end"><strong>₹${this.formatCurrency(grand.sales.grandTotal)}</strong></td></tr>
                            <tr><td colspan="2" class="border-secondary"></td></tr>
                            <tr><td>Purchase bills (count)</td><td class="text-end fw-bold">${grand.purchase.billCount}</td></tr>
                            <tr><td>Purchase taxable</td><td class="text-end">₹${this.formatCurrency(grand.purchase.taxableValue)}</td></tr>
                            <tr><td>Input tax credit (ITC)</td><td class="text-end">₹${this.formatCurrency(grand.purchase.itcTotal)}</td></tr>
                            <tr><td>Purchase grand total</td><td class="text-end">₹${this.formatCurrency(grand.purchase.grandTotal)}</td></tr>
                            <tr class="gtes-gst-row-payable"><td><strong>Net tax payable</strong></td><td class="text-end"><strong>₹${this.formatCurrency(grand.netTaxPayable)}</strong></td></tr>
                        </tbody>
                    </table>
                    <p class="small gtes-gst-small mt-3 mb-0">Use toolbar <strong>Excel</strong> for full CSV (HSN lines + B2B) or <strong>PDF</strong> for summary.</p>
                </div>
            </div>
        `;
    },

    /**
     * Render Customer Ledger section
     */
    renderCustomerLedger() {
        this.currentSection = 'ledger';
        this.setActiveTab();
        const container = document.getElementById('analyticsContainer');
        if (!container) return;

        const outstanding = BusinessAnalytics.getOutstandingBalances();
        const fy = (typeof DataManager !== 'undefined' && DataManager.getFinancialYear)
            ? DataManager.getFinancialYear(new Date(), true)
            : { startYear: new Date().getFullYear() - 1, endYear: new Date().getFullYear() };
        const defaultStart = `${fy.startYear}-04-01`;
        const defaultEnd = new Date().toISOString().slice(0, 10);

        container.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-md-4">
                    <div class="card glass-panel border-0">
                        <div class="card-header bg-transparent border-secondary">
                            <h6 class="mb-0"><i class="bi bi-people me-2"></i>Account Ledger</h6>
                        </div>
                        <div class="card-body">
                            <label class="form-label small text-muted mb-1">Account group</label>
                            <select class="form-select bg-dark text-white border-secondary mb-2" id="ledgerAccountGroup"
                                onchange="AnalyticsUI.populateLedgerAccountSelect()">
                                <option value="customer">Customer (receivables)</option>
                                <option value="vendor">Vendor / Supplier (payables)</option>
                            </select>
                            <label class="form-label small text-muted mb-1">Account</label>
                            <select class="form-select bg-dark text-white border-secondary mb-2" id="ledgerCustomer">
                                <option value="">-- Select account --</option>
                            </select>
                            <div class="row g-2 mb-2">
                                <div class="col-6">
                                    <label class="form-label small text-muted mb-0">Start date</label>
                                    <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="ledgerStartDate" value="${defaultStart}">
                                </div>
                                <div class="col-6">
                                    <label class="form-label small text-muted mb-0">End date</label>
                                    <input type="date" class="form-control form-control-sm bg-dark text-white border-secondary" id="ledgerEndDate" value="${defaultEnd}">
                                </div>
                            </div>
                            <button class="btn btn-primary w-100" onclick="AnalyticsUI.loadCustomerLedger()">
                                <i class="bi bi-search"></i> View Ledger
                            </button>
                            <p class="small text-muted mt-2 mb-0">Vendors need <strong>Account type = Supplier</strong> in Customers.</p>
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
                                    style="cursor: pointer;" onclick="document.getElementById('ledgerAccountGroup').value='customer'; AnalyticsUI.populateLedgerAccountSelect(); document.getElementById('ledgerCustomer').value='${c.customerId}'; AnalyticsUI.loadCustomerLedger();">
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
                            <h6 class="mb-0"><i class="bi bi-journal-text me-2"></i>Ledger</h6>
                        </div>
                        <div class="card-body" id="ledgerContent">
                            <div class="text-center text-muted py-5">
                                <i class="bi bi-journal-text fs-1"></i>
                                <p class="mt-2">Select account, dates, and click View Ledger</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        this.populateLedgerAccountSelect();
    },

    populateLedgerAccountSelect() {
        const gEl = document.getElementById('ledgerAccountGroup');
        const sel = document.getElementById('ledgerCustomer');
        if (!gEl || !sel || typeof CustomerManager === 'undefined') return;
        const g = gEl.value || 'customer';
        const customers = CustomerManager.getAllCustomers();
        const list = g === 'vendor'
            ? customers.filter(c => (c.accountType || '').toLowerCase() === 'supplier')
            : customers.filter(c => (c.accountType || '').toLowerCase() !== 'supplier');
        const prev = (sel.value || '').toString();
        const keyOf = (c) => ((c.id != null && c.id !== '') ? String(c.id) : String(c.name || '').trim());
        sel.innerHTML = '<option value="">-- Select account --</option>' +
            list.map(c => `<option value="${keyOf(c)}">${(c.name || '').replace(/</g, '&lt;')}</option>`).join('');
        if (prev && list.some(c => keyOf(c) === prev)) sel.value = prev;
    },

    getLedgerExportOptions() {
        return {
            accountGroup: document.getElementById('ledgerAccountGroup')?.value || 'customer',
            startDate: document.getElementById('ledgerStartDate')?.value || undefined,
            endDate: document.getElementById('ledgerEndDate')?.value || undefined
        };
    },

    exportLedgerCsv() {
        const id = document.getElementById('ledgerCustomer')?.value;
        if (!id) {
            if (typeof App !== 'undefined') App.showNotification('Select an account first', 'warning');
            return;
        }
        BusinessAnalytics.exportLedgerToCSV(id, this.getLedgerExportOptions());
    },

    _escapeLedgerHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    _ledgerPdfDate(d) {
        const s = BusinessAnalytics._ledgerNormalizeDate(d);
        if (!s) return '-';
        const [y, m, day] = s.split('-');
        return `${day}-${m}-${y}`;
    },

    _openingBalanceColumns(ledger) {
        const ob = ledger.openingBalance;
        let oDr = 0;
        let oCr = 0;
        if (ledger.accountGroup === 'customer') {
            if (ob >= 0) oDr = ob;
            else oCr = -ob;
        } else {
            if (ob >= 0) oCr = ob;
            else oDr = -ob;
        }
        return { oDr, oCr };
    },

    buildLedgerPdfElement(ledger) {
        const pdfW = (typeof DeliveryUI !== 'undefined' && DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX) || 760;
        const settings = DataManager.getData('gtes_settings') || DataManager.getData('settings') || {};
        const cp = DataManager.COMPANY_PROFILE || {};
        const coName = settings.companyName || cp.name || 'Company';
        const coAddr = settings.registeredAddress || cp.registeredAddress || '';
        const coWork = settings.workAddress || cp.workAddress || '';
        const emails = [settings.email, ...(Array.isArray(cp.emails) ? cp.emails : [])].filter(Boolean);
        const phones = [settings.phone, ...(Array.isArray(cp.phones) ? cp.phones : [])].filter(Boolean);
        const gstin = settings.gstin || cp.gstin || '';
        const pan = settings.pan || cp.pan || '';

        const dr = ledger.dateRange.start && ledger.dateRange.end
            ? `${this._ledgerPdfDate(ledger.dateRange.start)} to ${this._ledgerPdfDate(ledger.dateRange.end)}`
            : (ledger.dateRange.start || ledger.dateRange.end
                ? `${this._ledgerPdfDate(ledger.dateRange.start || '')} — ${this._ledgerPdfDate(ledger.dateRange.end || '')}`
                : 'All dates');

        const showOpening = Boolean(ledger.dateRange.start);
        const { oDr, oCr } = this._openingBalanceColumns(ledger);
        const obBal = ledger.openingBalance;

        const th = 'padding:9px 6px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:9px;text-align:center;line-height:1.35;vertical-align:middle;box-sizing:border-box;';
        const td = 'padding:8px 6px;border:1px solid #cbd5e1;font-size:9px;line-height:1.35;vertical-align:middle;box-sizing:border-box;';
        const tdNum = `${td}text-align:right;`;

        let rowsHtml = '';
        if (showOpening) {
            rowsHtml += `<tr class="gtes-ledger-pdf-row" style="background:#f1f5f9;">
                <td style="${td}">—</td>
                <td style="${td}"><strong>Opening Balance</strong></td>
                <td style="${td}">—</td>
                <td style="${td}">—</td>
                <td style="${td}">—</td>
                <td style="${tdNum}">${oDr > 0 ? '₹' + this.formatCurrency(oDr) : '—'}</td>
                <td style="${tdNum}">${oCr > 0 ? '₹' + this.formatCurrency(oCr) : '—'}</td>
                <td style="${tdNum}"><strong>${this.formatLedgerSignedBalance(obBal)}</strong></td>
            </tr>`;
        }

        ledger.entries.forEach((e, idx) => {
            const bg = idx % 2 ? '#f8fafc' : '#fff';
            rowsHtml += `<tr class="gtes-ledger-pdf-row" style="background:${bg};">
                <td style="${td}">${this._ledgerPdfDate(e.date)}</td>
                <td style="${td}">${this._escapeLedgerHtml(e.particulars || e.description)}</td>
                <td style="${td}">${this._escapeLedgerHtml(e.invoiceNo || e.reference)}</td>
                <td style="${td}">${this._escapeLedgerHtml(e.refNo || '')}</td>
                <td style="${td}">${this._escapeLedgerHtml(e.vchType || e.type)}</td>
                <td style="${tdNum}">${e.debit > 0 ? '₹' + this.formatCurrency(e.debit) : '—'}</td>
                <td style="${tdNum}">${e.credit > 0 ? '₹' + this.formatCurrency(e.credit) : '—'}</td>
                <td style="${tdNum}">${this.formatLedgerSignedBalance(e.balance)}</td>
            </tr>`;
        });

        const wrap = document.createElement('div');
        wrap.className = 'gtes-pdf-document gtes-ledger-pdf';
        wrap.style.cssText = `width:${pdfW}px;padding:14px;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;`;
        wrap.innerHTML = `
            <style>
                .gtes-ledger-pdf table.gtes-ledger-main { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:14px; }
                .gtes-ledger-pdf thead { display:table-header-group; }
                .gtes-ledger-pdf .gtes-ledger-pdf-row { page-break-inside:avoid; break-inside:avoid; }
            </style>
            <div style="text-align:center;margin-bottom:12px;">
                <div style="font-size:16px;font-weight:800;text-transform:uppercase;">${this._escapeLedgerHtml(coName)}</div>
                <div style="font-size:9px;line-height:1.4;margin-top:4px;">${this._escapeLedgerHtml(coAddr)}${coWork ? '<br>' + this._escapeLedgerHtml(coWork) : ''}</div>
                <div style="font-size:9px;">${emails.length ? 'Email: ' + this._escapeLedgerHtml(emails.join(', ')) : ''}${phones.length ? ' | Ph: ' + this._escapeLedgerHtml(phones.join(', ')) : ''}</div>
                <div style="font-size:9px;font-weight:bold;">${gstin ? 'GSTIN: ' + this._escapeLedgerHtml(gstin) : ''}${gstin && pan ? ' | ' : ''}${pan ? 'PAN: ' + this._escapeLedgerHtml(pan) : ''}</div>
            </div>
            <div style="text-align:center;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px;">
                <div style="font-size:13px;font-weight:800;">${this._escapeLedgerHtml(ledger.customer.name)} A/C</div>
                <div style="font-size:10px;">Group: <strong>${this._escapeLedgerHtml(ledger.groupLabel)}</strong></div>
                <div style="font-size:9px;margin-top:4px;">${this._escapeLedgerHtml(ledger.customer.address || '')}</div>
                <div style="font-size:9px;">${ledger.customer.gstin ? 'GSTIN: ' + this._escapeLedgerHtml(ledger.customer.gstin) : ''}</div>
                <div style="font-size:10px;margin-top:6px;"><strong>Period:</strong> ${this._escapeLedgerHtml(dr)}</div>
            </div>
            <table class="gtes-ledger-main">
                <colgroup>
                    <col style="width:9%;" />
                    <col style="width:26%;" />
                    <col style="width:10%;" />
                    <col style="width:10%;" />
                    <col style="width:11%;" />
                    <col style="width:11%;" />
                    <col style="width:11%;" />
                    <col style="width:12%;" />
                </colgroup>
                <thead>
                    <tr>
                        <th style="${th}">DATE</th>
                        <th style="${th}">PARTICULARS</th>
                        <th style="${th}">VCH NO</th>
                        <th style="${th}">REF NO</th>
                        <th style="${th}">VCH TYPE</th>
                        <th style="${th}">DEBIT</th>
                        <th style="${th}">CREDIT</th>
                        <th style="${th}">RUNNING BALANCE</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10px;">
                <tr>
                    <td style="padding:6px;border:1px solid #000;"><strong>Period totals</strong></td>
                    <td style="padding:6px;border:1px solid #000;text-align:right;">Debit ₹${this.formatCurrency(ledger.summary.totalDebit)}</td>
                    <td style="padding:6px;border:1px solid #000;text-align:right;">Credit ₹${this.formatCurrency(ledger.summary.totalCredit)}</td>
                    <td style="padding:6px;border:1px solid #000;text-align:right;"><strong>Closing ${this.formatLedgerSignedBalance(ledger.summary.balance)}</strong></td>
                </tr>
            </table>
            <div style="margin-top:24px;font-size:9px;text-align:right;">
                <div>For <strong>${this._escapeLedgerHtml(coName)}</strong></div>
                <div style="margin-top:28px;border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:160px;">Authorized Signatory</div>
            </div>
            <div style="margin-top:16px;text-align:center;font-size:8px;color:#64748b;">Computer-generated statement. Signature not required.</div>
        `;
        return wrap;
    },

    async exportLedgerPdf() {
        const id = document.getElementById('ledgerCustomer')?.value;
        if (!id) {
            if (typeof App !== 'undefined') App.showNotification('Select an account first', 'warning');
            return;
        }
        const opts = this.getLedgerExportOptions();
        const ledger = BusinessAnalytics.getAccountLedger(id, opts);
        if (!ledger) {
            if (typeof App !== 'undefined') App.showNotification('Ledger not found', 'error');
            return;
        }
        if (typeof html2pdf === 'undefined' || typeof DeliveryUI === 'undefined') {
            if (typeof App !== 'undefined') App.showNotification('PDF library not loaded', 'error');
            return;
        }

        const acc = ledger.customer.name.replace(/\s+/g, '_').replace(/[^\w.-]/g, '').slice(0, 40);
        const filename = `Ledger_${ledger.accountGroup}_${acc}.pdf`;
        const el = this.buildLedgerPdfElement(ledger);
        const ledgerScale = Math.min(
            Number(DeliveryUI.GTES_HTML2PDF_CANVAS_SCALE) || 1.28,
            Number(DeliveryUI.GTES_LEDGER_HTML2PDF_SCALE) || 1.12
        );
        const opt = DeliveryUI.buildGtesHtml2PdfOptions({
            filename,
            html2canvas: { scale: ledgerScale }
        });

        const { host, clone } = DeliveryUI.beginPdfClone(el, DeliveryUI.GTES_PDF_DOCUMENT_WIDTH_PX);
        try {
            await DeliveryUI.waitPdfImages(clone);
            const blob = await html2pdf().set(opt).from(clone).output('blob');
            await DeliveryUI.finishPdfDownload(blob, filename, 'Ledgers');
        } catch (e) {
            console.error(e);
            if (typeof App !== 'undefined') App.showNotification('PDF export failed', 'error');
        } finally {
            DeliveryUI.endPdfClone(host);
        }
    },

    /**
     * Load customer / vendor ledger (filtered)
     */
    loadCustomerLedger() {
        const customerId = document.getElementById('ledgerCustomer').value;
        if (!customerId) return;

        let ledger = null;
        try {
            const opts = this.getLedgerExportOptions();
            ledger = BusinessAnalytics.getAccountLedger(customerId, opts);
        } catch (e) {
            console.error('Ledger load error:', e);
        }
        if (!ledger) {
            if (typeof App !== 'undefined') App.showNotification('Unable to load ledger for selected account', 'error');
            return;
        }

        const periodLine = ledger.dateRange.start && ledger.dateRange.end
            ? `${this.formatDate(ledger.dateRange.start)} → ${this.formatDate(ledger.dateRange.end)}`
            : 'All dates';

        const balLabel = ledger.accountGroup === 'vendor'
            ? (ledger.summary.balance > 0 ? 'Payable' : 'Advance / Paid ahead')
            : (ledger.summary.balance > 0 ? 'Due' : 'Credit');

        const content = document.getElementById('ledgerContent');
        content.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                    <h5 class="mb-1">${ledger.customer.name}</h5>
                    <p class="text-muted small mb-1">${ledger.groupLabel} · ${ledger.accountGroup === 'vendor' ? 'Vendor' : 'Customer'}</p>
                    <p class="text-muted mb-0 small">${periodLine}</p>
                    <p class="text-muted mb-0">
                        ${ledger.customer.phone ? `<i class="bi bi-phone me-1"></i>${ledger.customer.phone}` : ''}
                        ${ledger.customer.gstin ? `<br><i class="bi bi-building me-1"></i>GSTIN: ${ledger.customer.gstin}` : ''}
                    </p>
                </div>
                <div class="text-end">
                    <p class="mb-1 small text-muted">Closing balance</p>
                    <h4 class="mb-0 ${ledger.summary.balance !== 0 ? 'text-warning' : 'text-success'}">
                        ${this.formatLedgerSignedBalance(ledger.summary.balance)}
                        <small class="text-muted">${balLabel}</small>
                    </h4>
                </div>
            </div>

            <div class="btn-group btn-group-sm flex-wrap mb-3 gap-1">
                <button class="btn btn-outline-primary" onclick="AnalyticsUI.exportLedgerCsv()">
                    <i class="bi bi-download"></i> Export CSV
                </button>
                <button class="btn btn-outline-danger" onclick="AnalyticsUI.exportLedgerPdf()">
                    <i class="bi bi-file-pdf"></i> Export PDF
                </button>
                <button class="btn btn-outline-success" onclick="AnalyticsUI.sendStatementViaWhatsApp()">
                    <i class="bi bi-whatsapp"></i> Send Statement
                </button>
            </div>

            <div class="table-responsive">
                <table class="table table-dark table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Particulars</th>
                            <th>Vch No</th>
                            <th>Ref No</th>
                            <th>Vch type</th>
                            <th class="text-end">Debit</th>
                            <th class="text-end">Credit</th>
                            <th class="text-end">Balance</th>
                            <th class="text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ledger.dateRange.start ? (() => {
            const { oDr, oCr } = this._openingBalanceColumns(ledger);
            return `<tr class="table-secondary">
                                <td>—</td>
                                <td colspan="3"><strong>Opening balance</strong></td>
                                <td>—</td>
                                <td class="text-end">${oDr > 0 ? '₹' + this.formatCurrency(oDr) : '—'}</td>
                                <td class="text-end">${oCr > 0 ? '₹' + this.formatCurrency(oCr) : '—'}</td>
                                <td class="text-end fw-bold">${this.formatLedgerSignedBalance(ledger.openingBalance)}</td>
                                <td></td>
                            </tr>`;
        })() : ''}
                        ${ledger.entries.map(e => {
            let viewAction = '';
            if (e.type === 'Invoice' || e.type === 'Credit Note') viewAction = `InvoicesUI.previewInvoice('${e.reference}')`;
            else if (e.type === 'Receipt' || e.type === 'Payment') viewAction = `VouchersUI.previewVoucher('${e.reference}')`;
            else if ((e.type || '').includes('Challan')) viewAction = `DeliveryUI.viewChallan('${e.reference}')`;
            else if (e.type === 'Purchase' || e.type === 'Debit Note') viewAction = `InvoicesUI.previewPurchase('${e.reference}')`;

            const badge = e.type === 'Receipt' ? 'success' : (e.type === 'Payment' ? 'primary' : (e.type === 'Purchase' ? 'warning' : (e.type === 'Credit Note' ? 'secondary' : (e.type === 'Debit Note' ? 'secondary' : 'info'))));

            return `
                            <tr>
                                <td>${this.formatDate(e.date)}</td>
                                <td>${e.particulars || e.description}</td>
                                <td>${e.invoiceNo || e.reference}</td>
                                <td>${e.refNo || '—'}</td>
                                <td><span class="badge bg-${badge} text-nowrap">${e.vchType || e.type}</span></td>
                                <td class="text-end ${e.debit > 0 ? 'text-danger' : ''}">
                                    ${e.debit > 0 ? '₹' + this.formatCurrency(e.debit) : '—'}
                                </td>
                                <td class="text-end ${e.credit > 0 ? 'text-success' : ''}">
                                    ${e.credit > 0 ? '₹' + this.formatCurrency(e.credit) : '—'}
                                </td>
                                <td class="text-end fw-bold">${this.formatLedgerSignedBalance(e.balance)}</td>
                                <td class="text-center">
                                    ${viewAction ? `
                                        <button class="btn btn-sm btn-outline-info" onclick="${viewAction}" title="View">
                                            <i class="bi bi-eye"></i>
                                        </button>
                                    ` : '—'}
                                </td>
                            </tr>
                            `;
        }).join('')}
                    </tbody>
                    <tfoot class="table-secondary">
                        <tr>
                            <td colspan="5"><strong>Period totals</strong></td>
                            <td class="text-end text-danger"><strong>₹${this.formatCurrency(ledger.summary.totalDebit)}</strong></td>
                            <td class="text-end text-success"><strong>₹${this.formatCurrency(ledger.summary.totalCredit)}</strong></td>
                            <td class="text-end fw-bold"><strong>${this.formatLedgerSignedBalance(ledger.summary.balance)}</strong></td>
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
        this.currentSection = 'stock';
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
        this.currentSection = 'reminders';
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

    /** Ledger running/closing balance: show sign (negative = customer advance / vendor advance per Book Keeper). */
    formatLedgerSignedBalance(balance) {
        const n = parseFloat(balance);
        if (isNaN(n) || n === 0) return '₹0';
        const sign = n < 0 ? '-' : '';
        return `${sign}₹${this.formatCurrency(Math.abs(n))}`;
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    /**
     * GST month picker + FY dropdown store FY start year; map to calendar year for invoice dates.
     */
    _getGstReportSelection() {
        const month = parseInt(document.getElementById('gstMonth')?.value, 10);
        const fyStart = parseInt(document.getElementById('gstYear')?.value, 10);
        if (Number.isNaN(month) || Number.isNaN(fyStart)) return null;
        const calendarYear = typeof DataManager.calendarYearForIndianFYMonth === 'function'
            ? DataManager.calendarYearForIndianFYMonth(fyStart, month)
            : (month >= 3 ? fyStart : fyStart + 1);
        return { month, fyStart, calendarYear };
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

    sendStatementViaWhatsApp() {
        const customerId = document.getElementById('ledgerCustomer')?.value;
        if (!customerId) {
            if (typeof App !== 'undefined') App.showNotification('Select an account and view ledger first', 'warning');
            return;
        }
        const ledger = BusinessAnalytics.getAccountLedger(customerId, this.getLedgerExportOptions());
        if (!ledger) return;

        const settings = DataManager.getData('gtes_settings') || DataManager.getData('settings') || {};
        const companyName = settings.companyName || (DataManager.COMPANY_PROFILE && DataManager.COMPANY_PROFILE.name) || 'Our Company';

        const period = ledger.dateRange.start && ledger.dateRange.end
            ? `${ledger.dateRange.start} to ${ledger.dateRange.end}`
            : 'All dates';

        let message = `*Account Statement*\n*${companyName}*\n\n`;
        message += `Account: ${ledger.customer.name}\n`;
        message += `Group: ${ledger.groupLabel}\n`;
        message += `Period: ${period}\n`;
        message += `Generated: ${new Date().toLocaleDateString('en-IN')}\n\n`;
        message += `Closing balance: ${this.formatLedgerSignedBalance(ledger.summary.balance)}\n`;
        message += `Period debit: ₹${this.formatCurrency(ledger.summary.totalDebit)}\n`;
        message += `Period credit: ₹${this.formatCurrency(ledger.summary.totalCredit)}\n\n`;

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
        this.currentSection = 'import';
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

