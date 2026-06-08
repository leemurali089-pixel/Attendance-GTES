/**
 * Tamil / English response templates for Voice ERP Agent.
 */
const ResponseI18n = {
    format(intent, data, lang) {
        lang = lang || (typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en');
        if (lang === 'en') return this._en(intent, data);
        return this._ta(intent, data);
    },

    formatClarify(type, data, lang) {
        lang = lang || (typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en');
        if (lang === 'en') return this._clarifyEn(type, data);
        return this._clarifyTa(type, data);
    },

    /** Short phrase for TTS — does not read candidate lists aloud. */
    formatClarifySpeak(type, data, lang) {
        lang = lang || (typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en');
        if (lang === 'en') return this._clarifySpeakEn(type, data);
        return this._clarifySpeakTa(type, data);
    },

    /** Short label for conversation history — no candidate list text. */
    formatClarifySummary(type, data, lang) {
        lang = lang || (typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en');
        if (lang === 'en') return this._clarifySummaryEn(type, data);
        return this._clarifySummaryTa(type, data);
    },

    wrapMessage(message, lang) {
        lang = lang || (typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en');
        if (lang === 'en' || !message) return message;
        return message;
    },

    money(n) {
        const v = typeof ErpFunctions !== 'undefined' ? ErpFunctions.formatMoney(n) : `₹${Number(n || 0).toLocaleString('en-IN')}`;
        return v;
    },

    _en(intent, data) {
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
                return `${data.customerName} has ${this.money(data.total)} outstanding. ${data.overdueCount || data.invoiceCount} invoice(s) pending.`;
            case 'customer_last_invoice':
                if (!data.invoice) return `${data.customerName} has no invoices on record.`;
                return `Last invoice for ${data.customerName} is ${data.invoice.no} dated ${data.invoice.date}, total ${this.money(data.invoice.total)}.`;
            case 'customer_invoice_list': {
                if (!data.invoiceCount) return `${data.customerName} has no pending invoices.`;
                const lines = (data.invoices || []).slice(0, 10).map((inv) =>
                    `${inv.no} (${inv.date || 'no date'}) — ${this.money(inv.balance)}`);
                return `${data.customerName} has ${data.invoiceCount} pending invoice(s), total ${this.money(data.total)}. ${lines.join('; ')}.`;
            }
            case 'employee_attendance_date':
                return `${data.employeeName} attendance on ${data.date}: ${data.status}.`;
            case 'employee_salary_month':
                if (data.paid) {
                    return `${data.employeeName} ${data.monthLabel} ${data.year} salary paid: ${this.money(data.amount)}.`;
                }
                return `${data.employeeName} ${data.monthLabel} ${data.year} salary not yet paid. Configured monthly: ${this.money(data.amount)}.`;
            case 'employee_ot':
                return `${data.employeeName} has ${data.otHours.toFixed(1)} OT hours this month.`;
            case 'employee_details': {
                const idPart = data.employeeId ? `, ID ${data.employeeId}` : '';
                const joinPart = data.dateOfJoining ? `, joined ${data.dateOfJoining}` : '';
                return `${data.employeeName}${idPart} — ${data.department}, salary ${this.money(data.salary)}, status ${data.status || 'Active'}${joinPart}.`;
            }
            case 'create_task':
                return `Task created for ${data.partyName}.`;
            case 'complete_task':
                return `Task marked complete: ${data.narration || data.taskId}.`;
            case 'daily_briefing':
                return data.messageEn || data.message || 'Daily briefing unavailable.';
            case 'unknown_intent':
                return 'I did not understand that. Say help for commands I can run.';
            default:
                return data.message || 'Done.';
        }
    },

    _ta(intent, data) {
        switch (intent) {
            case 'mark_attendance':
                return `${data.employeeName} — ${data.date} அன்று ${data.status} ஆக mark செய்யப்பட்டது.`;
            case 'mark_leave':
                return `${data.employeeName} இன்று leave ஆக mark செய்யப்பட்டது.`;
            case 'absent_employees': {
                const label = data.label === 'yesterday' ? 'நேற்று' : 'இன்று';
                const names = (data.absent || []).slice(0, 8);
                const leave = (data.onLeave || []).map((r) => `${r.name} (${r.status})`);
                if (!names.length && !leave.length) return `${label} அனைவரும் present.`;
                const parts = [`${label} ${data.count || names.length} பேர் absent`];
                if (names.length) parts.push(names.join(', '));
                if (leave.length) parts.push(`Leave: ${leave.join(', ')}`);
                return parts.join(': ') + '.';
            }
            case 'customer_outstanding':
                if (!data.invoiceCount) return `${data.customerName} க்கு நிலுவை இல்லை.`;
                return `${data.customerName} நிலுவை ${this.money(data.total)}. ${data.overdueCount || data.invoiceCount} invoice pending.`;
            case 'customer_last_invoice':
                if (!data.invoice) return `${data.customerName} க்கு invoice இல்லை.`;
                return `${data.customerName} கடைசி invoice ${data.invoice.no}, தேதி ${data.invoice.date}, தொகை ${this.money(data.invoice.total)}.`;
            case 'customer_invoice_list': {
                if (!data.invoiceCount) return `${data.customerName} க்கு pending invoice இல்லை.`;
                const lines = (data.invoices || []).slice(0, 10).map((inv) =>
                    `${inv.no} — ${this.money(inv.balance)}`);
                return `${data.customerName}: ${data.invoiceCount} invoice, மொத்தம் ${this.money(data.total)}. ${lines.join('; ')}.`;
            }
            case 'employee_attendance_date':
                return `${data.employeeName} — ${data.date}: ${data.status}.`;
            case 'employee_salary_month':
                if (data.paid) {
                    return `${data.employeeName} ${data.monthLabel} ${data.year} சம்பளம் ${this.money(data.amount)} paid.`;
                }
                return `${data.employeeName} ${data.monthLabel} ${data.year} சம்பளம் இன்னும் pay ஆகல. Monthly: ${this.money(data.amount)}.`;
            case 'employee_ot':
                return `${data.employeeName} இந்த மாதம் ${data.otHours.toFixed(1)} OT hours.`;
            case 'employee_details': {
                const idPart = data.employeeId ? `, ID ${data.employeeId}` : '';
                return `${data.employeeName}${idPart} — ${data.department}, சம்பளம் ${this.money(data.salary)}, status ${data.status || 'Active'}.`;
            }
            case 'create_task':
                return `${data.partyName} க்கு task create ஆயிற்று.`;
            case 'complete_task':
                return `Task முடிந்தது: ${data.narration || data.taskId}.`;
            case 'daily_briefing':
                return data.messageTa || data.message || 'இன்றைய சுருக்கம் கிடைக்கவில்லை.';
            case 'unknown_intent':
                return 'புரியல. என்ன செய்ய முடியும் என்று help சொல்லுங்கள்.';
            default:
                return data.messageTa || data.message || 'சரி, முடிந்தது.';
        }
    },

    _clarifyEn(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'Which employee? Say the name or employee ID.';
            case 'employee_need_confirm':
                return `Do you mean ${data.name}? Say yes to confirm.`;
            case 'employee_need_pick': {
                const names = (data.candidates || []).map((c, i) => {
                    const n = typeof c === 'string' ? c : c.name;
                    return `${i + 1}) ${n}`;
                });
                return `I found multiple matches: ${names.join(', ')}. Which one? Say the number or name.`;
            }
            case 'employee_not_found': {
                let msg = `No employee found for "${data.query}".`;
                if (data.suggestions?.length) msg += ` Did you mean: ${data.suggestions.join(', ')}?`;
                return msg;
            }
            case 'customer_need_name':
                return 'Which customer? Say the customer name.';
            case 'customer_need_last_invoice':
                return 'Which customer last invoice? Say the customer name.';
            case 'customer_need_invoice_list':
                return 'Which customer invoices should I list? Say the customer name.';
            case 'customer_not_found': {
                let msg = `No customer found matching "${data.query}".`;
                if (data.suggestions?.length) msg += ` Did you mean: ${data.suggestions.join(', ')}?`;
                return msg;
            }
            default:
                return data.message || 'Please clarify.';
        }
    },

    _clarifyTa(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'எந்த employee? பெயர் அல்லது employee ID சொல்லுங்கள்.';
            case 'employee_need_confirm':
                return `${data.name} ஐ சொல்றீங்களா? Confirm செய்ய "ஆம்" அல்லது "seri" சொல்லுங்கள்.`;
            case 'employee_need_pick': {
                const names = (data.candidates || []).map((c, i) => {
                    const n = typeof c === 'string' ? c : c.name;
                    return `${i + 1}) ${n}`;
                });
                const joined = names.join('  ');
                return `பல பேர் கிடைத்தார்: ${joined}. எது சரி? எண் அல்லது பெயர் சொல்லுங்கள்.`;
            }
            case 'employee_not_found': {
                let msg = `"${data.query}" க்கு employee கிடைக்கவில்லை.`;
                if (data.suggestions?.length) msg += ` இவர்களா: ${data.suggestions.join(', ')}?`;
                return msg;
            }
            case 'customer_need_name':
                return 'எந்த customer? பெயர் சொல்லுங்கள். உதா: "Vega outstanding evlo".';
            case 'customer_need_last_invoice':
                return 'எந்த customer கடைசி invoice? பெயர் சொல்லுங்கள்.';
            case 'customer_need_invoice_list':
                return 'எந்த customer invoice list? பெயர் சொல்லுங்கள்.';
            case 'customer_not_found': {
                let msg = `"${data.query}" customer கிடைக்கவில்லை.`;
                if (data.suggestions?.length) msg += ` இவர்களா: ${data.suggestions.join(', ')}?`;
                return msg;
            }
            default:
                return data.messageTa || data.message || 'தயவு செய்து தெளிவாக சொல்லுங்கள்.';
        }
    },

    _clarifySpeakEn(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'Which employee? Please choose or say the name.';
            case 'employee_need_confirm':
                return data.name
                    ? `Do you mean ${data.name}? Please choose yes or no.`
                    : 'Please confirm. Choose yes or no.';
            case 'employee_need_pick':
                return 'Multiple matches. Please choose.';
            case 'employee_not_found':
                return data.candidates?.length
                    ? 'Employee not found. Please choose from the suggestions.'
                    : 'Employee not found. Please say the name again.';
            case 'customer_need_name':
                return 'Which customer? Please say the name.';
            case 'customer_need_last_invoice':
                return 'Which customer last invoice? Please say the name.';
            case 'customer_need_invoice_list':
                return 'Which customer invoices? Please say the name.';
            case 'customer_need_pick':
                return 'Multiple customers found. Please choose.';
            case 'customer_not_found':
                return data.candidates?.length
                    ? 'Customer not found. Please choose from the suggestions.'
                    : 'Customer not found. Please say the name again.';
            case 'destructive_confirm':
                return 'Please confirm. Choose yes or no.';
            default:
                return 'Please choose an option below.';
        }
    },

    _clarifySpeakTa(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'எந்த employee? தேர்வு செய்யுங்கள் அல்லது பெயர் சொல்லுங்கள்.';
            case 'employee_need_confirm':
                return data.name
                    ? `${data.name} ஐ சொல்றீங்களா? ஆம் அல்லது இல்லை தேர்வு செய்யுங்கள்.`
                    : 'Confirm செய்யுங்கள். ஆம் அல்லது இல்லை தேர்வு செய்யுங்கள்.';
            case 'employee_need_pick':
                return 'பல பேர் கிடைத்தார். தேர்வு செய்யுங்கள்.';
            case 'employee_not_found':
                return data.candidates?.length
                    ? 'Employee கிடைக்கவில்லை. suggestion-ல் ஒன்றை தேர்வு செய்யுங்கள்.'
                    : 'Employee கிடைக்கவில்லை. பெயர் மீண்டும் சொல்லுங்கள்.';
            case 'customer_need_name':
                return 'எந்த customer? பெயர் சொல்லுங்கள்.';
            case 'customer_need_last_invoice':
                return 'எந்த customer கடைசி invoice? பெயர் சொல்லுங்கள்.';
            case 'customer_need_invoice_list':
                return 'எந்த customer invoice list? பெயர் சொல்லுங்கள்.';
            case 'customer_need_pick':
                return 'பல customer கிடைத்தது. தேர்வு செய்யுங்கள்.';
            case 'customer_not_found':
                return data.candidates?.length
                    ? 'Customer கிடைக்கவில்லை. suggestion-ல் ஒன்றை தேர்வு செய்யுங்கள்.'
                    : 'Customer கிடைக்கவில்லை. பெயர் மீண்டும் சொல்லுங்கள்.';
            case 'destructive_confirm':
                return 'Confirm செய்யுங்கள். ஆம் அல்லது இல்லை தேர்வு செய்யுங்கள்.';
            default:
                return 'கீழே option தேர்வு செய்யுங்கள்.';
        }
    },

    _clarifySummaryEn(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'Which employee?';
            case 'employee_need_confirm':
                return data.name ? `Confirm: ${data.name}?` : 'Confirm employee?';
            case 'employee_need_pick':
                return 'Which employee? (multiple matches)';
            case 'employee_not_found':
                return data.query ? `Employee not found: "${data.query}"` : 'Employee not found';
            case 'customer_need_name':
                return 'Which customer?';
            case 'customer_need_last_invoice':
                return 'Which customer last invoice?';
            case 'customer_need_invoice_list':
                return 'Which customer invoices?';
            case 'customer_need_pick':
                return 'Which customer? (multiple matches)';
            case 'customer_not_found':
                return data.query ? `Customer not found: "${data.query}"` : 'Customer not found';
            case 'destructive_confirm':
                return 'Confirm action?';
            default:
                return 'Please clarify';
        }
    },

    _clarifySummaryTa(type, data) {
        switch (type) {
            case 'employee_need_name':
                return 'எந்த employee?';
            case 'employee_need_confirm':
                return data.name ? `${data.name}? confirm செய்யுங்கள்` : 'Employee confirm?';
            case 'employee_need_pick':
                return 'எந்த employee? (பல பேர்)';
            case 'employee_not_found':
                return data.query ? `Employee கிடைக்கவில்லை: "${data.query}"` : 'Employee கிடைக்கவில்லை';
            case 'customer_need_name':
                return 'எந்த customer?';
            case 'customer_need_last_invoice':
                return 'எந்த customer கடைசி invoice?';
            case 'customer_need_invoice_list':
                return 'எந்த customer invoice list?';
            case 'customer_need_pick':
                return 'எந்த customer? (பல)';
            case 'customer_not_found':
                return data.query ? `Customer கிடைக்கவில்லை: "${data.query}"` : 'Customer கிடைக்கவில்லை';
            case 'destructive_confirm':
                return 'Action confirm செய்யுங்களா?';
            default:
                return 'தயவு செய்து தெளிவாக சொல்லுங்கள்';
        }
    }
};

window.ResponseI18n = ResponseI18n;
