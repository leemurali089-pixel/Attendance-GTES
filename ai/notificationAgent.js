const NotificationAgent = {
    getHelpText() {
        const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
        if (lang === 'ta') {
            return [
                'நான் உதவ முடியும்:',
                'வருகை — "Rajesh attendance podu", "inniku yaar absent", "innal absent"',
                'வாடிக்கையாளர் — "Vega outstanding evlo", "invoice list", "last invoice"',
                'ஊழியர் — "Annadurai attendance", "salary evlo", "OT evlo"',
                'சம்பளம் — "March salary generate pannu", "இந்த மாதம் சம்பளம் எவ்வளவு"',
                'சுருக்கம் — "இன்றைய சுருக்கம்", "இன்று என்ன நிலை", "today summary"',
                'Task — "task create pannu", "task complete pannu"',
                'தமிழ், English, Tanglish — எதுவும் பேசலாம். English வேண்டும்னா "in English" சொல்லுங்கள்.'
            ].join('\n');
        }
        return [
            'I can help with:',
            'Attendance — "Rajesh attendance podu", "who absent today", "absent yesterday"',
            'Customers — "outstanding of Vega", "list invoices", "recent invoice billed", "last invoice of Artech"',
            'Employees — "Anna Durai employee details", "show employee Murali", "Annadurai yesterday attendance", "last month salary", "OT evlo"',
            'Payroll — "March salary generate pannu", "this month salary summary"',
            'Daily briefing — "today summary", "daily briefing", "இன்றைய சுருக்கம்"',
            'Tasks — "installation task create pannu", "complete task"',
            'Documents — "invoice create pannu", "delivery challan create pannu", "job card create pannu"',
            'Say commands in Tamil, English, or Tanglish. Say "in English" to switch replies.'
        ].join('\n');
    },

    format(intent, data = {}) {
        if (typeof ResponseI18n !== 'undefined') {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            return ResponseI18n.format(intent, data, lang);
        }
        switch (intent) {
            case 'mark_attendance':
                return `${data.employeeName} has been marked ${data.status} for ${data.date}.`;
            case 'mark_leave':
                return `${data.employeeName} has been marked on leave for today.`;
            case 'absent_employees': {
                const label = data.label || 'today';
                const names = (data.absent || []).slice(0, 8);
                const leave = (data.onLeave || []).map((r) => `${r.name} (${r.status})`);
                const count = data.count ?? names.length;
                if (!names.length && !leave.length) return `All active employees are marked present for ${label}.`;
                const parts = [`${count} employee(s) not present ${label}`];
                if (names.length) parts.push(`Not present: ${names.join(', ')}`);
                if (leave.length) parts.push(`On leave: ${leave.join(', ')}`);
                return parts.join('. ');
            }
            case 'customer_outstanding':
                if (!data.invoiceCount) return `${data.customerName} has no pending outstanding.`;
                return `${data.customerName} has ${ErpFunctions.formatMoney(data.total)} outstanding. ${data.overdueCount || data.invoiceCount} invoice(s) pending.`;
            case 'customer_last_invoice':
                if (!data.invoice) return `${data.customerName} has no invoices on record.`;
                return `Last invoice for ${data.customerName} is ${data.invoice.no} dated ${data.invoice.date}, total ${ErpFunctions.formatMoney(data.invoice.total)}.`;
            case 'customer_invoice_list': {
                if (!data.invoiceCount) return `${data.customerName} has no pending invoices.`;
                const lines = (data.invoices || []).slice(0, 10).map((inv) =>
                    `${inv.no} (${inv.date || 'no date'}) — ${ErpFunctions.formatMoney(inv.balance)}`);
                return `${data.customerName} has ${data.invoiceCount} pending invoice(s), total ${ErpFunctions.formatMoney(data.total)}. ${lines.join('; ')}.`;
            }
            case 'employee_attendance_date':
                return `${data.employeeName} attendance on ${data.date}: ${data.status}.`;
            case 'employee_salary_month':
                if (data.paid) {
                    return `${data.employeeName} ${data.monthLabel} ${data.year} salary paid: ${ErpFunctions.formatMoney(data.amount)}.`;
                }
                return `${data.employeeName} ${data.monthLabel} ${data.year} salary not yet paid. Configured monthly: ${ErpFunctions.formatMoney(data.amount)}.`;
            case 'employee_ot':
                return `${data.employeeName} has ${data.otHours.toFixed(1)} OT hours this month.`;
            case 'employee_details': {
                const idPart = data.employeeId ? `, ID ${data.employeeId}` : '';
                const joinPart = data.dateOfJoining ? `, joined ${data.dateOfJoining}` : '';
                return `${data.employeeName}${idPart} — ${data.department}, salary ${ErpFunctions.formatMoney(data.salary)}, status ${data.status || 'Active'}${joinPart}.`;
            }
            case 'create_task':
                return `Task created for ${data.partyName}.`;
            case 'complete_task':
                return `Task marked complete: ${data.narration || data.taskId}.`;
            default:
                return data.message || 'Done.';
        }
    },

    formatClarify(type, data = {}) {
        if (typeof ResponseI18n !== 'undefined') {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            return ResponseI18n.formatClarify(type, data, lang);
        }
        switch (type) {
            case 'employee_need_name':
                return 'Which employee? Say the name or employee ID (e.g. emp_0001 or EMP001).';
            case 'employee_need_confirm':
                return `Are you referring to ${data.name}? Say yes to confirm.`;
            case 'employee_need_pick': {
                const lines = (data.candidates || []).map((c, i) => {
                    const name = typeof c === 'string' ? c : c.name;
                    const id = c && typeof c === 'object' && c.id ? ` (${c.id})` : '';
                    return `${i + 1}) ${name}${id}`;
                });
                return `I found: ${lines.join(' ')}. Which one? Say the number or name.`;
            }
            case 'employee_not_found': {
                let msg = `I could not find an employee matching "${data.query}".`;
                if (data.suggestions?.length) {
                    msg += ` Did you mean: ${data.suggestions.join(', ')}?`;
                } else {
                    msg += ' Which employee? Say the name or employee ID.';
                }
                return msg;
            }
            default:
                return data.message || 'Please clarify.';
        }
    },

    formatClarifySpeak(type, data = {}) {
        if (typeof ResponseI18n !== 'undefined') {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            return ResponseI18n.formatClarifySpeak(type, data, lang);
        }
        return data.message || 'Please choose an option.';
    },

    formatClarifySummary(type, data = {}) {
        if (typeof ResponseI18n !== 'undefined') {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            return ResponseI18n.formatClarifySummary(type, data, lang);
        }
        return data.message || 'Please clarify.';
    },

    speak(text) {
        if (typeof SpeechEngine !== 'undefined') {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getSpeechSynthesisLang() : undefined;
            if (lang && SpeechEngine.speakWithLang) return SpeechEngine.speakWithLang(text, lang);
            return SpeechEngine.speak(text);
        }
        if (typeof App !== 'undefined') App.showNotification(text, 'info');
        return Promise.resolve();
    }
};

window.NotificationAgent = NotificationAgent;
