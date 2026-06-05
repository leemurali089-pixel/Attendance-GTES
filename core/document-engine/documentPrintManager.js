/**
 * Universal Document Engine V3 — print and download from generated PDF bytes only.
 */
const DocumentPrintManager = {
    pdfIsLandscape(bytes) {
        try {
            const text = new TextDecoder('latin1').decode(bytes);
            const m = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
            if (!m) return null;
            return parseFloat(m[1]) > parseFloat(m[2]);
        } catch (_) {
            return null;
        }
    },

    bytesToBase64Safe(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const slice = bytes.subarray(i, i + chunk);
            binary += String.fromCharCode.apply(null, slice);
        }
        return btoa(binary);
    },

    async download(bytes, filename, subfolder) {
        console.log('[DocumentPrintManager] download', { bytes: bytes?.length, filename, subfolder });
        const pdfBase64 = this.bytesToBase64Safe(bytes);
        if (window.electronAPI?.savePdf) {
            try {
                console.log('[DocumentPrintManager] IPC savePdf');
                const res = await window.electronAPI.savePdf({ blobBase64: pdfBase64, filename, subfolder });
                console.log('[DocumentPrintManager] savePdf result', res);
                if (res?.success === false) {
                    console.warn('[DocumentPrintManager] savePdf failed:', res.error);
                }
            } catch (ipcErr) {
                console.error('[DocumentPrintManager] savePdf IPC error (continuing browser download)', ipcErr);
            }
        } else {
            console.warn('[DocumentPrintManager] electronAPI.savePdf not available — browser download only');
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { pdfBase64, filename, bytes };
    },

    async print(bytes, filename, opts = {}) {
        const pdfBase64 = this.bytesToBase64Safe(bytes);
        const detectedLandscape = this.pdfIsLandscape(bytes);
        const landscape = detectedLandscape != null ? detectedLandscape : !!opts.landscape;
        console.log('[DocumentPrintManager] print', {
            bytes: bytes?.length,
            filename,
            landscape,
            detectedLandscape,
            pageSize: opts.pageSize || 'A4'
        });
        if (!window.electronAPI?.printPdfBuffer) {
            throw new Error('Print requires Electron app (printPdfBuffer)');
        }
        console.log('[DocumentPrintManager] IPC printPdfBuffer');
        const res = await window.electronAPI.printPdfBuffer({
            pdfBase64,
            filename,
            landscape,
            pageSize: opts.pageSize || 'A4'
        });
        console.log('[DocumentPrintManager] printPdfBuffer result', res);
        if (!res?.success) throw new Error(res?.error || 'Print failed');
        return res;
    }
};

window.DocumentPrintManager = DocumentPrintManager;
