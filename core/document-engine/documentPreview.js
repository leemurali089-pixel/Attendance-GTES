/**
 * Universal Document Engine V3 — ERP preview (A4 frames, page nav, authoritative page count).
 */
const DocumentPreview = {
    _state: { pageCount: 1, currentPage: 1 },
    _observer: null,
    _navBound: false,

    _stageEl() {
        return document.getElementById('gtesDocumentEngineStage')
            || document.getElementById('gtesInvoiceV3Stage');
    },

    _diagEl() {
        return document.getElementById('gtesDocumentEngineDiagnostics')
            || document.getElementById('gtesInvoiceV3Diagnostics');
    },

    _getScrollRoot() {
        return document.querySelector('#pdfPreviewModal .gtes-pdf-preview-body')
            || document.getElementById('pdfPreviewContainer');
    },

    _pageId(n) {
        return `doc-engine-page-${n}`;
    },

    _scrollToPage(n) {
        const frame = document.getElementById(this._pageId(n));
        const scroller = this._getScrollRoot();
        if (!frame || !scroller) return;
        const top = scroller.scrollTop + frame.getBoundingClientRect().top
            - scroller.getBoundingClientRect().top - 10;
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        this._state.currentPage = n;
        this._updateNav();
    },

    syncPageCount(pageCount) {
        const pages = Math.max(1, parseInt(pageCount, 10) || 1);
        this._state.pageCount = pages;
        if (this._state.currentPage > pages) this._state.currentPage = pages;
        if (typeof InvoicePreviewV3 !== 'undefined') {
            InvoicePreviewV3._state.pageCount = pages;
            if (InvoicePreviewV3._state.currentPage > pages) {
                InvoicePreviewV3._state.currentPage = pages;
            }
        }
        this._updateNav();
    },

    applyPageSettings(host, settings = {}) {
        if (!host) return;
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
        host.querySelectorAll('.doc-engine-page-frame, .inv-v3-page-frame').forEach((frame) => {
            frame.style.maxWidth = `${dims.w * scale}mm`;
        });
        host.querySelectorAll('.inv-v3-page, .inv-v3-page-sheet').forEach((page) => {
            page.style.width = `${dims.w}mm`;
            page.style.minHeight = `${dims.h}mm`;
            page.style.padding = `${marginMm}mm`;
            page.style.transform = scale !== 1 ? `scale(${scale})` : '';
            page.style.transformOrigin = 'top center';
            page.style.marginBottom = scale !== 1 ? `${(dims.h * (scale - 1))}mm` : '';
        });
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
        if (prev) prev.disabled = this._state.currentPage <= 1;
        if (next) next.disabled = this._state.currentPage >= this._state.pageCount;
        const host = this._stageEl();
        host?.querySelectorAll('.doc-engine-page-frame, .inv-v3-page-frame').forEach((el) => {
            const p = parseInt(el.dataset.page, 10);
            el.classList.toggle('doc-engine-page-active', p === this._state.currentPage);
            el.classList.toggle('inv-v3-page-active', p === this._state.currentPage);
        });
    },

    _bindNavOnce() {
        if (this._navBound) return;
        this._navBound = true;
        const onPrev = () => this._scrollToPage(Math.max(1, this._state.currentPage - 1));
        const onNext = () => this._scrollToPage(Math.min(this._state.pageCount, this._state.currentPage + 1));
        document.getElementById('gtesDocPrevPage')?.addEventListener('click', onPrev);
        document.getElementById('gtesDocNextPage')?.addEventListener('click', onNext);
        document.getElementById('gtesInvPrevPage')?.addEventListener('click', onPrev);
        document.getElementById('gtesInvNextPage')?.addEventListener('click', onNext);
        const scroller = this._getScrollRoot();
        if (scroller && !this._observer) {
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
        }
    },

    render(layoutResult, adapter) {
        if (adapter?.renderPreview) {
            return adapter.renderPreview(layoutResult, this._stageEl());
        }
        if (typeof InvoicePreviewV3 !== 'undefined') {
            return InvoicePreviewV3.render(layoutResult, this._stageEl());
        }
        const host = this._stageEl();
        if (!host || !layoutResult?.pages) return;
        const { pages, doc, settings } = layoutResult;
        this.syncPageCount(pages.length);
        this._state.currentPage = 1;
        host.innerHTML = pages.map((p) => `<section class="doc-engine-page-frame" data-page="${p.pageNumber}">Page ${p.pageNumber}</section>`).join('');
        this.applyPageSettings(host, settings || layoutResult.settings || {});
        this._bindNavOnce();
        host.querySelectorAll('.doc-engine-page-frame').forEach((f) => this._observer?.observe(f));
        this._updateNav();
        if (layoutResult.diagnostics) {
            DocumentDiagnostics.render(this._diagEl(), layoutResult.diagnostics);
        }
    },

    reset() {
        const host = this._stageEl();
        if (host) host.innerHTML = '';
        DocumentDiagnostics.clear(this._diagEl());
        if (typeof InvoicePreviewV3 !== 'undefined') InvoicePreviewV3.reset();
        this._observer?.disconnect();
        this._observer = null;
        this._state = { pageCount: 1, currentPage: 1 };
    }
};

window.DocumentPreview = DocumentPreview;
