/**
 * Short-lived conversation context for follow-up commands.
 */
const ContextManager = {
    _ctx: {
        lastCustomerName: null,
        lastCustomerId: null,
        lastEmployeeName: null,
        lastTaskHint: null,
        lastIntent: null,
        lastMonth: null,
        pendingConfirmation: null,
        pendingClarify: null
    },

    get() {
        return { ...this._ctx };
    },

    set(partial) {
        Object.assign(this._ctx, partial || {});
        if (typeof MemoryManager !== 'undefined') {
            MemoryManager.saveContext(this._ctx);
        }
    },

    clearConfirmation() {
        this._ctx.pendingConfirmation = null;
    },

    setConfirmation(action) {
        this._ctx.pendingConfirmation = action;
    },

    getConfirmation() {
        return this._ctx.pendingConfirmation;
    },

    setPendingClarify(action) {
        this._ctx.pendingClarify = action;
    },

    getPendingClarify() {
        return this._ctx.pendingClarify;
    },

    clearPendingClarify() {
        this._ctx.pendingClarify = null;
    },

    resolveCustomerName(slots = {}) {
        return slots.customerName
            || slots.customerNameAlt
            || slots.partyName
            || this._ctx.lastCustomerName
            || null;
    },

    resolveEmployeeName(slots = {}) {
        return slots.employeeName || this._ctx.lastEmployeeName || null;
    },

    afterResult(intent, slots, result) {
        this._ctx.lastIntent = intent;
        if (slots.employeeName) this._ctx.lastEmployeeName = slots.employeeName;
        if (slots.customerName || slots.partyName) {
            this._ctx.lastCustomerName = slots.customerName || slots.partyName;
        }
        if (result?.customerId) this._ctx.lastCustomerId = result.customerId;
        if (result?.customerName) this._ctx.lastCustomerName = result.customerName;
        if (slots.monthName) this._ctx.lastMonth = slots.monthName;
        if (slots.taskHint) this._ctx.lastTaskHint = slots.taskHint;
    },

    loadFromMemory() {
        if (typeof MemoryManager !== 'undefined') {
            const saved = MemoryManager.loadContext();
            if (saved) Object.assign(this._ctx, saved);
        }
    }
};

window.ContextManager = ContextManager;
