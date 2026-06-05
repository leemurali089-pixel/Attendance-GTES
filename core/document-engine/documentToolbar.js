/**
 * Universal Document Engine V3 — toolbar control bindings.
 */
const DocumentToolbar = {
    CONTROL_IDS: {
        pageSize: ['gtesInvSetPageSize', 'gtesDocSetPageSize'],
        orientation: ['gtesInvSetOrientation', 'gtesDocSetOrientation'],
        margin: ['gtesInvSetMargin', 'gtesDocSetMargin'],
        scale: ['gtesInvSetScale', 'gtesDocSetScale'],
        copy: [],
        print: ['pdfPrintBtn'],
        save: ['pdfSaveAsPdfBtn'],
        download: ['pdfDownloadBtn']
    },

    _settingsBound: false,

    bind(engine) {
        if (!this._settingsBound) {
            this._settingsBound = true;
            const onSettings = () => engine._onToolbarSettingsChanged();
            this._forEach('pageSize', (el) => el.addEventListener('change', onSettings));
            this._forEach('orientation', (el) => el.addEventListener('change', onSettings));
            this._forEach('margin', (el) => el.addEventListener('change', onSettings));
            this._forEach('scale', (el) => {
                el.addEventListener('input', onSettings);
                el.addEventListener('change', onSettings);
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        setTimeout(onSettings, 0);
                    }
                });
            });
        }
        this.rewireActions(engine);
    },

    /** Re-attach action buttons every preview open (overwrites legacy onclick from vouchers/challans). */
    rewireActions(engine) {
        this._forEach('print', (el) => {
            el.disabled = false;
            el.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DocumentToolbar] Print clicked', engine._session?.id);
                await engine._handlePrint();
            };
        });
        this._forEach('save', (el) => {
            el.classList.remove('d-none');
            el.style.display = '';
            el.disabled = false;
            el.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DocumentToolbar] Save PDF clicked', engine._session?.id);
                await engine._handleSavePdf();
            };
        });
        this._forEach('download', (el) => {
            el.disabled = false;
            el.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DocumentToolbar] Download clicked', engine._session?.id);
                await engine._handleDownload();
            };
        });
        console.log('[DocumentToolbar] Action buttons rewired');
    },

    _forEach(key, fn) {
        (this.CONTROL_IDS[key] || []).forEach((id) => {
            const el = document.getElementById(id);
            if (el) fn(el);
        });
    },

    reportBindings() {
        return [
            { control: 'Scale Input', handler: 'DocumentEngine._onToolbarSettingsChanged', file: 'core/document-engine/documentToolbar.js', line: 28 },
            { control: 'Page Size Dropdown', handler: 'DocumentEngine._onToolbarSettingsChanged', file: 'core/document-engine/documentToolbar.js', line: 24 },
            { control: 'Margins Dropdown', handler: 'DocumentEngine._onToolbarSettingsChanged', file: 'core/document-engine/documentToolbar.js', line: 25 },
            { control: 'Copy Checkboxes', handler: 'DocumentEngine._onCopyTypesChanged', file: 'core/document-engine/documentCopyPicker.js', line: 1 },
            { control: 'Print Button', handler: 'DocumentEngine._handlePrint', file: 'core/document-engine/documentToolbar.js', line: 44 },
            { control: 'Save Button', handler: 'DocumentEngine._handleSavePdf', file: 'core/document-engine/documentToolbar.js', line: 52 },
            { control: 'Download Button', handler: 'DocumentEngine._handleDownload', file: 'core/document-engine/documentToolbar.js', line: 60 }
        ];
    }
};

window.DocumentToolbar = DocumentToolbar;
