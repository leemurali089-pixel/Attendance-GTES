/**
 * Delivery Challan — returnable vs non-returnable line items.
 * Non-returnable items are billable when converting DC → Invoice.
 * Missing field on legacy rows defaults to non-returnable (existing convert behaviour).
 */
const DcReturnable = {
    isReturnable(item) {
        if (!item) return false;
        if (item.returnable === true || item.itemReturnType === 'returnable') return true;
        if (item.returnable === false || item.itemReturnType === 'non-returnable') return false;
        return false;
    },

    isNonReturnable(item) {
        return !this.isReturnable(item);
    },

    /** Prefer itemDescription when description duplicates the item name (legacy challan saves). */
    itemLineDescription(item) {
        if (!item) return '';
        const name = String(item.name || '').trim();
        const itemDesc = String(item.itemDescription || '').trim();
        const desc = String(item.description || item.desc || '').trim();
        if (itemDesc && itemDesc.toLowerCase() !== name.toLowerCase()) return itemDesc;
        if (desc && desc.toLowerCase() !== name.toLowerCase()) return desc;
        return itemDesc || desc || '';
    },

    filterForInvoice(items) {
        return (items || []).filter((i) => this.isNonReturnable(i));
    },

    recalculateTotals(items, opts = {}) {
        const list = items || [];
        const subtotal = list.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        let cgst = list.reduce((s, i) => s + (parseFloat(i.cgst) || parseFloat(i.cgstAmount) || 0), 0);
        let sgst = list.reduce((s, i) => s + (parseFloat(i.sgst) || parseFloat(i.sgstAmount) || 0), 0);
        let igst = list.reduce((s, i) => s + (parseFloat(i.igst) || parseFloat(i.igstAmount) || 0), 0);

        const gstMode = opts.gstMode !== false;
        const cgstPct = parseFloat(opts.cgstPercent) || 0;
        const sgstPct = parseFloat(opts.sgstPercent) || 0;
        const igstPct = parseFloat(opts.igstPercent) || 0;

        if (gstMode && cgst + sgst + igst < 0.01 && (cgstPct || sgstPct || igstPct)) {
            cgst = subtotal * cgstPct / 100;
            sgst = subtotal * sgstPct / 100;
            igst = subtotal * igstPct / 100;
        }

        const totalBefore = subtotal + cgst + sgst + igst;
        const total = Math.round(totalBefore);
        const roundOff = total - totalBefore;

        return {
            subtotal,
            cgst,
            sgst,
            igst,
            roundOff,
            total,
            gst: { cgst, sgst, igst }
        };
    },

    mapItemsForInvoice(items) {
        return (items || []).map((item) => {
            const qty = parseFloat(item.quantity) || 0;
            const rate = parseFloat(item.rate) || 0;
            const amount = parseFloat(item.amount) || (qty * rate);
            const gstRate = item.gstRate != null
                ? item.gstRate
                : (parseFloat(String(item.gstRate || '').replace(/[^0-9.]/g, '')) || 0);
            return {
                name: item.name || item.description || '',
                description: this.itemLineDescription(item),
                hsn: item.hsn || '',
                quantity: qty,
                unit: item.unit || 'nos',
                rate,
                gstRate,
                amount,
                cgst: item.cgst,
                sgst: item.sgst,
                igst: item.igst,
                cgstRate: item.cgstRate,
                sgstRate: item.sgstRate,
                discount: item.discount || 0
            };
        });
    },

    returnableSelectHtml(selected, cssClass = 'form-select form-select-sm item-returnable') {
        const isRet = selected === true || selected === 'returnable';
        return `<select class="${cssClass}">
            <option value="returnable" ${isRet ? 'selected' : ''}>Returnable</option>
            <option value="non-returnable" ${!isRet ? 'selected' : ''}>Non Returnable</option>
        </select>`;
    },

    readReturnableFromSelect(el) {
        const v = String(el?.value || 'non-returnable').toLowerCase();
        const returnable = v === 'returnable';
        return {
            returnable,
            itemReturnType: returnable ? 'returnable' : 'non-returnable'
        };
    }
};

window.DcReturnable = DcReturnable;
