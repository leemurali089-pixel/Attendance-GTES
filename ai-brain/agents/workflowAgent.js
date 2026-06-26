/**
 * workflowAgent.js — Workflow Sub-Agent (Jarvis Multi-Agent ERP OS v2)
 * Handles: AMC reminders, overdue tasks, follow-up recommendations, task lists
 * Tamil keywords: followup, amc due, service due, task list, remind
 * Bulk task creates → ApprovalEngine gate
 */
(function (global) {
    'use strict';

    const KEYWORDS = [
        /\btask/i, /\bdelivery/i, /\bpurchase/i, /\bservice/i, /\bjob\s*card/i,
        /\bchallan/i, /\border/i, /\bamc\b/i, /\bworkflow/i, /\bfollow\s*up/i,
        /\bremind/i, /\boverdue/i, /\bdue\s*today/i, /\bpending\s*task/i,
        /\bamc\s*due/i, /\bservice\s*due/i, /\bopen\s*task/i
    ];

    function _today() {
        return new Date().toISOString().slice(0, 10);
    }

    function _addDays(dateStr, n) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function _getTasks() {
        if (typeof DataManager === 'undefined') return [];
        return DataManager.getData(DataManager.KEYS.TASKS) || [];
    }

    /** Open / pending tasks */
    function _openTasks() {
        return _getTasks().filter(function (t) {
            const s = String(t.status || '').toLowerCase();
            return s === 'open' || s === 'pending' || s === 'new';
        });
    }

    /** Overdue tasks — followupDate < today */
    function _overdueTasks() {
        const today = _today();
        return _getTasks().filter(function (t) {
            const s = String(t.status || '').toLowerCase();
            if (s === 'closed' || s === 'done' || s === 'completed') return false;
            const fd = String(t.followupDate || t.dueDate || t.nextDate || '');
            return fd && fd < today;
        });
    }

    /** AMC tasks due within next N days */
    function _amcDue(days) {
        const today = _today();
        const limit = _addDays(today, days || 30);
        return _getTasks().filter(function (t) {
            const s = String(t.status || '').toLowerCase();
            if (s === 'closed' || s === 'done' || s === 'completed') return false;
            const isAmc = /amc|service|annual\s*maintenance|maintenance/i.test(String(t.type || '') + ' ' + String(t.narration || ''));
            if (!isAmc) return false;
            const fd = String(t.followupDate || t.dueDate || t.nextDate || '');
            return fd >= today && fd <= limit;
        });
    }

    /** Tasks by customer name */
    function _customerTasks(name) {
        const lower = String(name || '').toLowerCase();
        return _getTasks().filter(function (t) {
            return String(t.partyName || t.customerName || '').toLowerCase().indexOf(lower) >= 0;
        });
    }

    /** Summarize a task list for display (max 8 items) */
    function _summarize(tasks, label) {
        if (!tasks.length) return label + ': None';
        const lines = tasks.slice(0, 8).map(function (t) {
            const party = t.partyName || t.customerName || '—';
            const detail = t.narration || t.type || '';
            const fd = t.followupDate || t.dueDate || '';
            return '• ' + party + ': ' + detail + (fd ? ' (' + fd + ')' : '');
        });
        const extra = tasks.length > 8 ? '\n  …and ' + (tasks.length - 8) + ' more' : '';
        return label + ' (' + tasks.length + '):\n' + lines.join('\n') + extra;
    }

    const WorkflowAgent = {
        id: 'workflowAgent',
        domains: ['workflow'],

        canHandle: function (query) {
            let score = 0;
            KEYWORDS.forEach(function (p) { if (p.test(String(query || ''))) score += 0.25; });
            return Math.min(1, score);
        },

        execute: async function (query, ctx) {
            ctx = ctx || {};
            const q = String(query || '').trim();

            // ── Briefing mode ─────────────────────────────────────────────
            if (ctx.mode === 'briefing') {
                const open = _openTasks();
                const overdue = _overdueTasks();
                const amc = _amcDue(7);
                const parts = [];
                parts.push(open.length + ' open task(s)');
                if (overdue.length) parts.push(overdue.length + ' overdue');
                if (amc.length) parts.push(amc.length + ' AMC due within 7 days');
                return {
                    ok: true, agentId: this.id,
                    message: parts.join(', '),
                    facts: [{ pendingTasks: open.length, overdue: overdue.length, amcDue: amc.length }],
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

            // ── AMC due reminders ─────────────────────────────────────────
            if (/amc\s*due|amc\s*remind|annual\s*maintenance\s*due|service\s*due/i.test(q)) {
                const days = /30/i.test(q) ? 30 : (/7/i.test(q) ? 7 : 30);
                const amc = _amcDue(days);
                if (!amc.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No AMC or service tasks due in the next ' + days + ' days.',
                        facts: [], sourceRefs: ['DataManager.KEYS.TASKS']
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: _summarize(amc, 'AMC/Service due in next ' + days + ' days'),
                    facts: amc.slice(0, 10),
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

            // ── Overdue tasks ─────────────────────────────────────────────
            if (/overdue|over\s*due|past\s*due|expired\s*task/i.test(q)) {
                const overdue = _overdueTasks();
                if (!overdue.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No overdue tasks. All follow-ups are within schedule.',
                        facts: [], sourceRefs: ['DataManager.KEYS.TASKS']
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: _summarize(overdue, 'Overdue tasks'),
                    facts: overdue.slice(0, 10),
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

            // ── Follow-up recommendations ─────────────────────────────────
            if (/follow.?up\s*recommend|recommend\s*follow|what\s*to\s*follow/i.test(q)) {
                const overdue = _overdueTasks();
                const amc = _amcDue(14);
                const combined = overdue.concat(amc.filter(function (t) {
                    return !overdue.find(function (o) { return o.id === t.id; });
                }));
                if (!combined.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: 'No immediate follow-ups needed.',
                        facts: [], sourceRefs: ['DataManager.KEYS.TASKS']
                    };
                }
                return {
                    ok: true, agentId: this.id,
                    message: _summarize(combined, 'Recommended follow-ups'),
                    facts: combined.slice(0, 10),
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

        // ── List all tasks (including closed) ─────────────────────
        if (/list\s+(?:down\s+)?all\s+(\d+)?\s*tasks?/i.test(q)) {
            const match = q.match(/list\s+(?:down\s+)?all\s+(\d+)?\s*tasks?/i);
            const expectedCount = match && match[1] ? parseInt(match[1],10) : null;
            const all = _getTasks();
            const total = all.length;
            const preview = all.slice(0, 8).map(t => (t.id || t.title || 'Task') + (t.status ? ' ['+t.status+']' : '')).join(', ');
            const msg = `Total tasks: ${total}` + (expectedCount !== null ? ` (expected ${expectedCount})` : '') + `. Sample: ${preview}`;
            return { ok: true, agentId: this.id, message: msg, facts: all.slice(0, 10), sourceRefs: ['DataManager.KEYS.TASKS'] };
        }
        
            // ── Pending / open task list + due tasks ─────────────────────
            if (/pending\s+task|open\s+task|task\s+list|all\s+task|tasks?\s+(?:are\s+)?due|due\s+tasks?|what.*?(?:task|due)|tasks?\s+pending/i.test(q)) {
                // Try TaskEngine first
                if (typeof TaskEngine !== 'undefined') {
                    const list = TaskEngine.list({});
                    if (list && list.ok !== false) {
                        return {
                            ok: true, agentId: this.id,
                            message: list.message || list.summary || ('Tasks: ' + (list.rows || list.data || []).length + ' found.'),
                            facts: list.rows || list.data || [],
                            sourceRefs: ['TaskEngine.list', 'DataManager.KEYS.TASKS']
                        };
                    }
                }
                const open = _openTasks();
                if (!open.length) {
                    return { ok: true, agentId: this.id, message: 'No open tasks found.', sourceRefs: ['DataManager.KEYS.TASKS'] };
                }
                return {
                    ok: true, agentId: this.id,
                    message: _summarize(open, 'Open tasks'),
                    facts: open.slice(0, 10),
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

            // ── Customer tasks + KnowledgeGraph chain ─────────────────────
            if (typeof KnowledgeGraphEngine !== 'undefined') {
                const custMatch = q.match(/(?:task|amc|service|follow.?up)\s+(?:for|of)\s+([A-Za-z0-9\s.&-]+)/i);
                if (custMatch) {
                    const name = custMatch[1].trim();
                    const chain = KnowledgeGraphEngine.getCustomerChain(name);
                    const tasks = _customerTasks(name);
                    if (chain && chain.length > 1) {
                        const taskPart = tasks.length ? '\n' + _summarize(tasks, 'Tasks') : '';
                        return {
                            ok: true, agentId: this.id,
                            message: 'Workflow chain for ' + name + ': ' + chain.map(function (e) {
                                return e.type + (e.label ? ' ' + e.label : '') + (e.status ? ' [' + e.status + ']' : '');
                            }).join(' → ') + taskPart,
                            facts: chain.concat(tasks.slice(0, 5)),
                            sourceRefs: ['KnowledgeGraphEngine', 'DataManager.KEYS.TASKS']
                        };
                    }
                    if (tasks.length) {
                        return {
                            ok: true, agentId: this.id,
                            message: _summarize(tasks, name + ' tasks'),
                            facts: tasks.slice(0, 10),
                            sourceRefs: ['DataManager.KEYS.TASKS']
                        };
                    }
                }
            }

            // ── Bulk task create → ApprovalEngine ─────────────────────────
            if (/bulk\s+create\s+task|mass\s+create\s+task/i.test(q)) {
                if (typeof ApprovalEngine !== 'undefined') {
                    const result = await ApprovalEngine.request({
                        tier: 'T2',
                        functionName: 'task.bulkCreate',
                        args: { query: q },
                        description: 'Bulk task creation request'
                    });
                    return {
                        ok: !!(result && result.approved),
                        agentId: this.id,
                        message: result && result.approved
                            ? 'Bulk task creation approved. Proceeding.'
                            : 'Bulk task creation requires confirmation. Please confirm.',
                        needConfirm: !(result && result.approved),
                        sourceRefs: ['ApprovalEngine']
                    };
                }
            }

            // ── Due today ─────────────────────────────────────────────────
            if (/due\s*today|today\s*followup|innikku\s*followup/i.test(q)) {
                const today = _today();
                const dueToday = _getTasks().filter(function (t) {
                    const s = String(t.status || '').toLowerCase();
                    if (s === 'closed' || s === 'done' || s === 'completed') return false;
                    const fd = String(t.followupDate || t.dueDate || '');
                    return fd === today;
                });
                if (!dueToday.length) {
                    return { ok: true, agentId: this.id, message: 'No tasks due today.', sourceRefs: ['DataManager.KEYS.TASKS'] };
                }
                return {
                    ok: true, agentId: this.id,
                    message: _summarize(dueToday, 'Due today'),
                    facts: dueToday.slice(0, 10),
                    sourceRefs: ['DataManager.KEYS.TASKS']
                };
            }

            // ── RAG fallback ───────────────────────────────────────────────
            const ragEngine = typeof RetrievalEngine !== 'undefined' ? RetrievalEngine : (typeof RagEngine !== 'undefined' ? RagEngine : null);
            if (ragEngine) {
                const rag = await ragEngine.retrieve(q, { collections: ['tasks', 'documents'], limit: 4 });
                if (rag.ok && rag.hits && rag.hits.length) {
                    return {
                        ok: true, agentId: this.id,
                        message: rag.hits.map(function (h) { return h.text; }).join(' | '),
                        facts: rag.hits, sourceRefs: rag.sourceRefs || ['RagEngine:workflow']
                    };
                }
            }

            // ── IntentEngine / CommandRouter fallback ──────────────────────
            if (typeof IntentEngine !== 'undefined' && /task|create_task|delivery|purchase/.test(q)) {
                const parsed = IntentEngine.parse(q);
                if (parsed && parsed.intent && typeof CommandRouter !== 'undefined') {
                    const routed = await CommandRouter.route(parsed);
                    if (routed && routed.message) {
                        return {
                            ok: routed.success !== false, agentId: this.id,
                            message: routed.message,
                            facts: routed.data ? [routed.data] : [],
                            sourceRefs: ['CommandRouter:' + parsed.intent],
                            needClarify: routed.needClarify,
                            needConfirm: routed.needConfirm
                        };
                    }
                }
            }

            return { ok: false, agentId: this.id, message: 'No data found.', sourceRefs: [] };
        }
    };

    global.WorkflowAgent = WorkflowAgent;
})(typeof window !== 'undefined' ? window : global);
