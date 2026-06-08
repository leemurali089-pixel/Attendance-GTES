/**
 * Document Engine V4 — Phase 1 native adapters.
 */
(function registerPhase1Adapters() {
    if (typeof AdapterBase === 'undefined') return;

    AdapterBase.register({
        type: 'delivery-challan',
        label: 'Delivery Challan',
        supportsCopyType: true,
        copyTypeKey: 'gtes_challan_copy_by_id',
        settingsKey: 'gtes_challan_pdf_settings',
        subfolder: 'Challans',
        getEntity(id) {
            return typeof DeliveryManager !== 'undefined' ? DeliveryManager.getChallan(id) : null;
        },
        getTitle(entity) {
            return `Delivery Challan — #${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.customerName || '';
        },
        getFilename(entity) {
            return `Challan_${String(entity?.id || 'dc').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => ChallanDataV4.build(id, 'delivery-challan'),
        paginate: (doc, settings) => ChallanLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => ChallanPreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => ChallanPdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'service-challan',
        label: 'Service Challan',
        supportsCopyType: true,
        copyTypeKey: 'gtes_service_challan_copy_by_id',
        settingsKey: 'gtes_service_challan_pdf_settings',
        subfolder: 'Challans',
        getEntity(id) {
            const c = typeof DeliveryManager !== 'undefined' ? DeliveryManager.getChallan(id) : null;
            return c?.type === 'service' ? c : c;
        },
        getTitle(entity) {
            return `Service Challan — #${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.customerName || '';
        },
        getFilename(entity) {
            return `ServiceChallan_${String(entity?.id || 'sc').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => ChallanDataV4.build(id, 'service-challan'),
        paginate: (doc, settings) => ChallanLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => ChallanPreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => ChallanPdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'purchase-invoice',
        label: 'Purchase Invoice',
        supportsCopyType: true,
        copyTypeKey: 'gtes_purchase_copy_by_id',
        settingsKey: 'gtes_purchase_pdf_settings',
        subfolder: 'Purchases',
        getEntity(id) {
            const list = DataManager.getData(DataManager.KEYS.EXPENSES) || [];
            return list.find((p) => p.id === id) || null;
        },
        getTitle(entity) {
            return `Purchase Bill — ${entity?.billNo || entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.vendor || entity?.vendorName || '';
        },
        getFilename(entity) {
            const id = entity?.billNo || entity?.id || 'purchase';
            return `Purchase_${String(id).replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => PurchaseDataV4.build(id),
        paginate: (doc, settings) => PurchaseLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => PurchasePreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => PurchasePdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'purchase-order',
        label: 'Purchase Order',
        supportsCopyType: true,
        copyTypeKey: 'gtes_po_copy_by_id',
        settingsKey: 'gtes_po_pdf_settings',
        subfolder: 'PurchaseOrders',
        getEntity(id) {
            return OrderDataV4.getOrder(id);
        },
        getTitle(entity) {
            return `Purchase Order — ${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.vendor || entity?.vendorName || '';
        },
        getFilename(entity) {
            return `PO_${String(entity?.id || 'order').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => OrderDataV4.build(id),
        paginate: (doc, settings) => OrderLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => OrderPreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => OrderPdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'quotation',
        label: 'Sales Quotation',
        supportsCopyType: false,
        settingsKey: 'gtes_quotation_pdf_settings',
        subfolder: 'Quotations',
        getEntity(id) {
            return EstimateDataV4.getEstimate(id);
        },
        getTitle(entity) {
            return `Quotation — ${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.customerName || '';
        },
        getFilename(entity) {
            return `Quotation_${String(entity?.id || 'est').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => EstimateDataV4.build(id, 'quotation'),
        paginate: (doc, settings) => EstimateLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => EstimatePreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => EstimatePdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'proforma-invoice',
        label: 'Proforma Invoice',
        supportsCopyType: true,
        copyTypeKey: 'gtes_proforma_copy_by_id',
        settingsKey: 'gtes_proforma_pdf_settings',
        subfolder: 'Proforma',
        getEntity(id) {
            return EstimateDataV4.getEstimate(id);
        },
        getTitle(entity) {
            return `Proforma Invoice — ${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.customerName || '';
        },
        getFilename(entity) {
            return `Proforma_${String(entity?.id || 'est').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => EstimateDataV4.build(id, 'proforma-invoice'),
        paginate: (doc, settings) => EstimateLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => EstimatePreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => EstimatePdfV4.generatePdfBytes(doc, settings)
    });

    AdapterBase.register({
        type: 'job-card',
        label: 'Job Card',
        supportsCopyType: true,
        copyTypeKey: 'gtes_job_card_copy_by_id',
        settingsKey: 'gtes_job_card_pdf_settings',
        subfolder: 'JobCards',
        getEntity(id) {
            return typeof JobCardManager !== 'undefined' ? JobCardManager.getJobCard(id) : null;
        },
        getTitle(entity) {
            return `Job Card — ${entity?.id || ''}`;
        },
        getSubtitle(entity) {
            return entity?.customerName || '';
        },
        getFilename(entity) {
            return `JobCard_${String(entity?.id || 'jc').replace(/[^\w.-]+/g, '_')}.pdf`;
        },
        buildDocument: (id) => JobCardDataV4.build(id),
        paginate: (doc, settings) => JobCardLayoutV4.paginate(doc, settings),
        renderPreview: (layout) => JobCardPreviewV4.render(layout, document.getElementById('gtesDocumentEngineStage') || document.getElementById('gtesInvoiceV3Stage')),
        generatePdfBytes: (doc, settings) => JobCardPdfV4.generatePdfBytes(doc, settings)
    });
})();

