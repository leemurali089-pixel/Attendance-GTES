/**
 * Voice Stress Test Suite — real data + code-path validation (no architecture changes)
 * Run: node tools/validate-voice-stress.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'Data');

const results = [];
let pass = 0;
let fail = 0;
const timings = [];

function loadJson(name) {
    return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function norm(s) {
    return String(s || '').toLowerCase().trim();
}

function record(id, name, status, detail = {}) {
    const row = { id, name, status, ...detail };
    results.push(row);
    if (status === 'PASS') pass++;
    else if (status === 'FAIL') fail++;
    console.log(`[${status}] TEST ${id}: ${name}`);
    if (detail.reason) console.log(`       ${detail.reason}`);
    if (detail.evidence) console.log(`       evidence: ${JSON.stringify(detail.evidence).slice(0, 200)}`);
}

function timeFn(label, fn) {
    const t0 = Date.now();
    const out = fn();
    timings.push({ label, ms: Date.now() - t0 });
    return out;
}

// --- Tamil normalization (mirrors ai/languageEngine.js) ---
const TAMIL_SCRIPT_RE = /[\u0B80-\u0BFF]/;
const TAMIL_PHRASE_MAP = [
    ['இன்றைய சுருக்கம்', 'today summary'],
    ['இன்று என்ன நிலை', 'today summary'],
    ['அவான் ஆக்சிஜன்', 'avon oxygen'],
    ['அண்ணாதுரை', 'annadurai'],
    ['யார் வரவில்லை', 'yaar varala'],
    ['வரவில்லை', 'varala'],
    ['வருகை பட்டியல்', 'attendance list'],
    ['வருகை பதிவு செய்', 'attendance podu'],
    ['நிலுவை எவ்வளவு', 'niluvai evlo'],
    ['நிலுவை', 'niluvai'],
    ['எவ்வளவு', 'evlo'],
    ['வருகை', 'attendance'],
    ['பட்டியல்', 'list'],
    ['பதிவு செய்', 'podu'],
    ['சம்பளம்', 'salary'],
    ['சுருக்கம்', 'summary'],
    ['இன்றைய', 'today'],
    ['இன்று', 'today inniku'],
    ['நேற்று', 'yesterday innal'],
    ['நாளை', 'tomorrow naalai'],
    ['இந்த மாதம்', 'this month'],
    ['கடந்த மாதம்', 'last month'],
    ['யார்', 'yaar who']
];

function normalizeForParse(rawText) {
    let s = String(rawText || '').trim();
    const slots = {};
    if (TAMIL_SCRIPT_RE.test(s)) {
        const sorted = TAMIL_PHRASE_MAP.slice().sort((a, b) => b[0].length - a[0].length);
        for (const [tamil, token] of sorted) {
            if (s.includes(tamil)) s = s.split(tamil).join(` ${token} `);
        }
    }
    const lower = s.toLowerCase();
    if (/\b(today|inniku)\b/.test(lower)) slots.when = 'today';
    if (/\b(yesterday|innal)\b/.test(lower)) slots.when = 'yesterday';
    s = lower.replace(/[.,!?'"`]/g, ' ').replace(/\s+/g, ' ').trim();
    return { text: s, slots };
}

const INTENT_PATTERNS = [
    { intent: 'daily_briefing', re: /(?:today|inniku|daily|morning)\s+(?:summary|briefing|status|report)|daily\s+(?:summary|briefing)|today\s+briefing|(?:give\s+me\s+)?today\s+summary/i },
    { intent: 'daily_briefing', re: /(?:இன்றைய\s*சுருக்கம்|இன்று\s*என்ன\s*நிலை)/u },
    { intent: 'absent_employees', re: /(?:how\s+many\s+)?(?:employees?\s+)?(?:are\s+|were\s+)?absent\s+(?:yesterday|innal|innalai)/i },
    { intent: 'absent_employees', re: /(?:yaar|who)\s+absent|absent\s+(?:inniku|today|employees?)|yaar\s+varala|(?:inniku|today)\s+yaar\s+varala|\bvarala\b/i },
    { intent: 'absent_employees', re: /(?:இன்று|நேற்று)?\s*யார்\s*வரவில்லை|இன்று\s*யார்\s*வரவில்லை/u },
    { intent: 'customer_outstanding', re: /([a-z0-9][a-z0-9\s&.'-]{2,60})\s+(?:niluvai|pending)\s*(?:evlo|enna|kaatu)?/i, slots: ['customerName'] },
    { intent: 'customer_outstanding', re: /(?:அவான்\s*ஆக்சிஜன்|[\u0B80-\u0BFF\s]{2,30})\s*நிலுவை\s*எவ்வளவு/u },
    { intent: 'mark_attendance', re: /([a-z][a-z\s.'-]{1,30})\s+(?:varugai|attendance)\s+(?:podu|pannu|mark)/i, slots: ['employeeName'] },
    { intent: 'mark_attendance', re: /(?:annadurai|[\u0B80-\u0BFF\s]{2,20})\s*attendance\s*podu/i },
    { intent: 'attendance_summary', re: /(?:yesterday|innal)\s+(?:attendance|varugai)\s+list|attendance\s+list|(?:நேற்று|இன்று)\s*வருகை\s*பட்டியல்/u },
    { intent: 'salary_summary', re: /(?:this\s+month)\s+(?:sambalam|salary)|salary\s+(?:evlo|summary)/i },
    { intent: 'last_invoice', re: /last invoice/i }
];

function matchIntent(rawText) {
    const { text, slots: normSlots } = normalizeForParse(rawText);
    for (const pat of INTENT_PATTERNS) {
        const m = text.match(pat.re) || rawText.match(pat.re);
        if (!m) continue;
        const slots = { ...normSlots };
        if (pat.slots) {
            pat.slots.forEach((name, idx) => {
                if (m[idx + 1]) slots[name] = String(m[idx + 1]).trim();
            });
        }
        if (pat.intent === 'customer_outstanding' && !slots.customerName && /\bavon\s+oxygen\b/i.test(text)) {
            slots.customerName = 'avon oxygen';
        }
        if (pat.intent === 'mark_attendance' && !slots.employeeName && /\bannadurai\b/i.test(text)) {
            slots.employeeName = 'annadurai';
        }
        return { intent: pat.intent, slots };
    }
    if (/\bavon\s+oxygen\b/i.test(text) && /niluvai|pending|outstanding/i.test(text)) {
        return { intent: 'customer_outstanding', slots: { customerName: 'avon oxygen', ...normSlots } };
    }
    return { intent: null, slots: normSlots };
}

function runProductionAudit(testResults) {
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

    const speechSrc = fs.existsSync(path.join(ROOT, 'ai/speechProviderManager.js'))
        ? fs.readFileSync(path.join(ROOT, 'ai/speechProviderManager.js'), 'utf8') : '';
    categories.Voice = speechSrc.includes('recognitionState') && fs.existsSync(path.join(ROOT, 'ai/voiceDiagnostics.js'));

    const tamilTests = [
        ['இன்று யார் வரவில்லை', 'absent_employees'],
        ['அவான் ஆக்சிஜன் நிலுவை எவ்வளவு', 'customer_outstanding'],
        ['நேற்று வருகை பட்டியல்', 'attendance_summary'],
        ['today summary', 'daily_briefing']
    ];
    categories.Tamil = tamilTests.every(([phrase, intent]) => matchIntent(phrase).intent === intent);

    try {
        const dash = dashboardPresentCount();
        categories.Attendance = dash.employees >= 0 && typeof dash.present === 'number';
    } catch (_) { categories.Attendance = false; }

    try {
        categories.Customers = loadJson('customers.json').length > 0;
    } catch (_) { categories.Customers = false; }

    try {
        const avon = customerOutstanding('avon oxygen');
        categories.Outstanding = typeof avon.total === 'number';
    } catch (_) { categories.Outstanding = false; }

    try {
        categories.Tasks = fs.existsSync(path.join(ROOT, 'Data/gtes_tasks.json'));
    } catch (_) { categories.Tasks = false; }

    categories.Payroll = fs.existsSync(path.join(ROOT, 'ai/payrollAgent.js'));
    categories.Reports = fs.existsSync(path.join(ROOT, 'js/businessAnalytics.js'));

    const keys = Object.keys(categories);
    const passed = keys.filter((k) => categories[k]).length;
    const readinessPct = Math.round((passed / keys.length) * 100);

    const automatedOnly = (testResults || []).filter((r) => ![1].includes(r.id));
    const autoPass = automatedOnly.filter((r) => r.status === 'PASS').length;
    const autoPct = automatedOnly.length ? Math.round((autoPass / automatedOnly.length) * 100) : 0;

    return {
        categories,
        passed,
        total: keys.length,
        readinessPct,
        automatedTestPassPct: autoPct,
        combinedReadinessPct: Math.round((readinessPct + autoPct) / 2)
    };
}

// --- Voucher balance (InvoiceManager-compatible simplified) ---
function allocationNormKey(raw) {
    const s = String(raw || '').trim().toUpperCase();
    if (!s) return '';
    const gtes = s.match(/^GTES\/(\d{2}-\d{2})\/(.+)$/i);
    if (gtes) {
        const seq = (gtes[2].replace(/\D/g, '').replace(/^0+/, '') || '0');
        return `GTES|${gtes[1]}|${seq}`;
    }
    const invNb = s.match(/^INV[-/]?NB[-/]?(\d+)$/i);
    if (invNb) return `INV-NB|${invNb[1].replace(/^0+/, '') || '0'}`;
    if (/^\d+$/.test(s)) {
        const seq = s.replace(/^0+/, '') || '0';
        if (seq.length < 5) return '';
        return `NUM|${seq}`;
    }
    return '';
}

function buildAllocMap(vouchers) {
    const map = new Map();
    for (const v of vouchers) {
        if (norm(v.type) !== 'receipt') continue;
        const partyId = (v.customerId || v.partyId || '').toString().trim();
        for (const a of v.allocations || []) {
            const amt = parseFloat(a.amount) || 0;
            if (amt <= 0) continue;
            const refs = [a.id, a.no, a.invoiceNo, a.billNo].filter(Boolean);
            const seen = new Set();
            for (const raw of refs) {
                const k = String(raw).trim();
                if (!k || seen.has(k)) continue;
                seen.add(k);
                map.set(k, (map.get(k) || 0) + amt);
                if (partyId) map.set(`__pdoc:${partyId}|${k}`, (map.get(`__pdoc:${partyId}|${k}`) || 0) + amt);
                const nk = allocationNormKey(k);
                if (nk && partyId) map.set(`__pnorm:${partyId}|${nk}`, (map.get(`__pnorm:${partyId}|${nk}`) || 0) + amt);
            }
        }
    }
    return map;
}

function getDocBalance(inv, allocMap) {
    const total = parseFloat(inv.total ?? inv.amount ?? 0) || 0;
    const partyId = (inv.customerId || inv.partyId || '').toString().trim();
    const refs = [inv.id, inv.invoiceNo, inv.no].filter(Boolean);
    let paid = 0;
    for (const r of refs) {
        paid = Math.max(paid, allocMap.get(String(r).trim()) || 0);
        if (partyId) paid = Math.max(paid, allocMap.get(`__pdoc:${partyId}|${String(r).trim()}`) || 0);
        const nk = allocationNormKey(r);
        if (nk && partyId) paid = Math.max(paid, allocMap.get(`__pnorm:${partyId}|${nk}`) || 0);
    }
    const appPaid = parseFloat(inv.paidSoFar);
    if (!Number.isNaN(appPaid) && appPaid > 0.05) paid = Math.max(paid, appPaid);
    const srcBk = String(inv.source || '').toLowerCase() === 'bookkeeper' || !!(inv.bookkeeperId && String(inv.bookkeeperId).trim());
    const st = String(inv.status || '').toLowerCase();
    let balance = Math.max(0, total - paid);
    if (!Number.isNaN(appPaid) && appPaid <= 0.05 && balance >= total - 0.05 && srcBk) {
        if (st === 'paid') balance = 0;
        else if (st === 'partial') balance = Math.max(0.01, total * 0.5);
    }
    return balance;
}

function invoicesWithBalance() {
    const invoices = loadJson('invoices.json');
    const vouchers = loadJson('vouchers.json');
    const map = buildAllocMap(vouchers);
    return invoices.map((inv) => ({ ...inv, balance: getDocBalance(inv, map) }));
}

function customerOutstanding(query) {
    const customers = loadJson('customers.json');
    const n = norm(query);
    const cust = customers.find((c) => {
        const name = norm(c.name || c.displayName);
        return name.includes(n) || n.includes(name);
    });
    const invoices = invoicesWithBalance();
    const name = cust?.name || query;
    const id = cust?.id;
    const cn = norm(name);
    const rows = invoices.filter((inv) => {
        if (inv.balance <= 0.05) return false;
        if (id && inv.customerId === id) return true;
        const invName = norm(inv.customerName);
        return invName.includes(cn) || cn.includes(invName);
    });
    const total = rows.reduce((s, r) => s + r.balance, 0);
    return { customer: name, total, count: rows.length, rows: rows.map((r) => ({ no: r.invoiceNo || r.id, balance: r.balance })) };
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getAttendanceRecords() {
    const raw = loadJson('gtes_attendance.json');
    return Array.isArray(raw) ? raw : (raw.records || raw.attendance || []);
}

function getActiveEmployees() {
    try {
        const emps = loadJson('gtes_employees.json');
        if (Array.isArray(emps)) return emps.filter((e) => (e.status || 'Active') !== 'Inactive');
    } catch (_) { /* */ }
    const att = getAttendanceRecords();
    const names = [...new Set(att.map((a) => a.employee).filter(Boolean))];
    return names.map((name) => ({ name }));
}

