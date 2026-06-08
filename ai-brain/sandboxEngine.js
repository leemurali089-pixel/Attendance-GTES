/**
 * sandboxEngine.js — Preview Mode + Execute Mode for financial/bulk actions
 */
(function (global) {
    'use strict';

    const SANDBOX_FUNCTIONS = {
        'payroll.generatePayout': { tier: 'T3', label: 'Salary Payout' },
        'attendance.bulkMark': { tier: 'T3', label: 'Bulk Attendance' },
        'task.bulkCreate': { tier: 'T3', label: 'Bulk Task Creation' },
        'voucher.create': { tier: 'T4', label: 'Voucher Creation' }
    };

    const SandboxEngine = {
        isSandboxed: function (functionName) {
            return !!SANDBOX_FUNCTIONS[functionName];
        },

        getMeta: function (functionName) {
            return SANDBOX_FUNCTIONS[functionName] || null;
        },

        /** Dry-run — no ERP writes */
        preview: function (functionName, args, ctx) {
            ctx = ctx || {};
            if (!this.isSandboxed(functionName)) {
                return Promise.resolve({
                    ok: false,
                    mode: 'preview',
                    error: 'Function not sandbox-enabled: ' + functionName
                });
            }

            const previewHandler = typeof ErpBridge !== 'undefined' && ErpBridge.preview
                ? ErpBridge.preview.bind(ErpBridge)
                : null;

            if (!previewHandler) {
                return Promise.resolve({
                    ok: true,
                    mode: 'preview',
                    functionName: functionName,
                    warnings: ['ErpBridge preview not loaded — metadata only'],
                    affectedCount: 0,
                    totals: {},
                    rows: [],
                    args: args
                });
            }

            return Promise.resolve(previewHandler(functionName, args, ctx))
                .then(function (result) {
                    const out = Object.assign({
                        ok: true,
                        mode: 'preview',
                        functionName: functionName,
                        tier: SANDBOX_FUNCTIONS[functionName].tier,
                        label: SANDBOX_FUNCTIONS[functionName].label
                    }, result || {});

                    if (typeof ActionReplayEngine !== 'undefined') {
                        ActionReplayEngine.record({
                            intent: ctx.intent,
                            functionName: functionName,
                            mode: 'preview',
                            args: args,
                            reason: ctx.utterance,
                            agentId: ctx.agentId,
                            decisionPath: ctx.decisionPath,
                            sourceRefs: out.sourceRefs || [],
                            resultSummary: out.summary || ('Preview: ' + (out.affectedCount || 0) + ' rows')
                        });
                    }
                    return out;
                });
        },

        /** Real execute after approval */
        execute: function (functionName, args, ctx) {
            ctx = ctx || {};
            if (!this.isSandboxed(functionName)) {
                return Promise.reject(new Error('Function not sandbox-enabled: ' + functionName));
            }

            if (typeof ApprovalEngine !== 'undefined' && !ctx.approved && !ApprovalEngine.isApproved(ctx.approvalToken)) {
                return Promise.reject(new Error('Approval required before execute'));
            }

            const invoke = typeof FunctionEngine !== 'undefined' && FunctionEngine.invoke
                ? FunctionEngine.invoke.bind(FunctionEngine)
                : (typeof ErpBridge !== 'undefined' && ErpBridge.execute
                    ? ErpBridge.execute.bind(ErpBridge)
                    : null);

            if (!invoke) {
                return Promise.reject(new Error('FunctionEngine not available'));
            }

            const execFn = typeof ErpBridge !== 'undefined' && ErpBridge.executeSandbox
                ? ErpBridge.executeSandbox.bind(ErpBridge)
                : invoke;

            return Promise.resolve(execFn(functionName, args, { execute: true, approved: true }))
                .then(function (result) {
                    if (typeof ActionReplayEngine !== 'undefined') {
                        ActionReplayEngine.record({
                            intent: ctx.intent,
                            functionName: functionName,
                            mode: 'execute',
                            args: args,
                            reason: ctx.utterance,
                            agentId: ctx.agentId,
                            decisionPath: ctx.decisionPath,
                            sourceRefs: (result && result.sourceRefs) || [],
                            resultSummary: (result && result.summary) || 'Executed ' + functionName
                        });
                    }
                    return Object.assign({ ok: true, mode: 'execute', functionName: functionName }, result || {});
                });
        },

        /** Full flow: preview → approval token → execute */
        run: function (functionName, args, ctx) {
            ctx = ctx || {};
            const self = this;
            return this.preview(functionName, args, ctx).then(function (preview) {
                if (!preview.ok) return preview;
                if (ctx.autoApprove) {
                    return self.execute(functionName, args, Object.assign({}, ctx, { approved: true }));
                }
                if (typeof ApprovalEngine !== 'undefined') {
                    return ApprovalEngine.request({
                        functionName: functionName,
                        args: args,
                        preview: preview,
                        utterance: ctx.utterance,
                        tier: SANDBOX_FUNCTIONS[functionName].tier
                    }).then(function (approval) {
                        if (!approval || !approval.approved) {
                            return { ok: false, mode: 'cancelled', preview: preview, approval: approval };
                        }
                        return self.execute(functionName, args, Object.assign({}, ctx, {
                            approved: true,
                            approvalToken: approval.token
                        }));
                    });
                }
                return { ok: false, mode: 'blocked', preview: preview, error: 'ApprovalEngine required' };
            });
        }
    };

    global.SandboxEngine = SandboxEngine;
})(typeof window !== 'undefined' ? window : global);
