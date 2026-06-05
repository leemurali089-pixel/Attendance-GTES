/**
 * Single layout engine for invoice Preview, Print, and Download PDF.
 * Page count uses print CSS + Chromium footer break rules; scale via printToPDF scaleFactor.
 */
const InvoicePreviewLayout = {
    PAGE_MARGIN_MM: 8,
    PAGE_W_MM: 210,
    PAGE_H_MM: 297,
    LETTER_W_MM: 215.9,
    LETTER_H_MM: 279.4,
    BASE_FONT_PX: 12.5,

    DEFAULT_SETTINGS: {
        pageSize: 'A4',
        marginPreset: 'normal',
        orientation: 'portrait',
        scale: 100
    },

    mmToPx(mm) {
        return (mm * 96) / 25.4;
    },

    marginMmForPreset(preset) {
        const map = { none: 0, narrow: 5, normal: 8 };
        return map[preset] ?? this.PAGE_MARGIN_MM;
    },

    mergeSettings(settings = {}) {
        const merged = { ...this.DEFAULT_SETTINGS, ...settings };
        const scale = parseInt(merged.scale, 10);
        return {
            ...merged,
            orientation: merged.orientation === 'landscape' ? 'landscape' : 'portrait',
            scale: Number.isFinite(scale) ? Math.min(150, Math.max(50, scale)) : 100
        };
    },

    /** Print/PDF export path — same as mergeSettings (scale applied via printToPDF scaleFactor). */
    normalizeSettings(settings = {}) {
        return this.mergeSettings(settings);
    },

    pageSizeName(settings) {
        return settings.pageSize === 'Letter' ? 'letter' : 'A4';
    },

    sheetWidthMm(settings) {
        return settings.pageSize === 'Letter' ? this.LETTER_W_MM : this.PAGE_W_MM;
    },

    sheetHeightMm(settings) {
        return settings.pageSize === 'Letter' ? this.LETTER_H_MM : this.PAGE_H_MM;
    },

    /** Shared invoice content rules (no zoom / transform scale). */
    buildContentCss(settings) {
        const s = this.mergeSettings(settings);
        const marginMm = this.marginMmForPreset(s.marginPreset);
        const page = this.pageSizeName(s);
        const orient = s.orientation === 'landscape' ? 'landscape' : 'portrait';
        const sheetW = `${this.sheetWidthMm(s)}mm`;

        return `
@page {
  size: ${page} ${orient};
  margin: ${marginMm}mm;
}
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #000;
}
body {
  box-sizing: border-box;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.gtes-invoice-print-root,
.gtes-invoice-print-root.gtes-pdf-document,
.gtes-pdf-document.gtes-invoice-print-root {
  width: 100%;
  max-width: ${sheetW};
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
  font-size: ${this.BASE_FONT_PX}px;
  line-height: 1.38;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}
.gtes-invoice-print-root table { border-collapse: collapse; width: 100%; }
.gtes-invoice-print-root td,
.gtes-invoice-print-root th { vertical-align: top; }
.gtes-invoice-footer-block {
  display: table;
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  break-inside: auto;
  page-break-inside: auto;
}
.gtes-invoice-footer-left,
.gtes-invoice-footer-right {
  display: table-cell;
  width: 50%;
  vertical-align: top;
  box-sizing: border-box;
  break-inside: auto;
  page-break-inside: auto;
}
.gtes-invoice-footer-left { padding-right: 8px; }
.gtes-invoice-footer-right { padding-left: 8px; }
.gtes-invoice-totals-signature-keep {
  break-inside: auto;
  page-break-inside: auto;
}
.gtes-invoice-print-root .gtes-pdf-signature-block {
  page-break-inside: auto;
  break-inside: auto;
}
.gtes-invoice-line-items {
  break-inside: auto;
  page-break-inside: auto;
  page-break-after: auto;
}
.gtes-invoice-footer-block,
.gtes-invoice-footer-block * {
  break-inside: auto !important;
  page-break-inside: auto !important;
}
.gtes-invoice-footer-block {
  page-break-before: auto;
  break-before: auto;
}
table { page-break-inside: auto; }
tr { page-break-inside: auto; page-break-after: auto; }
thead { display: table-header-group; }
.gtes-invoice-line-items thead { display: table-header-group; }
img { max-width: 100%; height: auto; }
`;
    },

    /** Off-screen HTML fallback only (same metrics, no export-only zoom). */
    buildCoreCss(settings) {
        const s = this.normalizeSettings(settings);
        const printableHmm = this.sheetHeightMm(s) - this.marginMmForPreset(s.marginPreset) * 2;
        return `${this.buildContentCss(settings)}
body.gtes-invoice-export-body {
  min-height: 0;
  margin: 0;
  padding: 0;
}
`;
    },

    buildPrintMediaCss(settings) {
        const s = this.normalizeSettings(settings);
        const marginMm = this.marginMmForPreset(s.marginPreset);
        const page = this.pageSizeName(s);
        const orient = s.orientation === 'landscape' ? 'landscape' : 'portrait';
        const sheetW = `${this.sheetWidthMm(s)}mm`;
        const printableHmm = this.sheetHeightMm(s) - marginMm * 2;

        return `
@media print {
  @page {
    size: ${page} ${orient};
    margin: ${marginMm}mm;
  }
  body[data-gtes-print-kind="invoice"] #pdfPreviewModal,
  body[data-gtes-print-kind="invoice"] #pdfPreviewModal .modal-content,
  body[data-gtes-print-kind="invoice"] #pdfPreviewModal .modal-dialog {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    background: #fff !important;
  }
  body[data-gtes-print-kind="invoice"] #gtesInvoicePagesStage,
  body[data-gtes-print-kind="invoice"] #gtesInvoiceMeasureHost,
  body[data-gtes-print-kind="invoice"] #gtesInvoicePreviewNav,
  body[data-gtes-print-kind="invoice"] .gtes-a4-page-separator-label,
  body[data-gtes-print-kind="invoice"] .gtes-a4-page-sheet,
  body[data-gtes-print-kind="invoice"] .gtes-a4-printable-guide {
    display: none !important;
  }
  body[data-gtes-print-kind="invoice"] #pdfPreviewContainer.gtes-pdf-preview-sheet {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body[data-gtes-print-kind="invoice"] .gtes-invoice-footer-block,
  body[data-gtes-print-kind="invoice"] .gtes-invoice-footer-block *,
  body.gtes-invoice-pdf-capture .gtes-invoice-footer-block,
  body.gtes-invoice-pdf-capture .gtes-invoice-footer-block * {
    break-inside: auto !important;
    page-break-inside: auto !important;
    page-break-before: auto !important;
    break-before: auto !important;
  }
  body[data-gtes-print-kind="invoice"] .gtes-invoice-footer-block {
    display: block !important;
    width: 100% !important;
  }
  body[data-gtes-print-kind="invoice"] .gtes-invoice-footer-left,
  body[data-gtes-print-kind="invoice"] .gtes-invoice-footer-right,
  body.gtes-invoice-pdf-capture .gtes-invoice-footer-left,
  body.gtes-invoice-pdf-capture .gtes-invoice-footer-right {
    display: inline-block !important;
    width: 49% !important;
    vertical-align: top !important;
    box-sizing: border-box !important;
  }
  body[data-gtes-print-kind="invoice"] #gtesInvoicePrintSource,
  body.gtes-invoice-pdf-capture #gtesInvoicePrintSource {
    display: block !important;
    position: static !important;
    left: auto !important;
    visibility: visible !important;
    width: ${sheetW} !important;
    max-width: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }
  body.gtes-invoice-pdf-capture #pdfPreviewModal .modal-header,
  body.gtes-invoice-pdf-capture #gtesInvoicePreviewNav,
  body.gtes-invoice-pdf-capture #gtesInvoicePagesStage,
  body.gtes-invoice-pdf-capture #gtesInvoiceMeasureHost,
  body.gtes-invoice-pdf-capture .gtes-a4-page-separator-label {
    display: none !important;
  }
  body.gtes-invoice-pdf-capture #pdfPreviewModal,
  body.gtes-invoice-pdf-capture #pdfPreviewModal .modal-content,
  body.gtes-invoice-pdf-capture #pdfPreviewModal .modal-dialog,
  body.gtes-invoice-pdf-capture #pdfPreviewModal .modal-body,
  body.gtes-invoice-pdf-capture #pdfPreviewContainer {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  body[data-gtes-print-kind="invoice"] #pdfPreviewModal .gtes-pdf-preview-body {
    min-height: 0 !important;
    height: auto !important;
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
  }
  body[data-gtes-print-kind="invoice"] #pdfPreviewContainer {
    width: ${sheetW} !important;
    max-width: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    background: #fff !important;
    border: none !important;
    box-shadow: none !important;
    flex: 0 0 auto !important;
  }
  body[data-gtes-print-kind="invoice"] #gtesInvoicePrintSource,
  body[data-gtes-print-kind="invoice"] #pdfPreviewContainer .gtes-invoice-print-root,
  body[data-gtes-print-kind="invoice"] #pdfPreviewContainer .gtes-pdf-document.gtes-invoice-print-root {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    background: #fff !important;
    color: #000 !important;
  }
}
`;
    },

    installMeasureStyles(settings) {
        let el = document.getElementById('gtes-invoice-layout-measure');
        if (!el) {
            el = document.createElement('style');
            el.id = 'gtes-invoice-layout-measure';
            document.head.appendChild(el);
        }
        el.textContent = this.buildContentCss(settings);
    },

    installPrintStyles(settings) {
        let el = document.getElementById('gtes-invoice-layout-print');
        if (!el) {
            el = document.createElement('style');
            el.id = 'gtes-invoice-layout-print';
            document.head.appendChild(el);
        }
        el.textContent = this.buildPrintMediaCss(settings);
    },

    applyScreenPreview(root, settings) {
        if (!root) return;
        this.normalizeSettings(settings);
        root.style.width = '100%';
        root.style.maxWidth = '100%';
        root.style.padding = '0';
        root.style.margin = '0';
        root.style.boxSizing = 'border-box';
        root.style.zoom = '';
        root.style.transform = '';
        root.style.background = '#fff';
        root.style.color = '#000';
    },

    buildExportHtmlDocument(innerHtml, settings) {
        const css = this.buildCoreCss(settings);
        return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body class="gtes-invoice-export-body">${innerHtml}</body></html>`;
    },

    getPageMetrics(settings) {
        const s = this.mergeSettings(settings);
        const marginMm = this.marginMmForPreset(s.marginPreset);
        const sheetW = this.sheetWidthMm(s);
        const sheetH = this.sheetHeightMm(s);
        const landscape = s.orientation === 'landscape';
        const pageWidthMm = landscape ? sheetH : sheetW;
        const pageHeightMm = landscape ? sheetW : sheetH;
        const scaleFactor = (s.scale || 100) / 100;
        return {
            pageSize: this.pageSizeName(s),
            orientation: s.orientation || 'portrait',
            pageWidthMm,
            pageHeightMm,
            marginTopMm: marginMm,
            marginBottomMm: marginMm,
            marginLeftMm: marginMm,
            marginRightMm: marginMm,
            printableWidthMm: pageWidthMm - marginMm * 2,
            printableHeightMm: pageHeightMm - marginMm * 2,
            scalePercent: s.scale,
            scaleFactor,
            renderScale: scaleFactor
        };
    },

    _blockHeight(el) {
        if (!el) return 0;
        return Math.max(el.scrollHeight || 0, el.offsetHeight || 0, el.getBoundingClientRect().height || 0);
    },

    _heightBefore(root, target) {
        if (!root || !target || !root.contains(target)) return this._blockHeight(root);
        try {
            const range = document.createRange();
            range.setStart(root, 0);
            range.setEndBefore(target);
            const rect = range.getBoundingClientRect();
            return Math.max(rect.height, 0);
        } catch (_) {
            return Math.max(target.offsetTop - root.offsetTop, 0);
        }
    },

    _measureInvoiceSections(root, rootHeight) {
        const footer = root.querySelector('.gtes-invoice-footer-block');
        const totals = root.querySelector('.gtes-invoice-totals-summary');
        const bank = root.querySelector('.gtes-invoice-bank-details');
        const signature = root.querySelector('.gtes-pdf-signature-block');
        const lineItems = root.querySelector('.gtes-invoice-line-items');
        const beforeFooterHeight = footer ? this._heightBefore(root, footer) : rootHeight;
        const footerHeight = footer ? this._blockHeight(footer) : 0;
        return {
            rootHeight,
            lineItemsHeight: lineItems ? this._blockHeight(lineItems) : null,
            beforeFooterHeight,
            footerHeight,
            totalsSectionHeight: totals ? this._blockHeight(totals) : null,
            bankSectionHeight: bank ? this._blockHeight(bank) : null,
            signatureSectionHeight: signature ? this._blockHeight(signature) : null
        };
    },

    _paginateWithFooterRules(sections, effectivePrintableHeight) {
        const printableH = Math.max(1, effectivePrintableHeight);
        const { rootHeight, beforeFooterHeight, footerHeight } = sections;

        if (!footerHeight) {
            return Math.max(1, Math.ceil(rootHeight / printableH));
        }

        const before = beforeFooterHeight;
        const footer = footerHeight;

        if (before + footer <= printableH) return 1;
        if (before <= printableH) return 2;

        const pagesBefore = Math.ceil(before / printableH);
        const remainder = before % printableH;
        const spaceOnLast = remainder === 0 ? 0 : (printableH - remainder);
        if (remainder === 0 || footer > spaceOnLast) return pagesBefore + 1;
        return pagesBefore;
    },

    _mountPrintMeasureClone(root, settings) {
        const s = this.mergeSettings(settings);
        const metrics = this.getPageMetrics(s);
        const printableWidthPx = this.mmToPx(metrics.printableWidthMm);

        this.installMeasureStyles(s);

        let host = document.getElementById('gtesInvoiceMeasureHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'gtesInvoiceMeasureHost';
            host.className = 'gtes-invoice-measure-host';
            document.body.appendChild(host);
        }

        host.innerHTML = '';
        const shell = document.createElement('div');
        shell.className = 'gtes-invoice-print-measure-shell';
        shell.style.width = `${printableWidthPx}px`;
        shell.style.maxWidth = `${printableWidthPx}px`;
        shell.style.boxSizing = 'border-box';

        const clone = root.cloneNode(true);
        clone.style.margin = '0';
        clone.style.padding = '0';
        clone.style.width = '100%';
        clone.style.maxWidth = '100%';
        clone.style.boxSizing = 'border-box';
        clone.style.zoom = '';
        clone.style.transform = '';
        clone.style.border = 'none';
        clone.style.boxShadow = 'none';
        clone.classList.add('gtes-invoice-print-root');

        shell.appendChild(clone);
        host.appendChild(shell);
        void host.offsetHeight;

        return { clone, metrics, printableWidthPx };
    },

    /**
     * Page count using final print stylesheet + footer row break rules (matches printToPDF).
     */
    calculateActualPrintPages(root, settings) {
        if (!root) {
            return { pageCount: 1, previewHeight: 0, printHeight: 0, exportHeight: 0 };
        }

        const s = this.mergeSettings(settings);
        const { clone, metrics } = this._mountPrintMeasureClone(root, settings);
        const printableHeightPx = this.mmToPx(metrics.printableHeightMm);
        const scaleFactor = Math.max(0.5, Math.min(1.5, (s.scale || 100) / 100));
        const effectivePrintableHeight = printableHeightPx / scaleFactor;

        const printHeight = this._blockHeight(clone);
        const previewHeight = printHeight * scaleFactor;
        const exportHeight = printHeight;

        const sections = this._measureInvoiceSections(clone, printHeight);
        const geometricPages = Math.max(1, Math.ceil(printHeight / effectivePrintableHeight));
        const pageCount = Math.max(1, Math.ceil(printHeight / effectivePrintableHeight));

        const result = {
            pageCount,
            geometricPages,
            scalePercent: s.scale,
            printableHeightPx,
            effectivePrintableHeight,
            previewHeight,
            printHeight,
            exportHeight,
            sections,
            metrics
        };

        console.log('[InvoicePreviewLayout:calculateActualPrintPages]', result);
        return result;
    },

  logInvoiceDomHeights(label = 'print') {
        const previewRoot = document.querySelector('#gtesInvoicePagesStage .gtes-invoice-print-root');
        const printRoot = document.querySelector('#gtesInvoicePrintSource .gtes-invoice-print-root')
            || document.querySelector('#pdfPreviewContainer .gtes-invoice-print-root');
        const measure = (root) => {
            if (!root) return null;
            const lineItems = root.querySelector('.gtes-invoice-line-items');
            const footer = root.querySelector('.gtes-invoice-footer-block');
            const totals = root.querySelector('.gtes-invoice-totals-summary');
            const bank = root.querySelector('.gtes-invoice-bank-details');
            const signature = root.querySelector('.gtes-pdf-signature-block');
            const h = (el) => el ? Math.max(el.scrollHeight, el.offsetHeight) : 0;
            let beforeFooter = h(root);
            if (footer) {
                try {
                    const range = document.createRange();
                    range.setStart(root, 0);
                    range.setEndBefore(footer);
                    beforeFooter = range.getBoundingClientRect().height;
                } catch (_) {
                    beforeFooter = footer.offsetTop - root.offsetTop;
                }
            }
            return {
                rootHeight: h(root),
                lineItemsHeight: h(lineItems),
                beforeFooterHeight: beforeFooter,
                footerHeight: h(footer),
                totalsHeight: h(totals),
                bankHeight: h(bank),
                signatureHeight: h(signature),
                footerBreakInside: footer ? getComputedStyle(footer).breakInside : null,
                footerPageBreakInside: footer ? getComputedStyle(footer).pageBreakInside : null
            };
        };
        const payload = {
            label,
            previewDomHeight: previewRoot ? measure(previewRoot) : null,
            printDomHeight: printRoot ? measure(printRoot) : null
        };
        console.log('[InvoicePreviewLayout:dom-heights]', payload);
        return payload;
    },

    validatePageCountAgainstPdf(previewPageCount, pdfPageCount, context = '') {
        if (!Number.isFinite(previewPageCount) || !Number.isFinite(pdfPageCount)) return;
        if (previewPageCount === pdfPageCount) return;
        console.warn(
            `[InvoicePreviewLayout:page-count-mismatch]${context ? ` ${context}` : ''} ` +
            `Preview=${previewPageCount} PDF=${pdfPageCount}. ` +
            'Toolbar count does not match generated PDF — check footer breaks and scale.'
        );
    }
};

window.InvoicePreviewLayout = InvoicePreviewLayout;

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            const raw = localStorage.getItem('gtes_invoice_pdf_settings');
            const settings = raw ? JSON.parse(raw) : InvoicePreviewLayout.DEFAULT_SETTINGS;
            InvoicePreviewLayout.installPrintStyles(settings);
        } catch (_) {
            InvoicePreviewLayout.installPrintStyles();
        }
    });
}
