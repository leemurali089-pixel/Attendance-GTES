/**
 * orchestratorAgent.js — Jarvis Master Agent (Multi-Agent ERP OS v2)
 * Jarvis is the ONLY agent that communicates with the user.
 * Sub-agents execute domain work; Jarvis synthesizes and responds.
 */
(function (global) {
    'use strict';

    // Write-path patterns — route to legacy IntentEngine for confirmation
    const WRITE_PATTERNS = [
        /^(mark|create|delete|update|bulk|generate|save)\b/i,
        /mark\s+attendance/i,
        /create\s+(task|voucher|invoice)/i,
        /bulk\s+/i,
        /confirm/i
    ];

    // Tamil + colloquial routing hints per domain
    const TAMIL_HR_HINTS     = /\b(duty|innikku|inniku|yaar varala|varala|absent\s*list|yaar illai|யார்\s*வரல|ஊழியர்|வருகை|வந்தவர்|வராதவர்|dayoff)\b/i;
    const TAMIL_PAYROLL_HINTS = /\b(sambalam|சம்பள|evlo\s*sambalam|salary\s*list|payout|ஊதிய|advance\s*list)\b/i;
    const TAMIL_ACCT_HINTS   = /\b(niluvai|நிலுவை|evlo\s*niluvai|sollu|outstanding|outstanding\s*list|ledger|pending|pending\s*amount|total\s*pending|balance|due|new\s+(?:bill|invoice|voucher)|bills?\s+(?:made|created|yesterday|today)|recent\s+(?:bill|invoice)|invoices?\s+(?:made|yesterday))\b/i;
    const TAMIL_WORKFLOW_HINTS = /\b(followup|follow.?up|amc|amc\s*due|service\s*due|task\s*list|remind|tasks?\s*due|what.*tasks?)\b/i;
    const TAMIL_ADMIN_HINTS  = /\b(system|health|sync|backup|audit|replay|rag\s*status)\b/i;

    function _agents() {
        const list = [];
        if (typeof HrAgent !== 'undefined') list.push(HrAgent);
        if (typeof PayrollAgentBrain !== 'undefined') list.push(PayrollAgentBrain);
        if (typeof AccountingAgent !== 'undefined') list.push(AccountingAgent);
        if (typeof WorkflowAgent !== 'undefined') list.push(WorkflowAgent);
        if (typeof AdminAgent !== 'undefined') list.push(AdminAgent);
        if (typeof ExecutiveAgent !== 'undefined' && ExecutiveAgent.canHandle) list.push(ExecutiveAgent);
        if (typeof DocumentAgentBrain !== 'undefined' && DocumentAgentBrain.canHandle) list.push(DocumentAgentBrain);
        if (typeof CrmAgent !== 'undefined' && CrmAgent.canHandle) list.push(CrmAgent);
        if (typeof PaymentsAgent !== 'undefined' && PaymentsAgent.canHandle) list.push(PaymentsAgent);
        return list;
    }

    function _mergeSourceRefs(results) {
        const set = {};
        (results || []).forEach(function (r) {
            (r.sourceRefs || []).forEach(function (s) { set[s] = true; });
        });
        return Object.keys(set);
    }

    function _appendSources(message, sourceRefs, financial) {
        if (!financial || !sourceRefs || !sourceRefs.length) return message;
        return message + '\n[Sources: ' + sourceRefs.join(', ') + ']';
    }

    /**
     * Learning: record a failed/empty query pattern so Jarvis can route it better next time.
     * Saves to TrainingCenter.workflowMappings with the best-scoring agentId.
     */
    function _recordNoData(query, agentId) {
        if (typeof TrainingCenter === 'undefined') return;
        try {
            // Normalise query to a short pattern (first 6 words)
            const words = String(query || '').toLowerCase().trim().split(/\s+/).slice(0, 6).join(' ');
            if (words.length < 4) return;
            // Avoid duplicate entries
            const existing = TrainingCenter.matchWorkflow(words);
            if (existing) return;
            TrainingCenter.addWorkflowMapping(words, 'retry_' + (agentId || 'unknown'), agentId || null);
        } catch (e) { /* ignore */ }
    }

    /**
     * Learning: check TrainingCenter for a previously-learned route for this query.
     * Returns the agentId if a mapping exists, otherwise null.
     */
    function _learnedRoute(query) {
        if (typeof TrainingCenter === 'undefined') return null;
        try {
            const mapping = TrainingCenter.matchWorkflow(String(query || '').toLowerCase());
            if (mapping && mapping.agentId) return mapping.agentId;
        } catch (e) { /* ignore */ }
        return null;
    }

    /**
     * Jarvis-style synthesis — convert raw agent output into Jarvis first-person voice.
     * Strips raw [agentId] prefixes, adds Jarvis framing.
     */
    function _jarvisVoice(results, query) {
        const lines = [];
        results.forEach(function (r) {
            if (!r || !r.message || r.message === 'No data found.') return;
            // Remove the old [agentId] prefix if present, Jarvis will speak directly
            const raw = String(r.message).replace(/^\[.*?\]\s*/g, '');
            lines.push(raw);
        });
        if (!lines.length) return 'No data found for: ' + query;
        return lines.join('\n\n');
    }

    /**
     * Build a Jarvis-voice ambiguity response: numbered list of candidates.
     * Sets pending clarification state so next utterance resolves the choice.
     */
    function _resolveAmbiguity(query, candidates, domain) {
        // Prioritize by frequency if InteractionLogger is available
        let ranked = candidates;
        if (typeof TrainingCenter !== 'undefined' && TrainingCenter.prioritizeCandidates) {
            ranked = TrainingCenter.prioritizeCandidates(candidates, domain);
        }

        // Store state for next turn
        if (typeof ContextEngine !== 'undefined' && ContextEngine.setPendingClarify) {
            ContextEngine.setPendingClarify(ranked, domain, query);
        }

        // Log the clarification event
        if (typeof InteractionLogger !== 'undefined') {
            InteractionLogger.logClarification(query, ranked, domain);
        }

        const lines = ranked.slice(0, 5).map(function (opt, i) {
            return (i + 1) + '. ' + (opt.name || opt.invoiceNo || opt.voucherId || '?');
        });

        const domainLabel = domain === 'employee' ? 'employees' : 'customers';
        return {
            ok: true,
            handled: true,
            needClarify: true,
            message: 'I found multiple ' + domainLabel + ' matching "' + query + '":\n' + lines.join('\n') + '\n\nWhich one would you like?',
            clarifyOptions: ranked.slice(0, 5),
            domain: domain,
            originalQuery: query,
            sourceRefs: [],
            agents: ['jarvis'],
            jarvis: true,
            confidence: 1.0
        };
    }

    /**
     * Handle a clarification reply when pendingClarify is active.
     * The user replied with a number or name — resolve and re-execute original query.
     */
    async function _handleClarificationReply(utterance, context) {
        const pending = ContextEngine.getPendingClarify();
        const resolution = ContextEngine.resolveClarify(utterance);

        if (!resolution.resolved) {
            // Could not match — ask again
            const options = pending.options.map(function (o, i) {
                return (i + 1) + '. ' + (o.name || '?');
            }).join('\n');
            return {
                ok: true, handled: true, needClarify: true,
                message: 'I could not match your reply. Please say a number (1, 2, 3...) or the full name:\n' + options,
                agents: ['jarvis'], jarvis: true, sourceRefs: []
            };
        }

        // Resolved — clear pending state and re-run original query with entity locked
        const resolved = resolution.resolved;
        const originalQuery = pending.originalQuery;
        ContextEngine.clearPendingClarify();

        // Update session so agents pick up the resolved entity
        if (typeof ContextManager !== 'undefined' && ContextManager.set) {
            if (pending.domain === 'employee') {
                ContextManager.set({ lastEmployeeName: resolved.name });
            } else {
                ContextManager.set({ lastCustomerName: resolved.name, lastCustomerId: resolved.entityId });
            }
        }

        // Log the correction/choice
        if (typeof InteractionLogger !== 'undefined') {
            InteractionLogger.log('clarify:' + utterance, { intent: 'clarify.resolve', agentId: 'jarvis' },
                { ok: true, message: 'Resolved to: ' + resolved.name, sourceRefs: [] });
        }

        // Re-execute with the resolved entity name
        const refinedQuery = originalQuery + ' ' + resolved.name;
        const agents = _agents();
        const results = await Promise.all(agents.map(function (a) {
            return Promise.resolve(a.execute(refinedQuery, Object.assign({}, context, {
                resolvedEntity: resolved,
                resolvedEntityName: resolved.name,
                resolvedEntityType: pending.domain
            }))).catch(function (err) {
                return { ok: false, agentId: a.id, message: err && err.message, sourceRefs: [] };
            });
        }));

        const withData = results.filter(function (r) { return r && r.ok && r.message && r.message !== 'No data found.'; });
        const use = withData.length ? withData : results.filter(function (r) { return r && r.message; });
        const message = use.length
            ? _jarvisVoice(use, refinedQuery)
            : 'No data found for ' + resolved.name + '.';

        return {
            ok: !!use.length, handled: true, success: !!use.length,
            message: message,
            resolvedEntity: resolved,
            sourceRefs: _mergeSourceRefs(use),
            agents: use.map(function (r) { return r.agentId; }),
            jarvis: true, confidence: 0.95, clarified: true
        };
    }

    /**
     * Handle a correction: "Avon means Avon Oxygen".
     * TrainingCenter already saved the alias in reasoningEngine guard.
     * Here we just produce a Jarvis confirmation response.
     */
    function _handleCorrectionResponse(correction) {
        if (typeof InteractionLogger !== 'undefined') {
            InteractionLogger.logCorrection(correction.spoken, correction.resolved, correction.type);
        }
        return {
            ok: true, handled: true, success: true,
            message: 'Got it. I\'ll remember that "' + correction.spoken + '" means ' + correction.resolved + '. From now on I\'ll use ' + correction.resolved + ' directly.',
            sourceRefs: [], agents: ['jarvis'], jarvis: true, confidence: 1.0, learned: true
        };
    }

    /**
     * Tamil/colloquial domain boost — pre-score before asking agents.
     * Returns a map of agentId → boost score.
     */
    function _tamilBoost(q) {
        const boosts = {};
        if (TAMIL_HR_HINTS.test(q))       boosts['hrAgent'] = 0.6;
        if (TAMIL_PAYROLL_HINTS.test(q))  boosts['payrollAgent'] = 0.6;
        if (TAMIL_ACCT_HINTS.test(q))     boosts['accountingAgent'] = 0.6;
        if (TAMIL_WORKFLOW_HINTS.test(q)) boosts['workflowAgent'] = 0.6;
        if (TAMIL_ADMIN_HINTS.test(q))    boosts['adminAgent'] = 0.6;
        return boosts;
    }

    const OrchestratorAgent = {
        id: 'jarvis',
        version: '2.1.0',
        persona: 'Jarvis — MJS Prime Logic ERP Intelligence',

        shouldDelegateLegacy: function (query) {
            const q = String(query || '').trim();
            if (!q) return true;
            if (typeof ContextManager !== 'undefined') {
                if (ContextManager.getPendingClarify && ContextManager.getPendingClarify()) return true;
                if (ContextManager.getConfirmation && ContextManager.getConfirmation()) return true;
            }
            for (let i = 0; i < WRITE_PATTERNS.length; i++) {
                if (WRITE_PATTERNS[i].test(q)) return true;
            }
            if (typeof IntentEngine !== 'undefined') {
                const parsed = IntentEngine.parse(q);
                if (parsed && parsed.intent) {
                    const def = typeof IntentRegistry !== 'undefined' ? IntentRegistry.get(parsed.intent) : null;
                    if (def && def.destructive) return true;
                    if (def && /mark_|create_|delete_|generate_/.test(parsed.intent)) return true;
                }
            }
            return false;
        },

        detectDomains: function (query) {
            const agents = _agents();
            const boosts = _tamilBoost(query);
            return agents
                .map(function (a) {
                    const base = a.canHandle ? a.canHandle(query) : 0;
                    const boost = boosts[a.id] || 0;
                    return { agentId: a.id, score: Math.min(1, base + boost) };
                })
                .filter(function (x) { return x.score > 0.15; })
                .sort(function (a, b) { return b.score - a.score; });
        },

        /**
         * Main Jarvis query processing — the ONLY external API.
         * @param {string} query
         * @param {Object} context
         * @returns {Promise<JarvisResponse>}
         */
        processQuery: async function (query, context) {
            context = context || {};
            const q = String(query || '').trim();
            if (!q) {
                return {
                    ok: false, handled: true,
                    message: 'I didn\'t catch that. What would you like to know?',
                    sourceRefs: [], agents: [], jarvis: true
                };
            }

            // ── Pending clarification: user is replying to a numbered list ────
            if (typeof ContextEngine !== 'undefined' && ContextEngine.getPendingClarify &&
                ContextEngine.getPendingClarify() &&
                ContextEngine.isClarificationReply && ContextEngine.isClarificationReply(q)) {
                const result = await _handleClarificationReply(q, context);
                if (typeof InteractionLogger !== 'undefined') {
                    InteractionLogger.log(q, { intent: 'clarify.resolve', agentId: 'jarvis' }, result);
                }
                return result;
            }

            // ── Proactive briefing ────────────────────────────────────────────
            if (/daily\s+brief|morning\s+brief|today\s+summary|proactive\s+brief/i.test(q)) {
                return this.getProactiveBriefing(context);
            }

            // ── Write paths → legacy IntentEngine with confirmation ───────────
            if (this.shouldDelegateLegacy(q) && !context.forceOrchestrator) {
                return { ok: false, handled: false, delegateLegacy: true };
            }

            // ── Reasoning guards (correction, future date, payroll, ambiguity) ─
            if (typeof ReasoningEngine !== 'undefined') {
                const reasoning = ReasoningEngine.parse(q, context);
                if (reasoning.guardTriggered) {
                    switch (reasoning.guardTriggered) {
                        case 'correction':
                            return _handleCorrectionResponse(reasoning.correction);

                        case 'futureDate':
                            return {
                                ok: true, handled: true,
                                message: reasoning.guardMessage,
                                sourceRefs: [], agents: ['jarvis'], jarvis: true, confidence: 1.0
                            };

                        case 'payrollConfirm':
                            return {
                                ok: true, handled: true, needConfirm: true,
                                message: reasoning.guardMessage,
                                confirmedIntent: reasoning.confirmedIntent,
                                slots: reasoning.slots,
                                sourceRefs: [], agents: ['jarvis'], jarvis: true, confidence: 1.0
                            };

                        case 'ambiguousEntity':
                            return _resolveAmbiguity(q, reasoning.candidates, reasoning.domain);
                    }
                }
            }

            // ── Learning fast-path: previously-recorded successful route ───
            const learnedAgentId = _learnedRoute(q);
            if (learnedAgentId) {
                const agents = _agents();
                const learnedAgent = agents.find(function (a) { return a.id === learnedAgentId; });
                if (learnedAgent) {
                    try {
                        const res = await Promise.resolve(learnedAgent.execute(q, context));
                        if (res && res.ok && res.message && res.message !== 'No data found.') {
                            const msg = _jarvisVoice([res], q);
                            return {
                                ok: true, handled: true, success: true,
                                message: _appendSources(msg, res.sourceRefs || [], res.financial || false),
                                summary: msg, sourceRefs: res.sourceRefs || [],
                                financial: res.financial || false,
                                facts: res.facts || [],
                                agents: [learnedAgentId],
                                jarvis: true, confidence: 0.9, learned: true
                            };
                        }
                    } catch (e) { /* fall through to normal routing */ }
                }
            }

            // Fast path: ledger total (always AccountingAgent)
            const ledgerOnly = /total\s+(?:pending|outstanding)|^(?:total\s+)?pending\s+amount\s*$|niluvai\s+evlo|total\s+niluvai/i.test(q)
                && !(typeof TamilCommandRegistry !== 'undefined' && TamilCommandRegistry.extractCustomerName(q));
            if (ledgerOnly && typeof AccountingAgent !== 'undefined') {
                const acct = await AccountingAgent.execute(q, context);
                if (acct && acct.message) {
                    const msg = _jarvisVoice([acct], q);
                    return {
                        ok: acct.ok !== false,
                        handled: true,
                        success: acct.ok !== false,
                        message: _appendSources(msg, acct.sourceRefs || [], true),
                        summary: msg,
                        sourceRefs: acct.sourceRefs || [],
                        financial: true,
                        facts: acct.facts || [],
                        agents: [acct.agentId || 'accountingAgent'],
                        jarvis: true,
                        confidence: 0.98,
                        dataIntegrity: true
                    };
                }
            }

            const domains = this.detectDomains(q);
            const agents = _agents();
            let selected = agents;

            if (domains.length) {
                const topScore = domains[0].score;
                const ids = domains
                    .filter(function (d) { return d.score >= topScore * 0.6; })
                    .map(function (d) { return d.agentId; });
                selected = agents.filter(function (a) { return ids.indexOf(a.id) >= 0; });
            } else if (q.length > 8) {
                selected = agents;
            } else {
                return {
                    ok: false, handled: true,
                    message: 'No data found.',
                    sourceRefs: [], agents: [], jarvis: true
                };
            }

            const results = await Promise.all(selected.map(function (a) {
                return Promise.resolve(a.execute(q, context)).catch(function (err) {
                    return { ok: false, agentId: a.id, message: err && err.message, sourceRefs: [] };
                });
            }));

            const withData = results.filter(function (r) {
                return r && r.ok && r.message && r.message !== 'No data found.';
            });
            const actionable = results.filter(function (r) {
                return r && (r.ok || r.needClarify || r.needConfirm);
            });
            const withMessages = results.filter(function (r) {
                return r && r.message && r.message !== 'No data found.';
            });

            const use = withData.length ? withData : (actionable.length ? actionable : withMessages);

            if (!use.length) {
                // ── Learning: record this failure so we route better next time ──
                const bestDomain = domains.length ? domains[0].agentId : null;
                _recordNoData(q, bestDomain);
                return {
                    ok: false,
                    handled: true,
                    message: 'No data found for: "' + q + '". I\'ve noted this to improve future responses.',
                    sourceRefs: _mergeSourceRefs(results),
                    agents: results.map(function (r) { return r.agentId; }),
                    jarvis: true
                };
            }

            const financial = use.some(function (r) { return r.financial; });
            const sourceRefs = _mergeSourceRefs(use);
            const ok = use.some(function (r) { return r.ok; }) || use.some(function (r) { return r.needClarify || r.needConfirm; });

            const clarify = use.find(function (r) { return r.needClarify; });
            const confirm = use.find(function (r) { return r.needConfirm; });

            // ── Ambiguity resolution from agent results ───────────────────────
            // If an agent returns multiple customer/employee matches, ask Jarvis to clarify
            const ambiguous = use.find(function (r) { return r.candidates && r.candidates.length > 1; });
            if (ambiguous && !clarify) {
                return _resolveAmbiguity(q, ambiguous.candidates, ambiguous.domain || 'customer');
            }

            // Jarvis synthesizes all agent results into one voice
            const message = _jarvisVoice(use, q);
            const confidence = domains.length ? Math.min(1, domains[0].score) : 0.5;

            const finalResult = {
                ok: ok,
                handled: true,
                success: ok,
                message: _appendSources(message, sourceRefs, financial),
                summary: message,
                sourceRefs: sourceRefs,
                financial: financial,
                facts: use.reduce(function (acc, r) { return acc.concat(r.facts || []); }, []),
                agents: use.map(function (r) { return r.agentId; }),
                needClarify: !!(clarify && clarify.needClarify),
                needConfirm: !!(confirm && confirm.needConfirm),
                agentResults: results,
                jarvis: true,
                confidence: confidence,
                dataIntegrity: financial
            };

            // ── Log every completed turn ──────────────────────────────────────
            if (typeof InteractionLogger !== 'undefined') {
                InteractionLogger.log(q, { intent: domains.length ? domains[0].agentId : 'unknown', agentId: use[0] && use[0].agentId }, finalResult);
            }

            return finalResult;
        },

        /**
         * Daily proactive briefing — polls all primary sub-agents.
         */
        getProactiveBriefing: async function (context) {
            context = Object.assign({ mode: 'briefing' }, context || {});
            const agents = _agents().filter(function (a) {
                return ['hrAgent', 'payrollAgent', 'accountingAgent', 'workflowAgent'].indexOf(a.id) >= 0;
            });

            const results = await Promise.all(agents.map(function (a) {
                return Promise.resolve(a.execute('daily briefing', context)).catch(function () {
                    return { ok: false, agentId: a.id, message: null, sourceRefs: [] };
                });
            }));

            const lines = results
                .filter(function (r) { return r && r.ok && r.message; })
                .map(function (r) { return r.message; });

            const sourceRefs = _mergeSourceRefs(results);
            const date = new Date().toISOString().slice(0, 10);
            const briefing = ['Good morning. Daily briefing for ' + date + ':'].concat(lines).join('\n• ');

            return {
                ok: true,
                handled: true,
                success: true,
                briefing: briefing,
                message: briefing,
                messageEn: briefing,
                sourceRefs: sourceRefs,
                financial: true,
                agents: results.map(function (r) { return r.agentId; }),
                jarvis: true,
                confidence: 1.0,
                dataIntegrity: true,
                metrics: results.reduce(function (acc, r) {
                    if (r.facts && r.facts[0]) Object.assign(acc, r.facts[0]);
                    return acc;
                }, {})
            };
        },

        /**
         * Expose domain identification to sub-agents for cross-domain queries.
         */
        identifyDomain: function (query) {
            return this.detectDomains(query);
        }
    };

    global.OrchestratorAgent = OrchestratorAgent;
})(typeof window !== 'undefined' ? window : global);
