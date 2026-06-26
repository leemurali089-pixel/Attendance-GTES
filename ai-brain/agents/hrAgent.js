/**
 * hrAgent.js — HR & Daily Ops Sub-Agent (Jarvis Multi-Agent ERP OS v2)
 * Handles: Attendance, Absent list, Present list, OT, Holidays, Employee lookup
 * Tamil keywords: duty, innikku, yaar varala, varadha payangal, leave, OT
 */
(function (global) {
    'use strict';

    const KEYWORDS = [
        /\battendance\b/i, /\babsent\b/i, /\bpresent\b/i, /\bemployee/i, /\bstaff\b/i,
        /\bholiday/i, /\bdashboard\b/i, /\bfilter\s+attendance/i,
        /\bduty\b/i, /\binnikku\b/i, /\binniku\b/i, /\byaar\s+varala/i,
        /\bvarala\b/i, /\bvaradha\b/i, /\bleave\b/i, /\bot\b/i, /\bovertime\b/i,
        /\bவருகை/i, /\bஊழிய/i, /\bயார்/i, /\bவரல/i, /\bவராத/i
    ];

    function _money(n) {
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions.formatMoney) return ErpFunctions.formatMoney(n);
        return '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');
    }

    function _today() {
        if (typeof DataManager !== 'undefined' && typeof DataManager.formatDate === 'function') {
            return DataManager.formatDate(new Date());
        }
        return new Date().toISOString().slice(0, 10);
    }

    function _dateStr(d) {
        if (typeof DataManager !== 'undefined' && typeof DataManager.formatDate === 'function') {
            return DataManager.formatDate(new Date(d));
        }
        return String(d || '').slice(0, 10);
    }

    function _extractWhen(q) {
        const s = String(q || '');
        if (/yesterday|innal|innalai|நேற்ற/u.test(s)) return 'yesterday';
        if (/today|inniku|innikku|இன்ற|innikku/u.test(s)) return 'today';
        if (/tomorrow|naalai|நாளை/u.test(s)) return 'tomorrow';
        return null;
    }

    /** Returns full attendance snapshot for a given date string */
    async function _attendanceForDate(dateStr) {
        if (typeof DataManager === 'undefined') return null;

        // Active employees
        let employees = [];
        if (typeof ErpFunctions !== 'undefined' && ErpFunctions._activeEmployees) {
            employees = await ErpFunctions._activeEmployees();
        } else if (DataManager.getActiveEmployees) {
            const raw = await DataManager.getActiveEmployees();
            employees = Array.isArray(raw) ? raw : Object.values(raw || {});
        } else {
            const raw = DataManager.getData(DataManager.KEYS.EMPLOYEES) || [];
            employees = (Array.isArray(raw) ? raw : Object.values(raw || {}))
                .filter(function (e) { return (e.status || 'Active') !== 'Inactive'; });
        }

        // Attendance records
        let attendance = DataManager.getData(DataManager.KEYS.ATTENDANCE);
        if (!Array.isArray(attendance) && typeof DataManager.getAttendance === 'function') {
            attendance = await DataManager.getAttendance();
        }
        attendance = Array.isArray(attendance) ? attendance : Object.values(attendance || {});

        const dayRecords = attendance.filter(function (a) {
            return _dateStr(a.date) === dateStr;
        });

        const presentStatuses = ['Present', 'H-Working', 'Half Day'];
        const absentStatuses = ['Absent', 'Leave', 'Sick Leave', 'LOP'];

        const presentSet = new Set(
            dayRecords.filter(function (a) { return presentStatuses.indexOf(a.status) >= 0; })
                      .map(function (a) { return a.employee; })
        );
        const absentSet = new Set(
            dayRecords.filter(function (a) { return absentStatuses.indexOf(a.status) >= 0; })
                      .map(function (a) { return a.employee; })
        );

        const presentNames  = employees.filter(function (e) { return presentSet.has(e.name); }).map(function (e) { return e.name; });
        const absentNames   = employees.filter(function (e) { return !presentSet.has(e.name); }).map(function (e) { return e.name; });
        const markedAbsent  = employees.filter(function (e) { return absentSet.has(e.name); }).map(function (e) { return e.name; });

        return {
            date: dateStr,
            activeEmployees: employees.length,
            presentCount: presentNames.length,
            absentCount: absentNames.length,
            presentNames: presentNames,
            absentNames: absentNames,
            markedAbsentNames: markedAbsent,
            sourceRefs: ['DataManager.KEYS.EMPLOYEES', 'DataManager.KEYS.ATTENDANCE']
        };
    }

    /** Returns OT / H-Working data for today.
     *
     *  Three H-Working cases:
     *  1. status=H-Working + overTime=H-Working  → treat as normal holiday;
     *     OT hours are holiday-rate OT (H-OT bucket).
     *  2. status=H-Working + overTime=No         → H-Working only (2x pay), no OT.
     *  3. status=H-Working + overTime=Yes        → H-Working (2x pay) + otHours in
     *     regular OT bucket.
     */
    function _getOTSummary(q) {
        if (typeof DataManager === 'undefined') return null;
        const attendance = DataManager.getData(DataManager.KEYS.ATTENDANCE) || [];
        const todayStr = _today();
        const todayRecords = attendance.filter(function (a) {
            return _dateStr(a.date) === todayStr;
        });
        if (!todayRecords.length) return null;

        var totalOT = 0;
        var holidayOT = 0;
        var hWorkingCount = 0;
        var hWorkingEmployees = [];
        var holidayOTEmployees = [];
        var regularOTEmployees = [];

        todayRecords.forEach(function (a) {
            var status   = a.status   || '';
            var overTime = a.overTime || a.ot || a.overtime || 'No';
            var otHours  = parseFloat(a.otHours || 0);

            if (status === 'H-Working') {
                if (overTime === 'H-Working' || overTime === 'Holiday working') {
                    // Case 1: H-Working status + H-Working OT → treat as normal holiday.
                    // All hours worked are holiday-OT (counted at H-OT rate).
                    holidayOT += otHours;
                    if (otHours > 0) {
                        holidayOTEmployees.push(a.employee + ' (' + otHours + 'h H-OT)');
                    }
                } else if (overTime === 'Yes') {
                    // Case 3: H-Working + OT Yes → H-Working day (2x pay) + regular OT hours.
                    hWorkingCount++;
                    hWorkingEmployees.push(a.employee);
                    if (otHours > 0) {
                        totalOT += otHours;
                        regularOTEmployees.push(a.employee + ' (' + otHours + 'h OT)');
                    }
                } else {
                    // Case 2: H-Working + OT No → H-Working only (2x pay), no OT.
                    hWorkingCount++;
                    hWorkingEmployees.push(a.employee);
                }
            } else if (otHours > 0 && (overTime === 'Yes' || overTime === 'H-Working')) {
                // Regular employee with OT
                totalOT += otHours;
                regularOTEmployees.push(a.employee + ' (' + otHours + 'h)');
            }
        });

        var hasData = holidayOT > 0 || totalOT > 0 || hWorkingCount > 0;
        if (!hasData) return null;

        return {
            hWorkingCount: hWorkingCount,
            hWorkingEmployees: hWorkingEmployees,
            holidayOTHours: holidayOT,
            holidayOTEmployees: holidayOTEmployees,
            totalOTHours: totalOT,
            employees: regularOTEmployees,
            // Legacy-compat fields
            count: regularOTEmployees.length,
            totalHours: totalOT
        };
    }

    /** Weekly/monthly absent summary */
    function _periodAbsentSummary(days) {
        if (typeof DataManager === 'undefined') return null;
        const attendance = DataManager.getData(DataManager.KEYS.ATTENDANCE) || [];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        const absentRecords = attendance.filter(function (a) {
            return _dateStr(a.date) >= cutoffStr
                && ['Absent', 'Leave', 'Sick Leave', 'LOP'].indexOf(a.status) >= 0;
        });
        const byEmployee = {};
        absentRecords.forEach(function (a) {
            byEmployee[a.employee] = (byEmployee[a.employee] || 0) + 1;
        });
        return {
            days: days,
            absentRecords: absentRecords.length,
            byEmployee: byEmployee,
            sourceRefs: ['DataManager.KEYS.ATTENDANCE']
        };
    }

    const HrAgent = {
        id: 'hrAgent',
        domains: ['hr'],

        canHandle: function (query) {
            const q = String(query || '');
            // Exclude pure financial queries
            if (/\b(?:pending\s+amount|total\s+(?:pending|outstanding)|outstanding|niluvai|ledger|invoice|payment|balance|revenue)\b/i.test(q)
                && !/\b(?:employee|staff|attendance|absent|present|holiday|duty|leave|ot|overtime|வருகை|ஊழிய|யார்)\b/i.test(q)) {
                return 0;
            }
            let score = 0;
            KEYWORDS.forEach(function (p) { if (p.test(q)) score += 0.22; });
            return Math.min(1, score);
        },

        handle: function (intent, args, ctx) {
            return this.execute(intent, ctx);
        },

        execute: async function (query, ctx) {
            ctx = ctx || {};
            const q = String(query || '').trim();

            // ── Briefing mode ──────────────────────────────────────────────
            if (ctx.mode === 'briefing') {
                const att = await _attendanceForDate(_today());
                if (!att) {
                    return { ok: false, agentId: this.id, message: 'Employee or attendance data is not loaded yet.', sourceRefs: [] };
                }
                return {
                    ok: true, agentId: this.id,
                    message: att.presentCount + ' present, ' + att.absentCount + ' absent of ' + att.activeEmployees + ' employees',
                    facts: [att],
                    sourceRefs: att.sourceRefs,
                    financial: false
                };
            }

            // ── Who is absent today / absent list ──────────────────────────
            if (/absent\s*list|yaar\s+varala|yaar\s+illai|varadha\s+payangal|who\s+(?:is|are)\s+absent|யார்\s*வரல|வராத/i.test(q)) {
                const when = _extractWhen(q);
                let dateStr = _today();
                if (when === 'yesterday') {
                    const d = new Date(); d.setDate(d.getDate() - 1);
                    dateStr = _dateStr(d);
                }
                const att = await _attendanceForDate(dateStr);
                if (!att) return { ok: false, agentId: this.id, message: 'Attendance data not available.', sourceRefs: [] };
                if (!att.absentNames.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'All ' + att.activeEmployees + ' employees are present on ' + dateStr + '.',
                        facts: [att], sourceRefs: att.sourceRefs
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: att.absentCount + ' absent on ' + dateStr + ': ' + att.absentNames.join(', '),
                    facts: [att], sourceRefs: att.sourceRefs
                };
            }

            // ── Who is present today ───────────────────────────────────────
            if (/present\s*list|who\s+(?:is|are)\s+present|வந்தவர்|duty\s*list/i.test(q)) {
                const att = await _attendanceForDate(_today());
                if (!att) return { ok: false, agentId: this.id, message: 'Attendance data not available.', sourceRefs: [] };
                if (!att.presentNames.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No attendance marked yet for today (' + att.date + ').',
                        facts: [att], sourceRefs: att.sourceRefs
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: att.presentCount + ' present today: ' + att.presentNames.join(', '),
                    facts: [att], sourceRefs: att.sourceRefs
                };
            }

            // ── OT / Overtime ──────────────────────────────────────────────
            if (/\bot\b|overtime|over\s*time/i.test(q)) {
                const ot = _getOTSummary(q);
                if (!ot) {
                    return { ok: true, agentId: this.id, message: 'No overtime recorded today.', sourceRefs: ['DataManager.KEYS.ATTENDANCE'] };
                }
                // Build a clear summary using the three H-Working cases
                const parts = [];
                if (ot.hWorkingCount > 0) {
                    parts.push('H-Working (' + ot.hWorkingCount + '): ' + ot.hWorkingEmployees.join(', '));
                }
                if (ot.holidayOTHours > 0) {
                    parts.push('Holiday OT ' + ot.holidayOTHours + 'h: ' + ot.holidayOTEmployees.join(', '));
                }
                if (ot.totalOTHours > 0) {
                    parts.push('Regular OT ' + ot.totalOTHours + 'h: ' + ot.employees.join(', '));
                }
                return {
                    ok: true, agentId: this.id,
                    message: 'OT today — ' + parts.join(' | '),
                    facts: [ot], sourceRefs: ['DataManager.KEYS.ATTENDANCE']
                };
            }

            // ── Weekly / Monthly absent summary ────────────────────────────
            if (/weekly\s+absent|this\s+week\s+absent|week\s+absent/i.test(q)) {
                const summary = _periodAbsentSummary(7);
                if (!summary || !summary.absentRecords) {
                    return { ok: true, agentId: this.id, message: 'No absent records in last 7 days.', sourceRefs: ['DataManager.KEYS.ATTENDANCE'] };
                }
                const lines = Object.keys(summary.byEmployee).map(function (emp) {
                    return emp + ': ' + summary.byEmployee[emp] + ' day(s)';
                }).join(', ');
                return {
                    ok: true, agentId: this.id,
                    message: 'Last 7 days — ' + summary.absentRecords + ' absent entries: ' + lines,
                    facts: [summary], sourceRefs: summary.sourceRefs
                };
            }

            if (/monthly\s+absent|this\s+month\s+absent|month\s+absent/i.test(q)) {
                const summary = _periodAbsentSummary(30);
                if (!summary || !summary.absentRecords) {
                    return { ok: true, agentId: this.id, message: 'No absent records in last 30 days.', sourceRefs: ['DataManager.KEYS.ATTENDANCE'] };
                }
                const lines = Object.keys(summary.byEmployee).map(function (emp) {
                    return emp + ': ' + summary.byEmployee[emp] + ' day(s)';
                }).join(', ');
                return {
                    ok: true, agentId: this.id,
                    message: 'Last 30 days — ' + summary.absentRecords + ' absent entries: ' + lines,
                    facts: [summary], sourceRefs: summary.sourceRefs
                };
            }

            // ── Holidays ───────────────────────────────────────────────────
            if (/holiday/i.test(q)) {
                const holidays = typeof DataManager !== 'undefined'
                    ? (DataManager.getData(DataManager.KEYS.HOLIDAYS) || [])
                    : [];
                if (!holidays.length) {
                    return { ok: true, agentId: this.id, message: 'No holidays configured.', sourceRefs: ['DataManager.KEYS.HOLIDAYS'] };
                }
                const today = _today();
                const upcoming = holidays.filter(function (h) {
                    return String(h.date || '') >= today;
                }).slice(0, 5);
                const list = (upcoming.length ? upcoming : holidays.slice(-5)).map(function (h) {
                    return (h.date || '') + ': ' + (h.name || h.description || '');
                }).join('; ');
                return {
                    ok: true, agentId: this.id,
                    message: 'Holidays: ' + list,
                    facts: upcoming.length ? upcoming : holidays.slice(-5),
                    sourceRefs: ['DataManager.KEYS.HOLIDAYS']
                };
            }

            // ── Employee details lookup ────────────────────────────────────
            if (/employee|staff|details/i.test(q) && typeof EmployeeEngine !== 'undefined') {
                const nameMatch = q.match(/(?:employee|staff)\s+([A-Za-z\s]+)/i);
                const name = nameMatch ? nameMatch[1].trim() : q.replace(/employee|staff|details/gi, '').trim();
                if (name.length > 2) {
                    const det = EmployeeEngine.getDetails({ employeeName: name, employee: name });
                    if (det && det.ok !== false && det.data) {
                        return {
                            ok: true, agentId: this.id,
                            message: det.message || (det.data.name + ' — ' + (det.data.department || det.data.designation || det.data.status || '')),
                            facts: [det.data],
                            sourceRefs: ['EmployeeEngine.getDetails', 'DataManager.KEYS.EMPLOYEES']
                        };
                    }
                }
            }

            // ── General attendance query ────────────────────────────────────
            if (/attendance|absent|present|வருகை|status|sollu|varala|duty|innikku|inniku/i.test(q)) {
                const when = _extractWhen(q);

                // Try AttendanceEngine first
                if (typeof AttendanceEngine !== 'undefined') {
                    const empMatch = q.match(/(?:for|of)\s+([A-Za-z\s]+)/i);
                    const args = empMatch ? { employeeName: empMatch[1].trim() } : {};
                    if (when) args.when = when;
                    const res = await AttendanceEngine.query(args, q);
                    if (res && (res.message || res.data)) {
                        return {
                            ok: res.ok !== false && res.success !== false,
                            agentId: this.id,
                            message: res.message || 'Attendance data retrieved.',
                            facts: res.data ? [res.data] : [],
                            sourceRefs: ['AttendanceEngine.query', 'DataManager.KEYS.ATTENDANCE']
                        };
                    }
                }

                // Fallback: direct calculation
                let dateStr = _today();
                if (when === 'yesterday') {
                    const d = new Date(); d.setDate(d.getDate() - 1);
                    dateStr = _dateStr(d);
                }
                const att = await _attendanceForDate(dateStr);
                if (att) {
                    return {
                        ok: true, agentId: this.id,
                        message: dateStr + ': ' + att.presentCount + ' present, ' + att.absentCount + ' absent of ' + att.activeEmployees + ' total.',
                        facts: [att], sourceRefs: att.sourceRefs
                    };
                }
            }

            // ── Dashboard / summary ────────────────────────────────────────
            if (/dashboard|summary/i.test(q)) {
                const att = await _attendanceForDate(_today());
                if (!att) return { ok: false, agentId: this.id, message: 'Employee or attendance data not loaded.', sourceRefs: [] };
                return {
                    ok: true, agentId: this.id,
                    message: 'HR dashboard: ' + att.presentCount + ' present / ' + att.activeEmployees + ' employees today.',
                    facts: [att], sourceRefs: att.sourceRefs
                };
            }

            // ── RAG fallback ───────────────────────────────────────────────
            const ragEngine = typeof RetrievalEngine !== 'undefined' ? RetrievalEngine : (typeof RagEngine !== 'undefined' ? RagEngine : null);
            if (ragEngine) {
                const rag = await ragEngine.retrieve(q, { collections: ['employees', 'attendance'], limit: 3 });
                if (rag.ok && rag.hits && rag.hits.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: rag.hits.map(function (h) { return h.text; }).join(' | '),
                        facts: rag.hits, sourceRefs: rag.sourceRefs || []
                    };
                }
            }

            // ── IntentEngine / CommandRouter ───────────────────────────────
            if (typeof IntentEngine !== 'undefined' && typeof CommandRouter !== 'undefined') {
                const parsed = IntentEngine.parse(q);
                if (parsed && parsed.intent && /employee|attendance|mark_|absent/.test(parsed.intent)) {
                    const routed = await CommandRouter.route(parsed);
                    if (routed && routed.message) {
                        return {
                            ok: routed.success !== false,
                            agentId: this.id,
                            message: routed.message,
                            facts: routed.data ? [routed.data] : [],
                            sourceRefs: ['CommandRouter:' + parsed.intent],
                            needClarify: routed.needClarify,
                            needConfirm: routed.needConfirm
                        };
                    }
                }
            }

            return { ok: false, agentId: this.id, message: 'No attendance or employee data matched that query.', sourceRefs: [] };
        }
    };

    global.HrAgent = HrAgent;
})(typeof window !== 'undefined' ? window : global);