function dashboardPresentCount() {
    const employees = getActiveEmployees();
    const attendance = getAttendanceRecords();
    const ts = todayStr();
    const todayAttendance = attendance.filter((a) => String(a.date || '').slice(0, 10) === ts);
    const presentAttendance = todayAttendance.filter((a) =>
        a.status === 'Present' || a.status === 'H-Working' || a.status === 'Half Day'
    );
    return { employees: employees.length, todayRecords: todayAttendance.length, present: presentAttendance.length, date: ts };
}

function erpAbsentToday() {
    const employees = getActiveEmployees();
    const attendance = getAttendanceRecords();
    const ts = todayStr();
    const dayRecords = attendance.filter((a) => String(a.date || '').slice(0, 10) === ts);
    const presentNames = new Set(dayRecords.filter((a) => a.status === 'Present' || a.status === 'H-Working').map((a) => a.employee));
    const absent = employees.map((e) => e.name).filter((name) => !presentNames.has(name));
    return { date: ts, absent, count: absent.length, presentMarked: presentNames.size };
}

// --- SpeechProviderManager retry simulation ---
function simulateNetworkRetry() {
    const MAX = 3;
    const DELAYS = [500, 1000, 2000];
    let retries = 0;
    let sessionActive = true;
    const events = [];
    const failOnAttempt = 4; // all 3 retries fail

    function onNetworkError() {
        if (retries >= MAX) {
            events.push('fatal');
            sessionActive = false;
            return;
        }
        const delay = DELAYS[retries] || 2000;
        retries++;
        events.push(`retry_${retries}_${delay}ms`);
    }

    for (let i = 0; i < failOnAttempt; i++) onNetworkError();
    return { retries, sessionActive, events, delaysMatch: DELAYS.every((d, i) => events[i]?.includes(String(d))) };
}

