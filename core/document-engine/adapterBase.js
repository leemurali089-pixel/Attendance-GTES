/**
 * Document Engine V4 — shared adapter factory (copy types, settings, pipeline).
 */
const AdapterBase = {
    register(config) {
        if (typeof DocumentTemplates === 'undefined') return;
        const {
            type,
            label,
            supportsCopyType = false,
            copyTypeKey,
            settingsKey,
            subfolder,
            getEntity,
            getTitle,
            getSubtitle,
            getFilename,
            buildDocument,
            paginate,
            renderPreview,
            generatePdfBytes
        } = config;

        DocumentTemplates.register(type, {
            type,
            label: label || DocumentTemplates.label(type),
            supportsCopyType,
            copyTypeKey: copyTypeKey || `gtes_document_copy_${type.replace(/-/g, '_')}`,
            settingsKey: settingsKey || 'gtes_document_pdf_settings',
            subfolder: subfolder || 'Documents',

            getCopyTypes(entityId) {
                if (!supportsCopyType) return ['original'];
                try {
                    const map = JSON.parse(localStorage.getItem(this.copyTypeKey) || '{}');
                    const entry = map[String(entityId)];
                    if (entry) return DocumentSettings.normalizeCopyTypes(entry);
                } catch (_) { /* ignore */ }
                return ['original'];
            },

            getCopyType(entityId) {
                return this.getCopyTypes(entityId)[0] || 'original';
            },

            async setCopyTypes(entityId, copyTypes) {
                if (!supportsCopyType) return;
                const values = DocumentSettings.normalizeCopyTypes(copyTypes);
                try {
                    const map = JSON.parse(localStorage.getItem(this.copyTypeKey) || '{}');
                    map[String(entityId)] = values;
                    localStorage.setItem(this.copyTypeKey, JSON.stringify(map));
                } catch (_) { /* ignore */ }
            },

            async setCopyType(entityId, copyType) {
                return this.setCopyTypes(entityId, [copyType || 'original']);
            },

            getEntity,
            getTitle,
            getSubtitle,
            getFilename,

            async buildDocument(id, settings) {
                const doc = await buildDocument(id, settings);
                if (!doc) return null;
                const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
                if (supportsCopyType) {
                    doc.copyTypes = DocumentSettings.resolveCopyTypes(this, id, modalOpen);
                    doc.copyType = doc.copyTypes[0] || 'original';
                    doc.copyLabel = DocumentBuildCommon.copyLabel(doc.copyType);
                }
                return doc;
            },

            paginate(doc, settings) {
                return paginate(doc, settings || {});
            },

            renderPreview(layout) {
                const host = document.getElementById('gtesDocumentEngineStage')
                    || document.getElementById('gtesInvoiceV3Stage');
                return renderPreview(layout, host);
            },

            async generatePdfBytes(doc, settings) {
                return generatePdfBytes(doc, settings || {});
            }
        });
    }
};

window.AdapterBase = AdapterBase;
