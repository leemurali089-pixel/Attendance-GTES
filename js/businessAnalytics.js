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

    _getAllExpenseRecords() {
        const K = (typeof DataManager !== 'undefined' && DataManager.KEYS) ? DataManager.KEYS.EXPENSES : 'purchases';
        return DataManager.getData(K) || DataManager.getData('gtes_expenses') || DataManager.getData('expenses') || [];
    },

    _invoiceOutputTax(inv) {
        const cgst = parseFloat(inv.cgst) || parseFloat(inv.gst?.cgst) || 0;
        const sgst = parseFloat(inv.sgst) || parseFloat(inv.gst?.sgst) || 0;
        const igst = parseFloat(inv.igst) || parseFloat(inv.gst?.igst) || 0;
        return { cgst, sgst, igst };
    },

    _expenseTaxParts(exp) {
        const cgst = parseFloat(exp.cgst) || parseFloat(exp.gst?.cgst) || 0;
        const sgst = parseFloat(exp.sgst) || parseFloat(exp.gst?.sgst) || 0;
        const igst = parseFloat(exp.igst) || parseFloat(exp.gst?.igst) || 0;
        return { cgst, sgst, igst };
    },

    /** Purchases / ITC: BookKeeper uses key "purchases"; include common purchase categories and GST-bearing vendor bills. */
    _isPurchaseExpenseForItc(exp) {
        if (!exp) return false;
        const cat = (exp.category || '').toLowerCase();
        if (cat.includes('purchase') || cat.includes('inward') || cat.includes('supplier')) return true;
        if (exp.source === 'local') return true;
        const src = (exp.source || '').toLowerCase();
        if (src === 'bookkeeper' || src === 'csv_import') {
            if (exp.vendor || exp.vendorName) return true;
            if (Array.isArray(exp.items) && exp.items.length > 0) return true;
        }
        const t = this._expenseTaxParts(exp);
        const taxSum = t.cgst + t.sgst + t.igst;
        if (taxSum > 0 && (exp.vendor || exp.vendorName)) return true;
        return false;
    },

    _normalizeYmd(d) {
        if (d == null || d === '') return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        const x = new Date(d);
        return isNaN(x.getTime()) ? '' : x.toISOString().slice(0, 10);
    },

    _inYmdRange(ymd, startYmd, endYmd) {
        if (!ymd) return false;
        if (startYmd && ymd < startYmd) return false;
        if (endYmd && ymd > endYmd) return false;
        return true;
    },

    /**
     * Generate GSTR-1 Report (Outward Supplies) — **GST / tax-invoice sales only** (excludes plain invoices).
     * @param {number} year - Calendar year (e.g. March of FY 2025–26 → 2026)
     * @param {number} month - Month (0-11)
     */
    generateGSTR1(year, month) {
        const invoices = DataManager.getData('invoices') || [];
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        const monthInvoices = invoices.filter(inv => {
            const invDate = new Date(inv.date);
            return invDate.getFullYear() === year && invDate.getMonth() === month;
        }).filter(inv => this._isGstSalesInvoice(inv));

        const b2b = [];
        const b2cl = [];
        const b2cs = [];

        monthInvoices.forEach(inv => {
            const customer = customers.find(c => c.id === inv.customerId || c.name === inv.customerName);
            const gstin = customer?.gstin || inv.customerGSTIN;
            const tax = this._invoiceOutputTax(inv);

            const invoiceData = {
                id: inv.id,
                invoiceNumber: inv.invoiceNo || inv.id,
                invoiceDate: inv.date,
                customerName: inv.customerName,
                gstin: gstin,
                taxableValue: parseFloat(inv.subtotal) || 0,
                cgst: tax.cgst,
                sgst: tax.sgst,
                igst: tax.igst,
                total: parseFloat(inv.total) || 0,
                placeOfSupply: customer?.state || 'Tamil Nadu'
            };

            if (gstin && String(gstin).replace(/\s/g, '').length === 15) {
                b2b.push(invoiceData);
            } else if (invoiceData.total > 250000) {
                b2cl.push(invoiceData);
            } else {
                b2cs.push(invoiceData);
            }
        });

        const b2csAggregated = this._aggregateB2CS(b2cs);

        const totals = {
            totalTaxableValue: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.subtotal) || 0), 0),
            totalCGST: monthInvoices.reduce((sum, inv) => sum + this._invoiceOutputTax(inv).cgst, 0),
            totalSGST: monthInvoices.reduce((sum, inv) => sum + this._invoiceOutputTax(inv).sgst, 0),
            totalIGST: monthInvoices.reduce((sum, inv) => sum + this._invoiceOutputTax(inv).igst, 0),
            totalInvoices: monthInvoices.length,
            totalSalesAmount: monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)
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

    /** Purchase-type expenses in a calendar month (ITC / purchase register). */
    _getMonthPurchaseExpenses(year, month) {
        return this._getAllExpenseRecords().filter(exp => {
            const expDate = new Date(exp.date);
            return expDate.getFullYear() === year && expDate.getMonth() === month && this._isPurchaseExpenseForItc(exp);
        });
    },

    /**
     * Totals for GST month report cards (GST sales + purchase bills used for ITC).
     */
    generateMonthlySalesPurchaseSummary(year, month) {
        const gstr1 = this.generateGSTR1(year, month);
        const monthPurchases = this._getMonthPurchaseExpenses(year, month);
        const totalPurchase = monthPurchases.reduce((sum, e) =>
            sum + (parseFloat(e.amount) || parseFloat(e.totalAmount) || 0), 0);
        return {
            period: `${this._getMonthName(month)} ${year}`,
            totalSales: gstr1.totals.totalSalesAmount,
            totalPurchase,
            invoiceCount: gstr1.totals.totalInvoices,
            purchaseBillCount: monthPurchases.length
        };
    },

    /**
     * Grand summary for footer: GST invoice count, taxable, tax, sales total; purchases count, taxable, ITC, purchase total.
     */
    generateGstMonthGrandSummary(year, month) {
        const gstr1 = this.generateGSTR1(year, month);
        const gstr3b = this.generateGSTR3B(year, month);
        const purchases = this._getMonthPurchaseExpenses(year, month);
        const purchaseTaxable = purchases.reduce((s, e) => s + (parseFloat(e.subtotal) || 0), 0);
        const purchaseGrand = purchases.reduce((s, e) => s + (parseFloat(e.amount) || parseFloat(e.totalAmount) || 0), 0);
        const itcTotal = gstr3b.inputTaxCredit.cgst + gstr3b.inputTaxCredit.sgst + gstr3b.inputTaxCredit.igst;
        return {
            period: gstr1.period,
            sales: {
                gstInvoiceCount: gstr1.totals.totalInvoices,
                taxableValue: gstr1.totals.totalTaxableValue,
                totalGst: gstr1.totals.totalTax,
                grandTotal: gstr1.totals.totalSalesAmount
            },
            purchase: {
                billCount: purchases.length,
                taxableValue: purchaseTaxable,
                itcTotal,
                grandTotal: purchaseGrand
            },
            netTaxPayable: gstr3b.netTaxPayable.total
        };
    },

    _isGstSalesInvoice(inv) {
        if (!inv) return false;
        if (inv.billType === 'gst') return true;
        const t = (inv.type || '').toLowerCase();
        return t === 'with-bill' || t === 'gst-invoice' || t === 'sales-gst';
    },

    /**
     * HSN-wise outward supplies for GST invoices in the selected month.
     */
    generateHSNWiseSales(year, month) {
        const invoices = (DataManager.getData('invoices') || []).filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === year && d.getMonth() === month;
        }).filter(inv => this._isGstSalesInvoice(inv));

        const map = {};
        const bump = (hsnKey, taxable, cgst, sgst, igst, qty) => {
            const k = hsnKey || '—';
            if (!map[k]) {
                map[k] = { hsn: k, taxableValue: 0, cgst: 0, sgst: 0, igst: 0, quantity: 0 };
            }
            map[k].taxableValue += taxable;
            map[k].cgst += cgst;
            map[k].sgst += sgst;
            map[k].igst += igst;
            map[k].quantity += qty;
        };

        invoices.forEach(inv => {
            const subtotal = parseFloat(inv.subtotal) || 0;
            const cgst = parseFloat(inv.cgst) || parseFloat(inv.gst?.cgst) || 0;
            const sgst = parseFloat(inv.sgst) || parseFloat(inv.gst?.sgst) || 0;
            const igst = parseFloat(inv.igst) || parseFloat(inv.gst?.igst) || 0;
            const totalTax = cgst + sgst + igst;
            const items = inv.items || [];

            if (items.length === 0) {
                if (subtotal > 0 || totalTax > 0) bump('—', subtotal, cgst, sgst, igst, 0);
                return;
            }

            items.forEach(it => {
                const lineTaxable = parseFloat(it.amount) || 0;
                const qty = parseFloat(it.quantity != null ? it.quantity : it.qty) || 0;
                const hsnRaw = (it.hsn || it.hsnCode || '').toString().trim();
                let lc = parseFloat(it.cgst) || 0;
                let ls = parseFloat(it.sgst) || 0;
                let li = parseFloat(it.igst) || 0;
                if (!lc && !ls && !li && subtotal > 0) {
                    const r = lineTaxable / subtotal;
                    lc = cgst * r;
                    ls = sgst * r;
                    li = igst * r;
                } else if (!lc && !ls && !li && subtotal === 0 && items.length) {
                    const r = 1 / items.length;
                    lc = cgst * r;
                    ls = sgst * r;
                    li = igst * r;
                }
                bump(hsnRaw, lineTaxable, lc, ls, li, qty);
            });
        });

        const rows = Object.values(map).sort((a, b) => String(a.hsn).localeCompare(String(b.hsn), undefined, { numeric: true }));
        const totals = rows.reduce((acc, r) => ({
            taxableValue: acc.taxableValue + r.taxableValue,
            cgst: acc.cgst + r.cgst,
            sgst: acc.sgst + r.sgst,
            igst: acc.igst + r.igst,
            quantity: acc.quantity + r.quantity,
            totalTax: acc.totalTax + r.cgst + r.sgst + r.igst
        }), { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, quantity: 0, totalTax: 0 });

        return { period: `${this._getMonthName(month)} ${year}`, rows, totals };
    },

    /**
     * Line-level HSN rows for GST invoices (full HSN/SAC as stored, no truncation).
     */
    generateHSNWiseSalesLines(year, month) {
        const invoices = (DataManager.getData('invoices') || []).filter(inv => {
            const d = new Date(inv.date);
            return d.getFullYear() === year && d.getMonth() === month;
        }).filter(inv => this._isGstSalesInvoice(inv));

        const lines = [];
        invoices.forEach(inv => {
            const subtotal = parseFloat(inv.subtotal) || 0;
            const cgst = parseFloat(inv.cgst) || parseFloat(inv.gst?.cgst) || 0;
            const sgst = parseFloat(inv.sgst) || parseFloat(inv.gst?.sgst) || 0;
            const igst = parseFloat(inv.igst) || parseFloat(inv.gst?.igst) || 0;
            const totalTax = cgst + sgst + igst;
            const items = inv.items || [];
            const invNo = inv.invoiceNo || inv.id;

            if (items.length === 0) {
                lines.push({
                    invoiceId: inv.id,
                    invoiceNo: invNo,
                    invoiceDate: inv.date,
                    customerName: inv.customerName || '',
                    itemName: '—',
                    hsnFull: '—',
                    quantity: '',
                    unit: '',
                    taxableValue: subtotal,
                    cgst,
                    sgst,
                    igst,
                    lineTotal: subtotal + totalTax
                });
                return;
            }

            items.forEach(it => {
                const lineTaxable = parseFloat(it.amount) || 0;
                const qty = it.quantity != null ? it.quantity : it.qty;
                const hsnFull = String(it.hsn || it.hsnCode || it.hsncode || it.sac_code || it.sac || '').trim() || '—';
                const name = (it.name || it.description || '').toString().trim() || '—';
                let lc = parseFloat(it.cgst) || 0;
                let ls = parseFloat(it.sgst) || 0;
                let li = parseFloat(it.igst) || 0;
                if (!lc && !ls && !li && subtotal > 0) {
                    const r = lineTaxable / subtotal;
                    lc = cgst * r;
                    ls = sgst * r;
                    li = igst * r;
                } else if (!lc && !ls && !li && subtotal === 0 && items.length) {
                    const r = 1 / items.length;
                    lc = cgst * r;
                    ls = sgst * r;
                    li = igst * r;
                }
                lines.push({
                    invoiceId: inv.id,
                    invoiceNo: invNo,
                    invoiceDate: inv.date,
                    customerName: inv.customerName || '',
                    itemName: name,
                    hsnFull,
                    quantity: qty !== undefined && qty !== '' ? qty : '',
                    unit: (it.unit || it.per || '').toString(),
                    taxableValue: lineTaxable,
                    cgst: lc,
                    sgst: ls,
                    igst: li,
                    lineTotal: lineTaxable + lc + ls + li
                });
            });
        });

        lines.sort((a, b) => String(a.invoiceDate).localeCompare(String(b.invoiceDate)) || String(a.invoiceNo).localeCompare(String(b.invoiceNo)));
        return { period: `${this._getMonthName(month)} ${year}`, lines };
    },

    /**
     * Generate GSTR-3B Summary
     * @param {number} year - Year
     * @param {number} month - Month (0-11)
     */
    generateGSTR3B(year, month) {
        const gstr1 = this.generateGSTR1(year, month);
        const monthExpenses = this._getMonthPurchaseExpenses(year, month);

        const itc = {
            cgst: monthExpenses.reduce((sum, exp) => sum + this._expenseTaxParts(exp).cgst, 0),
            sgst: monthExpenses.reduce((sum, exp) => sum + this._expenseTaxParts(exp).sgst, 0),
            igst: monthExpenses.reduce((sum, exp) => sum + this._expenseTaxParts(exp).igst, 0)
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
    // 3. CUSTOMER / VENDOR LEDGER
    // ========================================

    _ledgerNormalizeDate(d) {
        if (d == null || d === '') return '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
        const x = new Date(d);
        if (isNaN(x.getTime())) return '';
        return x.toISOString().slice(0, 10);
    },

    _compareLedgerDates(a, b) {
        return this._ledgerNormalizeDate(a).localeCompare(this._ledgerNormalizeDate(b));
    },

    _partyMatches(account, partyId, partyName) {
        if (!account) return false;
        if (partyId && account.id && String(partyId) === String(account.id)) return true;
        const n = this._normalizePartyName(partyName);
        const an = this._normalizePartyName(account.name);
        return Boolean(n && an && n === an);
    },

    _normalizePartyName(name) {
        return (name || '')
            .toString()
            .toLowerCase()
            .replace(/[,\s]+/g, ' ')
            .trim();
    },

    _ledgerRunningDelta(accountGroup, debit, credit) {
        return accountGroup === 'vendor' ? (credit - debit) : (debit - credit);
    },

    _toAmount(v) {
        if (v == null || v === '') return 0;
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        const n = parseFloat(String(v).replace(/,/g, ''));
        return isNaN(n) ? 0 : n;
    },

    _ledgerKey(v) {
        return (v == null ? '' : String(v)).trim().toLowerCase();
    },

    _sumVoucherAllocationsForKeySet(voucher, keySet) {
        if (!voucher || !keySet || keySet.size === 0) return 0;
        let sum = 0;
        const allocs = Array.isArray(voucher.allocations) ? voucher.allocations : [];
        allocs.forEach(a => {
            const keys = [a.id, a.no, a.billNo, a.invoiceNo].map(x => this._ledgerKey(x)).filter(Boolean);
            if (!keys.length) return;
            if (keys.some(k => keySet.has(k))) {
                const base = parseFloat(a.amount) || 0;
                const tds = parseFloat(a.tdsAmount) || 0;
                const disc = parseFloat(a.discountAmount) || 0;
                sum += base + tds + disc;
            }
        });
        return sum;
    },

    _sumVoucherLinkedShareForKeySet(voucher, keySet) {
        if (!voucher || !keySet || keySet.size === 0) return 0;
        const linked = Array.isArray(voucher.linkedInvoices) ? voucher.linkedInvoices : [];
        if (!linked.length) return 0;
        const clean = linked.map(x => this._ledgerKey(x)).filter(Boolean);
        const totalLinked = clean.length;
        if (!totalLinked) return 0;
        const matches = clean.filter(k => keySet.has(k)).length;
        if (!matches) return 0;
        const totalAmt = (parseFloat(voucher.amount) || 0) + (parseFloat(voucher.tdsAmount) || 0) + (parseFloat(voucher.discountAmount) || 0);
        return totalAmt * (matches / totalLinked);
    },

    _resolveVoucherAmountForAccount(voucher, account, docKeySet) {
        // Priority 1: explicit allocations on voucher
        const allocAmt = this._sumVoucherAllocationsForKeySet(voucher, docKeySet);
        if (allocAmt > 0) return allocAmt;

        // Priority 2: linked invoice/bill ids (pro-rata when one voucher links multiple docs)
        const linkedAmt = this._sumVoucherLinkedShareForKeySet(voucher, docKeySet);
        if (linkedAmt > 0) return linkedAmt;

        // Priority 3: direct party match fallback
        if (this._partyMatches(account, voucher.customerId, voucher.customerName)) {
            return (parseFloat(voucher.amount) || 0) + (parseFloat(voucher.tdsAmount) || 0) + (parseFloat(voucher.discountAmount) || 0);
        }

        return 0;
    },

    _getAccountOpeningSigned(account, accountGroup) {
        if (!account) return 0;
        const openingRaw = (account.openingBalance !== undefined && account.openingBalance !== null)
            ? account.openingBalance
            : account.balance;
        let parsedOpening = this._toAmount(openingRaw);
        if (typeof openingRaw === 'string') {
            const low = openingRaw.toLowerCase();
            if (/(^|\W)(cr|credit)(\W|$)/.test(low)) parsedOpening = -Math.abs(parsedOpening);
            if (/(^|\W)(dr|debit)(\W|$)/.test(low)) parsedOpening = Math.abs(parsedOpening);
        }
        if (parsedOpening !== 0) return parsedOpening;

        const amt = Math.abs(this._toAmount(account.balance));
        if (amt <= 0) return 0;
        const t = String(account.balanceType || '').toLowerCase();
        const has = (arr) => arr.some(x => t.includes(x));
        const isReceivable = has(['receivable', 'debit', 'dr']);
        const isPayable = has(['payable', 'credit', 'cr', 'advance']);

        if (accountGroup === 'customer') {
            if (isReceivable) return amt;   // Debit opening
            if (isPayable) return -amt;     // Credit opening
            // Default for customers: receivable
            return amt;
        }
        // Vendor ledger
        if (isPayable) return amt;          // Credit opening (payable)
        if (isReceivable) return -amt;      // Debit opening (advance to supplier)
        // Default for vendors: payable
        return amt;
    },

    _collectCustomerRawEntries(account) {
        const invoices = DataManager.getData('invoices') || [];
        const vouchers = DataManager.getData('vouchers') || [];
        const entries = [];
        const customerInvoices = invoices.filter(inv => inv.customerId === account.id || inv.customerName === account.name);
        const customerInvoiceKeys = new Set();
        customerInvoices.forEach(inv => {
            [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo].forEach(k => {
                const ck = this._ledgerKey(k);
                if (ck) customerInvoiceKeys.add(ck);
            });
        });

        customerInvoices.forEach(inv => {
                entries.push({
                    date: inv.date,
                    type: 'Invoice',
                    vchType: 'Sales',
                    reference: inv.id,
                    invoiceNo: inv.invoiceNo || '',
                    refNo: inv.poNumber || inv.purchaseOrderNo || inv.refNo || '',
                    particulars: account.name,
                    description: `Invoice #${inv.invoiceNo || inv.id}`,
                    debit: parseFloat(inv.total) || 0,
                    credit: 0,
                    status: inv.status
                });
            });

        vouchers.forEach(v => {
                const vType = String(v.type || '').toLowerCase();
                if (vType === 'contra') return;
                if (vType !== 'receipt' && vType !== 'payment') return;
                const amt = this._resolveVoucherAmountForAccount(v, account, customerInvoiceKeys);
                if (amt <= 0) return;
                const mode = (v.paymentMode || v.mode || 'Cash').toString();
                if (vType === 'payment' && v.isPurchase) return;
                if (vType === 'payment' && !v.isPurchase) {
                    entries.push({
                        date: v.date,
                        type: 'Payment',
                        vchType: 'Payment',
                        reference: v.id,
                        refNo: v.referenceId || v.billNo || '',
                        particulars: account.name,
                        description: `Payment — ${mode}`,
                        debit: amt,
                        credit: 0,
                        status: 'completed'
                    });
                    return;
                }
                entries.push({
                    date: v.date,
                    type: 'Receipt',
                    vchType: 'Receipt',
                    reference: v.id,
                    refNo: v.referenceId || v.billNo || '',
                    particulars: account.name,
                    description: `Receipt — ${mode}`,
                    debit: 0,
                    credit: amt,
                    status: 'completed'
                });
            });

        entries.sort((a, b) => this._compareLedgerDates(a.date, b.date) || String(a.reference).localeCompare(String(b.reference)));
        return entries;
    },

    _collectVendorRawEntries(account) {
        const expenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : [];
        const vouchers = DataManager.getData('vouchers') || [];
        const entries = [];
        const vendorExpenses = expenses.filter(exp => this._partyMatches(account, exp.vendorId || exp.customerId, exp.vendor || exp.vendorName || exp.partyName));
        const vendorBillKeys = new Set();
        vendorExpenses.forEach(exp => {
            [exp.id, exp.billNo, exp.supplierBillNo, exp.vch_no, exp.bookkeeperVchNo].forEach(k => {
                const ck = this._ledgerKey(k);
                if (ck) vendorBillKeys.add(ck);
            });
        });

        vendorExpenses.forEach(exp => {
                const amt = parseFloat(exp.amount || exp.totalAmount) || 0;
                entries.push({
                    date: exp.date,
                    type: 'Purchase',
                    vchType: 'Purchase',
                    reference: exp.id,
                    refNo: exp.poNumber || exp.supplierInvoiceNo || exp.refNo || '',
                    particulars: account.name,
                    description: 'Purchase bill',
                    debit: 0,
                    credit: amt,
                    status: exp.status || 'posted'
                });
            });

        vouchers
            .filter(v => v.type === 'payment' && v.isPurchase !== false)
            .forEach(v => {
                const amt = this._resolveVoucherAmountForAccount(v, account, vendorBillKeys);
                if (amt <= 0) return;
                entries.push({
                    date: v.date,
                    type: 'Payment',
                    vchType: 'Payment',
                    reference: v.id,
                    refNo: v.referenceId || v.billNo || '',
                    particulars: account.name,
                    description: `Payment to supplier`,
                    debit: amt,
                    credit: 0,
                    status: 'completed'
                });
            });

        entries.sort((a, b) => this._compareLedgerDates(a.date, b.date) || String(a.reference).localeCompare(String(b.reference)));
        return entries;
    },

    /**
     * Ledger for a customer (receivable) or vendor/supplier (payable).
     * @param {string} accountId - Customer / supplier ID
     * @param {object} options
     * @param {'customer'|'vendor'} options.accountGroup
     * @param {string} [options.startDate] - YYYY-MM-DD inclusive
     * @param {string} [options.endDate] - YYYY-MM-DD inclusive
     */
    getAccountLedger(accountId, options = {}) {
        const accountGroup = options.accountGroup === 'vendor' ? 'vendor' : 'customer';
        const startDate = options.startDate ? this._ledgerNormalizeDate(options.startDate) : '';
        const endDate = options.endDate ? this._ledgerNormalizeDate(options.endDate) : '';

        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];
        const requestedRaw = (accountId == null ? '' : String(accountId)).trim();
        const requestedNorm = this._normalizePartyName(requestedRaw);
        const account = customers.find(c => {
            const idMatch = c.id != null && String(c.id) === requestedRaw;
            const nameRawMatch = (c.name || '').toString().trim() === requestedRaw;
            const nameNormMatch = requestedNorm && this._normalizePartyName(c.name) === requestedNorm;
            return idMatch || nameRawMatch || nameNormMatch;
        });
        if (!account) return null;

        const raw = accountGroup === 'vendor'
            ? this._collectVendorRawEntries(account)
            : this._collectCustomerRawEntries(account);

        const sign = (d, c) => this._ledgerRunningDelta(accountGroup, d, c);

        let openingBalance = this._getAccountOpeningSigned(account, accountGroup);
        const inPeriod = [];

        raw.forEach(e => {
            const ed = this._ledgerNormalizeDate(e.date);
            const afterStart = !startDate || ed >= startDate;
            const beforeEnd = !endDate || ed <= endDate;
            const beforePeriod = startDate && ed < startDate;

            if (beforePeriod) {
                openingBalance += sign(e.debit, e.credit);
            } else if ((!startDate && !endDate) || (afterStart && beforeEnd)) {
                inPeriod.push({ ...e });
            }
        });

        let running = openingBalance;
        inPeriod.forEach(entry => {
            running += sign(entry.debit, entry.credit);
            entry.balance = running;
        });

        const totalDebit = inPeriod.reduce((s, e) => s + e.debit, 0);
        const totalCredit = inPeriod.reduce((s, e) => s + e.credit, 0);
        const closingBalance = inPeriod.length ? inPeriod[inPeriod.length - 1].balance : openingBalance;

        const groupLabel = accountGroup === 'vendor' ? 'Sundry Creditors' : 'Sundry Debtors';

        return {
            accountGroup,
            groupLabel,
            customer: {
                id: account.id,
                name: account.name,
                phone: account.phone,
                email: account.email || '',
                gstin: account.gstin || '',
                pan: account.pan || '',
                address: account.address || ''
            },
            dateRange: { start: startDate || null, end: endDate || null },
            openingBalance,
            entries: inPeriod,
            summary: {
                totalDebit,
                totalCredit,
                balance: closingBalance,
                openingBalance,
                transactionCount: inPeriod.length
            },
            generatedAt: new Date().toISOString()
        };
    },

    /**
     * Full customer (receivables) ledger — all dates, same shape as getAccountLedger.
     */
    getCustomerLedger(customerId) {
        return this.getAccountLedger(customerId, { accountGroup: 'customer' });
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
        const fy = (typeof DataManager.getFinancialYear === 'function')
            ? DataManager.getFinancialYear(today, true)
            : { startYear: currentMonth >= 3 ? currentYear : currentYear - 1, label: '' };
        if (!fy.label && fy.startYear != null) {
            fy.label = `${fy.startYear}-${(fy.startYear + 1).toString().slice(-2)}`;
        }

        return {
            revenue: this.getRevenueMetrics(currentYear, currentMonth),
            expenses: this.getExpenseMetrics(currentYear, currentMonth),
            inventory: this.getInventoryMetrics(),
            customers: this.getCustomerMetrics(),
            cashFlow: this.getCashFlowData(fy.startYear),
            cashFlowFyLabel: fy.label,
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
    /**
     * @param {number} fyStartYear - Indian FY start (April year), e.g. 2025 for FY 2025–26
     */
    getCashFlowData(fyStartYear) {
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData('expenses') || [];
        const vouchers = DataManager.getData('vouchers') || [];

        const ymKey = (y, m) => y * 12 + m;
        const revenueByYm = new Map();
        const expenseByYm = new Map();
        const collectedByYm = new Map();

        const addSum = (map, dateStr, delta) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return;
            const k = ymKey(d.getFullYear(), d.getMonth());
            map.set(k, (map.get(k) || 0) + delta);
        };

        invoices.forEach(inv => addSum(revenueByYm, inv.date, parseFloat(inv.total) || 0));
        expenses.forEach(exp => addSum(expenseByYm, exp.date, parseFloat(exp.amount) || 0));
        vouchers.forEach(v => addSum(collectedByYm, v.date, parseFloat(v.amount) || 0));

        const monthlyData = [];
        const fyMonths = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

        for (const month of fyMonths) {
            const targetYear = month >= 3 ? fyStartYear : fyStartYear + 1;
            const k = ymKey(targetYear, month);
            const revenue = revenueByYm.get(k) || 0;
            const expense = expenseByYm.get(k) || 0;
            const collected = collectedByYm.get(k) || 0;

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

        const lowStock = this.getLowStockAlerts();
        lowStock.slice(0, 8).forEach(item => {
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

    getSalesRegister(startYmd, endYmd, mode = 'gst') {
        const invoices = DataManager.getData('invoices') || [];
        const rows = [];
        invoices.forEach(inv => {
            const ymd = this._normalizeYmd(inv.date);
            if (!this._inYmdRange(ymd, startYmd, endYmd)) return;
            const isGst = this._isGstSalesInvoice(inv);
            if (mode === 'gst' && !isGst) return;
            if (mode === 'plain' && isGst) return;
            const tax = this._invoiceOutputTax(inv);
            rows.push({
                invoiceNo: inv.invoiceNo || inv.id,
                date: ymd,
                customerName: inv.customerName || '',
                taxable: parseFloat(inv.subtotal) || 0,
                cgst: tax.cgst,
                sgst: tax.sgst,
                igst: tax.igst,
                total: parseFloat(inv.total) || 0,
                billType: isGst ? 'GST' : 'Plain'
            });
        });
        rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.invoiceNo).localeCompare(String(b.invoiceNo)));
        const totals = rows.reduce((acc, r) => ({
            taxable: acc.taxable + r.taxable,
            cgst: acc.cgst + r.cgst,
            sgst: acc.sgst + r.sgst,
            igst: acc.igst + r.igst,
            total: acc.total + r.total
        }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
        return { rows, totals, startYmd, endYmd, mode };
    },

    getPurchaseRegister(startYmd, endYmd) {
        const rows = [];
        this._getAllExpenseRecords().forEach(exp => {
            if (!this._isPurchaseExpenseForItc(exp)) return;
            const ymd = this._normalizeYmd(exp.date);
            if (!this._inYmdRange(ymd, startYmd, endYmd)) return;
            const t = this._expenseTaxParts(exp);
            rows.push({
                billNo: exp.billNo || exp.supplierBillNo || exp.id,
                date: ymd,
                vendor: exp.vendor || exp.vendorName || '',
                taxable: parseFloat(exp.subtotal) || 0,
                cgst: t.cgst,
                sgst: t.sgst,
                igst: t.igst,
                total: parseFloat(exp.amount) || parseFloat(exp.totalAmount) || 0,
                category: exp.category || ''
            });
        });
        rows.sort((a, b) => a.date.localeCompare(b.date) || String(a.billNo).localeCompare(String(b.billNo)));
        const totals = rows.reduce((acc, r) => ({
            taxable: acc.taxable + r.taxable,
            cgst: acc.cgst + r.cgst,
            sgst: acc.sgst + r.sgst,
            igst: acc.igst + r.igst,
            total: acc.total + r.total
        }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
        return { rows, totals, startYmd, endYmd };
    },

    exportSalesRegisterCSV(startYmd, endYmd, mode) {
        const rep = this.getSalesRegister(startYmd, endYmd, mode);
        const label = mode === 'plain' ? 'Plain' : 'GST';
        let csv = `Sales Register (${label}) ${startYmd} to ${endYmd}\n`;
        csv += 'Invoice No,Date,Customer,Taxable,CGST,SGST,IGST,Total,Type\n';
        rep.rows.forEach(r => {
            csv += `"${r.invoiceNo}",${r.date},"${(r.customerName || '').replace(/"/g, '""')}",${r.taxable},${r.cgst},${r.sgst},${r.igst},${r.total},${r.billType}\n`;
        });
        csv += `TOTAL,,,${rep.totals.taxable},${rep.totals.cgst},${rep.totals.sgst},${rep.totals.igst},${rep.totals.total},\n`;
        this._downloadCSV(csv, `Sales_Register_${label}_${startYmd}_${endYmd}.csv`);
    },

    exportPurchaseRegisterCSV(startYmd, endYmd) {
        const rep = this.getPurchaseRegister(startYmd, endYmd);
        let csv = `Purchase Register ${startYmd} to ${endYmd}\n`;
        csv += 'Bill No,Date,Vendor,Taxable,CGST,SGST,IGST,Total,Category\n';
        rep.rows.forEach(r => {
            csv += `"${r.billNo}",${r.date},"${(r.vendor || '').replace(/"/g, '""')}",${r.taxable},${r.cgst},${r.sgst},${r.igst},${r.total},"${(r.category || '').replace(/"/g, '""')}"\n`;
        });
        csv += `TOTAL,,,${rep.totals.taxable},${rep.totals.cgst},${rep.totals.sgst},${rep.totals.igst},${rep.totals.total},\n`;
        this._downloadCSV(csv, `Purchase_Register_${startYmd}_${endYmd}.csv`);
    },

    exportFullGstMonthExcel(year, month) {
        const gstr1 = this.generateGSTR1(year, month);
        const gstr3b = this.generateGSTR3B(year, month);
        const grand = this.generateGstMonthGrandSummary(year, month);
        const hsn = this.generateHSNWiseSales(year, month);
        const hsnLines = this.generateHSNWiseSalesLines(year, month);

        let csv = '';
        csv += `GST Month Report (GST invoices only) — ${gstr1.period}\n\n`;
        csv += 'SUMMARY\n';
        csv += `GST invoices,${gstr1.totals.totalInvoices}\n`;
        csv += `Total taxable (sales),${gstr1.totals.totalTaxableValue}\n`;
        csv += `Total GST (sales),${gstr1.totals.totalTax}\n`;
        csv += `Grand total sales,${gstr1.totals.totalSalesAmount}\n`;
        csv += `Purchase bills (ITC),${grand.purchase.billCount}\n`;
        csv += `Purchase taxable,${grand.purchase.taxableValue}\n`;
        csv += `ITC total,${grand.purchase.itcTotal}\n`;
        csv += `Purchase grand total,${grand.purchase.grandTotal}\n`;
        csv += `Net tax payable,${grand.netTaxPayable}\n\n`;

        csv += 'GSTR-3B ITC\n';
        csv += `CGST,${gstr3b.inputTaxCredit.cgst}\n`;
        csv += `SGST,${gstr3b.inputTaxCredit.sgst}\n`;
        csv += `IGST,${gstr3b.inputTaxCredit.igst}\n\n`;

        csv += 'HSN summary\n';
        csv += 'HSN,Qty,Taxable,CGST,SGST,IGST,Tax\n';
        hsn.rows.forEach(r => {
            csv += `"${r.hsn}",${r.quantity || ''},${r.taxableValue},${r.cgst},${r.sgst},${r.igst},${r.cgst + r.sgst + r.igst}\n`;
        });

        csv += '\nHSN line detail (full HSN)\n';
        csv += 'Invoice,Date,Customer,Item,HSN (full),Qty,Unit,Taxable,CGST,SGST,IGST,Line total\n';
        hsnLines.lines.forEach(l => {
            csv += `"${l.invoiceNo}",${l.invoiceDate},"${(l.customerName || '').replace(/"/g, '""')}","${(l.itemName || '').replace(/"/g, '""')}","${String(l.hsnFull).replace(/"/g, '""')}",${l.quantity},"${l.unit}",${l.taxableValue},${l.cgst},${l.sgst},${l.igst},${l.lineTotal}\n`;
        });

        csv += '\nB2B\n';
        csv += 'Invoice,Date,Customer,GSTIN,Taxable,Tax,Total\n';
        gstr1.b2b.forEach(inv => {
            csv += `"${inv.invoiceNumber}",${inv.invoiceDate},"${(inv.customerName || '').replace(/"/g, '""')}",${inv.gstin},${inv.taxableValue},${inv.cgst + inv.sgst + inv.igst},${inv.total}\n`;
        });

        this._downloadCSV(csv, `GST_Report_${gstr1.period.replace(/\s+/g, '_')}.csv`);
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

    exportHSNWiseSalesToCSV(year, month) {
        const rep = this.generateHSNWiseSales(year, month);
        let csv = `HSN-wise Sales - ${rep.period}\n`;
        csv += 'HSN,Quantity,Taxable Value,CGST,SGST,IGST,Total Tax\n';
        rep.rows.forEach(r => {
            csv += `"${String(r.hsn).replace(/"/g, '""')}",${r.quantity || ''},${r.taxableValue},${r.cgst},${r.sgst},${r.igst},${r.cgst + r.sgst + r.igst}\n`;
        });
        csv += `"Total",${rep.totals.quantity || ''},${rep.totals.taxableValue},${rep.totals.cgst},${rep.totals.sgst},${rep.totals.igst},${rep.totals.totalTax}\n`;
        this._downloadCSV(csv, `HSN_Sales_${rep.period.replace(/\s+/g, '_')}.csv`);
    },

    exportHSNWiseLinesToCSV(year, month) {
        const { period, lines } = this.generateHSNWiseSalesLines(year, month);
        let csv = `HSN line detail (full HSN) - ${period}\n`;
        csv += 'Invoice,Date,Customer,Item,HSN (full),Qty,Unit,Taxable,CGST,SGST,IGST,Line total\n';
        lines.forEach(l => {
            csv += `"${l.invoiceNo}",${l.invoiceDate},"${(l.customerName || '').replace(/"/g, '""')}","${(l.itemName || '').replace(/"/g, '""')}","${String(l.hsnFull).replace(/"/g, '""')}",${l.quantity},"${l.unit}",${l.taxableValue},${l.cgst},${l.sgst},${l.igst},${l.lineTotal}\n`;
        });
        this._downloadCSV(csv, `HSN_Lines_${period.replace(/\s+/g, '_')}.csv`);
    },

    /**
     * Export ledger to CSV (respects account group + date range options)
     */
    exportLedgerToCSV(customerId, options = {}) {
        const ledger = this.getAccountLedger(customerId, options);
        if (!ledger) return;

        const dr = ledger.dateRange.start || ledger.dateRange.end
            ? `${ledger.dateRange.start || '…'} to ${ledger.dateRange.end || '…'}`
            : 'All dates';

        let csv = `${ledger.accountGroup === 'vendor' ? 'Vendor' : 'Customer'} Ledger - ${ledger.customer.name}\n`;
        csv += `Group: ${ledger.groupLabel}\n`;
        csv += `Period: ${dr}\n`;
        csv += `Phone: ${ledger.customer.phone || 'N/A'}\n`;
        csv += `GSTIN: ${ledger.customer.gstin || 'N/A'}\n\n`;

        if (ledger.dateRange.start) {
            csv += `Opening Balance,${ledger.summary.openingBalance}\n\n`;
        }

        csv += 'Date,Type,Reference,Ref No,Description,Debit,Credit,Balance\n';
        ledger.entries.forEach(e => {
            csv += `${e.date},${e.type},${e.reference},${e.refNo || ''},"${(e.description || '').replace(/"/g, '""')}",${e.debit},${e.credit},${e.balance}\n`;
        });

        csv += `\nTotal Debit,${ledger.summary.totalDebit}\n`;
        csv += `Total Credit,${ledger.summary.totalCredit}\n`;
        csv += `Closing Balance,${ledger.summary.balance}\n`;

        const safe = ledger.customer.name.replace(/\s/g, '_').replace(/[^\w.-]/g, '');
        this._downloadCSV(csv, `Ledger_${ledger.accountGroup}_${safe}.csv`);
    },

    _downloadCSV(content, filename) {
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }
};

// Expose to window
window.BusinessAnalytics = BusinessAnalytics;
