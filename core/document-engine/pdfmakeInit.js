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
                'pdfmake not loaded. Ensure index.html includes node_modules/pdfmake/build/pdfmake.min.js'
            );
        }
        if (!this._hasRoboto()) {
            throw new Error(
                'pdfmake Roboto fonts not loaded. Add after vfs_fonts.js:\n'
                + '  <script src="node_modules/pdfmake/build/fonts/Roboto.js"></script>'
            );
        }
        return pdfMake;
    },

    logStatus() {
        const ready = this.isReady();
        console.log('[PdfMakeInit]', {
            ready,
            pdfMake: typeof pdfMake !== 'undefined',
            fonts: typeof pdfMake !== 'undefined' && pdfMake.fonts
                ? Object.keys(pdfMake.fonts)
                : [],
            addVirtualFileSystem: typeof pdfMake?.addVirtualFileSystem,
            addFontContainer: typeof pdfMake?.addFontContainer
        });
        return ready;
    }
};

window.PdfMakeInit = PdfMakeInit;
