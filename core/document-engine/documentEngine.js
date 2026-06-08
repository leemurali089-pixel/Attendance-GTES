/**
 * Universal Document Engine V3 — single pipeline for all printable documents.
 * Data → Template (adapter) → Preview → PDF → Print → Download
 */
const DocumentEngine = {
    DIAGNOSTICS_KEY: 'gtes_document_engine_diagnostics',
    /** Bump when pdfmake layout changes — invalidates cached PDF bytes in-session. */
    PDF_BYTE_VERSION: '2.0',

    _session: null,
    _modalCleanup: false,

    isNative(type) {
        return DocumentTemplates.hasNative(type);
    },

    _adapter(type) {
        return DocumentTemplates.get(type);
    },

    _resolveType(typeOrOpts, id) {
        if (typeof typeOrOpts === 'object' && typeOrOpts !== null) {
            return { type: typeOrOpts.type, id: typeOrOpts.id, action: typeOrOpts.action };
        }
        return { type: typeOrOpts, id, action: 'preview' };
    },

    _stageEl() {
        return document.getElementById('gtesDocumentEngineStage')
            || document.getElementById('gtesInvoiceV3Stage');
    },

    deactivateEngineMode() {
        this._session = null;
        this._setEngineMode(false);
    },

    /** Legacy HTML preview (vouchers, etc.) — show invoice toolbar without engine session. */
    activateLegacyToolbarMode(opts = {}) {
        const { subtitle, pageCount = 1, hideCopyPicker = true } = opts;
        this._session = null;

        if (typeof DocumentPreviewHost !== 'undefined') {
            DocumentPreviewHost.ensure();
        }

        const modal = document.getElementById('pdfPreviewModal');
        const previewContainer = document.getElementById('pdfPreviewContainer');
        if (previewContainer) {
            previewContainer.classList.remove('gtes-invoice-paginated-preview', 'gtes-document-engine-preview');
        }
        if (modal) {
            modal.classList.remove('gtes-document-engine-mode', 'gtes-invoice-v3-mode');
        }

        const bar = document.getElementById('gtesDocumentPdfSettingsBar')
            || document.getElementById('gtesInvoicePdfSettingsBar');
        bar?.classList.remove('d-none');
        bar?.classList.add('d-flex');

        const docNav = document.getElementById('gtesDocumentPreviewNav');
        const invNav = document.getElementById('gtesInvoicePreviewNav');
        if (docNav) {
            docNav.classList.add('d-none');
            docNav.classList.remove('d-flex');
        }
        if (invNav) {
            invNav.classList.remove('d-none');
            invNav.classList.add('d-flex');
        }

        const primary = document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage');
        primary?.classList.add('d-none');
        primary?.classList.remove('d-flex');
        const invoiceV3Stage = document.getElementById('gtesInvoiceV3Stage');
        if (invoiceV3Stage && invoiceV3Stage !== primary) {
            invoiceV3Stage.classList.add('d-none');
            invoiceV3Stage.classList.remove('d-flex');
        }

        const diag = document.getElementById('gtesDocumentEngineDiagnostics')
            || document.getElementById('gtesInvoiceV3Diagnostics');
        if (diag) {
            diag.classList.add('d-none');
            diag.classList.remove('d-block');
        }

        document.getElementById('gtesInvoicePagesStage')?.classList.add('d-none');
        document.getElementById('gtesInvoiceMeasureHost')?.classList.add('d-none');
        document.getElementById('gtesInvoicePrintSource')?.classList.add('d-none');

        const copyWrap = document.getElementById('gtesDocCopyPicker')
            || document.querySelector('.gtes-doc-copy-wrap');
        if (hideCopyPicker) {
            copyWrap?.classList.add('d-none');
            copyWrap?.previousElementSibling?.classList.add('d-none');
        }

        const debugFooter = document.getElementById('gtesDocumentEngineDebugFooter');
        if (debugFooter) {
            debugFooter.classList.add('d-none');
            debugFooter.classList.remove('d-block');
        }

        const subtitleEl = document.getElementById('pdfPreviewSubtitle');
        if (subtitleEl) {
            if (subtitle) {
                subtitleEl.textContent = subtitle;
                subtitleEl.classList.remove('d-none');
            } else {
                subtitleEl.classList.add('d-none');
            }
        }

        const pages = Math.max(1, parseInt(pageCount, 10) || 1);
        const badge = document.getElementById('gtesDocPageCount')
            || document.getElementById('gtesInvPageCount');
        if (badge) badge.textContent = `Pages: ${pages}`;

        const navLabel = document.getElementById('gtesDocPageNavLabel')
            || document.getElementById('gtesInvPageNavLabel');
        if (navLabel) navLabel.textContent = `Page 1 of ${pages}`;

        const prevBtn = document.getElementById('gtesDocPrevPage')
            || document.getElementById('gtesInvPrevPage');
        const nextBtn = document.getElementById('gtesDocNextPage')
            || document.getElementById('gtesInvNextPage');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = pages <= 1;

        const settings = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.get(null)
            : { pageSize: 'A4', orientation: 'portrait', marginPreset: 'normal', scale: 100 };
        this._syncSettingsUi(null, null, settings);

        if (typeof DocumentPreview !== 'undefined') DocumentPreview.reset();
    },

    _setEngineMode(active, type) {
        if (typeof DocumentPreviewHost !== 'undefined') {
            DocumentPreviewHost.ensure();
            if (active) {
                DocumentPreviewHost.prepareEngine();
            } else {
                DocumentPreviewHost.clearLegacy();
            }
        }

        const modal = document.getElementById('pdfPreviewModal');
        const previewContainer = document.getElementById('pdfPreviewContainer');
        if (previewContainer) {
            previewContainer.classList.toggle('gtes-invoice-paginated-preview', !!active);
            previewContainer.classList.toggle('gtes-document-engine-preview', !!active);
        }
        if (modal) {
            modal.classList.toggle('gtes-document-engine-mode', !!active);
            modal.classList.toggle('gtes-invoice-v3-mode', !!active);
        }
        const bar = document.getElementById('gtesDocumentPdfSettingsBar')
            || document.getElementById('gtesInvoicePdfSettingsBar');
        bar?.classList.toggle('d-none', !active);
        bar?.classList.toggle('d-flex', !!active);

        const docNav = document.getElementById('gtesDocumentPreviewNav');
        const invNav = document.getElementById('gtesInvoicePreviewNav');
        if (docNav) {
            docNav.classList.toggle('d-none', !active);
            docNav.classList.toggle('d-flex', !!active);
            invNav?.classList.add('d-none');
            invNav?.classList.remove('d-flex');
        } else if (invNav) {
            invNav.classList.toggle('d-none', !active);
            invNav.classList.toggle('d-flex', !!active);
        }

        const primary = document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage');
        primary?.classList.toggle('d-none', !active);
        primary?.classList.toggle('d-flex', !!active);
        const invoiceV3Stage = document.getElementById('gtesInvoiceV3Stage');
        if (invoiceV3Stage && invoiceV3Stage !== primary) {
            invoiceV3Stage.classList.add('d-none');
            invoiceV3Stage.classList.remove('d-flex');
        }
        const diag = document.getElementById('gtesDocumentEngineDiagnostics')
            || document.getElementById('gtesInvoiceV3Diagnostics');
        if (diag) {
            diag.classList.toggle('d-none', !active || !this._diagnosticsEnabled());
            diag.classList.toggle('d-block', !!active && this._diagnosticsEnabled());
        }

        document.getElementById('gtesInvoicePagesStage')?.classList.toggle('d-none', !!active);
        document.getElementById('gtesInvoiceMeasureHost')?.classList.toggle('d-none', !!active);
        document.getElementById('gtesInvoicePrintSource')?.classList.toggle('d-none', !!active);

        const copyWrap = document.getElementById('gtesDocCopyPicker')
            || document.querySelector('.gtes-doc-copy-wrap');
        const showCopy = active && DocumentTemplates.supportsCopyType(type);
        copyWrap?.classList.toggle('d-none', !showCopy);
        copyWrap?.previousElementSibling?.classList.toggle('d-none', !showCopy);

        const debugFooter = document.getElementById('gtesDocumentEngineDebugFooter');
        if (debugFooter) {
            debugFooter.classList.toggle('d-none', !active);
            debugFooter.classList.toggle('d-block', !!active);
        }

        const pdfLegacyStage = document.getElementById('gtesPdfLegacyStage');
        if (pdfLegacyStage) {
            pdfLegacyStage.classList.toggle('d-none', !!active);
        }

        if (!active) DocumentPreview.reset();
    },

    _currentSettings(adapter) {
        const modal = document.getElementById('pdfPreviewModal');
        const engineActive = modal?.classList.contains('gtes-document-engine-mode')
            || modal?.classList.contains('gtes-invoice-v3-mode');
        if (engineActive && modal?.classList.contains('show')) {
            return DocumentSettings.normalize(
                DocumentSettings.merge(adapter, DocumentSettings.readFromUi())
            );
        }
        return DocumentSettings.normalize(DocumentSettings.get(adapter));
    },

    _settingsFingerprint(settings, copyTypes = ['original']) {
        const copyFp = DocumentSettings.copyTypesFingerprint(copyTypes);
        return `${DocumentSettings.fingerprint(settings)}|${copyFp}|${this.PDF_BYTE_VERSION}`;
    },

    _logPdfSettings(settings, doc) {
        const log = DocumentSettings.toLog(settings, doc?.copyType);
        console.log('[DocumentEngine] PDF generation settings', log);
        console.log('[DocumentEngine] Orientation selected:', log.orientation);
    },

    /** Single PDF byte source — Download, Save, and Print all use this. */
    async _ensurePdfBytes(type, id) {
        const adapter = this._adapter(type);
        const settings = this._currentSettings(adapter);
        const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
        const copyTypes = DocumentSettings.resolveCopyTypes(adapter, id, modalOpen);
        const fingerprint = this._settingsFingerprint(settings, copyTypes);
        const session = this._session;

        if (session?.type === type && session?.id === id
            && session.pdfBytes?.length
            && session.pdfSettingsFingerprint === fingerprint) {
            console.log('[DocumentEngine] reusing cached PDF bytes', DocumentSettings.toLog(settings));
            return { bytes: session.pdfBytes, settings, fingerprint };
        }

        const doc = await adapter.buildDocument(id, settings);
        if (!doc) throw new Error('Document not found');
        doc.copyTypes = copyTypes;
        doc.copyType = copyTypes[0] || 'original';
        doc.copyLabel = typeof InvoiceDataV3 !== 'undefined'
            ? InvoiceDataV3.copyLabel(doc.copyType)
            : DocumentSettings.copyLabelUpper(doc.copyType);
        this._logPdfSettings(settings, doc);
        const bytes = await DocumentPdfGenerator.generatePdfBytes(doc, adapter, settings);

        if (session && session.type === type && session.id === id) {
            session.pdfBytes = bytes;
            session.pdfSettingsFingerprint = fingerprint;
            session.settings = settings;
            session.lastPdfSettings = { ...settings };
            session.pdfReady = true;
            session.pdfError = null;
        }

        return { bytes, settings, fingerprint };
    },

    _diagnosticsEnabled() {
        try {
            return localStorage.getItem(this.DIAGNOSTICS_KEY) === '1'
                || new URLSearchParams(location.search).get('docDiagnostics') === '1';
        } catch (_) {
            return false;
        }
    },

    _bindModalCleanup() {
        if (this._modalCleanup) return;
        this._modalCleanup = true;
        document.getElementById('pdfPreviewModal')?.addEventListener('hidden.bs.modal', () => {
            if (typeof DeliveryUI !== 'undefined' && DeliveryUI.syncPreviewConvertActions) {
                DeliveryUI.syncPreviewConvertActions(null);
            }
            this._setEngineMode(false);
            this._session = null;
        });
    },

    _syncSettingsUi(adapter, entityId, settings) {
        const pageSize = document.getElementById('gtesDocSetPageSize')
            || document.getElementById('gtesInvSetPageSize');
        const orientation = document.getElementById('gtesDocSetOrientation')
            || document.getElementById('gtesInvSetOrientation');
        const margin = document.getElementById('gtesDocSetMargin')
            || document.getElementById('gtesInvSetMargin');
        const scale = document.getElementById('gtesDocSetScale')
            || document.getElementById('gtesInvSetScale');
        if (pageSize) pageSize.value = settings.pageSize || 'A4';
        if (orientation) orientation.value = settings.orientation || 'portrait';
        if (margin) margin.value = settings.marginPreset || 'normal';
        if (scale) scale.value = settings.scale ?? 100;
        if (adapter && typeof DocumentCopyPicker !== 'undefined') {
            DocumentCopyPicker.sync(DocumentSettings.getCopyTypes(adapter, entityId));
        }
    },

    async _onToolbarSettingsChanged() {
        const session = this._session;
        if (!session?.type || !session?.id) {
            console.warn('[DocumentEngine] Settings changed but no active session');
            return;
        }
        if (this._settingsDebounce) clearTimeout(this._settingsDebounce);
        this._settingsDebounce = setTimeout(async () => {
            const adapter = session.adapter || this._adapter(session.type);
            const settings = DocumentSettings.merge(adapter, DocumentSettings.readFromUi());
            DocumentSettings.save(adapter, settings);
            const scaleEl = document.getElementById('gtesInvSetScale');
            if (scaleEl) scaleEl.value = settings.scale;
            console.log('[DocumentEngine] Settings applied', settings);
            await this._refreshPreview(session.type, session.id);
        }, 200);
    },

    async _onCopyTypesChanged() {
        const session = this._session;
        if (!session?.type || !session?.id) return;
        const adapter = session.adapter || this._adapter(session.type);
        const types = DocumentSettings.readCopyTypesFromUi();
        await DocumentSettings.setCopyTypes(adapter, session.id, types);
        session.pdfBytes = null;
        session.pdfSettingsFingerprint = null;
        await this._refreshPreview(session.type, session.id);
        this._prefetchPdf(session.type, session.id);
    },

    /** @deprecated use _onCopyTypesChanged */
    async _onCopyTypeChanged() {
        return this._onCopyTypesChanged();
    },

    async _refreshPreview(type, id) {
        const adapter = this._adapter(type);
        const settings = this._currentSettings(adapter);
        const doc = await adapter.buildDocument(id, settings);
        if (!doc) return;
        const layout = DocumentLayout.paginate(doc, adapter, settings);
        DocumentPreview.render(layout, adapter);
        this._session = {
            ...this._session,
            type,
            id,
            layout,
            adapter,
            settings,
            pdfBytes: null,
            pdfSettingsFingerprint: null,
            pdfReady: false,
            pdfError: null,
            lastPdfSettings: null,
            lastPrintSettings: null,
            printReady: !!window.electronAPI?.printPdfBuffer,
            downloadReady: true
        };
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview.syncPageCount(layout.pages?.length || 1);
        }
        if (typeof DocumentToolbar !== 'undefined') DocumentToolbar.rewireActions(this);
        this._updateDebugPanel(settings);
        this._prefetchPdf(type, id);
    },

    async _prefetchPdf(type, id) {
        try {
            const { bytes, settings } = await this._ensurePdfBytes(type, id);
            if (!this._session || this._session.id !== id) return;
            const text = new TextDecoder('latin1').decode(bytes);
            const m = text.match(/\/Type\s*\/Page\b(?!s)/g);
            const pdfPages = m ? m.length : 1;
            this._session.pdfPageCount = pdfPages;
            this._updateDebugPanel(settings);
        } catch (e) {
            console.error('[DocumentEngine] PDF prefetch failed', e);
            if (this._session?.id === id) {
                this._session.pdfReady = false;
                this._session.pdfError = e.message;
                this._updateDebugPanel(this._session.settings);
            }
        }
    },

    _fmtSettingsRow(label, settings) {
        if (!settings) return `<div class="gtes-doc-debug-row"><strong>${label}:</strong> —</div>`;
        return `<div class="gtes-doc-debug-row"><strong>${label}:</strong> `
            + `Ori ${settings.orientation} | Scale ${settings.scale}% | `
            + `Margins ${settings.marginPreset} (${DocumentSettings.marginMm(settings.marginPreset)}mm) | `
            + `Size ${settings.pageSize}</div>`;
    },

    _updateDebugPanel(previewSettings) {
        const el = document.getElementById('gtesDocumentEngineDebugFooter');
        if (!el) return;
        const s = this._session || {};
        const pages = s.layout?.pages?.length || s.pdfPageCount || '—';
        const pdfSettings = s.lastPdfSettings || (s.pdfReady ? previewSettings : null);
        const printSettings = s.lastPrintSettings || pdfSettings;
        el.innerHTML = `
            ${this._fmtSettingsRow('Preview', previewSettings)}
            ${this._fmtSettingsRow('PDF', pdfSettings)}
            ${this._fmtSettingsRow('Print', printSettings)}
            <div class="gtes-doc-debug-row"><strong>Pages:</strong> ${pages} | `
            + `<strong>PDF Ready:</strong> ${s.pdfReady ? 'Yes' : (s.pdfError ? `No (${s.pdfError})` : '…')} | `
            + `<strong>Same bytes for Download/Save/Print:</strong> Yes</div>`;
    },

    async _handlePrint() {
        const s = this._session;
        if (!s?.type || !s?.id) {
            App.showNotification('Open a document preview first', 'warning');
            return;
        }
        return this.print({ type: s.type, id: s.id });
    },

    async _handleSavePdf() {
        return this._handleDownload();
    },

    async _handleDownload() {
        const s = this._session;
        if (!s?.type || !s?.id) {
            App.showNotification('Open a document preview first', 'warning');
            return;
        }
        console.log('[DocumentEngine] download()', s.type, s.id);
        return this.download({ type: s.type, id: s.id });
    },

    async buildPackage(type, id) {
        const adapter = this._adapter(type);
        if (!adapter) throw new Error(`No adapter for ${type}`);
        const settings = this._currentSettings(adapter);
        const doc = await adapter.buildDocument(id, settings);
        if (!doc) return null;
        const layout = DocumentLayout.paginate(doc, adapter, settings);
        return { doc, layout, adapter, settings };
    },

    async generatePdfBytes(type, id) {
        const { bytes } = await this._ensurePdfBytes(type, id);
        return bytes;
    },

    async openPreview(typeOrOpts, maybeId) {
        const { type, id } = this._resolveType(typeOrOpts, maybeId);

        if (!this.isNative(type)) {
            return DocumentLegacyBridge.preview(type, id);
        }

        const adapter = this._adapter(type);
        const entity = await adapter.getEntity(id);
        if (!entity) {
            App.showNotification(`${DocumentTemplates.label(type)} not found`, 'error');
            return;
        }

        this._bindModalCleanup();
        if (typeof DocumentToolbar !== 'undefined') DocumentToolbar.bind(this);
        if (typeof DocumentCopyPicker !== 'undefined') DocumentCopyPicker.bind(this);
        this._setEngineMode(true, type);

        const settings = DocumentSettings.get(adapter);
        this._syncSettingsUi(adapter, id, settings);

        const ui = {
            modal: document.getElementById('pdfPreviewModal'),
            title: document.getElementById('pdfPreviewTitle'),
            subtitle: document.getElementById('pdfPreviewSubtitle')
        };
        if (ui.title) ui.title.textContent = adapter.getTitle(entity);
        if (ui.subtitle) {
            const sub = adapter.getSubtitle?.(entity);
            if (sub) {
                ui.subtitle.textContent = sub;
                ui.subtitle.classList.remove('d-none');
            } else {
                ui.subtitle.classList.add('d-none');
            }
        }

        if (typeof DeliveryUI !== 'undefined' && DeliveryUI._installPdfPreviewModalCleanup) {
            DeliveryUI._installPdfPreviewModalCleanup();
        }
        if (typeof App !== 'undefined' && App.raiseModalAboveStack) {
            App.raiseModalAboveStack(ui.modal);
        }
        bootstrap.Modal.getOrCreateInstance(ui.modal).show();
        if (typeof PdfMakeInit !== 'undefined') PdfMakeInit.logStatus();

        try {
            const pkg = await this.buildPackage(type, id);
            if (!pkg?.layout?.doc) {
                throw new Error('Document model empty — adapter returned no layout');
            }

            this._tracePipeline(type, id, pkg, entity);

            // Render HTML preview first — never block on pdfmake (download/print use separate path).
            DocumentPreview.render(pkg.layout, adapter);
            if (typeof DocumentPreview !== 'undefined') {
                DocumentPreview.syncPageCount(pkg.layout.pages?.length || 1);
            }
            this._logPreviewDom();

            this._session = {
                type,
                id,
                layout: pkg.layout,
                adapter,
                settings: pkg.settings,
                entity,
                filename: adapter.getFilename(entity),
                pdfPageCount: pkg.layout.pages?.length || 1,
                pdfBytes: null,
                pdfReady: false,
                pdfError: null,
                printReady: !!window.electronAPI?.printPdfBuffer,
                downloadReady: true
            };
            document.getElementById('pdfSaveAsPdfBtn')?.classList.remove('d-none');
            if (typeof DocumentToolbar !== 'undefined') DocumentToolbar.rewireActions(this);
            if (typeof DeliveryUI !== 'undefined' && DeliveryUI.syncPreviewConvertActions) {
                DeliveryUI.syncPreviewConvertActions(this._session);
            }
            this._updateDebugPanel(pkg.settings);
            this._prefetchPdf(type, id);
        } catch (e) {
            console.error('[DocumentEngine]', e);
            App.showNotification(e.message || 'Preview failed', 'error');
        }
    },

    async download(typeOrOpts, maybeId) {
        const { type, id } = this._resolveType(typeOrOpts, maybeId);
        if (!this.isNative(type)) return DocumentLegacyBridge.download(type, id);

        const adapter = this._adapter(type);
        const entity = await adapter.getEntity(id);
        if (!entity) return;
        try {
            console.log('[DocumentEngine] download start', { type, id });
            if (typeof pdfMake === 'undefined') {
                throw new Error('pdfmake not loaded — check node_modules and index.html script tags');
            }
            const { bytes, settings } = await this._ensurePdfBytes(type, id);
            if (!bytes?.length) throw new Error('PDF generator returned empty buffer');
            const filename = this._session?.filename || adapter.getFilename(entity);
            console.log('[DocumentEngine] invoking DocumentPrintManager.download', filename);
            const result = await DocumentPrintManager.download(bytes, filename, adapter.subfolder);
            App.showNotification('PDF downloaded (Document Engine V3)', 'success');
            this._session = {
                ...this._session,
                type,
                id,
                pdfBytes: bytes,
                pdfReady: true,
                lastPdfSettings: { ...settings },
                ...result
            };
            this._updateDebugPanel(settings);
        } catch (e) {
            console.error('[DocumentEngine] download failed', e);
            App.showNotification(e.message || 'PDF failed', 'error');
            if (this._session) {
                this._session.pdfError = e.message;
                this._updateDebugPanel(this._session.settings);
            }
        }
    },

    async print(typeOrOpts, maybeId) {
        const { type, id } = this._resolveType(typeOrOpts, maybeId);
        if (!this.isNative(type)) return DocumentLegacyBridge.print(type, id);

        const adapter = this._adapter(type);
        const entity = await adapter.getEntity(id);
        if (!entity) return;
        try {
            console.log('[DocumentEngine] print start', { type, id });
            const { bytes, settings } = await this._ensurePdfBytes(type, id);
            const filename = this._session?.filename || adapter.getFilename(entity);
            const printRes = await DocumentPrintManager.print(bytes, filename, {
                landscape: settings.orientation === 'landscape',
                pageSize: settings.pageSize || 'A4'
            });
            if (printRes?.canceled) return;
            if (this._session) {
                this._session.lastPrintSettings = { ...settings };
            }
            this._updateDebugPanel(settings);
            App.showNotification('Sent to printer', 'success');
        } catch (e) {
            if (/cancel/i.test(e?.message || '')) return;
            console.error('[DocumentEngine] print failed', e);
            App.showNotification(e.message || 'Print failed', 'error');
        }
    },

    async export(typeOrOpts, maybeIdOrOpts, maybeAction) {
        let type;
        let id;
        let action = 'preview';
        if (typeof typeOrOpts === 'object' && typeOrOpts !== null) {
            ({ type, id, action = 'preview' } = typeOrOpts);
        } else if (typeof maybeIdOrOpts === 'object') {
            type = typeOrOpts;
            ({ id, action = 'preview' } = maybeIdOrOpts);
        } else {
            type = typeOrOpts;
            id = maybeIdOrOpts;
            action = maybeAction || 'preview';
        }
        if (action === 'download' || action === 'save') return this.download({ type, id });
        if (action === 'print') {
            await this.openPreview({ type, id });
            return this.print({ type, id });
        }
        return this.openPreview({ type, id });
    },

    /** Back-compat: sales invoice by id only */
    openSalesInvoicePreview(invoiceId) {
        return this.openPreview({ type: 'sales-invoice', id: invoiceId });
    },

    _tracePipeline(type, id, pkg, entity) {
        if (!this._debugEnabled()) return;
        const doc = pkg.doc;
        const inv = doc?.invoice || {};
        const cust = doc?.customer || {};
        console.group('[DocumentEngine] pipeline trace');
        console.log('entity.id', entity?.id, 'invoiceNo', entity?.invoiceNo);
        console.log('doc.invoice.no', inv.no, 'doc.customer.name', cust.name);
        console.log('items.length', doc?.items?.length, 'subtotal', doc?.summary?.subtotal, 'grandTotal', doc?.summary?.grandTotal);
        console.log('layout.pages', pkg.layout?.pages?.length, 'diagnostics', pkg.layout?.diagnostics);
        console.log('documentModel', JSON.stringify(doc, null, 2));
        const settings = pkg.settings || DocumentSettings.get(pkg.adapter);
        const dims = DocumentSettings.pageDimensionsMm(settings);
        console.log('pageWidthMm', dims.w, 'pageHeightMm', dims.h, 'scale', settings.scale, 'margin', settings.marginPreset);
        console.groupEnd();
    },

    _logPreviewDom() {
        if (!this._debugEnabled()) return;
        const page = document.querySelector('.inv-v3-page');
        const stage = this._stageEl();
        const container = document.getElementById('pdfPreviewContainer');
        console.log('[DocumentEngine] DOM', {
            stage: stage ? { id: stage.id, offsetWidth: stage.offsetWidth, offsetHeight: stage.offsetHeight, childCount: stage.childElementCount } : null,
            container: container ? { offsetWidth: container.offsetWidth, offsetHeight: container.offsetHeight, classes: container.className } : null,
            page: page ? { offsetWidth: page.offsetWidth, offsetHeight: page.offsetHeight, innerLen: page.innerHTML.length } : null
        });
    },

    _debugEnabled() {
        try {
            return localStorage.getItem('gtes_document_engine_debug') === '1'
                || new URLSearchParams(location.search).get('docDebug') === '1';
        } catch (_) {
            return false;
        }
    },

    /** Hardcoded smoke test — preview + test.pdf download */
    async runSelfTest() {
        const doc = {
            meta: { isGst: false, isPlain: true, docTitle: 'INVOICE' },
            copyLabel: 'ORIGINAL',
            company: {
                name: 'GTES TEST COMPANY',
                address: 'Test Address',
                workAddress: 'Test Work',
                gstin: '29TEST0000A1Z5',
                pan: 'AABCT1234A',
                iec: ''
            },
            invoice: {
                no: 'TEST-001', date: '2026-05-20', dateDisplay: '20-05-2026',
                poNumber: '-', dispatchDocumentNo: '-', dispatchThrough: '-',
                destination: '-', ewayBillNo: '-'
            },
            receiver: { name: 'TEST CUSTOMER', address: 'Test Customer Address', state: 'Tamil Nadu', country: 'India', pin: '600001', phone: '', gstin: '', pan: '' },
            consignee: { name: 'TEST CUSTOMER', address: 'Test Customer Address', state: 'Tamil Nadu', country: 'India', pin: '600001', phone: '', gstin: '', pan: '' },
            customer: { name: 'TEST CUSTOMER', address: 'Test Customer Address', gstin: '' },
            shipTo: { show: true },
            items: [{
                sl: 1, name: 'Test Item', desc: '', hsn: '-', qty: 1, unit: 'nos',
                rate: 100, taxPct: '', amount: 100, rowHeightPt: 20
            }],
            summary: {
                subtotal: 100, cgst: 0, sgst: 0, igst: 0, roundOff: 0, grandTotal: 100,
                amountInWords: 'Rupees 100.00 Only'
            },
            terms: ['Test terms'],
            bankLine: 'Bank: Test | A/c: 123 | IFSC: TEST0001',
            footerNote: 'Test document'
        };
        const layout = InvoiceLayoutV3.paginate(doc);
        console.log('[DocumentEngine] self-test docDefinition', InvoicePdfMakeV3.buildDocumentDefinition(doc));
        this._bindModalCleanup();
        this._setEngineMode(true, 'sales-invoice');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('pdfPreviewModal')).show();
        DocumentPreview.render(layout, null);
        this._logPreviewDom();
        try {
            const bytes = await InvoicePdfMakeV3.generatePdfBytes(doc);
            await DocumentPrintManager.download(bytes, 'test.pdf', 'Invoices');
            console.log('[DocumentEngine] self-test PDF OK', bytes.length, 'bytes');
            App.showNotification('Self-test: test.pdf downloaded', 'success');
        } catch (e) {
            console.error('[DocumentEngine] self-test PDF failed', e);
            App.showNotification(`Self-test PDF failed: ${e.message}`, 'error');
        }
    }
};

window.DocumentEngine = DocumentEngine;
window.USE_DOCUMENT_ENGINE_V3 = true;
