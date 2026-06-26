/**
 * Central command router — Intent → Agent → ERP function.
 */
const CommandRouter = {
    agents: {
        attendance: () => AttendanceAgent,
        customer: () => CustomerAgent,
        task: () => TaskAgent,
        payroll: () => PayrollAgent,
        employee: () => EmployeeAgent,
        document: () => DocumentAgent,
        erp: () => ({
            navigate: (slots) => ErpFunctions.navigate(slots.target),
            getHelp: () => ErpFunctions.getHelp(),
            getDailyBriefing: async () => {
                if (typeof AIBrain !== 'undefined' && AIBrain.getProactiveBriefing) {
                    const b = await AIBrain.getProactiveBriefing();
                    const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
                    const msg = lang === 'ta' ? (b.messageTa || b.message) : (b.messageEn || b.message);
                    return { success: true, message: msg, data: b.metrics || b, sourceRefs: b.sourceRefs || [] };
                }
                if (typeof ProactiveEngine === 'undefined') {
                    return { success: false, message: 'Daily briefing unavailable.' };
                }
                const b = await Promise.resolve(ProactiveEngine.getDailyBriefing());
                const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
                const msg = lang === 'ta' ? (b.messageTa || b.message) : (b.messageEn || b.message);
                return { success: true, message: msg, data: b.metrics || b, sourceRefs: b.sourceRefs || [] };
            }
        })
    },

    async route(parsed) {
        if (!parsed || parsed.intent === 'cancelled') {
            return { success: true, message: 'Cancelled. No changes made.' };
        }

        const intent = parsed.intent;
        if (!intent) {
            const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
            const msg = typeof ResponseI18n !== 'undefined'
                ? ResponseI18n.format('unknown_intent', {}, lang)
                : 'I did not understand that command. Say help for full list.';
            return { success: false, message: msg };
        }

        const def = IntentRegistry.get(intent);
        if (!def) {
            return { success: false, message: `Unknown intent: ${intent}` };
        }

        if (def.destructive && !parsed.confirmed) {
            ContextManager.setConfirmation({ intent, slots: parsed.slots });
            const msg = def.confirm || `Confirm ${intent.replace(/_/g, ' ')}? Say yes to proceed.`;
            return { success: false, needConfirm: true, message: msg };
        }

        ContextManager.clearConfirmation();

        const agent = this.agents[def.agent]();
        const handler = agent[def.handler];
        if (typeof handler !== 'function') {
            return { success: false, message: `Handler not found: ${def.agent}.${def.handler}` };
        }

        try {
            const result = await handler.call(agent, parsed.slots || {});
            if (result?.needClarify) {
                const customerIntents = ['customer_outstanding', 'customer_last_invoice', 'last_invoice', 'customer_invoice_list', 'customer_search'];
                const employeeIntents = ['employee_attendance', 'employee_salary', 'employee_ot', 'employee_details', 'mark_attendance', 'mark_leave', 'delete_attendance'];
                let field = 'customer';
                if (employeeIntents.includes(intent)) field = 'employee';
                else if (customerIntents.includes(intent)) field = 'customer';
                else if (parsed.slots?.employeeName) field = 'employee';
                else if (parsed.slots?.customerName) field = 'customer';
                ContextManager.setPendingClarify({
                    intent,
                    slots: parsed.slots || {},
                    field,
                    state: result.state || 'need_name',
                    candidates: result.candidates || [],
                    tentative: result.tentative || null
                });
                ContextManager.set({ lastIntent: intent });
            } else {
                ContextManager.clearPendingClarify();
            }
            if (result && result.success !== false && !result.needClarify) {
                ContextManager.afterResult(intent, parsed.slots || {}, result.data || result);
            } else if (result && !result.needClarify) {
                ContextManager.set({ lastIntent: intent });
            }
            return result || { success: true, message: 'Done.' };
        } catch (err) {
            console.error('[CommandRouter]', intent, err);
            return { success: false, message: err.message || 'Something went wrong.' };
        }
    }
};

window.CommandRouter = CommandRouter;
