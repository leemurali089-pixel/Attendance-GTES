/**
 * Read-only dashboard aggregates — uses existing managers only (no duplicate business rules).
 * Safe fallbacks when managers are unavailable.
 */
(function (global) {
  const THRESH = 0.05;

  function _indianFYParts(fyStr) {
    const s = String(fyStr || "").trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return null;
    const y0 = parseInt(m[1], 10);
    const y1Short = parseInt(m[2], 10);
    if (!Number.isFinite(y0) || !Number.isFinite(y1Short)) return null;
    const y1 = 2000 + y1Short;
    if (y1 !== y0 + 1) return null;
    return { y0, y1 };
  }

  function getIndianFYEndDate(fyStr) {
    const p = _indianFYParts(fyStr);
    if (!p) return null;
    return new Date(p.y1, 2, 31, 23, 59, 59, 999);
  }

  function _resolveAsOfEnd() {
    if (typeof window === "undefined" || !window.__gtesDashFY) return null;
    return getIndianFYEndDate(window.__gtesDashFY);
  }

  function _docOnOrBefore(doc, asOfEnd) {
    if (!asOfEnd) return true;
    const d = new Date(doc.date || doc.invoiceDate || doc.billDate || doc.voucherDate);
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() <= asOfEnd.getTime();
  }

  /** Calendar year + month index (0–11) from a stored date — prefers YYYY-MM-DD so TZ skew does not shift the month. */
  function _docYearMonth(dateVal) {
    if (dateVal == null || dateVal === "") return null;
    if (typeof dateVal === "string") {
      const s = dateVal.trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (m) {
        const y = parseInt(m[1], 10);
        const m0 = parseInt(m[2], 10) - 1;
        if (Number.isFinite(y) && m0 >= 0 && m0 <= 11) return { y, m0 };
      }
    }
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return null;
    return { y: d.getFullYear(), m0: d.getMonth() };
  }

  function _salesInvoicesWithBalance() {
    if (typeof InvoiceManager !== "undefined" && typeof InvoiceManager.getInvoicesWithBalance === "function") {
      return InvoiceManager.getInvoicesWithBalance() || [];
    }
    const invoices = (typeof DataManager !== "undefined" && DataManager.getData("invoices")) || [];
    return invoices.map((inv) => ({
      ...inv,
      balance: parseFloat(inv.total ?? inv.amount ?? 0) || 0,
      isPaid: false,
      isPartial: false,
    }));
  }

  function _isDc(inv) {
    return typeof InvoiceManager !== "undefined" && InvoiceManager.isDcStyleSalesInvoice && InvoiceManager.isDcStyleSalesInvoice(inv);
  }

  function _isCreditNoteSales(inv) {
    if (!inv) return false;
    if (typeof InvoiceManager !== "undefined" && typeof InvoiceManager._isCreditNoteDoc === "function") {
      return InvoiceManager._isCreditNoteDoc(inv);
    }
    const t = String(inv.type || "").toLowerCase();
    if (t.includes("credit") && t.includes("note")) return true;
    if (t.includes("sales") && t.includes("return")) return true;
    if (inv.isCreditNote === true) return true;
    const bk = String(inv.bookkeeperVchType || inv.v_type || "").toLowerCase();
    if (bk.includes("credit note") || bk.includes("sales return")) return true;
    const no = String(inv.invoiceNo || inv.id || "").toUpperCase();
    if (/\/(CR|CN)\d+(\b|\/|$)/.test(no)) return true;
    if (/^(CR|CN)[-/]?\d+/.test(no)) return true;
    return false;
  }

  function _invoiceBusinessKey(inv) {
    if (!inv) return "";
    if (typeof DataManager !== "undefined" && typeof DataManager._financialRecordMergeKey === "function") {
      return DataManager._financialRecordMergeKey(inv, "invoices") || "";
    }
    const bk = String(inv.bookkeeperId || "").trim();
    if (bk) return `ibk:${bk}`;
    const noKey =
      typeof DataManager !== "undefined" && typeof DataManager._normalizeDocNumberKey === "function"
        ? DataManager._normalizeDocNumberKey(inv.invoiceNo || inv.billNo || inv.id)
        : String(inv.invoiceNo || inv.billNo || inv.id || "").trim();
    const party =
      typeof DataManager !== "undefined" && typeof DataManager._normalizeKeyToken === "function"
        ? DataManager._normalizeKeyToken(inv.customerId || inv.partyId || inv.customerName || "")
        : String(inv.customerId || inv.partyId || inv.customerName || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    if (noKey && party) return `inv:${party}|${noKey}`;
    if (noKey) return `invno:${noKey}`;
    return inv.id != null ? `id:${inv.id}` : "";
  }

  function _isVoidOrCancelled(inv) {
    const s = String(inv?.status || "").toLowerCase();
    return s === "cancelled" || s === "canceled" || s === "void";
  }

  /** Collapse duplicate pending rows (web localStorage + cloud union produced twin ids). */
  function _dedupePendingSalesRows(rows) {
    const map = new Map();
    (rows || []).forEach((inv) => {
      const key = _invoiceBusinessKey(inv);
      if (!key) return;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, inv);
        return;
      }
      const pt = Date.parse(prev.updatedAt || prev.createdAt || 0) || 0;
      const nt = Date.parse(inv.updatedAt || inv.createdAt || 0) || 0;
      const pick = nt >= pt ? inv : prev;
      const balPick = (parseFloat(pick.balance) || 0) <= (parseFloat(prev.balance) || 0) + 0.05 &&
        (parseFloat(pick.balance) || 0) <= (parseFloat(inv.balance) || 0) + 0.05
        ? pick
        : (parseFloat(inv.balance) || 0) < (parseFloat(prev.balance) || 0) ? inv : prev;
      map.set(key, balPick);
    });
    return Array.from(map.values());
  }

  function _salesScopeFilter(inv, scope) {
    if (typeof InvoiceManager !== "undefined" && InvoiceManager.isGstSalesListRow && InvoiceManager.isPlainSalesListRow) {
      if (scope === "gst") return InvoiceManager.isGstSalesListRow(inv);
      if (scope === "plain") return InvoiceManager.isPlainSalesListRow(inv);
      return true;
    }
    const gst =
      typeof InvoiceManager !== "undefined" && InvoiceManager.isGSTType
        ? InvoiceManager.isGSTType(inv.type)
        : String(inv.type || "").includes("bill");
    if (scope === "gst") return gst;
    if (scope === "plain") return !gst;
    return true;
  }

  function _pendingSalesRows(scope, limit) {
    const asOf = _resolveAsOfEnd();
    let rows = _salesInvoicesWithBalance()
      .filter((inv) => !_isDc(inv))
      .filter((inv) => !_isVoidOrCancelled(inv))
      .filter((inv) => _salesScopeFilter(inv, scope))
      .filter((inv) => !_isCreditNoteSales(inv));
    rows = rows.filter((inv) => (parseFloat(inv.balance) || 0) > THRESH);
    if (asOf) rows = rows.filter((inv) => _docOnOrBefore(inv, asOf));
    rows = _dedupePendingSalesRows(rows);
    rows.sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0));
    const lim = Math.min(Math.max(1, limit || 500), 20000);
    const top = rows.slice(0, lim);
    const now = new Date();
    return top.map((inv) => {
      const bal = parseFloat(inv.balance) || 0;
      let d = "";
      if (inv.dueDate) {
        try {
          const due = new Date(inv.dueDate);
          const days = Math.ceil((due - now) / 86400000);
          if (days < 0) d = `Overdue ${Math.abs(days)} day(s)`;
          else if (days === 0) d = "Due today";
          else d = `Due in ${days} day(s)`;
        } catch (_) {
          /* ignore */
        }
      }
      if (!d) {
        if (inv.isPartial) d = "Partial";
        else d = "Open balance";
      }
      const label = `${inv.invoiceNo || inv.id || "?"} / ${inv.customerName || "Party"}`;
      const soft = bal > 200000 ? "danger-soft" : bal > 80000 ? "warn-soft" : "ok-soft";
      return { n: label, a: bal, d, s: soft, rid: inv.id != null ? String(inv.id) : "" };
    });
  }

  function _pendingSalesPartyRows(scope, limit) {
    const asOf = _resolveAsOfEnd();
    let rows = _salesInvoicesWithBalance()
      .filter((inv) => !_isDc(inv))
      .filter((inv) => !_isVoidOrCancelled(inv))
      .filter((inv) => _salesScopeFilter(inv, scope))
      .filter((inv) => !_isCreditNoteSales(inv));
    rows = rows.filter((inv) => (parseFloat(inv.balance) || 0) > THRESH);
    if (asOf) rows = rows.filter((inv) => _docOnOrBefore(inv, asOf));
    rows = _dedupePendingSalesRows(rows);
    const map = new Map();
    rows.forEach((inv) => {
      const party = inv.customerName || inv.customerId || "Party";
      const prev = map.get(party) || { sum: 0, count: 0 };
      prev.sum += parseFloat(inv.balance) || 0;
      prev.count += 1;
      map.set(party, prev);
    });
    const lim = Math.min(Math.max(1, limit || 500), 20000);
    return [...map.entries()]
      .map(([party, v]) => {
        const soft = v.sum > 200000 ? "danger-soft" : v.sum > 80000 ? "warn-soft" : "ok-soft";
        return { n: party, a: v.sum, d: `${v.count} pending invoice(s)`, s: soft, rid: null };
      })
      .sort((a, b) => b.a - a.a)
      .slice(0, lim);
  }

  function _pendingSalesTotals(scope) {
    const asOf = _resolveAsOfEnd();
    let rows = _salesInvoicesWithBalance()
      .filter((inv) => !_isDc(inv))
      .filter((inv) => !_isVoidOrCancelled(inv))
      .filter((inv) => _salesScopeFilter(inv, scope))
      .filter((inv) => !_isCreditNoteSales(inv));
    let pending = rows
      .filter((inv) => (parseFloat(inv.balance) || 0) > THRESH);
    if (asOf) pending = pending.filter((inv) => _docOnOrBefore(inv, asOf));
    pending = _dedupePendingSalesRows(pending);
    const totalBalance = pending.reduce((s, inv) => s + (parseFloat(inv.balance) || 0), 0);
    return { totalBalance, count: pending.length };
  }

  function _isDebitNotePurchaseDoc(exp) {
    if (!exp) return false;
    const t = String(exp.type || exp.v_type || exp.billType || "").toLowerCase();
    const billNo = String(exp.billNo || exp.bookkeeperVchNo || exp.id || "").toUpperCase();
    if (t === "debit-note" || t === "debit_note") return true;
    if (t.includes("debit") && t.includes("note")) return true;
    if (t.includes("purchase") && t.includes("return")) return true;
    if (/^PRR/.test(billNo) || /^DN/.test(billNo) || /^DRN/.test(billNo)) return true;
    if (exp.isDebitNote === true) return true;
    return false;
  }

  function _mapPurchasesWithBalance() {
    const expenses =
      (typeof DataManager !== "undefined" &&
        DataManager.getData(DataManager.KEYS.EXPENSES || "purchases")) ||
      (typeof DataManager !== "undefined" && DataManager.getData("gtes_expenses")) ||
      [];
    const raw = (Array.isArray(expenses) ? expenses : []).filter((p) => (p.category || "").toLowerCase().includes("purchase"));
    const voucherMap =
      typeof VoucherManager !== "undefined" && VoucherManager.getVoucherAllocationsMap ? VoucherManager.getVoucherAllocationsMap(null, "payment") : new Map();

    return raw.map((p) => {
      const isDebitNote = _isDebitNotePurchaseDoc(p);
      const docTotal = Math.abs(parseFloat(p.total ?? p.amount ?? p.vch_amt ?? 0) || 0);
      let balance =
        typeof VoucherManager !== "undefined"
          ? isDebitNote
            ? 0
            : VoucherManager.getDocumentBalance(p.id, docTotal, voucherMap, p.billNo || p.vch_no || p.invoiceNo, p, { allowLooseFallback: false })
          : isDebitNote
            ? 0
            : docTotal;
      const importedStatus = String(p.status || "").toLowerCase();
      if (!isDebitNote && balance >= docTotal - THRESH) {
        if (importedStatus === "paid") balance = 0;
        else if (importedStatus === "partial") balance = Math.max(0.01, docTotal * 0.5);
      }
      return {
        ...p,
        balance,
        isPaid: isDebitNote ? true : balance <= THRESH,
        isPartial: balance > THRESH && balance < docTotal - THRESH,
      };
    });
  }

  function _purchaseScopeFilter(p, scope) {
    const bill = String(p.billNo || p.invoiceNo || "");
    const wb = /^PUR-WB/i.test(bill);
    const nb = /^PUR-NB/i.test(bill);
    const im = typeof InvoiceManager !== "undefined" && InvoiceManager.isGSTType ? InvoiceManager : null;
    if (scope === "gst") {
      if (nb) return false;
      if (wb) return true;
      return im ? im.isGSTType(p.type) : true;
    }
    if (scope === "plain") {
      if (wb) return false;
      if (nb) return true;
      return im ? !im.isGSTType(p.type) : false;
    }
    return true;
  }

  function _supplierDueRows(scope, limit) {
    const asOf = _resolveAsOfEnd();
    let rows = _mapPurchasesWithBalance().filter((p) => _purchaseScopeFilter(p, scope));
    rows = rows.filter((p) => (parseFloat(p.balance) || 0) > THRESH);
    if (asOf) rows = rows.filter((p) => _docOnOrBefore(p, asOf));
    rows.sort((a, b) => (parseFloat(b.balance) || 0) - (parseFloat(a.balance) || 0));
    const lim = Math.min(Math.max(1, limit || 500), 20000);
    return rows.slice(0, lim).map((p) => {
      const bal = parseFloat(p.balance) || 0;
      const soft = bal > 80000 ? "danger-soft" : bal > 40000 ? "warn-soft" : "ok-soft";
      const bill = p.billNo || p.invoiceNo || p.id || "?";
      const vendor = String(p.vendor || p.vendorName || "Vendor");
      return {
        n: `${bill} — ${vendor}`,
        a: bal,
        d: "Payable balance",
        s: soft,
        rid: p.id != null ? String(p.id) : "",
      };
    });
  }

  function _supplierDuePartyRows(scope, limit) {
    const asOf = _resolveAsOfEnd();
    let rows = _mapPurchasesWithBalance().filter((p) => _purchaseScopeFilter(p, scope));
    rows = rows.filter((p) => (parseFloat(p.balance) || 0) > THRESH);
    if (asOf) rows = rows.filter((p) => _docOnOrBefore(p, asOf));
    const map = new Map();
    rows.forEach((p) => {
      const vname = String(p.vendor || p.vendorName || "Vendor");
      const prev = map.get(vname) || { sum: 0, count: 0 };
      prev.sum += parseFloat(p.balance) || 0;
      prev.count += 1;
      map.set(vname, prev);
    });
    const lim = Math.min(Math.max(1, limit || 500), 20000);
    return [...map.entries()]
      .map(([vendor, v]) => ({
        n: vendor,
        a: v.sum,
        d: `${v.count} payable bill(s)`,
        s: v.sum > 80000 ? "danger-soft" : v.sum > 40000 ? "warn-soft" : "ok-soft",
        rid: null,
      }))
      .sort((a, b) => b.a - a.a)
      .slice(0, lim);
  }

  function _supplierDueTotals(scope) {
    const asOf = _resolveAsOfEnd();
    const rows = _mapPurchasesWithBalance().filter((p) => _purchaseScopeFilter(p, scope));
    let pend = rows.filter((p) => (parseFloat(p.balance) || 0) > THRESH);
    if (asOf) pend = pend.filter((p) => _docOnOrBefore(p, asOf));
    const totalBalance = pend.reduce((s, p) => s + (parseFloat(p.balance) || 0), 0);
    return { totalBalance, count: pend.length };
  }

  function _taskDueLabel(task) {
    if (task.status === "completed") return false;
    const now = new Date();
    const due = new Date(task.followupDate + "T" + (task.followupTime || "00:00"));
    const todayStr = now.toISOString().split("T")[0];
    const overdue = due < now;
    const isToday = task.followupDate === todayStr;
    return overdue || isToday;
  }

  function _dueTasksSlice(scope, limit) {
    const asOf = _resolveAsOfEnd();
    const asIso = asOf ? asOf.toISOString().slice(0, 10) : null;
    const tasks = (typeof DataManager !== "undefined" && DataManager.getData(DataManager.KEYS.TASKS)) || [];
    let open = tasks.filter((t) => t.status !== "completed" && _taskDueLabel(t));
    if (asIso) open = open.filter((t) => !t.followupDate || String(t.followupDate) <= asIso);
    void scope;
    open.sort((a, b) => String(a.followupDate).localeCompare(String(b.followupDate)));
    return open.slice(0, limit).map((t) => {
      const now = new Date();
      const due = new Date(t.followupDate + "T" + (t.followupTime || "00:00"));
      const overdue = due < now && t.status !== "completed";
      const todayStr = now.toISOString().split("T")[0];
      const isToday = t.followupDate === todayStr;
      const d = overdue ? "Overdue" : isToday ? "Due today" : "Upcoming";
      const soft = overdue ? "danger-soft" : isToday ? "warn-soft" : "ok-soft";
      return {
        n: String(t.narration || "Task").slice(0, 120),
        a: 1,
        d,
        s: soft,
        tid: t.id != null ? String(t.id) : "",
      };
    });
  }

  function _dueTaskTotalCount() {
    const asOf = _resolveAsOfEnd();
    const asIso = asOf ? asOf.toISOString().slice(0, 10) : null;
    const tasks = (typeof DataManager !== "undefined" && DataManager.getData(DataManager.KEYS.TASKS)) || [];
    return tasks.filter((t) => {
      if (t.status === "completed" || !_taskDueLabel(t)) return false;
      if (asIso && t.followupDate && String(t.followupDate) > asIso) return false;
      return true;
    }).length;
  }

  function _materialNameFromInventory(materialId) {
    if (!materialId || typeof DataManager === "undefined") return "";
    const inv = DataManager.getData("inventory") || [];
    const m = inv.find((x) => x && String(x.id) === String(materialId));
    return m && m.name ? String(m.name) : "";
  }

  /** One row per material: worst (minimum) closing across transactions; threshold ≤ 5 (incl. negative). */
  function _stockAlerts(limit) {
    const tx = (typeof DataManager !== "undefined" && DataManager.getData("inventoryTransactions")) || [];
    const byMat = new Map();
    tx.forEach((r) => {
      const mid = r.materialId || r.itemId;
      if (!mid) return;
      const q = Number(r?.closingStock ?? r?.quantity ?? 0);
      if (Number.isNaN(q)) return;
      const prev = byMat.get(mid);
      if (!prev || q < prev.q) byMat.set(mid, { q, r });
    });
    const rowsAll = [...byMat.entries()]
      .filter(([, v]) => v.q <= 5)
      .map(([mid, v]) => {
        const q = v.q;
        const nm =
          _materialNameFromInventory(mid) ||
          String(v.r.itemName || v.r.materialName || v.r.particulars || v.r.stockItem || v.r.name || mid);
        return {
          n: nm,
          a: q,
          d: `${q} units`,
          s: q <= 0 ? "danger-soft" : "warn-soft",
          rid: String(mid),
        };
      })
      .sort((a, b) => a.a - b.a);
    const lim = Math.min(Math.max(1, limit || 500), 20000);
    return {
      rows: rowsAll.slice(0, lim),
      totalCount: rowsAll.length,
    };
  }

  function _monthYearLabel(y, m0) {
    const mon = new Date(y, m0, 1).toLocaleString("en-IN", { month: "short" });
    return `${mon}-${y}`;
  }

  function _monthSeriesRolling(monthsBack) {
    const labels = [];
    const keys = [];
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      keys.push({ y, m });
      labels.push(_monthYearLabel(y, m));
    }
    return { labels, keys };
  }

  function _monthSeriesIndianFY(fyStr) {
    const p = _indianFYParts(fyStr);
    if (!p) return _monthSeriesRolling(12);
    const { y0, y1 } = p;
    const keys = [];
    const labels = [];
    for (let i = 0; i < 12; i++) {
      const m0 = (3 + i) % 12;
      const y = m0 >= 3 ? y0 : y1;
      keys.push({ y, m: m0 });
      labels.push(_monthYearLabel(y, m0));
    }
    return { labels, keys };
  }

  function _salesTotalMonth(year, month0, scope) {
    if (scope === "gst" && typeof BusinessAnalytics !== "undefined" && typeof BusinessAnalytics.generateGSTR1 === "function") {
      try {
        const g = BusinessAnalytics.generateGSTR1(year, month0);
        return parseFloat(g.totals.totalSalesAmount) || 0;
      } catch (_) {
        /* fall through */
      }
    }
    const invoices = (typeof DataManager !== "undefined" && DataManager.getData("invoices")) || [];
    let list = invoices.filter((inv) => {
      const ym = _docYearMonth(inv.date);
      return ym && ym.y === year && ym.m0 === month0;
    });
    const im =
      typeof InvoiceManager !== "undefined"
        ? InvoiceManager
        : { isGSTType: () => true, isDcStyleSalesInvoice: () => false };
    list = list.filter((inv) => {
      if (im.isDcStyleSalesInvoice && im.isDcStyleSalesInvoice(inv)) return false;
      if (im.isGstSalesListRow && im.isPlainSalesListRow) {
        if (scope === "gst") return im.isGstSalesListRow(inv);
        if (scope === "plain") return im.isPlainSalesListRow(inv);
        return true;
      }
      if (scope === "gst") return im.isGSTType(inv.type);
      if (scope === "plain") return !im.isGSTType(inv.type);
      return true;
    });
    return list.reduce((s, inv) => s + (parseFloat(inv.total) || 0), 0);
  }

  function _purchaseExpenseMonth(year, month0, scope) {
    const BA = typeof BusinessAnalytics !== "undefined" ? BusinessAnalytics : null;
    let monthRows = [];
    if (BA && typeof BA._getMonthPurchaseExpenses === "function") {
      monthRows = BA._getMonthPurchaseExpenses(year, month0);
    } else {
      const pool =
        (typeof DataManager !== "undefined" && DataManager.getData("purchases")) ||
        (typeof DataManager !== "undefined" && DataManager.getData("gtes_expenses")) ||
        [];
      const arr = Array.isArray(pool) ? pool : [];
      monthRows = arr.filter((p) => {
        const ym = _docYearMonth(p.date);
        if (!ym || ym.y !== year || ym.m0 !== month0) return false;
        const cat = (p.category || "").toLowerCase();
        if (cat.includes("purchase") || cat.includes("inward") || cat.includes("supplier")) return true;
        if (p.vendor || p.vendorName) return true;
        return false;
      });
    }
    monthRows = monthRows.filter((p) => _purchaseScopeFilter(p, scope));
    return monthRows.reduce(
      (s, p) => s + (parseFloat(p.amount) || parseFloat(p.total) || parseFloat(p.totalAmount) || 0),
      0
    );
  }

  function buildLiveDataset(scope, opts) {
    opts = opts || {};
    const lim = 100;
    const fy = opts.fy || (typeof window !== "undefined" && window.__gtesDashFY) || "";
    const sales = _pendingSalesTotals(scope);
    const pur = _supplierDueTotals(scope);
    const dueTasks = _dueTasksSlice(scope, lim);
    const stock = _stockAlerts(lim);
    const { labels, keys } = fy && getIndianFYEndDate(fy) ? _monthSeriesIndianFY(fy) : _monthSeriesRolling(12);
    const r = [];
    const e = [];
    for (const k of keys) {
      r.push(_salesTotalMonth(k.y, k.m, scope));
      e.push(_purchaseExpenseMonth(k.y, k.m, scope));
    }

    return {
      pendingInvoices: _pendingSalesRows(scope, lim),
      supplierDues: _supplierDueRows(scope, lim),
      dueTasks,
      stockAlerts: stock.rows,
      c: { l: labels, r, e },
      _meta: {
        pendingSalesTotal: sales.totalBalance,
        pendingSalesCount: sales.count,
        supplierOwingTotal: pur.totalBalance,
        supplierOwingCount: pur.count,
        dueTaskCount: _dueTaskTotalCount(),
        stockAlertCount: stock.totalCount,
      },
    };
  }

  global.DashboardQueries = {
    buildLiveDataset,
    getIndianFYEndDate,
    THRESH,
    getPendingSalesRows: (scope, lim) => _pendingSalesRows(scope, lim),
    getPendingSalesPartyRows: (scope, lim) => _pendingSalesPartyRows(scope, lim),
    getSupplierDueRows: (scope, lim) => _supplierDueRows(scope, lim),
    getSupplierDuePartyRows: (scope, lim) => _supplierDuePartyRows(scope, lim),
    getPendingSalesTotals: (scope) => _pendingSalesTotals(scope),
    getSupplierDueTotals: (scope) => _supplierDueTotals(scope),
    getStockAlertRows: (lim) => _stockAlerts(lim),
    getDueTaskRows: (scope, lim) => _dueTasksSlice(scope, lim),
  };
})(typeof window !== "undefined" ? window : globalThis);
