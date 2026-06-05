/**
 * Document Engine V4 — shared pdfmake context, output, and multi-copy document shell.
 */
const DocumentPdfBase = {
    _ctx: null,

    _mm(m) {
        return m * 2.834645669291;
    },

    _pdfCtx(settings = {}) {
        const normalized = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.normalize(settings)
            : settings;
        const marginMm = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.marginMm(normalized.marginPreset || 'normal')
            : 8;
        const scale = (normalized.scale || 100) / 100;
        const dims = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.pageDimensionsMm(normalized)
            : (normalized.orientation === 'landscape'
                ? { w: 297, h: 210 }
                : { w: 210, h: 297 });
        const marginPt = this._mm(marginMm);
        const pageSizePt = { width: this._mm(dims.w), height: this._mm(dims.h) };
        return {
            pageSizeName: normalized.pageSize === 'Letter' ? 'LETTER' : 'A4',
            orientation: normalized.orientation === 'landscape' ? 'landscape' : 'portrait',
            pageSizePt,
            contentWidthPt: pageSizePt.width - (2 * marginPt),
            pageWidthMm: dims.w,
            pageHeightMm: dims.h,
            marginMm,
            marginPreset: normalized.marginPreset || 'normal',
            scale,
            scalePct: normalized.scale || 100,
            fs: (n) => Math.max(5, Math.round(n * scale)),
            sp: (n) => Math.max(1, Math.round(n * scale)),
            marginPt
        };
    },

    _money(n) {
        return `₹${(parseFloat(n) || 0).toFixed(2)}`;
    },

    _plainText(html) {
        return String(html ?? '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+\n/g, '\n')
            .trim();
    },

    _numCell(text, opts = {}) {
        const fs = this._ctx?.fs(8) || 8;
        return {
            text: String(text ?? ''),
            fontSize: opts.fontSize || fs,
            noWrap: true,
            alignment: 'right',
            ...opts
        };
    },

    _docForCopy(doc, copyType) {
        const label = copyType === 'none'
            ? ''
            : (typeof InvoiceDataV3 !== 'undefined'
                ? InvoiceDataV3.copyLabel(copyType)
                : (typeof DocumentSettings !== 'undefined'
                    ? DocumentSettings.copyLabelUpper(copyType)
                    : String(copyType || '').toUpperCase()));
        return { ...doc, copyType, copyLabel: label };
    },

    _normalizeCopyTypes(doc) {
        return doc.copyTypes?.length
            ? DocumentSettings.normalizeCopyTypes(doc.copyTypes)
            : DocumentSettings.normalizeCopyTypes([doc.copyType || 'original']);
    },

    buildDocumentDefinition(doc, settings, contentBlocksFn) {
        this._ctx = this._pdfCtx(settings);
        const ctx = this._ctx;
        const m = ctx.marginPt;
        const copyTypes = this._normalizeCopyTypes(doc);
        const content = [];
        copyTypes.forEach((copyType, idx) => {
            const blocks = contentBlocksFn(this._docForCopy(doc, copyType));
            if (idx > 0 && blocks[0]) blocks[0] = { ...blocks[0], pageBreak: 'before' };
            content.push(...blocks);
        });
        return {
            pageSize: ctx.pageSizeName,
            pageOrientation: ctx.orientation,
            pageMargins: [m, m, m, m],
            defaultStyle: { font: 'Roboto', fontSize: ctx.fs(9), color: '#111' },
            content,
            info: {
                title: doc.meta?.docTitle || doc.meta?.title || 'Document',
                author: doc.company?.name || ''
            }
        };
    },

    _ensurePdfMake() {
        if (typeof PdfMakeInit !== 'undefined') {
            return PdfMakeInit.ensureReady();
        }
        if (typeof pdfMake === 'undefined') {
            throw new Error('pdfmake not loaded — run: npm install pdfmake');
        }
        if (!pdfMake.fonts?.Roboto) {
            throw new Error('pdfmake Roboto font missing');
        }
        return pdfMake;
    },

    _base64ToBytes(b64) {
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    },

    _resolvePdfOutput(pdf, finish, fail) {
        const handleMaybePromise = (result, mapper) => {
            if (result && typeof result.then === 'function') {
                result.then((val) => {
                    try { mapper(val); } catch (e) { fail(e); }
                }).catch(fail);
                return true;
            }
            return false;
        };

        if (typeof pdf.getBlob === 'function') {
            if (pdf.getBlob.length === 0) {
                const p = pdf.getBlob();
                if (handleMaybePromise(p, (blob) => {
                    if (!blob) throw new Error('pdfmake getBlob returned null');
                    blob.arrayBuffer().then((ab) => finish(new Uint8Array(ab))).catch(fail);
                })) return;
            } else {
                pdf.getBlob((blob) => {
                    if (!blob) { fail(new Error('pdfmake getBlob returned null')); return; }
                    blob.arrayBuffer().then((ab) => finish(new Uint8Array(ab))).catch(fail);
                });
                return;
            }
        }

        if (typeof pdf.getBuffer === 'function') {
            if (pdf.getBuffer.length === 0) {
                const p = pdf.getBuffer();
                if (handleMaybePromise(p, (buffer) => finish(buffer))) return;
            } else {
                pdf.getBuffer((buffer) => finish(buffer));
                return;
            }
        }

        if (typeof pdf.getBase64 === 'function') {
            if (pdf.getBase64.length === 0) {
                const p = pdf.getBase64();
                if (handleMaybePromise(p, (data) => {
                    const raw = String(data || '').replace(/^data:.*?;base64,/, '');
                    finish(this._base64ToBytes(raw));
                })) return;
            } else {
                pdf.getBase64((data) => {
                    const raw = String(data || '').replace(/^data:.*?;base64,/, '');
                    finish(this._base64ToBytes(raw));
                });
                return;
            }
        }

        fail(new Error('pdfmake output API unavailable'));
    },

    async generatePdfBytes(doc, settings, contentBlocksFn) {
        this._ensurePdfMake();
        const normalized = typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.normalize(settings)
            : settings;
        let def;
        try {
            def = this.buildDocumentDefinition(doc, normalized, contentBlocksFn);
            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('pdfmake timed out after 45s')), 45000);
                const finish = (bytes) => {
                    clearTimeout(timeout);
                    if (!bytes?.length) {
                        reject(new Error('pdfmake returned empty PDF'));
                        return;
                    }
                    resolve(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
                };
                const fail = (err) => {
                    clearTimeout(timeout);
                    reject(err instanceof Error ? err : new Error(String(err)));
                };
                try {
                    const pdf = pdfMake.createPdf(def);
                    this._resolvePdfOutput(pdf, finish, fail);
                } catch (e) {
                    fail(e);
                }
            });
        } finally {
            this._ctx = null;
        }
    }
};

window.DocumentPdfBase = DocumentPdfBase;
