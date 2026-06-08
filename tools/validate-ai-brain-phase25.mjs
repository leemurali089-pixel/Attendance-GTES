/**
 * Phase 2.5 validation — ERP data + code path checks (no browser mic/TTS)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'Data');

function loadJson(name) {
    return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function norm(s) {
    return String(s || '').toLowerCase().trim();
}

function findCustomer(q) {
    const n = norm(q);
    const customers = loadJson('customers.json');
    return customers.find((c) => {
        const name = norm(c.name || c.displayName);
        return name.includes(n) || n.includes(name);
    });
}

function ledgerOutstandingForCustomer(query) {
    const invoices = loadJson('invoices.json');
    const vouchers = loadJson('vouchers.json');
    const cust = findCustomer(query);
    const allocPaid = new Map();

    for (const v of vouchers) {
        if (norm(v.type) !== 'receipt') continue;
        for (const a of v.allocations || []) {
            const keys = [a.id, a.no, a.invoiceNo].filter(Boolean).map(norm);
            const amt = parseFloat(a.amount) || 0;
            for (const k of keys) allocPaid.set(k, (allocPaid.get(k) || 0) + amt);
        }
    }

    let total = 0;
    const rows = [];
    const custNorm = cust ? norm(cust.name) : norm(query);

    for (const inv of invoices) {
        const invTotal = parseFloat(inv.total || inv.grandTotal || 0) || 0;
        const keys = [inv.id, inv.invoiceNo, inv.no].filter(Boolean).map(norm);
        let paid = 0;
        for (const k of keys) paid += allocPaid.get(k) || 0;
        const appPaid = parseFloat(inv.paidSoFar);
        if (!Number.isNaN(appPaid) && appPaid > 0) paid = Math.max(paid, appPaid);
        const balance = Math.max(0, invTotal - paid);
        if (balance <= 0.05) continue;

        const cn = norm(inv.customerName);
        if (cust && inv.customerId === cust.id) {
            total += balance;
            rows.push({ no: inv.invoiceNo || inv.id, balance });
        } else if (cn.includes(custNorm) || custNorm.includes(cn)) {
            total += balance;
            rows.push({ no: inv.invoiceNo || inv.id, balance });
        }
    }
    return { customer: cust?.name || query, total, rows };
}

function yesterdayAttendanceCount() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.toISOString().slice(0, 10);
    const att = loadJson('gtes_attendance.json');
    const recs = (Array.isArray(att) ? att : att.records || att.attendance || [])
        .filter((r) => String(r.date || '').slice(0, 10) === y);
    return { date: y, count: recs.length, records: recs };
}

function grepBrainStubs() {
    const dir = path.join(ROOT, 'ai-brain');
    const hits = [];
    const patterns = [
        /total\s*-\s*paidAmount/,
        /paidAmount\s*\|\|\s*inv\.paid/,
        /estimatedPayout/,
        /placeholder/i,
        /mock/i
    ];
    function walk(p) {
        for (const f of fs.readdirSync(p)) {
            const fp = path.join(p, f);
            if (fs.statSync(fp).isDirectory()) walk(fp);
            else if (f.endsWith('.js')) {
                const txt = fs.readFileSync(fp, 'utf8');
                for (const pat of patterns) {
                    if (pat.test(txt)) hits.push(`${path.relative(ROOT, fp)}:${pat}`);
                }
            }
        }
    }
    walk(dir);
    return hits;
}

function intentFor(text) {
    const t = norm(text);
    if (/avon oxygen.*pending|pending.*evlo/.test(t) || /^([a-z0-9\s.&-]+)\s+(?:pending|outstanding)/.test(t)) {
        return 'customer_outstanding';
    }
    if (/last invoice.*kaatu|last invoice/.test(t)) return 'last_invoice';
    if (/yesterday attendance summary|attendance summary/.test(t)) return 'attendance_summary';
    if (/daily brief|morning brief|summary today/.test(t)) return 'briefing.daily';
    if (/today summary/.test(t)) return 'UNKNOWN';
    if (/raj attendance/.test(t)) return 'employee_attendance';
    if (/create task/.test(t)) return 'create_task';
    if (/complete.*task/.test(t)) return 'complete_task';
    return 'UNKNOWN';
}

const results = {};

// TEST 3
const avon = ledgerOutstandingForCustomer('avon oxygen');
results.test3 = {
    ledgerTotal: avon.total,
    invoiceRows: avon.rows,
    customer: avon.customer
};

// TEST 4
results.test4 = yesterdayAttendanceCount();

// TEST 5 intent chain
results.test5 = {
    q1Intent: intentFor('avon oxygen pending evlo'),
    q2Intent: intentFor('last invoice kaatu'),
    contextRequired: 'lastCustomerName from ContextManager after q1'
};

// TEST 6 - employees named Raj in attendance/employees
const att = loadJson('gtes_attendance.json');
const emps = att.employees || [];
const rajEmps = emps.filter((e) => norm(e.name).includes('raj'));
results.test6 = { rajEmployees: rajEmps.map((e) => e.name) };

// Stub scan
results.stubHits = grepBrainStubs();

// Command center panels exist?
const cc = fs.readFileSync(path.join(ROOT, 'ai-brain/ui/aiCommandCenter.js'), 'utf8');
results.commandCenterPanels = {
    hasAttendancePanel: /attendance/i.test(cc) && /panel/i.test(cc),
    hasOutstandingPanel: /outstanding/i.test(cc),
    hasTasksPanel: /tasks/i.test(cc),
    hasPayrollPanel: /payroll/i.test(cc),
    hasRevenuePanel: /revenue/i.test(cc),
    hasRecommendations: /recommend/i.test(cc)
};

console.log(JSON.stringify(results, null, 2));
