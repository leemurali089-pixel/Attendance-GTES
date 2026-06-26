/**
 * adminAgent.js — Admin Sub-Agent (Jarvis Multi-Agent ERP OS v2)
 * Handles: System health, sync status, RAG index status, audit trail, backup info, user permissions
 */
(function (global) {
    'use strict';

    const KEYWORDS = [
        /\badmin\b/i, /\bbackup/i, /\bsync/i, /\baudit/i, /\bhealth/i, /\bsystem/i,
        /\bsettings/i, /\bstatus/i, /\breplay/i, /\brag\s*status/i, /\bindex\s*status/i,
        /\bpermission/i, /\buser\s*role/i, /\bnetwork/i, /\bonline/i, /\boffline/i
    ];

    const AdminAgent = {
        id: 'adminAgent',
        domains: ['admin'],

        canHandle: function (query) {
            let score = 0;
            KEYWORDS.forEach(function (p) { if (p.test(String(query || ''))) score += 0.28; });
            return Math.min(1, score);
        },

        execute: async function (query, ctx) {
            ctx = ctx || {};
            const q = String(query || '').trim();

            // ── Briefing mode ─────────────────────────────────────────────
            if (ctx.mode === 'briefing') {
                const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
                let auditCount = 0;
                if (typeof ActionReplayEngine !== 'undefined') {
                    try { auditCount = (ActionReplayEngine.list({ limit: 100 }) || []).length; } catch (e) { /* ignore */ }
                }
                let ragStatus = '';
                if (typeof RagEngine !== 'undefined') {
                    try {
                        const st = RagEngine.status();
                        ragStatus = ' | RAG: ' + (st.backend || 'unknown') + '/' + (st.embedding || 'hash');
                    } catch (e) { /* ignore */ }
                }
                return {
                    ok: true, agentId: this.id,
                    message: 'System: ' + (online ? 'Online' : 'Offline') + ', ' + auditCount + ' AI audit entries' + ragStatus,
                    facts: [{ online: online, auditCount: auditCount }],
                    sourceRefs: ['navigator.onLine', 'ActionReplayEngine', 'RagEngine']
                };
            }

            // ── Full system health ────────────────────────────────────────
            if (/health|system\s+status|system\s+health/i.test(q)) {
                const parts = [];
                const refs = [];
                const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
                parts.push('Network: ' + (online ? 'Online' : 'Offline'));
                refs.push('navigator.onLine');

                if (typeof RagEngine !== 'undefined') {
                    try {
                        const st = RagEngine.status();
                        parts.push('RAG: ' + (st.backend || 'unknown') + ' / embedding: ' + (st.embedding || 'hash'));
                        const cols = st.collections || [];
                        if (cols.length) parts.push('Collections: ' + cols.join(', '));
                        refs.push('RagEngine.status');
                    } catch (e) { parts.push('RAG: error'); }
                }

                if (typeof IndexingEngine !== 'undefined') {
                    try {
                        const ist = IndexingEngine.status();
                        parts.push('Indexed: ' + (ist.collections || []).length + ' collection(s) on ' + ist.backend);
                        refs.push('IndexingEngine.status');
                    } catch (e) { /* ignore */ }
                }

                if (typeof VoiceDiagnostics !== 'undefined') {
                    try {
                        const v = VoiceDiagnostics.getVoiceStatus();
                        parts.push('Voice: ' + (v.label || v.level || 'unknown'));
                        refs.push('VoiceDiagnostics');
                    } catch (e) { /* ignore */ }
                }

                if (typeof ErpFunctions !== 'undefined' && ErpFunctions.AttendanceHealthCheck) {
                    try {
                        const h = await ErpFunctions.AttendanceHealthCheck();
                        parts.push('Attendance engine: ' + (h.healthy ? 'OK' : 'Needs check'));
                        refs.push('ErpFunctions.AttendanceHealthCheck');
                    } catch (e) { /* ignore */ }
                }

                if (typeof SyncManager !== 'undefined') {
                    try {
                        const sm = SyncManager.status || 'unknown';
                        const lastSync = SyncManager.lastSyncTime ? new Date(SyncManager.lastSyncTime).toLocaleTimeString() : 'N/A';
                        parts.push('Sync: ' + sm + ' (last: ' + lastSync + ')');
                        refs.push('SyncManager');
                    } catch (e) { /* ignore */ }
                }

                return {
                    ok: true, agentId: this.id,
                    message: 'System health:\n' + parts.join('\n'),
                    facts: parts, sourceRefs: refs
                };
            }

            // ── RAG index status ──────────────────────────────────────────
            if (/rag\s*status|index\s*status|rag\s*index/i.test(q)) {
                const parts = [];
                const refs = [];
                if (typeof RagEngine !== 'undefined') {
                    try {
                        const st = RagEngine.status();
                        parts.push('RAG backend: ' + (st.backend || 'unknown'));
                        parts.push('Embedding: ' + (st.embedding || 'hash'));
                        if (st.collections) parts.push('Collections: ' + st.collections.join(', '));
                        refs.push('RagEngine.status');
                    } catch (e) { parts.push('RagEngine error'); }
                }
                if (typeof IndexingEngine !== 'undefined') {
                    try {
                        const ist = IndexingEngine.status();
                        parts.push('IndexingEngine: ' + (ist.collections || []).length + ' collection(s), backend: ' + ist.backend);
                        refs.push('IndexingEngine.status');
                    } catch (e) { /* ignore */ }
                }
                if (typeof EmbeddingEngine !== 'undefined') {
                    parts.push('EmbeddingEngine: provider=' + EmbeddingEngine.getProvider() + ', dim=' + EmbeddingEngine.getDimension());
                    refs.push('EmbeddingEngine');
                }
                return {
                    ok: true, agentId: this.id,
                    message: parts.join(' | ') || 'RAG status unavailable.',
                    facts: parts, sourceRefs: refs
                };
            }

            // ── Sync status ───────────────────────────────────────────────
            if (/sync/i.test(q)) {
                const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
                const parts = ['Network: ' + (online ? 'Online' : 'Offline')];
                const refs = ['navigator.onLine'];
                if (typeof SyncManager !== 'undefined') {
                    try {
                        parts.push('Sync: ' + (SyncManager.status || 'unknown'));
                        if (SyncManager.lastSyncTime) {
                            parts.push('Last sync: ' + new Date(SyncManager.lastSyncTime).toLocaleString());
                        }
                        if (SyncManager.pendingWrites != null) {
                            parts.push('Pending writes: ' + SyncManager.pendingWrites);
                        }
                        refs.push('SyncManager');
                    } catch (e) { parts.push('SyncManager error'); }
                }
                return { ok: true, agentId: this.id, message: parts.join(' | '), facts: parts, sourceRefs: refs };
            }

            // ── Audit trail ───────────────────────────────────────────────
            if (/audit|replay/i.test(q)) {
                if (typeof ActionReplayEngine === 'undefined') {
                    return { ok: false, agentId: this.id, message: 'Audit engine not loaded.', sourceRefs: [] };
                }
                let list = [];
                try { list = ActionReplayEngine.list({ limit: 10 }) || []; } catch (e) { /* ignore */ }
                if (!list.length) {
                    return { ok: true, agentId: this.id, message: 'No AI actions recorded yet.', sourceRefs: ['ActionReplayEngine'] };
                }
                const lines = list.map(function (e) {
                    return (e.when || '') + ' — ' + ((e.what && e.what.functionName) || 'action') +
                        (e.approved != null ? ' [' + (e.approved ? 'approved' : 'denied') + ']' : '');
                }).join('\n');
                return {
                    ok: true, agentId: this.id,
                    message: 'Recent AI audit (' + list.length + ' entries):\n' + lines,
                    facts: list, sourceRefs: ['ActionReplayEngine', 'gtes_ai_audit']
                };
            }

            // ── Backup status ─────────────────────────────────────────────
            if (/backup/i.test(q)) {
                let backupInfo = 'N/A';
                if (typeof DataManager !== 'undefined' && DataManager.getData) {
                    try {
                        const settings = DataManager.getData(DataManager.KEYS.SETTINGS) || {};
                        if (settings.lastBackup) backupInfo = new Date(settings.lastBackup).toLocaleString();
                    } catch (e) { /* ignore */ }
                }
                return {
                    ok: true, agentId: this.id,
                    message: 'Last backup: ' + backupInfo + '. Use Admin → Backup to create or restore. AI cannot run backup without user confirmation.',
                    sourceRefs: ['DataManager.KEYS.SETTINGS', 'AdminModule']
                };
            }

            // ── User permissions audit ─────────────────────────────────────
            if (/permission|user\s*role|who\s*has\s*access/i.test(q)) {
                if (typeof UserManager !== 'undefined') {
                    try {
                        const users = UserManager.getUsers ? UserManager.getUsers() : [];
                        if (!users.length) {
                            return { ok: true, agentId: this.id, message: 'No user records found.', sourceRefs: ['UserManager'] };
                        }
                        const lines = users.slice(0, 10).map(function (u) {
                            return (u.name || u.username) + ': ' + (u.role || u.roles || 'user');
                        }).join(', ');
                        return {
                            ok: true, agentId: this.id,
                            message: users.length + ' user(s): ' + lines,
                            facts: users.slice(0, 10), sourceRefs: ['UserManager']
                        };
                    } catch (e) { /* fall through */ }
                }
                return { ok: true, agentId: this.id, message: 'User permission data not available via AI. Use Admin → Users.', sourceRefs: [] };
            }

            return { ok: false, agentId: this.id, message: 'No data found.', sourceRefs: [] };
        }
    };

    global.AdminAgent = AdminAgent;
})(typeof window !== 'undefined' ? window : global);
