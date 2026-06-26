/**
 * trainingCenter.js — Company-specific AI learning
 * Aliases, business terms, workflow mappings, ERP terminology.
 * Consumed by reasoningEngine + knowledgeEngine.
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'gtes_ai_training_center_v1';
    const DISK_KEY = 'gtes_ai_training';

    const DEFAULTS = {
        aliases: { customers: {}, employees: {}, vendors: {} },
        businessTerms: {},
        workflowMappings: [],
        erpTerminology: {
            invoice: 'Sales Invoice',
            voucher: 'Receipt / Payment Voucher',
            challan: 'Delivery Challan',
            estimate: 'Quotation / Estimate',
            attendance: 'Daily Attendance',
            payout: 'Salary Payout'
        },
        version: 1
    };

    function _clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return Object.assign(_clone(DEFAULTS), parsed);
            }
        } catch (e) { /* ignore */ }
        return _clone(DEFAULTS);
    }

    function _save(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) { /* ignore */ }
        if (typeof DataManager !== 'undefined' && DataManager.saveData) {
            DataManager.saveData(DISK_KEY, data).catch(function () {});
        }
    }

    let _cache = _load();

    function _norm(s) {
        return String(s || '').trim().toLowerCase();
    }

    const TrainingCenter = {
        getAll: function () {
            return _clone(_cache);
        },

        reload: function () {
            _cache = _load();
            return _cache;
        },

        /** Resolve spoken customer name → customerId */
        resolveCustomerAlias: function (spoken) {
            const key = _norm(spoken);
            if (!key) return null;
            const map = _cache.aliases.customers || {};
            if (map[key]) return map[key];
            for (const alias in map) {
                if (key.indexOf(alias) >= 0 || alias.indexOf(key) >= 0) return map[alias];
            }
            return null;
        },

        resolveEmployeeAlias: function (spoken) {
            const key = _norm(spoken);
            if (!key) return null;
            const map = _cache.aliases.employees || {};
            if (map[key]) return map[key];
            for (const alias in map) {
                if (key.indexOf(alias) >= 0 || alias.indexOf(key) >= 0) return map[alias];
            }
            return null;
        },

        addCustomerAlias: function (spoken, customerId) {
            const key = _norm(spoken);
            if (!key || !customerId) return false;
            _cache.aliases.customers[key] = customerId;
            _save(_cache);
            return true;
        },

        addEmployeeAlias: function (spoken, employeeId) {
            const key = _norm(spoken);
            if (!key || !employeeId) return false;
            _cache.aliases.employees[key] = employeeId;
            _save(_cache);
            return true;
        },

        /** Map company jargon → canonical term */
        resolveBusinessTerm: function (term) {
            const key = _norm(term);
            return (_cache.businessTerms && _cache.businessTerms[key]) || term;
        },

        setBusinessTerm: function (localTerm, canonical) {
            const key = _norm(localTerm);
            if (!key) return false;
            _cache.businessTerms[key] = canonical;
            _save(_cache);
            return true;
        },

        /** Utterance → preferred workflow intent */
        matchWorkflow: function (utterance) {
            const u = _norm(utterance);
            const list = _cache.workflowMappings || [];
            for (let i = 0; i < list.length; i++) {
                const w = list[i];
                if (!w || !w.pattern) continue;
                const pat = _norm(w.pattern);
                if (u.indexOf(pat) >= 0) return w;
            }
            return null;
        },

        addWorkflowMapping: function (pattern, intent, agentId) {
            if (!pattern || !intent) return false;
            _cache.workflowMappings.push({
                pattern: pattern,
                intent: intent,
                agentId: agentId || null
            });
            _save(_cache);
            return true;
        },

        getErpTerm: function (key) {
            return (_cache.erpTerminology && _cache.erpTerminology[key]) || key;
        },

        setErpTerminology: function (key, label) {
            if (!key) return false;
            _cache.erpTerminology[key] = label;
            _save(_cache);
            return true;
        },

        /** Expand utterance with aliases + terms before reasoning */
        enrichUtterance: function (utterance) {
            let text = String(utterance || '');
            const custId = this.resolveCustomerAlias(text);
            const empId = this.resolveEmployeeAlias(text);
            return {
                text: text,
                resolvedCustomerId: custId,
                resolvedEmployeeId: empId,
                businessTermHints: Object.keys(_cache.businessTerms || {}).filter(function (t) {
                    return _norm(text).indexOf(t) >= 0;
                })
            };
        },

        // ── NEW v3: User Correction Handling ─────────────────────────────────

        /**
         * Parse and persist a user correction utterance.
         * Supports patterns:
         *   "Avon means Avon Oxygen"
         *   "call Avon as Avon Oxygen"
         *   "Avon is Avon Oxygen"
         *   "remember Avon as Avon Oxygen"
         *
         * @param {string} utterance
         * @returns {{ ok: boolean, spoken: string, resolved: string, type: string }|null}
         */
        processUserCorrection: function (utterance) {
            const text = String(utterance || '').trim();
            // Match: "X means Y" | "call X as Y" | "X is Y" | "remember X as Y"
            const patterns = [
                /^([\w\s&.'-]+?)\s+means\s+([\w\s&.'-]+)$/i,
                /^call\s+([\w\s&.'-]+?)\s+as\s+([\w\s&.'-]+)$/i,
                /^([\w\s&.'-]+?)\s+is\s+([\w\s&.'-]+)$/i,
                /^remember\s+([\w\s&.'-]+?)\s+as\s+([\w\s&.'-]+)$/i,
                /^([\w\s&.'-]+?)\s+=\s+([\w\s&.'-]+)$/i
            ];

            for (let i = 0; i < patterns.length; i++) {
                const m = text.match(patterns[i]);
                if (m) {
                    const spoken = m[1].trim();
                    const resolved = m[2].trim();
                    if (!spoken || !resolved || spoken.toLowerCase() === resolved.toLowerCase()) continue;

                    // Determine type: if the resolved name looks like a customer, save as customer alias
                    let type = 'customer'; // default
                    if (typeof DataManager !== 'undefined') {
                        const employees = DataManager.getData(DataManager.KEYS ? DataManager.KEYS.EMPLOYEES : 'gtes_employees') || [];
                        const empMatch = employees.some(function (e) {
                            return _norm(e.name || '').indexOf(_norm(resolved)) >= 0;
                        });
                        if (empMatch) type = 'employee';
                    }

                    this.recordCorrection(spoken, resolved, type);
                    return { ok: true, spoken: spoken, resolved: resolved, type: type };
                }
            }
            return null;
        },

        /**
         * Record a correction and persist the alias.
         * @param {string} spoken    — short/alias name the user said
         * @param {string} resolved  — full canonical name
         * @param {string} type      — 'customer'|'employee'
         */
        recordCorrection: function (spoken, resolved, type) {
            if (!spoken || !resolved) return false;
            if (type === 'employee') {
                this.addEmployeeAlias(spoken, resolved);
            } else {
                this.addCustomerAlias(spoken, resolved);
            }
            // Also log to InteractionLogger
            if (typeof InteractionLogger !== 'undefined') {
                InteractionLogger.logCorrection(spoken, resolved, type);
            }
            return true;
        },

        // ── NEW v3: Frequency / Preference API ───────────────────────────────

        /**
         * Get ranked entity list from InteractionLogger.
         * @param {string} type — 'customers'|'employees'|'intents'
         * @param {number} n
         * @returns {Array<{name:string, count:number}>}
         */
        getFrequencyMap: function (type, n) {
            if (typeof InteractionLogger !== 'undefined') {
                if (type === 'employees') return InteractionLogger.getFrequentEmployees(n || 5);
                if (type === 'intents')   return InteractionLogger.getFrequentIntents(n || 10);
                return InteractionLogger.getFrequentCustomers(n || 5);
            }
            return [];
        },

        /**
         * Apply frequency boost to a candidate list.
         * Candidates with higher access frequency are sorted higher.
         *
         * @param {Entity[]} candidates
         * @param {string}   type — 'customer'|'employee'
         * @returns {Entity[]} re-sorted candidates
         */
        prioritizeCandidates: function (candidates, type) {
            if (!candidates || !candidates.length) return candidates;
            if (typeof InteractionLogger === 'undefined') return candidates;
            return candidates.slice().sort(function (a, b) {
                const aBoost = InteractionLogger.getFrequencyBoost(a.name, type);
                const bBoost = InteractionLogger.getFrequencyBoost(b.name, type);
                const aScore = (a._score || 0.5) + aBoost;
                const bScore = (b._score || 0.5) + bBoost;
                return bScore - aScore;
            });
        },

        /** Browser-side production audit summary (mirrors validate-voice-stress categories) */
        runProductionAudit: function () {
            const categories = {
                Voice: false,
                Tamil: false,
                Attendance: false,
                Customers: false,
                Outstanding: false,
                Tasks: false,
                Payroll: false,
                Reports: false
            };

            if (typeof SpeechProviderManager !== 'undefined') {
                const d = SpeechProviderManager.getDiagnostics();
                categories.Voice = !!d.provider && d.recognitionState !== 'error';
            }
            if (typeof LanguageEngine !== 'undefined' && LanguageEngine.normalizeForParse) {
                const t = LanguageEngine.normalizeForParse('இன்று யார் வரவில்லை');
                categories.Tamil = /varala|absent|yaar|today/i.test(t.text || '');
            }
            if (typeof ErpFunctions !== 'undefined' && ErpFunctions.AttendanceHealthCheck) {
                categories.Attendance = true;
            }
            if (typeof CustomerManager !== 'undefined') {
                categories.Customers = (CustomerManager.getAllCustomers() || []).length > 0;
            }
            if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoicesWithBalance) {
                categories.Outstanding = true;
            }
            if (typeof DataManager !== 'undefined') {
                categories.Tasks = Array.isArray(DataManager.getData(DataManager.KEYS.TASKS));
            }
            if (typeof DataManager !== 'undefined' && DataManager.getSalaryPayoutDetails) {
                categories.Payroll = true;
            }
            if (typeof BusinessAnalytics !== 'undefined' && BusinessAnalytics.getRevenueMetrics) {
                categories.Reports = true;
            }

            const keys = Object.keys(categories);
            const passed = keys.filter(function (k) { return categories[k]; }).length;
            const readinessPct = Math.round((passed / keys.length) * 100);

            return {
                categories: categories,
                passed: passed,
                total: keys.length,
                readinessPct: readinessPct,
                at: new Date().toISOString()
            };
        }
    };

    global.TrainingCenter = TrainingCenter;
})(typeof window !== 'undefined' ? window : global);
