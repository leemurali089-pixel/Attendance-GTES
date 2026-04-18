// Lightweight classification rules run in main process during sync.
// Returns flags + extracted hints; never auto-posts anything financial.

// Strong bank senders: email domain is unambiguously a bank or card issuer.
// A mail from any of these is treated as bank-related if it also contains
// a transaction keyword (credited / debited / UPI / etc.) OR an amount.
const BANK_SENDERS = [
    // Indian private banks
    /@hdfcbank\.(?:net|com)$/i,
    /@(?:alerts\.)?icicibank\.com$/i,
    /@(?:alerts\.)?axisbank\.com$/i,
    /@kotak\.com$/i,
    /@yesbank\.in$/i,
    /@idfcfirstbank\.com$/i,
    /@rblbank\.com$/i,
    /@indusind\.com$/i,
    /@federalbank\.co\.in$/i,
    /@csb\.co\.in$/i,
    /@dcbbank\.com$/i,
    /@tmbnet\.in$/i,
    /@bandhanbank\.com$/i,
    /@sibernating\.com$/i,
    /@southindianbank\.com$/i,
    /@karnatakabank\.com$/i,
    // Indian public-sector banks
    /@sbi\.co\.in$/i, /@onlinesbi\.com$/i, /@alerts\.sbi$/i, /alert.*@sbi/i,
    /@pnb\.co\.in$/i, /@pnbindia\.in$/i,
    /@canarabank\.com$/i, /@canarabank\.co\.in$/i,
    /@bankofbaroda\.(?:co\.in|com)$/i,
    /@bankofindia\.co\.in$/i,
    /@unionbankofindia\.com$/i, /@unionbankofindia\.co\.in$/i,
    /@idbi\.co\.in$/i, /@idbibank\.co\.in$/i,
    /@centralbankofindia\.co\.in$/i,
    /@ucobank\.(?:co\.in|com)$/i,
    /@indianbank\.(?:co\.in|net\.in|in)$/i,
    /@iobnet\.co\.in$/i,   // Indian Overseas Bank
    /@bankofmaharashtra\.in$/i,
    /@psb\.co\.in$/i,      // Punjab & Sind Bank
    // Foreign / multinational banks operating in India
    /@citi\.com$/i, /@citibank\.com$/i,
    /@(?:sc|standardchartered)\.com$/i,
    /@hsbc\.co\.in$/i, /@hsbc\.com$/i,
    /@dbs\.com$/i,
    /@db\.com$/i,          // Deutsche Bank
    /@americanexpress\.com$/i, /@aexp\.com$/i,
    // Co-operative / small finance
    /@equitasbank\.com$/i, /@suryodaybank\.com$/i, /@aubank\.in$/i,
    /@esafsfb\.com$/i, /@ujjivansfb\.in$/i, /@jbank\.co\.in$/i,
    // Payment services (alerts for UPI / wallet credits+debits)
    /@paytm\.com$/i, /@paytmbank\.com$/i,
    /@phonepe\.com$/i,
    /@google\.com$/i,      // Google Pay uses google.com (weak — rules below will still require txn keyword)
    /@googlepay\.com$/i,
    /@amazonpay\.in$/i, /@amazon\.in$/i,
    /@razorpay\.com$/i,
    /@cashfree\.com$/i,
    /@payu\.in$/i, /@payumoney\.com$/i,
    /@mobikwik\.com$/i,
    /@freecharge\.com$/i,
    /@juspay\.in$/i,
];

// Weaker sender hints: email address or local-part looks like an alert
// mailbox. These do NOT on their own flag a mail as bank — they only count
// if the body *also* contains a transaction keyword AND an amount.
const BANK_SENDER_HINTS = [
    /(?:^|<|\s)(?:alerts?|noreply|no-reply|donotreply|notifications?|statements?|transactions?|txn|banking|card)[\w.+-]*@/i,
    /@(?:alerts?|noreply|notifications?|bank|card|statement|txn)[\w.-]*\./i,
];

