/**
 * Universal Document Engine V3 — layout diagnostics panel.
 */
const DocumentDiagnostics = {
    render(containerEl, diagnostics, extra = {}) {
        if (!containerEl || !diagnostics) return;
        const headerH = diagnostics.headerHeightPt ?? extra.headerHeightPt ?? '—';
        const rows = Array.isArray(diagnostics.rowsPerPage)
            ? diagnostics.rowsPerPage.join(', ')
            : (diagnostics.rowsPerPage ?? '—');
        containerEl.innerHTML = `<div class="doc-engine-diagnostics small">
            <strong>Layout Diagnostics</strong>
            Document Height: ${diagnostics.contentHeightPt ?? '—'} pt |
            Printable Height: ${diagnostics.printableHeightPt ?? '—'} pt |
            Pages Required: ${diagnostics.pagesRequired ?? diagnostics.pdfPageCount ?? '—'} |
            Rows/Page: ${rows} |
            Header: ${headerH} pt |
            Footer: ${diagnostics.footerHeightPt ?? '—'} pt |
            Totals: ${diagnostics.totalsHeightPt ?? '—'} pt
            ${diagnostics.pdfPageCount ? ` | PDF Pages: ${diagnostics.pdfPageCount}` : ''}
        </div>`;
        containerEl.classList.remove('d-none');
        containerEl.classList.add('d-block');
    },

    clear(containerEl) {
        if (!containerEl) return;
        containerEl.innerHTML = '';
        containerEl.classList.add('d-none');
        containerEl.classList.remove('d-block');
    }
};

window.DocumentDiagnostics = DocumentDiagnostics;
