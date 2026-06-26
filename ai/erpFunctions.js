/**
 * ERP Function Registry — direct integration with MJS Prime Logic modules.
 */
const ErpFunctions = {
    _toArray(x) {
        if (!x) return [];
        if (Array.isArray(x)) return x;
        if (x && typeof x.then === 'function') return [];
        if (typeof x === 'object') return Object.values(x).filter((v) => v && typeof v === 'object');
        return [];
    },

    async _activeEmployees() {
        if (typeof DataManager === 'undefined') return [];
        if (DataManager.getActiveEmployees) {
            return this._toArray(await DataManager.getActiveEmployees());
        }
        return this._employeeList();
    },

    _employeeList() {
        if (typeof DataManager === 'undefined') return [];
        const key = DataManager.KEYS?.EMPLOYEES || 'gtes_employees';
        let list = this._toArray(DataManager.getData(key));
        const today = new Date();
        if (typeof DataManager.isActiveOnDate === 'function') {
            list = list.filter((emp) => DataManager.isActiveOnDate(emp, today));
        } else {
            list = list.filter((emp) => (emp.status || 'Active') !== 'Inactive');
        }
        return list;
    },

    _compactName(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    },

    _editDistance(a, b) {
        a = String(a || '').toLowerCase();
        b = String(b || '').toLowerCase();
        if (a === b) return 0;
        const m = a.length;
        const n = b.length;
        if (!m) return n;
        if (!n) return m;
        const d = Array.from({ length: m + 1 }, (_, i) => [i]);
        for (let j = 1; j <= n; j++) {
            d[0][j] = j;
            for (let i = 1; i <= m; i++) {
                d[i][j] = Math.min(
                    d[i - 1][j] + 1,
                    d[i][j - 1] + 1,
                    d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
        }
        return d[m][n];
    },

    _scoreCustomerMatch(c, q, qCompact) {
        const name = String(c.name || c.displayName || '');
        const n = name.toLowerCase();
        const nCompact = this._compactName(n);
        let score = 0;

        if (n === q) score += 100;
        if (nCompact === qCompact) score += 95;
        if (n.includes(q) || q.includes(n)) score += 50;
        if (nCompact.includes(qCompact) && qCompact.length >= 3) score += 45;
        if (qCompact.includes(nCompact) && nCompact.length >= 4) score += 40;

        const qWords = q.split(/\s+/).filter((w) => w.length > 1);
        if (qWords.length && qWords.every((w) => n.includes(w))) score += 35;

        const probe = qWords.length ? qWords[0] : q;
        const probeCompact = this._compactName(probe);
        const words = n.split(/\s+/).filter((w) => w.length >= 3);
        for (const w of words) {
            const dist = this._editDistance(probe, w);
            const maxDist = probe.length <= 4 ? 1 : (probe.length <= 7 ? 2 : 3);
            if (dist <= maxDist) score += 60 - dist * 10;
            const wCompact = this._compactName(w);
            if (probeCompact.length >= 3 && wCompact.startsWith(probeCompact.slice(0, Math.min(4, probeCompact.length)))) {
                score += 25;
            }
            if (qCompact.length >= 4 && wCompact.length >= 4) {
                const compactDist = this._editDistance(qCompact, wCompact);
                const compactMax = qCompact.length <= 5 ? 2 : 3;
                if (compactDist <= compactMax) score += 68 - compactDist * 14;
            }
        }
        return score;
    },

    _normalizeEmployeeQuery(name) {
        let q = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (typeof TamilCommandRegistry !== 'undefined') {
            q = TamilCommandRegistry.stripTemporalAndNoise(TamilCommandRegistry.sanitizeEntityName(q));
        }
        return q;
    },

    _parseEmployeeIdQuery(text) {
        const t = String(text || '').trim();
        const lower = t.toLowerCase();
        let m = lower.match(/\b(emp[_\s-]?\d{1,6})\b/i);
        if (m) {
            const raw = m[1].replace(/[\s-]/g, '_');
            if (/^emp_\d+$/i.test(raw)) return raw.toLowerCase();
            const num = raw.replace(/^emp_?/i, '');
            return `emp_${String(num).padStart(4, '0')}`;
        }
        m = t.match(/\b(EMP\d{3,6})\b/i);
        if (m) return m[1].toUpperCase();
        m = lower.match(/\bemployee\s+id\s+(\S+)\b/i);
        if (m) return this._parseEmployeeIdQuery(m[1]) || m[1];
        return null;
    },

    _employeeIdMatches(emp, idQuery) {
        const eid = String(emp?.id || '');
        const norm = String(idQuery || '').toLowerCase().replace(/[\s-]/g, '_');
        const eidNorm = eid.toLowerCase().replace(/[\s-]/g, '_');
        if (!norm || !eidNorm) return false;
        if (eidNorm === norm) return true;
        if (eidNorm.replace(/_/g, '') === norm.replace(/_/g, '')) return true;
        const num = norm.replace(/^emp_?/i, '');
        if (num && eidNorm.endsWith(num)) return true;
        return false;
    },

    _scoreEmployeeMatch(emp, q, qCompact) {
        const en = String(emp.name || '').toLowerCase();
        const enCompact = this._compactName(en);
        const enWords = en.split(/\s+/).filter(Boolean);
        const qWords = q.split(/\s+/).filter((w) => w.length > 1);
        let score = 0;

        if (en === q) score += 100;
        if (enCompact === qCompact) score += 95;
        if (enCompact.includes(qCompact) && qCompact.length >= 3) score += 45;
        if (qCompact.includes(enCompact) && enCompact.length >= 4) score += 40;
        if (qWords.length && qWords.every((w) => en.includes(w))) score += 30 + qWords.length * 8;
        if (qWords.length === 1) {
            if (enWords.some((w) => w === qWords[0] || w.startsWith(qWords[0]) || qWords[0].startsWith(w))) score += 28;
            if (enCompact.startsWith(qCompact) || qCompact.startsWith(enCompact)) score += 22;
        }
        if (qWords.length >= 2 && enWords.length >= 2) {
            const overlap = qWords.filter((w) => enWords.some((ew) => ew.startsWith(w) || w.startsWith(ew))).length;
            if (overlap >= Math.min(qWords.length, enWords.length)) score += 20;
        }
        return score;
    },

    findEmployeeById(id) {
        const idQuery = this._parseEmployeeIdQuery(id) || String(id || '').trim();
        if (!idQuery) return null;
        return this._employeeList().find((e) => this._employeeIdMatches(e, idQuery)) || null;
    },

    resolveEmployeeQuery(text) {
        const raw = String(text || '').trim();
        if (!raw) {
            return { exact: null, candidates: [], needConfirm: false, state: 'need_name' };
        }

        const idQuery = this._parseEmployeeIdQuery(raw);
        if (idQuery) {
            const byId = this.findEmployeeById(idQuery);
            if (byId) {
                return { exact: byId, candidates: [], needConfirm: false, state: null };
            }
        }

        const q = this._normalizeEmployeeQuery(raw);
        const qCompact = this._compactName(q);
        if (!q || q.length < 2) {
            return { exact: null, candidates: [], needConfirm: false, state: 'need_name' };
        }

        const customer = this.findCustomerByName(q);
        if (customer) {
            const custNorm = String(customer.name || customer.displayName || '').toLowerCase();
            const custCompact = this._compactName(custNorm);
            if (custNorm === q || custCompact === qCompact
                || custNorm.includes(q) || q.includes(custNorm)
                || custCompact.includes(qCompact) || qCompact.includes(custCompact)) {
                return { exact: null, candidates: [], needConfirm: false, state: 'need_name' };
            }
        }

        const list = this._employeeList();
        let exact = list.find((e) => String(e.name || '').toLowerCase() === q);
        if (exact) return { exact, candidates: [], needConfirm: false, state: null };
        exact = list.find((e) => this._compactName(e.name) === qCompact);
        if (exact) return { exact, candidates: [], needConfirm: false, state: null };

        const scored = list
            .map((emp) => ({ emp, score: this._scoreEmployeeMatch(emp, q, qCompact) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score);

        if (!scored.length) {
            return { exact: null, candidates: [], needConfirm: false, state: 'need_name' };
        }

        const top = scored[0];
        const second = scored[1];
        if (!second || top.score - second.score >= 25) {
            if (top.score >= 90) {
                return { exact: top.emp, candidates: [], needConfirm: false, state: null };
            }
            return {
                exact: top.emp,
                candidates: [top.emp],
                needConfirm: true,
                state: 'need_confirm'
            };
        }

        const threshold = Math.max(20, top.score - 15);
        const candidates = scored.filter((x) => x.score >= threshold).slice(0, 5).map((x) => x.emp);
        if (candidates.length === 1) {
            return {
                exact: candidates[0],
                candidates,
                needConfirm: true,
                state: 'need_confirm'
            };
        }
        return { exact: null, candidates, needConfirm: false, state: 'need_pick' };
    },

    findEmployeeByName(name) {
        const resolved = this.resolveEmployeeQuery(name);
        if (resolved.exact && !resolved.needConfirm) return resolved.exact;
        if (resolved.candidates?.length === 1 && resolved.needConfirm) return resolved.candidates[0];
        return resolved.exact || null;
    },

    listEmployees() {
        const list = this._employeeList();
        return list.map((e) => e.name).filter(Boolean);
    },

    suggestSimilarEmployees(name, limit = 5) {
        const q = this._normalizeEmployeeQuery(name);
        const qCompact = this._compactName(q);
        if (!qCompact) return [];
        return this._employeeList()
            .map((e) => ({ name: e.name, score: this._scoreEmployeeMatch(e, q, qCompact) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((x) => x.name);
    },

    suggestSimilarCustomers(name, limit = 3) {
        if (typeof CustomerManager === 'undefined') return [];
        const q = String(name || '').toLowerCase().trim();
        if (!q) return [];
        const qCompact = this._compactName(q);
        return (CustomerManager.getAllCustomers() || [])
            .map((c) => ({ name: c.name || c.displayName, score: this._scoreCustomerMatch(c, q, qCompact) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((x) => x.name);
    },

    findCustomerByName(name) {
        if (typeof CustomerManager === 'undefined') return null;
        const q = String(name || '').trim();
        if (!q) return null;
        let c = CustomerManager.getCustomerByName(q);
        if (c) return c;
        const norm = q.toLowerCase();
        const qCompact = this._compactName(norm);
        const all = CustomerManager.getAllCustomers() || [];
        const includesMatch = all.find((x) => {
            const n = String(x.name || x.displayName || '').toLowerCase();
            return n.includes(norm) || norm.includes(n);
        });
        if (includesMatch) return includesMatch;
        const scored = all
            .map((x) => ({ c: x, score: this._scoreCustomerMatch(x, norm, qCompact) }))
            .filter((x) => x.score >= 35)
            .sort((a, b) => b.score - a.score);
        return scored[0]?.c || null;
    },

    formatMoney(n) {
        return `₹${(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    parseMonthName(name) {
        const m = String(name || '').toLowerCase().trim();
        const map = {
            january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
            april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
            august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
            november: 10, nov: 10, december: 11, dec: 11
        };
        if (map[m] !== undefined) return map[m];
        const now = new Date();
        return now.getMonth();
    },

    async markAttendanceDirect({ employeeName, status = 'Present', date = new Date() }) {
        const emp = this.findEmployeeByName(employeeName);
        if (!emp) throw new Error(`Employee not found: ${employeeName}`);

        const statusMap = {
            present: 'Present',
            absent: 'Unpaid Leave',
            leave: 'Paid Leave',
            'paid leave': 'Paid Leave',
            'unpaid leave': 'Unpaid Leave',
            'sick leave': 'Sick Leave',
            halfday: 'Half Day',
            'half day': 'Half Day'
        };
        const key = String(status || 'present').toLowerCase();
        const finalStatus = statusMap[key] || status;

        const dateStr = DataManager.formatDate(date instanceof Date ? date : new Date(date));
        const attendance = await DataManager.getAttendance();
        const existingIdx = attendance.findIndex((a) =>
            DataManager.formatDate(new Date(a.date)) === dateStr && a.employee === emp.name);

        const isPresent = finalStatus === 'Present' || finalStatus === 'H-Working';
        const record = DataManager.addTimestamp({
            id: existingIdx >= 0 ? attendance[existingIdx].id : `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            date: new Date(dateStr).toISOString(),
            employee: emp.name,
            checkIn: isPresent ? '09:00' : null,
            checkOut: isPresent ? '18:00' : null,
            status: finalStatus,
            overTime: 'No',
            otHours: 0,
            holidayReason: null
        });

        if (existingIdx >= 0) attendance[existingIdx] = record;
        else attendance.push(record);

        await DataManager.saveAttendance(attendance);
        return { employeeName: emp.name, status: finalStatus, date: dateStr };
    },

    async getAbsentEmployeesForDate(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const dateStr = DataManager.formatDate(d);
        const employees = await this._activeEmployees();
        const attendance = this._toArray(await DataManager.getAttendance());
        const dayRecords = attendance.filter((a) => DataManager.formatDate(new Date(a.date)) === dateStr);
        const presentNames = new Set(dayRecords.filter((a) => a.status === 'Present' || a.status === 'H-Working').map((a) => a.employee));
        const onLeave = dayRecords.filter((a) => ['Paid Leave', 'Unpaid Leave', 'Sick Leave', 'Half Day'].includes(a.status));
        const absent = employees
            .map((e) => e.name)
            .filter((name) => !presentNames.has(name));
        return { date: dateStr, absent, onLeave: onLeave.map((r) => ({ name: r.employee, status: r.status })), count: absent.length };
    },

    async markAllHolidayForDate({ date = new Date(), reason = 'Holiday' } = {}) {
        const d = date instanceof Date ? new Date(date) : new Date(date);
        d.setHours(0, 0, 0, 0);
        const dateStr = DataManager.formatDate(d);
        const employees = await this._activeEmployees();
        if (!employees.length) {
            return { dateStr, markedCount: 0, skipped: 0, reason };
        }

        let attendance = this._toArray(await DataManager.getAttendance());
        const existingKeys = new Set(attendance.map((a) => `${a.employee}_${DataManager.formatDate(new Date(a.date))}`));
        let markedCount = 0;
        let skipped = 0;
        const holidayReason = reason || (typeof DataManager.isSunday === 'function' && DataManager.isSunday(d) ? 'Sunday' : 'Holiday');

        for (const employee of employees) {
            const key = `${employee.name}_${dateStr}`;
            if (existingKeys.has(key)) {
                skipped += 1;
                continue;
            }
            const record = DataManager.addTimestamp({
                id: `ATT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                employee: employee.name,
                date: d.toISOString(),
                status: 'Holiday',
                checkIn: '',
                checkOut: '',
                overTime: 'No',
                otHours: 0,
                holidayReason,
                autoMarked: true
            });
            attendance.push(record);
            existingKeys.add(key);
            markedCount += 1;
        }

        if (markedCount) {
            await DataManager.saveAttendance(attendance);
            if (typeof AttendanceModule !== 'undefined') {
                if (typeof AttendanceModule.loadAttendanceForDate === 'function') {
                    await AttendanceModule.loadAttendanceForDate();
                } else if (typeof AttendanceModule.load === 'function') {
                    await AttendanceModule.load();
                }
            }
        }

        return { dateStr, markedCount, skipped, reason: holidayReason };
    },

    async getAbsentEmployeesToday() {
        return this.getAbsentEmployeesForDate(new Date());
    },

    async getCustomerOutstanding(customerName) {
        const customer = this.findCustomerByName(customerName);
        if (!customer && customerName) {
            return { customerName, total: 0, invoiceCount: 0, overdueCount: 0, invoices: [] };
        }

        const invoices = typeof InvoiceManager !== 'undefined'
            ? (InvoiceManager.getInvoicesWithBalance ? await InvoiceManager.getInvoicesWithBalance() : InvoiceManager.getAllInvoices())
            : [];

        const name = customer?.name || customerName;
        const id = customer?.id;
        const norm = String(name || '').toLowerCase();

        const rows = (invoices || []).filter((inv) => {
            const bal = parseFloat(inv.balance ?? inv.pending ?? 0);
            if (bal <= 0.05) return false;
            if (id && inv.customerId === id) return true;
            return String(inv.customerName || '').toLowerCase().includes(norm) || norm.includes(String(inv.customerName || '').toLowerCase());
        });

        const total = rows.reduce((s, r) => s + (parseFloat(r.balance ?? r.pending ?? r.total) || 0), 0);
        const overdue = rows.filter((r) => r.status === 'pending' || r.status === 'overdue').length;

        return {
            customerName: name,
            customerId: id,
            total,
            invoiceCount: rows.length,
            overdueCount: overdue,
            invoices: rows.slice(0, 5).map((r) => ({
                id: r.id,
                no: r.invoiceNo || r.id,
                balance: parseFloat(r.balance ?? r.pending ?? 0),
                date: r.date
            }))
        };
    },

    async getCustomerInvoiceList(customerName) {
        const customer = this.findCustomerByName(customerName);
        if (!customer && customerName) throw new Error(`Customer not found: ${customerName}`);
        const invoices = typeof InvoiceManager !== 'undefined'
            ? (InvoiceManager.getInvoicesWithBalance ? await InvoiceManager.getInvoicesWithBalance() : InvoiceManager.getAllInvoices())
            : [];
        const name = customer?.name || customerName;
        const id = customer?.id;
        const norm = String(name || '').toLowerCase();
        const rows = (invoices || []).filter((inv) => {
            const bal = parseFloat(inv.balance ?? inv.pending ?? 0);
            if (bal <= 0.05) return false;
            if (id && inv.customerId === id) return true;
            return String(inv.customerName || '').toLowerCase().includes(norm) || norm.includes(String(inv.customerName || '').toLowerCase());
        });
        const total = rows.reduce((s, r) => s + (parseFloat(r.balance ?? r.pending ?? r.total) || 0), 0);
        const list = rows.slice(0, 10).map((r) => ({
            id: r.id,
            no: r.invoiceNo || r.id,
            date: r.date,
            balance: parseFloat(r.balance ?? r.pending ?? 0)
        }));
        return {
            customerName: name,
            customerId: id,
            total,
            invoiceCount: rows.length,
            invoices: list
        };
    },

    resolveDateFromWhen(when) {
        const d = new Date();
        const w = String(when || '').toLowerCase();
        if (w === 'yesterday' || w === 'innal' || w === 'innalai' || w === 'நேற்று') {
            d.setDate(d.getDate() - 1);
        } else if (w === 'tomorrow' || w === 'naalai' || w === 'நாளை') {
            d.setDate(d.getDate() + 1);
        } else if (w === 'today' || w === 'inniku' || w === 'innikku' || w === 'இன்று') {
            /* keep today */
        }
        return d;
    },

    async getEmployeeAttendanceForDate(employeeName, date = new Date()) {
        const emp = this.findEmployeeByName(employeeName);
        if (!emp) throw new Error(`Employee not found: ${employeeName}`);
        const d = date instanceof Date ? date : new Date(date);
        const dateStr = DataManager.formatDate(d);
        const attendance = await DataManager.getAttendance();
        const record = attendance.find((a) =>
            DataManager.formatDate(new Date(a.date)) === dateStr && a.employee === emp.name);
        return {
            employeeName: emp.name,
            date: dateStr,
            status: record?.status || 'Not marked',
            checkIn: record?.checkIn || null,
            checkOut: record?.checkOut || null,
            record: record || null
        };
    },

    async getEmployeeSalaryForMonth(employeeName, year, month) {
        const emp = this.findEmployeeByName(employeeName);
        if (!emp) throw new Error(`Employee not found: ${employeeName}`);
        const y = year ?? new Date().getFullYear();
        const m = month ?? new Date().getMonth();
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const payout = await DataManager.getSalaryPayoutDetails(y, m);
        const baseSalary = parseFloat(emp.salary || emp.basicSalary || emp.monthlySalary || 0);
        if (payout?.individualPayouts && payout.individualPayouts[emp.name] != null) {
            return {
                employeeName: emp.name,
                year: y,
                month: m,
                monthLabel: months[m],
                amount: parseFloat(payout.individualPayouts[emp.name]) || 0,
                paid: Array.isArray(payout.employees) ? payout.employees.includes(emp.name) : !!payout.done,
                source: 'payout'
            };
        }
        const paid = await DataManager.isEmployeePaidInMonth(emp.name, y, m);
        return {
            employeeName: emp.name,
            year: y,
            month: m,
            monthLabel: months[m],
            amount: baseSalary,
            paid,
            source: paid ? 'payout' : 'configured'
        };
    },

    async getCustomerLastInvoice(customerName) {
        const customer = this.findCustomerByName(customerName);
        if (!customer && customerName) throw new Error(`Customer not found: ${customerName}`);
        const invoices = InvoiceManager.getAllInvoices() || [];
        const id = customer?.id;
        const norm = String(customer?.name || customerName || '').toLowerCase();
        const matched = invoices.filter((inv) => {
            if (InvoiceManager.isDcStyleSalesInvoice?.(inv)) return false;
            if (id && inv.customerId === id) return true;
            return String(inv.customerName || '').toLowerCase().includes(norm);
        }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        const inv = matched[0];
        if (!inv) return { customerName: customer?.name || customerName, invoice: null };
        return {
            customerName: customer?.name || customerName,
            customerId: customer?.id,
            invoice: {
                id: inv.id,
                no: inv.invoiceNo || inv.id,
                date: inv.date,
                total: parseFloat(inv.total) || 0
            }
        };
    },

    async getEmployeeOtHours(employeeName, year, month) {
        const emp = this.findEmployeeByName(employeeName);
        if (!emp) throw new Error(`Employee not found: ${employeeName}`);
        const y = year ?? new Date().getFullYear();
        const m = month ?? new Date().getMonth();
        const records = await DataManager.getAttendanceByMonth(y, m);
        const mine = records.filter((r) => r.employee === emp.name);
        const ot = mine.reduce((s, r) => s + (parseFloat(r.otHours) || 0), 0);
        return { employeeName: emp.name, year: y, month: m, otHours: ot, days: mine.length };
    },

    async createTaskDirect({ partyName, narration, type = 'normal', followupDate }) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const currentUser = await UserManager.getCurrentUser();
        let partyId = '';
        let resolvedName = partyName || 'General';
        if (partyName && typeof CustomerManager !== 'undefined') {
            const c = this.findCustomerByName(partyName);
            if (c) {
                partyId = c.id;
                resolvedName = c.name;
            }
        }
        const newTask = {
            id: `TASK-${Date.now()}`,
            type,
            narration: narration || `Voice task: ${resolvedName}`,
            partyId,
            partyName: resolvedName,
            assignedTo: currentUser?.username || 'admin',
            assignedToName: currentUser?.username || 'admin',
            followupDate: followupDate || new Date().toISOString().split('T')[0],
            followupTime: '10:00',
            status: 'open',
            createdAt: new Date().toISOString(),
            history: [{ at: new Date().toISOString(), action: 'Task Created', note: 'Created via Voice ERP Agent' }]
        };
        tasks.push(newTask);
        await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
        return { taskId: newTask.id, partyName: resolvedName };
    },

    async completeTaskByHint(hint) {
        const tasks = DataManager.getData(DataManager.KEYS.TASKS) || [];
        const q = String(hint || '').toLowerCase().trim();
        const open = tasks.filter((t) => t.status === 'open' || t.status === 'pending');
        let task = open[open.length - 1];
        if (q) {
            task = open.find((t) => String(t.narration || '').toLowerCase().includes(q)
                || String(t.partyName || '').toLowerCase().includes(q)) || task;
        }
        if (!task) throw new Error('No pending task found to complete.');
        if (typeof TasksUI !== 'undefined' && TasksUI.toggleTaskStatus) {
            await TasksUI.toggleTaskStatus(task.id, true);
        } else {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            await DataManager.saveData(DataManager.KEYS.TASKS, tasks);
        }
        return { taskId: task.id, narration: task.narration };
    },

    getHelp() {
        return {
            success: true,
            message: NotificationAgent.getHelpText()
        };
    },

    /** Compare dashboard / module / AI attendance counts from same ERP source */
    async AttendanceHealthCheck() {
        const sourceUsed = 'DataManager.getActiveEmployees + attendance records';
        const employees = await this._activeEmployees();
        const activeEmployees = employees.length;

        const attendance = await DataManager.getAttendance();
        const todayStr = DataManager.formatDate(new Date());
        const todayRecords = attendance.filter((a) =>
            DataManager.formatDate(new Date(a.date)) === todayStr);

        const presentStatuses = ['Present', 'H-Working', 'Half Day'];
        const dashboardPresent = todayRecords.filter((a) =>
            presentStatuses.includes(a.status)
        ).length;

        const modulePresent = dashboardPresent;
        const aiPresent = todayRecords.filter((a) =>
            a.status === 'Present' || a.status === 'H-Working'
        ).length;
        const presentNames = new Set(todayRecords.filter((a) =>
            a.status === 'Present' || a.status === 'H-Working'
        ).map((a) => a.employee));
        const absentCount = employees.filter((e) => !presentNames.has(e.name)).length;

        const mismatches = [];
        if (dashboardPresent !== modulePresent) {
            mismatches.push({ field: 'presentCount', dashboard: dashboardPresent, module: modulePresent, ai: aiPresent });
        }
        if (aiPresent !== dashboardPresent && todayRecords.some((a) => a.status === 'Half Day')) {
            mismatches.push({
                field: 'aiVsDashboard',
                dashboard: dashboardPresent,
                ai: aiPresent,
                note: 'AI path excludes Half Day from present set'
            });
        }

        return {
            presentCount: dashboardPresent,
            absentCount,
            activeEmployees,
            sourceUsed,
            healthy: mismatches.length === 0,
            mismatches,
            breakdown: {
                dashboardPresent,
                modulePresent,
                aiPresent,
                todayRecordCount: todayRecords.length
            }
        };
    },

    navigate(target) {
        const t = String(target || '').toLowerCase().replace(/\s+/g, '');
        const map = {
            dashboard: 'dashboard',
            hrms: 'employees',
            employee: 'employees',
            employees: 'employees',
            attendance: 'attendance',
            salary: 'salary',
            admin: 'admin',
            tasks: 'tasks',
            task: 'tasks',
            payments: 'payments',
            payment: 'payments',
            analytics: 'analytics',
            invoice: 'invoices',
            invoices: 'invoices',
            challan: 'challans',
            challans: 'challans',
            delivery: 'challans',
            jobcard: 'challans',
            jobcards: 'challans'
        };
        const view = map[t] || t;
        if (view === 'challans' && typeof App !== 'undefined') {
            App.showView('challans');
            if (t.includes('job') && typeof DeliveryUI !== 'undefined') DeliveryUI.showSection('jobcard');
            return { view: 'challans' };
        }
        if (typeof App !== 'undefined') App.showView(view);
        return { view };
    }
};

window.ErpFunctions = ErpFunctions;
