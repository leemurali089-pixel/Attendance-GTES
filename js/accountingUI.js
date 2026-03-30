/**
 * Accounting UI Module
 * Handles Trial Balance, Ledger Views, and Financial Reports
 */
const AccountingUI = {
    currentView: 'dashboard',

    init() {
        console.log('Accounting UI Initialized');
    },

    load() {
        this.renderDashboard();
    },

    renderDashboard() {
        const view = document.getElementById('accountingView');
        if (!view) return;
        
        // Ensure section is visible
        view.classList.remove('d-none');
        view.style.display = '';

        // Fetch Data for Dashboard Widgets/Recent Activity
        const invoices = DataManager.getData('invoices') || [];
        const vouchers = DataManager.getData('vouchers') || [];
        const purchases = DataManager.getData(DataManager.KEYS.EXPENSES) || [];

        // Combine and Sort Recent Transactions
        const recentTxns = [
            ...invoices.map(i => ({ ...i, type: 'invoice', displayDate: i.date })),
            ...vouchers.map(v => ({ ...v, type: 'voucher', displayDate: v.date })),
            ...purchases.map(p => ({ ...p, type: 'purchase', displayDate: p.date }))
        ].sort((a, b) => new Date(b.displayDate) - new Date(a.displayDate)).slice(0, 10);

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-bank text-primary me-2"></i> Accounting</h2>
                    <div class="d-flex gap-2">
                        <div class="text-center">
                            <button class="btn btn-outline-info btn-sm w-100" onclick="BookKeeperSync.initiateNativeSync()">
                                <i class="bi bi-arrow-repeat"></i> Sync with Book Keeper
                            </button>
                            <div id="lastBKSyncLabel" class="text-muted mt-1" style="font-size: 0.65rem; min-height: 12px;"></div>
                        </div>
                        <button class="btn btn-outline-warning btn-sm" onclick="AccountingUI.downloadDebugInfo()">
                            <i class="bi bi-bug"></i> Debug Info
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="BookKeeperImport.confirmClearData()">
                            <i class="bi bi-trash"></i> Reset Data
                        </button>
                        <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                            <i class="bi bi-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
                <!-- Navigation Cards -->
                <div class="row g-4 mb-4">
                    <!-- Invoices (Consolidated) -->
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary h-100 hover-lift" onclick="App.showView('invoices')" style="cursor:pointer">
                             <div class="card-body text-center p-4">
                                <i class="bi bi-receipt text-success fs-1 mb-3"></i>
                                <h4 class="card-title">Invoices</h4>
                                <p class="text-muted small">GST & Plain Invoices</p>
                            </div>
                        </div>
                    </div>
                    <!-- Purchases -->
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary h-100 hover-lift" onclick="App.showView('purchases')" style="cursor:pointer">
                             <div class="card-body text-center p-4">
                                <i class="bi bi-cart-check text-warning fs-1 mb-3"></i>
                                <h4 class="card-title">Purchases</h4>
                                <p class="text-muted small">Purchase Bills</p>
                            </div>
                        </div>
                    </div>
                    <!-- Vouchers (Consolidated) -->
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary h-100 hover-lift" onclick="App.showView('vouchers')" style="cursor:pointer">
                             <div class="card-body text-center p-4">
                                <i class="bi bi-cash-stack text-info fs-1 mb-3"></i>
                                <h4 class="card-title">Vouchers</h4>
                                <p class="text-muted small">GST, Plain & Purchase Vouchers</p>
                            </div>
                        </div>
                    </div>
                    <!-- Challans -->
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary h-100 hover-lift" onclick="App.showView('challans')" style="cursor:pointer">
                             <div class="card-body text-center p-4">
                                <i class="bi bi-truck text-primary fs-1 mb-3"></i>
                                <h4 class="card-title">Challans</h4>
                                <p class="text-muted small">DC & SC History</p>
                            </div>
                        </div>
                    </div>
                    <!-- Trial Balance/Reports -->
                    <div class="col-md-4">
                        <div class="card bg-dark border-secondary h-100 hover-lift" onclick="AccountingUI.showTrialBalance()" style="cursor:pointer">
                             <div class="card-body text-center p-4">
                                <i class="bi bi-calculator text-danger fs-1 mb-3"></i>
                                <h4 class="card-title">Reports</h4>
                                <p class="text-muted small">Trial Balance</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Transactions -->
                <div class="card bg-dark border-secondary">
                    <div class="card-header border-secondary d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Recent Transactions</h5>
                        <button class="btn btn-sm btn-outline-info" onclick="App.showView('vouchers')">View All</button>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-dark table-hover align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Ref #</th>
                                    <th>Type</th>
                                    <th>Party</th>
                                    <th class="text-end">Amount</th>
                                    <th class="text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recentTxns.length > 0 ? recentTxns.map(tx => {
            const isInv = tx.type === 'invoice';
            const isPur = tx.type === 'purchase';
            const id = tx.id;
            const ref = isInv ? tx.invoiceNo : (isPur ? tx.billNo : tx.id);
            const party = isInv ? tx.customerName : (isPur ? tx.vendor : (tx.customerName || tx.customerId));
            const badgeClass = isInv ? 'bg-primary' : (isPur ? 'bg-warning text-dark' : (tx.type === 'receipt' ? 'bg-success' : 'bg-danger'));
            const typeLabel = (isInv ? 'Invoice' : (isPur ? 'Purchase' : (tx.type || 'Voucher'))).toUpperCase();
            const amount = parseFloat(tx.total || tx.amount || 0).toFixed(2);
            const viewFunc = isInv ? `InvoicesUI.previewInvoice` : (isPur ? `InvoicesUI.previewPurchase` : `VouchersUI.previewVoucher`);

            return `
                                    <tr>
                                        <td>${tx.displayDate}</td>
                                        <td><span class="text-info">${ref}</span></td>
                                        <td><span class="badge ${badgeClass}">${typeLabel}</span></td>
                                        <td>${party || 'Unknown'}</td>
                                        <td class="text-end">₹${amount}</td>
                                        <td class="text-end">
                                            <button class="btn btn-sm btn-link text-white" onclick="${viewFunc}('${id}')" title="View PDF">
                                                <i class="bi bi-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                    `;
        }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No recent transactions found.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Update last sync label
        this.updateLastSyncLabel();
    },

    updateLastSyncLabel() {
        const label = document.getElementById('lastBKSyncLabel');
        if (!label) return;

        if (window.BookKeeperSync && window.BookKeeperSync.config.lastSyncDetails) {
            const d = new Date(window.BookKeeperSync.config.lastSyncDetails.time);
            label.textContent = `Last Sync: ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            label.textContent = 'Never Synced';
        }
    },

    /**
     * Download Debug Info for Support
     */
    async downloadDebugInfo() {
        try {
            const data = await DataManager.getData('gtes_debug_import_schema');
            if (!data) {
                alert('No debug data found! Please run "Sync with Book Keeper" first.');
                return;
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gtes_debug_import_schema.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download debug info: ' + error.message);
        }
    },

    /**
     * Show Trial Balance
     */
    async showTrialBalance() {
        const view = document.getElementById('accountingView');
        if (!view) return;

        view.innerHTML = `
            <div class="container-fluid">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h2><i class="bi bi-bank text-primary me-2"></i> Trial Balance</h2>
                    <button class="btn btn-outline-light btn-sm" onclick="App.showLandingPage()">
                        <i class="bi bi-arrow-left"></i> Back
                    </button>
                </div>
                <div class="card bg-dark text-white border-secondary">
                    <div class="card-body">
                        <h5 class="card-title text-center text-muted">Generating Report...</h5>
                        <div class="d-flex justify-content-center mt-4">
                            <div class="spinner-border text-primary" role="status"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        App.showView('accounting');

        // Logic to calculate TB
        // Get all vouchers
        const vouchers = DataManager.getData('vouchers') || [];
        // Calculate balances...

        // Mock render
        setTimeout(() => {
            const tableHtml = this.generateTrialBalanceTable(vouchers);
            view.querySelector('.card-body').innerHTML = tableHtml;
        }, 500);
    },

    generateTrialBalanceTable(vouchers) {
        const invoices = DataManager.getData(DataManager.KEYS.INVOICES) || [];
        const expenses = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
        const allVouchers = vouchers || DataManager.getData(DataManager.KEYS.VOUCHERS) || [];

        const ledger = {};

        const updateLedger = (account, type, amount) => {
            if (!account) return;
            if (!ledger[account]) ledger[account] = { debit: 0, credit: 0 };
            ledger[account][type] += amount;
        };

        // 1. Process Vouchers (Receipt/Payment/Contra/Journal)
        vouchers.forEach(v => {
            // Book Keeper vouchers usually have a debit account and a credit account
            // But our imported voucher object (from bookKeeperImport) is simplified:
            // { type: 'receipt', customerName: '...', amount: ... }
            // We need to check if we captured the full double entry.
            // bookKeeperImport.js lines 300+ tries to find "customerName".
            // It loses the "Cash/Bank" side info mostly. 
            // FIXME: bookKeeperImport needs to capture BOTH accounts to be useful for TB.
            // For now, we assume:
            // Receipt: Debit 'Cash/Bank', Credit 'Customer'
            // Payment: Debit 'Customer/Vendor', Credit 'Cash/Bank'

            const amount = parseFloat(v.amount) || 0;
            const mode = v.mode || 'Cash';
            const party = v.customerName || 'Suspense';

            if (v.type === 'receipt') {
                updateLedger(mode, 'debit', amount);
                updateLedger(party, 'credit', amount);
            } else if (v.type === 'payment') {
                updateLedger(party, 'debit', amount);
                updateLedger(mode, 'credit', amount);
            }
        });

        // 2. Process Sales (Invoices)
        // Entry: Debit Customer, Credit Sales, Credit Tax
        invoices.forEach(inv => {
            const amount = parseFloat(inv.total) || 0;
            const subtotal = parseFloat(inv.subtotal) || 0;
            const tax = amount - subtotal;
            const customer = inv.customerName || 'Cash Sales';

            updateLedger(customer, 'debit', amount);
            updateLedger('Sales Account', 'credit', subtotal);
            if (tax > 0) {
                updateLedger('Duties & Taxes', 'credit', tax);
            }
        });

        // 3. Process Purchases (Expenses)
        // Entry: Debit Purchase, Debit Tax, Credit Vendor
        // Expenses array in DataManager.KEYS.EXPENSES ('gtes_expenses')
        const allExpenses = DataManager.getData('gtes_expenses') || [];
        allExpenses.forEach(exp => {
            const amount = parseFloat(exp.amount) || 0;
            // Simplified: we assume amount is total. 
            // We need breakdown if available. 
            // expense object has cgst, sgst...
            const tax = (parseFloat(exp.cgst) || 0) + (parseFloat(exp.sgst) || 0) + (parseFloat(exp.igst) || 0);
            const base = amount - tax;
            const vendor = exp.vendor || 'Cash Purchase';

            updateLedger('Purchase Account', 'debit', base);
            if (tax > 0) {
                updateLedger('Duties & Taxes', 'debit', tax);
            }
            updateLedger(vendor, 'credit', amount);
        });

        // Transform to Array and Sort
        const rows = Object.keys(ledger).map(acc => {
            const dr = ledger[acc].debit;
            const cr = ledger[acc].credit;
            return { name: acc, debit: dr, credit: cr };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
        const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);

        return `
            <div class="table-responsive">
                <table class="table table-dark table-hover table-bordered">
                    <thead>
                        <tr>
                            <th>Account Name</th>
                            <th class="text-end">Debit</th>
                            <th class="text-end">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `
                            <tr>
                                <td>${row.name}</td>
                                <td class="text-end">${row.debit ? row.debit.toFixed(2) : '-'}</td>
                                <td class="text-end">${row.credit ? row.credit.toFixed(2) : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="fw-bold">
                         <tr>
                            <td>Total</td>
                            <td class="text-end">${totalDebit.toFixed(2)}</td>
                            <td class="text-end">${totalCredit.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }
};

window.AccountingUI = AccountingUI;
