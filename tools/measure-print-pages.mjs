/**
 * Headless Chrome: emulate print media + print-to-PDF, count pages.
 * Run: node tools/measure-print-pages.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repro = path.join(__dirname, 'print-runtime-repro.html');
const outPdf = path.join(__dirname, '_print-measure-out.pdf');

const chromePaths = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

function findChrome() {
  for (const p of chromePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function countPdfPages(buf) {
  const s = buf.toString('latin1');
  const re = /\/Type\s*\/Page[^s]/g;
  const m = s.match(re);
  return m ? m.length : null;
}

async function run() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('No Chrome/Edge found. Set CHROME_PATH.');
    process.exit(1);
  }
  const url = 'file:///' + repro.replace(/\\/g, '/');
  if (fs.existsSync(outPdf)) fs.unlinkSync(outPdf);

  await new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--run-all-compositor-stages-before-draw',
      '--print-to-pdf=' + outPdf,
      url,
    ];
    const proc = spawn(chrome, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error('chrome exit ' + code))));
  });

  const buf = fs.readFileSync(outPdf);
  const pages = countPdfPages(buf);
  console.log('PDF bytes:', buf.length);
  console.log('Page count (/Type /Page):', pages);
  console.log('Output:', outPdf);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
