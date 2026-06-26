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
            this._maybeProactiveBriefing();
        },

        _maybeProactiveBriefing: function () {
            this.runDashboardBriefing(true);
        },

        runDashboardBriefing: function (onlyIfOpen) {
            if (this._briefingShown) return;
            if (typeof App !== 'undefined' && App.currentView !== 'dashboard') return;
            if (onlyIfOpen && (!this._el || this._el.style.display === 'none')) return;
            this._briefingShown = true;
            const self = this;
            const show = function (b) {
                if (!b || !b.message) return;
                const short = (b.message || '').split('\n').slice(0, 3).join(' · ');
                if (typeof App !== 'undefined' && App.showNotification) {
                    App.showNotification(short, 'info');
                }
                if (self._el && self._el.style.display !== 'none') {
                    let html = '<strong>Proactive briefing:</strong> ' + (b.message || '').replace(/\n/g, '<br>');
                    if (b.sourceRefs && b.sourceRefs.length) {
                        html += '<br><small>Sources: ' + b.sourceRefs.join(', ') + '</small>';
                    }
                    self._out(html);
                }
            };
            if (typeof AIBrain !== 'undefined' && AIBrain.getProactiveBriefing) {
                AIBrain.getProactiveBriefing().then(show).catch(function () { /* ignore */ });
            }
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
                Promise.resolve(ProactiveEngine.getDailyBriefing()).then(function (b) {
                    outstanding = {
                        level: 'healthy',
                        label: (b.metrics && b.metrics.pendingInvoices) + ' inv / ' +
                            (typeof ErpFunctions !== 'undefined' ? ErpFunctions.formatMoney(b.metrics.pendingAmount) : b.metrics.pendingAmount)
                    };
                    AICommandCenter._renderHealth(el, voice, attendance, outstanding, sync, ai);
                }).catch(function () {
                    outstanding = { level: 'error', label: 'Error' };
                    AICommandCenter._renderHealth(el, voice, attendance, outstanding, sync, ai);
                });
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

            if (/daily\s+briefing|today\s+summary/i.test(text)) {
                const runBrief = function (b) {
                    const lang = typeof LanguageEngine !== 'undefined' ? LanguageEngine.getResponseLang() : 'en';
                    const msg = lang === 'ta' ? (b.messageTa || b.message) : (b.messageEn || b.message);
                    let html = '<strong>Briefing:</strong> ' + msg.replace(/\n/g, '<br>');
                    if (b.sourceRefs && b.sourceRefs.length) {
                        html += '<br><small>Sources: ' + b.sourceRefs.join(', ') + '</small>';
                    }
                    AICommandCenter._out(html);
                };
                if (typeof AIBrain !== 'undefined' && AIBrain.getProactiveBriefing) {
                    AIBrain.getProactiveBriefing().then(runBrief);
                    return;
                }
                if (typeof ProactiveEngine !== 'undefined') {
                    Promise.resolve(ProactiveEngine.getDailyBriefing()).then(runBrief);
                    return;
                }
            }

            if (typeof AIBrain === 'undefined') {
                this._out('<span style="color:red;">AIBrain not loaded</span>');
                return;
            }

            AIBrain.processTurn(text).then(function (turn) {
                const result = turn.result;
                AICommandCenter._renderResult(result);
            }).catch(function (err) {
                AICommandCenter._out('<span style="color:red;">' + err + '</span>');
            });
        },

        /**
         * Render a Jarvis result — handles plain messages, needClarify (option buttons),
         * needConfirm (confirm button), and financial highlights.
         */
        _renderResult: function (result) {
            if (!result) return;
            const msg = String(result.message || result.summary || 'No response.');

            // ── needClarify: show clickable option buttons ──────────────────
            if (result.needClarify && result.clarifyOptions && result.clarifyOptions.length) {
                let html = '<div style="background:#fff9e6;border:1px solid #ffc107;border-radius:8px;padding:10px;">';
                html += '<strong>🔍 Jarvis:</strong> ' + msg.split('\n')[0] + '<br><br>';
                html += '<div style="display:flex;flex-direction:column;gap:6px;">';
                result.clarifyOptions.forEach(function (opt, i) {
                    const label = opt.name || opt.customerName || opt.invoiceNo || ('Option ' + (i + 1));
                    html += '<button type="button" class="ai-clarify-opt btn btn-outline-primary btn-sm" ' +
                        'data-reply="' + (i + 1) + '" data-name="' + label.replace(/"/g, '&quot;') + '" ' +
                        'style="text-align:left;padding:6px 12px;">' +
                        '<span style="font-weight:bold;margin-right:8px;">' + (i + 1) + '.</span>' + label +
                        '</button>';
                });
                html += '</div></div>';
                const container = document.createElement('div');
                container.style.marginBottom = '10px';
                container.innerHTML = html;
                // Wire click events on the buttons
                container.querySelectorAll('.ai-clarify-opt').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        const reply = btn.getAttribute('data-reply');
                        if (AICommandCenter._input) {
                            AICommandCenter._input.value = reply;
                            AICommandCenter.submit();
                        }
                    });
                });
                const o = document.getElementById('aiCmdOutput');
                if (o) o.insertBefore(container, o.firstChild);
                return;
            }

            // ── needConfirm: show Confirm / Cancel buttons ──────────────────
            if (result.needConfirm) {
                let html = '<div style="background:#e8f4fd;border:1px solid #17a2b8;border-radius:8px;padding:10px;">';
                html += '<strong>⚠️ Jarvis:</strong> ' + msg.replace(/\n/g, '<br>') + '<br><br>';
                html += '<button type="button" id="aiConfirmYes" class="btn btn-success btn-sm" style="margin-right:8px;">✅ Confirm</button>';
                html += '<button type="button" id="aiConfirmNo" class="btn btn-outline-secondary btn-sm">❌ Cancel</button>';
                html += '</div>';
                const container = document.createElement('div');
                container.style.marginBottom = '10px';
                container.innerHTML = html;
                container.querySelector('#aiConfirmYes').addEventListener('click', function () {
                    if (AICommandCenter._input) {
                        AICommandCenter._input.value = 'confirm yes';
                        AICommandCenter.submit();
                    }
                });
                container.querySelector('#aiConfirmNo').addEventListener('click', function () {
                    AICommandCenter._out('<strong>Jarvis:</strong> Cancelled.');
                });
                const o = document.getElementById('aiCmdOutput');
                if (o) o.insertBefore(container, o.firstChild);
                return;
            }

            // ── Financial result: green tint ─────────────────────────────────
            let bgStyle = '';
            if (result.financial) bgStyle = 'background:#f0faf0;border:1px solid #28a745;border-radius:8px;padding:8px;';
            if (!result.ok && !result.success) bgStyle = 'color:#dc3545;';

            let html = '<div style="' + bgStyle + '">';
            html += '<strong>' + (result.financial ? '💰 ' : '🤖 ') + 'Jarvis:</strong> ';
            html += msg.replace(/\n/g, '<br>');
            if (result.sourceRefs && result.sourceRefs.length) {
                html += '<br><small style="color:#888;">Sources: ' + result.sourceRefs.join(', ') + '</small>';
            }
            html += '</div>';
            AICommandCenter._out(html);
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
