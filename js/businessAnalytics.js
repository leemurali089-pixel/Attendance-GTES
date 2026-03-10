/**
 * Business Analytics Module
 * Comprehensive business intelligence features:
 * 1. Advanced Inventory / Stock Management
 * 2. GST Reports (GSTR-1, GSTR-3B)
 * 3. Customer Ledger
 * 4. Dashboard Analytics
 * 5. Due Date Reminders
 */

const BusinessAnalytics = {

    // ========================================
    // 1. ADVANCED INVENTORY / STOCK MANAGEMENT
    // ========================================

    /**
     * Get comprehensive stock report
     */
    getStockReport() {
        const inventory = DataManager.getData('inventory') || [];
        const transactions = DataManager.getData('inventoryTransactions') || [];

        return inventory.map(item => {
            const itemTxns = transactions.filter(t => t.materialId === item.id);
            const totalIn = itemTxns.filter(t => t.type === 'in').reduce((sum, t) => sum + t.quantity, 0);
            const totalOut = itemTxns.filter(t => t.type === 'out').reduce((sum, t) => sum + t.quantity, 0);

            return {
                ...item,
                totalIn,
                totalOut,
                stockValue: item.currentStock * item.rate,
                isLowStock: item.currentStock <= item.minStock,
                lastTransaction: itemTxns.length > 0 ? itemTxns[itemTxns.length - 1] : null
            };
        });
    },

    /**
     * Get low stock alerts
     */
    getLowStockAlerts() {
        const inventory = DataManager.getData('inventory') || [];
        return inventory.filter(item => item.currentStock <= item.minStock).map(item => ({
            ...item,
            urgency: item.currentStock === 0 ? 'critical' : 'warning',
            shortfall: item.minStock - item.currentStock
        }));
    },

    /**
     * Get stock movement analysis for a date range
     */
    getStockMovement(startDate, endDate) {
        const transactions = DataManager.getData('inventoryTransactions') || [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        return transactions.filter(t => {
            const txnDate = new Date(t.date);
            return txnDate >= start && txnDate <= end;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    /**
     * Get fast-moving items (most used in last 30 days)
     */
    getFastMovingItems(days = 30) {
        const transactions = DataManager.getData('inventoryTransactions') || [];
        const inventory = DataManager.getData('inventory') || [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const recentTxns = transactions.filter(t =>
            new Date(t.date) >= cutoffDate && t.type === 'out'
        );

        const usageMap = {};
        recentTxns.forEach(t => {
            usageMap[t.materialId] = (usageMap[t.materialId] || 0) + t.quantity;
        });

        return Object.entries(usageMap)
            .map(([materialId, quantity]) => {
                const material = inventory.find(m => m.id === materialId);
                return {
                    materialId,
                    name: material?.name || 'Unknown',
                    quantity,
                    value: quantity * (material?.rate || 0)
                };
            })
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
    },

    /**
     * Get total inventory value
     */
    getTotalInventoryValue() {
        const inventory = DataManager.getData('inventory') || [];
        return inventory.reduce((sum, item) => sum + (item.currentStock * item.rate), 0);
    },

    // ========================================
    // 2. GST REPORTS
    // ========================================

    /**
     * Generate GSTR-1 Report (Outward Supplies)
     * @param {number} year - Financial year start
     * @param {number} month - Month (0-11)
     */
    generateGSTR1(year, month) {
        const invoices = DataManager.getData('invoices') || [];
        const challans = DataManager.getData('challans') || [];
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        // Filter invoices for the month
        const monthInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate.getFullYear() === year && invDate.getMonth() === month;
        });

        // B2B (Business to Business with GSTIN)
        const b2b = [];
        // B2C Large (> 2.5 Lakhs to consumers)
        const b2cl = [];
        // B2C Small (< 2.5 Lakhs to consumers)
        const b2cs = [];

        monthInvoices.forEach(inv => {
            const customer = customers.find(c => c.id === inv.customerId || c.name === inv.customerName);
            const gstin = customer?.gstin || inv.customerGSTIN;

            const invoiceData = {
                id: inv.id,
                invoiceNumber: inv.id,
                invoiceDate: inv.date,
                customerName: inv.customerName,
                gstin: gstin,
                taxableValue: parseFloat(inv.subtotal) || 0,
                cgst: parseFloat(inv.cgst) || 0,
                sgst: parseFloat(inv.sgst) || 0,
                igst: parseFloat(inv.igst) || 0,
                total: parseFloat(inv.total) || 0,
                placeOfSupply: customer?.state || 'Tamil Nadu'
            };

            if (gstin && gstin.length === 15) {
                b2b.push(invoiceData);
            } else if (invoiceData.total > 250000) {
                b2cl.push(invoiceData);
            } else {
                b2cs.push(invoiceData);
            }
        });

        // Aggregate B2CS by rate
        const b2csAggregated = this._aggregateB2CS(b2cs);

        // Calculate totals
        const totals = {
            totalTaxableValue: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0),
            totalCGST: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.cgst) || 0), 0),
            totalSGST: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.sgst) || 0), 0),
            totalIGST: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.igst) || 0), 0),
            totalInvoices: monthInvoices.length
        };

        totals.totalTax = totals.totalCGST + totals.totalSGST + totals.totalIGST;

        return {
            period: `${this._getMonthName(month)} ${year}`,
            b2b,
            b2cl,
            b2cs: b2csAggregated,
            totals,
            generatedAt: new Date().toISOString()
        };
    },

    /**
     * Generate GSTR-3B Summary
     * @param {number} year - Year
     * @param {number} month - Month (0-11)
     */
    generateGSTR3B(year, month) {
        const gstr1 = this.generateGSTR1(year, month);
        // Calculate Input Tax Credit (ITC) from expenses and purchases
        const allExpenses = DataManager.getData('expenses') || [];
        const monthExpenses = allExpenses.filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getFullYear() === year && expDate.getMonth() === month &&
                ((exp.category || '').toLowerCase().includes('purchase') || exp.source === 'local');
        });

        const itc = {
            cgst: monthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.cgst) || 0), 0),
            sgst: monthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.sgst) || 0), 0),
            igst: monthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.igst) || 0), 0)
        };
        itc.total = itc.cgst + itc.sgst + itc.igst;

        // Output Tax (from sales)
        const outputTax = {
            cgst: gstr1.totals.totalCGST,
            sgst: gstr1.totals.totalSGST,
            igst: gstr1.totals.totalIGST,
            total: gstr1.totals.totalTax
        };

        // Net Tax Payable
        const netPayable = {
            cgst: Math.max(0, outputTax.cgst - itc.cgst),
            sgst: Math.max(0, outputTax.sgst - itc.sgst),
            igst: Math.max(0, outputTax.igst - itc.igst)
        };
        netPayable.total = netPayable.cgst + netPayable.sgst + netPayable.igst;

        return {
            period: `${this._getMonthName(month)} ${year}`,
            outwardSupplies: {
                taxableValue: gstr1.totals.totalTaxableValue,
                integratedTax: outputTax.igst,
                centralTax: outputTax.cgst,
                stateTax: outputTax.sgst,
                cess: 0
            },
            inputTaxCredit: {
                igst: itc.igst,
                cgst: itc.cgst,
                sgst: itc.sgst,
                cess: 0
            },
            netTaxPayable: netPayable,
            generatedAt: new Date().toISOString()
        };
    },

    _aggregateB2CS(b2csList) {
        const rateGroups = {};
        b2csList.forEach(inv => {
            const rate = inv.cgst > 0 ? (inv.cgst / inv.taxableValue * 100 * 2).toFixed(0) : '0';
            if (!rateGroups[rate]) {
                rateGroups[rate] = {
                    rate: parseFloat(rate),
                    taxableValue: 0,
                    cgst: 0,
                    sgst: 0,
                    igst: 0
                };
            }
            rateGroups[rate].taxableValue += inv.taxableValue;
            rateGroups[rate].cgst += inv.cgst;
            rateGroups[rate].sgst += inv.sgst;
            rateGroups[rate].igst += inv.igst;
        });
        return Object.values(rateGroups);
    },

    _getMonthName(month) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return months[month];
    },

    // ========================================
    // 3. CUSTOMER LEDGER
    // ========================================

    /**
     * Get complete customer ledger
     * @param {string} customerId - Customer ID or name
     */
    getCustomerLedger(customerId) {
        const invoices = DataManager.getData('invoices') || [];
        const challans = DataManager.getData('challans') || [];
        const vouchers = DataManager.getData('vouchers') || [];
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        const customer = customers.find(c => c.id === customerId || c.name === customerId);
        if (!customer) return null;

        const ledgerEntries = [];

        // Add invoices (Debit - customer owes us)
        invoices
            .filter(inv => inv.customerId === customer.id || inv.customerName === customer.name)
            .forEach(inv => {
                ledgerEntries.push({
                    date: inv.date,
                    type: 'Invoice',
                    reference: inv.id,
                    description: `Invoice #${inv.id}`,
                    debit: parseFloat(inv.total) || 0,
                    credit: 0,
                    status: inv.status
                });
            });

        // Add challans (Debit)
        challans
            .filter(ch => ch.customerId === customer.id || ch.customerName === customer.name)
            .forEach(ch => {
                ledgerEntries.push({
                    date: ch.date,
                    type: ch.type === 'delivery' ? 'Delivery Challan' : 'Service Challan',
                    reference: ch.id,
                    description: `${ch.type === 'delivery' ? 'DC' : 'SC'} #${ch.id}`,
                    debit: parseFloat(ch.total) || 0,
                    credit: 0,
                    status: ch.status
                });
            });

        // Add vouchers/payments (Credit - customer paid us)
        vouchers
            .filter(v => v.customerId === customer.id || v.customerName === customer.name)
            .forEach(v => {
                ledgerEntries.push({
                    date: v.date,
                    type: 'Payment',
                    reference: v.id,
                    description: `Payment - ${v.mode || 'Cash'}`,
                    debit: 0,
                    credit: parseFloat(v.amount) || 0,
                    status: 'completed'
                });
            });

        // Sort by date
        ledgerEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate running balance
        let runningBalance = 0;
        ledgerEntries.forEach(entry => {
            runningBalance += entry.debit - entry.credit;
            entry.balance = runningBalance;
        });

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                gstin: customer.gstin,
                address: customer.address
            },
            entries: ledgerEntries,
            summary: {
                totalDebit: ledgerEntries.reduce((sum, e) => sum + e.debit, 0),
                totalCredit: ledgerEntries.reduce((sum, e) => sum + e.credit, 0),
                balance: runningBalance,
                transactionCount: ledgerEntries.length
            },
            generatedAt: new Date().toISOString()
        };
    },

    /**
     * Get all customers with outstanding balances
     */
    getOutstandingBalances() {
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        return customers.map(customer => {
            const ledger = this.getCustomerLedger(customer.id);
            return {
                customerId: customer.id,
                customerName: customer.name,
                phone: customer.phone,
                outstandingBalance: ledger ? ledger.summary.balance : 0,
                lastTransaction: ledger && ledger.entries.length > 0
                    ? ledger.entries[ledger.entries.length - 1].date
                    : null
            };
        }).filter(c => c.outstandingBalance !== 0)
            .sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    },

    // ========================================
    // 4. DASHBOARD ANALYTICS
    // ========================================

    /**
     * Get complete dashboard data
     */
    getDashboardData() {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();

        return {
            revenue: this.getRevenueMetrics(currentYear, currentMonth),
            expenses: this.getExpenseMetrics(currentYear, currentMonth),
            inventory: this.getInventoryMetrics(),
            customers: this.getCustomerMetrics(),
            cashFlow: this.getCashFlowData(currentYear),
            recentActivity: this.getRecentActivity(),
            alerts: this.getAlerts()
        };
    },

    /**
     * Get revenue metrics
     */
    getRevenueMetrics(year, month) {
        const invoices = DataManager.getData('invoices') || [];
        const challans = DataManager.getData('challans') || [];

        // Current month revenue
        const currentMonthInvoices = invoices.filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        // Previous month for comparison
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevMonthInvoices = invoices.filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        });

        const currentRevenue = currentMonthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
        const prevRevenue = prevMonthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
        const changePercent = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue * 100) : 0;

        // Pending payments
        const pendingInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'unpaid');
        const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);

        // High-level FY Revenue (YTD)
        const currentFY = DataManager.getFinancialYear(`${year}-${month + 1}-01`);
        const ytdInvoices = invoices.filter(inv => {
            return DataManager.getFinancialYear(inv.date) === currentFY;
        });
        const ytdRevenue = ytdInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);

        return {
            currentMonth: currentRevenue,
            previousMonth: prevRevenue,
            changePercent: changePercent.toFixed(1),
            trend: changePercent >= 0 ? 'up' : 'down',
            pendingAmount,
            pendingCount: pendingInvoices.length,
            ytd: ytdRevenue,
            invoiceCount: currentMonthInvoices.length
        };
    },

    /**
     * Get expense metrics
     */
    getExpenseMetrics(year, month) {
        const expenses = DataManager.getData('expenses') || [];

        const currentMonthExpenses = expenses.filter(exp => {
            const d = new Date(exp.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });

        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prevMonthExpenses = expenses.filter(exp => {
            const d = new Date(exp.date);
            return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        });

        const currentTotal = currentMonthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
        const prevTotal = prevMonthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);

        // Group by category
        const byCategory = {};
        currentMonthExpenses.forEach(exp => {
            const cat = exp.category || 'Other';
            byCategory[cat] = (byCategory[cat] || 0) + (parseFloat(exp.amount) || 0);
        });

        return {
            currentMonth: currentTotal,
            previousMonth: prevTotal,
            changePercent: prevTotal > 0 ? ((currentTotal - prevTotal) / prevTotal * 100).toFixed(1) : 0,
            byCategory,
            count: currentMonthExpenses.length
        };
    },

    /**
     * Get inventory metrics
     */
    getInventoryMetrics() {
        const inventory = DataManager.getData('inventory') || [];
        const lowStock = inventory.filter(i => i.currentStock <= i.minStock);
        const outOfStock = inventory.filter(i => i.currentStock === 0);

        return {
            totalItems: inventory.length,
            totalValue: this.getTotalInventoryValue(),
            lowStockCount: lowStock.length,
            outOfStockCount: outOfStock.length,
            lowStockItems: lowStock.slice(0, 5)
        };
    },

    /**
     * Get customer metrics
     */
    getCustomerMetrics() {
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];
        const invoices = DataManager.getData('invoices') || [];

        // Top customers by revenue
        const customerRevenue = {};
        invoices.forEach(inv => {
            const key = inv.customerName || inv.customerId;
            customerRevenue[key] = (customerRevenue[key] || 0) + (parseFloat(inv.total) || 0);
        });

        const topCustomers = Object.entries(customerRevenue)
            .map(([name, revenue]) => ({ name, revenue }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const outstanding = this.getOutstandingBalances();

        return {
            totalCustomers: customers.length,
            activeCustomers: Object.keys(customerRevenue).length,
            topCustomers,
            totalOutstanding: outstanding.reduce((sum, c) => sum + c.outstandingBalance, 0),
            customersWithDues: outstanding.length
        };
    },

    /**
     * Get monthly cash flow data for chart
     */
    getCashFlowData(year) {
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData('expenses') || [];
        const vouchers = DataManager.getData('vouchers') || [];

        const monthlyData = [];

        const fyMonths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]; // April to March

        for (const month of fyMonths) {
            const targetYear = month >= 3 ? year : year + 1;

            const monthInvoices = invoices.filter(inv => {
                const d = new Date(inv.date);
                return d.getFullYear() === targetYear && d.getMonth() === month;
            });

            const monthExpenses = expenses.filter(exp => {
                const d = new Date(exp.date);
                return d.getFullYear() === targetYear && d.getMonth() === month;
            });

            const monthPayments = vouchers.filter(v => {
                const d = new Date(v.date);
                return d.getFullYear() === targetYear && d.getMonth() === month;
            });

            const revenue = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
            const expense = monthExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
            const collected = monthPayments.reduce((sum, v) => sum + (parseFloat(v.amount) || 0), 0);

            monthlyData.push({
                month: this._getMonthName(month).substring(0, 3) + (month < 3 ? ` '${targetYear.toString().slice(-2)}` : ''),
                revenue,
                expense,
                collected,
                profit: revenue - expense
            });
        }

        return monthlyData;
    },

    /**
     * Get recent activity
     */
    getRecentActivity() {
        const invoices = DataManager.getData('invoices') || [];
        const challans = DataManager.getData('challans') || [];
        const expenses = DataManager.getData('expenses') || [];
        const vouchers = DataManager.getData('vouchers') || [];

        const activities = [];

        // Add recent invoices
        invoices.slice(-10).forEach(inv => {
            activities.push({
                type: 'invoice',
                icon: 'bi-receipt',
                color: 'success',
                title: `Invoice #${inv.id}`,
                description: `${inv.customerName} - ₹${inv.total}`,
                date: inv.date
            });
        });

        // Add recent payments
        vouchers.slice(-10).forEach(v => {
            activities.push({
                type: 'payment',
                icon: 'bi-cash',
                color: 'info',
                title: `Payment Received`,
                description: `${v.customerName} - ₹${v.amount}`,
                date: v.date
            });
        });

        // Add recent expenses
        expenses.slice(-10).forEach(exp => {
            activities.push({
                type: 'expense',
                icon: 'bi-wallet2',
                color: 'danger',
                title: `Expense`,
                description: `${exp.description || exp.category} - ₹${exp.amount}`,
                date: exp.date
            });
        });

        // Sort by date and take latest 10
        return activities
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
    },

    /**
     * Get alerts
     */
    getAlerts() {
        const alerts = [];

        // Low stock alerts
        const lowStock = this.getLowStockAlerts();
        lowStock.forEach(item => {
            alerts.push({
                type: item.urgency === 'critical' ? 'danger' : 'warning',
                icon: 'bi-box',
                title: item.currentStock === 0 ? 'Out of Stock' : 'Low Stock',
                message: `${item.name} - ${item.currentStock} ${item.unit} remaining`,
                action: 'View Inventory'
            });
        });

        // Overdue invoices
        const invoices = DataManager.getData('invoices') || [];
        const today = new Date();
        invoices.filter(inv => {
            if (inv.status !== 'pending' && inv.status !== 'unpaid') return false;
            const dueDate = new Date(inv.dueDate || inv.date);
            dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms
            return today > dueDate;
        }).slice(0, 5).forEach(inv => {
            alerts.push({
                type: 'danger',
                icon: 'bi-exclamation-triangle',
                title: 'Overdue Invoice',
                message: `Invoice #${inv.id} from ${inv.customerName} - ₹${inv.total}`,
                action: 'Send Reminder'
            });
        });

        return alerts.slice(0, 10);
    },

    // ========================================
    // 5. DUE DATE REMINDERS
    // ========================================

    /**
     * Get all due date reminders
     */
    getDueReminders() {
        const invoices = DataManager.getData('invoices') || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const reminders = {
            overdue: [],
            dueToday: [],
            dueSoon: [], // Next 7 days
            upcoming: [] // 8-30 days
        };

        invoices.filter(inv => inv.status === 'pending' || inv.status === 'unpaid').forEach(inv => {
            const invDate = new Date(inv.dueDate || inv.date);
            const dueDate = new Date(invDate);
            dueDate.setDate(dueDate.getDate() + (inv.paymentTerms || 30));
            dueDate.setHours(0, 0, 0, 0);

            const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            const reminderItem = {
                invoiceId: inv.id,
                customerId: inv.customerId,
                customerName: inv.customerName,
                amount: parseFloat(inv.total) || 0,
                invoiceDate: inv.date,
                dueDate: dueDate.toISOString().split('T')[0],
                daysUntilDue
            };

            if (daysUntilDue < 0) {
                reminderItem.daysOverdue = Math.abs(daysUntilDue);
                reminders.overdue.push(reminderItem);
            } else if (daysUntilDue === 0) {
                reminders.dueToday.push(reminderItem);
            } else if (daysUntilDue <= 7) {
                reminders.dueSoon.push(reminderItem);
            } else if (daysUntilDue <= 30) {
                reminders.upcoming.push(reminderItem);
            }
        });

        // Sort overdue by days overdue (descending)
        reminders.overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
        // Sort others by days until due (ascending)
        reminders.dueSoon.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
        reminders.upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

        return reminders;
    },

    /**
     * Send payment reminder via WhatsApp
     */
    sendPaymentReminder(invoiceId) {
        const invoices = DataManager.getData('invoices') || [];
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) return false;

        const settings = DataManager.getData('settings') || {};
        const companyName = settings.companyName || 'Our Company';

        const message = `Dear ${invoice.customerName},

This is a friendly reminder regarding Invoice #${invoice.id} dated ${invoice.date} for ₹${invoice.total}.

Please arrange for payment at your earliest convenience.

Payment can be made via UPI: ${settings.upiId || 'N/A'}

Thank you for your business!
- ${companyName}`;

        const encodedMessage = encodeURIComponent(message);
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];
        const customer = customers.find(c => c.name === invoice.customerName || c.id === invoice.customerId);
        const phone = customer?.phone?.replace(/\D/g, '') || '';

        if (phone) {
            window.open(`https://wa.me/91${phone}?text=${encodedMessage}`, '_blank');
            return true;
        } else {
            window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
            return true;
        }
    },

    // ========================================
    // EXPORT FUNCTIONS
    // ========================================

    /**
     * Export GSTR-1 to Excel-compatible format
     */
    exportGSTR1ToCSV(year, month) {
        const report = this.generateGSTR1(year, month);

        let csv = 'GSTR-1 Report - ' + report.period + '\n\n';

        // B2B Section
        csv += 'B2B Invoices (Business to Business)\n';
        csv += 'Invoice No,Date,Customer,GSTIN,Taxable Value,CGST,SGST,IGST,Total\n';
        report.b2b.forEach(inv => {
            csv += `${inv.invoiceNumber},${inv.invoiceDate},"${inv.customerName}",${inv.gstin},${inv.taxableValue},${inv.cgst},${inv.sgst},${inv.igst},${inv.total}\n`;
        });

        csv += '\n\nB2CL Invoices (Large Value to Consumers)\n';
        csv += 'Invoice No,Date,Customer,Taxable Value,CGST,SGST,IGST,Total\n';
        report.b2cl.forEach(inv => {
            csv += `${inv.invoiceNumber},${inv.invoiceDate},"${inv.customerName}",${inv.taxableValue},${inv.cgst},${inv.sgst},${inv.igst},${inv.total}\n`;
        });

        csv += '\n\nB2CS Summary (Small Value to Consumers)\n';
        csv += 'GST Rate,Taxable Value,CGST,SGST,IGST\n';
        report.b2cs.forEach(item => {
            csv += `${item.rate}%,${item.taxableValue},${item.cgst},${item.sgst},${item.igst}\n`;
        });

        csv += '\n\nTotals\n';
        csv += `Total Taxable Value,${report.totals.totalTaxableValue}\n`;
        csv += `Total CGST,${report.totals.totalCGST}\n`;
        csv += `Total SGST,${report.totals.totalSGST}\n`;
        csv += `Total IGST,${report.totals.totalIGST}\n`;
        csv += `Total Tax,${report.totals.totalTax}\n`;

        this._downloadCSV(csv, `GSTR1_${report.period.replace(' ', '_')}.csv`);
    },

    /**
     * Export Customer Ledger to CSV
     */
    exportLedgerToCSV(customerId) {
        const ledger = this.getCustomerLedger(customerId);
        if (!ledger) return;

        let csv = `Customer Ledger - ${ledger.customer.name}\n`;
        csv += `Phone: ${ledger.customer.phone || 'N/A'}\n`;
        csv += `GSTIN: ${ledger.customer.gstin || 'N/A'}\n\n`;

        csv += 'Date,Type,Reference,Description,Debit,Credit,Balance\n';
        ledger.entries.forEach(e => {
            csv += `${e.date},${e.type},${e.reference},"${e.description}",${e.debit},${e.credit},${e.balance}\n`;
        });

        csv += `\nTotal Debit,${ledger.summary.totalDebit}\n`;
        csv += `Total Credit,${ledger.summary.totalCredit}\n`;
        csv += `Balance,${ledger.summary.balance}\n`;

        this._downloadCSV(csv, `Ledger_${ledger.customer.name.replace(/\s/g, '_')}.csv`);
    },

    _downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }
};

// Expose to window
window.BusinessAnalytics = BusinessAnalytics;
