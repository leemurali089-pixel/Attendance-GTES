/**
 * brainPanel.js — Compact brain status panel
 */
(function (global) {
    'use strict';

    const AIBrainPanel = {
        init: function () {
            if (document.getElementById('aiBrainPanel')) return;
            const panel = document.createElement('div');
            panel.id = 'aiBrainPanel';
            panel.className = 'ai-brain-panel';
            panel.style.cssText = 'display:none;position:fixed;bottom:80px;right:24px;width:320px;max-height:400px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.15);z-index:10040;overflow:hidden;font-size:13px;';
            panel.innerHTML = '<div style="padding:12px 16px;background:#1a1a2e;color:#fff;font-weight:600;">AI Brain <span id="aiBrainVer"></span></div>' +
                '<div id="aiBrainLog" style="padding:12px;max-height:320px;overflow:auto;"></div>';
            document.body.appendChild(panel);
            if (typeof AIBrain !== 'undefined') {
                document.getElementById('aiBrainVer').textContent = 'v' + AIBrain.version;
            }
        },

        toggle: function () {
            this.init();
            const el = document.getElementById('aiBrainPanel');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        },

        log: function (text) {
            this.init();
            const log = document.getElementById('aiBrainLog');
            const line = document.createElement('div');
            line.style.marginBottom = '8px';
            line.textContent = text;
            log.insertBefore(line, log.firstChild);
        }
    };

    global.AIBrainPanel = AIBrainPanel;
})(typeof window !== 'undefined' ? window : global);
