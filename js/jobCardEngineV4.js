/**
 * Document Engine V4 — Job Card (materials tracking / service job sheet).
 */
const JobCardDataV4 = {
    _statusLabel(status) {
        const map = {
            pending: 'Pending',
            'in-progress': 'In Progress',
            'job-done': 'Job Done',
            dispatched: 'Dispatched'
        };
        return map[status] || String(status || 'Pending');
    },

    async build(jobCardId) {
        const jobCard = typeof JobCardManager !== 'undefined'
            ? JobCardManager.getJobCard(jobCardId)
            : null;
        if (!jobCard) return null;

        const customer = typeof CustomerManager !== 'undefined'
            ? CustomerManager.getCustomer(jobCard.customerId)
            : null;
        const customerName = jobCard.customerName || customer?.name || 'Walk-in Customer';
        const customerAddress = customer?.address || '';
        const company = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.buildCompany()
            : {};

        const adapter = typeof DocumentTemplates !== 'undefined'
            ? DocumentTemplates.get('job-card')
            : null;
        const modalOpen = document.getElementById('pdfPreviewModal')?.classList.contains('show');
        const copyTypes = adapter && typeof DocumentSettings !== 'undefined'
            ? DocumentSettings.resolveCopyTypes(adapter, jobCardId, modalOpen)
            : ['original'];
        const copyType = copyTypes[0] || 'original';

        const equipmentItems = typeof JobCardManager !== 'undefined'
            ? JobCardManager.normalizeEquipmentItems(jobCard)
            : [];

        const items = (jobCard.materials || []).map((m, idx) => {
            const replaced = (m.replaced || '').toString().trim();
            const status = (m.status || 'pending').toUpperCase();
            const descParts = [];
            if (replaced) descParts.push(`Replaced: ${replaced}`);
            descParts.push(`Status: ${status}`);
            const desc = descParts.join(' | ');
            return {
                sl: idx + 1,
                name: m.name || m.description || '-',
                desc,
                qty: m.quantity ?? '-',
                unit: m.unit || 'pcs',
                replaced: replaced || '-',
                status,
                rowHeightPt: typeof DocumentBuildCommon !== 'undefined'
                    ? DocumentBuildCommon.itemRowHeight({ desc })
                    : 20
            };
        });

        const docInfoRows = [
            ['Date', DocumentBuildCommon.formatDateDisplay(jobCard.date)],
            ['Job Card No', jobCard.id],
            ['Technician', jobCard.technicianId || 'Not assigned'],
            ['Status', this._statusLabel(jobCard.status)]
        ];
        if (jobCard.customerRef) docInfoRows.push(['Customer DC / Ref', jobCard.customerRef]);
        if (!equipmentItems.length && jobCard.equipment) docInfoRows.push(['Equipment', jobCard.equipment]);
        if (jobCard.dispatchVia) docInfoRows.push(['Dispatch Via', jobCard.dispatchVia]);
        if (jobCard.lrNo) docInfoRows.push(['LR / Tracking No', jobCard.lrNo]);
        if (jobCard.lastUpdateDate) docInfoRows.push(['Last Updated', jobCard.lastUpdateDate]);
        const linkedInvoiceNo = typeof DocumentBuildCommon !== 'undefined'
            ? DocumentBuildCommon.resolveJobCardInvoiceRef(jobCard)
            : (jobCard.linkedInvoiceNo || '');
        if (linkedInvoiceNo) docInfoRows.push(['Linked Invoice No', linkedInvoiceNo]);

        return {
            jobCardId,
            meta: {
                docTitle: 'Job Card',
                isJobCard: true,
                statusLabel: this._statusLabel(jobCard.status)
            },
            copyTypes,
            copyType,
            copyLabel: typeof DocumentBuildCommon !== 'undefined'
                ? DocumentBuildCommon.copyLabel(copyType)
                : 'ORIGINAL',
            company,
            doc: {
                no: jobCard.id,
                date: jobCard.date,
                dateDisplay: DocumentBuildCommon.formatDateDisplay(jobCard.date)
            },
            customer: {
                name: customerName,
                address: customerAddress,
                phone: customer?.phone || '',
                gstin: customer?.gstin || ''
            },
            docInfoRows,
            serviceLog: {
                show: !!(jobCard.complaint || jobCard.workDone),
                complaint: jobCard.complaint || '',
                workDone: jobCard.workDone || ''
            },
            equipmentItems: equipmentItems.map((row, idx) => ({
                sl: idx + 1,
                itemName: row.itemName || '-',
                description: row.description || '',
                quantity: row.quantity ?? 1,
                complaint: row.complaint || ''
            })),
            items,
            terms: [
                'Materials listed are subject to verification on delivery.',
                'Subject to city jurisdiction.'
            ],
            remarks: typeof DocumentBuildCommon !== 'undefined'
                ? DocumentBuildCommon.resolveDocumentRemarks(jobCard)
                : null
        };
    }
};

