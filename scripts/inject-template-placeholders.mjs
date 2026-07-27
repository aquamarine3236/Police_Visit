// One-off tooling: injects docxtemplater placeholders ({...}) into the official
// TG9 / TG10 / TG12 Word templates in `temp/`, WITHOUT changing their layout.
//
// Word splits both labels and the dotted fill-in blanks across many <w:r> runs,
// so a naive text search fails. Instead we work paragraph-by-paragraph:
//   1. Concatenate the visible text of every <w:t> in the paragraph.
//   2. If that text contains a target label, compute the new text by replacing
//      the dotted blank right after the label with the placeholder token.
//   3. Rewrite the paragraph so a single run carries the new text, keeping the
//      FIRST run's formatting (<w:rPr>) and the paragraph props (<w:pPr>).
//
// Because whole-paragraph text is matched, fragmented labels/dots are handled
// correctly. Idempotent: once a blank becomes `{token}` it won't match again.
//
// Run:  node scripts/inject-template-placeholders.mjs
// NOTE: edits the .docx in-place; originals are backed up in temp/_originals.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import PizZip from 'pizzip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.join(__dirname, '..', 'temp');

const TG9 = 'TG9- Phiếu gửi quà - BGT.docx';
const TG10 = 'TG10- báo cáo đề xuất thăm gặp.docx';
const TG12 = 'TG12 - Quyết định giải quyết cho người bị TG,TG gặp, tiếp xúc.docx';

const DOTS = /[.\u2026]{2,}/; // a run of ≥2 dots (…) marking a fill-in blank

function xmlDecode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
function xmlEncode(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Replace, for each {label, token}, the first dotted blank that follows the
 * label in `text` with `{token}`. Returns new text or null when unchanged.
 */
function computeNewText(text, replacements) {
  let changed = false;
  let result = text;
  for (const { label, token } of replacements) {
    const idx = result.indexOf(label);
    if (idx === -1) continue;
    const after = idx + label.length;
    const rest = result.slice(after);
    const m = rest.match(DOTS);
    if (!m) continue;
    const dotStart = after + m.index;
    const dotEnd = dotStart + m[0].length;
    result = `${result.slice(0, dotStart)}{${token}}${result.slice(dotEnd)}`;
    changed = true;
  }
  return changed ? result : null;
}

function patchXml(xml, replacements) {
  let matched = 0;
  const out = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const texts = [...para.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((mm) =>
      xmlDecode(mm[1]),
    );
    if (texts.length === 0) return para;
    const fullText = texts.join('');

    const newText = computeNewText(fullText, replacements);
    if (newText === null) return para;
    matched += 1;

    const firstRun = para.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/);
    const rPrMatch = firstRun ? firstRun[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) : null;
    const rPr = rPrMatch ? rPrMatch[0] : '';

    const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : '';

    const openTag = para.match(/^<w:p\b[^>]*>/)[0];
    const mergedRun = `<w:r>${rPr}<w:t xml:space="preserve">${xmlEncode(
      newText,
    )}</w:t></w:r>`;

    return `${openTag}${pPr}${mergedRun}</w:p>`;
  });

  return { xml: out, matched };
}

function patchDocx(filename, replacements) {
  const filePath = path.join(TEMP_DIR, filename);
  const zip = new PizZip(fs.readFileSync(filePath));
  const docPath = 'word/document.xml';
  const original = zip.file(docPath).asText();

  const { xml, matched } = patchXml(original, replacements);
  zip.file(docPath, xml);
  fs.writeFileSync(
    filePath,
    zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  console.log(`  ✓ ${filename} — ${matched} paragraph(s) patched`);
}

console.log('Injecting placeholders into templates...');

console.log(TG9);
patchDocx(TG9, [
  { label: 'Họ và tên người gửi:', token: 'nguoi_gui' },
  { label: 'Quan hệ với', token: 'quan_he' },
  { label: 'Họ và tên người nhận:', token: 'ho_ten' },
  { label: 'Số giam:', token: 'so_giam' },
]);

console.log(TG10);
patchDocx(TG10, [
  { label: 'Họ và tên:', token: 'ho_ten' },
  { label: 'Số giam:', token: 'so_giam' },
]);

console.log(TG12);
patchDocx(TG12, [
  { label: 'Họ và tên:', token: 'ho_ten' },
  { label: 'Số giam:', token: 'so_giam' },
]);

console.log('Done.');
