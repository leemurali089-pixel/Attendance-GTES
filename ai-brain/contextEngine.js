/**
 * contextEngine.js — Session + ERP context for brain turns
 * Wraps legacy ContextManager for follow-up commands.
 */
(function (global) {
    'use strict';

    const ContextEngine = {
        getSession: function () {
            if (typeof ContextManager !== 'undefined' && ContextManager.get) {
                return ContextManager.get();
            }
            return {
                lastCustomerName: null,
                lastCustomerId: null,
                lastEmployeeName: null,
                lastIntent: null
            };
        },

        setSession: function (patch) {
            if (typeof ContextManager !== 'undefined' && ContextManager.set) {
                ContextManager.set(patch);
            }
        },

        getErpSnapshot: function () {
            const snap = {
                company: null,
                user: null,
                date: new Date().toISOString().slice(0, 10)
            };
            if (typeof UserManager !== 'undefined' && UserManager.getCurrentUser) {
                snap.user = UserManager.getCurrentUser();
            }
            if (typeof DataManager !== 'undefined' && DataManager.getData) {
                try {
                    const settings = DataManager.getData('gtes_settings');
                    if (settings && settings.companyName) snap.company = settings.companyName;
                } catch (e) { /* ignore */ }
            }
            return snap;
        },

        buildTurnContext: function (utterance) {
            const session = this.getSession();
            const erp = this.getErpSnapshot();
            const enriched = typeof TrainingCenter !== 'undefined'
                ? TrainingCenter.enrichUtterance(utterance)
                : { text: utterance };

            return {
                utterance: utterance,
                enriched: enriched,
                session: session,
                erp: erp,
                timestamp: new Date().toISOString()
            };
        },

        /** Build CommandRouter slots — merges parsed slots, entities, and ContextManager memory */
        buildCommandSlots: function (reasoning, ctx) {
            reasoning = reasoning || {};
            const slots = Object.assign({}, reasoning.slots || {});
            const ent = reasoning.entities || {};

            if (!slots.customerName) slots.customerName = ent.customer || ent.customerName || null;
            if (!slots.partyName) slots.partyName = ent.partyName || ent.customer || slots.customerName || null;
            if (!slots.employeeName) {
                slots.employeeName = ent.employee || ent.employeeName || null;
            }
            if (!slots.taskHint && !slots.taskHintAlt) {
                slots.taskHint = ent.taskHint || ent.taskHintAlt || null;
            }
            if (!slots.narration) slots.narration = ent.narration || null;
            if (!slots.monthName) slots.monthName = ent.month || ent.monthName || null;

            if (typeof ContextManager !== 'undefined') {
                const cust = ContextManager.resolveCustomerName(slots);
                if (cust) slots.customerName = cust;
                const emp = ContextManager.resolveEmployeeName(slots);
                if (emp) slots.employeeName = emp;
            }

            return slots;
        }
    };

    global.ContextEngine = ContextEngine;
})(typeof window !== 'undefined' ? window : global);
