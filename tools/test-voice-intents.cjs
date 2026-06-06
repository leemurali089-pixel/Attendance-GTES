/** Quick intent parse sanity test (no browser). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
function load(rel) {
    const code = fs.readFileSync(path.join(root, rel), 'utf8');
    eval(code);
}

global.window = global;
load('ai/tamilCommandRegistry.js');
load('ai/contextManager.js');
load('ai/intentEngine.js');

const ContextManager = global.ContextManager;
const IntentEngine = global.IntentEngine;

const cases = [
    ['give me the outstanding of Bhox Air gas', 'customer_outstanding', 'bhox air gas'],
    ['give me the outstanding of Raaj Gases', 'customer_outstanding', 'raaj gases'],
    ['how many employees are absent yesterday', 'absent_employees', null],
    ['give me the latest outstanding of Vega', 'customer_outstanding', 'vega'],
    ['give me the pending amount of vega', 'customer_outstanding', 'vega'],
    ['give me the attendance data od annadurai', 'employee_attendance', 'annadurai'],
    ['what are the things you can do', 'help', null],
    ['what is the recent invoice billed', 'last_invoice', null],
    ['list down the invoices', 'customer_invoice_list', null],
    ['list down the employees', 'list_employees', null],
    ['show all employees', 'list_employees', null],
    ['Annadurai Yesterday attendance Status', 'employee_attendance', 'annadurai'],
    ['last month Anna Durai Salary', 'employee_salary', 'anna durai'],
    ['last invoice billed to Proto-D-Engineering', 'customer_last_invoice', 'proto-d-engineering']
];

let failed = 0;
for (const [text, expectIntent, expectSlot] of cases) {
    ContextManager.clearPendingClarify();
    const r = IntentEngine.parse(text);
    const slot = r.slots.customerName || r.slots.employeeName || null;
    const okIntent = r.intent === expectIntent;
    const okSlot = expectSlot == null || (slot && slot.toLowerCase().includes(expectSlot));
    if (!okIntent || !okSlot) {
        failed++;
        console.error('FAIL:', text);
        console.error('  got', r.intent, r.slots, 'expected', expectIntent, expectSlot);
    } else {
        console.log('OK:', text, '->', r.intent, slot || JSON.stringify(r.slots));
    }
}

ContextManager.setPendingClarify({ intent: 'customer_outstanding', slots: {}, field: 'customer' });
const follow = IntentEngine.parse('bharath oxygen licensee - c');
if (follow.intent !== 'customer_outstanding' || !follow.slots.customerName?.includes('bharath')) {
    failed++;
    console.error('FAIL follow-up:', follow);
} else {
    console.log('OK: follow-up ->', follow.intent, follow.slots.customerName);
}

ContextManager.clearPendingClarify();
ContextManager.set({ lastCustomerName: 'Raaj Gases' });
const invList = IntentEngine.parse('list down the invoices');
if (invList.intent !== 'customer_invoice_list') {
    failed++;
    console.error('FAIL invoice list:', invList);
} else {
    console.log('OK: invoice list ->', invList.intent);
}

ContextManager.setPendingClarify({ intent: 'employee_attendance', slots: {}, field: 'employee' });
const empFollow = IntentEngine.parse('Anna Durai');
if (empFollow.intent !== 'employee_attendance' || !empFollow.slots.employeeName?.toLowerCase().includes('anna')) {
    failed++;
    console.error('FAIL employee follow-up:', empFollow);
} else {
    console.log('OK: employee follow-up ->', empFollow.intent, empFollow.slots.employeeName);
}

ContextManager.setPendingClarify({ intent: 'employee_attendance', slots: {}, field: 'employee' });
const stuckOutstanding = IntentEngine.parse('give me the outstanding of Raaj Gases');
if (stuckOutstanding.intent !== 'customer_outstanding' || !stuckOutstanding.slots.customerName?.includes('raaj')) {
    failed++;
    console.error('FAIL clarify override outstanding:', stuckOutstanding);
} else {
    console.log('OK: clarify cleared for outstanding ->', stuckOutstanding.intent, stuckOutstanding.slots.customerName);
}

ContextManager.setPendingClarify({ intent: 'employee_attendance', slots: {}, field: 'employee' });
const stuckList = IntentEngine.parse('list down the employees');
if (stuckList.intent !== 'list_employees') {
    failed++;
    console.error('FAIL clarify override list employees:', stuckList);
} else {
    console.log('OK: clarify cleared for list employees ->', stuckList.intent);
}

ContextManager.setPendingClarify({
    intent: 'employee_salary',
    slots: {},
    field: 'employee',
    state: 'need_confirm',
    candidates: [{ name: 'Anna Durai', id: 'EMP001' }],
    tentative: { name: 'Anna Durai', id: 'EMP001' }
});
const confirmYes = IntentEngine.parse('yes');
if (confirmYes.intent !== 'employee_salary' || confirmYes.slots.employeeName !== 'Anna Durai') {
    failed++;
    console.error('FAIL employee confirm yes:', confirmYes);
} else {
    console.log('OK: employee confirm yes ->', confirmYes.intent, confirmYes.slots.employeeName);
}

ContextManager.setPendingClarify({
    intent: 'employee_attendance',
    slots: {},
    field: 'employee',
    state: 'need_pick',
    candidates: [{ name: 'Anna Durai', id: 'EMP001' }, { name: 'Anil', id: 'EMP006' }]
});
const pickOne = IntentEngine.parse('1');
if (pickOne.intent !== 'employee_attendance' || pickOne.slots.employeeName !== 'Anna Durai') {
    failed++;
    console.error('FAIL employee pick 1:', pickOne);
} else {
    console.log('OK: employee pick 1 ->', pickOne.intent, pickOne.slots.employeeName);
}

ContextManager.clearPendingClarify();
const empDetails = IntentEngine.parse('employee details of Anna Durai');
if (empDetails.intent !== 'employee_details' || !empDetails.slots.employeeName?.toLowerCase().includes('anna')) {
    failed++;
    console.error('FAIL employee details:', empDetails);
} else {
    console.log('OK: employee details ->', empDetails.intent, empDetails.slots.employeeName);
}

const showEmp = IntentEngine.parse('show employee Murali');
if (showEmp.intent !== 'employee_details' || !showEmp.slots.employeeName?.toLowerCase().includes('murali')) {
    failed++;
    console.error('FAIL show employee:', showEmp);
} else {
    console.log('OK: show employee ->', showEmp.intent, showEmp.slots.employeeName);
}

process.exit(failed ? 1 : 0);
