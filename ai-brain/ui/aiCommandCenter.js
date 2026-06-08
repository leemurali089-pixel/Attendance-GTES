/**
 * aiCommandCenter.js — Phase 2 Command Center UI
 * Text commands, audit replay, daily briefing, system health
 */
(function (global) {
    'use strict';

    const AICommandCenter = {
        _el: null,
        _input: null,

        init: function () {
            if (this._el) return;
            const wrap = document.createElement('div');
            wrap.id = 'aiCommandCenter';
            wrap.className = 'ai-command-center';
            wrap.style.cssText = 'display:none;position:fixed;bottom:80px;right:24px;width:380px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:10045;overflow:hidden;';
            wrap.innerHTML =
                '<div style="padding:12px 16px;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;display:flex;justify-content:space-between;align-items:center;">' +
                '<span><i class="bi bi-cpu"></i> AI Command Center</span>' +
                '<button type="button" id="aiCmdClose" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;">&times;</button>' +
                '</div>' +
                '<div id="aiCmdHealth" class="ai-cmd-health"></div>' +
                '<div id="aiCmdOutput" style="padding:12px;min-height:120px;max-height:240px;overflow:auto;font-size:13px;background:#fafafa;"></div>' +
                '<div style="padding:12px;border-top:1px solid #eee;display:flex;gap:8px;">' +
                '<input id="aiCmdInput" type="text" placeholder="Ask: customer outstanding, daily briefing…" style="flex:1;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;">' +
                '<button type="button" id="aiCmdSend" class="btn btn-primary btn-sm">Send</button>' +
                '</div>' +
                '<div style="padding:8px 12px;border-top:1px solid #eee;display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button type="button" class="btn btn-outline-secondary btn-sm ai-cmd-quick" data-cmd="daily briefing">Briefing</button>' +
                '<button type="button" class="btn btn-outline-secondary btn-sm ai-cmd-quick" data-cmd="show audit trail">Audit</button>' +
                '<button type="button" class="btn btn-outline-secondary btn-sm" id="aiCmdRefreshHealth">Health</button>' +
                '</div>';
            document.body.appendChild(wrap);
            this._el = wrap;
            this._input = document.getElementById('aiCmdInput');

            const self = this;
            document.getElementById('aiCmdClose').addEventListener('click', function () {
                wrap.style.display = 'none';
            });
            document.getElementById('aiCmdSend').addEventListener('click', function () {
                self.submit();
            });
            document.getElementById('aiCmdRefreshHealth').addEventListener('click', function () {
                self.refreshHealth();
            });
            this._input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') self.submit();
            });
            wrap.querySelectorAll('.ai-cmd-quick').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    self._input.value = btn.getAttribute('data-cmd');
                    self.submit();
                });
            });
        },

        open: function () {
            this.init();
            this._el.style.display = 'block';
            this.refreshHealth();
            this._input.focus();
        },

        _healthLevel: function (status) {
            const s = status && status.level;
            if (s === 'healthy' || s === 'ok') return 'green';
            if (s === 'warning') return 'yellow';
            return 'red';
        },

        refreshHealth: function () {
            const el = document.getElementById('aiCmdHealth');
            if (!el) return;

            const voice = typeof VoiceDiagnostics !== 'undefined'
                ? VoiceDiagnostics.getVoiceStatus()
                : { level: 'warning', label: 'Not loaded' };

            let attendance = { level: 'warning', label: 'Checking…' };
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.AttendanceHealthCheck) {
                Promise.resolve(ErpFunctions.AttendanceHealthCheck()).then(function (h) {
                    attendance = {
                        level: h.healthy ? 'healthy' : 'warning',
                        label: h.healthy ? h.presentCount + ' present' : (h.mismatches[0] && h.mismatches[0].note) || 'Mismatch'
                    };
                    AICommandCenter._renderHealth(el, voice, attendance);
                }).catch(function () {
                    attendance = { level: 'error', label: 'Check failed' };
                    AICommandCenter._renderHealth(el, voice, attendance);
                });
            } else {
                attendance = { level: 'error', label: 'Unavailable' };
            }

            let outstanding = { level: 'healthy', label: 'Ledger OK' };
            if (typeof ProactiveEngine !== 'undefined') {
                try {
                    const b = ProactiveEngine.getDailyBriefing();
                    outstanding = {
                        level: 'healthy',
                        label: (b.metrics && b.metrics.pendingInvoices) + ' inv / ' +
                            (typeof ErpFunctions !== 'undefined' ? ErpFunctions.formatMoney(b.metrics.pendingAmount) : b.metrics.pendingAmount)
                    };
                } catch (_) {
                    outstanding = { level: 'error', label: 'Error' };
                }
            }

            const syncOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
            const sync = {
                level: syncOnline ? 'healthy' : 'warning',
                label: syncOnline ? 'Online' : 'Offline'
            };

            const ai = typeof AIBrain !== 'undefined'
                ? { level: 'healthy', label: 'Loaded' }
                : { level: 'warning', label: 'Brain offline' };

            this._renderHealth(el, voice, attendance, outstanding, sync, ai);
        },

        _renderHealth: function (el, voice, attendance, outstanding, sync, ai) {
            outstanding = outstanding || { level: 'healthy', label: '—' };
            sync = sync || { level: 'healthy', label: 'Online' };
            ai = ai || { level: 'healthy', label: 'Loaded' };
            attendance = attendance || { level: 'warning', label: '…' };

            const row = function (name, st) {
                const cls = AICommandCenter._healthLevel(st);
                return '<div class="ai-health-row"><span>' + name + '</span><span class="ai-health-dot ai-health-' + cls + '" title="' + (st.label || '') + '"></span></div>';
            };

            el.innerHTML =
                '<div class="ai-health-card">' +
                '<div class="ai-health-title">System Health</div>' +
                '<div class="ai-health-grid">' +
                row('Voice', voice) +
                row('Attendance', attendance) +
                row('Outstanding', outstanding) +
                row('Sync', sync) +
                row('AI', ai) +
                '</div></div>';
        },

        _out: function (html) {
            const o = document.getElementById('aiCmdOutput');
            const d = document.createElement('div');
            d.style.marginBottom = '10px';
            d.innerHTML = html;
            o.insertBefore(d, o.firstChild);
        },

        submit: function () {
            const text = (this._input.value || '').trim();
            if (!text) return;
            this._input.value = '';
            this._out('<strong>You:</strong> ' + text);

            if (/audit|replay/i.test(text)) {
                this._showAudit();
                return;
            }

            if (/health|system\s+status/i.test(text)) {
                this.refreshHealth();
                this._out('<strong>System:</strong> Health card refreshed above.');
                return;
            }

            if (/daily\s+briefing|today\s+summary/i.test(text) && typeof ProactiveEngine !== 'undefined') {
                const b = ProactiveEngine.getDailyBriefing();
                const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
                const msg = lang === 'ta' ? (b.messageTa || b.message) : (b.messageEn || b.message);
                this._out('<strong>Briefing:</strong> ' + msg.replace(/\n/g, '<br>'));
                return;
            }

            if (typeof AIBrain === 'undefined') {
                this._out('<span style="color:red;">AIBrain not loaded</span>');
                return;
            }

            AIBrain.processTurn(text).then(function (turn) {
                const msg = AIBrain.formatResult(turn.result);
                AICommandCenter._out('<strong>Brain:</strong> ' + msg.replace(/\n/g, '<br>'));
            }).catch(function (err) {
                AICommandCenter._out('<span style="color:red;">' + err + '</span>');
            });
        },

        _showAudit: function () {
            if (typeof ActionReplayEngine === 'undefined') {
                this._out('Audit engine not loaded');
                return;
            }
            const list = ActionReplayEngine.list({ limit: 10 });
            if (!list.length) {
                this._out('<strong>Audit:</strong> No AI actions recorded yet.');
                return;
            }
            let html = '<strong>Audit trail (last 10):</strong><ul style="margin:8px 0;padding-left:18px;">';
            list.forEach(function (e) {
                html += '<li>' + e.when + ' — ' + (e.who && e.who.username) + ': ' +
                    (e.what && e.what.functionName) + ' [' + (e.what && e.what.mode) + ']</li>';
            });
            html += '</ul>';
            this._out(html);
        }
    };

    global.AICommandCenter = AICommandCenter;

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('dblclick', function (e) {
            const btn = e.target && e.target.closest ? e.target.closest('#globalAIBtn') : null;
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                AICommandCenter.open();
            }
        });
    });
})(typeof window !== 'undefined' ? window : global);
