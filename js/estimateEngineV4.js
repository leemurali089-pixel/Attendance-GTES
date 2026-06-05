/**
 * Document Engine V4 — Sales Quotation & Proforma Invoice (sales-invoice layout derivative).
 */
const EstimateDataV4 = {
    getEstimate(id) {
        return typeof EstimateManager !== 'undefined' ? EstimateManager.getEstimate(id) : null;
    },

    async build(estimateId, docKind) {
        const est = this.getEstimate(estimateId);
        if (!est) return null;

        const isProforma = docKind === 'proforma-invoice';
        const company = DocumentBuildCommon.buildCompany();
        const customer = typeof CustomerManager !== 'undefined'
            ? CustomerManager.getCustomer(est.customerId)
            : null;

        const items = (est.items || []).map((item, idx) => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const amount = parseFloat(item.amount) || qty * rate;
            const desc = DocumentPdfBase._plainText(item.description || '');
            return {
                sl: idx + 1,
                name: item.name || '',
                desc,
                hsn: item.hsn || '-',
                qty,
                unit: item.unit || 'nos',
                rate,
                taxPct: item.gstRate ? `${item.gstRate}%` : '',
                amount,
                rowHeightPt: DocumentBuildCommon.itemRowHeight({ desc })
            };
        });

        const subtotal = parseFloat(est.subtotal) || items.reduce((s, r) => s + r.amount, 0);
        const total = parseFloat(est.total) || subtotal;
        const cgst = parseFloat(est.cgst) || 0;
        const sgst = parseFloat(est.sgst) || 0;
        const igst = parseFloat(est.igst) || 0;

        return {
            estimateId,
            meta: {
                docTitle: isProforma ? 'Proforma Invoice' : 'Quotation',
                isGst: !!(cgst || sgst || igst),
                isPlain: !cgst && !sgst && !igst
            },
            company,
            invoice: {
                no: est.id,
                date: est.date || '',
                dateDisplay: DocumentBuildCommon.formatDateDisplay(est.date),
                poNumber: est.poNumber || '-',
                dispatchDocumentNo: '-',
                dispatchThrough: '-',
                destination: '-',
                ewayBillNo: '-'
            },
            receiver: {
                name: customer?.name || est.customerName || 'Customer',
                address: customer?.address || est.customerAddress || '',
                phone: customer?.phone || '',
                gstin: customer?.gstin || est.customerGstin || '',
                state: customer?.state || '',
                country: customer?.country || 'India',
                pin: customer?.pincode || ''
            },
            consignee: {
                name: customer?.name || est.customerName || 'Customer',
                address: customer?.address || est.customerAddress || '',
                phone: customer?.phone || '',
                gstin: customer?.gstin || est.customerGstin || ''
            },
            items,
            summary: {
                subtotal,
                cgst,
                sgst,
                igst,
                roundOff: parseFloat(est.roundOff) || 0,
                grandTotal: total,
                amountInWords: typeof InvoicesUI !== 'undefined' && InvoicesUI.numberToWords
                    ? `Rupees ${InvoicesUI.numberToWords(total)} Only`
                    : `Rupees ${total.toFixed(2)} Only`
            },
            terms: [
                'Prices valid for 30 days unless stated otherwise.',
                'Subject to Chennai jurisdiction.'
            ],
            bankLine: `Bank: ${company.bank?.bankName || '-'} | A/c: ${company.bank?.accountNo || '-'} | IFSC: ${company.bank?.ifsc || '-'}`,
            footerNote: isProforma
                ? 'Computer generated proforma invoice.'
                : 'Computer generated quotation.'
        };
    }
};

const EstimateLayoutV4 = {
    paginate(doc, settings = {}) {
        if (typeof InvoiceLayoutV3 !== 'undefined') {
            const wrapped = {
                ...doc,
                invoice: doc.invoice,
                meta: { ...doc.meta, isGst: doc.meta.isGst && !doc.meta.isPlain }
            };
            return InvoiceLayoutV3.paginate(wrapped, settings);
        }
        return DocumentPaginate.paginate(doc, settings);
    }
};

const EstimatePdfV4 = {
    async generatePdfBytes(doc, settings = {}) {
        if (typeof InvoicePdfMakeV3 !== 'undefined') {
            const invDoc = {
                ...doc,
                invoice: doc.invoice,
                meta: {
                    ...doc.meta,
                    isGst: doc.meta.isGst && !doc.meta.isPlain,
                    isPlain: doc.meta.isPlain,
                    isDc: false,
                    isCreditNote: false,
                    isInterstate: false,
                    docTitle: doc.meta.docTitle.toUpperCase()
                }
            };
            return InvoicePdfMakeV3.generatePdfBytes(invDoc, settings);
        }
        throw new Error('InvoicePdfMakeV3 required for quotation/proforma PDF');
    }
};

const EstimatePreviewV4 = {
    render(layoutResult, host) {
        if (typeof InvoicePreviewV3 !== 'undefined') {
            const wrapped = {
                ...layoutResult,
                doc: {
                    ...layoutResult.doc,
                    meta: {
                        ...layoutResult.doc.meta,
                        isGst: layoutResult.doc.meta.isGst && !layoutResult.doc.meta.isPlain,
                        isPlain: layoutResult.doc.meta.isPlain,
                        docTitle: layoutResult.doc.meta.docTitle.toUpperCase()
                    }
                }
            };
            return InvoicePreviewV3.render(wrapped, host);
        }
        return DocumentPreview.render(layoutResult, { renderPreview: null });
    }
};

window.EstimateDataV4 = EstimateDataV4;
window.EstimateLayoutV4 = EstimateLayoutV4;
window.EstimatePdfV4 = EstimatePdfV4;
window.EstimatePreviewV4 = EstimatePreviewV4;
