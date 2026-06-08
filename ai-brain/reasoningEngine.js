/**
 * reasoningEngine.js — Delegates to IntentEngine (legacy); sandbox-only fallback rules.
 */
(function (global) {
    'use strict';

    /** Only intents NOT handled by IntentRegistry / CommandRouter */
    const SANDBOX_RULES = [
        { intent: 'attendance.bulkMark', patterns: [/bulk.*attendance/i, /mark.*attendance.*all/i, /அனைவருக்கும்.*வருகை/i] },
        { intent: 'task.bulkCreate', patterns: [/bulk.*task/i, /create\s+\d+\s+tasks/i] },
        { intent: 'voucher.create', patterns: [/create\s+voucher/i, /voucher\s+create/i] }
    ];

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
            if (!entities.customer && session.lastCustomerName) {
                entities.customer = session.lastCustomerName;
            }
            if (!entities.employee && session.lastEmployeeName) {
                entities.employee = session.lastEmployeeName;
            }
        }

        return entities;
    }

    const ReasoningEngine = {
        parse: function (utterance, ctx) {
            ctx = ctx || {};
            const text = String(utterance || '').trim();
            if (!text) {
                return { ok: false, intent: null, confidence: 0, error: 'Empty utterance' };
            }

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
