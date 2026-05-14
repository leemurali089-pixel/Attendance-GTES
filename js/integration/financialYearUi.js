/**
 * Shared Indian FY helpers for list filters (Invoices, Vouchers, Delivery history, etc.).
 * FY keys match DataManager.getFinancialYear(): "2025-26" (start year + 2-digit end year).
 */
(function (global) {
  function ymFromIsoDate(dateVal) {
    if (dateVal == null || dateVal === "") return "";
    if (typeof dateVal === "string") {
      const s = dateVal.trim();
      const m = /^(\d{4})-(\d{2})/.exec(s);
      if (m) return `${m[1]}-${m[2]}`;
    }
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function fyKeysFromDates(dateValues) {
    const seen = new Set();
    const dm = typeof DataManager !== "undefined" ? DataManager : null;
    if (!dm || typeof dm.getFinancialYear !== "function") return [];
    (dateValues || []).forEach((d) => {
      if (d == null || d === "") return;
      const fy = dm.getFinancialYear(d);
      if (fy) seen.add(fy);
    });
    return [...seen].sort((a, b) => parseInt(String(b).slice(0, 4), 10) - parseInt(String(a).slice(0, 4), 10));
  }

  /** Display label e.g. 2025-26 → "2025-2026" for dropdown text. */
  function fyLabelDisplay(fyKey) {
    const s = String(fyKey || "").trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return s;
    const y0 = parseInt(m[1], 10);
    const y1 = 2000 + parseInt(m[2], 10);
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) return s;
    return `${y0}-${y1}`;
  }

  function defaultFyKey() {
    const dm = typeof DataManager !== "undefined" ? DataManager : null;
    if (!dm || typeof dm.getFinancialYear !== "function") return "";
    return dm.getFinancialYear(new Date()) || "";
  }

  /** Today as YYYY-MM (local calendar) for capping the current FY month list. */
  function currentYmCalendar() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function isCurrentIndianFy(fyKey) {
    const dm = typeof DataManager !== "undefined" ? DataManager : null;
    if (!dm || typeof dm.getFinancialYear !== "function") return false;
    const cur = String(dm.getFinancialYear(new Date()) || "").trim();
    const sel = String(fyKey || "").trim();
    return cur !== "" && cur === sel;
  }

  /**
   * Default FY + calendar month for filter UIs.
   * @param {string[]} fyKeysInDropdown FY keys actually present in the FY dropdown (from data). If non-empty and current FY is missing, returns empty fyKey.
   */
  function defaultFyMonthSelectionForUi(fyKeysInDropdown) {
    const fy = defaultFyKey();
    const ym = currentYmCalendar();
    if (!fy) return { fyKey: "", monthYm: "" };
    const list = Array.isArray(fyKeysInDropdown) ? fyKeysInDropdown.filter(Boolean) : [];
    if (list.length > 0 && !list.includes(fy)) {
      return { fyKey: "", monthYm: "" };
    }
    return { fyKey: fy, monthYm: ym };
  }

  /** <option> list: All months in FY + Apr…Mar with value YYYY-MM (calendar month). */
  function indianFyMonthOptionsHtml(fyKey, selectedYm) {
    const s = String(fyKey || "").trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) {
      return `<option value="">${escAttr("All months")}</option>`;
    }
    const y0 = parseInt(m[1], 10);
    const y1short = parseInt(m[2], 10);
    const y1 = 2000 + y1short;
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) {
      return `<option value="">${escAttr("All months")}</option>`;
    }
    const sel = String(selectedYm || "").trim();
    const capYm = isCurrentIndianFy(s) ? currentYmCalendar() : "";
    let html = `<option value=""${sel === "" ? " selected" : ""}>All months in FY</option>`;
    for (let i = 0; i < 12; i++) {
      const m0 = (3 + i) % 12;
      const y = m0 >= 3 ? y0 : y1;
      const ym = `${y}-${String(m0 + 1).padStart(2, "0")}`;
      if (capYm && ym > capYm) continue;
      const lab = new Date(y, m0, 1).toLocaleString("en-IN", { month: "short" });
      html += `<option value="${ym}"${sel === ym ? " selected" : ""}>${escAttr(`${lab}-${y}`)}</option>`;
    }
    return html;
  }

  function escAttr(t) {
    return String(t ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  global.GTESFinancialYearUi = {
    ymFromIsoDate,
    fyKeysFromDates,
    fyLabelDisplay,
    defaultFyKey,
    currentYmCalendar,
    defaultFyMonthSelectionForUi,
    indianFyMonthOptionsHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
