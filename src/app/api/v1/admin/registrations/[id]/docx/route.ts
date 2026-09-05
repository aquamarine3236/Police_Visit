import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  UnderlineType,
} from 'docx';

import { requireAdminAuth, errorResponse } from '@/lib/api-helpers';
import {
  VISIT_FORM_TYPES,
  isVisitFormType,
  type VisitFormType,
} from '@/lib/constants';
import { formatDateVN, formatDateTimeVN, toTitleCaseName } from '@/lib/format';
import { renderVisitFormFromTemplate } from '@/lib/services/visit-forms';

// ─── Status labels ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Đã xác nhận',
  completed: 'Đã hoàn thành',
  no_show: 'Vắng mặt',
};

// ─── Registration data shared by every form builder ─────────────────────────

interface RegistrationVisitor {
  full_name: string;
  date_of_birth: string | null;
  relationship: string;
  display_order: number;
}

interface RegistrationData {
  id: string;
  visit_date: string;
  time_slot_start: string;
  time_slot_end: string;
  status: string;
  notes: string | null;
  created_at: string;
  inmate: {
    prison_number: string;
    date_of_birth: string | null;
    classification: string;
  };
  visitors: RegistrationVisitor[];
}

// Default document font. Times New Roman is available on virtually every
// Windows/Office install, so declaring it by name (docx does not embed fonts)
// renders the .docx in Times New Roman without shipping any font files.
const DEFAULT_FONT = 'Times New Roman';

// ─── Vietnamese administrative document header (công văn format) ────────────

const NONE_BORDER = { style: BorderStyle.NONE, size: 0 };
const NO_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
} as const;

/**
 * Builds the two-column header used in Vietnamese government documents.
 *
 * Left column:   TRẠI TẠM GIAM TRIỆU PHONG  (bold)
 *                PHÂN TRẠI TẠM GIAM SỐ 1     (bold, underlined)
 *
 * Right column:  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM  (bold)
 *                Độc lập – Tự do – Hạnh phúc              (bold, italic, underlined)
 */
function buildAdministrativeHeader(): Table {
  return new Table({
    rows: [
      new TableRow({
        children: [
          // ── Left column ──
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'TRẠI TẠM GIAM SỐ 1',
                    bold: true,
                    size: 24,
                    font: DEFAULT_FONT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'PHÂN TRẠI TẠM GIAM TRIỆU PHONG',
                    bold: true,
                    size: 22,
                    font: DEFAULT_FONT,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
          }),

          // ── Right column ──
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
                    bold: true,
                    size: 24,
                    font: DEFAULT_FONT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Độc lập – Tự do – Hạnh phúc',
                    bold: true,
                    italics: true,
                    size: 24,
                    font: DEFAULT_FONT,
                    underline: { type: UnderlineType.SINGLE },
                  }),
                ],
              }),
            ],
            width: { size: 50, type: WidthType.PERCENTAGE },
            borders: NO_BORDERS,
          }),
        ],
      }),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
  });
}

// ─── Helper: create a table cell with consistent styling ────────────────────

function createCell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, size: 20 })],
      }),
    ],
    width: { size: 0, type: WidthType.AUTO },
  });
}

// ─── Shared building blocks ─────────────────────────────────────────────────

const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
} as const;

/** Title paragraph rendered under the administrative header. */
function buildTitle(title: string): Paragraph {
  return new Paragraph({
    text: title,
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
  });
}

/** "Ngày tạo: …" line shown top-right on every form. */
function buildCreatedAtLine(createdAt: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: `Ngày tạo: ${formatDateTimeVN(createdAt)}`,
        size: 18,
        color: '666666',
      }),
    ],
  });
}

/** Inmate information block, reused by every form. */
function buildInmateSection(inmate: RegistrationData['inmate']): Paragraph[] {
  return [
    new Paragraph({
      text: 'THÔNG TIN NGƯỜI BỊ QUẢN LÝ GIAM GIỮ',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Số giam: ', bold: true, size: 22 }),
        new TextRun({ text: inmate.prison_number, size: 22 }),
        new TextRun({ text: '    Phân loại: ', bold: true, size: 22 }),
        new TextRun({ text: inmate.classification, size: 22 }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Ngày sinh: ', bold: true, size: 22 }),
        new TextRun({ text: formatDateVN(inmate.date_of_birth), size: 22 }),
      ],
      spacing: { after: 200 },
    }),
  ];
}