const JobCardLayoutV4 = {
    paginate(doc, settings = {}) {
        return DocumentPaginate.paginate(doc, settings, {
            header: 72,
            prefix: 0,
            party: 96,
            extra: (doc.serviceLog?.show ? 48 : 0) + (doc.equipmentItems?.length ? 36 + doc.equipmentItems.length * 16 : 0),
            tableHeader: 24,
            closing: 56
        });
    }
};

const JobCardPdfV4 = {
    _descStack(row) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const desc = DocumentPdfBase._plainText(row.desc);
        if (!desc) return [{ text: row.name, bold: true, fontSize: fs(8) }];
        return [
            { text: row.name, bold: true, fontSize: fs(8) },
            { text: desc, fontSize: fs(7), italics: true, color: '#666' }
        ];
    },

    _equipmentTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const rows = doc.equipmentItems || [];
        if (!rows.length) return null;

        const head = [
            { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Item Name', bold: true, fontSize: fs(7) },
            { text: 'Description', bold: true, fontSize: fs(7) },
            { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Complaints', bold: true, fontSize: fs(7) }
        ];
        const body = [head];
        rows.forEach((row) => {
            body.push([
                { text: String(row.sl), alignment: 'center', fontSize: fs(8), color: '#666' },
                { text: row.itemName || '-', fontSize: fs(8), bold: true },
                { text: row.description || '-', fontSize: fs(8) },
                DocumentPdfBase._numCell(row.quantity, { alignment: 'center' }),
                { text: row.complaint || '-', fontSize: fs(8) }
            ]);
        });

        return {
            stack: [
                { text: 'EQUIPMENT / DEVICES RECEIVED', fontSize: fs(8), bold: true, color: '#1a5276', margin: [0, 0, 0, sp(4)] },
                {
                    table: { headerRows: 1, widths: ['6%', '24%', '30%', '10%', '30%'], body },
                    layout: {
                        hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                        vLineWidth: () => 0.5,
                        hLineColor: () => '#333',
                        vLineColor: () => '#333',
                        fillColor: (i) => (i === 0 ? '#f8f9fa' : null)
                    }
                }
            ],
            margin: [0, 0, 0, sp(10)]
        };
    },

    _itemsTable(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const head = [
            { text: '#', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Material', bold: true, fontSize: fs(7) },
            { text: 'Qty', alignment: 'center', bold: true, fontSize: fs(7) },
            { text: 'Replaced Item', bold: true, fontSize: fs(7) },
            { text: 'Status', alignment: 'center', bold: true, fontSize: fs(7) }
        ];
        const body = [head];
        doc.items.forEach((row) => {
            body.push([
                { text: String(row.sl), alignment: 'center', fontSize: fs(8), color: '#666' },
                { stack: this._descStack(row) },
                DocumentPdfBase._numCell(row.qty, { alignment: 'center' }),
                { text: row.replaced || '-', fontSize: fs(8) },
                { text: row.status || '-', alignment: 'center', fontSize: fs(7), bold: true }
            ]);
        });
        if (!doc.items.length) {
            body.push([
                { text: '—', alignment: 'center', fontSize: fs(8), color: '#999' },
                { text: 'No materials recorded', colSpan: 4, italics: true, fontSize: fs(8), color: '#666' },
                {}, {}, {}
            ]);
        }
        body.push([
            {
                text: 'Customer / Receiver signature & date',
                colSpan: 5,
                alignment: 'center',
                italics: true,
                fontSize: fs(7),
                color: '#666',
                margin: [0, sp(16), 0, sp(8)]
            },
            {}, {}, {}, {}
        ]);

        return {
            table: { headerRows: 1, widths: ['6%', '38%', '12%', '28%', '16%'], body },
            layout: {
                hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
                vLineWidth: () => 0.5,
                hLineColor: () => '#333',
                vLineColor: () => '#333',
                fillColor: (i) => (i === 0 ? '#f8f9fa' : null)
            },
            margin: [0, 0, 0, sp(10)]
        };
    },

    _contentBlocks(doc) {
        const fs = (n) => DocumentPdfBase._ctx.fs(n);
        const sp = (n) => DocumentPdfBase._ctx.sp(n);
        const header = DocumentBlocks.companyHeaderSplit(doc, (f) => ({
            stack: [
                { text: doc.meta.docTitle.toUpperCase(), fontSize: f(13), bold: true, alignment: 'right', characterSpacing: 1 },
                doc.copyLabel
                    ? { text: `(${doc.copyLabel})`, fontSize: f(9), bold: true, alignment: 'right', margin: [0, sp(2), 0, 0] }
                    : null,
                { text: `No: #${doc.doc.no}`, fontSize: f(8), alignment: 'right', margin: [0, sp(4), 0, 0] },
                { text: doc.meta.statusLabel, fontSize: f(8), alignment: 'right', margin: [0, sp(4), 0, 0], color: '#1a5276' }
            ].filter(Boolean)
        }));

        const party = DocumentBlocks.twoPartyGrid(
            'Customer',
            doc.customer,
            'Job Information',
            doc.docInfoRows
        );

        const blocks = [header, party];
        const equipmentTable = this._equipmentTable(doc);
        if (equipmentTable) blocks.push(equipmentTable);
        const serviceLog = DocumentBlocks.serviceLogBlock(doc);
        if (serviceLog) blocks.push(serviceLog);
        blocks.push({
            stack: [
                { text: 'MATERIALS USED', fontSize: fs(8), bold: true, color: '#1a5276', margin: [0, 0, 0, sp(4)] },
                this._itemsTable(doc)
            ]
        });
        const remarks = DocumentBlocks.dcRemarksRow(doc);
        if (remarks) blocks.push(remarks);
        blocks.push(DocumentBlocks.termsSignatureFooter(doc));
        return blocks;
    },

    async generatePdfBytes(doc, settings = {}) {
        return DocumentPdfBase.generatePdfBytes(doc, settings, (d) => this._contentBlocks(d));
    }
};

const JobCardPreviewV4 = {
    _esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _renderPage(doc, page) {
        const copyLine = page.copyLabel
            ? `<div style="font-size:9px;font-weight:700;text-align:right;">(${this._esc(page.copyLabel)})</div>`
            : '';
        const infoRows = doc.docInfoRows.map(([l, v]) =>
            `<tr><td style="color:#666;font-size:9px;padding:2px 0;">${this._esc(l)}:</td><td style="font-weight:700;font-size:9px;text-align:right;padding:2px 0;">${this._esc(v)}</td></tr>`
        ).join('');

        const rows = (page.itemRows.length ? page.itemRows : doc.items).map((r) => {
            const desc = r.desc ? `<div style="font-size:8px;color:#666;font-style:italic;">${this._esc(r.desc)}</div>` : '';
            return `<tr style="font-size:9px;"><td style="text-align:center;color:#666;">${r.sl}</td><td><div style="font-weight:700;">${this._esc(r.name)}</div>${desc}</td><td style="text-align:center;font-family:monospace;">${this._esc(r.qty)}</td><td>${this._esc(r.replaced || '-')}</td><td style="text-align:center;font-weight:700;">${this._esc(r.status || '-')}</td></tr>`;
        }).join('');

        const equipmentRows = (doc.equipmentItems || []).map((row) =>
            `<tr style="font-size:9px;"><td style="text-align:center;color:#666;">${row.sl}</td><td style="font-weight:700;">${this._esc(row.itemName)}</td><td>${this._esc(row.description) || '—'}</td><td style="text-align:center;font-family:monospace;">${this._esc(row.quantity)}</td><td>${this._esc(row.complaint) || '—'}</td></tr>`
        ).join('');
        const equipmentTable = (page.includePrefix && doc.equipmentItems?.length)
            ? `<div style="margin-bottom:10px;"><div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#1a5276;margin-bottom:4px;">Equipment / Devices Received</div><table width="100%" style="border-collapse:collapse;border:1px solid #333;margin-bottom:10px;"><thead style="background:#f8f9fa;"><tr style="font-size:8px;text-transform:uppercase;"><th style="width:6%;">#</th><th style="width:22%;">Item</th><th style="width:28%;">Description</th><th style="width:10%;">Qty</th><th>Complaints</th></tr></thead><tbody>${equipmentRows}</tbody></table></div>`
            : '';

        const serviceLog = (page.includePrefix && doc.serviceLog?.show)
            ? `<div style="border:1px solid #f0e6c8;background:#fffdf5;padding:8px;margin-bottom:10px;font-size:9px;"><strong style="color:#b8860b;">Service Log</strong>${doc.serviceLog.complaint ? `<div><strong>Complaint:</strong> ${this._esc(doc.serviceLog.complaint)}</div>` : ''}${doc.serviceLog.workDone ? `<div><strong>Work Performed:</strong> ${this._esc(doc.serviceLog.workDone)}</div>` : ''}</div>`
            : '';

        const prefix = page.includePrefix ? `
            <div style="display:flex;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:12px;">
                <div style="width:58%;">
                    <div style="font-size:16px;font-weight:800;color:#1a5276;">${this._esc(String(doc.company.name).toUpperCase())}</div>
                    <div style="font-size:9px;color:#555;">${this._esc(doc.company.address)}</div>
                    <div style="font-size:8px;color:#555;">Work: ${this._esc(doc.company.workAddress)}</div>
                    <div style="font-size:8px;color:#555;">Email: ${this._esc(doc.company.emails)} | Ph: ${this._esc(doc.company.phones)}</div>
                    <div style="font-size:8px;font-weight:700;">GSTIN: ${this._esc(doc.company.gstin)} | PAN: ${this._esc(doc.company.pan)}</div>
                </div>
                <div style="width:42%;text-align:right;">
                    <div style="font-size:14px;font-weight:800;letter-spacing:1px;">${this._esc(doc.meta.docTitle.toUpperCase())}</div>
                    ${copyLine}
                    <div style="font-size:9px;margin-top:6px;">No: <strong>#${this._esc(doc.doc.no)}</strong></div>
                    <div style="font-size:8px;margin-top:4px;color:#1a5276;">${this._esc(doc.meta.statusLabel)}</div>
                </div>
            </div>
            <table width="100%" style="margin-bottom:10px;border-collapse:separate;border-spacing:8px 0;"><tr>
                <td width="50%" valign="top" style="border:1px solid #ccc;border-radius:4px;padding:8px;background:#fafafa;">
                    <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px;">Customer</div>
                    <div style="font-weight:800;font-size:12px;">${this._esc(doc.customer.name)}</div>
                    ${doc.customer.address ? `<div style="font-size:9px;color:#666;">${this._esc(doc.customer.address)}</div>` : ''}
                    ${doc.customer.phone ? `<div style="font-size:9px;">Phone: ${this._esc(doc.customer.phone)}</div>` : ''}
                </td>
                <td width="50%" valign="top" style="border:1px solid #ccc;border-radius:4px;padding:8px;background:#fafafa;">
                    <div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:6px;">Job Information</div>
                    <table width="100%">${infoRows}</table>
                </td>
            </tr></table>
            ${equipmentTable}${serviceLog}` : '';

        const closing = page.includeClosing ? `
            <div style="display:flex;margin-top:20px;">
                <div style="width:65%;font-size:8px;color:#666;"><strong>Terms:</strong><ol style="margin:4px 0 0 16px;padding:0;">${(doc.terms || []).map((t) => `<li>${this._esc(t)}</li>`).join('')}</ol></div>
                <div style="width:35%;text-align:center;"><div style="border-bottom:1px solid #eee;height:32px;margin:16px 12px 4px;"></div><div style="font-weight:700;font-size:9px;">Authorized Signatory</div><div style="font-size:8px;color:#666;">For ${this._esc(doc.company.name)}</div></div>
            </div>` : '';

        const itemHead = '<th style="width:6%;">#</th><th>Material</th><th style="width:10%;">Qty</th><th style="width:28%;">Replaced</th><th style="width:14%;">Status</th>';
        const materialsTitle = page.includePrefix
            ? '<div style="font-size:8px;font-weight:700;text-transform:uppercase;color:#1a5276;margin-bottom:4px;">Materials Used</div>'
            : '';
        const foot = page.includeClosing
            ? '<tfoot><tr><td colspan="5" style="text-align:center;font-style:italic;color:#666;padding:20px 0;">Customer / Receiver signature & date</td></tr></tfoot>'
            : '';

        return `${prefix}${materialsTitle}<table width="100%" class="inv-v3-line-items" style="border-collapse:collapse;border:1px solid #333;margin-bottom:10px;"><thead style="background:#f8f9fa;"><tr style="font-size:8px;text-transform:uppercase;">${itemHead}</tr></thead><tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#666;font-style:italic;padding:12px;">No materials recorded</td></tr>'}</tbody>${foot}</table>${page.includeClosing && doc.remarks ? `<table width="100%" style="border-collapse:collapse;border:1px solid #333;margin-bottom:10px;"><tr><td style="font-size:9px;padding:6px 8px;"><strong>Remarks:</strong> ${this._esc(doc.remarks)}</td></tr></table>` : ''}${closing}`;
    },

    render(layoutResult, host) {
        if (!host || !layoutResult?.pages) return;
        const { pages, doc, settings } = layoutResult;
        host.innerHTML = pages.map((p) => `
            <section class="doc-engine-page-frame inv-v3-page-frame" data-page="${p.pageNumber}" id="doc-engine-page-${p.pageNumber}">
                <div class="inv-v3-page doc-page-root">${this._renderPage(doc, p)}</div>
            </section>`).join('');
        if (typeof DocumentPreview !== 'undefined') {
            DocumentPreview.applyPageSettings(host, settings || layoutResult.settings || {});
            DocumentPreview.syncPageCount(pages.length);
            DocumentPreview._bindNavOnce();
            host.querySelectorAll('.doc-engine-page-frame').forEach((f) => DocumentPreview._observer?.observe(f));
        }
    }
};

window.JobCardDataV4 = JobCardDataV4;
window.JobCardLayoutV4 = JobCardLayoutV4;
window.JobCardPdfV4 = JobCardPdfV4;
window.JobCardPreviewV4 = JobCardPreviewV4;
