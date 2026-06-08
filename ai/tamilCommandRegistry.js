/**
 * Tamil / English / Tanglish command patterns for Voice ERP Agent V1.
 */
const TamilCommandRegistry = {
    fillerPrefixRe: /^(?:give\s+me\s+(?:the\s+)?|show\s+me\s+(?:the\s+)?|tell\s+me\s+(?:the\s+)?|get\s+me\s+(?:the\s+)?|please\s+(?:give\s+me\s+(?:the\s+)?)?)/i,

    stopWords: new Set([
        'give', 'me', 'the', 'a', 'an', 'show', 'tell', 'get', 'please',
        'what', 'is', 'are', 'how', 'much', 'many', 'can', 'you', 'do', 'things',
        'customer', 'party', 'data', 'details', 'report', 'summary'
    ]),

    temporalWords: new Set([
        'yesterday', 'today', 'tomorrow', 'last', 'month', 'innal', 'innalai', 'inniku', 'naalai',
        'status', 'attendance', 'attendence', 'salary', 'data', 'recent', 'billed', 'latest',
        'invoice', 'invoices', 'pending', 'outstanding', 'balance', 'amount', 'of', 'for', 'to',
        'list', 'down', 'show', 'kaatu', 'evlo', 'enna', 'report', 'summary', 'billed', 'all'
    ]),

    reservedEntityWords: new Set([
        'employees', 'employee', 'staff', 'all', 'everyone', 'everybody', 'invoices', 'invoice'
    ]),

    strongCommandRe: /(?:outstanding|pending(?:\s+amount)?|invoices?|help|what\s+(?:are\s+)?(?:the\s+)?things?\s+(?:you\s+)?can\s+do|what\s+can\s+you\s+do|(?:list|show)\s+(?:down\s+)?(?:all\s+)?(?:the\s+)?(?:employees?|invoices?)|employees?\s+list|absent|(?:generate|create)\s+(?:salary|invoice|task)|attendance\s+(?:of|for|od|summary|report)|(?:last|latest|recent)\s+invoice)/i,

    normalize(text) {
        if (typeof LanguageEngine !== 'undefined' && LanguageEngine.normalizeForParse) {
            const raw = String(text || '');
            if (LanguageEngine.TAMIL_SCRIPT_RE.test(raw)) {
                return LanguageEngine.normalizeForParse(raw).text;
            }
        }
        return String(text || '')
            .toLowerCase()
            .replace(/[.,!?'"`]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    sanitizeEntityName(raw) {
        let s = String(raw || '').trim();
        s = s.replace(this.fillerPrefixRe, '').trim();
        s = s.replace(/^(?:latest|last|recent)\s+/i, '').trim();
        s = s.replace(/\s+(?:pending|outstanding|balance|amount|invoice|invoices|billed|status)$/i, '').trim();
        return this.stripTemporalAndNoise(s);
    },

    stripTemporalAndNoise(name) {
        let s = String(name || '').trim();
        s = s.replace(this.fillerPrefixRe, '').trim();
        const words = s.toLowerCase().split(/\s+/).filter(Boolean);
        const cleaned = words.filter((w) => !this.temporalWords.has(w) && !this.stopWords.has(w));
        return cleaned.join(' ').trim();
    },

    isValidEntityName(name) {
        const s = this.sanitizeEntityName(name);
        if (!s || s.length < 2) return false;
        const lower = s.toLowerCase();
        if (this.reservedEntityWords.has(lower)) return false;
        const words = lower.split(/\s+/).filter(Boolean);
        const meaningful = words.filter((w) => !this.stopWords.has(w) && !this.reservedEntityWords.has(w));
        if (!meaningful.length) return false;
        if (meaningful.every((w) => ['latest', 'last', 'pending', 'outstanding', 'of', 'for', 'amount'].includes(w))) return false;
        return meaningful.join(' ').length >= 2;
    },

    shouldClearPendingClarify(text) {
        return this.strongCommandRe.test(this.normalize(text));
    },

    isBareEntityReply(text) {
        const t = this.normalize(text);
        if (this.shouldClearPendingClarify(t)) return false;
        const stripped = this.stripTemporalAndNoise(this.sanitizeEntityName(t));
        if (!this.isValidEntityName(stripped)) return false;
        return stripped.split(/\s+/).filter(Boolean).length <= 6;
    },

    /** Extract customer from natural English: "outstanding of Vega", "pending amount of X" */
    extractCustomerName(text) {
        const t = this.normalize(text);
        const patterns = [
            /(?:latest\s+)?(?:pending\s+amount|outstanding|pending)\s+(?:of|for)\s+(.+)$/i,
            /(?:give\s+me\s+(?:the\s+)?)?(?:latest\s+)?(?:pending\s+amount|outstanding|pending)\s+(?:of|for)\s+(.+)$/i,
            /^([a-z0-9][a-z0-9\s&.'-]{2,60})\s+(?:pending|outstanding)\s*(?:amount|balance)?$/i
        ];
        for (const re of patterns) {
            const m = t.match(re);
            if (!m || !m[1]) continue;
            const name = this.sanitizeEntityName(m[1]);
            if (this.isValidEntityName(name)) return name;
        }
        return null;
    },

    /** Extract employee from "attendance of Annadurai", "attendance data od X" */
    extractEmployeeName(text) {
        const t = this.normalize(text);
        const patterns = [
            /attendance(?:\s+data)?\s+(?:of|od|for)\s+(.+)$/i,
            /(?:give\s+me\s+(?:the\s+)?)?attendance(?:\s+data)?\s+(?:of|od|for)\s+(.+)$/i,
            /^([a-z][a-z\s.'-]{1,40})\s+attendance(?:\s+data)?$/i
        ];
        for (const re of patterns) {
            const m = t.match(re);
            if (!m || !m[1]) continue;
            const name = this.sanitizeEntityName(m[1]);
            if (this.isValidEntityName(name)) return name;
        }
        return null;
    },

    /** Bare name reply after "which customer?" or "which employee?" */
    tryResolveBareEntity(text, fieldHint) {
        const s = this.stripTemporalAndNoise(this.sanitizeEntityName(text));
        if (!this.isValidEntityName(s)) return null;
        if (typeof ErpFunctions !== 'undefined') {
            if (fieldHint === 'employee') {
                const byId = ErpFunctions.findEmployeeById(s);
                if (byId) return { type: 'employee', name: byId.name };
                const resolved = ErpFunctions.resolveEmployeeQuery(s);
                if (resolved.exact && !resolved.needConfirm) {
                    return { type: 'employee', name: resolved.exact.name };
                }
                if (s.split(/\s+/).length <= 6) {
                    return { type: 'employee', name: s };
                }
                return null;
            }
            if (fieldHint === 'customer') {
                const c = ErpFunctions.findCustomerByName(s);
                if (c) return { type: 'customer', name: c.name || s };
                return null;
            }
            const c = ErpFunctions.findCustomerByName(s);
            if (c) return { type: 'customer', name: c.name || s };
            const emp = ErpFunctions.findEmployeeByName(s);
            if (emp) return { type: 'employee', name: emp.name };
        }
        if (s.split(/\s+/).length <= 6) {
            return { type: fieldHint === 'employee' ? 'employee' : 'customer', name: s };
        }
        return null;
    },

    isInvoiceListPhrase(text) {
        return /(?:list|show)\s+(?:down\s+)?(?:the\s+)?(?:pending\s+)?invoices?/i.test(text)
            || /(?:pending\s+)?invoices?\s+(?:list|kaatu|show)/i.test(text);
    },

    isRecentInvoicePhrase(text) {
        return /(?:what\s+is\s+(?:the\s+)?)?(?:recent|latest|last)\s+invoice(?:\s+billed)?(?:\s+to)?/i.test(text)
            || /(?:give\s+me\s+(?:the\s+)?)?(?:recent|latest|last)\s+invoice(?:\s+billed)?(?:\s+to)?/i.test(text);
    },

    extractLastInvoiceCustomer(text) {
        const t = this.normalize(text);
        const patterns = [
            /(?:last|latest|recent)\s+invoice\s+billed\s+to\s+(.+)$/i,
            /(?:last|latest|recent)\s+invoice\s+(?:of|for)\s+(.+)$/i
        ];
        for (const re of patterns) {
            const m = t.match(re);
            if (!m || !m[1]) continue;
            const name = this.sanitizeEntityName(m[1]);
            if (this.isValidEntityName(name)) return name;
        }
        return null;
    },

    actionVerbs: {
        podu: 'create', pannu: 'do', kaatu: 'show', evlo: 'how_much', enna: 'what',
        open: 'navigate', create: 'create', generate: 'generate', complete: 'complete',
        delete: 'delete', mark: 'mark'
    },

    patterns: [
        // Help
        { intent: 'help', re: /what\s+(?:are\s+)?(?:the\s+)?things?\s+(?:you\s+)?can\s+do|what\s+can\s+you\s+do|(?:show\s+)?help|commands?\s*list|capabilities|enna\s+panna\s+mudiyum|help\s+kaatu|udhavi/i, slots: [] },

        // Daily briefing / today summary
        { intent: 'daily_briefing', re: /(?:today|inniku|daily|morning)\s+(?:summary|briefing|status|report)|daily\s+(?:summary|briefing)|today\s+briefing|(?:give\s+me\s+)?today\s+summary|(?:show\s+)?(?:daily|today)\s+briefing/i, slots: [] },
        { intent: 'daily_briefing', re: /(?:இன்றைய\s*சுருக்கம்|இன்று\s*என்ன\s*நிலை|இன்று\s*நிலை\s*சுருக்கம்)/u, slots: [] },

        // Employee details (before list — "show employee X" must not match list)
        { intent: 'employee_details', re: /(?:employee\s+)?details?\s+(?:of|for)\s+([a-z][a-z\s.'-]{1,40})/i, slots: ['employeeName'] },
        { intent: 'employee_details', re: /(?:show|get)\s+employee\s+([a-z][a-z\s.'-]{1,40})/i, slots: ['employeeName'] },
        { intent: 'employee_details', re: /([a-z][a-z\s.'-]{1,40})\s+employee\s+details?/i, slots: ['employeeName'] },

        // Employee list
        { intent: 'list_employees', re: /(?:list|show)\s+(?:down\s+)?(?:all\s+)?(?:the\s+)?employees?\s*$/i, slots: [] },
        { intent: 'list_employees', re: /employees?\s+(?:list|kaatu|show)\s*$/i, slots: [] },

        // Attendance — absent with date
        { intent: 'absent_employees', re: /(?:how\s+many\s+)?(?:employees?\s+)?(?:are\s+|were\s+)?absent\s+(?:yesterday|innal|innalai)/i, slots: [] },
        { intent: 'absent_employees', re: /(?:yesterday|innal|innalai)\s+(?:who\s+)?(?:were\s+)?absent|absent\s+(?:yesterday|innal|innalai)/i, slots: [] },
        { intent: 'absent_employees', re: /(?:yaar|who)\s+absent|absent\s+(?:inniku|today|employees?)|absent\s+list|inniku\s+yaar\s+absent|innal\s+yaar\s+absent|yaar\s+varala|(?:inniku|today)\s+yaar\s+varala/i, slots: [] },
        { intent: 'absent_employees', re: /(?:இன்று|நேற்று)?\s*யார்\s*வரவில்லை|இன்று\s*யார்\s*வரவில்லை/u, slots: [] },

        { intent: 'mark_attendance', re: /(?:^|.*\b)([a-z][a-z\s.'-]{1,30}?)\s+(?:ku|ukku)?\s*(?:attendance|attendence)\s+(?:podu|mark|pannu|set)/i, slots: ['employeeName'] },
        { intent: 'mark_attendance', re: /(?:attendance|attendence)\s+(?:podu|mark|pannu)\s+(?:for\s+)?([a-z][a-z\s.'-]{1,30})/i, slots: ['employeeName'] },
        { intent: 'mark_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+(present|half\s*day|halfday)\s*(?:podu|mark|pannu|inniku|today)?/i, slots: ['employeeName', 'status'] },
        { intent: 'mark_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+(?:varugai|attendance)\s+(?:podu|pannu|mark|பதிவு)/i, slots: ['employeeName'] },
        { intent: 'mark_attendance', re: /(?:அண்ணாதுரை|[\u0B80-\u0BFF\s]{2,20})\s*வருகை\s*(?:பதிவு\s*செய்|பதிவு)/u, slots: [] },
        { intent: 'mark_leave', re: /([a-z][a-z\s.'-]{1,30})\s*(?:ku|ukku)?\s*leave\s+(?:podu|mark|pannu)/i, slots: ['employeeName'] },
        { intent: 'mark_leave', re: /leave\s+(?:podu|mark|pannu)\s+(?:for\s+)?([a-z][a-z\s.'-]{1,30})/i, slots: ['employeeName'] },
        { intent: 'attendance_summary', re: /(?:attendance|attendence)\s+(?:summary|report|kaatu|show|list)|monthly\s+attendance|(?:yesterday|innal|innalai)\s+(?:attendance|varugai)\s+list|(?:நேற்று|இன்று)\s*வருகை\s*பட்டியல்/u, slots: [] },

        // Employee attendance — natural English (date/status variants before generic)
        { intent: 'employee_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+(?:yesterday|today|innal|inniku|innalai)\s+attendance(?:\s+status)?/i, slots: ['employeeName'] },
        { intent: 'employee_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+attendance(?:\s+status)?\s+(?:yesterday|today|innal|inniku|innalai)/i, slots: ['employeeName'] },
        { intent: 'employee_attendance', re: /(?:give\s+me\s+(?:the\s+)?)?attendance(?:\s+data)?\s+(?:of|od|for)\s+([a-z][a-z\s.'-]{1,40})/i, slots: ['employeeName'] },
        { intent: 'employee_attendance', re: /([a-z][a-z\s.'-]{1,40})\s+attendance(?:\s+data)?(?:\s+kaatu|\s+show|\s+report)?/i, slots: ['employeeName'] },

        // Employee salary — last month
        { intent: 'employee_salary', re: /last\s+month\s+([a-z][a-z\s.'-]{1,30})\s+salary/i, slots: ['employeeName'] },
        { intent: 'employee_salary', re: /([a-z][a-z\s.'-]{1,30})\s+last\s+month\s+salary/i, slots: ['employeeName'] },

        // Customer invoice list & recent invoice (before loose customer patterns)
        { intent: 'customer_invoice_list', re: /(?:list|show)\s+(?:down\s+)?(?:the\s+)?(?:pending\s+)?invoices?/i, slots: [] },
        { intent: 'customer_invoice_list', re: /(?:pending\s+)?invoices?\s+(?:list|kaatu|show)/i, slots: [] },
        { intent: 'customer_last_invoice', re: /(?:last|latest|recent)\s+invoice\s+billed\s+to\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerName'] },
        { intent: 'last_invoice', re: /(?:what\s+is\s+(?:the\s+)?)?(?:recent|latest|last)\s+invoice(?:\s+billed)?(?:\s+to)?/i, slots: [] },
        { intent: 'last_invoice', re: /(?:give\s+me\s+(?:the\s+)?)?(?:recent|latest|last)\s+invoice(?:\s+billed)?(?:\s+to)?/i, slots: [] },

        // Customer — "outstanding OF customer" (must be before loose patterns)
        { intent: 'customer_outstanding', re: /(?:give\s+me\s+(?:the\s+)?)?(?:latest\s+)?(?:pending\s+amount|outstanding|pending|niluvai)\s+(?:of|for)\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerName'] },
        { intent: 'customer_last_invoice', re: /(?:latest|last)\s+invoice\s+(?:of|for)\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerName'] },
        { intent: 'last_invoice', re: /(?:give\s+me\s+(?:the\s+)?)?(?:latest|last)\s+invoice\s*$/i, slots: [] },
        { intent: 'last_invoice', re: /(?:give\s+me\s+(?:the\s+)?)?(?:latest|last)\s+invoice\s*(?:kaatu|show|details?)?\s*$/i, slots: [] },
        { intent: 'customer_last_invoice', re: /([a-z0-9][a-z0-9\s&.'-]{2,60}?)\s+(?:latest|last)\s+invoice/i, slots: ['customerName'] },
        { intent: 'customer_last_invoice', re: /last\s+invoice\s+(?:kaatu|show|of)\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerNameAlt'] },
        { intent: 'customer_outstanding', re: /^([a-z0-9][a-z0-9\s&.'-]{2,60})\s+(?:pending|outstanding)\s*(?:amount|balance|evlo|enna|kaatu|show)?$/i, slots: ['customerName'] },
        { intent: 'customer_outstanding', re: /(?:pending|outstanding)\s+(?:amount\s+)?(?:of|for)\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerName'] },
        { intent: 'customer_search', re: /(?:customer|party)\s+(?:search|find|kaatu)\s+([a-z0-9][a-z0-9\s&.'-]{2,60})/i, slots: ['customerName'] },
        { intent: 'customer_outstanding', re: /customer\s+outstanding\s+(?:kaatu|show|list)/i, slots: [] },
        { intent: 'customer_outstanding', re: /^(?:give\s+me\s+(?:the\s+)?)?(?:pending|outstanding|niluvai)\s*(?:amount|balance|evlo|enna|kaatu)?$/i, slots: [] },
        { intent: 'customer_outstanding', re: /([a-z0-9][a-z0-9\s&.'-]{2,60})\s+(?:niluvai|pending)\s*(?:evlo|enna|kaatu|எவ்வளவு)?/i, slots: ['customerName'] },
        { intent: 'customer_outstanding', re: /(?:அவான்\s*ஆக்சிஜன்|[\u0B80-\u0BFF\s]{2,30})\s*நிலுவை\s*எவ்வளவு/u, slots: [] },
        { intent: 'employee_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+(?:innal|innalai|yesterday)\s+(?:attendance|varugai)/i, slots: ['employeeName'] },
        { intent: 'employee_salary', re: /([a-z][a-z\s.'-]{1,30})\s+(?:sambalam|salary)\s*(?:evlo|enna|kaatu)?/i, slots: ['employeeName'] },
        { intent: 'salary_summary', re: /(?:this\s+month|இந்த\s*மாத(?:ம்)?)\s+(?:sambalam|salary|சம்பளம்)\s*(?:evlo|enna|kaatu|எவ்வளவு)?|(?:sambalam|salary|சம்பளம்)\s+(?:evlo|enna|kaatu)\s*(?:this\s+month|இந்த\s*மாத)?/i, slots: [] },
        { intent: 'last_invoice', re: /^last\s+invoice\s*(?:kaatu|show|evlo)?$/i, slots: [] },
        { intent: 'customer_outstanding', re: /^(?:pending|outstanding)\s*(?:evlo|amount|enna|kaatu)?$/i, slots: [] },

        // Payroll
        { intent: 'generate_salary', re: /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+salary\s+(?:generate|pannu|create)/i, slots: ['monthName'] },
        { intent: 'generate_salary', re: /salary\s+(?:generate|payout)\s+(?:pannu|for)?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)?/i, slots: ['monthName'] },
        { intent: 'salary_summary', re: /salary\s+(?:summary|status|pending|kaatu)/i, slots: [] },

        // Employee
        { intent: 'employee_ot', re: /([a-z][a-z\s.'-]{1,30})\s+ot\s*(?:evlo|hours|enna|kaatu)?/i, slots: ['employeeName'] },
        { intent: 'employee_salary', re: /([a-z][a-z\s.'-]{1,30})\s+salary\s*(?:evlo|amount|enna|kaatu)?/i, slots: ['employeeName'] },

        // Tasks
        { intent: 'create_task', re: /(?:tomorrow|today)?\s*([a-z][a-z\s]{0,30})?\s*task\s+create\s*(?:pannu)?|create\s+task\s*(?:pannu)?\s*(?:for\s+)?([a-z0-9][a-z0-9\s&.'-]{0,60})/i, slots: ['taskHint', 'partyName'] },
        { intent: 'complete_task', re: /([a-z][a-z\s]{0,40})\s*task\s+complete\s*(?:pannu)?|complete\s+task\s*(?:pannu)?\s*([a-z][a-z\s]{0,40})/i, slots: ['taskHint', 'taskHintAlt'] },
        { intent: 'pending_tasks', re: /pending\s+tasks?|task\s+(?:summary|list|kaatu)/i, slots: [] },

        // Documents
        { intent: 'create_invoice', re: /invoice\s+create\s*(?:pannu)?|create\s+invoice/i, slots: [] },
        { intent: 'create_quotation', re: /quotation\s+create\s*(?:pannu)?|create\s+quotation/i, slots: [] },
        { intent: 'create_proforma', re: /proforma\s+(?:invoice\s+)?create|create\s+proforma/i, slots: [] },
        { intent: 'create_delivery_challan', re: /(?:delivery\s+)?(?:challan|dc)\s+create\s*(?:pannu)?|create\s+(?:delivery\s+)?(?:challan|dc)/i, slots: [] },
        { intent: 'create_job_card', re: /job\s*card\s+create\s*(?:pannu)?|create\s+job\s*card/i, slots: [] },

        // Navigation
        { intent: 'navigate', re: /(?:open|go\s+to|show)\s+(dashboard|attendance|salary|employees?|tasks?|payments?|analytics|invoices?|challans?|delivery|job\s*cards?|admin|hrms)/i, slots: ['target'] },
        { intent: 'navigate', re: /(dashboard|attendance|salary|employees?|tasks?|payments?|analytics)\s+(?:page\s+)?open\s*(?:pannu)?/i, slots: ['target'] },

        // Destructive
        { intent: 'delete_invoice', re: /invoice\s+delete\s*(?:pannu)?|delete\s+invoice/i, slots: [] },
        { intent: 'delete_task', re: /task\s+delete\s*(?:pannu)?|delete\s+task/i, slots: [] },
        { intent: 'delete_attendance', re: /attendance\s+delete|delete\s+attendance/i, slots: [] }
    ]
};

window.TamilCommandRegistry = TamilCommandRegistry;