/** Visit-schedule block (ngày thăm / thời gian / trạng thái). */
function buildVisitScheduleSection(reg: RegistrationData): Paragraph[] {
  return [
    new Paragraph({
      text: 'THÔNG TIN LỊCH THĂM',
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Ngày thăm: ', bold: true, size: 22 }),
        new TextRun({ text: formatDateVN(reg.visit_date), size: 22 }),
        new TextRun({ text: '    Thời gian: ', bold: true, size: 22 }),
        new TextRun({
          text: `${reg.time_slot_start} - ${reg.time_slot_end}`,
          size: 22,
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Trạng thái: ', bold: true, size: 22 }),
        new TextRun({
          text: STATUS_LABELS[reg.status] || reg.status,
          size: 22,
        }),
      ],
      spacing: { after: 200 },
    }),
  ];
}

/** Visitors table with a bold section heading. */
function buildVisitorsSection(
  visitors: RegistrationVisitor[],
  heading = 'DANH SÁCH NGƯỜI THĂM',
): (Paragraph | Table)[] {
  const rows = [
    new TableRow({
      children: [
        createCell('STT', true),
        createCell('Họ và tên', true),
        createCell('Ngày sinh', true),
        createCell('Quan hệ', true),
      ],
      tableHeader: true,
    }),
    ...visitors.map(
      (v, idx) =>
        new TableRow({
          children: [
            createCell((idx + 1).toString()),
            createCell(toTitleCaseName(v.full_name)),
            createCell(formatDateVN(v.date_of_birth)),
            createCell(v.relationship),
          ],
        }),
    ),
  ];

  return [
    new Paragraph({
      text: heading,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 100 },
    }),
    new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: CELL_BORDER,
    }),
  ];
}

/** Optional notes block appended to the end of a form. */
function buildNotesSection(notes: string | null): Paragraph[] {
  if (!notes) return [];
  return [
    new Paragraph({
      text: 'GHI CHÚ',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }),
    new Paragraph({ text: notes, spacing: { after: 100 } }),
  ];
}

// ─── Per-form document builders ─────────────────────────────────────────────
// Each builder returns the ordered array of top-level children for its DOCX.
// They compose the shared blocks above so layout stays consistent and DRY.

/** TG — Phiếu đăng ký thăm gặp (unchanged from the original export). */
function buildAppointmentForm(reg: RegistrationData): (Paragraph | Table)[] {
  return [
    buildAdministrativeHeader(),
    new Paragraph({ spacing: { after: 300 } }),
    buildTitle(VISIT_FORM_TYPES.appointment.title),
    buildCreatedAtLine(reg.created_at),
    ...buildInmateSection(reg.inmate),
    ...buildVisitScheduleSection(reg),
    ...buildVisitorsSection(reg.visitors),
    ...buildNotesSection(reg.notes),
  ];
}

// Note: TG9 (gift), TG10 (report) and TG12 (decision) are NOT built here — they
// are rendered from their official Word templates in `temp/` via docxtemplater
// (see `renderVisitFormFromTemplate`). Only the appointment slip, which has no
// official template, is generated programmatically above.

// ─── GET handler ────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminAuth();
  if ('error' in auth) return auth.error;

  // Service-role client for reads (see listing route): avoids dependency on the
  // JWT `prison_id` claim while still scoping the query to `prisonId`.
  const { db: supabase, prisonId } = auth;
  const { id } = await params;

  // Fetch registration with inmate and visitors
  const { data: registration, error } = await supabase
    .from('visit_registrations')
    .select(
      `
      id,
      visit_date,
      time_slot_start,
      time_slot_end,
      status,
      notes,
      created_at,
      inmate:inmates!inner(prison_number, date_of_birth, classification),
      visitors:registration_visitors(full_name, date_of_birth, relationship, display_order)
      `,
    )
    .eq('id', id)
    .eq('prison_id', prisonId)
    .maybeSingle();

  if (error) {
    return errorResponse(500, 'SERVER_ERROR', error.message);
  }

  if (!registration) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy đăng ký.');
  }

  const inmateData = Array.isArray(registration.inmate)
    ? registration.inmate[0]
    : registration.inmate;

  if (!inmateData) {
    return errorResponse(404, 'NOT_FOUND', 'Không tìm thấy thông tin người bị giam.');
  }

  const inmate = inmateData as unknown as RegistrationData['inmate'];
  const visitors = (
    registration.visitors as RegistrationVisitor[]
  ).sort((a, b) => a.display_order - b.display_order);

  // Resolve the requested form type (defaults to the appointment slip for
  // backward compatibility with old links that omit `?type=`).
  const typeParam = request.nextUrl.searchParams.get('type') ?? 'appointment';
  const formType: VisitFormType = isVisitFormType(typeParam)
    ? typeParam
    : 'appointment';

  const regData: RegistrationData = {
    id: registration.id,
    visit_date: registration.visit_date,
    time_slot_start: registration.time_slot_start,
    time_slot_end: registration.time_slot_end,
    status: registration.status,
    notes: registration.notes,
    created_at: registration.created_at,
    inmate,
    visitors,
  };

  // Two generation strategies:
  //   • Template-backed forms (TG9/TG10/TG12) fill placeholders in the official
  //     Word templates under `temp/` so the printed layout matches exactly.
  //   • The appointment slip is still built programmatically with the `docx`
  //     library (no official template exists for it).
  let buffer: Buffer;
  if (VISIT_FORM_TYPES[formType].templateFile) {
    buffer = renderVisitFormFromTemplate(formType, regData);
  } else {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: DEFAULT_FONT },
          },
        },
      },
      sections: [
        {
          children: buildAppointmentForm(regData),
        },
      ],
    });
    buffer = await Packer.toBuffer(doc);
  }

  const filename = `${VISIT_FORM_TYPES[formType].filenamePrefix}-${id}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
