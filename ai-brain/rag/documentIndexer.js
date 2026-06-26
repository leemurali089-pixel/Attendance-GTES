/**
 * documentIndexer.js — Index ERP records into vector collections
 */
(function (global) {
    'use strict';

    const REINDEX_KEYS = {
        gtes_employees: 'employees',
        employees: 'employees',
        gtes_attendance: 'attendance',
        gtes_advances: 'payroll',
        customers: 'customers',
        invoices: 'invoices',
        vouchers: 'vouchers',
        gtes_tasks: 'tasks',
        gtes_challans: 'documents',
        challans: 'documents',
        jobcards: 'documents'
    };

    function _safeStr(v) {
        if (v == null) return '';
        return String(v);
    }

    function _record(id, text, meta) {
        return { id: id, text: text, meta: meta || {} };
    }

    const DocumentIndexer = {
        collectionForKey: function (storageKey) {
            return REINDEX_KEYS[storageKey] || null;
        },

        buildEmployeeDocs: function () {
            if (typeof DataManager === 'undefined') return [];
            const list = DataManager.getEmployees ? DataManager.getEmployees() : (DataManager.getData(DataManager.KEYS.EMPLOYEES) || []);
            return (list || []).map(function (e) {
                const id = 'emp:' + (e.id || e.employeeId || e.name);
                const text = [e.name, e.department, e.designation, e.status, e.phone, e.email].map(_safeStr).join(' ');
                return _record(id, text, { type: 'employee', name: e.name });
            });
        },

        buildAttendanceDocs: function (limit) {
            if (typeof DataManager === 'undefined') return [];
            limit = limit || 500;
            const list = DataManager.getData(DataManager.KEYS.ATTENDANCE) || [];
            const slice = list.slice(-limit);
            return slice.map(function (a, idx) {
                const id = 'att:' + (a.id || idx + '-' + a.employee + '-' + a.date);
                const text = [a.employee, a.date, a.status, a.remarks].map(_safeStr).join(' ');
                return _record(id, text, { type: 'attendance', employee: a.employee, date: a.date });
            });
        },

        buildPayrollDocs: function () {
            if (typeof DataManager === 'undefined') return [];
            const adv = DataManager.getData(DataManager.KEYS.ADVANCES) || [];
            return adv.map(function (a, idx) {
                const id = 'adv:' + (a.id || idx);
                const text = [a.employee, a.amount, a.date, a.status, a.remarks].map(_safeStr).join(' ');
                return _record(id, text, { type: 'advance', employee: a.employee });
            });
        },

        buildCustomerDocs: function () {
            if (typeof DataManager === 'undefined') return [];
            const list = DataManager.getData('customers') || DataManager.getData(DataManager.KEYS.CUSTOMERS) || [];
            return (list || []).map(function (c) {
                const id = 'cust:' + (c.id || c.customerId || c.name);
                const text = [c.name, c.customerName, c.city, c.phone, c.email, c.gstin].map(_safeStr).join(' ');
                return _record(id, text, { type: 'customer', name: c.name || c.customerName });
            });
        },

        buildInvoiceDocs: function (limit) {
            limit = limit || 300;
            let list = [];
            if (typeof InvoiceManager !== 'undefined' && InvoiceManager.getInvoices) {
                list = InvoiceManager.getInvoices() || [];
            } else if (typeof DataManager !== 'undefined') {
                list = DataManager.getData(DataManager.KEYS.INVOICES) || [];
            }
            return list.slice(-limit).map(function (inv) {
                const no = inv.invoiceNo || inv.id;
                const id = 'inv:' + no;
                const text = [no, inv.customerName, inv.partyName, inv.date, inv.grandTotal, inv.status].map(_safeStr).join(' ');
                return _record(id, text, { type: 'invoice', invoiceNo: no, customerName: inv.customerName || inv.partyName });
            });
        },

        buildVoucherDocs: function (limit) {
            limit = limit || 300;
            let list = [];
            if (typeof VoucherManager !== 'undefined' && VoucherManager.getVouchers) {
                list = VoucherManager.getVouchers() || [];
            } else if (typeof DataManager !== 'undefined') {
                list = DataManager.getData(DataManager.KEYS.VOUCHERS) || [];
            }
            return list.slice(-limit).map(function (v) {
                const id = 'vch:' + (v.id || v.voucherNo);
                const text = [v.id, v.type, v.customerName, v.partyName, v.amount, v.date].map(_safeStr).join(' ');
                return _record(id, text, { type: 'voucher', voucherId: v.id });
            });
        },

        buildTaskDocs: function () {
            if (typeof DataManager === 'undefined') return [];
            const list = DataManager.getData(DataManager.KEYS.TASKS) || [];
            return list.map(function (t) {
                const id = 'task:' + (t.id || t.taskId);
                const text = [t.partyName, t.narration, t.status, t.type, t.followupDate].map(_safeStr).join(' ');
                return _record(id, text, { type: 'task', partyName: t.partyName });
            });
        },

        buildDocumentDocs: function () {
            const docs = [];
            if (typeof DataManager !== 'undefined') {
                const challans = DataManager.getData(DataManager.KEYS.CHALLANS) || [];
                challans.forEach(function (c) {
                    const id = 'chl:' + (c.id || c.challanNo);
                    docs.push(_record(id, [c.challanNo, c.customerName, c.type, c.date].map(_safeStr).join(' '), { type: 'challan' }));
                });
                const jcs = DataManager.getData('jobcards') || [];
                jcs.forEach(function (jc) {
                    const id = 'jc:' + (jc.id || jc.jobCardNo);
                    docs.push(_record(id, [jc.jobCardNo, jc.customerName, jc.status].map(_safeStr).join(' '), { type: 'jobcard' }));
                });
            }
            return docs;
        },

        indexCollection: async function (collection) {
            if (typeof EmbeddingProvider === 'undefined' || typeof VectorStore === 'undefined') {
                return { ok: false, error: 'RAG modules missing' };
            }

            let docs = [];
            switch (collection) {
                case 'employees': docs = this.buildEmployeeDocs(); break;
                case 'attendance': docs = this.buildAttendanceDocs(); break;
                case 'payroll': docs = this.buildPayrollDocs(); break;
                case 'customers': docs = this.buildCustomerDocs(); break;
                case 'invoices': docs = this.buildInvoiceDocs(); break;
                case 'vouchers': docs = this.buildVoucherDocs(); break;
                case 'tasks': docs = this.buildTaskDocs(); break;
                case 'documents': docs = this.buildDocumentDocs(); break;
                default: return { ok: false, error: 'Unknown collection' };
            }

            const texts = docs.map(function (d) { return d.text; });
            const vectors = await EmbeddingProvider.embedBatch(texts);
            const records = docs.map(function (d, i) {
                return { id: d.id, text: d.text, meta: d.meta, vector: vectors[i] };
            });

            await VectorStore.clear(collection);
            const res = await VectorStore.upsert(collection, records);
            return { ok: true, collection: collection, count: records.length, backend: VectorStore.backend, result: res };
        },

        indexAll: async function () {
            const cols = VectorStore.COLLECTIONS || [];
            const results = [];
            for (let i = 0; i < cols.length; i++) {
                try {
                    results.push(await this.indexCollection(cols[i]));
                } catch (e) {
                    results.push({ ok: false, collection: cols[i], error: e && e.message });
                }
            }
            return { ok: true, results: results };
        },

        reindexForStorageKey: async function (storageKey) {
            const col = this.collectionForKey(storageKey);
            if (!col) return { ok: false, skipped: true };
            return this.indexCollection(col);
        }
    };

    global.DocumentIndexer = DocumentIndexer;
})(typeof window !== 'undefined' ? window : global);
