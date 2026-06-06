/**
 * pdfmake 0.3.x browser bootstrap — requires pdfmake.min.js + vfs_fonts.js + fonts/Roboto.js
 */
const PdfMakeInit = {
    isReady() {
        return typeof pdfMake !== 'undefined'
            && typeof pdfMake.createPdf === 'function'
            && this._hasRoboto();
    },

    _hasRoboto() {
        if (typeof pdfMake === 'undefined') return false;
        if (pdfMake.fonts && pdfMake.fonts.Roboto) return true;
        if (pdfMake._fontContainer && pdfMake._fontContainer.Roboto) return true;
        return false;
    },

    ensureReady() {
        if (typeof pdfMake === 'undefined') {
            throw new Error(
                'pdfmake not loaded. Ensure index.html includes vendor/pdfmake/build/pdfmake.min.js'
            );
        }
        if (!this._hasRoboto()) {
            throw new Error(
                'pdfmake Roboto fonts not loaded. Add after vfs_fonts.js:\n'
                + '  <script src="vendor/pdfmake/build/fonts/Roboto.js"></script>'
            );
        }
        return pdfMake;
    },

    logStatus() {
        const hasPdfMake = typeof pdfMake !== 'undefined';
        const ready = this.isReady();
        console.log('[PdfMakeInit]', {
            ready,
            pdfMake: hasPdfMake,
            fonts: hasPdfMake && pdfMake.fonts ? Object.keys(pdfMake.fonts) : [],
            addVirtualFileSystem: hasPdfMake ? typeof pdfMake.addVirtualFileSystem : 'missing',
            addFontContainer: hasPdfMake ? typeof pdfMake.addFontContainer : 'missing'
        });
        return ready;
    }
};

window.PdfMakeInit = PdfMakeInit;
