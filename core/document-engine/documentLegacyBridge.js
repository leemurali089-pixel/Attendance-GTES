/**
 * Universal Document Engine V3 — routes unmigrated document types to legacy HTML/html2pdf paths.
 * Remove handlers as each type gains a native pdfmake adapter.
 */
const DocumentLegacyBridge = {
    async preview(type, id) {
        const handler = this._handler(type);
        if (!handler) {
            App.showNotification(`Document type "${type}" is not yet on Document Engine V3`, 'warning');
            return;
        }
        return handler.preview(id);
    },

    async download(type, id) {
        const handler = this._handler(type);
        if (!handler?.download) {
            App.showNotification(`Download not wired for ${DocumentTemplates.label(type)}`, 'warning');
            return;
        }
        return handler.download(id);
    },

    async print(type, id) {
        const handler = this._handler(type);
        if (!handler?.print) {
            App.showNotification(`Print not wired for ${DocumentTemplates.label(type)}`, 'warning');
            return;
        }
        return handler.print(id);
    },

    _handler(type) {
        const DU = typeof DeliveryUI !== 'undefined' ? DeliveryUI : null;
        const VU = typeof VouchersUI !== 'undefined' ? VouchersUI : null;
        const IU = typeof InvoicesUI !== 'undefined' ? InvoicesUI : null;
        const R = typeof Reports !== 'undefined' ? Reports : null;

        const map = {
            'purchase-invoice': DU && {
                preview: (id) => DU.viewPurchaseDetails?.(id),
                download: (id) => DU.downloadPurchasePdf?.(id),
                print: (id) => DU.nativePrint?.()
            },
            'purchase-order': null,
            'quotation': null,
            'proforma-invoice': null,
            'delivery-challan': DU && {
                preview: (id) => DU.viewChallanLegacy?.(id),
                download: (id) => DU.printChallan?.(id),
                print: (id) => DU.nativePrint?.()
            },
            'service-challan': DU && {
                preview: (id) => DU.viewChallanLegacy?.(id),
                download: (id) => DU.printChallan?.(id),
                print: (id) => DU.nativePrint?.()
            },
            'job-card': DU && {
                preview: (id) => DU.viewJobCard?.(id),
                download: (id) => DU.downloadJobCardPdf?.(id),
                print: (id) => DU.printJobCard?.(id)
            },
            'receipt-voucher': VU && {
                preview: (id) => VU.previewVoucher?.(id),
                download: (id) => VU.generatePDF?.(id),
                print: (id) => VU.printVoucher?.(id)
            },
            'payment-voucher': VU && {
                preview: (id) => VU.previewVoucher?.(id),
                download: (id) => VU.generatePDF?.(id),
                print: (id) => VU.printVoucher?.(id)
            },
            'expense-voucher': VU && {
                preview: (id) => VU.previewVoucher?.(id),
                download: (id) => VU.generatePDF?.(id),
                print: (id) => VU.printVoucher?.(id)
            },
            'salary-slip': R && {
                preview: (id) => R.previewPayslip?.(id),
                download: (id) => R.downloadPayslipPdf?.(id)
            },
            'attendance-report': R && {
                preview: (id) => R.previewAttendanceReport?.(id),
                download: (id) => R.exportAttendancePdf?.(id)
            },
            'ledger-report': DU && {
                preview: (id) => DU.previewLedger?.(id),
                download: (id) => DU.downloadLedgerPdf?.(id)
            },
            'customer-statement': typeof AnalyticsUI !== 'undefined' && {
                preview: (id) => AnalyticsUI.previewCustomerStatement?.(id),
                download: (id) => AnalyticsUI.downloadCustomerStatementPdf?.(id)
            }
        };

        return map[type] || null;
    }
};

window.DocumentLegacyBridge = DocumentLegacyBridge;
