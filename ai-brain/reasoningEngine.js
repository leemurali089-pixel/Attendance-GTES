/**
 * reasoningEngine.js — Jarvis AI OS Reasoning + Guards (v3)
 *
 * New in v3:
 *   - Future-date guard: attendance for future date → clarification
 *   - Payroll confirmation gate: "generate payroll" → confirm month
 *   - Incomplete name guard: ambiguous employee/customer → disambiguation
 *   - User correction detector: "X means Y" → TrainingCenter.processUserCorrection
 */
(function (global) {
    'use strict';

    /** Only intents NOT handled by IntentRegistry / CommandRouter */
    const SANDBOX_RULES = [
        { intent: 'attendance.bulkMark', patterns: [/bulk.*attendance/i, /mark.*attendance.*all/i, /அனைவருக்கும்.*வருகை/i] },
        { intent: 'task.bulkCreate', patterns: [/bulk.*task/i, /create\s+\d+\s+tasks/i] },
        { intent: 'voucher.create', patterns: [/create\s+voucher/i, /voucher\s+create/i] }
    ];

    // ── Date helpers ──────────────────────────────────────────────────────────

    function _today() { return new Date().toISOString().slice(0, 10); }

    function _parseDate(text) {
        const t = String(text || '').toLowerCase();
        const now = new Date();

        if (/\btomorrow\b|நாளை|naalai/.test(t)) {
            const d = new Date(now); d.setDate(d.getDate() + 1);
            return d.toISOString().slice(0, 10);
        }
        if (/\bnext\s+week\b/.test(t)) {
            const d = new Date(now); d.setDate(d.getDate() + 7);
            return d.toISOString().slice(0, 10);
        }
        // ISO date in text
        const iso = t.match(/(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        // DD/MM/YYYY or DD-MM-YYYY
        const dmy = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dmy) {
            const yr = parseInt(dmy[3]), mo = parseInt(dmy[2]) - 1, da = parseInt(dmy[1]);
            return new Date(yr, mo, da).toISOString().slice(0, 10);
        }
        return null;
    }

    function _isFutureDate(dateStr) {
        if (!dateStr) return false;
        return dateStr > _today();
    }

    // ── Month extraction ──────────────────────────────────────────────────────

    const MONTHS = [
        'january','february','march','april','may','june',
        'july','august','september','october','november','december'
    ];

    function _extractMonth(text) {
        const t = String(text || '').toLowerCase();
        for (let i = 0; i < MONTHS.length; i++) {
            if (t.includes(MONTHS[i])) return MONTHS[i];
        }
        // Current month as default
        return MONTHS[new Date().getMonth()];
    }

    // ── Intent type detectors ─────────────────────────────────────────────────

    function _isAttendanceQuery(text) {
        return /\b(attendance|present|absent|who\s+came|came|varala|வருகை|வந்தவர்|வராதவர்)\b/i.test(text);
    }

    function _isPayrollGenerate(text) {
        return /\b(generate|create|make|process|run)\b.*\b(payroll|salary|payout)\b/i.test(text) ||
               /\b(payroll|salary|payout)\b.*\b(generate|create|make|process|run)\b/i.test(text);
    }

    function _isCorrectionPattern(text) {
        return /\bmeans\b|\bcall\b.*\bas\b|\bremember\b.*\bas\b/i.test(text) &&
               text.trim().split(/\s+/).length <= 12;
    }

    // ── Entity extraction (shared) ────────────────────────────────────────────

    function _extractEntities(utterance, ctx) {
        const entities = {};
        const text = String(utterance || '');

        const custMatch = text.match(/(?:customer|party|for)\s+([A-Za-z0-9\s.&-]+?)(?:\s+(?:outstanding|pending|due)|$)/i);
        if (custMatch) entities.customer = custMatch[1].trim();

        const empMatch = text.match(/(?:employee|staff)\s+([A-Za-z\s]+?)(?:\s|$)/i);
        if (empMatch) entities.employee = empMatch[1].trim();

        if (ctx && ctx.enriched) {
            if (ctx.enriched.resolvedCustomerId) entities.customerId = ctx.enriched.resolvedCustomerId;
            if (ctx.enriched.resolvedEmployeeId) entities.employeeId = ctx.enriched.resolvedEmployeeId;
        }

        if (typeof ContextManager !== 'undefined') {
            const session = ContextManager.get();
            if (!entities.customer && session.lastCustomerName) entities.customer = session.lastCustomerName;
            if (!entities.employee && session.lastEmployeeName) entities.employee = session.lastEmployeeName;
        }

        return entities;
    }

    // ─────────────────────────────────────────────────────────────────────────

    const ReasoningEngine = {

        parse: function (utterance, ctx) {
            ctx = ctx || {};
            const text = String(utterance || '').trim();
            if (!text) {
                return { ok: false, intent: null, confidence: 0, error: 'Empty utterance' };
            }

            // ── Guard 1: User Correction ("X means Y") ────────────────────────
            if (_isCorrectionPattern(text)) {
                const correction = typeof TrainingCenter !== 'undefined'
                    ? TrainingCenter.processUserCorrection(text)
                    : null;
                if (correction && correction.ok) {
                    return {
                        ok: true,
                        intent: 'learning.correction',
                        functionName: 'learning.correction',
                        confidence: 1.0,
                        slots: { spoken: correction.spoken, resolved: correction.resolved, type: correction.type },
                        entities: _extractEntities(text, ctx),
                        correction: correction,
                        decisionPath: ['reasoningEngine.correctionGuard'],
                        guardTriggered: 'correction'
                    };
                }
            }

            // ── Guard 2: Future Date ──────────────────────────────────────────
            if (_isAttendanceQuery(text)) {
                const dateStr = _parseDate(text);
                if (_isFutureDate(dateStr)) {
                    return {
                        ok: true,
                        intent: 'guard.futureDate',
                        functionName: 'guard.futureDate',
                        confidence: 1.0,
                        slots: { requestedDate: dateStr, today: _today() },
                        entities: _extractEntities(text, ctx),
                        decisionPath: ['reasoningEngine.futureDateGuard'],
                        guardTriggered: 'futureDate',
                        guardMessage: 'Attendance records are not available for future dates (' + dateStr + '). Did you mean today (' + _today() + ')?'
                    };
                }
            }

            // ── Guard 3: Payroll Generation Confirmation ──────────────────────
            if (_isPayrollGenerate(text)) {
                const month = _extractMonth(text);
                const year = new Date().getFullYear();
                // If no explicit confirmation flag in context, gate it
                if (!ctx.confirmed && !ctx.payrollConfirmed) {
                    return {
                        ok: true,
                        intent: 'guard.payrollConfirm',
                        functionName: 'guard.payrollConfirm',
                        confidence: 1.0,
                        slots: { month: month, year: year },
                        entities: _extractEntities(text, ctx),
                        decisionPath: ['reasoningEngine.payrollConfirmGuard'],
                        guardTriggered: 'payrollConfirm',
                        needConfirm: true,
                        guardMessage: 'Do you want to generate payroll for ' + month.charAt(0).toUpperCase() + month.slice(1) + ' ' + year + '?',
                        confirmedIntent: 'payroll.generate'
                    };
                }
            }

            // ── Training Center workflow fast-path ────────────────────────────
            if (typeof TrainingCenter !== 'undefined') {
                const workflow = TrainingCenter.matchWorkflow(text);
                if (workflow && typeof IntentRegistry !== 'undefined' && IntentRegistry.get(workflow.intent)) {
                    return {
                        ok: true,
                        intent: workflow.intent,
                        functionName: workflow.intent,
                        confidence: 0.95,
                        slots: _extractEntities(text, ctx),
                        entities: _extractEntities(text, ctx),
                        decisionPath: ['trainingCenter.workflowMapping']
                    };
                }
            }

            // ── Legacy IntentEngine ───────────────────────────────────────────
            if (typeof IntentEngine !== 'undefined' && IntentEngine.parse) {
                const legacy = IntentEngine.parse(text);
                if (legacy && legacy.intent && legacy.intent !== 'cancelled') {
                    const slots = Object.assign({}, legacy.slots || {});
                    const entities = Object.assign(_extractEntities(text, ctx), {
                        customer: slots.customerName || slots.partyName,
                        employee: slots.employeeName,
                        month: slots.monthName,
                        taskHint: slots.taskHint || slots.taskHintAlt,
                        narration: slots.narration
                    });
                    if (!slots.customerName && entities.customer) slots.customerName = entities.customer;
                    if (!slots.employeeName && entities.employee) slots.employeeName = entities.employee;

                    // ── Guard 4: Ambiguous employee name ─────────────────────
                    if (slots.employeeName && typeof KnowledgeEngine !== 'undefined') {
                        const res = KnowledgeEngine.resolveEntity(slots.employeeName, 'employee');
                        if (res.ambiguous && res.candidates.length > 1) {
                            return {
                                ok: true,
                                intent: 'guard.ambiguousEmployee',
                                functionName: 'guard.ambiguousEmployee',
                                confidence: 0.9,
                                slots: slots,
                                entities: entities,
                                candidates: res.candidates,
                                domain: 'employee',
                                decisionPath: ['reasoningEngine.ambiguousEmployeeGuard'],
                                guardTriggered: 'ambiguousEntity',
                                needClarify: true
                            };
                        }
                    }

                    return {
                        ok: true,
                        intent: legacy.intent,
                        functionName: legacy.intent,
                        confidence: legacy.confidence || 0.8,
                        slots: slots,
                        confirmed: !!legacy.confirmed,
                        entities: entities,
                        decisionPath: ['legacy.intentEngine']
                    };
                }
            }

            // ── Daily briefing ────────────────────────────────────────────────
            if (/daily\s+brief|morning\s+brief|summary\s+today/i.test(text)) {
                return {
                    ok: true,
                    intent: 'briefing.daily',
                    functionName: 'briefing.daily',
                    confidence: 0.9,
                    slots: {},
                    entities: _extractEntities(text, ctx),
                    decisionPath: ['reasoningEngine.briefing']
                };
            }

            // ── Sandbox rules ─────────────────────────────────────────────────
            for (let i = 0; i < SANDBOX_RULES.length; i++) {
                const rule = SANDBOX_RULES[i];
                for (let j = 0; j < rule.patterns.length; j++) {
                    if (rule.patterns[j].test(text)) {
                        return {
                            ok: true,
                            intent: rule.intent,
                            functionName: rule.intent,
                            confidence: 0.75,
                            slots: _extractEntities(text, ctx),
                            entities: _extractEntities(text, ctx),
                            decisionPath: ['reasoningEngine.sandbox:' + rule.intent]
                        };
                    }
                }
            }

            return {
                ok: false,
                intent: 'unknown',
                confidence: 0,
                entities: _extractEntities(text, ctx),
                decisionPath: ['reasoningEngine.noMatch']
            };
        }
    };

    global.ReasoningEngine = ReasoningEngine;
})(typeof window !== 'undefined' ? window : global);