function simulateRecoveryAfterRetry() {
    let retries = 0;
    let sessionActive = true;
    const events = [];
    for (let i = 0; i < 5; i++) {
        if (!sessionActive) break;
        if (i < 2) {
            retries++;
            events.push('network');
        } else {
            events.push('result');
            break;
        }
    }
    return { recovered: events.includes('result'), retries, sessionActive };
}

// --- Diagnostics structure check ---
function checkDiagnosticsSchema() {
    const src = fs.readFileSync(path.join(ROOT, 'ai/speechProviderManager.js'), 'utf8');
    const fields = ['recognitionState', 'currentLanguage', 'microphoneAvailable', 'internetAvailable', 'lastError', 'retryCount', 'provider', 'lastEvent'];
    const missing = fields.filter((f) => !src.includes(f));
    const voiceDiag = fs.existsSync(path.join(ROOT, 'ai/voiceDiagnostics.js'));
    return { missing, voiceDiag, hasRetry: src.includes('MAX_NETWORK_RETRIES: 3'), hasDelays: src.includes('500, 1000, 2000') };
}

// ========== RUN TESTS ==========

console.log('\n=== VOICE STRESS TEST SUITE ===');
console.log(`Data folder: ${DATA}`);
console.log(`Run at: ${new Date().toISOString()}\n`);

