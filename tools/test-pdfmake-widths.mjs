/**
 * Quick pdfmake table-width probe — run: node tools/test-pdfmake-widths.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const fontDir = path.join(root, 'node_modules/pdfmake/build/fonts/Roboto');
pdfmake.setFonts({
    Roboto: {
        normal: path.join(fontDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontDir, 'Roboto-MediumItalic.ttf')
    }
});
pdfmake.setLocalAccessPolicy(() => true);

const C = { sl: 10, hsn: 70, qty: 40, unit: 50, rate: 80, tax: 50, amt: 90 };
const marginPt = 8 * 2.834645669291;

function buildDef(mode, orientation) {
    const portraitW = 595.28;
    const landscapeW = 841.89;
    const pageW = orientation === 'landscape' ? landscapeW : portraitW;
    const contentW = pageW - 2 * marginPt;
    const fixed = C.sl + C.hsn + C.qty + C.unit + C.rate + C.tax + C.amt;
    const descW = Math.max(80, contentW - fixed);

    const widthsStar = [C.sl, '*', C.hsn, C.qty, C.unit, C.rate, C.tax, C.amt];
    const widthsNum = [C.sl, descW, C.hsn, C.qty, C.unit, C.rate, C.tax, C.amt];
    const widthsPct = ['3%', '*', '10%', '6%', '7%', '11%', '7%', '12%'];

    const widths = mode === 'star' ? widthsStar : mode === 'pct' ? widthsPct : widthsNum;

    return {
        pageSize: 'A4',
        pageOrientation: orientation,
        pageMargins: [marginPt, marginPt, marginPt, marginPt],
        defaultStyle: { font: 'Roboto', fontSize: 9 },
        content: [
            { text: `Test ${mode} / ${orientation}`, fontSize: 10, margin: [0, 0, 0, 8] },
            {
                table: {
                    headerRows: 1,
                    widths,
                    body: [
                        ['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Tax %', 'Amount'].map((h) => ({
                            text: h, fillColor: '#4a5568', color: '#fff', fontSize: 7
                        })),
                        ...Array.from({ length: 9 }, (_, i) => [
                            { text: String(i + 1), fontSize: 6 },
                            { text: 'MANIFOLD SYSTYEM WITH 2X2 CYLINDER BANK' },
                            { text: '84818090', alignment: 'right', noWrap: true },
                            { text: '1', alignment: 'right', noWrap: true },
                            { text: 'nos', alignment: 'right', noWrap: true },
                            { text: '125000.00', alignment: 'right', noWrap: true },
                            { text: '18%', alignment: 'right', noWrap: true },
                            { text: '125000.00', alignment: 'right', noWrap: true }
                        ])
                    ]
                },
                layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5
                }
            }
        ]
    };
}

const outDir = path.join(root, 'tools');
const modes = ['star', 'num', 'pct'];
const orients = ['portrait', 'landscape'];

for (const mode of modes) {
    for (const orient of orients) {
        const def = buildDef(mode, orient);
        const outPath = path.join(outDir, `_test-widths-${mode}-${orient}.pdf`);
        const bytes = await pdfmake.createPdf(def).getBuffer();
        fs.writeFileSync(outPath, bytes);
        const text = bytes.toString('latin1');
        const media = text.match(/\/MediaBox\s*\[([^\]]+)\]/);
        console.log(outPath, 'MediaBox:', media?.[1]?.trim(), 'bytes:', bytes.length);
    }
}
