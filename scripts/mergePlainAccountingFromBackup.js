/**
 * Merge plain (non-GST) sales invoices and optional plain receipt vouchers from a backup JSON
 * into the live Data/*.json files. Always copy live files first (script does not auto-backup).
 *
 * Usage (from repo root):
 *   node scripts/mergePlainAccountingFromBackup.js --invoices Data/invoices-MJ-3.json
 *   node scripts/mergePlainAccountingFromBackup.js --invoices Data/invoices-MJ-3.json --vouchers Data/vouchers-MJ-2.json
 */
const fs = require("fs");
const path = require("path");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
}

function argVal(name) {
  const i = process.argv.indexOf(name);
  if (i === -1 || !process.argv[i + 1]) return null;
  return process.argv[i + 1];
}

const root = path.join(__dirname, "..");
const liveInvPath = path.join(root, "Data", "invoices.json");
const liveVchPath = path.join(root, "Data", "vouchers.json");

const invBackup = argVal("--invoices");
const vchBackup = argVal("--vouchers");

function isPlainInvoice(inv) {
  const t = String(inv?.type || "").toLowerCase();
  return t === "without-bill" || t === "non-gst-invoice";
}

function isPlainReceipt(v) {
  return v && v.type === "receipt" && v.hasGst === false;
}

let addedInv = 0;
let addedVch = 0;

if (invBackup) {
  const bp = path.isAbsolute(invBackup) ? invBackup : path.join(root, invBackup);
  if (!fs.existsSync(bp)) {
    console.error("Invoice backup not found:", bp);
    process.exit(1);
  }
  const live = readJson(liveInvPath);
  if (!Array.isArray(live)) {
    console.error("Live invoices.json is not an array");
    process.exit(1);
  }
  const bak = readJson(bp);
  if (!Array.isArray(bak)) {
    console.error("Backup invoices file is not an array");
    process.exit(1);
  }
  const liveKeys = new Set();
  live.forEach((x) => {
    if (x.id != null) liveKeys.add(String(x.id));
    if (x.invoiceNo) liveKeys.add(String(x.invoiceNo));
  });
  const plainFromBak = bak.filter(isPlainInvoice);
  const toAdd = [];
  for (const inv of plainFromBak) {
    const k1 = inv.id != null ? String(inv.id) : "";
    const k2 = inv.invoiceNo ? String(inv.invoiceNo) : "";
    if ((k1 && liveKeys.has(k1)) || (k2 && liveKeys.has(k2))) continue;
    toAdd.push(inv);
    if (k1) liveKeys.add(k1);
    if (k2) liveKeys.add(k2);
  }
  addedInv = toAdd.length;
  writeJson(liveInvPath, live.concat(toAdd));
  console.log("Invoices: merged", addedInv, "plain row(s) from", bp);
}

if (vchBackup) {
  const bp = path.isAbsolute(vchBackup) ? vchBackup : path.join(root, vchBackup);
  if (!fs.existsSync(bp)) {
    console.error("Voucher backup not found:", bp);
    process.exit(1);
  }
  const live = readJson(liveVchPath);
  if (!Array.isArray(live)) {
    console.error("Live vouchers.json is not an array");
    process.exit(1);
  }
  const bak = readJson(bp);
  if (!Array.isArray(bak)) {
    console.error("Backup vouchers file is not an array");
    process.exit(1);
  }
  const liveIds = new Set(live.map((x) => String(x.id)));
  const toAdd = [];
  for (const v of bak) {
    if (!isPlainReceipt(v)) continue;
    if (liveIds.has(String(v.id))) continue;
    toAdd.push(v);
    liveIds.add(String(v.id));
  }
  addedVch = toAdd.length;
  writeJson(liveVchPath, live.concat(toAdd));
  console.log("Vouchers: merged", addedVch, "plain receipt(s) from", bp);
}

if (!invBackup && !vchBackup) {
  console.error("Pass at least one of: --invoices <path>  --vouchers <path>");
  process.exit(1);
}

console.log("Done. Reload the app (hard refresh). If you use Book Keeper cleanup, run it after to refresh links.");
