import { readFileSync } from 'node:fs';
import path from 'node:path';

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

import { VISIT_FORM_TYPES, type VisitFormType } from '@/lib/constants';
import { formatDateVN, toTitleCaseName } from '@/lib/format';

// ─── Registration data consumed by the form renderers ──────────────────────
// Mirrors the shape fetched in the DOCX route so both stay in sync.

export interface VisitFormVisitor {
  full_name: string;
  date_of_birth: string | null;
  citizen_id: string;
  relationship: string;
  display_order: number;
}

export interface VisitFormData {
  visit_date: string;
  time_slot_start: string;
  time_slot_end: string;
  inmate: {
    prison_number: string;
    full_name: string;
    date_of_birth: string | null;
    classification: string;
  };
  visitors: VisitFormVisitor[];
}

// Templates live in `temp/` at the project root. Resolving relative to
// `process.cwd()` works both under `next dev` and the built server (same
// approach the DOCX/PDF routes use for bundled font/template assets).
const TEMPLATE_DIR = path.join(process.cwd(), 'temp');

/**
 * Build the flat placeholder map merged into a template. Only fields the system
 * actually stores are provided; every other blank in the official form is left
 * untouched (its dotted fill-in survives) so the printed layout matches exactly.
 *
 * The primary visitor (lowest `display_order`) is treated as the "người gửi"
 * (sender) on TG9; the inmate is always the "người nhận" / subject person.
 */
function buildPlaceholderData(reg: VisitFormData): Record<string, string> {
  const primaryVisitor = [...reg.visitors].sort(
    (a, b) => a.display_order - b.display_order,
  )[0];

  return {
    // Inmate (subject person on every form).
    ho_ten: toTitleCaseName(reg.inmate.full_name),
    so_giam: reg.inmate.prison_number,
    // Primary visitor (sender on the gift slip).
    nguoi_gui: primaryVisitor ? toTitleCaseName(primaryVisitor.full_name) : '',
    quan_he: primaryVisitor ? primaryVisitor.relationship : '',
    // Visit schedule (available for reuse in templates that expose the tokens).
    ngay_tham: formatDateVN(reg.visit_date),
    gio_bat_dau: reg.time_slot_start,
    gio_ket_thuc: reg.time_slot_end,
  };
}

/**
 * Render an official Word form (TG9/TG10/TG12) by filling the docxtemplater
 * placeholders in its `temp/` template with registration data, preserving the
 * original layout. Throws if the form type has no associated template.
 */
export function renderVisitFormFromTemplate(
  formType: VisitFormType,
  reg: VisitFormData,
): Buffer {
  const { templateFile } = VISIT_FORM_TYPES[formType];
  if (!templateFile) {
    throw new Error(
      `Form type "${formType}" has no template file; it must be generated programmatically.`,
    );
  }

  const templatePath = path.join(TEMPLATE_DIR, templateFile);
  const content = readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Leave unknown/undefined placeholders blank rather than throwing, so a
    // template can be extended with new tokens without breaking older data.
    nullGetter: () => '',
  });

  doc.render(buildPlaceholderData(reg));

  return doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
}
