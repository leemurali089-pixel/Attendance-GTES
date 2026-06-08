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
