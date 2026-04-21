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
    _outstandingCache: { at: 0, data: null },

    // ========================================
    // 1. ADVANCED INVENTORY / STOCK MANAGEMENT
    // ========================================

    /**
     * Get comprehensive stock report
     */
    getStockReport() {
        const inventory = DataManager.getData('inventory') || [];
        const transactions = DataManager.getData('inventoryTransactions') || [];
        const txByMaterial = new Map();
        transactions.forEach(t => {
            const id = t?.materialId;
            if (!id) return;
            let rec = txByMaterial.get(id);
            if (!rec) {
                rec = { totalIn: 0, totalOut: 0, lastTransaction: null };
                txByMaterial.set(id, rec);
            }
            const qty = parseFloat(t.quantity) || 0;
            if (t.type === 'in') rec.totalIn += qty;
            else if (t.type === 'out') rec.totalOut += qty;
            if (!rec.lastTransaction) rec.lastTransaction = t;
            else {
                const prev = new Date(rec.lastTransaction.date).getTime();
                const cur = new Date(t.date).getTime();
                if (!Number.isNaN(cur) && (Number.isNaN(prev) || cur >= prev)) rec.lastTransaction = t;
            }
        });

        return inventory.map(item => {
            const rec = txByMaterial.get(item.id) || { totalIn: 0, totalOut: 0, lastTransaction: null };
            return {
                ...item,
                totalIn: rec.totalIn,
                totalOut: rec.totalOut,
                stockValue: (parseFloat(item.currentStock) || 0) * (parseFloat(item.rate) || 0),
                isLowStock: (parseFloat(item.currentStock) || 0) <= (parseFloat(item.minStock) || 0),
                lastTransaction: rec.lastTransaction
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
     * Fast-moving materials: prefers stock **out** (consumption) in the last N days.
     * If there are no `out` transactions (common when only purchase receipts are logged), falls back to **in** (receipts).
     */
    getFastMovingItems(days = 30) {
        const transactions = DataManager.getData('inventoryTransactions') || [];
        const inventory = DataManager.getData('inventory') || [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const inventoryById = new Map(inventory.map(m => [m.id, m]));

        const buildForType = (type) => {
            const recentTxns = transactions.filter(t =>
                new Date(t.date) >= cutoffDate && t.type === type
            );
            const usageMap = {};
            recentTxns.forEach(t => {
                if (!t.materialId) return;
                usageMap[t.materialId] = (usageMap[t.materialId] || 0) + (parseFloat(t.quantity) || 0);
            });
            return Object.entries(usageMap)
                .map(([materialId, quantity]) => {
                    const material = inventoryById.get(materialId);
                    return {
                        materialId,
                        name: material?.name || 'Unknown',
                        quantity,
                        value: quantity * (material?.rate || 0)
                    };
                })
                .sort((a, b) => b.quantity - a.quantity);
        };

        const outItems = buildForType('out');
        if (outItems.length > 0) {
            return { basis: 'out', items: outItems.slice(0, 10) };
        }
        const inItems = buildForType('in');
        return { basis: 'in', items: inItems.slice(0, 10) };
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

    /** Milliseconds for ledger sort tie-break (createdAt preferred). */
    _ledgerEntryTimestamp(e) {
        if (!e) return 0;
        if (typeof e._ledgerTs === 'number' && !isNaN(e._ledgerTs)) return e._ledgerTs;
        const raw = e.createdAt || e.date;
        const t = raw ? new Date(raw).getTime() : 0;
        return isNaN(t) ? 0 : t;
    },

    /**
     * Book Keeper / Tally style: same calendar date — post sales & credit notes before bank receipts/payments
     * so running balance matches classic books. Then createdAt, then voucher/invoice ref.
     */
    _sortLedgerEntries(entries, accountGroup) {
        const receiptLike = accountGroup === 'vendor'
            ? (e) => (e.type === 'Payment')
            : (e) => (e.type === 'Receipt');
        entries.sort((a, b) => {
            const cd = this._compareLedgerDates(a.date, b.date);
            if (cd !== 0) return cd;
            const ra = receiptLike(a) ? 1 : 0;
            const rb = receiptLike(b) ? 1 : 0;
            if (ra !== rb) return ra - rb;
            const ta = this._ledgerEntryTimestamp(a);
            const tb = this._ledgerEntryTimestamp(b);
            if (ta !== tb) return ta - tb;
            const sa = String(a.invoiceNo || a.reference || '');
            const sb = String(b.invoiceNo || b.reference || '');
            return sa.localeCompare(sb, 'en', { numeric: true, sensitivity: 'base' });
        });
    },

    _partyMatches(account, partyId, partyName, partyInternalId) {
        if (!account) return false;
        if (partyId && account.id && String(partyId) === String(account.id)) return true;
        if (partyInternalId && account.partyId && String(partyInternalId) === String(account.partyId)) return true;
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

    /** Document ref for voucher–invoice links: exact string (case-sensitive), trim only. */
    _ledgerKey(v) {
        return (v == null ? '' : String(v)).trim();
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
        const vType = String(voucher.type || '').toLowerCase();
        const totalSettlement = (typeof VoucherManager !== 'undefined' && VoucherManager.resolveSettlementDisplay)
            ? VoucherManager.resolveSettlementDisplay(voucher).totalSettlement
            : (parseFloat(voucher.amount) || 0) + (parseFloat(voucher.tdsAmount) || 0) + (parseFloat(voucher.discountAmount) || 0);

        // Party-scoped ledgers: one receipt/payment row must reflect the **full** voucher amount.
        // Using only allocation lines that match invoice keys wrongly drops "on account" / opening-balance (-2) lines,
        // so the ledger credit/debit looked too small while invoices still balanced partially.
        if (this._partyMatches(account, voucher.customerId, voucher.customerName, voucher.partyId)) {
            if (vType === 'receipt') return totalSettlement;
            if (vType === 'payment' && !voucher.isPurchase) return totalSettlement;
        }

        // Purchase payments to vendor (party stored on the voucher like customer receipts)
        if (vType === 'payment' && voucher.isPurchase !== false &&
            this._partyMatches(account, voucher.customerId, voucher.customerName, voucher.partyId)) {
            return totalSettlement;
        }

        // Legacy paths when party does not match (cross-linked refs — rare)
        const allocAmt = this._sumVoucherAllocationsForKeySet(voucher, docKeySet);
        if (allocAmt > 0) return allocAmt;

        const linkedAmt = this._sumVoucherLinkedShareForKeySet(voucher, docKeySet);
        if (linkedAmt > 0) return linkedAmt;

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

    /** Sales invoices that belong in customer (AR) ledger — excludes non-GST / without-bill rows when type is set. */
    _isGstStyleSalesInvoice(inv) {
        if (!inv) return false;
        const t = (inv.type || '').toLowerCase();
        if (t === 'without-bill' || t === 'sales-non-gst' || t === 'non-gst-invoice') return false;
        return true;
    },

    /** Credit note / sales return — reduces customer receivable (credit side of customer ledger). */
    _isCreditNoteInvoice(inv) {
        if (!inv) return false;
        const t = (inv.type || '').toLowerCase();
        if (t === 'credit-note' || t === 'credit_note' || t === 'sales-return' || t === 'sales_return') return true;
        if (t.includes('credit') && t.includes('note')) return true;
        if (inv.isCreditNote === true) return true;
        const bk = String(inv.bookkeeperVchType || inv.v_type || '').toLowerCase();
        if (bk.includes('credit') && bk.includes('note')) return true;
        if (bk.includes('sales return') || bk.includes('sales-return')) return true;
        if (bk.includes('sales') && bk.includes('return') && !bk.includes('purchase')) return true;
        const narr = String(inv.narration || inv.description || inv.remarks || '').toLowerCase();
        if (/\b(sales\s*return|credit\s*note|cr\s*note)\b/.test(narr)) return true;
        const total = parseFloat(inv.total ?? inv.amount ?? 0);
        if (total < 0) return true;
        return false;
    },

    _includeInCustomerLedgerInvoice(inv) {
        return this._isCreditNoteInvoice(inv) || this._isGstStyleSalesInvoice(inv);
    },

    /** Debit note from supplier — reduces payables (debit side of vendor ledger). */
    _isDebitNotePurchase(exp) {
        if (!exp) return false;
        const t = String(exp.type || exp.v_type || exp.billType || '').toLowerCase();
        if (t === 'debit-note' || t === 'debit_note') return true;
        if (t.includes('debit') && t.includes('note')) return true;
        if (exp.isDebitNote === true) return true;
        return false;
    },

    _collectCustomerRawEntries(account) {
        const invoices = DataManager.getData('invoices') || [];
        const vouchers = DataManager.getData('vouchers') || [];
        const entries = [];
        const customerInvoices = invoices.filter(inv =>
            this._partyMatches(account, inv.customerId, inv.customerName, inv.partyId) &&
            this._includeInCustomerLedgerInvoice(inv)
        );
        const customerInvoiceKeys = new Set();
        customerInvoices.forEach(inv => {
            [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo].forEach(k => {
                const ck = this._ledgerKey(k);
                if (ck) customerInvoiceKeys.add(ck);
            });
        });

        customerInvoices.forEach(inv => {
                const isCn = this._isCreditNoteInvoice(inv);
                const amt = Math.abs(parseFloat(inv.total) || 0);
                const invTs = new Date(inv.createdAt || inv.date || 0).getTime();
                entries.push({
                    date: inv.date,
                    createdAt: inv.createdAt,
                    _ledgerTs: isNaN(invTs) ? 0 : invTs,
                    type: isCn ? 'Credit Note' : 'Invoice',
                    vchType: isCn ? 'Credit Note' : 'Sales',
                    reference: inv.id,
                    invoiceNo: inv.invoiceNo || '',
                    refNo: inv.poNumber || inv.purchaseOrderNo || inv.refNo || '',
                    particulars: account.name,
                    description: isCn
                        ? `Credit note #${inv.invoiceNo || inv.id}`
                        : `Invoice #${inv.invoiceNo || inv.id}`,
                    debit: isCn ? 0 : amt,
                    credit: isCn ? amt : 0,
                    status: inv.status
                });
            });

        // Customer ledger: sales invoices + all customer receipts (GST and non-GST); exclude vendor/purchase receipts
        vouchers.forEach(v => {
                const vType = String(v.type || '').toLowerCase();
                if (vType === 'contra') return;
                if (vType !== 'receipt') return;
                if (v.isPurchase) return;
                // Strict party gate: do not let cross-linked invoice refs pull other-customer vouchers.
                if (!this._partyMatches(account, v.customerId, v.customerName, v.partyId)) return;
                const amt = this._resolveVoucherAmountForAccount(v, account, customerInvoiceKeys);
                if (amt <= 0) return;
                const mode = (v.paymentMode || v.mode || 'Cash').toString();
                const vTs = new Date(v.createdAt || v.date || 0).getTime();
                entries.push({
                    date: v.date,
                    createdAt: v.createdAt,
                    _ledgerTs: isNaN(vTs) ? 0 : vTs,
                    type: 'Receipt',
                    vchType: 'Receipt',
                    reference: v.id,
                    invoiceNo: v.voucherNo || v.id || '',
                    refNo: v.referenceId || v.billNo || '',
                    particulars: account.name,
                    description: `Receipt — ${mode}`,
                    debit: 0,
                    credit: amt,
                    status: 'completed'
                });
            });

        this._sortLedgerEntries(entries, 'customer');
        return entries;
    },

    _collectVendorRawEntries(account) {
        const expenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : [];
        const vouchers = DataManager.getData('vouchers') || [];
        const entries = [];
        const vendorExpenses = expenses.filter(exp => this._partyMatches(account, exp.vendorId || exp.customerId, exp.vendor || exp.vendorName || exp.partyName, exp.partyId));
        const vendorBillKeys = new Set();
        vendorExpenses.forEach(exp => {
            [exp.id, exp.billNo, exp.supplierBillNo, exp.vch_no, exp.bookkeeperVchNo].forEach(k => {
                const ck = this._ledgerKey(k);
                if (ck) vendorBillKeys.add(ck);
            });
        });

        vendorExpenses.forEach(exp => {
                const isDn = this._isDebitNotePurchase(exp);
                const amt = Math.abs(parseFloat(exp.amount || exp.totalAmount) || 0);
                if (amt <= 0) return;
                const expTs = new Date(exp.createdAt || exp.date || 0).getTime();
                entries.push({
                    date: exp.date,
                    createdAt: exp.createdAt,
                    _ledgerTs: isNaN(expTs) ? 0 : expTs,
                    type: isDn ? 'Debit Note' : 'Purchase',
                    vchType: isDn ? 'Debit Note' : 'Purchase',
                    reference: exp.id,
                    invoiceNo: (exp.billNo || exp.vch_no || exp.id || '').toString(),
                    refNo: exp.poNumber || exp.supplierInvoiceNo || exp.refNo || '',
                    particulars: account.name,
                    description: isDn ? 'Debit note' : 'Purchase bill',
                    debit: isDn ? amt : 0,
                    credit: isDn ? 0 : amt,
                    status: exp.status || 'posted'
                });
            });

        vouchers
            .filter(v => v.type === 'payment' && v.isPurchase !== false)
            .forEach(v => {
                // Strict party gate: prevent cross-party voucher bleed via ref-based fallbacks.
                if (!this._partyMatches(account, v.customerId, v.customerName, v.partyId)) return;
                const amt = this._resolveVoucherAmountForAccount(v, account, vendorBillKeys);
                if (amt <= 0) return;
                const vTs = new Date(v.createdAt || v.date || 0).getTime();
                entries.push({
                    date: v.date,
                    createdAt: v.createdAt,
                    _ledgerTs: isNaN(vTs) ? 0 : vTs,
                    type: 'Payment',
                    vchType: 'Payment',
                    reference: v.id,
                    invoiceNo: v.voucherNo || v.id || '',
                    refNo: v.referenceId || v.billNo || '',
                    particulars: account.name,
                    description: `Payment to supplier`,
                    debit: amt,
                    credit: 0,
                    status: 'completed'
                });
            });

        this._sortLedgerEntries(entries, 'vendor');
        return entries;
    },

    /** True when Analytics UI selected a Book Keeper–style ledger bucket (not AR/AP party ledgers). */
    _isGeneralLedgerGroup(ag) {
        const s = String(ag || '');
        return s.startsWith('gl_') || s === 'ledger';
    },

    _normalizeLedgerName(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/\u00a0/g, ' ')
            .trim();
    },

    _ledgerNamesMatch(a, b) {
        const x = this._normalizeLedgerName(a);
        const y = this._normalizeLedgerName(b);
        return Boolean(x && y && x === y);
    },

    _ledgerNameLooksLikeSalesReturn(name) {
        return /\bsales\s*return\b/i.test(String(name || ''));
    },

    _inferLedgerNature(account) {
        const g = String(account?.accountGroup || '').toLowerCase();
        const n = String(account?.name || '').toLowerCase();
        if (g.includes('direct') && g.includes('income')) return 'income';
        if (g.includes('indirect') && g.includes('income')) return 'income';
        if (g.includes('direct') && (g.includes('expense') || g.includes('expences'))) return 'expense';
        if (g.includes('indirect') && (g.includes('expense') || g.includes('expences'))) return 'expense';
        if (g.includes('duties') || g.includes('tax')) return 'liability';
        if (g.includes('current') && g.includes('asset')) return 'asset';
        if (g.includes('bank')) return 'asset';
        if (g.includes('cash')) return 'asset';
        if (/\b(sales\s*return)\b/i.test(n)) return 'contra_income';
        if (/\bround\s*off\b/i.test(n)) return 'income';
        if (/(cgst|sgst|igst)/.test(n) && /%/.test(n)) return 'liability';
        if (/\b(input|itc|itc\s*receivable)\b/i.test(n)) return 'asset';
        if (/\b(salary|cartage|allowance|rent|packing|forwarding)\b/i.test(n)) return 'expense';
        return 'expense';
    },

    _isGstTaxLedgerName(name) {
        const n = String(name || '').toLowerCase();
        return (n.includes('cgst') || n.includes('sgst') || n.includes('igst')) && !/\b(input|itc)\b/.test(n);
    },

    _gstAmountFromInvoiceForLedger(inv, accountName) {
        const n = String(accountName || '').toLowerCase();
        const gst = inv.gst || {};
        if (n.includes('igst')) return Math.abs(parseFloat(gst.igst) || 0);
        if (n.includes('cgst')) return Math.abs(parseFloat(gst.cgst) || 0);
        if (n.includes('sgst')) return Math.abs(parseFloat(gst.sgst) || 0);
        return 0;
    },

    _gstAmountFromExpenseForLedger(exp, accountName) {
        const n = String(accountName || '').toLowerCase();
        if (n.includes('igst')) return Math.abs(parseFloat(exp.igst) || 0);
        if (n.includes('cgst')) return Math.abs(parseFloat(exp.cgst) || 0);
        if (n.includes('sgst')) return Math.abs(parseFloat(exp.sgst) || 0);
        return 0;
    },

    _glRunningDelta(account, debit, credit) {
        const nature = this._inferLedgerNature(account);
        if (nature === 'income' || nature === 'contra_income') return credit - debit;
        if (nature === 'expense') return debit - credit;
        if (nature === 'asset') return debit - credit;
        if (nature === 'liability') return credit - debit;
        return debit - credit;
    },

    _getGlOpeningSigned(account) {
        if (!account) return 0;
        const openingRaw = (account.openingBalance !== undefined && account.openingBalance !== null)
            ? account.openingBalance
            : account.balance;
        let parsed = this._toAmount(openingRaw);
        if (typeof openingRaw === 'string') {
            const low = openingRaw.toLowerCase();
            if (/(^|\W)(cr|credit)(\W|$)/.test(low)) parsed = -Math.abs(parsed);
            if (/(^|\W)(dr|debit)(\W|$)/.test(low)) parsed = Math.abs(parsed);
        }
        return parsed;
    },

    _sortGlLedgerEntries(entries) {
        entries.sort((a, b) => {
            const cd = this._compareLedgerDates(a.date, b.date);
            if (cd !== 0) return cd;
            return this._ledgerEntryTimestamp(a) - this._ledgerEntryTimestamp(b);
        });
    },

    /**
     * Find account row from Customers or gtes_accounts (for general ledger).
     */
    findLedgerAccountRecord(accountId) {
        const raw = (accountId == null ? '' : String(accountId)).trim();
        if (!raw) return null;
        const requestedNorm = this._normalizePartyName(raw);
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        let a = customers.find(c => {
            const idMatch = c.id != null && String(c.id) === raw;
            const nameRawMatch = (c.name || '').toString().trim() === raw;
            const nameNormMatch = requestedNorm && this._normalizePartyName(c.name) === requestedNorm;
            return idMatch || nameRawMatch || nameNormMatch;
        });
        if (a) return { ...a, _ledgerSource: 'customer' };
        const gtes = DataManager.getData(DataManager.KEYS.ACCOUNTS) || DataManager.getData('gtes_accounts') || [];
        a = gtes.find(x => {
            const id = x.id != null ? String(x.id) : '';
            const nm = (x.name || '').toString().trim();
            return (id && id === raw) || nm === raw || (requestedNorm && this._normalizePartyName(nm) === requestedNorm);
        });
        if (a) return { ...a, _ledgerSource: 'gtes' };
        return null;
    },

    /**
     * Which UI "Account group" bucket an account belongs to (Book Keeper groups + bank/cash).
     */
    inferLedgerUiGroupKey(account) {
        const g = String(account?.accountGroup || '').toLowerCase();
        const n = String(account?.name || '').toLowerCase();
        if (g.includes('direct') && g.includes('income')) return 'gl_direct_income';
        if (g.includes('indirect') && g.includes('income')) return 'gl_indirect_income';
        if (g.includes('direct') && (g.includes('expense') || g.includes('expences'))) return 'gl_direct_expense';
        if (g.includes('indirect') && (g.includes('expense') || g.includes('expences'))) return 'gl_indirect_expense';
        if (g.includes('duties') || g.includes('tax')) return 'gl_duties_taxes';
        if (g.includes('current') && g.includes('asset')) return 'gl_current_assets';
        if (g.includes('bank')) return 'gl_bank';
        if (g.includes('cash')) return 'gl_cash';
        if (/%/.test(n) && (n.includes('cgst') || n.includes('sgst') || n.includes('igst'))) return 'gl_duties_taxes';
        if (/\b(sales\s*return|round\s*off)\b/i.test(n)) return 'gl_indirect_income';
        if (/\b(bank|hdfc|sbi|icici|axis|current\s*a\/?c)\b/i.test(n)) return 'gl_bank';
        if (/\bcash\b/.test(n) && (n.includes('hand') || n.includes('in'))) return 'gl_cash';
        if (/\b(salary|cartage|hra|allowance|ta|oa|packing|forwarding)\b/i.test(n)) return 'gl_direct_expense';
        return 'gl_other';
    },

    /**
     * Accounts listed in Customer Ledger sidebar for a given group key.
     */
    filterAccountsForLedgerGroup(groupKey) {
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : (DataManager.getData('customers') || []);
        const gtes = DataManager.getData(DataManager.KEYS.ACCOUNTS) || DataManager.getData('gtes_accounts') || [];
        const merged = [];
        const seen = new Set();
        const add = (row, src) => {
            const name = String(row?.name || '').trim();
            if (!name) return;
            const key = `${src}:${name.toLowerCase()}`;
            if (seen.has(key)) return;
            seen.add(key);
            merged.push({ ...row, _ledgerSource: src });
        };
        customers.forEach(c => add(c, 'customer'));
        gtes.forEach(a => add(a, 'gtes'));

        if (groupKey === 'gl_all') return merged;

        if (groupKey === 'customer') {
            return merged.filter(a => (a.accountType || '').toLowerCase() !== 'supplier');
        }
        if (groupKey === 'vendor') {
            return merged.filter(a => (a.accountType || '').toLowerCase() === 'supplier');
        }

        return merged.filter(a => {
            if ((a.accountType || '').toLowerCase() === 'supplier') return false;
            const k = this.inferLedgerUiGroupKey(a);
            if (groupKey === 'gl_other') return k === 'gl_other';
            return k === groupKey;
        });
    },

    _collectGeneralLedgerRawEntries(account) {
        const entries = [];
        const accName = account.name;
        const nature = this._inferLedgerNature(account);
        const invoices = DataManager.getData('invoices') || [];
        const expenses = (typeof ExpenseManager !== 'undefined') ? ExpenseManager.getAllExpenses() : (DataManager.getData(DataManager.KEYS.EXPENSES) || []);
        const an = this._normalizeLedgerName(accName);

        /** Sales-side document (not purchase bill stored as invoice). */
        const isSalesDoc = (inv) => {
            if (!inv) return false;
            const t = String(inv.type || '').toLowerCase();
            if (t.includes('purchase')) return false;
            return true;
        };

        // --- GST component lines (Duties & Taxes) ---
        if (nature === 'liability' && this._isGstTaxLedgerName(accName)) {
            invoices.forEach(inv => {
                if (!isSalesDoc(inv)) return;
                const amt = this._gstAmountFromInvoiceForLedger(inv, accName);
                if (amt <= 0) return;
                const isCn = this._isCreditNoteInvoice(inv);
                const invTs = new Date(inv.createdAt || inv.date || 0).getTime();
                entries.push({
                    date: inv.date,
                    createdAt: inv.createdAt,
                    _ledgerTs: isNaN(invTs) ? 0 : invTs,
                    type: isCn ? 'Credit Note' : 'Invoice',
                    vchType: isCn ? 'Credit Note' : 'Sales',
                    reference: inv.id,
                    invoiceNo: inv.invoiceNo || inv.id || '',
                    refNo: inv.poNumber || inv.refNo || '',
                    particulars: accName,
                    description: isCn ? `GST (credit note) — ${accName}` : `GST on sales — ${accName}`,
                    debit: isCn ? amt : 0,
                    credit: isCn ? 0 : amt,
                    status: inv.status || 'posted'
                });
            });
            expenses.forEach(exp => {
                const cat = String(exp.category || '').toLowerCase();
                if (!cat.includes('purchase') && !cat.includes('expense')) return;
                const amt = this._gstAmountFromExpenseForLedger(exp, accName);
                if (amt <= 0) return;
                const isDn = this._isDebitNotePurchase(exp);
                const expTs = new Date(exp.createdAt || exp.date || 0).getTime();
                entries.push({
                    date: exp.date,
                    createdAt: exp.createdAt,
                    _ledgerTs: isNaN(expTs) ? 0 : expTs,
                    type: isDn ? 'Debit Note' : 'Purchase',
                    vchType: isDn ? 'Debit Note' : 'Purchase',
                    reference: exp.id,
                    invoiceNo: (exp.billNo || exp.vch_no || exp.id || '').toString(),
                    refNo: exp.supplierInvoiceNo || exp.refNo || '',
                    particulars: accName,
                    description: isDn ? `GST (debit note) — ${accName}` : `GST on purchase (ITC) — ${accName}`,
                    debit: isDn ? 0 : amt,
                    credit: isDn ? amt : 0,
                    status: exp.status || 'posted'
                });
            });
            this._sortGlLedgerEntries(entries);
            return entries;
        }

        // --- Invoice totals by ledgerAccount + Sales Return fallback on credit notes ---
        invoices.forEach(inv => {
            if (!isSalesDoc(inv)) return;
            const la = this._normalizeLedgerName(inv.ledgerAccount);
            const ledgerMatch = la && la === an;
            const isCn = this._isCreditNoteInvoice(inv);
            const creditNoteFallback = !la && isCn && this._ledgerNameLooksLikeSalesReturn(accName);
            if (!ledgerMatch && !creditNoteFallback) return;

            const amt = Math.abs(parseFloat(inv.total) || 0);
            if (amt <= 0) return;
            const invTs = new Date(inv.createdAt || inv.date || 0).getTime();

            let debit = 0;
            let credit = 0;
            if (nature === 'income' || nature === 'contra_income') {
                debit = isCn ? amt : 0;
                credit = isCn ? 0 : amt;
            } else if (nature === 'expense') {
                debit = isCn ? 0 : amt;
                credit = isCn ? amt : 0;
            } else {
                debit = isCn ? amt : 0;
                credit = isCn ? 0 : amt;
            }

            entries.push({
                date: inv.date,
                createdAt: inv.createdAt,
                _ledgerTs: isNaN(invTs) ? 0 : invTs,
                type: isCn ? 'Credit Note' : 'Invoice',
                vchType: isCn ? 'Credit Note' : 'Sales',
                reference: inv.id,
                invoiceNo: inv.invoiceNo || inv.id || '',
                refNo: inv.poNumber || inv.refNo || '',
                particulars: accName,
                description: isCn ? `Credit note #${inv.invoiceNo || inv.id}` : `Sales #${inv.invoiceNo || inv.id}`,
                debit,
                credit,
                status: inv.status || 'posted'
            });
        });

        // --- Round off on invoices (Indirect income) ---
        if (/\bround\s*off\b/i.test(accName)) {
            invoices.forEach(inv => {
                if (!isSalesDoc(inv)) return;
                const ro = parseFloat(inv.roundOff);
                if (!Number.isFinite(ro) || Math.abs(ro) < 1e-9) return;
                const invTs = new Date(inv.createdAt || inv.date || 0).getTime();
                const credit = ro > 0 ? ro : 0;
                const debit = ro < 0 ? -ro : 0;
                entries.push({
                    date: inv.date,
                    createdAt: inv.createdAt,
                    _ledgerTs: isNaN(invTs) ? 0 : invTs,
                    type: 'Invoice',
                    vchType: 'Round off',
                    reference: inv.id,
                    invoiceNo: inv.invoiceNo || inv.id || '',
                    refNo: inv.poNumber || '',
                    particulars: accName,
                    description: `Round off — ${inv.invoiceNo || inv.id}`,
                    debit,
                    credit,
                    status: inv.status || 'posted'
                });
            });
        }

        // --- Purchases / expenses by ledgerAccount ---
        expenses.forEach(exp => {
            const el = this._normalizeLedgerName(exp.ledgerAccount);
            if (!el || el !== an) return;
            const amt = Math.abs(parseFloat(exp.amount || exp.totalAmount || exp.total) || 0);
            if (amt <= 0) return;
            const isDn = this._isDebitNotePurchase(exp);
            const expTs = new Date(exp.createdAt || exp.date || 0).getTime();
            let debit = 0;
            let credit = 0;
            if (nature === 'expense' || nature === 'asset') {
                debit = isDn ? 0 : amt;
                credit = isDn ? amt : 0;
            } else {
                debit = isDn ? 0 : amt;
                credit = isDn ? amt : 0;
            }
            entries.push({
                date: exp.date,
                createdAt: exp.createdAt,
                _ledgerTs: isNaN(expTs) ? 0 : expTs,
                type: isDn ? 'Debit Note' : 'Purchase',
                vchType: isDn ? 'Debit Note' : 'Purchase',
                reference: exp.id,
                invoiceNo: (exp.billNo || exp.vch_no || exp.id || '').toString(),
                refNo: exp.supplierInvoiceNo || exp.refNo || '',
                particulars: accName,
                description: exp.description || exp.narration || 'Purchase',
                debit,
                credit,
                status: exp.status || 'posted'
            });
        });

        this._sortGlLedgerEntries(entries);
        return entries;
    },

    _generalLedgerGroupLabel(account) {
        const g = String(account?.accountGroup || '').trim();
        if (g) return g;
        const k = this.inferLedgerUiGroupKey(account);
        const map = {
            gl_direct_income: 'Direct Income',
            gl_indirect_income: 'Indirect Income',
            gl_direct_expense: 'Direct Expenses',
            gl_indirect_expense: 'Indirect Expenses',
            gl_duties_taxes: 'Duties & Taxes',
            gl_current_assets: 'Current Assets',
            gl_bank: 'Bank Accounts',
            gl_cash: 'Cash-in-hand',
            gl_other: 'Other Accounts'
        };
        return map[k] || 'General Ledger';
    },

    _getGeneralLedger(accountId, options = {}) {
        const startDate = options.startDate ? this._ledgerNormalizeDate(options.startDate) : '';
        const endDate = options.endDate ? this._ledgerNormalizeDate(options.endDate) : '';

        const account = this.findLedgerAccountRecord(accountId);
        if (!account) return null;

        const raw = this._collectGeneralLedgerRawEntries(account);
        const sign = (d, c) => this._glRunningDelta(account, d, c);

        let openingBalance = this._getGlOpeningSigned(account);
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

        const groupLabel = this._generalLedgerGroupLabel(account);

        return {
            accountGroup: 'ledger',
            ledgerKind: 'general',
            groupLabel,
            customer: {
                id: account.id || account.name,
                name: account.name,
                phone: account.phone || '',
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
     * Ledger for a customer (receivable) or vendor/supplier (payable).
     * @param {string} accountId - Customer / supplier ID
     * @param {object} options
     * @param {'customer'|'vendor'} options.accountGroup
     * @param {string} [options.startDate] - YYYY-MM-DD inclusive
     * @param {string} [options.endDate] - YYYY-MM-DD inclusive
     */
    getAccountLedger(accountId, options = {}) {
        const agOpt = options.accountGroup || 'customer';
        if (this._isGeneralLedgerGroup(agOpt)) {
            return this._getGeneralLedger(accountId, options);
        }

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
     * Diagnostic: receipt allocations whose bill/invoice ref is not loaded as this party's invoice (exact ref).
     * Run in devtools: BusinessAnalytics.getCustomerLedgerAllocationGaps('CUSTOMER_ID')
     */
    getCustomerLedgerAllocationGaps(accountId) {
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

        const invoices = DataManager.getData('invoices') || [];
        const partyInvoices = invoices.filter(inv =>
            this._partyMatches(account, inv.customerId, inv.customerName, inv.partyId) && this._includeInCustomerLedgerInvoice(inv)
        );
        const keySet = new Set();
        partyInvoices.forEach(inv => {
            [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo].forEach(k => {
                const ck = this._ledgerKey(k);
                if (ck) keySet.add(ck);
            });
        });

        const vouchers = DataManager.getData('vouchers') || [];
        const gaps = [];
        const seen = new Set();
        for (const v of vouchers) {
            if (String(v.type || '').toLowerCase() !== 'receipt') continue;
            if (v.isPurchase) continue;
            if (!this._partyMatches(account, v.customerId, v.customerName, v.partyId)) continue;
            for (const a of (v.allocations || [])) {
                for (const raw of [a.id, a.no, a.invoiceNo, a.billNo]) {
                    const k = this._ledgerKey(raw);
                    if (!k || keySet.has(k)) continue;
                    const dedupe = `${v.id}|${k}`;
                    if (seen.has(dedupe)) continue;
                    seen.add(dedupe);
                    let wrongParty = null;
                    const other = invoices.find(inv =>
                        [inv.id, inv.invoiceNo, inv.billNo, inv.bookkeeperVchNo]
                            .some(x => this._ledgerKey(x) === k)
                    );
                    if (other && !this._partyMatches(account, other.customerId, other.customerName, other.partyId)) {
                        wrongParty = other.customerName || other.customerId || '(other)';
                    }
                    gaps.push({
                        voucherId: v.id,
                        voucherDate: v.date,
                        missingRef: k,
                        wrongPartyCustomer: wrongParty
                    });
                }
            }
        }
        return {
            customerId: account.id,
            customerName: account.name,
            partyInvoiceCount: partyInvoices.length,
            gaps,
            note: 'Refs are exact (case-sensitive). Missing rows usually mean sales not imported or wrong customer on invoice.'
        };
    },

    /**
     * Get all customers with outstanding balances
     */
    getOutstandingBalances(options = {}) {
        const useExactLedger = !!options.useExactLedger;
        const now = Date.now();
        if (!useExactLedger && this._outstandingCache.data && (now - this._outstandingCache.at) < 15000) {
            return this._outstandingCache.data;
        }

        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];

        if (useExactLedger) {
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
        }

        const customerMap = new Map(customers.map(c => [c.id, c]));
        const invoices = (typeof InvoiceManager !== 'undefined' && typeof InvoiceManager.getInvoicesWithBalance === 'function')
            ? (InvoiceManager.getInvoicesWithBalance() || [])
            : (DataManager.getData('invoices') || []);
        const agg = new Map();

        invoices.forEach(inv => {
            const key = inv.customerId || inv.customerName;
            if (!key) return;
            const total = parseFloat(inv.total) || 0;
            const explicitBalance = parseFloat(inv.balance);
            const balance = Number.isFinite(explicitBalance)
                ? explicitBalance
                : ((inv.status === 'paid') ? 0 : total);
            if (!Number.isFinite(balance) || Math.abs(balance) < 0.005) return;

            const prev = agg.get(key) || { outstandingBalance: 0, lastTransaction: null, customerName: '', customerId: inv.customerId || '', phone: '' };
            prev.outstandingBalance += balance;
            const d = inv.date || null;
            if (d && (!prev.lastTransaction || new Date(d).getTime() > new Date(prev.lastTransaction).getTime())) prev.lastTransaction = d;
            if (!prev.customerName) prev.customerName = inv.customerName || '';
            agg.set(key, prev);
        });

        const rows = Array.from(agg.entries()).map(([key, val]) => {
            const c = customerMap.get(val.customerId) || customers.find(x => x.name === (val.customerName || key));
            return {
                customerId: c?.id || val.customerId || '',
                customerName: c?.name || val.customerName || key,
                phone: c?.phone || '',
                outstandingBalance: val.outstandingBalance,
                lastTransaction: val.lastTransaction
            };
        }).filter(c => Math.abs(c.outstandingBalance) >= 0.005)
            .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

        this._outstandingCache = { at: now, data: rows };
        return rows;
    },

    // ========================================
    // 4. DASHBOARD ANALYTICS
    // ========================================

    /**
     * Get complete dashboard data
     * @param {{ mode?: 'month'|'fy', year?: number, month?: number, fyStartYear?: number }} [opts]
     */
    getDashboardData(opts = {}) {
        const today = new Date();
        const mode = opts.mode === 'fy' ? 'fy' : 'month';
        const year = opts.year != null ? opts.year : today.getFullYear();
        const month = opts.month != null ? opts.month : today.getMonth();

        const fyFromDate = (d) => (typeof DataManager.getFinancialYear === 'function')
            ? DataManager.getFinancialYear(d, true)
            : { startYear: (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1), label: '' };

        if (mode === 'fy') {
            let fyStart = opts.fyStartYear;
            if (fyStart == null || Number.isNaN(fyStart)) {
                fyStart = fyFromDate(new Date(year, month, 1)).startYear;
            }
            const fyLabel = `${fyStart}-${(fyStart + 1).toString().slice(-2)}`;
            return {
                periodSummary: `Showing full financial year ${fyLabel} (April–March).`,
                revenueCardLabel: `Revenue (FY ${fyLabel})`,
                expenseCardLabel: `Expenses (FY ${fyLabel})`,
                revenueCompareHint: 'vs previous FY',
                cashFlowChartHint: 'Chart is always for the selected financial year (Apr–Mar).',
                revenue: this.getRevenueMetricsForFY(fyStart),
                expenses: this.getExpenseMetricsForFY(fyStart),
                inventory: this.getInventoryMetrics(),
                customers: this.getCustomerMetricsForPeriod('fy', fyStart),
                cashFlow: this.getCashFlowData(fyStart),
                cashFlowFyLabel: fyLabel,
                recentActivity: this.getRecentActivityForDashboard({ mode: 'fy', fyStartYear: fyStart }),
                alerts: this.getAlerts()
            };
        }

        const ref = new Date(year, month, 1);
        const fy = fyFromDate(ref);
        if (!fy.label && fy.startYear != null) {
            fy.label = `${fy.startYear}-${(fy.startYear + 1).toString().slice(-2)}`;
        }
        const mn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month];
        return {
            periodSummary: `Showing ${mn} ${year}. Cash flow chart uses FY ${fy.label} (Apr–Mar).`,
            revenueCardLabel: `Revenue (${mn} ${year})`,
            expenseCardLabel: `Expenses (${mn} ${year})`,
            revenueCompareHint: 'vs last month',
            cashFlowChartHint: '',
            revenue: this.getRevenueMetrics(year, month),
            expenses: this.getExpenseMetrics(year, month),
            inventory: this.getInventoryMetrics(),
            customers: this.getCustomerMetricsForPeriod('month', year, month),
            cashFlow: this.getCashFlowData(fy.startYear),
            cashFlowFyLabel: fy.label,
            recentActivity: this.getRecentActivityForDashboard({ mode: 'month', year, month }),
            alerts: this.getAlerts()
        };
    },

    /**
     * Revenue for a full Indian FY (April fyStartYear → March fyStartYear+1).
     */
    getRevenueMetricsForFY(fyStartYear) {
        const invoices = DataManager.getData('invoices') || [];
        const fyTag = typeof DataManager.getFinancialYear === 'function'
            ? DataManager.getFinancialYear(new Date(fyStartYear, 3, 1))
            : '';
        const inFy = (inv) => !fyTag || DataManager.getFinancialYear(inv.date) === fyTag;
        const fyInv = invoices.filter(inFy);
        const total = fyInv.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);

        const prevTag = typeof DataManager.getFinancialYear === 'function'
            ? DataManager.getFinancialYear(new Date(fyStartYear - 1, 3, 1))
            : '';
        const prevTotal = prevTag
            ? invoices.filter(inv => DataManager.getFinancialYear(inv.date) === prevTag)
                .reduce((s, inv) => s + (parseFloat(inv.total) || 0), 0)
            : 0;

        const changePercent = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : (total > 0 ? 100 : 0);
        const pendingInvoices = invoices.filter(inv => inv.status === 'pending' || inv.status === 'unpaid');
        const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);

        return {
            currentMonth: total,
            previousMonth: prevTotal,
            changePercent: changePercent.toFixed(1),
            trend: changePercent >= 0 ? 'up' : 'down',
            pendingAmount,
            pendingCount: pendingInvoices.length,
            ytd: total,
            invoiceCount: fyInv.length
        };
    },

    /**
     * Expense totals for an Indian FY (tag string from DataManager.getFinancialYear).
     */
    _collectExpenseTotalsForFYTag(fyTagString) {
        const purchases = (typeof ExpenseManager !== 'undefined')
            ? ExpenseManager.getAllExpenses()
            : (DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('purchases') || []);
        const petty = DataManager.getData('expenses') || [];
        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || DataManager.getData('gtes_settings') || {};

        const inFy = (dateStr) =>
            typeof DataManager.getFinancialYear === 'function'
            && DataManager.getFinancialYear(dateStr) === fyTagString;

        let total = 0;
        let count = 0;
        const byCategory = {};

        purchases.forEach((r) => {
            if (!inFy(r.date)) return;
            const a = this._purchaseRowAmount(r);
            total += a;
            count++;
            const cat = r.category || 'Purchase';
            byCategory[cat] = (byCategory[cat] || 0) + a;
        });

        petty.forEach((r) => {
            if (!inFy(r.date)) return;
            const a = parseFloat(r.amount) || 0;
            total += a;
            count++;
            const cat = r.category || 'Other';
            byCategory[cat] = (byCategory[cat] || 0) + a;
        });

        const salaryPayouts = settings.salaryPayouts || {};
        Object.entries(salaryPayouts).forEach(([key, rec]) => {
            const parts = key.split('_');
            if (parts.length < 2) return;
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (Number.isNaN(y) || Number.isNaN(m)) return;
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            if (!inFy(dateStr)) return;
            let sal = parseFloat(rec.totalPaid) || 0;
            if (sal <= 0 && rec.individualPayouts && typeof rec.individualPayouts === 'object') {
                sal = Object.values(rec.individualPayouts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            }
            if (sal <= 0) return;
            total += sal;
            count++;
            byCategory.Salary = (byCategory.Salary || 0) + sal;
        });

        return { total, byCategory, count };
    },

    getExpenseMetricsForFY(fyStartYear) {
        const fyTag = typeof DataManager.getFinancialYear === 'function'
            ? DataManager.getFinancialYear(new Date(fyStartYear, 3, 1))
            : '';
        const prevTag = typeof DataManager.getFinancialYear === 'function'
            ? DataManager.getFinancialYear(new Date(fyStartYear - 1, 3, 1))
            : '';

        const cur = fyTag ? this._collectExpenseTotalsForFYTag(fyTag) : { total: 0, byCategory: {}, count: 0 };
        const prev = prevTag ? this._collectExpenseTotalsForFYTag(prevTag) : { total: 0, byCategory: {}, count: 0 };

        let changeVal = 0;
        if (prev.total > 0) {
            changeVal = ((cur.total - prev.total) / prev.total) * 100;
        } else if (cur.total > 0) {
            changeVal = 100;
        }

        return {
            currentMonth: cur.total,
            previousMonth: prev.total,
            changePercent: changeVal.toFixed(1),
            trend: changeVal >= 0 ? 'up' : 'down',
            byCategory: cur.byCategory,
            count: cur.count
        };
    },

    /**
     * Top customers for a calendar month or full FY.
     */
    getCustomerMetricsForPeriod(periodMode, yOrFyStart, monthOpt) {
        if (periodMode === 'fy' && typeof DataManager.getFinancialYear !== 'function') {
            return this.getCustomerMetrics();
        }
        const customers = (typeof CustomerManager !== 'undefined') ? CustomerManager.getAllCustomers() : [];
        const invoices = DataManager.getData('invoices') || [];
        const filtered = periodMode === 'fy'
            ? invoices.filter(inv =>
                typeof DataManager.getFinancialYear === 'function'
                && DataManager.getFinancialYear(inv.date) === DataManager.getFinancialYear(new Date(yOrFyStart, 3, 1)))
            : invoices.filter(inv => {
                const d = new Date(inv.date);
                return !isNaN(d.getTime()) && d.getFullYear() === yOrFyStart && d.getMonth() === monthOpt;
            });

        const customerRevenue = {};
        filtered.forEach(inv => {
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
     * Recent activity filtered to dashboard period (broader pools than getRecentActivity).
     */
    getRecentActivityForDashboard(opts) {
        const mode = opts && opts.mode === 'fy' ? 'fy' : 'month';
        if (mode === 'fy' && (!opts || opts.fyStartYear == null)) return this.getRecentActivity();
        if (mode === 'fy' && typeof DataManager.getFinancialYear !== 'function') return this.getRecentActivity();
        const invoices = DataManager.getData('invoices') || [];
        const expenses = DataManager.getData('expenses') || [];
        const purchases = (typeof ExpenseManager !== 'undefined')
            ? ExpenseManager.getAllExpenses()
            : (DataManager.getData(DataManager.KEYS.EXPENSES) || []);
        const vouchers = DataManager.getData('vouchers') || [];

        const inPeriod = (dateStr) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return false;
            if (mode === 'month') {
                return d.getFullYear() === opts.year && d.getMonth() === opts.month;
            }
            const tag = DataManager.getFinancialYear(new Date(opts.fyStartYear, 3, 1));
            return DataManager.getFinancialYear(dateStr) === tag;
        };

        const activities = [];

        invoices.filter(inv => inPeriod(inv.date)).slice(-40).forEach(inv => {
            activities.push({
                type: 'invoice',
                icon: 'bi-receipt',
                color: 'success',
                title: `Invoice #${inv.id}`,
                description: `${inv.customerName} - ₹${inv.total}`,
                date: inv.date
            });
        });

        vouchers.filter(v => inPeriod(v.date)).slice(-40).forEach(v => {
            activities.push({
                type: 'payment',
                icon: 'bi-cash',
                color: 'info',
                title: `Payment Received`,
                description: `${v.customerName} - ₹${v.amount}`,
                date: v.date
            });
        });

        purchases.filter(p => inPeriod(p.date)).slice(-40).forEach(p => {
            activities.push({
                type: 'expense',
                icon: 'bi-bag-check',
                color: 'danger',
                title: `Purchase`,
                description: `${p.vendor || p.vendorName || 'Vendor'} - ₹${this._purchaseRowAmount(p)}`,
                date: p.date
            });
        });

        expenses.filter(exp => inPeriod(exp.date)).slice(-40).forEach(exp => {
            activities.push({
                type: 'expense',
                icon: 'bi-wallet2',
                color: 'danger',
                title: `Expense`,
                description: `${exp.description || exp.category} - ₹${exp.amount}`,
                date: exp.date
            });
        });

        return activities
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);
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

    /** Purchase / vendor bill amount (purchases book). */
    _purchaseRowAmount(r) {
        return parseFloat(r.total ?? r.amount ?? r.grandTotal ?? 0) || 0;
    },

    /**
     * All cash expenses for dashboard: **purchases** book + optional petty `expenses` array + **salary** payouts marked in settings.
     */
    _collectExpenseTotalsForMonth(year, month) {
        const purchases = (typeof ExpenseManager !== 'undefined')
            ? ExpenseManager.getAllExpenses()
            : (DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('purchases') || DataManager.getData('gtes_expenses') || []);
        const petty = DataManager.getData('expenses') || [];

        const inMonth = (dateStr) => {
            const d = new Date(dateStr);
            return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
        };

        let total = 0;
        let count = 0;
        const byCategory = {};

        purchases.forEach((r) => {
            if (!inMonth(r.date)) return;
            const a = this._purchaseRowAmount(r);
            total += a;
            count++;
            const cat = r.category || 'Purchase';
            byCategory[cat] = (byCategory[cat] || 0) + a;
        });

        petty.forEach((r) => {
            if (!inMonth(r.date)) return;
            const a = parseFloat(r.amount) || 0;
            total += a;
            count++;
            const cat = r.category || 'Other';
            byCategory[cat] = (byCategory[cat] || 0) + a;
        });

        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || DataManager.getData('gtes_settings') || {};
        const rec = settings.salaryPayouts && settings.salaryPayouts[`${year}_${month}`];
        if (rec) {
            let sal = parseFloat(rec.totalPaid) || 0;
            if (sal <= 0 && rec.individualPayouts && typeof rec.individualPayouts === 'object') {
                sal = Object.values(rec.individualPayouts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            }
            if (sal > 0) {
                total += sal;
                count++;
                byCategory.Salary = (byCategory.Salary || 0) + sal;
            }
        }

        return { total, byCategory, count };
    },

    /**
     * Get expense metrics
     */
    getExpenseMetrics(year, month) {
        const cur = this._collectExpenseTotalsForMonth(year, month);
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const prev = this._collectExpenseTotalsForMonth(prevYear, prevMonth);

        let changeVal = 0;
        if (prev.total > 0) {
            changeVal = ((cur.total - prev.total) / prev.total) * 100;
        } else if (cur.total > 0) {
            changeVal = 100;
        }

        return {
            currentMonth: cur.total,
            previousMonth: prev.total,
            changePercent: changeVal.toFixed(1),
            trend: changeVal >= 0 ? 'up' : 'down',
            byCategory: cur.byCategory,
            count: cur.count
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
        const pettyExpenses = DataManager.getData('expenses') || [];
        const purchases = (typeof ExpenseManager !== 'undefined')
            ? ExpenseManager.getAllExpenses()
            : (DataManager.getData(DataManager.KEYS.EXPENSES) || DataManager.getData('purchases') || []);
        const vouchers = DataManager.getData('vouchers') || [];
        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || DataManager.getData('gtes_settings') || {};

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
        purchases.forEach(p => addSum(expenseByYm, p.date, this._purchaseRowAmount(p)));
        pettyExpenses.forEach(exp => addSum(expenseByYm, exp.date, parseFloat(exp.amount) || 0));
        const salaryPayouts = settings.salaryPayouts || {};
        Object.entries(salaryPayouts).forEach(([key, rec]) => {
            const parts = key.split('_');
            if (parts.length < 2) return;
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            if (Number.isNaN(y) || Number.isNaN(m)) return;
            let sal = parseFloat(rec.totalPaid) || 0;
            if (sal <= 0 && rec.individualPayouts && typeof rec.individualPayouts === 'object') {
                sal = Object.values(rec.individualPayouts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            }
            if (sal <= 0) return;
            const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
            addSum(expenseByYm, dateStr, sal);
        });
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
        const purchases = (typeof ExpenseManager !== 'undefined')
            ? ExpenseManager.getAllExpenses()
            : (DataManager.getData(DataManager.KEYS.EXPENSES) || []);
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

        // Add recent purchase bills
        purchases.slice(-10).forEach(p => {
            activities.push({
                type: 'expense',
                icon: 'bi-bag-check',
                color: 'danger',
                title: `Purchase`,
                description: `${p.vendor || p.vendorName || 'Vendor'} - ₹${this._purchaseRowAmount(p)}`,
                date: p.date
            });
        });

        // Add recent petty expenses (if stored separately)
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
                action: 'View',
                invoiceId: inv.id
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

        const titleKind = ledger.accountGroup === 'vendor' ? 'Vendor'
            : ledger.accountGroup === 'ledger' || ledger.ledgerKind === 'general' ? 'General Ledger'
                : 'Customer';
        let csv = `${titleKind} - ${ledger.customer.name}\n`;
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
