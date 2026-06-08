/**
 * Invoice Engine V3 — A4 HTML preview from shared page model (table layout only).
 */
const InvoicePreviewV3 = {
    _state: { pageCount: 1, currentPage: 1, pages: [] },

    _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _partyHtml(party) {
        const lines = [
            `<div style="font-size:11px;font-weight:800;margin-bottom:4px;">${this._esc(party.name)}</div>`
        ];
        if (party.address) lines.push(`<div style="font-size:9px;white-space:pre-wrap;">${this._esc(party.address)}</div>`);
        if (party.state) lines.push(`<div style="font-size:9px;">State: ${this._esc(party.state)}</div>`);
        if (party.country) lines.push(`<div style="font-size:9px;">Country: ${this._esc(party.country)}</div>`);
        if (party.pin) lines.push(`<div style="font-size:9px;">Pin: ${this._esc(party.pin)}</div>`);
        if (party.phone) lines.push(`<div style="font-size:9px;">Phone: ${this._esc(party.phone)}</div>`);
        if (party.gstin) lines.push(`<div style="font-size:9px;margin-top:4px;"><strong>GSTIN:</strong> ${this._esc(party.gstin)}</div>`);
        if (party.pan) lines.push(`<div style="font-size:9px;"><strong>PAN:</strong> ${this._esc(party.pan)}</div>`);
        return lines.join('');
    },

    _labelRows(rows) {
        return rows.map(([label, value]) =>
            `<tr><td style="padding:1px 0;vertical-align:top;">${this._esc(label)} : ${this._esc(value)}</td></tr>`
        ).join('');
    },

    _renderHeader(doc, pageModel = {}) {
        const c = doc.company;
        const copyLabel = pageModel.copyLabel !== undefined ? pageModel.copyLabel : doc.copyLabel;
        const copyLine = copyLabel
            ? `<div style="font-size:10px;font-weight:700;color:#333;">(${this._esc(copyLabel)})</div>`
            : '';
        const subtitleLine = doc.meta.docSubtitle
            ? `<div style="font-size:10px;font-style:italic;color:#444;margin-top:4px;">${this._esc(doc.meta.docSubtitle)}</div>`
            : '';
        const email = c.emails ? `<div style="font-size:9px;">Email: ${this._esc(c.emails)}</div>` : '';
        const phone = c.phones ? `<div style="font-size:9px;">Ph: ${this._esc(c.phones)}</div>` : '';
        return `<div style="text-align:center;margin-bottom:10px;">
            <div style="font-size:18px;font-weight:800;text-transform:uppercase;">${this._esc(c.name)}</div>
            <div style="font-size:9px;line-height:1.4;">${this._esc(c.address)}</div>
            <div style="font-size:9px;">Work: ${this._esc(c.workAddress)}</div>
            ${email}${phone}
            <div style="font-size:9px;margin-top:2px;">GSTIN: ${this._esc(c.gstin)} | PAN: ${this._esc(c.pan)}${c.iec ? ` | IEC: ${this._esc(c.iec)}` : ''}</div>
            <div style="font-size:14px;font-weight:800;text-transform:uppercase;margin-top:8px;">${this._esc(doc.meta.docTitle)}</div>
            ${subtitleLine}
            ${copyLine}
        </div>`;
    },

    _renderInfoDispatch(doc) {
        const inv = doc.invoice;
        let leftRows;
        let rightRows;
        if (doc.meta.isServiceChallan) {
            leftRows = [
                ['Service Challan No', inv.no],
                ['Date', inv.dateDisplay || inv.date]
            ];
            if (inv.jobCardNo) leftRows.push(['Job Card No', inv.jobCardNo]);
            if (inv.customerRef) leftRows.push(['Customer DC / Ref', inv.customerRef]);
            rightRows = null;
        } else {
            leftRows = [
                [doc.meta.isDc ? 'Delivery Challan No' : 'Invoice No', inv.no],
                ['Date', inv.dateDisplay || inv.date],
                ['Purchase Order No', inv.poNumber]
            ];
            if (inv.jobCardNo) leftRows.push(['Job Card No', inv.jobCardNo]);
            if (inv.serviceChallanNo) leftRows.push(['Service Challan No', inv.serviceChallanNo]);
            rightRows = [
                ['Dispatch Document No', inv.dispatchDocumentNo],
                ['Dispatch Through', inv.dispatchThrough],
                ['Destination', inv.destination],
                ['e-Way Bill No.', inv.ewayBillNo]
            ];
        }
        if (doc.payment?.show) {
            leftRows.push(['Payment Status', doc.payment.label]);
        }
        const leftCellHtml = leftRows.map(([label, value]) => {
            const isPay = label === 'Payment Status';
            const color = isPay ? (doc.payment?.color || '#111') : '#111';
            const weight = isPay ? 'font-weight:800;' : '';
            return `<tr><td style="padding:1px 0;vertical-align:top;">${this._esc(label)} : <span style="color:${color};${weight}">${this._esc(value)}</span></td></tr>`;
        }).join('');
        if (doc.meta.isServiceChallan) {
            return `<table width="100%" class="inv-v3-box" cellpadding="6" cellspacing="0" style="margin-bottom:8px;">
                <tr>
                    <td valign="top">
                        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:9px;">${leftCellHtml}</table>
                    </td>
                </tr>
            </table>`;
        }
        return `<table width="100%" class="inv-v3-box" cellpadding="6" cellspacing="0" style="margin-bottom:8px;">
            <tr>
                <td width="50%" valign="top" style="border-right:1px solid #000;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:9px;">${leftCellHtml}</table>
                </td>
                <td width="50%" valign="top">
                    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:9px;">
                        ${this._labelRows(rightRows)}
                    </table>
                </td>
            </tr>
        </table>`;
    },

    _renderReceiverConsignee(doc) {
        if (doc.meta.isServiceChallan) {
            return `<table width="100%" class="inv-v3-box" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                <tr style="background:#e8e8e8;">
                    <td align="center" style="font-size:8px;font-weight:700;padding:4px;border-bottom:1px solid #000;">Received From</td>
                </tr>
                <tr>
                    <td valign="top" style="padding:8px;">${this._partyHtml(doc.receiver)}</td>
                </tr>
            </table>`;
        }
        return `<table width="100%" class="inv-v3-box" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
            <tr style="background:#e8e8e8;">
                <td width="50%" align="center" style="font-size:8px;font-weight:700;padding:4px;border-right:1px solid #000;border-bottom:1px solid #000;">Details of Receiver (Billed To)</td>
                <td width="50%" align="center" style="font-size:8px;font-weight:700;padding:4px;border-bottom:1px solid #000;">Details of Consignee (Shipped To)</td>
            </tr>
            <tr>
                <td width="50%" valign="top" style="padding:8px;border-right:1px solid #000;">${this._partyHtml(doc.receiver)}</td>
                <td width="50%" valign="top" style="padding:8px;">${this._partyHtml(doc.consignee)}</td>
            </tr>
        </table>`;
    },

    _renderMetaCustomer(doc) {
        return this._renderInfoDispatch(doc) + this._renderReceiverConsignee(doc);
    },

    _renderItems(rows, doc) {
        const isGst = doc.meta.isGst && !doc.meta.isPlain;
        const slCol = 'style="width:14px;max-width:16px;min-width:12px;padding:2px 3px;font-size:6px;"';
        const head = isGst
            ? `<tr><th ${slCol}>#</th><th>Description</th><th style="width:70px;">HSN</th><th style="width:40px;">Qty</th><th style="width:50px;">Unit</th><th style="width:80px;">Rate</th><th style="width:50px;">Tax %</th><th style="width:90px;">Amount</th></tr>`
            : `<tr><th ${slCol}>#</th><th>Description</th><th style="width:70px;">HSN</th><th style="width:40px;">Qty</th><th style="width:50px;">Unit</th><th style="width:80px;">Rate</th><th style="width:90px;">Amount</th></tr>`;
        const body = rows.map((r) => {
            const descText = r.desc
                ? String(r.desc).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
                : '';
            const desc = descText
                ? `<div style="font-size:8px;font-style:italic;white-space:pre-wrap;">${this._esc(descText)}</div>`
                : '';
            const cells = `<td align="center" ${slCol}>${r.sl}</td>`
                + `<td><strong>${this._esc(r.name)}</strong>${desc}</td>`
                + `<td align="right" style="white-space:nowrap;">${this._esc(r.hsn)}</td>`
                + `<td align="right" style="white-space:nowrap;">${r.qty}</td>`
                + `<td align="right" style="white-space:nowrap;">${this._esc(r.unit)}</td>`
                + `<td align="right" style="white-space:nowrap;">${r.rate.toFixed(2)}</td>`;
            const tax = isGst ? `<td align="right" style="white-space:nowrap;">${this._esc(r.taxPct)}</td>` : '';
            return `<tr>${cells}${tax}<td align="right" style="white-space:nowrap;"><strong>${r.amount.toFixed(2)}</strong></td></tr>`;
        }).join('');
        return `<table width="100%" class="inv-v3-items" cellpadding="4" cellspacing="0" style="margin-top:10px;table-layout:fixed;"><thead>${head}</thead><tbody>${body}</tbody></table>`;
    },

    _renderDcRemarks(doc) {
        if (!doc.meta?.isDc) return '';
        const isGst = doc.meta.isGst && !doc.meta.isPlain;
        const cols = isGst ? 8 : 7;
        const remarksText = String(doc.remarks || '').trim();
        if (doc.meta.isServiceChallan && !remarksText) return '';
        const displayText = remarksText || '-';
        return `<table width="100%" class="inv-v3-items" cellpadding="4" cellspacing="0" style="margin-top:0;table-layout:fixed;">
            <tr><td colspan="${cols}" style="font-size:9px;border:0.5px solid #64748b;padding:6px 4px;">
                <strong>Remarks:</strong> ${this._esc(displayText)}
            </td></tr>
        </table>`;
    },

    _renderSetOffReferences(doc) {
        const refs = doc.setOffReferences;
        if (!refs?.rows?.length) return '';
        const fmt = (n) => (typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.formatMoney(n)
            : (parseFloat(n) || 0).toFixed(2));
        const rows = refs.rows.map((r) => `
            <tr style="font-size:9px;">
                <td align="center" style="border:1px solid #000;padding:4px;">${this._esc(r.invoiceNo)}</td>
                <td align="center" style="border:1px solid #000;padding:4px;">${this._esc(r.date)}</td>
                <td align="center" style="border:1px solid #000;padding:4px;">${this._esc(r.supplierInvoiceNo)}</td>
                <td align="right" style="border:1px solid #000;padding:4px;white-space:nowrap;">${fmt(r.amount)}</td>
            </tr>`).join('');
        return `<table width="100%" class="inv-v3-box" cellpadding="0" cellspacing="0" style="margin-top:8px;margin-bottom:8px;">
            <tr style="background:#e8e8e8;font-size:8px;font-weight:700;">
                <td align="center" style="border:1px solid #000;padding:4px;">Invoice No. Reference</td>
                <td align="center" style="border:1px solid #000;padding:4px;">Date</td>
                <td align="center" style="border:1px solid #000;padding:4px;">Supplier Invoice No</td>
                <td align="center" style="border:1px solid #000;padding:4px;">Amount</td>
            </tr>
            ${rows}
            <tr style="font-size:9px;font-weight:700;">
                <td colspan="3" style="border:1px solid #000;padding:4px;">Total</td>
                <td align="right" style="border:1px solid #000;padding:4px;white-space:nowrap;">Rs.${fmt(refs.total)}</td>
            </tr>
        </table>`;
    },

    _renderClosing(doc) {
        const s = doc.summary;
        return `${this._renderSetOffReferences(doc)}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:10px;">
            <tr>
                <td width="50%" valign="top" style="padding-right:8px;font-size:9px;">
                    ${doc.meta.isDc ? `<div style="margin-bottom:8px;font-weight:700;">${this._esc(doc.meta.isServiceChallan && doc.serviceAck ? doc.serviceAck : 'Received in Good Condition')}</div>` : ''}
                    <div><strong>Amount in Words:</strong> ${this._esc(s.amountInWords)}</div>
                    <div style="margin-top:10px;"><strong>Terms &amp; Conditions</strong><br>${doc.terms.map((t) => this._esc(t)).join('<br>')}</div>
                    <div style="margin-top:10px;">${this._esc(doc.bankLine)}</div>
                </td>
                <td width="50%" valign="top" style="padding-left:8px;">
                    <table width="100%" cellpadding="3" cellspacing="0" style="font-size:9px;">
                        <tr><td align="right">Subtotal</td><td align="right" style="white-space:nowrap;">₹${s.subtotal.toFixed(2)}</td></tr>
                        <tr><td align="right">CGST</td><td align="right" style="white-space:nowrap;">₹${s.cgst.toFixed(2)}</td></tr>
                        <tr><td align="right">SGST</td><td align="right" style="white-space:nowrap;">₹${s.sgst.toFixed(2)}</td></tr>
                        <tr><td align="right">IGST</td><td align="right" style="white-space:nowrap;">₹${s.igst.toFixed(2)}</td></tr>
                        <tr><td align="right">Round Off</td><td align="right" style="white-space:nowrap;">₹${s.roundOff.toFixed(2)}</td></tr>
                        <tr style="font-weight:800;font-size:11px;border:2px solid #111;"><td align="right">Grand Total</td><td align="right" style="white-space:nowrap;">₹${s.grandTotal.toFixed(2)}</td></tr>
                    </table>
                    <div style="margin-top:14px;text-align:right;font-size:9px;">For <strong>${this._esc(doc.company.name)}</strong></div>
                    <div style="margin-top:28px;text-align:right;border-top:1px solid #000;padding-top:6px;font-weight:700;">Authorized Signatory</div>
                    <div style="margin-top:8px;text-align:center;font-size:8px;color:#666;">${this._esc(doc.footerNote)}</div>
                </td>
            </tr>
        </table>`;
    },

    _renderPage(pageModel, doc, totalPages) {
        let inner = '';
        if (pageModel.includePrefix) {
            inner += this._renderHeader(doc, pageModel) + this._renderMetaCustomer(doc);
        }
        if (pageModel.itemRows?.length) {
            inner += this._renderItems(pageModel.itemRows, doc);
        }
        if (pageModel.includeClosing) {
            inner += this._renderDcRemarks(doc);
            inner += this._renderClosing(doc);
        }
        const copyTag = pageModel.copyLabel
            ? ` · ${this._esc(pageModel.copyLabel)}`
            : (pageModel.copyType === 'none' ? ' · No header' : '');
        const paidStamp = doc.payment?.isPaid && typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.paidStampHtml()
            : '';
        return `<section class="inv-v3-page-frame" id="inv-v3-page-${pageModel.pageNumber}" data-page="${pageModel.pageNumber}">
            <div class="inv-v3-page-label">Page ${pageModel.pageNumber} of ${totalPages}${copyTag}</div>
            <div class="inv-v3-page doc-page-root">${paidStamp}${inner}</div>
        </section>`;
    },

    _getScrollRoot() {
        const modal = document.getElementById('pdfPreviewModal');
        const engineMode = modal?.classList.contains('gtes-document-engine-mode')
            || modal?.classList.contains('gtes-invoice-v3-mode');
        const container = document.getElementById('pdfPreviewContainer');
        if (engineMode && container) return container;
        const body = document.querySelector('#pdfPreviewModal .gtes-pdf-preview-body');
        if (body && body.scrollHeight > body.clientHeight + 4) return body;
        return container || body;
    },

    _scrollToPage(n) {
        const frame = document.getElementById(`inv-v3-page-${n}`);
        if (!frame) return;
        const scroller = this._getScrollRoot();
        if (scroller) {
            const top = scroller.scrollTop
                + frame.getBoundingClientRect().top
                - scroller.getBoundingClientRect().top
                - 12;
            scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        } else {
            frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        this._state.currentPage = n;
        this._updateNav();
    },

    _updateNav() {
        const label = document.getElementById('gtesDocPageNavLabel')
            || document.getElementById('gtesInvPageNavLabel');
        const count = document.getElementById('gtesDocPageCount')
            || document.getElementById('gtesInvPageCount');
        const prev = document.getElementById('gtesDocPrevPage')
            || document.getElementById('gtesInvPrevPage');
        const next = document.getElementById('gtesDocNextPage')
            || document.getElementById('gtesInvNextPage');
        if (label) label.textContent = `Page ${this._state.currentPage} of ${this._state.pageCount}`;
        if (count) count.textContent = `Pages: ${this._state.pageCount}`;
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview._state.currentPage = this._state.currentPage;
        }
        if (prev) prev.disabled = this._state.currentPage <= 1;
        if (next) next.disabled = this._state.currentPage >= this._state.pageCount;
        document.querySelectorAll('.inv-v3-page-frame').forEach((el) => {
            el.classList.toggle('inv-v3-page-active', parseInt(el.dataset.page, 10) === this._state.currentPage);
        });
    },

    _bindNav() {
        const goPrev = () => this._scrollToPage(Math.max(1, this._state.currentPage - 1));
        const goNext = () => this._scrollToPage(Math.min(this._state.pageCount, this._state.currentPage + 1));
        ['gtesDocPrevPage', 'gtesInvPrevPage'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.onclick = (e) => { e.preventDefault(); goPrev(); };
        });
        ['gtesDocNextPage', 'gtesInvNextPage'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.onclick = (e) => { e.preventDefault(); goNext(); };
        });
    },

    _setupPageObserver(host) {
        this._observer?.disconnect();
        const scroller = this._getScrollRoot();
        if (!scroller || !host) return;
        this._observer = new IntersectionObserver((entries) => {
            let best = this._state.currentPage;
            let ratio = 0;
            entries.forEach((e) => {
                const p = parseInt(e.target.dataset.page, 10);
                if (e.intersectionRatio > ratio) {
                    ratio = e.intersectionRatio;
                    best = p;
                }
            });
            if (ratio > 0.2 && best !== this._state.currentPage) {
                this._state.currentPage = best;
                this._updateNav();
            }
        }, { root: scroller, threshold: [0.15, 0.35, 0.55, 0.75] });
        host.querySelectorAll('.inv-v3-page-frame').forEach((f) => this._observer.observe(f));
    },

    _applyPageSettings(host, settings = {}) {
        const dims = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.pageDimensionsMm(settings)
            : { w: 210, h: 297 };
        const marginMm = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.marginMm(settings.marginPreset || 'normal')
            : 8;
        const scale = (settings.scale || 100) / 100;
        host.dataset.docScale = String(settings.scale || 100);
        host.dataset.docPageSize = settings.pageSize || 'A4';
        host.dataset.docOrientation = settings.orientation || 'portrait';
        host.style.setProperty('--doc-page-w', `${dims.w}mm`);
        host.style.setProperty('--doc-page-h', `${dims.h}mm`);
        host.style.setProperty('--doc-margin', `${marginMm}mm`);
        host.style.setProperty('--doc-scale', String(scale));
        host.querySelectorAll('.inv-v3-page-label').forEach((el) => {
            el.style.width = `${dims.w}mm`;
        });
        host.querySelectorAll('.inv-v3-page-frame').forEach((frame) => {
            frame.style.maxWidth = `${dims.w * scale}mm`;
        });
        host.querySelectorAll('.inv-v3-page').forEach((page) => {
            page.style.width = `${dims.w}mm`;
            page.style.minHeight = `${dims.h}mm`;
            page.style.padding = `${marginMm}mm`;
            page.style.transform = scale !== 1 ? `scale(${scale})` : '';
            page.style.transformOrigin = 'top center';
            page.style.marginBottom = scale !== 1 ? `${(dims.h * (scale - 1))}mm` : '';
        });
        console.log('[InvoicePreviewV3] Orientation selected:', settings.orientation || 'portrait');
        console.log('[InvoicePreviewV3] Orientation used in preview:', settings.orientation || 'portrait', dims);
    },

    render(layoutResult, hostEl) {
        const host = hostEl
            || document.getElementById('gtesDocumentEngineStage')
            || document.getElementById('gtesInvoiceV3Stage');
        if (!host || !layoutResult) return;
        const { pages, doc, diagnostics, settings } = layoutResult;
        this._state.pageCount = pages.length;
        this._state.currentPage = 1;
        this._state.pages = pages;

        host.innerHTML = pages.map((p) => this._renderPage(p, doc, pages.length)).join('');
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview.applyPageSettings(host, settings || layoutResult.settings || {});
            DocumentPreview.syncPageCount(pages.length);
        } else {
            this._applyPageSettings(host, settings || layoutResult.settings || {});
            this._updateNav();
        }
        this._bindNav();
        this._setupPageObserver(host);

        const diagEl = document.getElementById('gtesInvoiceV3Diagnostics');
        if (diagEl && diagnostics) {
            diagEl.innerHTML = `<div class="inv-v3-diagnostics small">
                <strong>Layout Diagnostics</strong>
                Content Height: ${diagnostics.contentHeightPt} pt |
                Printable Height: ${diagnostics.printableHeightPt} pt |
                Pages Required: ${diagnostics.pagesRequired} |
                Rows/Page: ${diagnostics.rowsPerPage.join(', ')} |
                Footer: ${diagnostics.footerHeightPt} pt |
                Totals: ${diagnostics.totalsHeightPt} pt
            </div>`;
        }
    },

    reset() {
        const host = document.getElementById('gtesDocumentEngineStage')
            || document.getElementById('gtesInvoiceV3Stage');
        if (host) host.innerHTML = '';
        const diag = document.getElementById('gtesDocumentEngineDiagnostics')
            || document.getElementById('gtesInvoiceV3Diagnostics');
        if (diag) diag.innerHTML = '';
        this._observer?.disconnect();
        this._observer = null;
    }
};

window.InvoicePreviewV3 = InvoicePreviewV3;
