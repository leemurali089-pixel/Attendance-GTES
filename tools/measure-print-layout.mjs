/**
 * Puppeteer: print media computed layout + print-to-PDF page count.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const chromePaths = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const p of chromePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function countPdfPages(buf) {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
}

async function main() {
  const puppeteer = await import('puppeteer-core');
  const exe = findChrome();
  if (!exe) throw new Error('Chrome not found');

  const browser = await puppeteer.default.launch({
    executablePath: exe,
    headless: true,
    args: ['--allow-file-access-from-files'],
  });

  const reproName = process.argv[2] || 'print-runtime-repro.html';
  const repro = path.join(__dirname, reproName);
  const url = 'file:///' + repro.replace(/\\/g, '/');

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });

  await page.emulateMediaType('print');

  const metrics = await page.evaluate(() => {
    const blocks = [];
    document.querySelectorAll('.modal').forEach((modal) => {
      const s = getComputedStyle(modal);
      const r = modal.getBoundingClientRect();
      blocks.push({
        id: modal.id,
        display: s.display,
        position: s.position,
        height: Math.round(r.height),
        top: Math.round(r.top),
        minHeight: s.minHeight,
        pageBreakAfter: s.pageBreakAfter,
        breakAfter: s.breakAfter,
      });
    });
    const tall = [];
    document.querySelectorAll('*').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.height < 400) return;
      tall.push({
        tag: el.tagName,
        id: el.id || '',
        cls: String(el.className || '').slice(0, 60),
        h: Math.round(r.height),
        top: Math.round(r.top),
        minH: s.minHeight,
        pba: s.pageBreakAfter,
        pbi: s.pageBreakInside,
      });
    });
    tall.sort((a, b) => a.top - b.top);
    return {
      modalCount: document.querySelectorAll('.modal').length,
      innerHtmlLen: document.body.innerHTML.length,
      nodeCount: document.querySelectorAll('*').length,
      modals: blocks,
      tallVisible: tall.slice(0, 30),
      docScrollH: document.documentElement.scrollHeight,
    };
  });

  const pdfPath = path.join(__dirname, '_puppeteer-print-out.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
  });

  const buf = fs.readFileSync(pdfPath);
  const pages = countPdfPages(buf);

  console.log(JSON.stringify({ pages, pdfBytes: buf.length, ...metrics }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
