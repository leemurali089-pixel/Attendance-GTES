/**
 * Universal Document Engine V3 — page settings, copy types, persistence.
 */
const DocumentSettings = {
    GLOBAL_KEY: 'gtes_document_pdf_settings',
    COPY_KEY_PREFIX: 'gtes_document_copy_',

    PAGE_SIZES: ['A4', 'Letter'],
    ORIENTATIONS: ['portrait', 'landscape'],
    MARGIN_PRESETS: ['none', 'narrow', 'normal', 'wide'],
    SCALE_MIN: 50,
    SCALE_MAX: 150,
    SCALE_STEP: 1,

    MARGIN_MM: {
        none: 0,
        narrow: 5,
        normal: 8,
        wide: 12
    },

    COPY_NONE: 'none',

    COPY_TYPES: [
        { value: 'original', label: 'Original' },
        { value: 'duplicate', label: 'Duplicate' },
        { value: 'triplicate', label: 'Triplicate' },
        { value: 'quadruplicate', label: 'Quadruplicate' },
        { value: 'extra', label: 'Extra Copy' },
        { value: 'transporter', label: 'For Transporter' }
    ],

    COPY_TYPE_ORDER: ['original', 'duplicate', 'triplicate', 'quadruplicate', 'extra', 'transporter'],

    COPY_TYPE_DOC_TYPES: new Set([
        'sales-invoice',
        'purchase-invoice',
        'purchase-order',
        'delivery-challan',
        'service-challan',
        'job-card',
        'proforma-invoice'
    ]),

    defaults() {
        return {
            pageSize: 'A4',
            orientation: 'portrait',
            marginPreset: 'normal',
            scale: 100
        };
    },

    defaultsFor(adapter) {
        const base = this.defaults();
        if (adapter?.settingsKey === 'gtes_invoice_pdf_settings'
            || adapter?.settingsKey === 'gtes_job_card_pdf_settings') {
            return { ...base, orientation: 'landscape' };
        }
        return base;
    },

    get(adapter) {
        const key = adapter?.settingsKey || this.GLOBAL_KEY;
        const base = this.defaultsFor(adapter);
        try {
            const raw = localStorage.getItem(key);
            return { ...base, ...(raw ? JSON.parse(raw) : {}) };
        } catch (_) {
            return base;
        }
    },

    save(adapter, settings) {
        const key = adapter?.settingsKey || this.GLOBAL_KEY;
        localStorage.setItem(key, JSON.stringify(settings));
    },

    clampScale(value) {
        const n = parseInt(value, 10);
        if (Number.isNaN(n)) return 100;
        return Math.min(this.SCALE_MAX, Math.max(this.SCALE_MIN, Math.round(n)));
    },

    /** Read live values from the preview toolbar (source of truth while modal is open). */
    readFromUi() {
        const pageSize = document.getElementById('gtesInvSetPageSize')?.value
            || document.getElementById('gtesDocSetPageSize')?.value
            || 'A4';
        const orientation = document.getElementById('gtesInvSetOrientation')?.value
            || document.getElementById('gtesDocSetOrientation')?.value
            || 'portrait';
        const marginPreset = document.getElementById('gtesInvSetMargin')?.value
            || document.getElementById('gtesDocSetMargin')?.value
            || 'normal';
        const scale = this.clampScale(
            document.getElementById('gtesInvSetScale')?.value
            ?? document.getElementById('gtesDocSetScale')?.value
        );
        return { pageSize, orientation, marginPreset, scale };
    },

    merge(adapter, overrides = {}) {
        return { ...this.get(adapter), ...overrides };
    },

    normalize(settings = {}) {
        return {
            pageSize: settings.pageSize === 'Letter' ? 'Letter' : 'A4',
            orientation: settings.orientation === 'landscape' ? 'landscape' : 'portrait',
            marginPreset: this.MARGIN_PRESETS.includes(settings.marginPreset)
                ? settings.marginPreset
                : 'normal',
            scale: this.clampScale(settings.scale)
        };
    },

    /** Stable key for PDF byte cache invalidation. */
    fingerprint(settings = {}) {
        const s = this.normalize(settings);
        return `${s.pageSize}|${s.orientation}|${s.marginPreset}|${s.scale}`;
    },

    toLog(settings = {}, copyType) {
        const s = this.normalize(settings);
        return {
            pageSize: s.pageSize,
            orientation: s.orientation,
            margins: s.marginPreset,
            marginMm: this.marginMm(s.marginPreset),
            scale: s.scale,
            copyType: copyType || undefined
        };
    },

    marginMm(preset) {
        return this.MARGIN_MM[preset] ?? this.MARGIN_MM.normal;
    },

    pageDimensionsMm(settings) {
        const portrait = settings.orientation !== 'landscape';
        const base = settings.pageSize === 'Letter'
            ? { w: 216, h: 279 }
            : { w: 210, h: 297 };
        return portrait ? base : { w: base.h, h: base.w };
    },

    formatCopyLine(copyType) {
        if (!copyType || copyType === this.COPY_NONE) return '';
        const row = this.COPY_TYPES.find((t) => t.value === copyType);
        return `(${row ? row.label.toUpperCase() : 'ORIGINAL'})`;
    },

    copyLabelUpper(copyType) {
        if (!copyType || copyType === this.COPY_NONE) return '';
        const row = this.COPY_TYPES.find((t) => t.value === copyType);
        return row ? row.label.toUpperCase() : 'ORIGINAL';
    },

    normalizeCopyTypes(types) {
        if (!types) return ['original'];
        const raw = Array.isArray(types) ? types : [types];
        const valid = new Set([this.COPY_NONE, ...this.COPY_TYPES.map((t) => t.value)]);
        const picked = raw.filter((t) => valid.has(t));
        if (!picked.length) return ['original'];
        if (picked.includes(this.COPY_NONE)) return [this.COPY_NONE];
        const order = this.COPY_TYPE_ORDER;
        return order.filter((t) => picked.includes(t));
    },

    copyTypesFingerprint(types) {
        return this.normalizeCopyTypes(types).join('+');
    },

    _readStoredCopyEntry(map, entityId) {
        const entry = map[String(entityId)];
        if (!entry) return ['original'];
        if (Array.isArray(entry)) return this.normalizeCopyTypes(entry);
        return this.normalizeCopyTypes([entry]);
    },

    getCopyTypes(adapter, entityId) {
        if (adapter?.getCopyTypes) return adapter.getCopyTypes(entityId);
        try {
            const map = JSON.parse(localStorage.getItem(this._copyKey(adapter)) || '{}');
            return this._readStoredCopyEntry(map, entityId);
        } catch (_) {
            return ['original'];
        }
    },

    getCopyType(adapter, entityId) {
        return this.getCopyTypes(adapter, entityId)[0] || 'original';
    },

    readCopyTypesFromUi() {
        if (typeof DocumentCopyPicker !== 'undefined') {
            return DocumentCopyPicker.read();
        }
        const sel = document.getElementById('gtesInvSetCopyType');
        return sel ? this.normalizeCopyTypes([sel.value]) : ['original'];
    },

    resolveCopyTypes(adapter, entityId, useUi) {
        const modal = document.getElementById('pdfPreviewModal');
        const live = useUi && modal?.classList.contains('show');
        if (live) return this.readCopyTypesFromUi();
        return this.getCopyTypes(adapter, entityId);
    },

    async setCopyTypes(adapter, entityId, copyTypes) {
        const values = this.normalizeCopyTypes(copyTypes);
        try {
            const map = JSON.parse(localStorage.getItem(this._copyKey(adapter)) || '{}');
            map[String(entityId)] = values;
            localStorage.setItem(this._copyKey(adapter), JSON.stringify(map));
        } catch (_) { /* ignore */ }
        if (adapter?.setCopyTypes) await adapter.setCopyTypes(entityId, values);
        else if (adapter?.setCopyType) await adapter.setCopyType(entityId, values[0]);
    },

    async setCopyType(adapter, entityId, copyType) {
        return this.setCopyTypes(adapter, entityId, [copyType || 'original']);
    },

    _copyKey(adapter) {
        return adapter?.copyTypeKey || `${this.COPY_KEY_PREFIX}${adapter?.type || 'default'}`;
    }
};

window.DocumentSettings = DocumentSettings;
