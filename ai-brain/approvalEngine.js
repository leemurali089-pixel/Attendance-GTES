/**
 * approvalEngine.js — Gate T3/T4/destructive actions
 */
(function (global) {
    'use strict';

    const _tokens = {};

    function _makeToken() {
        return 'appr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    const ApprovalEngine = {
        _pending: null,

        request: function (opts) {
            opts = opts || {};
            const self = this;
            return new Promise(function (resolve) {
                const token = _makeToken();
                const payload = {
                    token: token,
                    functionName: opts.functionName,
                    args: opts.args,
                    preview: opts.preview,
                    utterance: opts.utterance,
                    tier: opts.tier,
                    createdAt: new Date().toISOString()
                };
                self._pending = payload;

                if (typeof AIApprovalModal !== 'undefined' && AIApprovalModal.show) {
                    AIApprovalModal.show(payload, function (approved) {
                        if (approved) _tokens[token] = { approved: true, at: Date.now() };
                        resolve({ approved: !!approved, token: token, preview: opts.preview });
                    });
                } else {
                    const ok = global.confirm(
                        'Approve ' + (opts.functionName || 'action') + '?\n\n' +
                        (opts.preview && opts.preview.summary ? opts.preview.summary : 'Preview available in Command Center.')
                    );
                    if (ok) _tokens[token] = { approved: true, at: Date.now() };
                    resolve({ approved: ok, token: token, preview: opts.preview });
                }
            });
        },

        isApproved: function (token) {
            return !!(token && _tokens[token] && _tokens[token].approved);
        },

        getPending: function () {
            return this._pending;
        }
    };

    global.ApprovalEngine = ApprovalEngine;
})(typeof window !== 'undefined' ? window : global);