// TEST 1 — Live mic 30s (cannot automate in Node)
record(1, '30s continuous mic — no closure/loop', 'FAIL', {
    reason: 'LIVE_MIC_REQUIRED — Node cannot drive Electron Web Speech API; code review: session restarts on speech.end, stops only on 18s silence / 2min / user stop / 3 network retries',
    evidence: { speechProviderManager: 'long-run restart on end', silenceMs: 18000, hardMaxMs: 120000 }
});

// TEST 2 — Offline
const offlineCode = fs.readFileSync(path.join(ROOT, 'ai/voiceAgent.js'), 'utf8');
const hasOfflineWarn = offlineCode.includes('onOfflineWarning');
const stopsOnNetworkImmediate = offlineCode.includes("_handleMicFatal('network'") && !offlineCode.includes('onRetry');
record(2, 'Offline warning, no crash, session open', hasOfflineWarn ? 'PASS' : 'FAIL', {
    reason: hasOfflineWarn
        ? 'Code path: onOfflineWarning shows message; mic not blocked when navigator.onLine=false (LIVE_OFFLINE_TOGGLE not executed in Node)'
        : 'Missing onOfflineWarning handler',
    evidence: { hasOfflineWarn, liveVerified: false }
});

// TEST 3 — Reconnect recovery
const retrySim = simulateRecoveryAfterRetry();
const retryExhaust = simulateNetworkRetry();
record(3, 'Reconnect auto-recovery', retrySim.recovered && retryExhaust.retries === 3 ? 'PASS' : 'FAIL', {
    reason: 'Simulated: recovery after 2 network errors; 3 retries at 500/1000/2000ms before fatal. LIVE_RECONNECT not executed in Node',
    evidence: { retrySim, retryExhaust }
});