// Strong subject signals: an explicit mention of a Purchase Order.
// NOTE: we deliberately do NOT match "Order ID" / "Order No" on its own,
// otherwise every Amazon/Flipkart/smartwatch replacement email gets flagged.
const PO_SUBJECT_PATTERNS = [
    /\bpurchase\s*order\b/i,                          // "purchase order"
    /\bP\.?\s*O\.?\s*(?:No\.?|Number|Ref\.?|#)\b/i,   // "PO No", "P.O. Number", "PO#"
    /\bPO[\s#\-]*\d{3,}\b/i,                           // "PO 12345", "PO-12345", "PO#12345"
    /\brelease\s*(?:of|the)\s*purchase\s*order\b/i    // "Release of Purchase Order"
];

// Strong attachment signals: filename must *explicitly* indicate a PO,
// not merely contain the letters P-O somewhere.
const PO_ATTACHMENT_PATTERNS = [
    /\bpurchase[-_\s]?order\b/i,                       // "Purchase_Order.pdf"
    /^po[-_\s#]?\d{3,}/i,                              // "po-12345.pdf", "po12345.pdf"
    /[-_\s]PO[-_\s#]?\d{3,}/i                          // "Vendor_PO_12345.pdf"
];

// Subjects that strongly suggest the mail is NOT a purchase order,
// even if it happens to mention "PO" somewhere (e.g. Amazon replacements,
// quotations, price lists, payment reminders referencing an old PO).
const PO_NEGATIVE_SUBJECT = [
    /\border\s*id\b/i,                                 // "Order ID: 408-..."
    /\b(?:amazon|flipkart|myntra|ajio|meesho|shopify)\b/i,
    /\b(?:quote|quotation|offer|proposal|enquiry|inquiry|enquire)\b/i,
    /\b(?:payment|balance|follow[-\s]?up|reminder|settlement)\b/i
];

const NEWSLETTER_HINTS = [
    'list-unsubscribe', 'precedence: bulk', 'precedence: list'
];

// Extract amount hints from body text for bank mails.
// Handles INR formats: ₹12,345.67, Rs. 1,234.56, INR 1234.56
function extractAmount(text) {
    if (!text) return null;
    const re = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;
    const m = re.exec(text);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return isFinite(n) ? n : null;
}

function detectBankTxn(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    let type = null;
    // Explicit "credited to" / "debited from" is the strongest signal.
    if (/\bcredited\s+(?:to|with|in)\b/.test(lower)) type = 'credit';
    else if (/\bdebited\s+(?:from|for|by)\b/.test(lower)) type = 'debit';
    // Bare "credited" / "debited" still counts, but we drop "credit card".
    else if (/\bcredited\b/.test(lower) && !/\bcredit\s*card\b/.test(lower)) type = 'credit';
    else if (/\bdebited\b/.test(lower)) type = 'debit';
    // UPI phrasing
    else if (/\bupi\b.*\b(?:sent|paid|transferred)\b/.test(lower)) type = 'debit';
    else if (/\bupi\b.*\b(?:received|collected)\b/.test(lower)) type = 'credit';
    // Neutral "transaction alert" without direction — leave type null, but
    // still return something if amount is present so the row can be shown.
    const amount = extractAmount(text);
    if (!type && !amount) return null;
    return { type, amount };
}

// Helper: does `from` match any entry in a user-taught sender list?
// Entries may be either exact emails or domain patterns beginning with "@".
function userSenderMatch(from, list) {
    if (!from || !list || !list.length) return false;
    const s = from.toLowerCase();
    const m = s.match(/<([^>]+)>/);
    const addr = (m ? m[1] : s).trim();
    const domain = addr.includes('@') ? '@' + addr.split('@').pop() : '';
    for (const raw of list) {
        const pat = String(raw || '').trim().toLowerCase();
        if (!pat) continue;
        if (pat.startsWith('@')) {
            if (domain && domain.endsWith(pat)) return true;
        } else {
            if (addr === pat) return true;
        }
    }
    return false;
}

// `userRules` (optional) is the object returned by store.readUserRules().
// When provided, user-taught classifications take precedence over the
// built-in regex rules — e.g. a sender the user has marked as "PO" will
// always be flagged as a PO even if its subject looks like a newsletter.
function classify({ headers, snippet, bodyText, attachments }, userRules) {
    const hdr = (name) => {
        const h = (headers || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase());
        return h ? h.value : '';
    };
    const from = (hdr('From') || '').toLowerCase();
    const subject = hdr('Subject') || '';
    const headerBlob = (headers || []).map(h => `${h.name}: ${h.value}`).join('\n').toLowerCase();
    const blob = `${subject}\n${snippet || ''}\n${bodyText || ''}`;

    // User-taught overrides (computed up-front so all flags can consult them).
    const userSpam = !!(userRules && userRules.spam && userSenderMatch(from, userRules.spam.senders));
    const userBank = !!(userRules && userRules.bank && userSenderMatch(from, userRules.bank.senders));
    const userPo   = !!(userRules && userRules.po   && userSenderMatch(from, userRules.po.senders));

    const isNewsletter = NEWSLETTER_HINTS.some(h => headerBlob.includes(h)) || userSpam;

    const isBankSender = BANK_SENDERS.some(r => r.test(from));
    const isBankHintSender = !isBankSender && BANK_SENDER_HINTS.some(r => r.test(from));
    // Strong sender: any txn hint in the body counts.
    // Hint sender: need *both* an explicit type keyword AND a recognisable amount.
    let bankTxn = null;
    if (userBank) {
        // User has declared this sender a bank. Still try to pull txn details
        // (type + amount) but don't require them for the flag.
        bankTxn = detectBankTxn(blob) || { type: null, amount: null };
    } else if (isBankSender) {
        bankTxn = detectBankTxn(blob);
    } else if (isBankHintSender) {
        const t = detectBankTxn(blob);
        if (t && t.type && t.amount != null) bankTxn = t;
    }
    const bankFlag = userBank || !!bankTxn;

    const poSubject = PO_SUBJECT_PATTERNS.some(r => r.test(subject));
    const poAttach = (attachments || []).some(a => PO_ATTACHMENT_PATTERNS.some(r => r.test(a.filename || '')));
    // Body match must be fairly explicit — "purchase order" phrase or
    // "PO #123" style with a number. Avoids matching "P.O." in addresses etc.
    const poBodyStrong = /\bpurchase\s*order\b/i.test(blob)
        || /\bP\.?O\.?\s*(?:No\.?|Number|Ref\.?|#)\s*[:#\-]?\s*[A-Z0-9]{2,}/i.test(blob)
        || /\bPO[\s#\-]+\d{3,}\b/i.test(blob);

    const poNegative = PO_NEGATIVE_SUBJECT.some(r => r.test(subject));
    // Strong subject or attachment signals stand on their own. Body-only
    // signals only count when the subject isn't an obvious non-PO.
    // User-taught PO senders always win.
    const poFlag = userPo || poSubject || poAttach || (poBodyStrong && !poNegative);

    // Extract a cleaner PO number if present.
    let poNumber = null;
    const poNumRe1 = /\bP\.?\s*O\.?\s*(?:No\.?|Number|Ref\.?|#)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\/\-]{2,30})/i;
    const poNumRe2 = /\bPO[\s#\-]+([0-9][A-Z0-9\/\-]{2,30})/i;
    const m1 = poNumRe1.exec(subject) || poNumRe1.exec(blob);
    const m2 = poNumRe2.exec(subject) || poNumRe2.exec(blob);
    if (m1) poNumber = m1[1];
    else if (m2) poNumber = m2[1];

    return {
        newsletterFlag: isNewsletter,
        spamFlag: userSpam,
        bankFlag,
        bankTxn,
        poFlag,
        userTaught: { spam: userSpam, bank: userBank, po: userPo },
        poHints: poFlag ? {
            poNumber,
            supplier: from || null,
            attachments: (attachments || []).filter(a => /\.pdf$/i.test(a.filename || ''))
        } : null
    };
}

module.exports = { classify, detectBankTxn, extractAmount };
