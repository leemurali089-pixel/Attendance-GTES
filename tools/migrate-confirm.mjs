import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const jsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js');
const skip = new Set(['app.js']);

function fixLine(line) {
  if (!line.includes('confirm(') || line.includes('confirmAction(')) {
    if (line.includes('!App.confirmAction(')) {
      let l = line.replace(/!App\.confirmAction\(/g, '!(await App.confirmAction(');
      l = fixClosingParens(l);
      return l;
    }
    return line;
  }

  let l = line;
  l = l.replace(/\bif\s*\(\s*!confirm\s*\(/g, 'if (!(await App.confirmAction(');
  l = l.replace(/\bif\s*\(\s*confirm\s*\(/g, 'if (await App.confirmAction(');
  l = l.replace(/\bconst\s+ok\s*=\s*confirm\s*\(/g, 'const ok = await App.confirmAction(');
  l = l.replace(/\bconst\s+choice\s*=\s*confirm\s*\(/g, 'const choice = await App.confirmAction(');
  l = l.replace(/\bconst\s+proceed\s*=\s*confirm\s*\(/g, 'const proceed = await App.confirmAction(');
  l = l.replace(/!confirm\s*\(/g, '!(await App.confirmAction(');
  return fixClosingParens(l);
}

function fixClosingParens(line) {
  if (!line.includes('await App.confirmAction(')) return line;
  let l = line;
  if (l.includes('if (!(await App.confirmAction(') || l.includes('&& !(await App.confirmAction(')) {
    l = l.replace(/\)\)\s*(return false)/, '))) return false');
    l = l.replace(/\)\)\s*(return null)/, '))) return null');
    l = l.replace(/\)\)\s*(return\b)/, '))) $1');
    l = l.replace(/\)\)\s*\{\s*$/, '))) {');
  }
  return l;
}

function migrateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const out = lines.map(fixLine);

  // Multi-line: if (!(await App.confirmAction( ... )) {  -> )))
  for (let i = 0; i < out.length; i++) {
    if (out[i].includes('if (!(await App.confirmAction(') && !out[i].includes(')))')) {
      for (let j = i + 1; j < Math.min(i + 12, out.length); j++) {
        if (/^\s*\)\)\s*\{/.test(out[j])) {
          out[j] = out[j].replace(/^\s*\)\)\s*\{/, (m) => m.replace(')) {', '))) {'));
          break;
        }
        if (out[j].includes('await App.confirmAction(') && out[j].includes('(')) continue;
        if (out[j].trim() && !out[j].includes('await App.confirmAction')) break;
      }
    }
    if (/^\s*!\(await App\.confirmAction\(/.test(out[i])) {
      for (let j = i + 1; j < Math.min(i + 12, out.length); j++) {
        if (/^\s*\)\)\s*\{/.test(out[j])) {
          out[j] = out[j].replace(/\)\)\s*\{/, '))) {');
          break;
        }
      }
    }
  }

  const next = out.join('\n');
  if (next !== raw) {
    fs.writeFileSync(filePath, next);
    return true;
  }
  return false;
}

for (const f of fs.readdirSync(jsDir)) {
  if (!f.endsWith('.js') || skip.has(f)) continue;
  if (migrateFile(path.join(jsDir, f))) console.log('migrated', f);
}
