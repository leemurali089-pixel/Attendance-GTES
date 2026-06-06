/**
 * Intent registry — maps intent IDs to agent handlers and required slots.
 */
const IntentRegistry = {
    intents: {
        mark_attendance: { agent: 'attendance', handler: 'markAttendance', required: ['employeeName'], destructive: false },
        mark_leave: { agent: 'attendance', handler: 'markLeave', required: ['employeeName'], destructive: false },
        absent_employees: { agent: 'attendance', handler: 'getAbsentToday', required: [], destructive: false },
        attendance_summary: { agent: 'attendance', handler: 'getMonthlySummary', required: [], destructive: false },

        customer_outstanding: { agent: 'customer', handler: 'getOutstanding', required: [], destructive: false },
        customer_last_invoice: { agent: 'customer', handler: 'getLastInvoice', required: ['customerName'], destructive: false },
        last_invoice: { agent: 'customer', handler: 'getLastInvoice', required: [], destructive: false },
        customer_invoice_list: { agent: 'customer', handler: 'getInvoiceList', required: [], destructive: false },
        customer_search: { agent: 'customer', handler: 'searchCustomer', required: ['customerName'], destructive: false },

        list_employees: { agent: 'employee', handler: 'listEmployees', required: [], destructive: false },

        employee_ot: { agent: 'employee', handler: 'getOtHours', required: ['employeeName'], destructive: false },
        employee_salary: { agent: 'employee', handler: 'getSalaryInfo', required: ['employeeName'], destructive: false },
        employee_attendance: { agent: 'employee', handler: 'getAttendanceSummary', required: ['employeeName'], destructive: false },
        employee_details: { agent: 'employee', handler: 'getEmployeeDetails', required: [], destructive: false },

        generate_salary: { agent: 'payroll', handler: 'generateSalary', required: [], destructive: false },
        salary_summary: { agent: 'payroll', handler: 'getSalarySummary', required: [], destructive: false },

        create_task: { agent: 'task', handler: 'createTask', required: [], destructive: false },
        complete_task: { agent: 'task', handler: 'completeTask', required: [], destructive: false },
        pending_tasks: { agent: 'task', handler: 'getPendingTasks', required: [], destructive: false },

        create_invoice: { agent: 'document', handler: 'createInvoice', required: [], destructive: false },
        create_quotation: { agent: 'document', handler: 'createQuotation', required: [], destructive: false },
        create_proforma: { agent: 'document', handler: 'createProforma', required: [], destructive: false },
        create_delivery_challan: { agent: 'document', handler: 'createDeliveryChallan', required: [], destructive: false },
        create_job_card: { agent: 'document', handler: 'createJobCard', required: [], destructive: false },

        navigate: { agent: 'erp', handler: 'navigate', required: ['target'], destructive: false },
        help: { agent: 'erp', handler: 'getHelp', required: [], destructive: false },

        delete_invoice: { agent: 'document', handler: 'deleteInvoice', required: [], destructive: true, confirm: 'Delete this invoice?' },
        delete_task: { agent: 'task', handler: 'deleteTask', required: [], destructive: true, confirm: 'Delete this task?' },
        delete_attendance: { agent: 'attendance', handler: 'deleteAttendance', required: ['employeeName'], destructive: true, confirm: 'Delete attendance record?' }
    },

    get(intent) {
        return this.intents[intent] || null;
    },

    isDestructive(intent) {
        return !!this.intents[intent]?.destructive;
    }
};

window.IntentRegistry = IntentRegistry;
