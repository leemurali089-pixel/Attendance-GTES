# Invoice V3 Field Mapping Report

**Compared:** `js/invoicesUI.js` → `getInvoiceElement()` (Old GTES HTML) vs `js/invoiceDataV3.js` + `js/invoicePdfMakeV3.js` (V3)

| Field Name | Database Source | Old Invoice Location | V3 Location (after fix) | Status |
|---|---|---|---|---|
| Company Name | `settings.companyName` / `DataManager.COMPANY_PROFILE.name` | Header (centered / top) | `doc.company.name` → header stack | **Mapped** |
| Registered Address | `settings.registeredAddress` | Header | `doc.company.address` | **Mapped** |
| Work Address | `settings.workAddress` | Header `Work:` line | `doc.company.workAddress` | **Mapped** |
| Company Email | `settings.emails[]` | Header `Email:` line | `doc.company.emails` | **Was missing → Fixed** |
| Company Phone | `settings.phones[]` | Header `Ph:` line | `doc.company.phones` | **Was missing → Fixed** |
| Company GSTIN | `settings.gstin` | Header GSTIN block | `doc.company.gstin` | **Mapped** |
| Company PAN | `settings.pan` | Header PAN block | `doc.company.pan` | **Mapped** |
| Company IEC | `settings.iec` | Header IEC block | `doc.company.iec` | **Mapped** |
| Document Title | Derived (`Tax Invoice` / DC / Credit Note) | Below header, centered | `doc.meta.docTitle` | **Mapped** |
| Copy Type | `invoice.copyType` / localStorage | Title suffix `(ORIGINAL)` | `doc.copyLabel` | **Mapped** |
| Invoice No | `invoice.invoiceNo` / `invoice.id` | Info grid left / header right | `doc.invoice.no` | **Mapped** |
| Invoice Date | `invoice.date` | Info grid left | `doc.invoice.dateDisplay` | **Mapped** |
| Purchase Order No | `invoice.poNumber` | Info grid left `Purchase Order No` | `doc.invoice.poNumber` | **Was wrong label (PO only) → Fixed** |
| Dispatch Document No | `invoice.dispatchDetails.documentNo` / `invoice.dispatchDocumentNo` | Info grid right | `doc.invoice.dispatchDocumentNo` | **Was missing → Fixed** |
| Dispatch Through | `invoice.dispatchDetails.via` / `dispatchThrough` / `vehicleNo` | Info grid right | `doc.invoice.dispatchThrough` | **Was missing → Fixed** |
| Destination | `invoice.dispatchDetails.destination` / `invoice.placeOfSupply` | Info grid right | `doc.invoice.destination` | **Was missing → Fixed** |
| E-Way Bill No | `invoice.dispatchDetails.ewayBillNo` / `eWayBillNo` / `lrNo` | Info grid right | `doc.invoice.ewayBillNo` | **Was missing → Fixed** |
| Receiver Name | `customer.name` / `invoice.customerName` | Receiver block | `doc.receiver.name` | **Was partial (Bill To name only) → Fixed** |
| Receiver Address | `customer.address` / `invoice.customerAddress` | Receiver block | `doc.receiver.address` | **Was missing → Fixed** |
| Receiver State | `customer.state` (parsed from address) | Receiver block | `doc.receiver.state` | **Was missing → Fixed** |
| Receiver Country | `customer.country` (default India) | Receiver block | `doc.receiver.country` | **Was missing → Fixed** |
| Receiver Pin | `customer.pincode` (parsed from address) | Receiver block | `doc.receiver.pin` | **Was missing → Fixed** |
| Receiver Phone | `customer.phone` / `customer.mobile` | Receiver block | `doc.receiver.phone` | **Was missing → Fixed** |
| Receiver GSTIN | `customer.gstin` / `invoice.customerGstin` | Receiver block | `doc.receiver.gstin` | **Was missing → Fixed** |
| Receiver PAN | `customer.pan` / `invoice.customerPan` | Receiver block | `doc.receiver.pan` | **Was missing → Fixed** |
| Consignee Name | `invoice.shipToName` / receiver name | Consignee block | `doc.consignee.name` | **Was missing → Fixed** |
| Consignee Address | `invoice.shipToAddress` / receiver address | Consignee block | `doc.consignee.address` | **Was missing → Fixed** |
| Consignee State/Pin/Phone/GSTIN | ship-to fields or receiver fallback | Consignee block | `doc.consignee.*` | **Was missing → Fixed** |
| Line SL | item index | Items table `#` | `doc.items[].sl` | **Mapped** |
| Line Description | `item.name` + master `description` | Items table Description | `doc.items[].name` + `desc` | **Mapped** |
| Line HSN | master / `item.hsn` | Items table HSN | `doc.items[].hsn` | **Mapped (width fix)** |
| Line Qty | `item.quantity` | Items table Qty | `doc.items[].qty` | **Mapped** |
| Line Unit | master / `item.unit` | Items table Unit / Per | `doc.items[].unit` | **Mapped** |
| Line Rate | `item.rate` | Items table Rate | `doc.items[].rate` | **Mapped (width fix)** |
| Line Tax % | `item.cgstRate+sgstRate` or IGST | Old: CGST/SGST cols; V3: single Tax % | `doc.items[].taxPct` | **Simplified column (by design)** |
| Line Amount | `item.amount` | Items table Amount | `doc.items[].amount` | **Mapped (width fix)** |
| Subtotal | `invoice.subtotal` / sum items | Footer totals | `doc.summary.subtotal` | **Mapped** |
| CGST Total | accumulated from items / `invoice.gst.cgst` | Footer totals | `doc.summary.cgst` | **Mapped** |
| SGST Total | accumulated from items / `invoice.gst.sgst` | Footer totals | `doc.summary.sgst` | **Mapped** |
| IGST Total | accumulated from items / `invoice.gst.igst` | Footer totals | `doc.summary.igst` | **Mapped** |
| Round Off | `invoice.roundOff` | Footer totals | `doc.summary.roundOff` | **Mapped** |
| Grand Total | `invoice.total` | Footer totals | `doc.summary.grandTotal` | **Mapped** |
| Amount in Words | `InvoicesUI.numberToWords(total)` | Footer left | `doc.summary.amountInWords` | **Mapped** |
| Terms & Conditions | Hardcoded in `getInvoiceElement` | Footer left | `doc.terms[]` | **Mapped** |
| Bank Details | `settings.bankDetails` | Footer left `Bank:` line | `doc.bankLine` | **Mapped** |
| Authorized Signatory | `company.name` | Footer right | pdfmake / preview closing | **Mapped** |
| Page Orientation | Toolbar `settings.orientation` | N/A (browser print) | `pageOrientation` in pdfmake | **Was broken → Fixed** |
| Sales Invoice Ref | `_inferSalesReferenceNo(invoice)` | Old Invoice Details box | Not in BookKeeper grid | **Omitted (BookKeeper layout)** |
| Vehicle No (separate) | `dispatchDetails.vehicleNo` | Old Invoice Details | Folded into `dispatchThrough` fallback | **Merged** |
| LR / WayBill (separate) | `dispatchDetails.lrNo` | Old Invoice Details | Folded into `ewayBillNo` fallback | **Merged** |
| Payment Status | `invoice.status` | Old Invoice Details | Not on GTES tax invoice grid | **Omitted** |

## Notes

- BookKeeper-imported invoices (e.g. `000624`) may not have `dispatchDetails` in JSON until dispatch fields are imported from BK backup; mapping reads optional `invoice.dispatchDocumentNo`, `invoice.ewayBillNo`, and `dispatchDetails.*` when present.
- Consignee defaults to receiver when `shipToAddress` is empty (matches BookKeeper PDF).
- V3 uses a single **Tax %** column instead of separate CGST/SGST rate+amount columns (matches landscape GTES PDF screenshot).
