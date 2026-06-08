/**
 * approvalModal.js — T3/T4 approval UI for sandbox execute
 */
(function (global) {
    'use strict';

    const AIApprovalModal = {
        _el: null,

        _ensure: function () {
            if (this._el) return this._el;
            const div = document.createElement('div');
            div.id = 'aiApprovalModal';
            div.className = 'ai-approval-modal';
            div.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;align-items:center;justify-content:center;';
            div.innerHTML = '<div class="ai-approval-card" style="background:#fff;border-radius:12px;padding:20px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2);">' +
                '<h4 style="margin:0 0 12px;">Approve AI Action</h4>' +
                '<pre id="aiApprovalPreview" style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;max-height:200px;overflow:auto;"></pre>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
                '<button type="button" id="aiApprovalCancel" class="btn btn-secondary btn-sm">Cancel</button>' +
                '<button type="button" id="aiApprovalConfirm" class="btn btn-primary btn-sm">Approve & Execute</button>' +
                '</div></div>';
            document.body.appendChild(div);
            this._el = div;
            return div;
        },

        show: function (payload, callback) {
            const el = this._ensure();
            const preview = document.getElementById('aiApprovalPreview');
            const summary = payload.preview && (payload.preview.summary || JSON.stringify(payload.preview, null, 2));
            preview.textContent = (payload.functionName || 'action') + '\n\n' + (summary || 'No preview');
            el.style.display = 'flex';

            const onConfirm = function () {
                el.style.display = 'none';
                cleanup();
                callback(true);
            };
            const onCancel = function () {
                el.style.display = 'none';
                cleanup();
                callback(false);
            };
            function cleanup() {
                document.getElementById('aiApprovalConfirm').removeEventListener('click', onConfirm);
                document.getElementById('aiApprovalCancel').removeEventListener('click', onCancel);
            }
            document.getElementById('aiApprovalConfirm').addEventListener('click', onConfirm);
            document.getElementById('aiApprovalCancel').addEventListener('click', onCancel);
        }
    };

    global.AIApprovalModal = AIApprovalModal;
})(typeof window !== 'undefined' ? window : global);
