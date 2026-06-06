/**
 * Rule-based intent detection — Tamil, English, Tanglish.
 */
const IntentEngine = {
    CONFIRM_RE: /^(yes|ok|okay|confirm|seri|sari|aadha|aama|pannu|delete\s*pannu|proceed)$/i,
    CANCEL_RE: /^(no|cancel|venda|illai|stop|abort)$/i,

    parse(rawText) {
        const text = TamilCommandRegistry.normalize(rawText);
        if (!text) return { intent: null, slots: {}, confidence: 0, raw: rawText };

        const pending = ContextManager.getConfirmation();
        if (pending) {
            if (this.CONFIRM_RE.test(text)) {
                return { intent: pending.intent, slots: pending.slots || {}, confidence: 1, confirmed: true, raw: rawText };
            }
            if (this.CANCEL_RE.test(text)) {
                ContextManager.clearConfirmation();
                return { intent: 'cancelled', slots: {}, confidence: 1, raw: rawText };
            }
        }

        const clarifyFollow = this._handlePendingClarify(text, rawText);
        if (clarifyFollow) return clarifyFollow;

        const pre = this._preParse(text, rawText);
        if (pre) return pre;

        for (const pat of TamilCommandRegistry.patterns) {
            const m = text.match(pat.re);
            if (!m) continue;
            const slots = {};
            (pat.slots || []).forEach((name, idx) => {
                const val = m[idx + 1];
                if (val && String(val).trim()) slots[name] = String(val).trim();
            });
            if (slots.customerNameAlt && !slots.customerName) slots.customerName = slots.customerNameAlt;
            if (slots.taskHintAlt && !slots.taskHint) slots.taskHint = slots.taskHintAlt;
            this._sanitizeSlots(slots);
            if (!this._isValidMatch(pat.intent, slots, text)) continue;
            this._enrichSlots(slots, text);
            return { intent: pat.intent, slots, confidence: 0.85, raw: rawText };
        }

        return this._fallbackParse(text, rawText);
    },

    _handlePendingClarify(text, rawText) {
        const clarify = ContextManager.getPendingClarify();
        if (!clarify) return null;

        if (TamilCommandRegistry.shouldClearPendingClarify(text)) {
            ContextManager.clearPendingClarify();
            return null;
        }

        if (this.CANCEL_RE.test(text)) {
            ContextManager.clearPendingClarify();
            return { intent: 'cancelled', slots: {}, confidence: 1, raw: rawText };
        }

        if (clarify.state === 'need_confirm' && this.CONFIRM_RE.test(text)) {
            ContextManager.clearPendingClarify();
            const emp = clarify.tentative || clarify.candidates?.[0];
            const name = typeof emp === 'string' ? emp : emp?.name;
            const slots = { ...(clarify.slots || {}), employeeName: name };
            return { intent: clarify.intent, slots, confidence: 1, confirmedClarify: true, raw: rawText };
        }

        if (clarify.state === 'need_pick') {
            const pickMatch = text.match(/^(\d+)$/);
            if (pickMatch) {
                const idx = parseInt(pickMatch[1], 10) - 1;
                const cands = clarify.candidates || [];
                if (idx >= 0 && idx < cands.length) {
                    ContextManager.clearPendingClarify();
                    const emp = cands[idx];
                    const name = typeof emp === 'string' ? emp : emp.name;
                    const slots = { ...(clarify.slots || {}), employeeName: name };
                    return { intent: clarify.intent, slots, confidence: 1, raw: rawText };
                }
            }
            const q = TamilCommandRegistry.stripTemporalAndNoise(TamilCommandRegistry.sanitizeEntityName(text));
            const match = (clarify.candidates || []).find((c) => {
                const n = String(c?.name || c).toLowerCase();
                return n === q || n.includes(q) || q.includes(n);
            });
            if (match) {
                ContextManager.clearPendingClarify();
                const name = typeof match === 'string' ? match : match.name;
                const slots = { ...(clarify.slots || {}), employeeName: name };
                return { intent: clarify.intent, slots, confidence: 0.95, raw: rawText };
            }
        }

        if (TamilCommandRegistry.isBareEntityReply(text) || clarify.field === 'employee') {
            const entity = TamilCommandRegistry.tryResolveBareEntity(text, clarify.field);
            if (entity) {
                const slots = { ...(clarify.slots || {}) };
                if (entity.type === 'employee') slots.employeeName = entity.name;
                else slots.customerName = entity.name;
                if (entity.type === 'customer') ContextManager.clearPendingClarify();
                return { intent: clarify.intent, slots, confidence: 0.95, raw: rawText };
            }
            if (clarify.field === 'employee' && typeof ErpFunctions !== 'undefined') {
                const idEmp = ErpFunctions.findEmployeeById(text);
                if (idEmp) {
                    ContextManager.clearPendingClarify();
                    const slots = { ...(clarify.slots || {}), employeeName: idEmp.name };
                    return { intent: clarify.intent, slots, confidence: 0.95, raw: rawText };
                }
            }
        }

        return null;
    },

    _preParse(text, rawText) {
        if (/what\s+(?:are\s+)?(?:the\s+)?things?\s+(?:you\s+)?can\s+do|what\s+can\s+you\s+do|^help$|commands?\s*list|capabilities/i.test(text)) {
            return { intent: 'help', slots: {}, confidence: 0.95, raw: rawText };
        }

        if (/(?:list|show)\s+(?:down\s+)?(?:all\s+)?(?:the\s+)?employees?\s*$/i.test(text)
            || /employees?\s+(?:list|kaatu|show)\s*$/i.test(text)) {
            return { intent: 'list_employees', slots: {}, confidence: 0.95, raw: rawText };
        }

        const invoiceCustomer = TamilCommandRegistry.extractLastInvoiceCustomer(text);
        if (invoiceCustomer) {
            return { intent: 'customer_last_invoice', slots: { customerName: invoiceCustomer }, confidence: 0.93, raw: rawText };
        }

        if (TamilCommandRegistry.isRecentInvoicePhrase(text)) {
            return { intent: 'last_invoice', slots: {}, confidence: 0.92, raw: rawText };
        }

        if (TamilCommandRegistry.isInvoiceListPhrase(text)) {
            return { intent: 'customer_invoice_list', slots: {}, confidence: 0.92, raw: rawText };
        }

        if (/outstanding|pending/i.test(text) && !/invoices?/i.test(text)) {
            const name = TamilCommandRegistry.extractCustomerName(text);
            if (name) {
                return { intent: 'customer_outstanding', slots: { customerName: name }, confidence: 0.92, raw: rawText };
            }
        }

        if (/attendance|attendence/i.test(text) && /(?:of|od|for)\s+/i.test(text)) {
            const emp = TamilCommandRegistry.extractEmployeeName(text);
            if (emp) {
                return { intent: 'employee_attendance', slots: { employeeName: emp }, confidence: 0.92, raw: rawText };
            }
        }

        if (/(?:how\s+many\s+)?(?:employees?\s+)?(?:are\s+|were\s+)?absent|absent\s+(?:yesterday|today|innal)/i.test(text)) {
            const slots = {};
            if (/yesterday|innal/i.test(text)) slots.when = 'yesterday';
            else if (/today|inniku/i.test(text)) slots.when = 'today';
            return { intent: 'absent_employees', slots, confidence: 0.88, raw: rawText };
        }

        return null;
    },

    _sanitizeSlots(slots) {
        if (slots.customerName) {
            slots.customerName = TamilCommandRegistry.stripTemporalAndNoise(
                TamilCommandRegistry.sanitizeEntityName(slots.customerName)
            );
            if (!TamilCommandRegistry.isValidEntityName(slots.customerName)) delete slots.customerName;
        }
        if (slots.employeeName) {
            slots.employeeName = TamilCommandRegistry.stripTemporalAndNoise(
                TamilCommandRegistry.sanitizeEntityName(slots.employeeName)
            );
            if (!TamilCommandRegistry.isValidEntityName(slots.employeeName)) delete slots.employeeName;
            else if (typeof ErpFunctions !== 'undefined') {
                const resolved = ErpFunctions.resolveEmployeeQuery(slots.employeeName);
                if (resolved.exact && !resolved.needConfirm && resolved.state !== 'need_pick') {
                    slots.employeeName = resolved.exact.name;
                }
            }
        }
        if (slots.partyName) {
            slots.partyName = TamilCommandRegistry.sanitizeEntityName(slots.partyName);
            if (!TamilCommandRegistry.isValidEntityName(slots.partyName)) delete slots.partyName;
        }
    },

    _isValidMatch(intent, slots, text) {
        const needsCustomer = ['customer_outstanding', 'customer_last_invoice', 'customer_search'].includes(intent);
        if (needsCustomer && !slots.customerName) {
            return /pending|outstanding/i.test(text) && !/invoices?\s*(?:list|kaatu|show)/i.test(text);
        }
        if (intent === 'customer_last_invoice' && slots.customerName) {
            const n = slots.customerName.toLowerCase();
            if (/^(?:what|recent|latest|the|give|me|is)\b/.test(n) || n.includes('invoice')) return false;
        }
        const needsEmployee = ['mark_attendance', 'mark_leave', 'employee_ot', 'employee_salary', 'employee_attendance', 'employee_details', 'delete_attendance'].includes(intent);
        if (needsEmployee && !slots.employeeName) return false;
        return true;
    },

    _enrichSlots(slots, text) {
        if (slots.status) {
            const s = slots.status.toLowerCase();
            if (s.includes('half')) slots.status = 'halfday';
        }
        if (/last\s+month/i.test(text)) slots.monthOffset = -1;
        if (/yesterday|innal|innalai/i.test(text)) slots.when = 'yesterday';
        else if (/tomorrow|naalai/i.test(text)) slots.when = 'tomorrow';
        else if (/today|inniku/i.test(text)) slots.when = 'today';
    },

    _fallbackParse(text, rawText) {
        if (TamilCommandRegistry.isRecentInvoicePhrase(text)) {
            return { intent: 'last_invoice', slots: {}, confidence: 0.75, raw: rawText };
        }
        if (TamilCommandRegistry.isInvoiceListPhrase(text)) {
            return { intent: 'customer_invoice_list', slots: {}, confidence: 0.75, raw: rawText };
        }

        const clarify = ContextManager.getPendingClarify();
        if (clarify && TamilCommandRegistry.isBareEntityReply(text)) {
            const entity = TamilCommandRegistry.tryResolveBareEntity(text, clarify.field);
            if (entity) {
                const slots = entity.type === 'employee'
                    ? { employeeName: entity.name }
                    : { customerName: entity.name };
                return { intent: clarify.intent, slots, confidence: 0.85, raw: rawText };
            }
        }

        const lastIntent = ContextManager.get().lastIntent;
        const followEntity = TamilCommandRegistry.isBareEntityReply(text)
            ? TamilCommandRegistry.tryResolveBareEntity(text, null)
            : null;
        if (followEntity && ['customer_outstanding', 'customer_last_invoice', 'last_invoice', 'customer_invoice_list'].includes(lastIntent)) {
            const slots = followEntity.type === 'customer' ? { customerName: followEntity.name } : {};
            if (slots.customerName) {
                return { intent: lastIntent, slots, confidence: 0.6, raw: rawText };
            }
        }
        if (followEntity && followEntity.type === 'employee' && ['employee_attendance', 'employee_salary', 'employee_ot', 'employee_details'].includes(lastIntent)) {
            return { intent: lastIntent, slots: { employeeName: followEntity.name }, confidence: 0.6, raw: rawText };
        }

        const customer = TamilCommandRegistry.extractCustomerName(text);
        if (customer && !/invoice/i.test(text)) {
            return { intent: 'customer_outstanding', slots: { customerName: customer }, confidence: 0.7, raw: rawText };
        }

        const employee = TamilCommandRegistry.extractEmployeeName(text);
        if (employee && /attendance|attendence/i.test(text)) {
            const slots = { employeeName: employee };
            if (/yesterday|innal|innalai/i.test(text)) slots.when = 'yesterday';
            else if (/today|inniku/i.test(text)) slots.when = 'today';
            return { intent: 'employee_attendance', slots, confidence: 0.7, raw: rawText };
        }

        if (employee && /salary/i.test(text)) {
            const slots = { employeeName: employee };
            if (/last\s+month/i.test(text)) slots.monthOffset = -1;
            return { intent: 'employee_salary', slots, confidence: 0.7, raw: rawText };
        }

        if (text.includes('attendance') && (text.includes('podu') || text.includes('mark') || text.includes('pannu'))) {
            const words = text.split(' ');
            const name = words.find((w) => w.length > 2 && !['attendance', 'attendence', 'podu', 'mark', 'pannu', 'for'].includes(w));
            return { intent: 'mark_attendance', slots: name ? { employeeName: name } : {}, confidence: 0.5, raw: rawText };
        }

        if (/^(?:give\s+me\s+(?:the\s+)?)?(?:latest|last)\s+invoice/.test(text)) {
            return { intent: 'last_invoice', slots: {}, confidence: 0.6, raw: rawText };
        }

        if (text.includes('salary') && (text.includes('generate') || text.includes('pannu'))) {
            return { intent: 'generate_salary', slots: {}, confidence: 0.5, raw: rawText };
        }

        return { intent: null, slots: {}, confidence: 0, raw: rawText };
    }
};

window.IntentEngine = IntentEngine;