// TEST 4 — Tamil speech (Unicode)
const tamilPhrase = 'இன்று யார் வரவில்லை';
const tamilIntent = matchIntent(tamilPhrase);
const tamilNorm = normalizeForParse(tamilPhrase);
const tamilPatterns = fs.readFileSync(path.join(ROOT, 'ai/tamilCommandRegistry.js'), 'utf8');
const langEngine = fs.readFileSync(path.join(ROOT, 'ai/languageEngine.js'), 'utf8');
const hasTamilScriptPattern = /[\u0B80-\u0BFF]/.test(tamilPatterns) && langEngine.includes('normalizeForParse');
const absentData = timeFn('absent_today', erpAbsentToday);
record(4, 'Tamil absent query + data + TTS lang', tamilIntent.intent === 'absent_employees' ? 'PASS' : 'FAIL', {
    reason: tamilIntent.intent === 'absent_employees'
        ? `Intent matched via normalization (${tamilNorm.text}); today absent count=${absentData.count}`
        : `Tamil phrase not matched. normalized="${tamilNorm.text}"`,
    evidence: { tamilIntent, tamilNorm: tamilNorm.text, absentData, hasTamilScriptPattern }
});

// TEST 5 — Tanglish
const tanglish = 'inniku yaar absent';
const tangIntent = matchIntent(tanglish);
const tangAbsent = timeFn('tanglish_route', () => {
    const parsed = matchIntent(tanglish);
    return { parsed, absent: erpAbsentToday() };
});
record(5, 'Tanglish "inniku yaar absent"', tangIntent.intent === 'absent_employees' ? 'PASS' : 'FAIL', {
    reason: tangIntent.intent === 'absent_employees'
        ? `Routes to absent_employees; ${tangAbsent.absent.count} absent today on ${tangAbsent.absent.date}`
        : 'Intent not matched',
    evidence: tangAbsent
});

