/**
 * Paginated A4 HTML invoice preview (page count from dimensions — no PDF).
 */
const InvoicePagePreview = {
    A4_W: 794,
    A4_H: 1123,
    LETTER_W: 816,
    LETTER_H: 1056,

    _state: {
        pageCount: 1,
        currentPage: 1
    },

    mmToPx(mm) {
        return (mm * 96) / 25.4;
    },

    _mergeSettings(settings) {
        const base = typeof InvoicePreviewLayout !== 'undefined'
            ? { ...InvoicePreviewLayout.DEFAULT_SETTINGS, orientation: 'portrait' }
            : { pageSize: 'A4', marginPreset: 'normal', orientation: 'portrait', scale: 100 };
        const s = { ...base, ...settings };
        const scale = parseInt(s.scale, 10);
        return {
            ...s,
            orientation: s.orientation === 'landscape' ? 'landscape' : 'portrait',
            scale: Number.isFinite(scale) ? Math.min(150, Math.max(50, scale)) : 100
        };
    },

    getSheetPx(settings) {
        const s = this._mergeSettings(settings);
        const portrait = (s.orientation || 'portrait') !== 'landscape';
        const isLetter = s.pageSize === 'Letter';
        const baseW = isLetter ? this.LETTER_W : this.A4_W;
        const baseH = isLetter ? this.LETTER_H : this.A4_H;
        return {
            pageWidthPx: portrait ? baseW : baseH,
            pageHeightPx: portrait ? baseH : baseW,
            orientation: portrait ? 'portrait' : 'landscape',
            pageSize: isLetter ? 'Letter' : 'A4'
        };
    },

    getMarginPx(settings) {
        const preset = settings?.marginPreset || 'normal';
        const mm = typeof InvoicePreviewLayout !== 'undefined'
            ? InvoicePreviewLayout.marginMmForPreset(preset)
            : ({ none: 0, narrow: 5, normal: 8 }[preset] ?? 8);
        return this.mmToPx(mm);
    },

    getLayout(settings) {
        const sheet = this.getSheetPx(settings);
        const marginPx = this.getMarginPx(settings);
        const scale = Math.min(150, Math.max(50, parseInt(settings?.scale, 10) || 100)) / 100;
        const printableWidthPx = Math.max(100, sheet.pageWidthPx - marginPx * 2);
        const printableHeightPx = Math.max(100, sheet.pageHeightPx - marginPx * 2);
        return {
            ...sheet,
            marginPx,
            marginMm: marginPx * 25.4 / 96,
            printableWidthPx,
            printableHeightPx,
            contentScale: scale
        };
    },

    _getHosts() {
        return {
            container: document.getElementById('pdfPreviewContainer'),
            measure: document.getElementById('gtesInvoiceMeasureHost'),
            stage: document.getElementById('gtesInvoicePagesStage'),
            printSource: document.getElementById('gtesInvoicePrintSource'),
            pageCountEl: document.getElementById('gtesInvPageCount'),
            pageNavLabel: document.getElementById('gtesInvPageNavLabel'),
            prevBtn: document.getElementById('gtesInvPrevPage'),
            nextBtn: document.getElementById('gtesInvNextPage')
        };
    },

    _resolveScrollElement() {
        const stage = document.getElementById('gtesInvoicePagesStage');
        const candidates = [
            document.querySelector('#pdfPreviewModal .gtes-pdf-preview-body'),
            document.getElementById('pdfPreviewContainer'),
            document.querySelector('#pdfPreviewModal .modal-body'),
            stage?.parentElement
        ].filter(Boolean);
        for (const el of candidates) {
            const st = window.getComputedStyle(el);
            const canScroll = (st.overflowY === 'auto' || st.overflowY === 'scroll')
                && el.scrollHeight > el.clientHeight + 4;
            if (canScroll) return el;
        }
        let node = stage;
        while (node && node !== document.body) {
            const st = window.getComputedStyle(node);
            if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 4) {
                return node;
            }
            node = node.parentElement;
        }
        return candidates[0] || document.getElementById('pdfPreviewContainer');
    },

    _scrollTopForFrame(frame, scrollEl) {
        if (!frame || !scrollEl) return 0;
        const frameRect = frame.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        return scrollEl.scrollTop + (frameRect.top - scrollRect.top) - 12;
    },

    _prepareRootClone(root) {
        const clone = root.cloneNode(true);
        clone.style.margin = '0';
        clone.style.padding = '0';
        clone.style.width = '100%';
        clone.style.maxWidth = '100%';
        clone.style.boxSizing = 'border-box';
        clone.style.zoom = '';
        clone.style.transform = '';
        clone.classList.add('gtes-invoice-print-root');
        return clone;
    },

    measureContentHeight(root, settings) {
        const layout = this.getLayout(settings);

        if (typeof InvoicePreviewLayout !== 'undefined' && InvoicePreviewLayout.calculateActualPrintPages) {
            const calc = InvoicePreviewLayout.calculateActualPrintPages(root, settings);
            return {
                contentHeightPx: calc.printHeight,
                pageCount: calc.pageCount,
                layout,
                printMetrics: calc
            };
        }

        return { contentHeightPx: 0, pageCount: 1, layout };
    },

    _buildPageFrame(pageIndex, pageCount, root, layout) {
        const i = pageIndex;
        const scale = layout.contentScale || 1;
        const sliceHeight = layout.printableHeightPx / scale;
        const offsetY = (i - 1) * sliceHeight;

        const frame = document.createElement('section');
        frame.className = 'gtes-a4-page-frame';
        frame.id = `gtes-a4-page-${i}`;
        frame.dataset.page = String(i);

        const label = document.createElement('div');
        label.className = 'gtes-a4-page-separator-label';
        label.textContent = `Page ${i}`;

        const sheet = document.createElement('div');
        sheet.className = 'gtes-a4-page-sheet';
        sheet.style.width = `${layout.pageWidthPx}px`;
        sheet.style.height = `${layout.pageHeightPx}px`;

        const guide = document.createElement('div');
        guide.className = 'gtes-a4-printable-guide';
        guide.style.top = `${layout.marginPx}px`;
        guide.style.left = `${layout.marginPx}px`;
        guide.style.right = `${layout.marginPx}px`;
        guide.style.bottom = `${layout.marginPx}px`;
        guide.title = 'Printable area';

        const viewport = document.createElement('div');
        viewport.className = 'gtes-a4-page-viewport';
        viewport.style.width = `${layout.printableWidthPx}px`;
        viewport.style.height = `${layout.printableHeightPx}px`;
        viewport.style.left = `${layout.marginPx}px`;
        viewport.style.top = `${layout.marginPx}px`;

        const strip = document.createElement('div');
        strip.className = 'gtes-a4-page-content-strip';
        strip.style.transform = `translateY(-${offsetY}px)`;

        const scaled = document.createElement('div');
        scaled.className = 'gtes-a4-page-content-scaled';
        scaled.style.transformOrigin = 'top left';
        if (layout.contentScale !== 1) {
            scaled.style.transform = `scale(${layout.contentScale})`;
            scaled.style.width = `${layout.printableWidthPx / layout.contentScale}px`;
        }

        const clone = this._prepareRootClone(root);
        scaled.appendChild(clone);
        strip.appendChild(scaled);
        viewport.appendChild(strip);
        sheet.appendChild(guide);
        sheet.appendChild(viewport);
        frame.appendChild(label);
        frame.appendChild(sheet);

        return frame;
    },

    _updateChrome(pageCount, currentPage) {
        const hosts = this._getHosts();
        if (hosts.pageCountEl) {
            hosts.pageCountEl.textContent = `Pages: ${pageCount}`;
        }
        if (hosts.pageNavLabel) {
            hosts.pageNavLabel.textContent = `Page ${currentPage} of ${pageCount}`;
        }
        if (hosts.prevBtn) hosts.prevBtn.disabled = currentPage <= 1;
        if (hosts.nextBtn) hosts.nextBtn.disabled = currentPage >= pageCount;
        document.querySelectorAll('#gtesInvoicePagesStage .gtes-a4-page-frame').forEach((frame) => {
            const p = parseInt(frame.dataset.page, 10);
            frame.classList.toggle('gtes-a4-page-frame-active', p === currentPage);
        });
    },

    _scrollToPage(pageIndex) {
        const frame = document.getElementById(`gtes-a4-page-${pageIndex}`);
        if (!frame) return;

        const scrollEl = this._resolveScrollElement();
        this._programmaticScroll = true;
        clearTimeout(this._scrollUnlockTimer);

        const top = this._scrollTopForFrame(frame, scrollEl);
        scrollEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

        const container = document.getElementById('pdfPreviewContainer');
        if (container && container !== scrollEl) {
            const top2 = this._scrollTopForFrame(frame, container);
            container.scrollTo({ top: Math.max(0, top2), behavior: 'smooth' });
        }

        this._state.currentPage = pageIndex;
        this._updateChrome(this._state.pageCount, pageIndex);

        this._scrollUnlockTimer = setTimeout(() => {
            this._programmaticScroll = false;
        }, 500);
    },

    _syncVisiblePageFromObserver() {
        this._applyVisiblePageFromRatios();
    },

    _teardownPageObserver() {
        if (this._pageObserver) {
            this._pageObserver.disconnect();
            this._pageObserver = null;
        }
        this._visibleRatios = new Map();
    },

    _setupPageObserver() {
        this._teardownPageObserver();
        const scroller = this._resolveScrollElement();
        const stage = document.getElementById('gtesInvoicePagesStage');
        if (!scroller || !stage) return;

        this._visibleRatios = new Map();
        const frames = stage.querySelectorAll('.gtes-a4-page-frame');
        if (!frames.length) return;

        this._pageObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const page = parseInt(entry.target.dataset.page, 10);
                if (!Number.isFinite(page)) return;
                this._visibleRatios.set(page, entry.isIntersecting ? entry.intersectionRatio : 0);
            });
            if (this._programmaticScroll) return;
            this._applyVisiblePageFromRatios();
        }, {
            root: scroller,
            threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]
        });

        frames.forEach((frame) => this._pageObserver.observe(frame));
    },

    _applyVisiblePageFromRatios() {
        if (!this._visibleRatios || !this._visibleRatios.size) return;
        let bestPage = 1;
        let bestRatio = 0;
        this._visibleRatios.forEach((ratio, page) => {
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestPage = page;
            }
        });
        if (bestRatio > 0.05 && bestPage !== this._state.currentPage) {
            this._state.currentPage = bestPage;
            this._updateChrome(this._state.pageCount, bestPage);
        }
    },

    _bindNavigationOnce() {
        if (this._navBound) return;
        this._navBound = true;
        const hosts = this._getHosts();
        if (hosts.prevBtn) {
            hosts.prevBtn.addEventListener('click', () => {
                const target = Math.max(1, this._state.currentPage - 1);
                this._scrollToPage(target);
            });
        }
        if (hosts.nextBtn) {
            hosts.nextBtn.addEventListener('click', () => {
                const target = Math.min(this._state.pageCount, this._state.currentPage + 1);
                this._scrollToPage(target);
            });
        }
        if (!this._scrollListenerBound) {
            this._scrollListenerBound = true;
            const onScroll = () => {
                if (this._programmaticScroll) return;
                clearTimeout(this._scrollDebounce);
                this._scrollDebounce = setTimeout(() => this._syncVisiblePageFromObserver(), 80);
            };
            const scrollEl = this._resolveScrollElement();
            scrollEl?.addEventListener('scroll', onScroll, { passive: true });
            const container = document.getElementById('pdfPreviewContainer');
            if (container && container !== scrollEl) {
                container.addEventListener('scroll', onScroll, { passive: true });
            }
        }
    },

    render(root, settings, { printRoot } = {}) {
        const hosts = this._getHosts();
        if (!hosts.stage || !root) return { pageCount: 1 };

        this._bindNavigationOnce();
        const { contentHeightPx, pageCount, layout, printMetrics } = this.measureContentHeight(root, settings);
        this._state.pageCount = pageCount;
        this._state.currentPage = Math.min(this._state.currentPage, pageCount) || 1;
        this._lastPrintMetrics = printMetrics || null;

        if (hosts.printSource && printRoot) {
            hosts.printSource.innerHTML = '';
            const printClone = this._prepareRootClone(printRoot);
            hosts.printSource.appendChild(printClone);
        }

        hosts.stage.innerHTML = '';
        for (let p = 1; p <= pageCount; p++) {
            hosts.stage.appendChild(this._buildPageFrame(p, pageCount, root, layout));
        }

        this._updateChrome(pageCount, this._state.currentPage);
        requestAnimationFrame(() => {
            this._setupPageObserver();
            if (this._state.currentPage > 1) {
                this._scrollToPage(this._state.currentPage);
            }
        });

        return { pageCount, layout, contentHeightPx, printMetrics };
    },

    reset() {
        this._teardownPageObserver();
        const hosts = this._getHosts();
        if (hosts.stage) hosts.stage.innerHTML = '';
        if (hosts.measure) hosts.measure.innerHTML = '';
        if (hosts.printSource) hosts.printSource.innerHTML = '';
        this._state = { pageCount: 1, currentPage: 1 };
    }
};

window.InvoicePagePreview = InvoicePagePreview;
