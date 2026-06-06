/**
 * Simulate bank-import session partial payment → second receipt pending list.
 * Run: node tools/test-session-allocation.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const invoices = JSON.parse(fs.readFileSync(path.join(root, 'Data/invoices.json'), 'utf8'));
const customers = JSON.parse(fs.readFileSync(path.join(root, 'Data/customers.json'), 'utf8'));

const doc = { ...invoices.find((i) => i.id === '000669') };
const customer = customers.find((c) => (c.name || '').includes('BHOX AIR GAS PRIVATE LIMITED - C'));

const sessionBankTx = [
  {
    type: 'credit',
    isReady: true,
    converted: false,
    mappedVoucher: {
      type: 'receipt',
      customerId: customer?.id,
      amount: 100000,
      allocations: [{ id: '000669', no: '000669', invoiceNo: '000669', amount: 100000 }],
    },
  },
  { type: 'credit', isReady: false, converted: false },
];

function bumpAllocRefsOnce(map, refs, amount, partyId) {
  const seen = new Set();
  refs.forEach((raw) => {
    const k = (raw || '').toString().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    map.set(k, (map.get(k) || 0) + amount);
    if (partyId) {
      const pk = `__pdoc:${partyId}|${k}`;
      map.set(pk, (map.get(pk) || 0) + amount);
    }
  });
}

function buildExplicitPaidIndex(txs, excludeTxIndex) {
  const index = new Map();
  txs.forEach((tx, txIndex) => {
    if (excludeTxIndex >= 0 && txIndex === excludeTxIndex) return;
    if (!tx?.isReady) return;
    const mv = tx.mappedVoucher;
    if (!mv?.allocations) return;
    mv.allocations.forEach((a) => {
      const amt = parseFloat(a.amount) || 0;
      if (amt <= 0) return;
      bumpAllocRefsOnce(index, [a.id, a.no, a.invoiceNo, a.billNo], amt, mv.customerId);
    });
  });
  return index;
}

function lookupPaid(docRef, index) {
  const keys = [docRef.id, docRef.invoiceNo, `__pdoc:${customer.id}|${docRef.id}`];
  let alloc = 0;
  keys.forEach((k) => { alloc = Math.max(alloc, index.get(k) || 0); });
  return alloc;
}

function sumSessionAllocationsForDoc(docRef, txs, excludeTxIndex) {
  const docKeys = new Set(
    [docRef.id, docRef.invoiceNo, docRef.billNo]
      .filter(Boolean)
      .map((k) => String(k).trim())
  );
  let paid = 0;
  txs.forEach((tx, txIndex) => {
    if (excludeTxIndex >= 0 && txIndex === excludeTxIndex) return;
    if (!tx?.isReady) return;
    (tx.mappedVoucher?.allocations || []).forEach((a) => {
      const keys = [a.id, a.no, a.invoiceNo, a.billNo].filter(Boolean).map((k) => String(k).trim());
      if (keys.some((k) => docKeys.has(k))) paid += parseFloat(a.amount) || 0;
    });
  });
  return paid;
}

function calcPending(inv, txs, excludeTxIndex) {
  const totalAmountNum = inv.total;
  const explicitIndex = buildExplicitPaidIndex(txs, excludeTxIndex);
  const explicitPaid = lookupPaid(inv, explicitIndex);
  const sessionPaid = sumSessionAllocationsForDoc(inv, txs, excludeTxIndex);
  const totalPaid = Math.max(explicitPaid, sessionPaid);
  let pendingNum = Math.max(0, totalAmountNum - totalPaid);
  return { explicitPaid, sessionPaid, pendingNum, indexDup: explicitIndex.get('000669') };
}

console.log('Invoice 000669 total:', doc.total);

const second = calcPending(doc, sessionBankTx, 1);
console.log('Second receipt (exclude index 1):', second);

const first = calcPending(doc, sessionBankTx, 0);
console.log('First receipt editing (exclude self):', first);

const ok = second.pendingNum === 121250 && second.explicitPaid === 100000;
console.log(ok ? 'PASS: pending is 121250, explicit paid 100000 (no triple-count)' : 'FAIL');

function applyHints(inv, txs) {
  const paidByKey = new Map();
  txs.forEach((tx) => {
    if (!tx?.isReady) return;
    (tx.mappedVoucher?.allocations || []).forEach((a) => {
      const amt = parseFloat(a.amount) || 0;
      const seen = new Set();
      [a.id, a.no, a.invoiceNo, a.billNo].forEach((raw) => {
        const k = (raw || '').toString().trim();
        if (!k || seen.has(k)) return;
        seen.add(k);
        paidByKey.set(k, (paidByKey.get(k) || 0) + amt);
      });
    });
  });
  const sessionPaid = paidByKey.get(inv.id) || 0;
  const dbPaid = 0;
  const combinedPaid = Math.min(inv.total, Math.max(dbPaid, sessionPaid));
  if (combinedPaid <= 0.05) {
    inv.status = 'pending';
    delete inv.paidSoFar;
    delete inv.balanceDue;
  } else {
    inv.paidSoFar = combinedPaid;
    inv.balanceDue = inv.total - combinedPaid;
    inv.status = inv.balanceDue <= 0.05 ? 'paid' : 'partial';
  }
}

const stale = { ...doc, status: 'partial', paidSoFar: 150000, balanceDue: 71250 };
applyHints(stale, []);
console.log('Stale hints cleared on reopen without session:', stale);
const ok2 = stale.status === 'pending' && stale.paidSoFar === undefined;
console.log(ok2 ? 'PASS: stale session hints cleared when no import saved' : 'FAIL: stale hints remain');