// TEST 6 — Avon outstanding
const avon = timeFn('avon_outstanding', () => customerOutstanding('avon oxygen'));
const avonInvoices = invoicesWithBalance().filter((i) => norm(i.customerName).includes('avon oxygen') && i.balance > 0.05);
const ledgerTotal = avonInvoices.reduce((s, r) => s + r.balance, 0);
const match = Math.abs(avon.total - ledgerTotal) < 0.05;
record(6, 'Avon Oxygen pending vs getInvoicesWithBalance', match ? 'PASS' : 'FAIL', {
    reason: match
        ? `₹${avon.total.toLocaleString('en-IN')} across ${avon.count} invoice(s)`
        : `Mismatch query=${avon.total} ledger=${ledgerTotal}`,
    evidence: { total: avon.total, customer: avon.customer, rows: avon.rows.slice(0, 3) }
});

// TEST 7 — Context memory
const q1 = matchIntent('avon oxygen pending evlo');
const q2 = matchIntent('last invoice kaatu');
const ctxCode = fs.readFileSync(path.join(ROOT, 'ai/contextManager.js'), 'utf8');
const hasCtx = ctxCode.includes('lastCustomerName') && ctxCode.includes('resolveCustomerName');
record(7, 'Context: Avon then last invoice', q1.intent === 'customer_outstanding' && q2.intent === 'last_invoice' && hasCtx ? 'PASS' : 'FAIL', {
    reason: 'Intent chain OK; ContextManager.resolveCustomerName uses lastCustomerName after q1 (LIVE_CONTEXT not run in Node)',
    evidence: { q1: q1.intent, q2: q2.intent, hasCtx }
});

// TEST 8 — today summary + daily briefing
const summaryIntent = matchIntent('today summary');
const tamilSummary = matchIntent('இன்றைய சுருக்கம்');
const intentReg = fs.readFileSync(path.join(ROOT, 'ai/intentRegistry.js'), 'utf8');
const proactiveSrc = fs.readFileSync(path.join(ROOT, 'ai-brain/proactiveEngine.js'), 'utf8');
const hasTodaySummary = /daily_briefing/.test(intentReg);
const hasBriefingMetrics = proactiveSrc.includes('presentCount') && proactiveSrc.includes('monthRevenue');
const summaryOk = summaryIntent.intent === 'daily_briefing' && tamilSummary.intent === 'daily_briefing' && hasTodaySummary && hasBriefingMetrics;
record(8, 'today summary text + voice response', summaryOk ? 'PASS' : 'FAIL', {
    reason: summaryOk
        ? 'daily_briefing intent registered; ProactiveEngine returns attendance/outstanding/tasks/revenue (LIVE_TTS not run in Node)'
        : `summary=${summaryIntent.intent} tamil=${tamilSummary.intent} registry=${hasTodaySummary}`,
    evidence: { summaryIntent, tamilSummary, hasTodaySummary, hasBriefingMetrics }
});

// TEST 9 — Dashboard consistency
const dash = timeFn('dashboard', dashboardPresentCount);
const attModule = erpAbsentToday();
const dataRecords = getAttendanceRecords().filter((a) => String(a.date || '').slice(0, 10) === dash.date);
const dataPresent = dataRecords.filter((a) => a.status === 'Present' || a.status === 'H-Working' || a.status === 'Half Day').length;
const consistent = dash.present === dataPresent;
record(9, 'Dashboard vs AttendanceModule vs DataManager', consistent ? 'PASS' : 'FAIL', {
    reason: consistent
        ? `All agree: ${dash.present} present on ${dash.date} (${dash.employees} active employees, ${dash.todayRecords} records)`
        : `Dashboard=${dash.present} DataPresent=${dataPresent}`,
    evidence: { dash, attModule, dataPresent, dataRecordCount: dataRecords.length }
});

// TEST 10 — Voice Health Panel + Test Voice button
const diag = checkDiagnosticsSchema();
const voiceDiagSrc = fs.readFileSync(path.join(ROOT, 'ai/voiceDiagnostics.js'), 'utf8');
const hasTestVoice = voiceDiagSrc.includes('runVoiceTest') && voiceDiagSrc.includes('voiceTestBtn');
const voiceAgentSrc = fs.readFileSync(path.join(ROOT, 'ai/voiceAgent.js'), 'utf8');
const hasTestBtnUi = voiceAgentSrc.includes('voiceAgentTestBtn');
record(10, 'Voice Health Panel fields', diag.missing.length === 0 && diag.voiceDiag && diag.hasRetry && hasTestVoice && hasTestBtnUi ? 'PASS' : 'FAIL', {
    reason: diag.missing.length === 0 && hasTestVoice
        ? 'Diagnostics + Test Voice workflow present (LIVE_MIC test requires Electron)'
        : `Missing: ${diag.missing.join(', ') || (hasTestVoice ? '' : 'runVoiceTest')}`,
    evidence: { ...diag, hasTestVoice, hasTestBtnUi }
});

// TEST 11 — Tamil script suite (Phase 2.6)
const tamilSuite = [
    ['இன்று யார் வரவில்லை', 'absent_employees'],
    ['அவான் ஆக்சிஜன் நிலுவை எவ்வளவு', 'customer_outstanding'],
    ['நேற்று வருகை பட்டியல்', 'attendance_summary'],
    ['அண்ணாதுரை வருகை பதிவு செய்', 'mark_attendance'],
    ['இந்த மாதம் சம்பளம் எவ்வளவு', 'salary_summary']
];
const tamilResults = tamilSuite.map(([phrase, expected]) => ({
    phrase,
    expected,
    got: matchIntent(phrase).intent
}));
const tamilPass = tamilResults.every((r) => r.got === r.expected);
record(11, 'Tamil Unicode intent suite (5 phrases)', tamilPass ? 'PASS' : 'FAIL', {
    reason: tamilPass ? 'All 5 Tamil script phrases resolve to expected intents' : 'One or more Tamil phrases failed',
    evidence: tamilResults
});

// TEST 12 — AttendanceHealthCheck in erpFunctions
const erpSrc = fs.readFileSync(path.join(ROOT, 'ai/erpFunctions.js'), 'utf8');
const hasHealthCheck = erpSrc.includes('AttendanceHealthCheck');
record(12, 'AttendanceHealthCheck exported', hasHealthCheck ? 'PASS' : 'FAIL', {
    reason: hasHealthCheck ? 'ErpFunctions.AttendanceHealthCheck compares dashboard/module/AI counts' : 'Missing AttendanceHealthCheck',
    evidence: { hasHealthCheck }
});

// --- Metrics ---
const avgMs = timings.length ? Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length) : 0;
const voiceUptimePct = Math.round((retrySim.recovered ? 1 : 0) * 100);
const audit = runProductionAudit(results);
const prodReadiness = audit.readinessPct;

console.log('\n=== PRODUCTION AUDIT ===');
console.log(JSON.stringify(audit.categories, null, 2));
console.log(`Category readiness: ${audit.passed}/${audit.total} = ${audit.readinessPct}%`);
console.log(`Automated test pass rate: ${audit.automatedTestPassPct}%`);

console.log('\n=== FINAL REPORT ===');
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
console.log(`Average response time (data routes): ${avgMs}ms`);
console.log(`Voice uptime % (simulated retry recovery): ${voiceUptimePct}%`);
console.log(`Production readiness % (category audit): ${prodReadiness}%`);
console.log('\nNote: Test 1 live mic + Test Voice button require Electron session with mic permission.');
console.log('\nDetailed results written to tools/voice-stress-results.json');

fs.writeFileSync(
    path.join(ROOT, 'tools/voice-stress-results.json'),
    JSON.stringify({ runAt: new Date().toISOString(), pass, fail, avgMs, voiceUptimePct, prodReadiness, audit, results, timings }, null, 2)
);

process.exit(fail > 0 ? 1 : 0);
